import http from 'node:http'
import type { AppEntry, Peer, Profile, Quality, Traffic, TunnelState } from '../shared/types'
import { binDir, Core, freePort, portOpen, waitFor, type LogSink } from './core/cores'
import { proxifyreConfig } from './core/proxifyreConfig'
import { QualityProbe } from './core/quality'
import { singboxOutbound, socksBackendConfig } from './core/singboxConfig'
import { appTag, xrayTunnelConfig, type TunnelPorts } from './core/xrayConfig'
import { runDir } from './store'

export type AppStats = Record<string, { up: number; down: number; total: number; peers: Peer[] }>

export interface TunnelEvents {
  state: (s: TunnelState) => void
  traffic: (t: Traffic) => void
  stats: (s: AppStats) => void
  quality: (q: Quality | null) => void
  log: LogSink
  nextProfile: (current: Profile) => Promise<Profile | undefined>
  switched: (p: Profile) => void
}

export interface TunnelOptions {
  verbose: () => boolean
  killSwitch: () => boolean
  failover: () => boolean
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ACCESS = /accepted (tcp|udp):(\[[^\]]+\]|[^\s:]+):(\d+) \[(app:[^\s\]]+)/
const IPV4 = /^\d+\.\d+\.\d+\.\d+$/

export class Tunnel {
  state: TunnelState = { status: 'disconnected' }
  private readonly xray: Core
  private readonly singbox: Core
  private readonly proxifyre: Core
  private profile?: Profile
  private base?: { probe: number; metrics: number; native?: number }
  private appPorts = new Map<string, number>()
  private apps: AppEntry[] = []
  private timers: NodeJS.Timeout[] = []
  private last?: { at: number; bytes: Record<string, { up: number; down: number }> }
  private totals: Record<string, number> = {}
  private peers = new Map<string, Map<string, Peer>>()
  private places = new Map<string, { country?: string; place?: string }>()
  private probe?: QualityProbe
  private recovering = false
  private pendingApps?: AppEntry[]
  private preferred?: Profile
  private sampling = false

  constructor(
    private readonly ev: TunnelEvents,
    private readonly opt: TunnelOptions
  ) {
    this.xray = new Core('xray', ev.log)
    this.singbox = new Core('sing-box', ev.log)
    this.proxifyre = new Core('proxifyre', ev.log)
  }

  get proxyPort(): number | undefined {
    return this.state.status === 'connected' ? this.base?.probe : undefined
  }

  get live(): boolean {
    return this.state.status === 'connected' || this.state.status === 'reconnecting'
  }

  private set(s: Partial<TunnelState>, replace = false): void {
    this.state = replace ? (s as TunnelState) : { ...this.state, ...s }
    this.ev.state(this.state)
  }

  async connect(profile: Profile, apps: AppEntry[]): Promise<void> {
    if (this.state.status !== 'disconnected') return
    this.set({ status: 'connecting', profileId: profile.id }, true)
    try {
      this.base = { probe: await freePort(), metrics: await freePort() }
      this.totals = {}
      this.peers.clear()
      await this.assignPorts(apps)
      await this.startEngine(profile)
      await this.startRedirect()
      this.probe = new QualityProbe(this.base.probe)
      this.set({ status: 'connected', since: Date.now(), ping: null })
      this.startMonitors()
    } catch (e) {
      await this.stopAll()
      this.set({ status: 'disconnected', error: (e as Error).message }, true)
    }
  }

  async apply(apps: AppEntry[]): Promise<void> {
    if (this.recovering) this.pendingApps = apps
    if (!this.live || this.recovering) return
    try {
      await this.assignPorts(apps)
      await this.proxifyre.stop()
      await this.startEngine(this.profile!)
      await this.startRedirect()
    } catch (e) {
      void this.recover((e as Error).message)
    }
  }

  async switchTo(profile: Profile): Promise<void> {
    if (!this.live) return
    if (this.recovering) {
      this.preferred = profile
      return
    }
    try {
      await this.startEngine(profile)
      this.set({ profileId: profile.id, ping: null })
    } catch (e) {
      void this.recover((e as Error).message)
    }
  }

  async devStop(engine: 'xray' | 'proxifyre'): Promise<void> {
    await (engine === 'xray' ? this.xray : this.proxifyre).stop()
  }

  async disconnect(): Promise<void> {
    if (this.state.status === 'disconnected' || this.state.status === 'disconnecting') return
    this.set({ status: 'disconnecting' })
    await this.stopAll()
    this.set({ status: 'disconnected' }, true)
  }

  private async assignPorts(apps: AppEntry[]): Promise<void> {
    this.apps = apps
    for (const a of apps) if (!this.appPorts.has(a.id)) this.appPorts.set(a.id, await freePort())
  }

