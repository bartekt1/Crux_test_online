import { useEffect, useState } from 'react'
import { useBleStore } from '../stores/bleStore'
import { useSessionStore } from '../stores/sessionStore'
import { formatDate } from '../lib/format'
import type { DeviceConfig } from '../types'

const CFG_META: Array<{ key: keyof DeviceConfig; label: string; step: string; hint: string }> = [
  {
    key: 'pClimb', label: 'Próg wspinania', step: '0.1',
    hint: 'Minimalna prędkość zmian ciśnienia (Pa/s) do wykrycia wspinania. Zwiększ jeśli urządzenie błędnie wykrywa wspinanie podczas chodzenia lub pracy klimatyzacji. Zmniejsz jeśli wspinanie na wolnych trasach nie jest wykrywane. Domyślnie: 5.0',
  },
  {
    key: 'pDesc', label: 'Próg zjazdu', step: '0.1',
    hint: 'Minimalna prędkość zmian ciśnienia (Pa/s) do wykrycia zjazdu na linie. Działa symetrycznie do progu wspinania. Domyślnie: 1.5',
  },
  {
    key: 'gAct', label: 'Czułość ruchu', step: '0.001',
    hint: 'Próg wariancji akcelerometru powyżej którego urządzenie uznaje ciało za aktywne. Gdy ciało jest nieruchome, zmiany ciśnienia są ignorowane (np. od wiatru czy klimatyzacji). Zmniejsz jeśli wspinanie jest pomijane. Domyślnie: 0.003',
  },
  {
    key: 'gStill', label: 'Próg bezruchu', step: '0.001',
    hint: 'Wariancja akcelerometru poniżej której urządzenie przechodzi w stan ODPOCZYNEK. Powinna być niższa od czułości ruchu. Zmniejsz jeśli urządzenie nie wraca do odpoczynku między próbami. Domyślnie: 0.001',
  },
  {
    key: 'gFall', label: 'Swobodny spadek', step: '0.05',
    hint: 'Próg łącznego przyspieszenia (×g) do wykrycia swobodnego spadku lub lotu. Wartość bliska 0 oznacza brak grawitacji. Nie zmieniaj bez wyraźnej potrzeby. Domyślnie: 0.3',
  },
  {
    key: 'confirm', label: 'Stabilizacja stanu', step: '1',
    hint: 'Liczba kolejnych taktów (×100ms) potwierdzających nowy stan zanim nastąpi zmiana. Wyższa wartość eliminuje chwilowe wahania, ale spowalnia reakcję urządzenia. Domyślnie: 4 (= 400ms)',
  },
]

