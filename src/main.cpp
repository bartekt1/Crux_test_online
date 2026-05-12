#include <Arduino.h>
#include <Preferences.h>
#include "CruxTypes.h"
#include "Config.h"
#include "Sensors.h"
#include "FlashStorage.h"
#include "Display.h"
#include "BLEManager.h"
#include <esp_sleep.h>

#define BUTTON_PIN 4
#define LONG_PRESS_MS 3000

// Zmienne stanu urządzenia
State    sysCurrentState = IDLE;
int      sysAttemptCount = 0;
uint32_t sysSessionId    = 0;
bool     sysMeasuring    = false;
bool     sysBleDebug     = false;

bool          buttonPressed    = false;
unsigned long buttonPressStart = 0;
bool          longPressHandled = false;

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

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    loadConfig();
    pinMode(BUTTON_PIN, INPUT_PULLUP);
    
    displayInit();
    sensorsInit();
    flashOK = flashInit();
    bleInit();
}

void loop() {
    uint32_t now = millis();

    // ── 1. ZARZĄDZANIE KOMENDAMI BLE ──────────────────────────────────
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
        char buf[50];
        snprintf(buf, 50, "REC:%u SES:%u", flashRecordCount(), flashSessionRecordCount());
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

        static int bleTick = 0;
        if (++bleTick >= 2) {
            bleTick = 0;
            if (deviceConnected) {
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
    bool pressed = (digitalRead(BUTTON_PIN) == LOW);
    if (pressed && !buttonPressed) {
        buttonPressed = true; 
        buttonPressStart = now; 
        longPressHandled = false;
    }
    if (pressed && buttonPressed && !longPressHandled && (now - buttonPressStart >= LONG_PRESS_MS)) {
        longPressHandled = true;
        enterDeepSleep();
    }
    if (!pressed && buttonPressed) {
        buttonPressed = false;
        if (!longPressHandled) {
            if (!sysMeasuring) startSession();
            else stopSession();
        }
    }
}