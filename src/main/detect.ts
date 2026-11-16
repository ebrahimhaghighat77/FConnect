import { shell } from 'electron'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type { AppEntry, RunningProcess } from '../shared/types'
import { PRESETS } from './presets'

const run = promisify(execFile)

export const imageFiles = new Map<string, string>()

function readText(file: string): string {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function dirs(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(path, d.name))
  } catch {
    return []
  }
}

async function steamRoot(): Promise<string | undefined> {
  try {
    const { stdout } = await run('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true })
    const m = /SteamPath\s+REG_SZ\s+(.+)/.exec(stdout)
    if (m) return m[1].trim().replace(/\//g, '\\')
  } catch {
    /* not installed */
  }
  const fallback = 'C:\\Program Files (x86)\\Steam'
  return existsSync(fallback) ? fallback : undefined
}

function steamCover(root: string, appId: number): string | undefined {
  const base = join(root, 'appcache', 'librarycache', String(appId))
  const candidates = ['library_capsule.jpg', 'library_600x900.jpg', 'library_header.jpg', 'header.jpg']
  for (const name of candidates) {
    for (const dir of [base, ...dirs(base)]) {
      const file = join(dir, name)
      if (existsSync(file)) return file
    }
  }
  for (const legacy of [`${appId}_library_600x900.jpg`, `${appId}_header.jpg`]) {
    const file = join(root, 'appcache', 'librarycache', legacy)
    if (existsSync(file)) return file
  }
  return undefined
}

const NOT_GAMES = /redistributable|steamworks|steam linux runtime|proton|soundtrack|dedicated server|\bsdk\b|wallpaper engine|modeler/i

interface Found {
  appId?: number
  name: string
  folder: string
  cover?: string
  source: 'steam' | 'epic'
  iconExe?: string
}

async function steamGames(): Promise<{ root?: string; games: Found[] }> {
  const root = await steamRoot()
  if (!root) return { games: [] }
  const vdf = readText(join(root, 'steamapps', 'libraryfolders.vdf'))
  const libs = new Set([root, ...[...vdf.matchAll(/"path"\s+"([^"]+)"/g)].map((m) => m[1].replace(/\\\\/g, '\\'))])
  const games: Found[] = []
  for (const lib of libs) {
    const apps = join(lib, 'steamapps')
    let files: string[] = []
    try {
      files = readdirSync(apps).filter((f) => /^appmanifest_\d+\.acf$/.test(f))
    } catch {
      continue
    }
    for (const f of files) {
      const acf = readText(join(apps, f))
      const appId = Number(/"appid"\s+"(\d+)"/.exec(acf)?.[1])
      const name = /"name"\s+"([^"]+)"/.exec(acf)?.[1]
      const installdir = /"installdir"\s+"([^"]+)"/.exec(acf)?.[1]
      if (!appId || !name || !installdir || appId === 228980 || NOT_GAMES.test(name)) continue
      const folder = join(apps, 'common', installdir)
      if (existsSync(folder)) games.push({ appId, name, folder, cover: steamCover(root, appId), source: 'steam' })
    }
  }
  return { root, games }
}

function epicGames(): Found[] {
  const dir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'
  let files: string[] = []
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.item'))
  } catch {
    return []
  }
  const out: Found[] = []
  for (const f of files) {
    try {
      const m = JSON.parse(readText(join(dir, f)))
      if (!m.InstallLocation || !existsSync(m.InstallLocation)) continue
      if (Array.isArray(m.AppCategories) && !m.AppCategories.includes('games')) continue
      out.push({
        name: m.DisplayName,
        folder: m.InstallLocation,
        source: 'epic',
        iconExe: m.LaunchExecutable ? join(m.InstallLocation, m.LaunchExecutable) : undefined
      })
    } catch {
      /* broken manifest */
    }
  }
  return out
}

function firstExe(folder: string, depth = 3): string | undefined {
  let best: { file: string; size: number } | undefined
  const walk = (dir: string, d: number): void => {
    let entries: import('node:fs').Dirent[] = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory() && d > 0 && !/redist|installer|crash|_commonredist|engine/i.test(e.name)) walk(p, d - 1)
      else if (e.isFile() && e.name.toLowerCase().endsWith('.exe') && !/crash|setup|install|redist|unins/i.test(e.name)) {
        const size = statSync(p).size
        if (!best || size > best.size) best = { file: p, size }
      }
    }
  }
  walk(folder, depth)
  return best?.file
}