export default function DeviceScreen() {
  const {
    isConnected, isSyncing, syncProgress, deviceStatus, deviceConfig, lastTimeSynced, error,
    connect, sync, syncTime, loadStatus, loadConfig, setConfig, calibrate, sleep, erase, format, clearError,
  } = useBleStore()
  const { load, clearAll } = useSessionStore()

  const [localCfg, setLocalCfg] = useState<DeviceConfig | null>(null)
  const [cfgDirty, setCfgDirty] = useState(false)
  const [cfgMsg, setCfgMsg] = useState<string | null>(null)
  const [calLabel, setCalLabel] = useState('Kalibruj ciśnienie bazowe')
  const [expandedHint, setExpandedHint] = useState<keyof DeviceConfig | null>(null)

  useEffect(() => {
    if (isConnected) {
      void loadStatus()
      void loadConfig()
    }
  }, [isConnected, loadStatus, loadConfig])

  useEffect(() => {
    if (deviceConfig) { setLocalCfg(deviceConfig); setCfgDirty(false) }
  }, [deviceConfig])

  function updateField(key: keyof DeviceConfig, value: string) {
    if (!localCfg) return
    setLocalCfg({ ...localCfg, [key]: key === 'confirm' ? parseInt(value, 10) : parseFloat(value) })
    setCfgDirty(true)
    setCfgMsg(null)
  }

  async function saveCfg() {
    if (!localCfg) return
    await setConfig(localCfg)
    setCfgDirty(false)
    setCfgMsg('Zapisano')
    setTimeout(() => setCfgMsg(null), 2000)
  }

  async function handleSyncTime() {
    await syncTime()
    setCfgMsg('Czas zsynchronizowany')
    setTimeout(() => setCfgMsg(null), 2000)
  }

  async function handleCalibrate() {
    const result = await calibrate()
    setCalLabel(result === 'ok' ? '✓ Kalibracja OK' : '✗ Błąd kalibracji')
    setTimeout(() => setCalLabel('Kalibruj ciśnienie bazowe'), 2500)
  }

  async function handleErase() {
    if (!confirm('Usuń WSZYSTKIE dane z pamięci Flash? Tej operacji nie można cofnąć.')) return
    clearError()
    await erase()
    setCfgMsg('Flash wymazany')
  }

  async function handleFormat() {
    if (!confirm('FORMAT: wymaże dane Flash I zresetuje licznik sesji. Kontynuować?')) return
    clearError()
    await format()
    await clearAll()
    setCfgMsg('Format OK — lokalne sesje usunięte')
  }

  return (
    <div className="p-4 flex flex-col gap-6 pb-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Urządzenie</h2>

      {/* Connection */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Połączenie</h3>
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-gray-900 dark:text-white font-medium">
              {isConnected ? 'Połączono' : 'Rozłączono'}
            </span>
          </div>
          <button
            onClick={() => void connect()}
            disabled={isConnected}
            className="text-sm text-violet-600 dark:text-violet-400 font-medium disabled:opacity-40"
          >
            Połącz
          </button>
        </div>

        {isConnected && (
          <button
            onClick={() => void sync(() => void load())}
            disabled={isSyncing}
            className="w-full py-3 rounded-2xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {isSyncing ? (syncProgress?.message ?? 'Synchronizacja...') : 'Synchronizuj sesje'}
          </button>
        )}

        {isConnected && (
          <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-white">Czas urządzenia</span>
              {lastTimeSynced && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Zsynchronizowano: {formatDate(lastTimeSynced)}
                </span>
              )}
              {!lastTimeSynced && (
                <span className="text-xs text-gray-400 dark:text-gray-500">Nie zsynchronizowano</span>
              )}
            </div>
            <button
              onClick={() => void handleSyncTime()}
              className="text-sm text-violet-600 dark:text-violet-400 font-medium"
            >
              Synchronizuj
            </button>
          </div>
        )}
      </section>

      {/* Status */}
      {deviceStatus && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Status</h3>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-3 flex flex-col gap-1 text-sm">
            <Row label="Bateria" value={deviceStatus.battery} />
            <Row label="Wolna pamięć" value={`${(deviceStatus.freeMemory / 1024).toFixed(0)} KB`} />
            <Row label="Sensory" value={deviceStatus.sensorsOk ? '✓ OK' : '✗ Błąd'} />
          </div>
        </section>
      )}

      {/* Config */}
      {localCfg && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Konfiguracja</h3>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-3 flex flex-col gap-3">
            {CFG_META.map(({ key, label, step, hint }) => (
              <div key={key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
                    <button
                      onClick={() => setExpandedHint(expandedHint === key ? null : key)}
                      className={`w-4 h-4 rounded-full text-[10px] font-bold border flex items-center justify-center transition-colors ${
                        expandedHint === key
                          ? 'border-violet-500 text-violet-500'
                          : 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
                      }`}
                      aria-label="Więcej informacji"
                    >
                      i
                    </button>
                  </div>
                  <input
                    type="number"
                    step={step}
                    value={localCfg[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                    className="w-24 text-right bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700
                      rounded-lg px-2 py-1 text-sm text-gray-900 dark:text-white"
                  />
                </div>
                {expandedHint === key && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed px-1 pb-1 border-l-2 border-violet-300 dark:border-violet-700 pl-2">
                    {hint}
                  </p>
                )}
              </div>
            ))}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => void saveCfg()}
                disabled={!cfgDirty}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white font-semibold text-sm
                  hover:bg-violet-700 disabled:opacity-40 transition-colors"
              >
                Zapisz config
              </button>
              {cfgMsg && <span className="text-sm text-green-600 dark:text-green-400">{cfgMsg}</span>}
            </div>
          </div>
        </section>
      )}

      {/* Actions */}
      {isConnected && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Akcje</h3>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => void handleCalibrate()}
              className="w-full py-3 rounded-2xl border border-gray-200 dark:border-gray-700
                text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {calLabel}
            </button>
            <button
              onClick={sleep}
              className="w-full py-3 rounded-2xl border border-gray-200 dark:border-gray-700
                text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Uśpij urządzenie
            </button>
          </div>
        </section>
      )}

      {/* Danger zone */}
      {isConnected && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-red-400">Strefa niebezpieczna</h3>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => void handleErase()}
              className="w-full py-3 rounded-2xl border border-red-200 dark:border-red-900
                text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              Wymaż Flash
            </button>
            <button
              onClick={() => void handleFormat()}
              className="w-full py-3 rounded-2xl bg-red-500 text-white font-semibold
                hover:bg-red-600 transition-colors"
            >
              Formatuj urządzenie
            </button>
          </div>
        </section>
      )}

      {error && (
        <p className="text-red-500 text-sm px-1">{error}</p>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-gray-900 dark:text-white font-medium">{value}</span>
    </div>
  )
}
