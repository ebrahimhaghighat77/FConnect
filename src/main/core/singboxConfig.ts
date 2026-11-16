import type { ProxyNode } from '../../shared/types'

type Json = Record<string, unknown>

const UTLS = new Set(['chrome', 'firefox', 'edge', 'safari', '360', 'qq', 'ios', 'android', 'random', 'randomized'])

function tls(n: ProxyNode): Json | undefined {
  if (n.security === 'none') return undefined
  const fp = n.fingerprint?.toLowerCase()
  const utlsFp = fp && UTLS.has(fp) ? fp : n.security === 'reality' || fp ? 'chrome' : undefined
  return {
    enabled: true,
    server_name: n.sni || n.host?.split(',')[0] || n.server,
    insecure: n.insecure || undefined,
    alpn: n.alpn,
    utls: utlsFp ? { enabled: true, fingerprint: utlsFp } : undefined,
    reality: n.security === 'reality' ? { enabled: true, public_key: n.publicKey, short_id: n.shortId ?? '' } : undefined
  }
}

function transport(n: ProxyNode): Json | undefined {
  switch (n.network) {
    case 'ws': {
      const [path, query] = (n.path || '/').split('?')
      const ed = Number(new URLSearchParams(query ?? '').get('ed'))
      return {
        type: 'ws',
        path: ed ? path : n.path || '/',
        headers: n.host ? { Host: n.host } : undefined,
        max_early_data: ed || undefined,
        early_data_header_name: ed ? 'Sec-WebSocket-Protocol' : undefined
      }
    }
    case 'grpc':
      return { type: 'grpc', service_name: n.serviceName ?? '' }
    case 'httpupgrade':
      return { type: 'httpupgrade', host: n.host, path: n.path || '/' }
    case 'h2':
      return { type: 'http', host: n.host ? n.host.split(',') : undefined, path: n.path || '/' }
    case 'tcp':
      return undefined
    default:
      throw new Error(`${n.network} transport needs the Xray engine`)
  }
}

export function singboxOutbound(n: ProxyNode, tag: string): Json {
  const common = { tag, server: n.server, server_port: n.port }
  switch (n.protocol) {
    case 'vless':
      return { ...common, type: 'vless', uuid: n.uuid, flow: n.flow || undefined, packet_encoding: 'xudp', tls: tls(n), transport: transport(n) }
    case 'vmess':
      return { ...common, type: 'vmess', uuid: n.uuid, security: n.vmessSecurity || 'auto', alter_id: n.alterId || 0, tls: tls(n), transport: transport(n) }
    case 'trojan':
      return { ...common, type: 'trojan', password: n.password, tls: tls(n), transport: transport(n) }
    case 'shadowsocks':
      return { ...common, type: 'shadowsocks', method: n.method, password: n.password, plugin: n.plugin, plugin_opts: n.pluginOpts }
    case 'socks':
      return { ...common, type: 'socks', version: '5', username: n.username, password: n.password }
    case 'hysteria2':
      return {
        ...common,
        type: 'hysteria2',
        server_ports: n.serverPorts,
        password: n.password,
        obfs: n.obfs ? { type: n.obfs, password: n.obfsPassword } : undefined,
        tls: { enabled: true, server_name: n.sni || n.server, insecure: n.insecure || undefined, alpn: n.alpn }
      }
    case 'tuic':
      return {
        ...common,
        type: 'tuic',
        uuid: n.uuid,
        password: n.password,
        congestion_control: n.congestion || 'bbr',
        udp_relay_mode: n.udpRelayMode,
        tls: { enabled: true, server_name: n.sni || n.server, insecure: n.insecure || undefined, alpn: n.alpn ?? ['h3'] }
      }
    default:
      throw new Error(`unsupported protocol ${n.protocol}`)
  }
}

export function socksBackendConfig(proxy: Json, port: number, verbose = false): Json {
  return {
    log: { level: verbose ? 'debug' : 'warn' },
    inbounds: [{ type: 'mixed', tag: 'probe-in', listen: '127.0.0.1', listen_port: port }],
    outbounds: [proxy, { type: 'direct', tag: 'direct' }],
    route: { final: 'proxy', default_domain_resolver: { server: 'local', strategy: 'ipv4_only' } },
    dns: { servers: [{ type: 'local', tag: 'local' }], strategy: 'ipv4_only' }
  }
}
