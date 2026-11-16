import { randomUUID } from 'node:crypto'
import type { Engine, Profile, ProxyNode } from '../../shared/types'

interface RawLink {
  scheme: string
  user: string
  host: string
  port: string
  query: URLSearchParams
  name: string
}

const LINK_RE = /^([a-z0-9]+):\/\/(?:([^@/?#]*)@)?(\[[^\]]+\]|[^:/?#]+)(?::([^/?#]*))?[^?#]*(?:\?([^#]*))?(?:#(.*))?$/i

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function decodeBase64(s: string): string {
  const clean = s.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(clean, 'base64').toString('utf8')
}

function looksBase64(s: string): boolean {
  return /^[A-Za-z0-9+/=_\-\s]+$/.test(s) && s.replace(/\s/g, '').length >= 16
}

function splitLink(line: string): RawLink {
  const m = LINK_RE.exec(line)
  if (!m) throw new Error('malformed link')
  return {
    scheme: m[1].toLowerCase(),
    user: safeDecode(m[2] ?? ''),
    host: m[3].replace(/^\[|\]$/g, ''),
    port: m[4] ?? '',
    query: new URLSearchParams(m[5] ?? ''),
    name: safeDecode(m[6] ?? '').trim()
  }
}

function toPort(p: string | number | undefined): number {
  const n = Number(p)
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`invalid port "${p}"`)
  return n
}

function flag(v: string | null | undefined): boolean {
  return v === '1' || v === 'true'
}

function list(v: string | null | undefined): string[] | undefined {
  const items = (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return items.length ? items : undefined
}

function normalizeNetwork(type: string): ProxyNode['network'] {
  const t = type.toLowerCase()
  const map: Record<string, ProxyNode['network']> = {
    '': 'tcp',
    tcp: 'tcp',
    raw: 'tcp',
    ws: 'ws',
    websocket: 'ws',
    grpc: 'grpc',
    gun: 'grpc',
    httpupgrade: 'httpupgrade',
    xhttp: 'xhttp',
    splithttp: 'xhttp',
    kcp: 'kcp',
    mkcp: 'kcp',
    h2: 'h2',
    http: 'h2'
  }
  const net = map[t]
  if (!net) throw new Error(`unsupported transport "${type}"`)
  return net
}

function parseFragment(v: string | null): ProxyNode['fragment'] {
  const parts = list(v)
  if (!parts) return undefined
  const packetsIdx = parts.findIndex((p) => /^[a-z]/i.test(p))
  const packets = packetsIdx >= 0 ? parts.splice(packetsIdx, 1)[0] : 'tlshello'
  return { packets, length: parts[0] ?? '10-20', interval: parts[1] ?? '10-20' }
}

function applyStream(n: ProxyNode, q: URLSearchParams, defaultSecurity: ProxyNode['security']): void {
  n.network = normalizeNetwork(q.get('type') ?? '')
  n.headerType = q.get('headerType') || undefined
  n.host = q.get('host') || undefined
  n.path = q.get('path') || undefined
  n.serviceName = q.get('serviceName') || undefined
  if (n.network === 'grpc') n.grpcMode = q.get('mode') || undefined
  if (n.network === 'xhttp') {
    n.xhttpMode = q.get('mode') || undefined
    const extra = q.get('extra')
    if (extra) n.xhttpExtra = JSON.parse(extra)
  }
  if (n.network === 'kcp') n.kcpSeed = q.get('seed') || undefined
  const sec = (q.get('security') || defaultSecurity).toLowerCase()
  if (sec !== 'none' && sec !== 'tls' && sec !== 'reality') throw new Error(`unsupported security "${sec}"`)
  n.security = sec
  n.sni = q.get('sni') || q.get('peer') || undefined
  n.fingerprint = q.get('fp') || undefined
  n.alpn = list(q.get('alpn'))
  n.insecure = flag(q.get('allowInsecure')) || flag(q.get('insecure'))
  n.publicKey = q.get('pbk') || undefined
  n.shortId = q.get('sid') || undefined
  n.spiderX = q.get('spx') || undefined
  n.mldsa65Verify = q.get('pqv') || undefined
  n.pinnedCertSha256 = q.get('pcs') || undefined
  n.verifyCertByName = q.get('vcn') || undefined
  n.fragment = parseFragment(q.get('fragment'))
}

function base(protocol: ProxyNode['protocol'], server: string, port: number): ProxyNode {
  return { protocol, server, port, network: 'tcp', security: 'none' }
}

function parseVless(r: RawLink): ProxyNode {
  const n = base('vless', r.host, toPort(r.port))
  if (!r.user) throw new Error('missing uuid')
  n.uuid = r.user
  n.flow = r.query.get('flow') || undefined
  n.encryption = r.query.get('encryption') || 'none'
  applyStream(n, r.query, 'none')
  return n
}

function parseTrojan(r: RawLink): ProxyNode {
  const n = base('trojan', r.host, toPort(r.port))
  if (!r.user) throw new Error('missing password')
  n.password = r.user
  applyStream(n, r.query, 'tls')
  return n
}

function parseVmess(body: string): { node: ProxyNode; name: string } {
  const j = JSON.parse(decodeBase64(body)) as Record<string, unknown>
  const s = (k: string): string => (j[k] == null ? '' : String(j[k]).trim())
  const n = base('vmess', s('add'), toPort(s('port')))
  if (!s('id')) throw new Error('missing uuid')
  n.uuid = s('id')
  n.alterId = Number(s('aid')) || 0
  n.vmessSecurity = s('scy') || 'auto'
  n.network = normalizeNetwork(s('net'))
  const type = s('type')
  if (n.network === 'grpc') {
    n.serviceName = s('path') || undefined
    n.grpcMode = type || undefined
  } else {
    n.path = s('path') || undefined
    if (type && type !== 'none') {
      if (n.network === 'xhttp') n.xhttpMode = type
      else n.headerType = type
    }
  }
  n.host = s('host') || undefined
  const tls = s('tls').toLowerCase()
  n.security = tls === 'tls' || tls === 'reality' ? tls : 'none'
  n.sni = s('sni') || undefined
  n.fingerprint = s('fp') || undefined
  n.alpn = list(s('alpn'))
  n.insecure = flag(s('allowInsecure')) || flag(s('insecure'))
  n.publicKey = s('pbk') || undefined
  n.shortId = s('sid') || undefined
  return { node: n, name: s('ps') }
}

function parseShadowsocks(line: string): { node: ProxyNode; name: string } {
  const hashAt = line.indexOf('#')
  const name = hashAt >= 0 ? safeDecode(line.slice(hashAt + 1)).trim() : ''
  let body = (hashAt >= 0 ? line.slice(0, hashAt) : line).slice('ss://'.length)
  let query = new URLSearchParams()
  const qAt = body.indexOf('?')
  if (qAt >= 0) {
    query = new URLSearchParams(body.slice(qAt + 1))
    body = body.slice(0, qAt)
  }
  body = body.replace(/\/$/, '')
  if (!body.includes('@')) body = decodeBase64(body)
  const at = body.lastIndexOf('@')
  if (at < 0) throw new Error('malformed shadowsocks link')
  let userinfo = safeDecode(body.slice(0, at))
  if (!userinfo.includes(':')) userinfo = decodeBase64(userinfo)
  const colon = userinfo.indexOf(':')
  const hostPort = body.slice(at + 1)
  const m = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(hostPort)
  if (!m || colon < 0) throw new Error('malformed shadowsocks link')
  const n = base('shadowsocks', m[1].replace(/^\[|\]$/g, ''), toPort(m[2]))
  n.method = userinfo.slice(0, colon)
  n.password = userinfo.slice(colon + 1)
  const plugin = query.get('plugin')
  if (plugin) {
    const [p, ...opts] = plugin.split(';')
    n.plugin = p === 'simple-obfs' ? 'obfs-local' : p
    n.pluginOpts = opts.join(';') || undefined
  }
  return { node: n, name }
}

function parseSocks(r: RawLink): ProxyNode {
  const n = base('socks', r.host, toPort(r.port))
  if (r.user) {
    let auth = r.user
    if (!auth.includes(':') && looksBase64(auth)) auth = decodeBase64(auth)
    const colon = auth.indexOf(':')
    n.username = colon >= 0 ? auth.slice(0, colon) : auth
    n.password = colon >= 0 ? auth.slice(colon + 1) : undefined
  }
  return n
}

function parseHysteria2(r: RawLink): ProxyNode {
  const ports = r.port.split(',').filter(Boolean)
  const single = ports.find((p) => /^\d+$/.test(p))
  const ranges = [...ports.filter((p) => p.includes('-')), ...(list(r.query.get('mport')) ?? [])]
  const n = base('hysteria2', r.host, single ? toPort(single) : 443)
  n.password = r.user
  n.security = 'tls'
  if (ranges.length) n.serverPorts = ranges.map((p) => p.replace('-', ':'))
  n.sni = r.query.get('sni') || undefined
  n.insecure = flag(r.query.get('insecure'))
  n.alpn = list(r.query.get('alpn'))
  n.obfs = r.query.get('obfs') || undefined
  n.obfsPassword = r.query.get('obfs-password') || undefined
  return n
}

function parseTuic(r: RawLink): ProxyNode {
  const n = base('tuic', r.host, toPort(r.port))
  const colon = r.user.indexOf(':')
  if (colon < 0) throw new Error('missing uuid:password')
  n.uuid = r.user.slice(0, colon)
  n.password = r.user.slice(colon + 1)
  n.security = 'tls'
  n.congestion = r.query.get('congestion_control') || undefined
  n.udpRelayMode = r.query.get('udp_relay_mode') || undefined
  n.sni = r.query.get('sni') || undefined
  n.alpn = list(r.query.get('alpn'))
  n.insecure = flag(r.query.get('allow_insecure')) || flag(r.query.get('insecure'))
  return n
}

function needsXray(n: ProxyNode): boolean {
  return (
    n.network === 'xhttp' ||
    n.network === 'kcp' ||
    (n.network === 'tcp' && n.headerType === 'http') ||
    (!!n.encryption && n.encryption !== 'none') ||
    !!n.mldsa65Verify ||
    !!n.fragment
  )
}

// Xray 26 refuses h2, allowInsecure and plaintext VLESS, so those fall back to sing-box.
export function pickEngine(n: ProxyNode): Engine {
  if (!['vless', 'vmess', 'trojan'].includes(n.protocol)) return 'sing-box'
  if (needsXray(n)) return 'xray'
  if (n.network === 'h2' || (n.security === 'tls' && n.insecure) || (n.protocol === 'vless' && n.security === 'none')) return 'sing-box'
  return 'xray'
}

function transportLabel(n: ProxyNode): string {
  if (n.protocol === 'hysteria2' || n.protocol === 'tuic') return 'quic'
  if (n.protocol === 'shadowsocks' || n.protocol === 'socks') return n.plugin ?? 'tcp'
  return n.security === 'none' ? n.network : `${n.network} ${n.security}`
}

export function nodeProfile(node: ProxyNode, name: string): Profile {
  return {
    id: randomUUID(),
    name: name || `${node.protocol} ${node.server}`,
    engine: pickEngine(node),
    protocol: node.protocol,
    transport: transportLabel(node),
    address: `${node.server}:${node.port}`,
    node
  }
}

export function parseLink(line: string): Profile {
  const scheme = line.slice(0, line.indexOf('://')).toLowerCase()
  switch (scheme) {
    case 'vless':
    case 'trojan':
    case 'socks':
    case 'socks5':
    case 'hysteria2':
    case 'hy2':
    case 'tuic': {
      const r = splitLink(line)
      const node =
        scheme === 'vless'
          ? parseVless(r)
          : scheme === 'trojan'
            ? parseTrojan(r)
            : scheme === 'tuic'
              ? parseTuic(r)
              : scheme.startsWith('hy')
                ? parseHysteria2(r)
                : parseSocks(r)
      return nodeProfile(node, r.name)
    }
    case 'vmess': {
      const { node, name } = parseVmess(line.slice('vmess://'.length).split('#')[0])
      return nodeProfile(node, name)
    }
    case 'ss': {
      const { node, name } = parseShadowsocks(line)
      return nodeProfile(node, name)
    }
    default:
      throw new Error(`unsupported scheme "${scheme || line.slice(0, 12)}"`)
  }
}

function xrayJsonProfile(cfg: Record<string, unknown>, fallbackName: string): Profile {
  const config = Array.isArray(cfg.outbounds) ? cfg : { outbounds: [cfg] }
  const outbounds = config.outbounds as Record<string, unknown>[]
  const first = outbounds[0] ?? {}
  const settings = (first.settings ?? {}) as Record<string, any>
  const server = settings.vnext?.[0] ?? settings.servers?.[0] ?? settings
  const stream = (first.streamSettings ?? {}) as Record<string, unknown>
  return {
    id: randomUUID(),
    name: String(cfg.remarks ?? fallbackName),
    engine: 'xray',
    protocol: 'xray-json',
    transport: [stream.network, stream.security].filter((s) => s && s !== 'none').join(' ') || String(first.protocol ?? 'json'),
    address: server?.address ? `${server.address}:${server.port}` : 'custom config',
    xrayJson: config as Record<string, unknown>
  }
}

export interface ImportResult {
  profiles: Profile[]
  errors: string[]
}

export function parseImport(text: string): ImportResult {
  const trimmed = text.replace(/^﻿/, '').trim()
  const result: ImportResult = { profiles: [], errors: [] }
  if (!trimmed) return result

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed)
      const items = Array.isArray(json) ? json : [json]
      items.forEach((item, i) => result.profiles.push(xrayJsonProfile(item, `Xray config ${i + 1}`)))
    } catch (e) {
      result.errors.push(`JSON: ${(e as Error).message}`)
    }
    return result
  }

  if (!trimmed.includes('://') && looksBase64(trimmed)) return parseImport(decodeBase64(trimmed))

  for (const line of trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith('#') || line.startsWith('//')) continue
    try {
      result.profiles.push(parseLink(line))
    } catch (e) {
      result.errors.push(`${line.slice(0, 40)}… — ${(e as Error).message}`)
    }
  }
  return result
}
