#pragma once
#include <Arduino.h>

struct ConfigData {
    float pClimb;
    float pDesc;
    float gAct;
    float gStill;
    float gFall;
    int   confirm;
};

extern ConfigData cfg;

void loadConfig();
void saveConfig();