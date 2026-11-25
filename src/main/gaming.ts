import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { GamingState } from '../shared/types'

const exec = promisify(execFile)
const UX_KEY = 'HKLM\\SOFTWARE\\Microsoft\\WindowsUpdate\\UX\\Settings'
const DOWNLOADERS = ['DoSvc', 'BITS']
const HOLD_MS = 3 * 3600_000
const REFRESH_MS = 30 * 60_000
const GRACE_MS = 30_000

const stamp = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z')

export function pauseEntries(now: number): [string, string][] {
  const start = stamp(now)
  const end = stamp(now + HOLD_MS)
  return [
    ['PauseUpdatesStartTime', start],
    ['PauseUpdatesExpiryTime', end],
    ['PauseFeatureUpdatesStartTime', start],
    ['PauseFeatureUpdatesEndTime', end],
    ['PauseQualityUpdatesStartTime', start],
    ['PauseQualityUpdatesEndTime', end]
  ]
}

export function regValue(output: string, name: string): string | undefined {
  return new RegExp(`^\\s*${name}\\s+REG_SZ\\s+(.+?)\\s*$`, 'm').exec(output)?.[1]
}

async function readExpiry(): Promise<string | undefined> {
  try {
    const { stdout } = await exec('reg.exe', ['query', UX_KEY, '/v', 'PauseUpdatesExpiryTime'], { windowsHide: true })
    return regValue(stdout, 'PauseUpdatesExpiryTime')
  } catch {
    return undefined
  }
}

const reg = (...args: string[]) => exec('reg.exe', args, { windowsHide: true, timeout: 10000 })

export class GamingMode {
  state: GamingState = { active: false }
  private lastSeen = 0
  private timer?: NodeJS.Timeout
  private refreshed = 0
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private changed: () => void,
    private log: (text: string) => void,
    private marker: { get: () => string | undefined; set: (v: string | undefined) => void }
  ) {}

  private set(next: GamingState): void {
    this.state = next
    this.changed()
  }

  private serial(fn: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(fn, fn)
    return this.queue
  }

  update(game: string | undefined): void {
    if (game) {
      this.lastSeen = Date.now()
      if (!this.state.active) void this.serial(() => this.activate(game))
      else if (this.state.game !== game) this.set({ ...this.state, game })
    } else if (this.state.active && Date.now() - this.lastSeen > GRACE_MS) {
      void this.release()
    }
  }

  private async activate(game: string): Promise<void> {
    if (this.state.active) return
    this.set({ active: true, game })
    const errors: string[] = []
    try {
      await this.pauseUpdates()
    } catch (e) {
      const why = ((e as { stderr?: string }).stderr || (e as Error).message).split('\n')[0].replace(/^ERROR:\s*/, '').trim()
      errors.push(`Couldn't pause Windows Update: ${why}`)
    }
    await this.stopDownloaders()
    this.timer = setInterval(() => void this.tick(), 10_000)
    this.log(`Gaming mode: ${game} started, Windows Update and background downloads are on hold`)
    if (errors.length) this.set({ ...this.state, error: errors.join('. ') })
  }

  private async pauseUpdates(): Promise<void> {
    const current = await readExpiry()
    if (current && current !== this.marker.get() && Date.parse(current) > Date.now()) return
    const entries = pauseEntries(Date.now())
    for (const [name, value] of entries) await reg('add', UX_KEY, '/v', name, '/t', 'REG_SZ', '/d', value, '/f')
    this.marker.set(entries[1][1])
    this.refreshed = Date.now()
  }

  private async stopDownloaders(): Promise<void> {
    for (const svc of DOWNLOADERS) await exec('sc.exe', ['stop', svc], { windowsHide: true, timeout: 10000 }).catch(() => undefined)
  }

  private async tick(): Promise<void> {
    await this.stopDownloaders()
    if (this.marker.get() && Date.now() - this.refreshed > REFRESH_MS) await this.pauseUpdates().catch(() => undefined)
  }

  release(): Promise<void> {
    return this.serial(async () => {
      clearInterval(this.timer)
      this.timer = undefined
      await this.unpause()
      if (this.state.active) this.log('Gaming mode: game closed, downloads are back to normal')
      if (this.state.active || this.state.error) this.set({ active: false })
    })
  }

  private async unpause(): Promise<void> {
    const ours = this.marker.get()
    if (!ours) return
    if ((await readExpiry()) === ours) {
      const now = stamp(Date.now())
      for (const [name] of pauseEntries(0)) {
        await reg('delete', UX_KEY, '/v', name, '/f').catch(() =>
          /(Expiry|End)Time$/.test(name) ? reg('add', UX_KEY, '/v', name, '/t', 'REG_SZ', '/d', now, '/f').catch(() => undefined) : undefined
        )
      }
    }
    this.marker.set(undefined)
  }
}
