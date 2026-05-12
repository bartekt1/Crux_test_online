#pragma once
#include <Arduino.h>
#include <string>

extern bool deviceConnected;

// Flagi komend od PWA
extern bool cmdDump;
extern bool cmdErase;
extern bool cmdStatus;
extern bool cmdSleep;
extern bool cmdTest;
extern bool cmdDebug;
extern bool cmdGetCfg;
extern bool cmdSetCfg;
extern bool cmdDumpSession;

extern std::string newCfgPayload;
extern std::string dumpSessionPayload;

void bleInit();
void bleSend(const char* msg);
void bleSleep();