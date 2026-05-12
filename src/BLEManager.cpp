#include "BLEManager.h"
#include <NimBLEDevice.h>

#define SERVICE_UUID      "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

NimBLECharacteristic *pTxCharacteristic;

bool deviceConnected = false;
bool cmdDump = false;
bool cmdErase = false;
bool cmdStatus = false;
bool cmdSleep = false;
bool cmdTest = false;
bool cmdDebug = false;
bool cmdGetCfg = false;
bool cmdSetCfg = false;
bool cmdDumpSession = false;

std::string newCfgPayload = "";
std::string dumpSessionPayload = "";

class ServerCallbacks : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* pServer) override {
        deviceConnected = true;
        // W NimBLE możemy wznowić rozgłaszanie, by np. inne urządzenia widziały sprzęt,
        // ale w naszym przypadku wystarczy po prostu ustawienie flagi.
        NimBLEDevice::startAdvertising(); 
    }
    void onDisconnect(NimBLEServer* pServer) override {
        deviceConnected = false;
        NimBLEDevice::startAdvertising(); // Wznawia nadawanie po utracie zasięgu
    }
};

class RxCallbacks : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic *pChar) override {
        // NimBLE domyślnie używa std::string
        std::string val = pChar->getValue();
        
        if (val.find("STATUS") != std::string::npos) cmdStatus = true;
        else if (val.find("ERASE") != std::string::npos) cmdErase = true;
        else if (val.find("DUMP_SESSION:") != std::string::npos) {
            cmdDumpSession = true;
            dumpSessionPayload = val;
        }
        else if (val.find("DUMP") != std::string::npos) cmdDump = true;
        else if (val.find("TEST") != std::string::npos) cmdTest = true;
        else if (val.find("DEBUG") != std::string::npos) cmdDebug = true;
        else if (val.find("SLEEP") != std::string::npos) cmdSleep = true;
        else if (val.find("GET_CFG") != std::string::npos) cmdGetCfg = true;
        else if (val.find("SET_CFG:") != std::string::npos) {
            cmdSetCfg = true;
            newCfgPayload = val;
        }
    }
};

void bleInit() {
    NimBLEDevice::init("CruxTracker PRO");
    
    // Ustawienie większej mocy nadawania dla lepszego zasięgu na ścianie
    NimBLEDevice::setPower(ESP_PWR_LVL_P9); 

    NimBLEServer *pServer = NimBLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks());

    NimBLEService *pService = pServer->createService(SERVICE_UUID);

    // Konfiguracja cechy TX (Wysyłanie do telefonu)
    pTxCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_TX,
        NIMBLE_PROPERTY::NOTIFY
    );

    // Konfiguracja cechy RX (Odbieranie od telefonu)
    NimBLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_RX,
        NIMBLE_PROPERTY::WRITE
    );
    pRxCharacteristic->setCallbacks(new RxCallbacks());

    pService->start();
    
    NimBLEAdvertising *pAdvertising = NimBLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->start();
}

void bleSend(const char* msg) {
    if (!deviceConnected || !pTxCharacteristic) return;
    pTxCharacteristic->setValue((const uint8_t*)msg, strlen(msg));
    pTxCharacteristic->notify();
    
    // Mniejszy delay dzięki NimBLE. Odblokowuje to główną pętlę!
    delay(5); 
}

void bleSleep() {
    NimBLEDevice::deinit(true);
}