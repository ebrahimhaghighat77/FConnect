import { spawn, type ChildProcess } from 'node:child_process'
import type { AppEntry } from '../shared/types'

export function matchesApp(app: AppEntry, path: string): boolean {
  const p = path.toLowerCase()
  const name = p.slice(p.lastIndexOf('\\') + 1)
  return (
    app.folders.some((f) => p.startsWith(f.toLowerCase().replace(/\//g, '\\').replace(/\\+$/, '') + '\\')) ||
    app.processNames.some((n) => n.toLowerCase() === name)
  )
}

export class ProcessWatcher {
  private child?: ChildProcess

  constructor(private readonly onPaths: (paths: string[]) => void) {}

  get active(): boolean {
    return !!this.child
  }

  start(): void {
    if (this.child) return
    const script = 'while ($true) { (Get-Process | Where-Object Path | ForEach-Object Path | Sort-Object -Unique) -join "|"; Start-Sleep -Seconds 3 }'
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    let buf = ''
    child.stdout?.on('data', (chunk) => {
      buf += chunk
      const lines = buf.split(/\r?\n/)
      buf = lines.pop() ?? ''
      const last = lines.filter(Boolean).pop()
      if (last) this.onPaths(last.split('|'))
    })
    child.on('exit', () => {
      if (this.child === child) this.child = undefined
    })
    this.child = child
  }

  stop(): void {
    this.child?.kill()
    this.child = undefined
  }
}
