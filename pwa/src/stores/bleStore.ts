import { create } from 'zustand'
import { ble } from '../services/bleService'
import { smartSync, type SyncProgress } from '../services/syncService'
import type { DeviceConfig, DeviceStatus, LiveFrame } from '../types'

interface BleStore {
  isConnected: boolean
  isSyncing: boolean
  syncProgress: SyncProgress | null
  liveFrame: LiveFrame | null
  deviceStatus: DeviceStatus | null
  deviceConfig: DeviceConfig | null
  lastTimeSynced: Date | null
  error: string | null

  connect: () => Promise<void>
  disconnect: () => void
  sync: (onDone?: () => void) => Promise<void>
  syncTime: () => Promise<void>
  startLive: () => void
  stopLive: () => void
  loadStatus: () => Promise<void>
  loadConfig: () => Promise<void>
  setConfig: (cfg: DeviceConfig) => Promise<void>
  calibrate: () => Promise<'ok' | 'error'>
  sleep: () => void
  erase: () => Promise<void>
  format: () => Promise<void>
  clearError: () => void
}

export const useBleStore = create<BleStore>((set, get) => {
  // Wire BLE service connection changes into store
  ble.onConnectionChange = (connected) => {
    set({ isConnected: connected })
    if (!connected) set({ liveFrame: null, deviceStatus: null, syncProgress: null })
  }

  return {
    isConnected: false,
    isSyncing: false,
    syncProgress: null,
    liveFrame: null,
    deviceStatus: null,
    deviceConfig: null,
    lastTimeSynced: null,
    error: null,

    connect: async () => {
      if (!navigator.bluetooth) {
        set({ error: 'Web Bluetooth niedostępne. Użyj Chrome lub Edge na Androidzie / desktopie.' })
        return
      }
      try {
        set({ error: null })
        await ble.connect()
      } catch (e) {
        set({ error: (e as Error).message })
      }
    },

    disconnect: () => ble.disconnect(),

    sync: async (onDone) => {
      if (get().isSyncing) return
      set({ isSyncing: true, syncProgress: null, error: null })
      try {
        await smartSync(ble, (p) => set({ syncProgress: p }))
        set({ lastTimeSynced: new Date() })
        onDone?.()
      } catch (e) {
        set({ error: (e as Error).message })
      } finally {
        set({ isSyncing: false })
      }
    },

    syncTime: async () => {
      try {
        await ble.syncTime()
        set({ lastTimeSynced: new Date() })
      } catch (e) {
        set({ error: (e as Error).message })
      }
    },

    startLive: () => {
      ble.startLiveStream((frame) => set({ liveFrame: frame }))
    },

    stopLive: () => {
      ble.stopLiveStream()
      set({ liveFrame: null })
    },

    loadStatus: async () => {
      try {
        const status = await ble.getStatus()
        set({ deviceStatus: status })
      } catch (e) {
        set({ error: (e as Error).message })
      }
    },

    loadConfig: async () => {
      try {
        const cfg = await ble.getConfig()
        set({ deviceConfig: cfg })
      } catch (e) {
        set({ error: (e as Error).message })
      }
    },

    setConfig: async (cfg) => {
      try {
        await ble.setConfig(cfg)
        set({ deviceConfig: cfg })
      } catch (e) {
        set({ error: (e as Error).message })
      }
    },

    calibrate: () => ble.calibrate(),

    sleep: () => {
      ble.sleep().catch(() => { /* device disconnects immediately */ })
    },

    erase: async () => {
      try { await ble.erase() } catch (e) { set({ error: (e as Error).message }) }
    },

    format: async () => {
      try { await ble.format() } catch (e) { set({ error: (e as Error).message }) }
    },

    clearError: () => set({ error: null }),
  }
})
