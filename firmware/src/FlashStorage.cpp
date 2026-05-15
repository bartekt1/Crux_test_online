#include "FlashStorage.h"
#include <SPI.h>

#define FLASH_CS    10
#define FLASH_SCK   1
#define FLASH_MOSI  2
#define FLASH_MISO  3

#define FLASH_SIZE     0x1000000UL
#define DATA_START     0x1000UL
#define PAGE_SIZE      256
#define SECTOR_SIZE    4096

#define CMD_WRITE_ENABLE  0x06
#define CMD_PAGE_PROGRAM  0x02
#define CMD_READ_DATA     0x03
#define CMD_SECTOR_ERASE  0x20
#define CMD_CHIP_ERASE    0xC7
#define CMD_READ_STATUS   0x05
#define CMD_JEDEC_ID      0x9F

SPIClass flashSPI(FSPI);

uint32_t flashWriteAddr = DATA_START;
uint32_t sysSessionStartAddr = DATA_START;
bool flashOK = false;

void flashWaitReady() {
    digitalWrite(FLASH_CS, LOW);
    flashSPI.transfer(CMD_READ_STATUS);
    while (flashSPI.transfer(0) & 0x01) { delay(1); }
    digitalWrite(FLASH_CS, HIGH);
}

void flashWriteEnable() {
    digitalWrite(FLASH_CS, LOW);
    flashSPI.transfer(CMD_WRITE_ENABLE);
    digitalWrite(FLASH_CS, HIGH);
}

bool flashReadRecord(uint32_t addr, LogRecord* rec) {
    if (addr + RECORD_SIZE > FLASH_SIZE) return false;
    digitalWrite(FLASH_CS, LOW);
    flashSPI.transfer(CMD_READ_DATA);
    flashSPI.transfer((addr >> 16) & 0xFF);
    flashSPI.transfer((addr >> 8)  & 0xFF);
    flashSPI.transfer( addr        & 0xFF);
    
    uint8_t* buf = reinterpret_cast<uint8_t*>(rec);
    for (uint16_t i = 0; i < RECORD_SIZE; i++) {
        buf[i] = flashSPI.transfer(0);
    }
    digitalWrite(FLASH_CS, HIGH);
    return true;
}

void flashPageProgram(uint32_t addr, const uint8_t* data, uint16_t len) {
    flashWriteEnable();
    digitalWrite(FLASH_CS, LOW);
    flashSPI.transfer(CMD_PAGE_PROGRAM);
    flashSPI.transfer((addr >> 16) & 0xFF);
    flashSPI.transfer((addr >> 8)  & 0xFF);
    flashSPI.transfer( addr        & 0xFF);
    for (uint16_t i = 0; i < len; i++) flashSPI.transfer(data[i]);
    digitalWrite(FLASH_CS, HIGH);
    flashWaitReady();
}

void flashSectorErase(uint32_t addr) {
    flashWriteEnable();
    digitalWrite(FLASH_CS, LOW);
    flashSPI.transfer(CMD_SECTOR_ERASE);
    flashSPI.transfer((addr >> 16) & 0xFF);
    flashSPI.transfer((addr >> 8)  & 0xFF);
    flashSPI.transfer( addr        & 0xFF);
    digitalWrite(FLASH_CS, HIGH);
    flashWaitReady();
}

void flashChipErase() {
    flashWriteEnable();
    digitalWrite(FLASH_CS, LOW);
    flashSPI.transfer(CMD_CHIP_ERASE);
    digitalWrite(FLASH_CS, HIGH);
    Serial.println("Flash chip erase...");
    flashWaitReady();
    Serial.println("Flash erase OK");
    flashWriteAddr = DATA_START;
    sysSessionStartAddr = DATA_START;
}

// Returns the next valid record address after addr, mirroring the write-side page-skip logic.
uint32_t flashNextAddr(uint32_t addr) {
    addr += RECORD_SIZE;
    if ((addr % PAGE_SIZE) + RECORD_SIZE > PAGE_SIZE) {
        addr = (addr / PAGE_SIZE + 1) * PAGE_SIZE;
    }
    return addr;
}

// Converts a linear record index to a flash address, accounting for page-boundary gaps.
static uint32_t recordIndexToAddr(uint32_t idx) {
    const uint32_t recsPerPage = PAGE_SIZE / RECORD_SIZE;
    return DATA_START + (idx / recsPerPage) * PAGE_SIZE + (idx % recsPerPage) * RECORD_SIZE;
}

uint32_t flashFindWritePos() {
    const uint32_t recsPerPage = PAGE_SIZE / RECORD_SIZE;
    const uint32_t maxRecords  = ((FLASH_SIZE - DATA_START) / PAGE_SIZE) * recsPerPage;

    uint32_t low = 0, high = maxRecords;
    while (low < high) {
        uint32_t mid  = low + (high - low) / 2;
        uint32_t addr = recordIndexToAddr(mid);

        digitalWrite(FLASH_CS, LOW);
        flashSPI.transfer(CMD_READ_DATA);
        flashSPI.transfer((addr >> 16) & 0xFF);
        flashSPI.transfer((addr >> 8)  & 0xFF);
        flashSPI.transfer( addr        & 0xFF);
        uint8_t b = flashSPI.transfer(0);
        digitalWrite(FLASH_CS, HIGH);

        if (b == 0xFF) high = mid; else low = mid + 1;
    }
    return recordIndexToAddr(low);
}

bool flashInit() {
    flashSPI.begin(FLASH_SCK, FLASH_MISO, FLASH_MOSI, FLASH_CS);
    pinMode(FLASH_CS, OUTPUT);
    digitalWrite(FLASH_CS, HIGH);
    delay(10);
    
    digitalWrite(FLASH_CS, LOW);
    flashSPI.transfer(CMD_JEDEC_ID);
    uint8_t mfr  = flashSPI.transfer(0);
    uint8_t type = flashSPI.transfer(0);
    uint8_t cap  = flashSPI.transfer(0);
    digitalWrite(FLASH_CS, HIGH);
    
    if (mfr == 0xEF && type == 0x40 && cap == 0x18) {
        flashWriteAddr = flashFindWritePos();
        sysSessionStartAddr = flashWriteAddr; // domyślnie: start = aktualny koniec flash
        return true;
    }
    return false;
}

void flashWriteRecord(const LogRecord* rec) {
    if (!flashOK) return;
    
    // Zabezpieczenie przed przepełnieniem (zapętlamy do początku)
    if (flashWriteAddr + RECORD_SIZE > FLASH_SIZE) { 
        flashWriteAddr = DATA_START; 
    }
    
    uint16_t posInPage = flashWriteAddr % PAGE_SIZE;
    if (posInPage + RECORD_SIZE > PAGE_SIZE) {
        flashWriteAddr = (flashWriteAddr / PAGE_SIZE + 1) * PAGE_SIZE;
    }
    if (flashWriteAddr % SECTOR_SIZE == 0) { 
        flashSectorErase(flashWriteAddr); 
    }
    
    flashPageProgram(flashWriteAddr, reinterpret_cast<const uint8_t*>(rec), RECORD_SIZE);
    flashWriteAddr += RECORD_SIZE;
}

uint32_t flashRecordCount() {
    if (flashWriteAddr <= DATA_START) return 0;
    return (flashWriteAddr - DATA_START) / RECORD_SIZE;
}

uint32_t flashSessionRecordCount() {
    if (flashWriteAddr <= sysSessionStartAddr) return 0;
    return (flashWriteAddr - sysSessionStartAddr) / RECORD_SIZE;
}