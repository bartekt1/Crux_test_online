#include <Arduino.h>
#include <Preferences.h>
#include "CruxTypes.h"
#include "Config.h"
#include "Sensors.h"
#include "FlashStorage.h"
#include "Display.h"
#include "BLEManager.h"
#include <esp_sleep.h>
#include <sys/time.h>

#define BUTTON_PIN 4
#define LONG_PRESS_MS 3000

// Zmienne stanu urządzenia
State    sysCurrentState = IDLE;
int      sysAttemptCount = 0;
uint32_t sysSessionId    = 0;
bool     sysMeasuring    = false;
bool     sysBleDebug     = false;

// Ukrywamy zmienne widoczne tylko w tym pliku przed linkerem (Internal Linkage)
static bool isLiveStreaming = false;
static bool isDumpingHist = false;
static uint32_t dumpHistAddr = 0x1000UL;
static uint32_t dumpHistTargetId = 0;

static bool          buttonPressed    = false;
static unsigned long buttonPressStart = 0;
static bool          longPressHandled = false;

static unsigned long ostatnie_klikniecie = 0;
static const unsigned long czas_blokady = 300;

// Funkcja usypiania
void enterDeepSleep() {
    displaySleep();
    sensorsSleep();
    bleSleep();
    pinMode(BUTTON_PIN, INPUT_PULLUP);
    esp_deep_sleep_enable_gpio_wakeup((1ULL << BUTTON_PIN), ESP_GPIO_WAKEUP_GPIO_LOW);
    esp_deep_sleep_start();
}

// Bezpieczne rozpoczęcie sesji z trwałym ID w NVS
void startSession() {
    sysMeasuring = true;
    
    Preferences prefs;
    prefs.begin("crux_nvs", false);
    sysSessionId = prefs.getUInt("last_sess_id", 0) + 1;
    prefs.putUInt("last_sess_id", sysSessionId);
    prefs.end();

    sysAttemptCount = 0;
    sysPressureInitialized = false;
    sysSessionStartAddr = flashWriteAddr;

    char buf[40];
    snprintf(buf, 40, "SESSION_START:%u", sysSessionId);
    bleSend(buf);
}

// Bezpieczne zakończenie sesji
void stopSession() {
    sysMeasuring = false;
    char buf[40];
    snprintf(buf, 40, "SESSION_END:%u", flashSessionRecordCount());
    bleSend(buf);
}