// Claude ships as an MSIX package whose folder name changes with every update; the package registry keeps the current one.
async function claudeInstall(): Promise<{ exe?: string; dataDir?: string }> {
  const local = process.env.LOCALAPPDATA ?? ''
  const dataDir = join(local, 'Claude-Data')
  let exe: string | undefined
  try {
    const key = 'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages'
    const { stdout } = await run('reg.exe', ['query', key, '/s', '/f', 'PackageRootFolder', '/v', 'PackageRootFolder'], { windowsHide: true, timeout: 8000 })
    const root = stdout.match(/^\s*PackageRootFolder\s+REG_SZ\s+(.*\\Claude_[^\r\n]*)$/im)?.[1]?.trim()
    if (root) exe = join(root, 'app', 'Claude.exe')
  } catch {
    /* not an MSIX install */
  }
  if (!exe && existsSync(join(local, 'AnthropicClaude', 'claude.exe'))) exe = join(local, 'AnthropicClaude', 'claude.exe')
  return { exe, dataDir: existsSync(dataDir) ? dataDir : undefined }
}

function discordFolders(): string[] {
  const local = process.env.LOCALAPPDATA ?? ''
  return ['Discord', 'DiscordPTB', 'DiscordCanary'].map((d) => join(local, d)).filter((p) => existsSync(p))
}

function withImages(e: AppEntry, coverFile?: string): AppEntry {
  if (coverFile) {
    imageFiles.set(`cover/${e.id}`, coverFile)
    e.cover = `fc-img://cover/${e.id}`
  } else if (e.steamAppId) {
    e.cover = `https://cdn.cloudflare.steamstatic.com/steam/apps/${e.steamAppId}/library_600x900.jpg`
  }
  if (e.iconExe) imageFiles.set(`icon/${e.id}`, e.iconExe)
  return e
}

const GAME_PATH = /steamapps|epic games|gog galaxy|\\games\\|riot games|battle\.net|ubisoft|\\ea games|xboxgames|rockstar games/i
const NOT_APP = /uninstall|readme|help|documentation|manual|release notes|license|website|support|feedback|safe mode|debug|crash|updater?\b|setup/i

function shortcutFiles(dir: string, depth = 4): string[] {
  let entries: import('node:fs').Dirent[] = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return depth > 0 ? shortcutFiles(p, depth - 1) : []
    return e.name.toLowerCase().endsWith('.lnk') ? [p] : []
  })
}

function broadFolders(): Set<string> {
  const env = process.env
  return new Set(
    [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA, env.APPDATA, env.ProgramData, join(env.LOCALAPPDATA ?? '', 'Programs'), env.USERPROFILE]
      .filter(Boolean)
      .map((p) => p!.toLowerCase().replace(/\\+$/, ''))
  )
}

