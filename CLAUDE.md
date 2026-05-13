# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CruxTracker is a harness-worn climbing session tracker (open-source). It automatically records attempts without the climber touching their phone. Data is stored in external SPI Flash and synchronized to a PWA via Web Bluetooth API (NUS protocol).

## Repository Structure

- `firmware/` — PlatformIO C++ project for WEMOS LOLIN C3 Mini (ESP32-C3)
- `pwa/` — Progressive Web App (currently empty / under development)

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

## Architecture

### Main Loop (firmware/src/main.cpp)

The main loop runs four interleaved tasks at different rates:
1. **BLE command processing** — every iteration (flag-based, non-blocking)
2. **Sensor sampling** — 25 Hz (every 40 ms)
3. **State machine + flash logging** — 10 Hz (every 100 ms)
4. **OLED + BLE telemetry** — 4 Hz (every 250 ms)

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

16 bytes, `__attribute__((packed, aligned(4)))`. This is a binary contract between firmware and PWA — do not change without updating both sides.

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
| `DUMP_SESSION:<offset>,<count>` | Records + `DUMP:END` or `DUMP:NEXT:<offset>` | Paginated current session dump (max 200 records/request) |
| `DUMP:<session_id>` | Records + `DUMP_END` | Historical session dump by ID |
| `ERASE` | `ERASE:START` / `ERASE:DONE` | Erase all flash data |
| `FORMAT` | `FORMAT:START` / `FORMAT_OK` | Erase flash + reset NVS session counter |
| `SLEEP` | — | Enter deep sleep |

Live telemetry format (pushed at 2 Hz when `STREAM_ON`): `<state_char> v:<gv*1000> dP:<rate>`

Dump record format (CSV): `<timestamp_s>,<attempt_id>,<state_char>,<dpRateX100>,<gvX1000>,<pressRelX10>`

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

## Key Constraints

- BLE changes must remain consistent between firmware and PWA
- `LogRecord` is a binary contract — any struct change requires bumping `RECORD_VERSION` in `CruxTypes.h` and updating the PWA parser
- Flash has no filesystem — all access is raw sector-level; never use file I/O abstractions
- The write pointer is found at boot by binary search; new records must always be written at `flashWriteAddr` (never random addresses)
- `bleSend()` includes a 5 ms `delay()` — avoid calling it in tight loops; the async DUMP logic caps at 5 sends per loop iteration for this reason
