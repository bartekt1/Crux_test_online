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
    // pClimb zmienione na 5.0 po testach z Kalmanem (ignoruje szum HVAC)
    cfg.pClimb  = prefs.getFloat("pClimb",  5.0f); 
    cfg.pDesc   = prefs.getFloat("pDesc",   1.5f);
    cfg.gAct    = prefs.getFloat("gAct",    0.003f);
    cfg.gStill  = prefs.getFloat("gStill",  0.001f);
    cfg.gFall   = prefs.getFloat("gFall",   0.3f);
    cfg.confirm = prefs.getInt  ("confirm", 4);
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