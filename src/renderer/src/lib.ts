import { useEffect, useState, useSyncExternalStore } from 'react'
import type { AppActivity, AppEntry, Quality, Snapshot, Traffic } from '../../shared/types'

let snap: Snapshot | null = null
const subs = new Set<() => void>()
window.fc.onState((s) => {
  snap = s
  subs.forEach((f) => f())
})
void window.fc.snapshot().then((s) => {
  snap = s
  subs.forEach((f) => f())
})

export function useSnapshot(): Snapshot | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => snap
  )
}

function externalStore<T>(initial: T, attach: (set: (v: T) => void) => void): () => T {
  let value = initial
  const listeners = new Set<() => void>()
  attach((v) => {
    value = v
    listeners.forEach((f) => f())
  })
  const subscribe = (f: () => void) => {
    listeners.add(f)
    return () => listeners.delete(f)
  }
  return () => useSyncExternalStore(subscribe, () => value)
}

let history: Traffic[] = []
export const useTrafficHistory = externalStore<Traffic[]>([], (set) =>
  window.fc.onTraffic((t) => {
    history = t.up === 0 && t.down === 0 && history.every((h) => h.up === 0 && h.down === 0) ? [] : [...history.slice(-59), t]
    set(history)
  })
)

export const useActivity = externalStore<Record<string, AppActivity>>({}, (set) => window.fc.onActivity(set))

export const useQuality = externalStore<Quality | null>(null, (set) => window.fc.onQuality(set))

export function useWindowWidth(): number {
  const [w, setW] = useState(window.innerWidth)
  useEffect(() => {
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}

export function ago(t: number, now: number): string {
  const s = Math.max(0, Math.round((now - t) / 1000))
  return s < 5 ? 'now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`
}

export function isRouting(a: AppActivity | undefined): boolean {
  return !!a && a.up + a.down > 0
}

export function megabytes(n: number): string {
  return n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`
}

export function rate(bytes: number): string {
  if (bytes < 1024) return `${bytes} B/s`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB/s`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB/s`
}

export function elapsed(since: number, now: number): string {
  const s = Math.max(0, Math.floor((now - since) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function pingTone(ms: number | null | undefined): string {
  if (ms == null) return 'text-faint'
  if (ms < 0) return 'text-bad'
  if (ms < 400) return 'text-live'
  if (ms < 800) return 'text-warn'
  return 'text-bad'
}

export function pingText(ms: number | null | undefined): string {
  if (ms == null) return '—'
  return ms < 0 ? 'Failed' : `${ms} ms`
}

export function appImage(app: AppEntry): string | undefined {
  return app.iconExe ? `fc-img://icon/${app.id}` : undefined
}

export function splitFlag(name: string): { country?: string; label: string } {
  const m = /^\s*([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])\s*/u.exec(name)
  if (!m) return { label: name }
  const letter = (c: string) => String.fromCharCode(c.codePointAt(0)! - 0x1f1e6 + 65)
  return { country: letter(m[1]) + letter(m[2]), label: name.slice(m[0].length) || name }
}

export function bytes(n: number): string {
  const gb = n / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(gb >= 100 ? 0 : 1)} GB` : `${(n / 1024 ** 2).toFixed(0)} MB`
}

export function errorText(e: unknown): string {
  return String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
