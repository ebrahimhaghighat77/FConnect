import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, net, Notification, protocol, session, shell, Tray } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  AppActivity,
  AppEntry,
  ImportSummary,
  LogLine,
  Profile,
  RunningProcess,
  Settings,
  Snapshot,
  Subscription,
  ToggleSetting
} from '../shared/types'
import { setLaunchAtLogin } from './autostart'
import { driverInstalled, installDriver, isElevated, killStaleCores, readSystemProxy } from './core/cores'
import { parseImport, pickEngine, type ImportResult } from './core/links'
import { customFromExe, customFromFolder, detectApps, imageFiles, runningProcesses } from './detect'
import { testProfiles } from './ping'
import { data, save } from './store'
import { Tunnel, type AppStats } from './tunnel'
import { RELEASES_URL, Updater } from './updater'
import { matchesApp, ProcessWatcher } from './watcher'

protocol.registerSchemesAsPrivileged([{ scheme: 'fc-img', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

const replacing = process.argv.includes('--replace')

async function acquireLock(): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    if (app.requestSingleInstanceLock()) return true
    if (!replacing) return false
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

for (const p of data.profiles) if (p.node) p.engine = pickEngine(p.node)

let win: BrowserWindow | null = null
let tray: Tray | null = null
let apps: AppEntry[] = []
let elevated = false
let driver = false
let installing = false
let quitting = false
let applyTimer: NodeJS.Timeout | undefined
let showOnReady = !process.argv.includes('--hidden')
const testing = new Set<string>()
const logs: LogLine[] = []

const DEFAULTS: Record<ToggleSetting, boolean> = {
  verbose: false,
  killSwitch: true,
  autoConnect: true,
  autoServer: true,
  failover: true,
  launchAtLogin: false,
  autoUpdate: true
}
const setting = (k: ToggleSetting): boolean => data.settings[k] ?? DEFAULTS[k]

let appStats: AppStats = {}
let runningIds = new Set<string>()
let autoSession = false
let suppressAuto = false
let lastGameSeen = 0

const tunnel = new Tunnel(
  {
    state: () => {
      broadcast()
      syncWatcher()
    },
    traffic: (t) => send('fc:traffic', t),
    stats: (s) => {
      appStats = s
      sendActivity()
    },
    quality: (q) => send('fc:quality', q),
    log: (src, text) => pushLog(src, text),
    nextProfile: (current) => bestProfile(current.id),
    switched: (p) => {
      data.settings.activeProfileId = p.id
      save()
      broadcast()
      notify('Switched server', `${p.name} took over because the previous server stopped responding.`)
    }
  },
  { verbose: () => setting('verbose'), killSwitch: () => setting('killSwitch'), failover: () => setting('failover') }
)

const updater = new Updater(
  () => broadcast(),
  (text) => pushLog('app', text),
  () => tunnel.proxyPort
)

const watcher = new ProcessWatcher((paths) => {
  const selected = selectedApps()
  runningIds = new Set(selected.filter((a) => paths.some((p) => matchesApp(a, p))).map((a) => a.id))
  sendActivity()
  autoConnectTick(selected)
})

function syncWatcher(): void {
  if (setting('autoConnect') || tunnel.live) watcher.start()
  else watcher.stop()
}

function sendActivity(): void {
  const out: Record<string, AppActivity> = {}
  for (const id of data.settings.selectedApps) {
    const s = appStats[id]
    out[id] = { running: runningIds.has(id), up: s?.up ?? 0, down: s?.down ?? 0, total: s?.total ?? 0, peers: s?.peers ?? [] }
  }
  send('fc:activity', out)
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) new Notification({ title, body, icon: iconPath, silent: true }).show()
}

function autoConnectTick(selected: AppEntry[]): void {
  if (!setting('autoConnect')) return
  const games = selected.filter((a) => a.kind === 'game' && runningIds.has(a.id))
  if (games.length) lastGameSeen = Date.now()
  else suppressAuto = false
  if (games.length && tunnel.state.status === 'disconnected' && !suppressAuto && !installing && activeProfile() && elevated) {
    autoSession = true
    void connect()
      .then(() => tunnel.state.status === 'connected' && notify('FConnect connected', `${games[0].name} started, so its traffic now goes through the tunnel.`))
      .catch(() => undefined)
  }
  if (!games.length && autoSession && tunnel.live && Date.now() - lastGameSeen > 45000) {
    autoSession = false
    void tunnel.disconnect().then(() => notify('FConnect disconnected', 'Your games are closed, so the tunnel was turned off.'))
  }
}

async function bestProfile(excludeId?: string): Promise<Profile | undefined> {
  const candidates = data.profiles.filter((p) => p.id !== excludeId)
  if (!candidates.length) return undefined
  candidates.forEach((p) => testing.add(p.id))
  broadcast()
  await testProfiles(candidates, (id, ms) => {
    const p = data.profiles.find((x) => x.id === id)
    if (p) p.ping = ms
    testing.delete(id)
    broadcast()
  })
  save()
  return candidates.filter((p) => (p.ping ?? -1) >= 0).sort((a, b) => a.ping! - b.ping!)[0]
}

function snapshot(): Snapshot {
  return {
    profiles: data.profiles,
    subscriptions: data.subscriptions,
    settings: data.settings,
    apps,
    tunnel: tunnel.state,
    elevated,
    driver,
    systemProxy,
    testing: [...testing],
    update: updater.state
  }
}

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function broadcast(): void {
  send('fc:state', snapshot())
  updateTray()
}

function pushLog(src: LogLine['src'], text: string): void {
  const line = { t: Date.now(), src, text }
  logs.push(line)
  if (logs.length > 600) logs.shift()
  send('fc:log', line)
}

const selectedApps = (): AppEntry[] => apps.filter((a) => data.settings.selectedApps.includes(a.id))
const activeProfile = () => data.profiles.find((p) => p.id === data.settings.activeProfileId)

function addProfiles(r: ImportResult, subId?: string): ImportSummary {
  for (const p of r.profiles) data.profiles.push({ ...p, subId })
  if (!activeProfile() && data.profiles[0]) data.settings.activeProfileId = data.profiles[0].id
  save()
  broadcast()
  return { added: r.profiles.length, errors: r.errors }
}

async function fetchSubscription(url: string): Promise<Response> {
  const headers = { 'User-Agent': 'v2rayN/7.0' }
  const get = async (fetcher: typeof net.fetch): Promise<Response> => {
    const res = await fetcher(url, { headers })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res
  }
  try {
    return await get(net.fetch)
  } catch (e) {
    const port = tunnel.proxyPort
    if (!port) throw e
    const ses = session.fromPartition('fc-proxy')
    await ses.setProxy({ proxyRules: `http://127.0.0.1:${port}` })
    return get(ses.fetch.bind(ses))
  }
}

function readSubHeaders(sub: Subscription, res: Response): void {
  const info = Object.fromEntries(
    (res.headers.get('subscription-userinfo') ?? '').split(';').map((kv) => kv.trim().split('=').map((s) => s.trim()))
  )
  const num = (k: string) => (info[k] !== undefined && Number.isFinite(Number(info[k])) ? Number(info[k]) : undefined)
  sub.used = (num('upload') ?? 0) + (num('download') ?? 0) || undefined
  sub.total = num('total') || undefined
  sub.expire = num('expire') ? num('expire')! * 1000 : undefined
  const title = res.headers.get('profile-title')
  if (title) sub.name = title.startsWith('base64:') ? Buffer.from(title.slice(7), 'base64').toString('utf8') : title
}

async function refreshSubscription(sub: Subscription): Promise<ImportSummary> {
  const res = await fetchSubscription(sub.url)
  readSubHeaders(sub, res)
  const r = parseImport(await res.text())
  if (!r.profiles.length) throw new Error(r.errors[0] ?? 'subscription is empty')
  const active = activeProfile()
  data.profiles = data.profiles.filter((p) => p.subId !== sub.id)
  sub.updatedAt = Date.now()
  const summary = addProfiles(r, sub.id)
  if (active?.subId === sub.id) {
    const same = data.profiles.find((p) => p.subId === sub.id && p.name === active.name && p.address === active.address)
    data.settings.activeProfileId = same?.id ?? data.profiles[0]?.id
    save()
    broadcast()
  }
  return summary
}

function scheduleApply(): void {
  clearTimeout(applyTimer)
  applyTimer = setTimeout(() => void tunnel.apply(selectedApps()), 600)
}

async function rescan(): Promise<void> {
  apps = await detectApps(data.customApps)
  broadcast()
}

// Older versions had no Claude preset, so people added claude.exe and friends by hand; fold those into the preset.
function absorbCustomIntoPresets(): void {
  const presets = apps.filter((a) => a.source === 'preset')
  const owner = (c: AppEntry) =>
    !c.folders.length && c.processNames.length
      ? presets.find((p) => c.processNames.every((n) => p.processNames.some((pn) => pn.toLowerCase() === n.toLowerCase())))
      : undefined
  const absorbed = data.customApps.filter((c) => owner(c))
  if (!absorbed.length) return
  const selected = new Set(data.settings.selectedApps)
  for (const c of absorbed) {
    if (selected.delete(c.id)) selected.add(owner(c)!.id)
  }
  data.customApps = data.customApps.filter((c) => !absorbed.includes(c))
  data.settings.selectedApps = [...selected]
  apps = apps.filter((a) => !absorbed.some((c) => c.id === a.id))
  save()
  pushLog('app', `merged ${absorbed.map((c) => c.name).join(', ')} into their presets`)
}

let systemProxy: string | undefined
async function refreshSystemProxy(): Promise<void> {
  const next = await readSystemProxy()
  if (next !== systemProxy) {
    systemProxy = next
    broadcast()
  }
}

async function connect(): Promise<void> {
  if (!activeProfile()) throw new Error('Add a server first')
  if (!elevated) throw new Error('FConnect needs administrator rights to redirect your apps')
  if (!driver) {
    if (installing) return
    installing = true
    tunnel.state = { status: 'connecting', note: 'Installing the Windows Packet Filter driver (one time)…' }
    broadcast()
    try {
      pushLog('app', 'installing Windows Packet Filter driver')
      await installDriver()
      driver = true
      pushLog('app', 'driver installed')
    } catch (e) {
      tunnel.state = { status: 'disconnected', error: (e as Error).message }
      broadcast()
      return
    } finally {
      installing = false
    }
    tunnel.state = { status: 'disconnected' }
  }
  if (setting('autoServer') && data.profiles.length > 1) {
    tunnel.state = { status: 'connecting', note: 'Finding the fastest server…' }
    broadcast()
    const best = await bestProfile()
    tunnel.state = { status: 'disconnected' }
    if (best) {
      data.settings.activeProfileId = best.id
      save()
    }
  }
  await tunnel.connect(activeProfile()!, selectedApps())
}

async function userConnect(): Promise<void> {
  autoSession = false
  await connect()
}

async function userDisconnect(): Promise<void> {
  autoSession = false
  if (runningIds.size && selectedApps().some((a) => a.kind === 'game' && runningIds.has(a.id))) suppressAuto = true
  await tunnel.disconnect()
}

function addCustom(entry: AppEntry): void {
  data.customApps.push(entry)
  data.settings.selectedApps.push(entry.id)
  save()
  void rescan().then(() => tunnel.live && scheduleApply())
}

const handlers: Record<string, (...args: any[]) => unknown> = {
  snapshot,
  importText: (text: string) => addProfiles(parseImport(text)),
  importClipboard: async () => addProfiles(parseImport(await clipboard.readText())),
  importFile: async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Choose config files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Configs', extensions: ['conf', 'json', 'txt'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (res.canceled || !res.filePaths.length) return null
    const all: ImportResult = { profiles: [], errors: [] }
    for (const path of res.filePaths) {
      const r = parseImport(await readFile(path, 'utf8'), basename(path, extname(path)))
      all.profiles.push(...r.profiles)
      all.errors.push(...r.errors.map((e) => `${basename(path)}: ${e}`))
    }
    return addProfiles(all)
  },
  addSubscription: async (url: string) => {
    const sub: Subscription = { id: randomUUID(), name: new URL(url).hostname, url }
    data.subscriptions.push(sub)
    try {
      return await refreshSubscription(sub)
    } catch (e) {
      data.subscriptions = data.subscriptions.filter((s) => s.id !== sub.id)
      save()
      broadcast()
      throw e
    }
  },
  updateSubscription: (id: string) => {
    const sub = data.subscriptions.find((s) => s.id === id)
    if (!sub) throw new Error('subscription not found')
    return refreshSubscription(sub)
  },
  removeSubscription: (id: string) => {
    data.subscriptions = data.subscriptions.filter((s) => s.id !== id)
    data.profiles = data.profiles.filter((p) => p.subId !== id)
    if (!activeProfile()) data.settings.activeProfileId = data.profiles[0]?.id
    save()
    broadcast()
  },
  removeProfile: async (id: string) => {
    if (id === data.settings.activeProfileId) await tunnel.disconnect()
    data.profiles = data.profiles.filter((p) => p.id !== id)
    if (!activeProfile()) data.settings.activeProfileId = data.profiles[0]?.id
    save()
    broadcast()
  },
  renameProfile: (id: string, name: string) => {
    const p = data.profiles.find((x) => x.id === id)
    if (p && name.trim()) p.name = name.trim()
    save()
    broadcast()
  },
  selectProfile: async (id: string) => {
    const profile = data.profiles.find((p) => p.id === id)
    if (!profile) return
    data.settings.activeProfileId = id
    save()
    broadcast()
    if (tunnel.live) await tunnel.switchTo(profile)
  },
  testProfiles: async (ids: string[]) => {
    const targets = data.profiles.filter((p) => (ids.length ? ids.includes(p.id) : true) && !testing.has(p.id))
    targets.forEach((p) => testing.add(p.id))
    broadcast()
    await testProfiles(targets, (id, ms) => {
      const p = data.profiles.find((x) => x.id === id)
      if (p) p.ping = ms
      testing.delete(id)
      broadcast()
    })
    save()
  },
  toggleApp: (id: string, on: boolean) => {
    const set = new Set(data.settings.selectedApps)
    if (on) set.add(id)
    else set.delete(id)
    data.settings.selectedApps = [...set]
    save()
    broadcast()
    scheduleApply()
  },
  addCustomApp: async (mode: 'exe' | 'folder') => {
    const res = await dialog.showOpenDialog(win!, {
      title: mode === 'exe' ? 'Choose a program' : 'Choose a game or app folder',
      properties: mode === 'exe' ? ['openFile'] : ['openDirectory'],
      filters: mode === 'exe' ? [{ name: 'Programs', extensions: ['exe'] }] : undefined
    })
    const path = res.filePaths[0]
    if (res.canceled || !path) return
    const id = `custom-${randomUUID()}`
    addCustom(mode === 'exe' ? customFromExe(id, path) : customFromFolder(id, path))
  },
  addProcessApp: (p: RunningProcess) => addCustom(customFromExe(`custom-${randomUUID()}`, p.path)),
  removeCustomApp: (id: string) => {
    data.customApps = data.customApps.filter((a) => a.id !== id)
    data.settings.selectedApps = data.settings.selectedApps.filter((a) => a !== id)
    save()
    void rescan().then(() => tunnel.live && scheduleApply())
  },
  listProcesses: runningProcesses,
  rescanApps: rescan,
  connect: userConnect,
  disconnect: userDisconnect,
  logs: () => logs,
  setSetting: async (key: ToggleSetting, on: boolean) => {
    if (!(key in DEFAULTS)) throw new Error(`unknown setting ${key}`)
    if (key === 'launchAtLogin') await setLaunchAtLogin(on)
    if (key === 'autoUpdate') updater.auto(on)
    data.settings[key as keyof Settings] = on as never
    save()
    broadcast()
    syncWatcher()
  },
  checkUpdate: () => updater.check(),
  downloadUpdate: () => updater.download(),
  installUpdate: async () => {
    if (updater.state.status !== 'ready') return
    const game = tunnel.live && selectedApps().find((a) => a.kind === 'game' && runningIds.has(a.id))
    if (game) throw new Error(`Close ${game.name} first. Updating restarts FConnect, so the game would lose the tunnel for a moment.`)
    data.resumeAfterUpdate = tunnel.live || undefined
    save()
    quitting = true
    watcher.stop()
    await tunnel.disconnect()
    await killStaleCores()
    updater.install()
  },
  openReleases: () => shell.openExternal(RELEASES_URL)
}

if (!app.isPackaged) {
  handlers.devRelaunch = async () => {
    quitting = true
    await tunnel.disconnect()
    app.relaunch()
    app.exit(0)
  }
  handlers.devStop = (engine: 'xray' | 'proxifyre') => tunnel.devStop(engine)
  handlers.devQuit = () => setTimeout(() => app.quit(), 200)
  handlers.devAutostart = (on: boolean) => setLaunchAtLogin(on, { name: 'FConnect-devtest', exe: process.execPath })
}

for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(`fc:${name}`, (_e, ...args) => fn(...args))
ipcMain.on('fc:window', (_e, action: 'minimize' | 'close') => (action === 'minimize' ? win?.minimize() : win?.hide()))

const iconPath = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'resources', 'icon.png')

