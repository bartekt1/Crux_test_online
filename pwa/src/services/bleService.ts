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
  // Collects reject callbacks so they can all be fired immediately on disconnect
  private pendingRejects = new Set<(err: Error) => void>()
  // Sequential queue for GATT writes — Web Bluetooth disallows concurrent writeValue calls
  private writeQueue: Promise<void> = Promise.resolve()

  onConnectionChange: ((connected: boolean) => void) | null = null
  onSessionEnd: ((recordCount: number) => void) | null = null

  get isConnected(): boolean {
    return this.server?.connected ?? false
  }

  private dispatch(msg: string): void {
    for (const h of [...this.handlers]) h(msg)
    if (msg.startsWith('SESSION_END:')) {
      const count = parseInt(msg.slice('SESSION_END:'.length), 10)
      this.onSessionEnd?.(count)
    }
  }

  private subscribe(fn: MessageHandler): () => void {
    this.handlers.push(fn)
    return () => {
      const i = this.handlers.indexOf(fn)
      if (i !== -1) this.handlers.splice(i, 1)
    }
  }

  private abortAll(err: Error): void {
    const rejects = [...this.pendingRejects]
    this.pendingRejects.clear()
    for (const rej of rejects) rej(err)
  }

  // Wait for a single message matching predicate; rejects immediately on disconnect
  private once(predicate: (m: string) => boolean, timeoutMs = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
      let unsub: () => void

      const rejectFn = (err: Error) => {
        clearTimeout(timer)
        unsub?.()
        this.pendingRejects.delete(rejectFn)
        reject(err)
      }
      this.pendingRejects.add(rejectFn)

      const timer = setTimeout(() => rejectFn(new Error('BLE timeout')), timeoutMs)

      unsub = this.subscribe((msg) => {
        if (predicate(msg)) {
          clearTimeout(timer)
          unsub()
          this.pendingRejects.delete(rejectFn)
          resolve(msg)
        }
      })
    })
  }

  async connect(): Promise<void> {
    if (this.isConnected) this.server?.disconnect()

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [NUS_SERVICE_UUID],
    })

    device.addEventListener('gattserverdisconnected', () => {
      const err = new Error('Połączenie utracone')
      // Abort all pending BLE promises immediately instead of waiting for timeouts
      this.abortAll(err)
      this.handlers = []
      this.liveUnsub = null
      this.server = null
      this.txChar = null
      this.rxChar = null
      this.writeQueue = Promise.resolve()
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
    const result = this.writeQueue.then(() => {
      if (!this.rxChar) throw new Error('Not connected')
      return this.rxChar.writeValue(new TextEncoder().encode(cmd))
    })
    this.writeQueue = result.catch(() => {})
    return result
  }

  // ── Commands ──────────────────────────────────────────────────────────

  async getInfo() {
    const reply = this.once((m) => m.startsWith('INFO:'))
    await this.send('INFO')
    return parseInfo(await reply)
  }

  async getStatus(): Promise<DeviceStatus | null> {
    const reply = this.once((m) => m.startsWith('BAT:'))
    await this.send('STATUS')
    return parseStatus(await reply)
  }

  async getConfig(): Promise<DeviceConfig | null> {
    const reply = this.once((m) => m.startsWith('CFG:'))
    await this.send('GET_CFG')
    return parseConfig(await reply)
  }

  async setConfig(cfg: DeviceConfig): Promise<void> {
    const reply = this.once((m) => m === 'CFG:SAVED' || m === 'CFG:ERROR')
    await this.send(buildSetCfg(cfg))
    await reply
  }

  async syncTime(): Promise<void> {
    const ts = Math.floor(Date.now() / 1000)
    const reply = this.once((m) => m === 'TIME_OK', 3000)
    await this.send(`TIME:${ts}`)
    await reply
  }

  async calibrate(): Promise<'ok' | 'error'> {
    const reply = this.once((m) => m.startsWith('CALIBRATE'))
    await this.send('CALIBRATE')
    const msg = await reply
    return msg === 'CALIBRATE_OK' ? 'ok' : 'error'
  }

  async erase(): Promise<void> {
    const reply = this.once((m) => m === 'ERASE:DONE', 30_000)
    await this.send('ERASE')
    await reply
  }

  async format(): Promise<void> {
    const reply = this.once((m) => m === 'FORMAT_OK', 30_000)
    await this.send('FORMAT')
    await reply
  }

  async sleep(): Promise<void> {
    await this.send('SLEEP')
  }

  async toggleSession(): Promise<'started' | 'stopped'> {
    const reply = this.once((m) => m.startsWith('SESSION_START') || m.startsWith('SESSION_END'), 5000)
    await this.send('TEST')
    const msg = await reply
    return msg.startsWith('SESSION_START') ? 'started' : 'stopped'
  }

  // ── Session dump ──────────────────────────────────────────────────────

  dumpHistoricalSession(
    sessionId: number,
    onRecord: (r: LogRecord) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let unsub: () => void

      const rejectFn = (err: Error) => {
        clearTimeout(timer)
        unsub?.()
        this.pendingRejects.delete(rejectFn)
        reject(err)
      }
      this.pendingRejects.add(rejectFn)

      const timer = setTimeout(
        () => rejectFn(new Error(`DUMP timeout dla sesji ${sessionId}`)),
        60_000,
      )

      unsub = this.subscribe((msg) => {
        if (msg === 'DUMP_END') {
          clearTimeout(timer)
          unsub()
          this.pendingRejects.delete(rejectFn)
          resolve()
          return
        }
        const rec = parseRecord(msg)
        if (rec) onRecord(rec)
      })

      this.send(`DUMP:${sessionId}`).catch(rejectFn)
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
