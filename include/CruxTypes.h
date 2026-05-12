#pragma once
#include <Arduino.h>

#define FW_VERSION     7
#define RECORD_VERSION 3

// Stany maszyny stanów
enum State { IDLE, RESTING, CLIMBING, DESCENDING, FREEFALL };
extern const char* stateNames[];
extern const char  stateChars[];

// Struktura rekordu zaktualizowana o uint32_t dla session_id
struct __attribute__((packed, aligned(4))) LogRecord {
    uint32_t timestamp_s;
    uint32_t session_id;  // Poprawka: uint32_t zapobiega kolizjom ID
    uint16_t attempt_id;
    uint8_t  state;
    uint8_t  padding;
    int16_t  dpRateX100;
    uint16_t gvX1000;
    int16_t  pressRelX10;
};

#define RECORD_SIZE sizeof(LogRecord)