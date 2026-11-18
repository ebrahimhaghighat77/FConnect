import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/types'

export const RELEASES_URL = 'https://github.com/ebrahimhaghighat77/FConnect/releases/latest'
const EVERY = 6 * 3600 * 1000

function short(e: unknown): string {
  const text = (e as Error)?.message?.split('\n')[0] ?? String(e)
  return text.length > 140 ? `${text.slice(0, 140)}…` : text
}

export class Updater {
  state: UpdateState = { status: 'idle', current: app.getVersion(), portable: !!process.env.PORTABLE_EXECUTABLE_FILE }
  private timer?: NodeJS.Timeout

  constructor(
    private changed: () => void,
    private log: (text: string) => void,
    private tunnelPort: () => number | undefined
  ) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.logger = null
    if (!app.isPackaged && process.env.FC_UPDATE_FEED) {
      autoUpdater.forceDevUpdateConfig = true
      autoUpdater.setFeedURL({ provider: 'generic', url: process.env.FC_UPDATE_FEED })
    }
    autoUpdater.on('error', (e) => this.log(`Update: ${short(e)}`))
    autoUpdater.on('download-progress', (p) => {
      const percent = Math.floor(p.percent)
      if (percent !== this.state.percent) this.set({ status: 'downloading', percent })
    })
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.changed()
  }

  private async route<T>(fn: () => Promise<T>): Promise<T> {
    const ses = autoUpdater.netSession
    await ses.setProxy({ mode: 'system' })
    try {
      return await fn()
    } catch (e) {
      const port = this.tunnelPort()
      if (!port) throw e
      this.log('Update: GitHub did not answer directly, trying through the tunnel')
      await ses.setProxy({ proxyRules: `http://127.0.0.1:${port}` })
      return fn()
    }
  }

  auto(on: boolean): void {
    clearTimeout(this.timer)
    if (!on) return
    const tick = () => {
      void this.check()
      this.timer = setTimeout(tick, EVERY)
    }
    this.timer = setTimeout(tick, 15000)
  }

  async check(): Promise<void> {
    if (['checking', 'downloading', 'ready'].includes(this.state.status)) return
    this.set({ status: 'checking', error: undefined })
    try {
      const r = await this.route(() => autoUpdater.checkForUpdates())
      if (!r) throw new Error('Updates only work in the installed app')
      const info = r.isUpdateAvailable ? r.updateInfo : undefined
      this.set(
        info
          ? { status: 'available', version: info.version, size: info.files.find((f) => f.url.endsWith('.exe'))?.size }
          : { status: 'latest', version: undefined, size: undefined }
      )
    } catch (e) {
      this.set({ status: 'error', version: undefined, error: `Couldn't check for updates: ${short(e)}` })
    }
  }

  async download(): Promise<void> {
    if (!this.state.version || this.state.portable || ['downloading', 'ready'].includes(this.state.status)) return
    this.set({ status: 'downloading', percent: 0, error: undefined })
    try {
      await this.route(() => autoUpdater.downloadUpdate())
      this.set({ status: 'ready' })
    } catch (e) {
      this.set({ status: 'error', error: `Download failed: ${short(e)}` })
    }
  }

  install(): void {
    autoUpdater.quitAndInstall(true, true)
  }
}