function startMenuApps(taken: string[]): AppEntry[] {
  const roots = [
    join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs'),
    join(process.env.APPDATA ?? '', 'Microsoft\\Windows\\Start Menu\\Programs')
  ]
  const broad = broadFolders()
  const covered = (p: string) => taken.some((t) => p.startsWith(t))
  const byKey = new Map<string, AppEntry>()
  for (const lnk of roots.flatMap((r) => shortcutFiles(r))) {
    const name = basename(lnk, '.lnk').replace(/\s*\(x64\)|\s*\(64-bit\)/i, '').trim()
    if (NOT_APP.test(name)) continue
    let target = ''
    try {
      target = shell.readShortcutLink(lnk).target
    } catch {
      continue
    }
    const lower = target.toLowerCase()
    if (!lower.endsWith('.exe') || lower.startsWith('c:\\windows') || !existsSync(target) || NOT_APP.test(basename(target))) continue
    const folder = dirname(target)
    const isBroad = broad.has(folder.toLowerCase().replace(/\\+$/, '')) || /^[a-z]:\\?$/i.test(folder)
    if (covered(lower)) continue
    const key = isBroad ? lower : folder.toLowerCase()
    if (byKey.has(key)) continue
    byKey.set(key, {
      id: 'app-' + createHash('sha1').update(key).digest('hex').slice(0, 12),
      name,
      kind: GAME_PATH.test(target) ? 'game' : 'app',
      source: 'system',
      folders: isBroad ? [] : [folder],
      processNames: isBroad ? [basename(target)] : [],
      installed: true,
      iconExe: target
    })
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function detectApps(custom: AppEntry[]): Promise<AppEntry[]> {
  const [{ root, games }, claude] = await Promise.all([steamGames(), claudeInstall()])
  const epic = epicGames()
  const used = new Set<Found>()
  const list: AppEntry[] = []

  for (const p of PRESETS) {
    const found = games.find((g) => g.appId === p.steamAppId) ?? (p.epicName ? epic.find((g) => p.epicName!.test(g.name)) : undefined)
    if (found) used.add(found)
    const folders = [
      ...(found ? [found.folder] : []),
      ...(p.id === 'discord' ? discordFolders() : []),
      ...(p.id === 'claude' && claude.dataDir ? [claude.dataDir] : [])
    ]
    const helperFolders = (p.extraFolders ?? []).filter((f) => existsSync(f))
    const iconExe =
      p.id === 'steam' && root
        ? join(root, 'steam.exe')
        : p.id === 'claude'
          ? claude.exe
          : p.id === 'discord'
            ? discordFolders()
                .flatMap((d) => dirs(d).filter((a) => /\\app-[\d.]+$/.test(a)).sort().reverse().map((a) => join(a, `${basename(d)}.exe`)))
                .find((f) => existsSync(f))
            : found && (found.iconExe ?? firstExe(found.folder))
    list.push(
      withImages(
        {
          id: p.id,
          name: p.name,
          kind: p.kind,
          source: 'preset',
          folders,
          helperFolders,
          processNames: p.processNames,
          installed: p.id === 'steam' ? !!root : p.id === 'claude' ? !!(claude.exe || claude.dataDir) : folders.length > 0,
          steamAppId: p.steamAppId,
          iconExe,
          hint: p.hint,
          followsSystemProxy: p.followsSystemProxy
        },
        found?.cover
      )
    )
  }

  for (const g of [...games, ...epic].filter((g) => !used.has(g))) {
    list.push(
      withImages(
        {
          id: g.appId ? `steam-${g.appId}` : `epic-${basename(g.folder)}`,
          name: g.name,
          kind: 'game',
          source: g.source,
          folders: [g.folder],
          processNames: [],
          installed: true,
          steamAppId: g.appId,
          iconExe: g.iconExe ?? firstExe(g.folder)
        },
        g.cover
      )
    )
  }

  const taken = list.flatMap((a) => a.folders.map((f) => f.toLowerCase().replace(/\\+$/, '') + '\\'))
  if (root) taken.push(root.toLowerCase() + '\\')
  for (const a of startMenuApps(taken)) list.push(withImages(a))
  for (const c of custom) list.push(withImages({ ...c, installed: true }))
  return list
}

export function customFromExe(id: string, exe: string): AppEntry {
  return {
    id,
    name: basename(exe).replace(/\.exe$/i, ''),
    kind: /steamapps|epic games|\\games\\/i.test(exe) ? 'game' : 'app',
    source: 'custom',
    folders: [],
    processNames: [basename(exe)],
    installed: true,
    iconExe: exe
  }
}

export function customFromFolder(id: string, folder: string): AppEntry {
  return {
    id,
    name: basename(folder) || folder,
    kind: /steamapps|epic games|\\games\\/i.test(folder) ? 'game' : 'app',
    source: 'custom',
    folders: [folder],
    processNames: [],
    installed: true,
    iconExe: firstExe(folder, 2)
  }
}

export async function runningProcesses(): Promise<RunningProcess[]> {
  const script = 'Get-Process | Where-Object Path | Select-Object Name,Path | ConvertTo-Json -Compress'
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  })
  const raw = JSON.parse(stdout || '[]')
  const seen = new Map<string, RunningProcess>()
  for (const p of Array.isArray(raw) ? raw : [raw]) {
    if (!p?.Path || /\\Windows\\/i.test(p.Path)) continue
    seen.set(p.Path.toLowerCase(), { name: basename(p.Path), path: p.Path })
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}