// Wydzielona funkcja obsługi komend BLE
void handleBleCommands() {
    if (cmdSleep) { cmdSleep = false; enterDeepSleep(); }
    if (cmdDebug) { cmdDebug = false; sysBleDebug = !sysBleDebug; }

    if (cmdTest) {
        cmdTest = false;
        if (!sysMeasuring) startSession();
        else stopSession();
    }

    if (cmdErase) {
        cmdErase = false;
        bleSend("ERASE:START");
        flashChipErase();
        bleSend("ERASE:DONE");
    }

    if (cmdStatus) {
        cmdStatus = false;
        char buf[60];
        // Pamięć Flash: całkowity rozmiar to 16MB (0x1000000). flashWriteAddr trzyma aktualny wskaźnik zapisu.
        uint32_t freeSpace = 0x1000000UL - flashWriteAddr;
        const char* sensStatus = (sysPressureInitialized) ? "OK" : "ERROR";
        // Brak pinu bat. w ESP32-C3 w tym kodzie, zwracamy placeholder lub dołączysz funkcję w przyszłości
        snprintf(buf, sizeof(buf), "BAT:N/A;MEM:%u;SENSORS:%s", freeSpace, sensStatus);
        bleSend(buf);
    }

    if (cmdGetCfg) {
        cmdGetCfg = false;
        char buf[60];
        snprintf(buf, sizeof(buf), "CFG:%.2f,%.2f,%.4f,%.4f,%.2f,%d",
                 cfg.pClimb, cfg.pDesc, cfg.gAct, cfg.gStill, cfg.gFall, cfg.confirm);
        bleSend(buf);
    }

    if (cmdSetCfg) {
        cmdSetCfg = false;
        float pc, pd, ga, gs, gf; int cs;
        if (sscanf(newCfgPayload.c_str(), "SET_CFG:%f,%f,%f,%f,%f,%d", &pc, &pd, &ga, &gs, &gf, &cs) == 6) {
            cfg.pClimb = pc; cfg.pDesc = pd; cfg.gAct = ga;
            cfg.gStill = gs; cfg.gFall = gf; cfg.confirm = cs;
            saveConfig();
            bleSend("CFG:SAVED");
        } else {
            bleSend("CFG:ERROR");
        }
    }

    if (cmdTime) {
        cmdTime = false;
        long timestamp = 0;
        if (sscanf(timePayload.c_str(), "TIME:%ld", &timestamp) == 1) {
            struct timeval tv;
            tv.tv_sec = timestamp;
            tv.tv_usec = 0;
            settimeofday(&tv, NULL);
            bleSend("TIME_OK");
        }
    }

    if (cmdInfo) {
        cmdInfo = false;
        char buf[50];
        // W tej architekturze sysSessionId inkrementuje z każdą sesją
        snprintf(buf, sizeof(buf), "INFO:SESSIONS_%uLAST%u", sysSessionId, sysSessionId);
        bleSend(buf);
    }

    if (cmdFormat) {
        cmdFormat = false;
        bleSend("FORMAT:START");
        flashChipErase();
        
        // Resetujemy całkowicie numerację w NVS
        Preferences prefs;
        prefs.begin("crux_nvs", false);
        prefs.putUInt("last_sess_id", 0);
        prefs.end();
        sysSessionId = 0;
        sysAttemptCount = 0;
        
        bleSend("FORMAT_OK");
    }

    if (cmdCalibrate) {
        cmdCalibrate = false;
        if (sysPressureInitialized) {
            sysSessionBasePressure = filterKalman.getPressure();
            bleSend("CALIBRATE_OK");
        } else {
            bleSend("CALIBRATE_ERROR");
        }
    }

    if (cmdDumpHist) {
        cmdDumpHist = false;
        if (sscanf(dumpHistPayload.c_str(), "DUMP:%u", &dumpHistTargetId) == 1) {
            isDumpingHist = true;
            dumpHistAddr = 0x1000UL; // DATA_START dla FlashStorage (pomijamy pierwsze sektory systemowe)
        }
    }

    // ── ASYNCHRONICZNY DUMP HISTORYCZNY (Odczyt sesji w tle) ─────────
    if (isDumpingHist) {
        int sentInThisLoop = 0;
        char buf[60];
        // Ograniczenie wysyłania do 5 powtórzeń na jeden obrót pętli uchroni Bleutooth i maszynę stanów przed zablokowaniem
        while (sentInThisLoop < 5 && dumpHistAddr < flashWriteAddr) {
            LogRecord rec;
            if (flashReadRecord(dumpHistAddr, &rec)) {
                if (rec.state != 0xFF && rec.session_id == dumpHistTargetId) {
                    snprintf(buf, sizeof(buf), "%u,%u,%c,%d,%u,%d",
                             rec.timestamp_s, rec.attempt_id, stateChars[rec.state],
                             rec.dpRateX100, rec.gvX1000, rec.pressRelX10);
                    bleSend(buf);
                    sentInThisLoop++;
                }
            }
            dumpHistAddr += RECORD_SIZE;
        }

        if (dumpHistAddr >= flashWriteAddr) {
            isDumpingHist = false;
            bleSend("DUMP_END");
        }
    }

    if (cmdDumpSession) {
        cmdDumpSession = false;
        int offset = 0, reqCount = 200;
        sscanf(dumpSessionPayload.c_str(), "DUMP_SESSION:%d,%d", &offset, &reqCount);
        if (reqCount > 200) reqCount = 200;

        uint32_t totalRecs = flashSessionRecordCount();
        if (offset == 0) {
            char buf[40];
            snprintf(buf, 40, "SESSION:%u:%u", totalRecs, sysSessionId);
            bleSend(buf);
        }

        uint32_t available = (offset < (int)totalRecs) ? totalRecs - offset : 0;
        uint32_t sendCount = (available < (uint32_t)reqCount) ? available : (uint32_t)reqCount;

        char buf[60];
        for (uint32_t i = 0; i < sendCount; i++) {
            uint32_t addr = sysSessionStartAddr + (offset + i) * RECORD_SIZE;
            LogRecord rec;
            if(flashReadRecord(addr, &rec)) {
                if (rec.state == 0xFF || rec.state >= 5) continue;
                snprintf(buf, 60, "%u,%u,%c,%d,%u,%d",
                         rec.timestamp_s, rec.attempt_id, stateChars[rec.state],
                         rec.dpRateX100, rec.gvX1000, rec.pressRelX10);
                bleSend(buf);
            }
        }

        uint32_t nextOffset = offset + sendCount;
        if (nextOffset >= totalRecs) {
            bleSend("DUMP:END");
        } else {
            snprintf(buf, 50, "DUMP:NEXT:%u", nextOffset);
            bleSend(buf);
        }
    }

    if (cmdStreamOn) {
        cmdStreamOn = false;
        isLiveStreaming = true;
        bleSend("STREAM_OK");
    }

    if (cmdStreamOff) {
        cmdStreamOff = false;
        isLiveStreaming = false;
        bleSend("STREAM_STOPPED");
    }
}

