#pragma once

class AdaptiveKalmanFilter {
private:
    float x_press, x_vel;
    float P00, P01, P10, P11;
    float Q_press, Q_vel, R_base;
public:
    AdaptiveKalmanFilter();
    void init(float initial_pressure);
    void update(float measured_pressure, float dt, float g_variance, float gAct_threshold);
    float getPressure();
    float getVelocity();
};