  private ports(): TunnelPorts {
    return { ...this.base!, apps: this.apps.map((a) => ({ id: a.id, port: this.appPorts.get(a.id)! })) }
  }

  private async startEngine(profile: Profile): Promise<void> {
    await this.stopEngine()
    if (profile.engine === 'sing-box') {
      this.base!.native = await freePort()
      const native = this.base!.native
      await this.singbox.start('backend', socksBackendConfig(singboxOutbound(profile.node!, 'proxy'), native, this.opt.verbose()), runDir)
      await waitFor(() => portOpen(native), this.singbox)
    } else {
      this.base!.native = undefined
    }
    await this.xray.start('xray', xrayTunnelConfig(profile, this.ports(), this.opt.verbose()), runDir)
    this.xray.onData((line) => this.onAccess(line))
    await waitFor(() => portOpen(this.base!.probe), this.xray)
    this.profile = profile
    this.ev.log('app', `${profile.name} ready on ${profile.engine === 'sing-box' ? 'sing-box + Xray' : 'Xray'}, ${this.apps.length} apps`)
  }

  private async stopEngine(): Promise<void> {
    await this.xray.stop()
    await this.singbox.stop()
  }

  private async startRedirect(): Promise<void> {
    if (!this.apps.length) return
    const rules = this.apps.map((app) => ({ app, port: this.appPorts.get(app.id)! }))
    await this.proxifyre.start('proxifyre', proxifyreConfig(rules, [binDir, runDir], this.opt.verbose()), runDir)
    await sleep(1200)
    if (!this.proxifyre.alive) throw this.proxifyre.failure()
  }

  private async stopAll(): Promise<void> {
    this.stopMonitors()
    await this.proxifyre.stop()
    await this.stopEngine()
  }

  private deadCore(): Core | undefined {
    const needed = [this.xray, ...(this.base?.native ? [this.singbox] : []), ...(this.apps.length ? [this.proxifyre] : [])]
    return needed.find((c) => !c.alive)
  }

  private async holdApps(): Promise<void> {
    if (!this.opt.killSwitch() || !this.apps.length || this.proxifyre.alive) return
    await this.startRedirect().catch((e) => this.ev.log('app', `kill switch could not restart ProxiFyre: ${(e as Error).message}`))
  }

  private async recover(reason: string, serverDown = false): Promise<void> {
    if (this.recovering || !this.live) return
    this.recovering = true
    const hold = this.opt.killSwitch()
    this.ev.log('app', `tunnel problem: ${reason}`)
    this.set({
      status: 'reconnecting',
      ping: null,
      note: hold ? 'Your picked apps are paused until the tunnel is back.' : 'Your picked apps use your normal connection until the tunnel is back.'
    })
    if (hold) await this.holdApps()
    else await this.proxifyre.stop()
    const original = this.profile!
    for (let attempt = serverDown && this.opt.failover() ? 1 : 0; this.state.status === 'reconnecting'; attempt++) {
      if (hold) await this.holdApps()
      const chosen = this.preferred
      this.preferred = undefined
      let candidate = chosen ?? this.profile!
      if (!chosen && attempt > 0 && this.opt.failover()) candidate = (await this.ev.nextProfile(this.profile!)) ?? this.profile!
      try {
        await this.startEngine(candidate)
        if (this.state.status !== 'reconnecting') {
          await this.stopAll()
          break
        }
        if (this.apps.length && !this.proxifyre.alive) await this.startRedirect()
        const ms = (await this.probe!.sample(4000)) ?? (await this.probe!.sample(4000))
        if (ms !== null && this.state.status === 'reconnecting') {
          if (candidate.id !== original.id && !chosen) this.ev.switched(candidate)
          this.set({ status: 'connected', profileId: candidate.id, ping: ms, note: undefined })
          break
        }
      } catch (e) {
        this.ev.log('app', `reconnect failed: ${(e as Error).message}`)
      }
      await sleep(Math.min(10000, 2000 * (attempt + 1)))
    }
    this.recovering = false
    const pending = this.pendingApps
    this.pendingApps = undefined
    if (pending && this.state.status === 'connected') await this.apply(pending)
  }

  private onAccess(line: string): void {
    const m = ACCESS.exec(line)
    if (!m) return
    const id = m[4].slice('app:'.length)
    const host = m[2].replace(/^\[|\]$/g, '')
    const key = `${m[1]}:${host}:${m[3]}`
    let map = this.peers.get(id)
    if (!map) this.peers.set(id, (map = new Map()))
    const peer = map.get(key) ?? { host, port: Number(m[3]), network: m[1] as Peer['network'], hits: 0, last: 0 }
    peer.hits++
    peer.last = Date.now()
    map.set(key, peer)
    if (map.size > 60) map.delete([...map.entries()].sort((a, b) => a[1].last - b[1].last)[0][0])
  }