// Wydzielona funkcja obsługi przycisku
void handleButton(uint32_t now) {
    bool pressed = (digitalRead(BUTTON_PIN) == LOW);
    
    // Obsługa zmiany stanu przycisku z debouncingiem
    if (pressed != buttonPressed && (now - ostatnie_klikniecie > czas_blokady)) {
        ostatnie_klikniecie = now;
        buttonPressed = pressed;
        
        if (buttonPressed) {
            buttonPressStart = now;      // Rejestrujemy moment wciśnięcia
            longPressHandled = false;
        } else if (!longPressHandled) {  // Puszczono przycisk przed upływem 3 sekund (krótkie kliknięcie)
            sysMeasuring = !sysMeasuring;
            if (sysMeasuring) { Serial.println("Rozpoczęto sesję"); startSession(); }
            else              { Serial.println("Zatrzymano sesję"); stopSession(); }
        }
    }
    
    // Obsługa długiego wciśnięcia (gdy przycisk jest wciśnięty bez przerwy przez > 3s)
    if (buttonPressed && !longPressHandled && (now - buttonPressStart >= LONG_PRESS_MS)) {
        longPressHandled = true;
        Serial.println("Zasypianie urządzenia (Deep Sleep)...");
        enterDeepSleep();
    }
}

void setup() {
    Serial.begin(115200);
    
    uint32_t t = millis();
    while (!Serial && (millis() - t < 3000)) { delay(10); }
    
    Serial.println("\n--- CruxTracker Starting ---");
    
    loadConfig();
    pinMode(BUTTON_PIN, INPUT_PULLUP);
    Serial.println("Config loaded");
    
    displayInit();
    Serial.println("Display initialized");

    bool sensorsOK = sensorsInit();
    Serial.printf("Sensors init: %s\n", sensorsOK ? "OK" : "FAIL");

    flashOK = flashInit();
    Serial.printf("Flash init: %s\n", flashOK ? "OK" : "FAIL");

    bleInit();
    Serial.println("BLE initialized. Setup complete!");
}

