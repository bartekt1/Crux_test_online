# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CruxTracker is a harness-worn climbing session tracker (open-source). It automatically records attempts without the climber touching their phone. Data is stored in external SPI Flash and synchronized to a PWA via Web Bluetooth API (NUS protocol).

## Repository Structure

- `firmware/` — PlatformIO C++ project for WEMOS LOLIN C3 Mini (ESP32-C3)
- `pwa/` — React 19 + TypeScript PWA (Vite, Tailwind CSS v4, Zustand, Dexie, Recharts)

### Hardware

- **BMP390** — barometric pressure sensor (I²C); provides `pressure` readings used by the Kalman filter and state machine
- **LSM6DSOX** — 6-DoF IMU (I²C); accelerometer readings produce `sysGVariance` and `sysTotalG`
- **U8g2 OLED** — small display showing current state, session ID, and sensor readings
- **W25Q128** — 16 MB SPI Flash for raw record storage (no filesystem)

## Firmware Build Commands

All commands require the PlatformIO CLI (`pio`) or PlatformIO IDE extension in VS Code.

```bash
# Build firmware
pio run -e lolin_c3_mini

# Upload to device (USB-C)
pio run -e lolin_c3_mini --target upload

# Open serial monitor (115200 baud)
pio device monitor --baud 115200

# Build + upload + monitor in one step
pio run -e lolin_c3_mini --target upload && pio device monitor --baud 115200

# Clean build
pio run -e lolin_c3_mini --target clean
```

## PWA Commands

Run from the `pwa/` directory:

```bash
npm install        # install dependencies
npm run dev        # start Vite dev server
npm run build      # tsc + Vite production build
npm run lint       # ESLint
npm run preview    # serve the production build locally
```

Web Bluetooth requires Chrome or Edge on Android/desktop — it does not work in Firefox or Safari. Test with a real device or use the seed data in `pwa/src/lib/seedData.ts`.

## Architecture

### Main Loop (firmware/src/main.cpp)

The main loop runs four interleaved tasks at different rates:
1. **BLE command processing** — every iteration (flag-based, non-blocking)
2. **Sensor sampling** — 25 Hz (every 40 ms)
3. **State machine + flash logging** — 10 Hz (every 100 ms)
4. **OLED + BLE telemetry** — 4 Hz (every 250 ms)

A physical button on GPIO 4 (active LOW) toggles session start/stop on short press and enters deep sleep on a 3-second hold. The device wakes from deep sleep on GPIO 4 going LOW.

### State Machine

```
IDLE → RESTING → CLIMBING → DESCENDING → FREEFALL
```

Transitions require `cfg.confirm` consecutive 100 ms ticks confirming the new state (debounce). Transitions into `CLIMBING` increment `sysAttemptCount`. `FREEFALL` requires 5 consecutive ticks of `sysTotalG < cfg.gFall`.

State is driven by two signals from `firmware/src/Sensors.cpp`:
- `sysKalmanRate` — Kalman-filtered pressure velocity (Pa/s)
- `sysGVariance` — rolling variance of |g| over 10 samples

### IMU-Gated Kalman Filter (firmware/src/KalmanFilter.cpp)

Two-state Kalman filter (position = pressure, velocity = dP/dt). When `sysGVariance < cfg.gAct` (body is still), the measurement noise `R` is inflated to 500 and velocity is decayed by 0.85 per tick. This prevents HVAC or door-opening events from registering as climbs.

### Flash Storage Layout (firmware/src/FlashStorage.cpp)

Raw SPI Flash (W25Q128, 16 MB), no filesystem:
- `0x0000–0x0FFF` — reserved (system sectors, not used by data)
- `0x1000–0x1000000` — packed `LogRecord` structs written sequentially
- Write pointer is recovered at boot via binary search for the first `0xFF` byte
- Wrap-around: if the write pointer reaches `0x1000000`, it resets to `0x1000`
- Sector erase (4 KB) is done automatically just before writing a new sector

### LogRecord Format (firmware/include/CruxTypes.h)

18 bytes, `__attribute__((packed, aligned(4)))`. `RECORD_VERSION` is currently 3 (`FW_VERSION` is 7). This is a binary contract between firmware and PWA — do not change without bumping `RECORD_VERSION` and updating both sides.

