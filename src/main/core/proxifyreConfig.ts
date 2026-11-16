import type { AppEntry } from '../../shared/types'

export function proxifyreAppNames(app: AppEntry): string[] {
  const folders = [...app.folders, ...(app.helperFolders ?? [])].map((f) => f.replace(/\//g, '\\').replace(/\\+$/, '') + '\\')
  return [...folders, ...app.processNames]
}

// ProxiFyre matches first-rule-wins and case-insensitively, so a name already claimed by an earlier app is dropped.
export function proxifyreConfig(
  apps: { app: AppEntry; port: number }[],
  excludes: string[],
  verbose = false
): Record<string, unknown> {
  const seen = new Set<string>()
  const proxies = apps
    .map(({ app, port }) => ({
      appNames: proxifyreAppNames(app).filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase())),
      socks5ProxyEndpoint: `127.0.0.1:${port}`,
      socks5Transport: 'TCP',
      supportedProtocols: ['TCP', 'UDP'],
      supportedAddressFamilies: ['IPv4']
    }))
    .filter((p) => p.appNames.length)
  return {
    logLevel: verbose ? 'Debug' : 'Warning',
    bypassLan: false,
    proxies,
    excludes: excludes.map((p) => p.replace(/\\+$/, '') + '\\')
  }
}