void loop() {
    uint32_t now = millis();

    // ── 1. ZARZĄDZANIE KOMENDAMI BLE ──────────────────────────────────
    handleBleCommands();
    
    // ── 2. ODCZYT SENSORÓW (25 Hz) ───────────────────────────────────
    static uint32_t lastSensorTick = 0;
    if (now - lastSensorTick >= 40) {
        lastSensorTick = now;
        sensorsUpdate(now);
    }

    // ── 3. LOGIKA MASZYNY STANÓW (10 Hz) ─────────────────────────────
    static uint32_t lastLogicTick = 0;
    if (now - lastLogicTick >= 100) {
        lastLogicTick = now;
        
        if (sysMeasuring && sysPressureInitialized) {
            State targetState = sysCurrentState;
            static State pendingState = IDLE;
            static int confirmCounter = 0;
            static uint8_t freefallCounter = 0;

            bool active  = sysGVariance > cfg.gAct;
            bool still   = sysGVariance < cfg.gStill;
            bool goingUp = sysKalmanRate < -cfg.pClimb;
            bool goingDn = sysKalmanRate >  cfg.pDesc;

            if (sysTotalG < cfg.gFall) {
                // Wydłużono debounce do 5 próbek
                if (++freefallCounter >= 5) {
                    freefallCounter = 0;
                    sysCurrentState = FREEFALL;
                    confirmCounter  = 0;
                }
            } else {
                freefallCounter = 0;
                if      (goingUp && active) targetState = CLIMBING;
                else if (goingDn && active) targetState = DESCENDING;
                else if (still)             targetState = RESTING;

                if (targetState != sysCurrentState) {
                    if (targetState == pendingState) {
                        if (++confirmCounter >= cfg.confirm) {
                            if (sysCurrentState != CLIMBING && targetState == CLIMBING) {
                                sysAttemptCount++;
                            }
                            sysCurrentState = targetState;
                            confirmCounter  = 0;
                        }
                    } else {
                        pendingState = targetState;
                        confirmCounter = 1;
                    }
                } else {
                    confirmCounter = 0;
                    pendingState = sysCurrentState;
                }
            }

            // Logowanie do flash
            static uint32_t lastFlashLog = 0;
            static State lastLoggedState = IDLE;
            bool stateChanged = (sysCurrentState != lastLoggedState);
            uint32_t logInterval = (sysCurrentState == RESTING || sysCurrentState == IDLE) ? 2000 : 500;

            if (flashOK && (stateChanged || now - lastFlashLog >= logInterval)) {
                lastFlashLog    = now;
                lastLoggedState = sysCurrentState;
                
                LogRecord rec;
                rec.timestamp_s  = (uint32_t)(now / 1000);
                rec.session_id   = sysSessionId;
                rec.attempt_id   = sysAttemptCount;
                rec.state        = (uint8_t)sysCurrentState;
                rec.padding      = 0;
                rec.dpRateX100   = (int16_t)(sysKalmanRate * 100);
                rec.gvX1000      = (uint16_t)constrain(sysGVariance * 1000, 0, 65535);
                rec.pressRelX10  = (int16_t)((filterKalman.getPressure() - sysSessionBasePressure) * 10);
                
                flashWriteRecord(&rec);
            }
        }
    }

    // ── 4. INTERFEJS: OLED + BLE (4 Hz) ──────────────────────────────
    static uint32_t lastUITick = 0;
    if (now - lastUITick >= 250) {
        lastUITick = now;
        displayUpdate(sysCurrentState, sysAttemptCount, sysKalmanRate, sysGVariance, sysMeasuring, deviceConnected);

        // Ciągłe logowanie telemetrii do Serial Monitora, aby wiedzieć, że płytka żyje
        Serial.printf("Stan: %c | dP: %6.2f | Wariancja G: %6.3f\n", stateChars[sysCurrentState], sysKalmanRate, sysGVariance);

        static int bleTick = 0;
        if (++bleTick >= 2) {
            bleTick = 0;
            if (deviceConnected && isLiveStreaming) {
                char bleBuf[30];
                char dpDisp[8];
                dtostrf(sysKalmanRate, 5, 1, dpDisp);
                snprintf(bleBuf, sizeof(bleBuf), "%c v:%d dP:%s", 
                         stateChars[sysCurrentState], (int)(sysGVariance * 1000), dpDisp);
                bleSend(bleBuf);
            }
        }
    }

    // ── 5. PRZYCISK ──────────────────────────────────────────────────
    handleButton(now);
}