| Offset | Type     | Field         | Notes                          |
|--------|----------|---------------|--------------------------------|
| 0      | uint32_t | timestamp_s   | Milliseconds from boot / 1000  |
| 4      | uint32_t | session_id    | Persistent counter from NVS    |
| 8      | uint16_t | attempt_id    | Resets to 0 each session       |
| 10     | uint8_t  | state         | 0=IDLE 1=REST 2=CLIMB 3=DESC 4=FALL |
| 11     | uint8_t  | padding       | Always 0                       |
| 12     | int16_t  | dpRateX100    | `sysKalmanRate * 100`          |
| 14     | uint16_t | gvX1000       | `sysGVariance * 1000`          |
| 16     | int16_t  | pressRelX10   | `(pressure - basePressure) * 10` |

Records are written every **500 ms** during active states (CLIMBING/DESCENDING/FREEFALL) and every **2000 ms** during RESTING/IDLE. A state change triggers an immediate record write.

### BLE Protocol (NUS — Nordic UART Service)

UUIDs are fixed (NimBLE NUS standard):
- Service: `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
- TX (notify, device→phone): `6E400003-B5A3-F393-E0A9-E50E24DCCA9E`
- RX (write, phone→device): `6E400002-B5A3-F393-E0A9-E50E24DCCA9E`

Commands from PWA → device (written to RX):

| Command | Response | Description |
|---------|----------|-------------|
| `STATUS` | `BAT:N/A;MEM:<free>;SENSORS:<OK\|ERROR>` | Device status |
| `TEST` | `SESSION_START:<id>` or `SESSION_END:<count>` | Toggle session |
| `GET_CFG` | `CFG:pClimb,pDesc,gAct,gStill,gFall,confirm` | Read config |
| `SET_CFG:pc,pd,ga,gs,gf,cs` | `CFG:SAVED` or `CFG:ERROR` | Write config to NVS |
| `TIME:<unix_ts>` | `TIME_OK` | Sync RTC |
| `INFO` | `INFO:SESSIONS_<n>LAST<id>` | Session info |
| `CALIBRATE` | `CALIBRATE_OK` or `CALIBRATE_ERROR` | Reset base pressure |
| `STREAM_ON` | `STREAM_OK` | Start live telemetry |
| `STREAM_OFF` | `STREAM_STOPPED` | Stop live telemetry |
| `DUMP_SESSION:<offset>,<count>` | `SESSION:<total>:<id>` header + records + `DUMP:END` or `DUMP:NEXT:<offset>` | Paginated current session dump (max 200 records/request; header only sent at offset 0) |
| `DUMP:<session_id>` | Records + `DUMP_END` | Historical session dump by ID |
| `ERASE` | `ERASE:START` / `ERASE:DONE` | Erase all flash data |
| `FORMAT` | `FORMAT:START` / `FORMAT_OK` | Erase flash + reset NVS session counter |
| `SLEEP` | — | Enter deep sleep |

Live telemetry format (pushed at 2 Hz when `STREAM_ON`): `<state_char> v:<gv*1000> dP:<rate>`

Dump record format (CSV): `<timestamp_s>,<attempt_id>,<state_char>,<dpRateX100>,<gvX1000>,<pressRelX10>`

State chars used in both live telemetry and dump records: `I`=IDLE, `R`=RESTING, `C`=CLIMBING, `D`=DESCENDING, `F`=FREEFALL.

**BLE device name filter**: `CruxTracker PRO` (used in `navigator.bluetooth.requestDevice` in `bleService.ts`).

**`DUMP_SESSION` vs `DUMP`**: `DUMP_SESSION:<offset>,<count>` dumps the currently-active (in-progress) session in pages; it is implemented in firmware but **not used by the PWA**. The PWA sync uses only `DUMP:<session_id>` for completed historical sessions.

### Tunable Config (NVS namespace `crux_cfg`)

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `pClimb`  | 5.0     | Min |dP| (Pa/s) to enter CLIMBING (upward) |
| `pDesc`   | 1.5     | Min dP (Pa/s) to enter DESCENDING |
| `gAct`    | 0.003   | G-variance threshold to consider body "active" |
| `gStill`  | 0.001   | G-variance threshold to consider body "still" → RESTING |
| `gFall`   | 0.3     | Total-G threshold below which FREEFALL is detected |
| `confirm` | 4       | State transition debounce (number of 100 ms ticks) |

### NVS Namespaces

- `crux_cfg` — tunable config (see above)
- `crux_nvs` / key `last_sess_id` — monotonically incrementing session ID (survives resets)

## PWA Architecture

### Layer Overview

```
Screens (React Router) → Zustand stores → Services → Dexie (IndexedDB) / BLE
```

### State Management (pwa/src/stores/)

- **`bleStore`** — wraps the singleton `ble` (BleService) class; handles connect/disconnect, sync, live stream, device config/status, erase/format. Wire-in: `ble.onConnectionChange` callback updates the store.
- **`sessionStore`** — loads and caches all sessions from IndexedDB; used by Sessions/SessionDetail screens.
- **`themeStore`** — persists light/dark preference to localStorage (Zustand default).

### Data Layer (pwa/src/lib/db.ts)

Dexie `CruxDb` (IndexedDB name: `cruxtracker`), version 2:
- `sessions` table — stores pre-computed `Session` macro stats (attempt count, climb/rest time, total meters, timestamps). Indexed on `deviceSessionId`, `syncedAt`, `startTimestamp`.
- `records` table — stores raw `DbRecord` rows (one per LogRecord from device). Indexed on `sessionId`, `state`, `attempt_id`.

Per-attempt stats (`Attempt` type) and chart data are computed on demand in `pwa/src/lib/sessionProcessor.ts`, not stored.

### Sync Flow (pwa/src/services/syncService.ts)

`smartSync()` runs automatically when BLE connects (`App.tsx`):
1. Sends `TIME:<unix_ts>` to sync device clock.
2. Sends `INFO` to get `lastSessionId`.
3. Compares against `deviceSessionId` values already in IndexedDB.
4. For each missing session ID, calls `DUMP:<id>` and streams records via `dumpHistoricalSession()`.
5. Calls `computeMacroStats()` and saves session + records to IndexedDB.
6. Empty dumps (session erased after FORMAT) are silently skipped.

### BLE Service (pwa/src/services/bleService.ts)

`BleService` is a plain class (singleton `ble`). It uses a publish/subscribe handler list (`dispatch`/`subscribe`/`once`) to multiplex BLE notifications to concurrent callers. All commands follow the pattern: send → await `once(predicate)` with a timeout.

### Routing

React Router v7. The app shows `WelcomeScreen` when `sessions.length === 0` (no data yet). Recharts-heavy screens are lazy-loaded to reduce the initial bundle.

| Route | Screen |
|-------|--------|
| `/sessions` | `SessionsScreen` (or `WelcomeScreen` if no data) |
| `/sessions/:id` | `SessionDetailScreen` |
| `/sessions/:id/attempts/:attemptId` | `AttemptDetailScreen` |
| `/live` | `LiveScreen` |
| `/device` | `DeviceScreen` |
| `/settings` | `SettingsScreen` |

### Units and Decoding

Raw integer fields from BLE/IndexedDB must be decoded before display. Helper functions live in `pwa/src/lib/bleParser.ts → decode.*`:
- `dpRateX100 / 100` → Pa/s
- `gvX1000 / 1000` → G-variance
- `pressRelX10 / 10` → Pa (relative pressure)
- Altitude: `-(pressRelX10 / 10) / 12` → meters (negative pressRel = higher altitude)
- Speed: `-(dpRateX100 / 100) * 5` → m/min

### Backup / Restore

`pwa/src/lib/backup.ts` — `exportBackup()` downloads a JSON file; `importBackup(file)` merges sessions not already in IndexedDB (deduplicates by `deviceSessionId`). Format version is `1`.

### UI Language

All user-visible strings in the PWA are in **Polish**.

## Key Constraints

- BLE changes must remain consistent between firmware and PWA
- `LogRecord` is a binary contract — any struct change requires bumping `RECORD_VERSION` in `CruxTypes.h` and updating the PWA parser
- Flash has no filesystem — all access is raw sector-level; never use file I/O abstractions
- The write pointer is found at boot by binary search; new records must always be written at `flashWriteAddr` (never random addresses)
- `bleSend()` includes a 5 ms `delay()` — avoid calling it in tight loops; the async DUMP logic caps at 5 sends per loop iteration for this reason
