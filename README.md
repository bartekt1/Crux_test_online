# CruxTracker 🧗‍♂️

**CruxTracker** to otwarty (open-source), noszony na uprzęży tracker sesji wspinaczkowych. Automatycznie rejestruje próby, czas wspinania i odpoczynku, nie wymagając od wspinacza dotykania telefonu podczas treningu. 

Dane są bezpiecznie zapisywane w zewnętrznej pamięci Flash, a po sesji synchronizowane z bezpłatną aplikacją PWA (Progressive Web App) prosto z poziomu przeglądarki.

---

## 🧗 Dlaczego CruxTracker?
Istniejące aplikacje wspinaczkowe wymagają ręcznego wprowadzania danych po każdej próbie. W trakcie intensywnej sesji boulderingowej lub na drogach z liną, wyciąganie telefonu wybija z rytmu. Efekt? Sesje są logowane niedokładnie z pamięci po powrocie do domu.

CruxTracker automatyzuje ten proces. Urządzenie wisi na uprzęży i samo "wie", kiedy idziesz do góry, kiedy spadasz, a kiedy odpoczywasz, pozwalając Ci skupić się wyłącznie na wspinaniu.

## 🚀 Główne innowacje
* **IMU-gated Kalman Filter:** Sam barometr łatwo oszukać (klimatyzacja, przeciągi, otwieranie drzwi). CruxTracker łączy precyzyjny czujnik ciśnienia (BMP390) z akcelerometrem (LSM6DS3). Zmiana ciśnienia jest logowana jako "wspinanie" tylko wtedy, gdy towarzyszy jej fizyczny ruch ciała (odpowiednia wariancja przyspieszenia).
* **Brak dedykowanej aplikacji:** Nie musisz instalować niczego ze sklepu App Store / Google Play. Interfejs użytkownika to strona PWA wykorzystująca `Web Bluetooth API` do pobierania danych z urządzenia.
* **Uprząż zamiast nadgarstka:** Zegarki (np. zepsuty projekt *Whipper*) cierpią na błędne odczyty z powodu potu, ciepła ciała i chaotycznych ruchów rąk. CruxTracker przypięty do uprzęży mierzy stabilny, centralny wektor ruchu.

## 🛠 Hardware Stack (Sprzęt)
Urządzenie jest oparte na tanich, łatwo dostępnych komponentach:
* **MCU:** WEMOS LOLIN C3 Mini (ESP32-C3)
* **Barometr:** Adafruit BMP390 (I2C)
* **IMU:** Adafruit LSM6DS3TR-C (I2C)
* **Pamięć sesji:** Moduł W25Q128 SPI Flash (16MB binarnego logu, niezależny od MCU)
* **Wyświetlacz:** OLED 0.42" I2C (lokalne potwierdzanie stanów)
* **Zasilanie:** Akumulator LiPo 400mAh + moduł ładowania TP4056 (USB-C)

## 💻 Software Stack (Firmware)
* **Środowisko:** Visual Studio Code + PlatformIO (C++)
* **Stos BLE:** `NimBLE` (lekki, niski pobór RAM, szybkie transfery paczek NUS)
* **Zarządzanie Pamięcią:** Surowy zapis sektorowy Flash bez systemu plików (paginowany DUMP dla PWA), trwałe ID sesji w NVS.
* **Maszyna Stanów:** `IDLE` -> `RESTING` -> `CLIMBING` -> `DESCENDING` -> `FREEFALL`

### Zbierane metryki (16-bajtowy rekord)
Urządzenie zapisuje rekord co 0.5s w ruchu i co 2.0s w spoczynku. Rekord zawiera:
1. Timestamp (czas od startu sesji)
2. ID próby & ID sesji
3. Aktualny stan
4. Prędkość zmiany ciśnienia (dP wygładzone Kalmanem)
5. Wariancja przeciążeń (G-variance)
6. Ciśnienie względne

## ⚙️ Kompilacja i instalacja (Jak zacząć)

### Wymagania
* Visual Studio Code
* Rozszerzenie **PlatformIO IDE**
* Przewód USB-C (z linią danych)

### Krok po kroku
1. Sklonuj repozytorium:
   ```bash
   git clone [https://github.com/TwojaNazwa/CruxTracker-Firmware.git](https://github.com/TwojaNazwa/CruxTracker-Firmware.git)
