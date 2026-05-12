#pragma once
#include <Arduino.h>
#include "CruxTypes.h"

void displayInit();
void displayUpdate(State currentState, int attemptCount, float dpRate, float gVar, bool isMeasuring, bool isConnected);
void displaySleep();