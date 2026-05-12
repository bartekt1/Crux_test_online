#pragma once
#include <Arduino.h>
#include "CruxTypes.h"

extern uint32_t flashWriteAddr;
extern uint32_t sysSessionStartAddr;
extern bool flashOK;

bool flashInit();
void flashWriteRecord(const LogRecord* rec);
bool flashReadRecord(uint32_t addr, LogRecord* rec);
uint32_t flashRecordCount();
uint32_t flashSessionRecordCount();
void flashChipErase();