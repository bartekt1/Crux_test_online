#include "Config.h"
#include <Preferences.h>
#include "CruxTypes.h"

ConfigData cfg;
Preferences prefs;

// Globalne tablice znakowe dla stanów (zdefiniowane w CruxTypes.h)
const char* stateNames[] = { "IDLE", "RESTING", "CLIMBING", "DESCEND", "FREEFALL" };
const char  stateChars[] = { 'I', 'R', 'C', 'D', 'F' };

void loadConfig() {
    prefs.begin("crux_cfg", false);
    // Wartości domyślne skalibrowane na podstawie danych z testów na ścianie (maj 2026).
    // pClimb=1.5: realne wspinanie osiąga max 2.6–5.5 Pa/s; przy gAct=0.030 bramka IMU
    // zapobiega fałszywym CLIMBING bez potrzeby wysokiego progu ciśnieniowego.
    cfg.pClimb  = prefs.getFloat("pClimb",  1.5f);
    cfg.pDesc   = prefs.getFloat("pDesc",   1.5f);
    // gAct zmienione z 0.003 na 0.030: stary próg leżał w środku szumu bezruchu (0.001–0.005),
    // nie blokował driftu HVAC (max 0.026) i nie był skuteczną bramką IMU.
    // 0.030 leży powyżej szumu i driftu, poniżej minimum realnego wspinania (0.067).
    cfg.gAct    = prefs.getFloat("gAct",    0.030f);
    cfg.gStill  = prefs.getFloat("gStill",  0.001f);
    cfg.gFall   = prefs.getFloat("gFall",   0.3f);
    // confirm=3: 300ms debounce — szybsza odpowiedź, testowo stabilne
    cfg.confirm = prefs.getInt  ("confirm", 3);
    prefs.end();
}

void saveConfig() {
    prefs.begin("crux_cfg", false);
    prefs.putFloat("pClimb",  cfg.pClimb);
    prefs.putFloat("pDesc",   cfg.pDesc);
    prefs.putFloat("gAct",    cfg.gAct);
    prefs.putFloat("gStill",  cfg.gStill);
    prefs.putFloat("gFall",   cfg.gFall);
    prefs.putInt  ("confirm", cfg.confirm);
    prefs.end();
}