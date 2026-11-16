import { app } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { runDir } from '../store'

const run = promisify(execFile)

export const binDir = app.isPackaged ? join(process.resourcesPath, 'bin') : join(app.getAppPath(), 'resources', 'bin')
export const xrayExe = join(binDir, 'xray.exe')
export const singboxExe = join(binDir, 'sing-box.exe')
export const proxifyreDir = join(runDir, 'proxifyre')
const driverMsi = join(binDir, 'WindowsPacketFilter-x64.msi')

export type Engine = 'xray' | 'sing-box' | 'proxifyre'
export type LogSink = (src: Engine | 'app', text: string) => void

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo
      srv.close(() => resolve(port))
    })
  })
}

export async function validate(engine: 'xray' | 'sing-box', file: string): Promise<void> {
  const exe = engine === 'xray' ? xrayExe : singboxExe
  const args = engine === 'xray' ? ['run', '-test', '-c', file] : ['check', '-c', file]
  try {
    await run(exe, args, { windowsHide: true, timeout: 15000 })
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string }
    const text = `${err.stderr ?? ''}\n${err.stdout ?? ''}`
    const line = text.split(/\r?\n/).reverse().find((l) => /fail|fatal|error|>/i.test(l)) ?? err.message
    throw new Error(line.replace(/\x1b\[[0-9;]*m/g, '').replace(/^.*?(FATAL|Failed to start:)\s*/, '').trim())
  }
}

function prepareProxifyre(): void {
  const src = join(binDir, 'proxifyre')
  const exe = join(proxifyreDir, 'ProxiFyre.exe')
  if (existsSync(exe) && statSync(exe).size === statSync(join(src, 'ProxiFyre.exe')).size) return
  cpSync(src, proxifyreDir, { recursive: true })
  const nlog = join(proxifyreDir, 'NLog.config')
  writeFileSync(
    nlog,
    readFileSync(nlog, 'utf8')
      .replace('<targets>', '<targets>\n    <target name="console" xsi:type="Console" layout="${level:uppercase=true} ${message}" />')
      .replace('</rules>', '  <logger name="*" minlevel="Info" writeTo="console" />\n  </rules>')
  )
}

const running = (c?: ChildProcess): c is ChildProcess => !!c && c.exitCode === null && c.signalCode === null

export class Core {
  private child?: ChildProcess
  private lastError = ''
  private exitCode: number | null = null

  constructor(
    readonly engine: Engine,
    private readonly log: LogSink
  ) {}

  get alive(): boolean {
    return running(this.child)
  }

  async start(name: string, config: unknown, cwd: string): Promise<void> {
    await this.stop()
    let exe: string
    let args: string[]
    if (this.engine === 'proxifyre') {
      prepareProxifyre()
      cwd = proxifyreDir
      writeFileSync(join(cwd, 'app-config.json'), JSON.stringify(config, null, 2))
      exe = join(cwd, 'ProxiFyre.exe')
      args = ['run']
    } else {
      const file = join(cwd, `${name}.json`)
      writeFileSync(file, JSON.stringify(config, null, 2))
      await validate(this.engine, file)
      exe = this.engine === 'xray' ? xrayExe : singboxExe
      args = this.engine === 'xray' ? ['run', '-c', file] : ['run', '-c', file, '-D', cwd, '--disable-color']
    }
    const child = spawn(exe, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    this.child = child
    this.lastError = ''
    this.exitCode = null
    const onData = (buf: Buffer): void => {
      for (const line of buf.toString().split(/\r?\n/).filter((l) => l.trim())) {
        if (/fatal|error|failed|panic/i.test(line) && !/accepted/.test(line)) this.lastError = line
        this.log(this.engine, line)
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('exit', (code) => {
      if (this.child !== child) return
      this.exitCode = code
      this.log('app', `${this.engine} exited (code ${code})`)
    })
  }

  failure(): Error {
    const why = this.lastError.replace(/^.*?(FATAL|ERROR)\]?\s*/, '') || `exited with code ${this.exitCode ?? 'unknown'}`
    return new Error(`${this.engine} stopped: ${why}`)
  }

  onData(handler: (line: string) => void): void {
    const child = this.child
    const relay = (buf: Buffer) => buf.toString().split(/\r?\n/).filter(Boolean).forEach(handler)
    child?.stdout?.on('data', relay)
    child?.stderr?.on('data', relay)
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = undefined
    if (!running(child)) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (child.pid) execFile('taskkill.exe', ['/F', '/T', '/PID', String(child.pid)], { windowsHide: true }, () => resolve())
        else resolve()
      }, 2500)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      child.kill()
    })
  }
}

export async function waitFor(check: () => Promise<boolean>, core: Core, timeoutMs = 10000): Promise<void> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (!core.alive) throw core.failure()
    if (await check().catch(() => false)) return
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(`${core.engine} did not become ready in time`)
}

export function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.once('connect', () => {
      s.destroy()
      resolve(true)
    })
    s.once('error', () => resolve(false))
  })
}

export function delayViaProxy(port: number, timeoutMs = 6000): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = performance.now()
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: 'http://www.gstatic.com/generate_204',
        headers: { Host: 'www.gstatic.com' },
        agent: false,
        timeout: timeoutMs
      },
      (res) => {
        res.resume()
        res.on('end', () =>
          res.statusCode === 204 || res.statusCode === 200
            ? resolve(Math.round(performance.now() - start))
            : reject(new Error(`HTTP ${res.statusCode}`))
        )
      }
    )
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.end()
  })
}

export async function killStaleCores(): Promise<void> {
  const prefixes = [binDir, runDir].map((p) => `'${p.replace(/'/g, "''")}'`).join(',')
  const script = `$p = @(${prefixes}); Get-Process -Name xray, sing-box, ProxiFyre -ErrorAction SilentlyContinue | Where-Object { $path = $_.Path; $path -and ($p | Where-Object { $path.StartsWith($_, 'OrdinalIgnoreCase') }) } | Stop-Process -Force -ErrorAction SilentlyContinue`
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10000 }).catch(() => undefined)
}

export async function driverInstalled(): Promise<boolean> {
  try {
    await run('sc.exe', ['query', 'ndisrd'], { windowsHide: true, timeout: 8000 })
    return true
  } catch {
    return false
  }
}

export async function installDriver(): Promise<void> {
  try {
    await run('msiexec.exe', ['/i', driverMsi, '/qn', '/norestart'], { windowsHide: true, timeout: 180000 })
  } catch (e) {
    if ((e as { code?: number }).code !== 3010) throw new Error(`Driver setup failed (${(e as Error).message.split('\n')[0]})`)
  }
  if (!(await driverInstalled())) throw new Error('Driver setup finished but the Windows Packet Filter service is missing')
}

export async function readSystemProxy(): Promise<string | undefined> {
  try {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
    const { stdout } = await run('reg.exe', ['query', key], { windowsHide: true, timeout: 8000 })
    const enabled = /ProxyEnable\s+REG_DWORD\s+0x0*1\b/i.test(stdout)
    const server = /ProxyServer\s+REG_SZ\s+(\S+)/i.exec(stdout)?.[1]
    const pac = /AutoConfigURL\s+REG_SZ\s+(\S+)/i.exec(stdout)?.[1]
    return enabled && server ? server : pac
  } catch {
    return undefined
  }
}

export async function isElevated(): Promise<boolean> {
  try {
    await run('net.exe', ['session'], { windowsHide: true, timeout: 8000 })
    return true
  } catch {
    return false
  }
}
