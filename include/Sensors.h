#pragma once
#include <Arduino.h>
#include "KalmanFilter.h" // Dodane, aby plik wiedział czym jest ten filtr

extern float sysRawPressure;
extern float sysKalmanRate;
extern float sysTotalG;
extern float sysGVariance;
extern bool sysPressureInitialized;
extern float sysSessionBasePressure;
extern AdaptiveKalmanFilter filterKalman; // Udostępnienie obiektu do main.cpp

bool sensorsInit();
void sensorsUpdate(uint32_t now);
void sensorsSleep();