import type { Profile, ProxyNode } from '../../shared/types'

type Json = Record<string, unknown>

function serverName(n: ProxyNode): string | undefined {
  return n.sni || n.host?.split(',')[0] || (/^[\d.:]+$/.test(n.server) ? undefined : n.server)
}

function streamSettings(n: ProxyNode): Json {
  const s: Json = { network: n.network === 'tcp' ? 'raw' : n.network, security: n.security }
  if (n.security === 'tls') {
    s.tlsSettings = {
      serverName: serverName(n),
      fingerprint: n.fingerprint || 'chrome',
      alpn: n.alpn,
      pinnedPeerCertSha256: n.pinnedCertSha256,
      verifyPeerCertByName: n.verifyCertByName
    }
  } else if (n.security === 'reality') {
    s.realitySettings = {
      serverName: n.sni,
      fingerprint: n.fingerprint || 'chrome',
      publicKey: n.publicKey,
      shortId: n.shortId ?? '',
      spiderX: n.spiderX ?? '',
      mldsa65Verify: n.mldsa65Verify
    }
  }
  switch (n.network) {
    case 'tcp':
      if (n.headerType === 'http') {
        s.rawSettings = {
          header: {
            type: 'http',
            request: { path: (n.path || '/').split(','), headers: { Host: (n.host ?? '').split(',').filter(Boolean) } }
          }
        }
      }
      break
    case 'ws':
      s.wsSettings = { path: n.path || '/', host: n.host }
      break
    case 'grpc':
      s.grpcSettings = { serviceName: n.serviceName ?? '', multiMode: n.grpcMode === 'multi', authority: n.host }
      break
    case 'httpupgrade':
      s.httpupgradeSettings = { path: n.path || '/', host: n.host }
      break
    case 'xhttp':
      s.xhttpSettings = { path: n.path || '/', host: n.host, mode: n.xhttpMode || 'auto', extra: n.xhttpExtra }
      break
    case 'kcp':
      s.kcpSettings = { header: { type: n.headerType || 'none' }, seed: n.kcpSeed }
      break
    case 'h2':
      throw new Error('HTTP/2 transport is not supported by Xray 26')
  }
  if (n.fragment) s.sockopt = { dialerProxy: 'fc-fragment' }
  return s
}

function wireguardOutbound(n: ProxyNode, tag: string): Json {
  const v4 = n.localAddress?.some((a) => !a.includes(':'))
  return {
    tag,
    protocol: 'wireguard',
    settings: {
      secretKey: n.privateKey,
      address: n.localAddress,
      mtu: n.mtu,
      reserved: n.reserved,
      peers: [
        {
          publicKey: n.peerPublicKey,
          preSharedKey: n.preSharedKey,
          endpoint: `${n.server.includes(':') ? `[${n.server}]` : n.server}:${n.port}`,
          allowedIPs: ['0.0.0.0/0', '::/0'],
          keepAlive: n.keepAlive
        }
      ],
      domainStrategy: v4 ? 'ForceIPv4' : 'ForceIPv6'
    }
  }
}

// WireGuard resolves names on this PC, so DNS has to ride the tunnel or Iran's poisoned answers win.
const WG_DNS = { tag: 'fc-dns', servers: ['1.1.1.1', '8.8.8.8'] }

export function xrayOutbounds(n: ProxyNode, tag: string): Json[] {
  if (n.protocol === 'wireguard') return [wireguardOutbound(n, tag)]
  let settings: Json
  if (n.protocol === 'vless') {
    settings = { vnext: [{ address: n.server, port: n.port, users: [{ id: n.uuid, encryption: n.encryption || 'none', flow: n.flow ?? '' }] }] }
  } else if (n.protocol === 'vmess') {
    settings = { vnext: [{ address: n.server, port: n.port, users: [{ id: n.uuid, security: n.vmessSecurity || 'auto' }] }] }
  } else if (n.protocol === 'trojan') {
    settings = { servers: [{ address: n.server, port: n.port, password: n.password }] }
  } else {
    throw new Error(`${n.protocol} is not handled by the Xray engine`)
  }
  const out: Json[] = [{ tag, protocol: n.protocol, settings, streamSettings: streamSettings(n) }]
  if (n.fragment) out.push({ tag: 'fc-fragment', protocol: 'freedom', settings: { fragment: n.fragment } })
  return out
}