  private lookupPlaces(): void {
    const ips = [...new Set([...this.peers.values()].flatMap((m) => [...m.values()].map((p) => p.host)))]
      .filter((h) => IPV4.test(h) && !this.places.has(h))
      .slice(0, 50)
    if (!ips.length || !this.base) return
    ips.forEach((ip) => this.places.set(ip, {}))
    const body = JSON.stringify(ips)
    const req = http.request(
      {
        host: '127.0.0.1',
        port: this.base.probe,
        method: 'POST',
        path: 'http://ip-api.com/batch?fields=query,countryCode,city,isp',
        headers: { Host: 'ip-api.com', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 8000
      },
      (res) => {
        let text = ''
        res.on('data', (c) => (text += c))
        res.on('end', () => {
          try {
            for (const r of JSON.parse(text)) this.places.set(r.query, { country: r.countryCode, place: [r.city, r.isp].filter(Boolean).join(', ') })
          } catch {
            ips.forEach((ip) => this.places.delete(ip))
          }
        })
      }
    )
    req.on('timeout', () => req.destroy())
    req.on('error', () => ips.forEach((ip) => this.places.delete(ip)))
    req.end(body)
  }

  private bytes(): Promise<Record<string, { up: number; down: number }> | undefined> {
    return new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port: this.base?.metrics, path: '/debug/vars', timeout: 2000 }, (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          try {
            const inbound = JSON.parse(body).stats?.inbound ?? {}
            const out: Record<string, { up: number; down: number }> = {}
            for (const a of this.apps) {
              const s = inbound[appTag(a.id)]
              out[a.id] = { up: s?.uplink ?? 0, down: s?.downlink ?? 0 }
            }
            resolve(out)
          } catch {
            resolve(undefined)
          }
        })
      })
      req.on('timeout', () => req.destroy())
      req.on('error', () => resolve(undefined))
    })
  }

  private async sampleStats(): Promise<void> {
    const now = await this.bytes()
    if (!now) return
    const at = Date.now()
    const dt = this.last ? Math.max(0.5, (at - this.last.at) / 1000) : 1
    const stats: AppStats = {}
    let up = 0
    let down = 0
    for (const [id, b] of Object.entries(now)) {
      const prev = this.last?.bytes[id]
      const dUp = prev && b.up >= prev.up ? b.up - prev.up : prev ? b.up : 0
      const dDown = prev && b.down >= prev.down ? b.down - prev.down : prev ? b.down : 0
      this.totals[id] = (this.totals[id] ?? 0) + dUp + dDown
      const peers = [...(this.peers.get(id)?.values() ?? [])]
        .sort((x, y) => y.last - x.last)
        .slice(0, 8)
        .map((p) => ({ ...p, ...this.places.get(p.host) }))
      stats[id] = { up: Math.round(dUp / dt), down: Math.round(dDown / dt), total: this.totals[id], peers }
      up += stats[id].up
      down += stats[id].down
    }
    this.last = { at, bytes: now }
    this.ev.stats(stats)
    this.ev.traffic({ up, down })
  }

  private async sampleQuality(): Promise<void> {
    if (this.sampling || this.recovering || this.state.status !== 'connected' || !this.probe) return
    this.sampling = true
    try {
      const ms = await this.probe.sample()
      if (this.state.status !== 'connected' || this.recovering) return
      const q = this.probe.quality()
      this.ev.quality(q)
      if (ms !== null && (this.state.ping == null || Math.abs(ms - this.state.ping) > 25)) this.set({ ping: ms })
      if (this.probe.failuresInRow() >= 3) void this.recover(`${this.profile?.name} stopped responding`, true)
    } finally {
      this.sampling = false
    }
  }

  private startMonitors(): void {
    this.timers.push(
      setInterval(() => {
        if (this.recovering) return
        const dead = this.deadCore()
        if (dead) return void this.recover(dead.failure().message)
        void this.sampleStats()
      }, 1000)
    )
    this.timers.push(setTimeout(() => void this.sampleQuality(), 500))
    this.timers.push(setInterval(() => void this.sampleQuality(), 3000))
    this.timers.push(setInterval(() => this.lookupPlaces(), 10000))
  }

  private stopMonitors(): void {
    this.timers.forEach((t) => clearInterval(t))
    this.timers = []
    this.probe?.close()
    this.probe = undefined
    this.last = undefined
    this.appPorts.clear()
    this.ev.traffic({ up: 0, down: 0 })
    this.ev.stats({})
    this.ev.quality(null)
  }
}
