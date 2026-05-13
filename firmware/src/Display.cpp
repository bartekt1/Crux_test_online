#include "Display.h"
#include <U8g2lib.h>
#include "FlashStorage.h"

#define I2C_SDA 5
#define I2C_SCL 6

U8G2_SSD1306_72X40_ER_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE, I2C_SCL, I2C_SDA);

void displayInit() {
    u8g2.begin();
    u8g2.setFont(u8g2_font_5x7_tr);
}

void displayUpdate(State currentState, int attemptCount, float dpRate, float gVar, bool isMeasuring, bool isConnected) {
    u8g2.clearBuffer();
    
    char dpDisp[8]; 
    dtostrf(dpRate, 5, 1, dpDisp);
    
    u8g2.setCursor(0, 8);
    if (!isMeasuring) {
        u8g2.print("GOTOWY (IDLE)");
    } else {
        u8g2.print(stateNames[currentState]);
        u8g2.print(" #"); 
        u8g2.print(attemptCount);
    }
    
    u8g2.setCursor(0, 18); u8g2.print("dP_k:"); u8g2.print(dpDisp);
    u8g2.setCursor(0, 28); u8g2.print("Gv:"); u8g2.print((int)(gVar * 1000));
    u8g2.setCursor(0, 38);
    
    if (flashOK) {
        u8g2.print("S:"); u8g2.print(flashSessionRecordCount());
    } else {
        u8g2.print("NO FLASH");
    }
    
    if (isConnected) u8g2.print(" BT");
    
    u8g2.sendBuffer();
}

void displaySleep() {
    u8g2.clearBuffer(); 
    u8g2.setCursor(0, 20); 
    u8g2.print("SLEEP..."); 
    u8g2.sendBuffer();
    delay(500);
    u8g2.setPowerSave(1);
}