const PRIVATE = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16', '224.0.0.0/4', '255.255.255.255/32']

export interface TunnelPorts {
  apps: { id: string; port: number }[]
  probe: number
  metrics: number
  native?: number
}

// Sniffing swaps poisoned DNS answers (10.10.34.x) for the real TLS/QUIC domain before routing.
export function xrayTunnelConfig(p: Profile, ports: TunnelPorts, verbose = false): Json {
  const proxy: Json[] = ports.native
    ? [{ tag: 'proxy', protocol: 'socks', settings: { servers: [{ address: '127.0.0.1', port: ports.native }] } }]
    : p.xrayJson
      ? (structuredClone(p.xrayJson.outbounds) as Json[])
      : xrayOutbounds(p.node!, 'proxy')
  if (!proxy[0].tag) proxy[0].tag = 'proxy'
  const wg = !ports.native && !p.xrayJson && p.node?.protocol === 'wireguard'
  const userRouting = !ports.native && p.xrayJson?.routing ? (structuredClone(p.xrayJson.routing) as Json) : undefined
  const rules = [{ ip: PRIVATE, outboundTag: 'direct' }, ...(((userRouting?.rules as Json[]) ?? []))]
  const appInbounds = ports.apps.map(({ id, port }) => ({
    tag: appTag(id),
    listen: '127.0.0.1',
    port,
    protocol: 'socks',
    settings: { udp: true, auth: 'noauth', ip: '127.0.0.1' },
    sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'], routeOnly: false }
  }))
  return {
    ...(!ports.native && p.xrayJson ? structuredClone(p.xrayJson) : {}),
    api: undefined,
    ...(wg ? { dns: WG_DNS } : {}),
    log: { loglevel: verbose ? 'info' : 'warning' },
    stats: {},
    policy: { system: { statsInboundUplink: true, statsInboundDownlink: true } },
    metrics: { tag: 'fc-metrics', listen: `127.0.0.1:${ports.metrics}` },
    inbounds: [...appInbounds, { tag: 'fc-probe', listen: '127.0.0.1', port: ports.probe, protocol: 'http' }],
    outbounds: [...proxy, ...(proxy.some((o) => o.tag === 'direct') ? [] : [{ tag: 'direct', protocol: 'freedom' }])],
    routing: {
      ...userRouting,
      domainStrategy: (userRouting?.domainStrategy as string) ?? 'AsIs',
      rules: [...rules, { inboundTag: [...appInbounds.map((i) => i.tag), 'fc-probe', ...(wg ? ['fc-dns'] : [])], outboundTag: proxy[0].tag }]
    }
  }
}

export const appTag = (id: string): string => `app:${id}`

export function xrayConfig(p: Profile, inbound: { port: number; protocol: 'socks' | 'http' }, verbose = false): Json {
  const log = { loglevel: verbose ? 'info' : 'warning' }
  const inbounds = [
    {
      tag: 'fc-in',
      listen: '127.0.0.1',
      port: inbound.port,
      protocol: inbound.protocol,
      settings: inbound.protocol === 'socks' ? { udp: true, auth: 'noauth' } : {}
    }
  ]
  if (p.xrayJson) {
    const cfg = structuredClone(p.xrayJson)
    delete cfg.api
    delete cfg.stats
    return { ...cfg, log, inbounds }
  }
  if (!p.node) throw new Error('profile has no node')
  return {
    log,
    ...(p.node.protocol === 'wireguard' ? { dns: WG_DNS } : {}),
    inbounds,
    outbounds: [...xrayOutbounds(p.node, 'proxy'), { tag: 'direct', protocol: 'freedom' }]
  }
}
