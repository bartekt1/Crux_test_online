#include "KalmanFilter.h"

AdaptiveKalmanFilter::AdaptiveKalmanFilter() {
    x_press = 0.0f;
    x_vel = 0.0f;
    P00 = 1.0f; P01 = 0.0f; P10 = 0.0f; P11 = 1.0f;
    Q_press = 0.001f;
    Q_vel = 0.003f; R_base = 0.5f;
}

void AdaptiveKalmanFilter::init(float initial_pressure) {
    x_press = initial_pressure;
    x_vel = 0.0f;
    P00 = 1.0f; P01 = 0.0f; P10 = 0.0f; P11 = 1.0f;
}

void AdaptiveKalmanFilter::update(float measured_pressure, float dt, float g_variance, float gAct_threshold) {
    x_press += x_vel * dt;
    P00 += dt*(P10+P01) + dt*dt*P11 + Q_press;
    P01 += dt*P11; P10 += dt*P11; P11 += Q_vel;

    // Używamy dynamicznego progu cfg.gAct zamiast hardcode
    bool isActive = (g_variance > gAct_threshold); 
    float R_adaptive;
    
    if (!isActive) {
        R_adaptive = 500.0f;
        x_vel *= 0.85f;
    } else {
        R_adaptive = R_base + (g_variance * 20.0f);
    }

    float S  = P00 + R_adaptive;
    float K0 = P00 / S;
    float K1 = P10 / S;
    float y  = measured_pressure - x_press;

    x_press += K0 * y;
    x_vel += K1 * y;

    float P00t = P00, P01t = P01;
    P00 -= K0 * P00t; P01 -= K0 * P01t;
    P10 -= K1 * P00t; P11 -= K1 * P01t;
}

// Zmiana nazwy metody na getPressure (śledzimy Pa, nie metry)
float AdaptiveKalmanFilter::getPressure() { return x_press; } 
float AdaptiveKalmanFilter::getVelocity() { return x_vel; }