function showWindow(): void {
  if (!win) return createWindow()
  win.show()
  win.focus()
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 1000,
    minHeight: 660,
    frame: false,
    show: false,
    backgroundColor: '#0B0B12',
    icon: iconPath,
    title: 'FConnect',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true }
  })
  win.once('ready-to-show', () => {
    if (showOnReady) win?.show()
    showOnReady = true
  })
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win?.hide()
    }
  })
  win.on('closed', () => (win = null))
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function updateTray(): void {
  if (!tray) return
  const s = tunnel.state.status
  tray.setToolTip(`FConnect — ${s}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `FConnect: ${s}`, enabled: false },
      { type: 'separator' },
      tunnel.live
        ? { label: 'Disconnect', click: () => void userDisconnect() }
        : { label: 'Connect', enabled: s === 'disconnected', click: () => void userConnect().catch(() => undefined) },
      { label: 'Open FConnect', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
}

app.on('second-instance', (_e, argv) => (argv.includes('--replace') ? app.quit() : showWindow()))

app.on('before-quit', (e) => {
  quitting = true
  watcher.stop()
  if (tunnel.state.status !== 'disconnected') {
    e.preventDefault()
    void tunnel.disconnect().finally(() => app.quit())
  }
})

app.on('window-all-closed', () => undefined)

void app.whenReady().then(async () => {
  if (!(await acquireLock())) {
    quitting = true
    return app.quit()
  }
  app.setAppUserModelId('app.fconnect.client')
  protocol.handle('fc-img', async (req) => {
    const url = new URL(req.url)
    const key = `${url.host}${url.pathname}`
    const file = imageFiles.get(key)
    if (!file) return new Response(null, { status: 404 })
    if (url.host === 'icon') {
      const img = await app.getFileIcon(file, { size: 'large' })
      return new Response(new Uint8Array(img.toPNG()), { headers: { 'content-type': 'image/png' } })
    }
    return net.fetch(pathToFileURL(file).toString())
  })

  elevated = await isElevated()
  driver = await driverInstalled()
  await killStaleCores()
  apps = await detectApps(data.customApps)
  absorbCustomIntoPresets()
  await refreshSystemProxy()
  setInterval(() => void refreshSystemProxy(), 15000)

  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }))
  tray.on('double-click', showWindow)
  updateTray()
  createWindow()
  syncWatcher()
  updater.auto(setting('autoUpdate'))
  if (data.resumeAfterUpdate) {
    data.resumeAfterUpdate = undefined
    save()
    if (elevated && activeProfile()) void userConnect().catch(() => undefined)
  }
})
