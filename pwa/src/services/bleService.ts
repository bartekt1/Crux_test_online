import {
  parseInfo, parseStatus, parseConfig,
  parseLiveFrame, parseRecord, buildSetCfg,
} from '../lib/bleParser'
import type { DeviceConfig, DeviceStatus, LiveFrame, LogRecord } from '../types'

const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_TX_UUID      = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_RX_UUID      = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'

type MessageHandler = (msg: string) => void

export class BleService {
  private server: BluetoothRemoteGATTServer | null = null
  private txChar: BluetoothRemoteGATTCharacteristic | null = null
  private rxChar: BluetoothRemoteGATTCharacteristic | null = null
  private handlers: MessageHandler[] = []
  private liveUnsub: (() => void) | null = null

  onConnectionChange: ((connected: boolean) => void) | null = null

  get isConnected(): boolean {
    return this.server?.connected ?? false
  }

  private dispatch(msg: string): void {
    for (const h of [...this.handlers]) h(msg)
  }

  private subscribe(fn: MessageHandler): () => void {
    this.handlers.push(fn)
    return () => {
      const i = this.handlers.indexOf(fn)
      if (i !== -1) this.handlers.splice(i, 1)
    }
  }

  // Wait for a single message matching predicate
  private once(predicate: (m: string) => boolean, timeoutMs = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
      let unsub: () => void
      const timer = setTimeout(() => { unsub(); reject(new Error('BLE timeout')) }, timeoutMs)
      unsub = this.subscribe((msg) => {
        if (predicate(msg)) { clearTimeout(timer); unsub(); resolve(msg) }
      })
    })
  }

  async connect(): Promise<void> {
    if (this.isConnected) this.server?.disconnect()

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: 'CruxTracker PRO' }],
      optionalServices: [NUS_SERVICE_UUID],
    })

    device.addEventListener('gattserverdisconnected', () => {
      this.server = null
      this.txChar = null
      this.rxChar = null
      this.handlers = []
      this.liveUnsub = null
      this.onConnectionChange?.(false)
    })

    this.server = await device.gatt!.connect()
    const svc = await this.server.getPrimaryService(NUS_SERVICE_UUID)
    this.txChar = await svc.getCharacteristic(NUS_TX_UUID)
    this.rxChar = await svc.getCharacteristic(NUS_RX_UUID)

    this.txChar.addEventListener('characteristicvaluechanged', (e: Event) => {
      const val = (e.target as BluetoothRemoteGATTCharacteristic).value!
      this.dispatch(new TextDecoder().decode(val))
    })
    await this.txChar.startNotifications()

    this.onConnectionChange?.(true)
  }

  disconnect(): void {
    this.server?.disconnect()
  }

  async send(cmd: string): Promise<void> {
    if (!this.rxChar) throw new Error('Not connected')
    await this.rxChar.writeValue(new TextEncoder().encode(cmd))
  }

  // ── Commands ──────────────────────────────────────────────────────────

  async getInfo() {
    await this.send('INFO')
    const msg = await this.once((m) => m.startsWith('INFO:'))
    return parseInfo(msg)
  }

  async getStatus(): Promise<DeviceStatus | null> {
    await this.send('STATUS')
    const msg = await this.once((m) => m.startsWith('BAT:'))
    return parseStatus(msg)
  }

  async getConfig(): Promise<DeviceConfig | null> {
    await this.send('GET_CFG')
    const msg = await this.once((m) => m.startsWith('CFG:'))
    return parseConfig(msg)
  }

  async setConfig(cfg: DeviceConfig): Promise<void> {
    await this.send(buildSetCfg(cfg))
    await this.once((m) => m === 'CFG:SAVED' || m === 'CFG:ERROR')
  }

  async syncTime(): Promise<void> {
    const ts = Math.floor(Date.now() / 1000)
    await this.send(`TIME:${ts}`)
    await this.once((m) => m === 'TIME_OK', 3000)
  }

  async calibrate(): Promise<'ok' | 'error'> {
    await this.send('CALIBRATE')
    const msg = await this.once((m) => m.startsWith('CALIBRATE'))
    return msg === 'CALIBRATE_OK' ? 'ok' : 'error'
  }

  async erase(): Promise<void> {
    await this.send('ERASE')
    await this.once((m) => m === 'ERASE:DONE', 30_000)
  }

  async format(): Promise<void> {
    await this.send('FORMAT')
    await this.once((m) => m === 'FORMAT_OK', 30_000)
  }

  async sleep(): Promise<void> {
    await this.send('SLEEP')
  }

  // ── Session dump ──────────────────────────────────────────────────────

  dumpHistoricalSession(
    sessionId: number,
    onRecord: (r: LogRecord) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let unsub: () => void
      const timer = setTimeout(() => {
        unsub()
        reject(new Error(`DUMP timeout dla sesji ${sessionId}`))
      }, 60_000)

      unsub = this.subscribe((msg) => {
        if (msg === 'DUMP_END') {
          clearTimeout(timer); unsub(); resolve(); return
        }
        const rec = parseRecord(msg)
        if (rec) onRecord(rec)
      })

      this.send(`DUMP:${sessionId}`).catch((e: unknown) => {
        clearTimeout(timer); unsub(); reject(e)
      })
    })
  }

  // ── Live stream ───────────────────────────────────────────────────────

  startLiveStream(onFrame: (frame: LiveFrame) => void): void {
    this.liveUnsub?.()
    this.liveUnsub = this.subscribe((msg) => {
      const frame = parseLiveFrame(msg, Date.now())
      if (frame) onFrame(frame)
    })
    this.send('STREAM_ON').catch(() => { /* ignore on disconnect */ })
  }

  stopLiveStream(): void {
    this.liveUnsub?.()
    this.liveUnsub = null
    this.send('STREAM_OFF').catch(() => { /* ignore on disconnect */ })
  }
}

export const ble = new BleService()
