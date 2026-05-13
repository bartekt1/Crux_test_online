#include "Sensors.h"
#include <Wire.h>
#include <Adafruit_BMP3XX.h>
#include <Adafruit_LSM6DS3TRC.h>
#include "KalmanFilter.h"
#include "Config.h"

#define I2C_SDA 5
#define I2C_SCL 6

Adafruit_BMP3XX bmp;
Adafruit_LSM6DS3TRC lsm;
AdaptiveKalmanFilter filterKalman;

float sysRawPressure = 0;
float sysKalmanRate = 0;
float sysTotalG = 1.0f;
float sysGVariance = 0;
bool sysPressureInitialized = false;
float sysSessionBasePressure = 0;

static uint32_t lastSensorTime = 0;

bool sensorsInit() {
    Wire.begin(I2C_SDA, I2C_SCL);
    Wire.setClock(400000);

    bool bmp_ok = bmp.begin_I2C(0x77, &Wire) || bmp.begin_I2C(0x76, &Wire);
    if (bmp_ok) {
        bmp.setTemperatureOversampling(BMP3_OVERSAMPLING_2X);
        bmp.setPressureOversampling(BMP3_OVERSAMPLING_8X);
        bmp.setIIRFilterCoeff(BMP3_IIR_FILTER_COEFF_3);
        bmp.setOutputDataRate(BMP3_ODR_50_HZ);
    }

    bool lsm_ok = lsm.begin_I2C(0x6A, &Wire) || lsm.begin_I2C(0x6B, &Wire);
    
    return bmp_ok && lsm_ok;
}

void sensorsUpdate(uint32_t now) {
    static const int G_HISTORY = 10;
    static float gHistory[G_HISTORY] = {0};
    static int gIndex = 0;
    static bool gHistoryFull = false;

    if (bmp.performReading()) {
        sysRawPressure = bmp.pressure;

        sensors_event_t accel, gyro, temp;
        lsm.getEvent(&accel, &gyro, &temp);
        
        // Optymalizacja: sqrtf zamiast sqrt
        sysTotalG = sqrtf(
            accel.acceleration.x * accel.acceleration.x +
            accel.acceleration.y * accel.acceleration.y +
            accel.acceleration.z * accel.acceleration.z
        ) / 9.81f;

        float dt = (now - lastSensorTime) / 1000.0f;
        if (dt <= 0) dt = 0.04f;
        lastSensorTime = now;

        gHistory[gIndex] = sysTotalG;
        gIndex = (gIndex + 1) % G_HISTORY;
        if (gIndex == 0) gHistoryFull = true;

        if (gHistoryFull) {
            float sum = 0, mean = 0, var = 0;
            for (int i = 0; i < G_HISTORY; i++) sum += gHistory[i];
            mean = sum / G_HISTORY;
            for (int i = 0; i < G_HISTORY; i++) {
                float diff = gHistory[i] - mean;
                var += (diff * diff); // Optymalizacja: zwykłe mnożenie zamiast pow(x,2)
            }
            sysGVariance = var / G_HISTORY;
        }

        if (!sysPressureInitialized) {
            filterKalman.init(sysRawPressure);
            sysSessionBasePressure = sysRawPressure;
            sysPressureInitialized = true;
        } else {
            // Filtr Kalmana teraz pobiera prób gAct dynamicznie z konfiguracji
            filterKalman.update(sysRawPressure, dt, sysGVariance, cfg.gAct);
        }
        sysKalmanRate = filterKalman.getVelocity();
    }
}

void sensorsSleep() {
    bmp.setTemperatureOversampling(BMP3_NO_OVERSAMPLING);
    bmp.setPressureOversampling(BMP3_NO_OVERSAMPLING);
    bmp.setOutputDataRate(BMP3_ODR_0_01_HZ);
    lsm.setAccelDataRate(LSM6DS_RATE_SHUTDOWN);
    lsm.setGyroDataRate(LSM6DS_RATE_SHUTDOWN);
}