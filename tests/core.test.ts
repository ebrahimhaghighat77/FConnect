import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseImport, parseLink } from '../src/main/core/links'
import { proxifyreConfig } from '../src/main/core/proxifyreConfig'
import { singboxOutbound, socksBackendConfig } from '../src/main/core/singboxConfig'
import { xrayConfig, xrayTunnelConfig } from '../src/main/core/xrayConfig'
import type { AppEntry, Profile } from '../src/shared/types'

const BIN = join(__dirname, '..', 'resources', 'bin')
const TMP = mkdtempSync(join(tmpdir(), 'fconnect-test-'))
const UUID = 'b831381d-6324-4d53-ad4f-8cda48b30811'
const PBK = 'Z84J2IelR9ch3k8VtlVhhs5ycBUlXA7wHBWcBrjqnAw'
const b64 = (s: string) => Buffer.from(s).toString('base64')
const WG_KEY = 'eCtXsJZ27+4PbhDkHnB923tkUn2Gj59wZw5wFA75MnU='
const WG_PUB = 'Cr8hWlKvtDt7nrvf+f0brNQQzabAqrjfBvas9pmowjo='

const vmessLink = (o: Record<string, unknown>) =>
  'vmess://' + b64(JSON.stringify({ v: '2', ps: 'VM', add: 'vm.example.com', port: '443', id: UUID, aid: '0', scy: 'auto', ...o }))

const LINKS: Record<string, { link: string; engine: 'xray' | 'sing-box' }> = {
  realityVision: {
    link: `vless://${UUID}@1.2.3.4:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.speedtest.net&fp=chrome&pbk=${PBK}&sid=6ba85179e30d4fc2&type=tcp&headerType=none#DE%20Reality`,
    engine: 'xray'
  },
  vlessWsInsecure: {
    link: `vless://${UUID}@cdn.example.com:443?encryption=none&security=tls&sni=cdn.example.com&type=ws&host=cdn.example.com&path=%2Fws%3Fed%3D2048&allowInsecure=1#WS`,
    engine: 'sing-box'
  },
  vlessXhttp: {
    link: `vless://${UUID}@a.example.com:443?encryption=none&security=reality&sni=x.com&fp=chrome&pbk=${PBK}&sid=6ba8&type=xhttp&path=%2Fxh&mode=auto#XHTTP`,
    engine: 'xray'
  },
  vlessNoTls: {
    link: `vless://${UUID}@a.example.com:80?encryption=none&security=none&type=httpupgrade&host=a.example.com&path=%2F#HU`,
    engine: 'sing-box'
  },
  vlessFragment: {
    link: `vless://${UUID}@a.example.com:443?encryption=none&security=tls&sni=a.example.com&type=ws&path=%2F&fragment=tlshello,10-20,10-20#FRAG`,
    engine: 'xray'
  },
  vmessWsTls: { link: vmessLink({ net: 'ws', host: 'vm.example.com', path: '/v', tls: 'tls', sni: 'vm.example.com' }), engine: 'xray' },
  vmessTcpHttp: { link: vmessLink({ net: 'tcp', type: 'http', host: 'vm.example.com', path: '/' }), engine: 'xray' },
  vmessKcp: { link: vmessLink({ net: 'kcp', type: 'wechat-video', path: 'seed' }), engine: 'xray' },
  vmessH2: { link: vmessLink({ net: 'h2', host: 'vm.example.com', path: '/', tls: 'tls' }), engine: 'sing-box' },
  trojanGrpc: { link: 'trojan://p%40ss@a.example.com:443?security=tls&sni=a.example.com&type=grpc&serviceName=gun#TR', engine: 'xray' },
  ssSip002: { link: `ss://${b64('chacha20-ietf-poly1305:pw')}@1.2.3.4:8388#SS`, engine: 'sing-box' },
  ssLegacy: { link: `ss://${b64('aes-256-gcm:pw@1.2.3.4:8388')}#SS2`, engine: 'sing-box' },
  ss2022: { link: 'ss://2022-blake3-aes-128-gcm:MTIzNDU2Nzg5MDEyMzQ1Ng%3D%3D@1.2.3.4:8388#SS2022', engine: 'sing-box' },
  ssPlugin: { link: `ss://${b64('aes-128-gcm:pw')}@1.2.3.4:8388/?plugin=obfs-local%3Bobfs%3Dhttp%3Bobfs-host%3Db.com#SSP`, engine: 'sing-box' },
  hy2: { link: 'hysteria2://auth@a.example.com:443?sni=a.example.com&insecure=1&obfs=salamander&obfs-password=ob&mport=20000-30000#HY2', engine: 'sing-box' },
  hy2Range: { link: 'hy2://auth@a.example.com:443,20000-30000/?sni=a.example.com#HY2R', engine: 'sing-box' },
  tuic: { link: `tuic://${UUID}:pw@a.example.com:443?congestion_control=bbr&alpn=h3&sni=a.example.com&udp_relay_mode=native#TUIC`, engine: 'sing-box' },
  socks: { link: `socks://${b64('u:p')}@1.2.3.4:1080#SOCKS`, engine: 'sing-box' },
  wireguard: {
    link: `wireguard://${encodeURIComponent(WG_KEY)}@wg.example.com:51820?publickey=${encodeURIComponent(WG_PUB)}&address=10.0.0.2%2F32,fd00::2%2F128&mtu=1420&reserved=1,2,3#WG`,
    engine: 'xray'
  },
  wireguardHiddify: { link: `wg://162.159.192.1:2408?pk=${WG_KEY}&local_address=172.16.0.2&peer_pk=${WG_PUB}&mtu=1280#WGH`, engine: 'xray' },
  ssh: { link: 'ssh://root:p%40ss@ssh.example.com:2222#SSH', engine: 'sing-box' },
  anytls: { link: 'anytls://pw@a.example.com:443?sni=a.example.com&insecure=1#ANY', engine: 'sing-box' },
  naive: { link: 'naive+https://user:pass@n.example.com:443#NAIVE', engine: 'sing-box' }
}

const APPS: AppEntry[] = [
  {
    id: 'dota2',
    name: 'Dota 2',
    kind: 'game',
    source: 'preset',
    folders: ['C:\\Program Files (x86)\\Steam\\steamapps\\common\\dota 2 beta'],
    processNames: ['dota2.exe'],
    installed: true
  },
  { id: 'discord', name: 'Discord', kind: 'app', source: 'preset', folders: ['C:/Users/x/AppData/Local/Discord/'], processNames: [], installed: true }
]

function check(engine: 'xray' | 'sing-box', name: string, cfg: unknown): void {
  const file = join(TMP, `${name}-${engine}.json`)
  writeFileSync(file, JSON.stringify(cfg, null, 2))
  const args = engine === 'xray' ? ['run', '-test', '-c', file] : ['check', '-c', file]
  try {
    execFileSync(join(BIN, `${engine}.exe`), args, { stdio: 'pipe' })
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer }
    throw new Error(`${engine} rejected ${name}:\n${err.stdout}\n${err.stderr}`)
  }
}

function validate(name: string, p: Profile): void {
  const ports = { apps: [{ id: 'dota2', port: 20001 }, { id: 'discord', port: 20006 }], probe: 20002, metrics: 20003 }
  if (p.engine === 'xray') {
    check('xray', name, xrayTunnelConfig(p, ports, true))
    check('xray', `${name}-probe`, xrayConfig(p, { port: 20004, protocol: 'http' }))
  } else {
    check('sing-box', name, socksBackendConfig(singboxOutbound(p.node!, 'proxy'), 20005))
    check('xray', `${name}-front`, xrayTunnelConfig(p, { ...ports, native: 20005 }))
  }
}

describe('share links', () => {
  for (const [name, { link, engine }] of Object.entries(LINKS)) {
    it(`${name} → ${engine} config accepted by the core`, () => {
      const p = parseLink(link)
      expect(p.engine).toBe(engine)
      validate(name, p)
    })
  }

  it('keeps names, credentials and transport details', () => {
    const r = parseLink(LINKS.realityVision.link)
    expect(r.name).toBe('DE Reality')
    expect(r.node).toMatchObject({ server: '1.2.3.4', port: 443, uuid: UUID, flow: 'xtls-rprx-vision', security: 'reality', publicKey: PBK })

    const tr = parseLink(LINKS.trojanGrpc.link)
    expect(tr.node).toMatchObject({ password: 'p@ss', network: 'grpc', serviceName: 'gun' })

    const ws = singboxOutbound(parseLink(LINKS.vlessWsInsecure.link).node!, 'proxy') as any
    expect(ws.transport).toMatchObject({ path: '/ws', max_early_data: 2048 })
    expect(ws.tls.insecure).toBe(true)

    const ss = parseLink(LINKS.ss2022.link).node!
    expect(ss).toMatchObject({ method: '2022-blake3-aes-128-gcm', password: 'MTIzNDU2Nzg5MDEyMzQ1Ng==' })

    const hy = parseLink(LINKS.hy2Range.link).node!
    expect(hy).toMatchObject({ port: 443, serverPorts: ['20000:30000'] })
  })

  it('imports base64 subscriptions and reports bad lines', () => {
    const sub = b64([LINKS.realityVision.link, LINKS.tuic.link, 'garbage://x', LINKS.ssLegacy.link].join('\n'))
    const r = parseImport(sub)
    expect(r.profiles.map((p) => p.name)).toEqual(['DE Reality', 'TUIC', 'SS2'])
    expect(r.errors).toHaveLength(1)
  })

  it('imports a full Xray JSON config', () => {
    const json = JSON.stringify({
      remarks: 'My JSON',
      inbounds: [{ port: 1080, protocol: 'socks' }],
      outbounds: [
        {
          protocol: 'vless',
          settings: { vnext: [{ address: 'j.example.com', port: 443, users: [{ id: UUID, encryption: 'none' }] }] },
          streamSettings: { network: 'xhttp', security: 'tls', tlsSettings: { serverName: 'j.example.com' } }
        },
        { protocol: 'freedom', tag: 'direct' }
      ]
    })
    const [p] = parseImport(json).profiles
    expect(p).toMatchObject({ name: 'My JSON', engine: 'xray', address: 'j.example.com:443', transport: 'xhttp tls' })
    validate('xrayJson', p)
  })
})

describe('WireGuard and friends', () => {
  it('reads keys with a literal + from the query and fills /32 on bare addresses', () => {
    const n = parseLink(LINKS.wireguardHiddify.link).node!
    expect(n).toMatchObject({ privateKey: WG_KEY, peerPublicKey: WG_PUB, localAddress: ['172.16.0.2/32'], mtu: 1280 })
    expect(parseLink(LINKS.wireguard.link).node).toMatchObject({ reserved: [1, 2, 3], localAddress: ['10.0.0.2/32', 'fd00::2/128'] })
  })

  it('imports a WireGuard .conf file', () => {
    const conf = `# Office\n[Interface]\nPrivateKey = ${WG_KEY}\nAddress = 10.8.0.2/32, fd00::2/128\nDNS = 1.1.1.1\nMTU = 1380\n\n[Peer]\nPublicKey = ${WG_PUB}\nPresharedKey = ${WG_KEY}\nEndpoint = vpn.example.com:51820\nAllowedIPs = 0.0.0.0/0, ::/0\nPersistentKeepalive = 25\n`
    const { profiles, errors } = parseImport(conf)
    expect(errors).toEqual([])
    expect(profiles[0]).toMatchObject({ name: 'Office', engine: 'xray', protocol: 'wireguard', address: 'vpn.example.com:51820' })
    expect(profiles[0].node).toMatchObject({ preSharedKey: WG_KEY, keepAlive: 25, mtu: 1380 })
    validate('wgConf', profiles[0])
  })

  it('explains that AmneziaWG is not supported', () => {
    const awg = `[Interface]\nPrivateKey = ${WG_KEY}\nAddress = 10.8.0.2/32\nJc = 4\nS1 = 50\nH1 = 1\n[Peer]\nPublicKey = ${WG_PUB}\nEndpoint = 1.2.3.4:51820\n`
    expect(parseImport(awg).errors[0]).toMatch(/AmneziaWG/)
  })

  it('keeps ssh, anytls and naive credentials', () => {
    expect(parseLink(LINKS.ssh.link).node).toMatchObject({ username: 'root', password: 'p@ss', port: 2222 })
    expect(parseLink(LINKS.anytls.link).node).toMatchObject({ password: 'pw', insecure: true })
    expect(parseLink(LINKS.naive.link).node).toMatchObject({ username: 'user', password: 'pass' })
  })
})

describe('ProxiFyre rules', () => {
  it('gives each app its own rule and port, folders with a trailing slash', () => {
    const cfg = proxifyreConfig(
      APPS.map((app, i) => ({ app, port: 20001 + i })),
      ['C:\\FC\\bin']
    ) as any
    expect(cfg.proxies).toHaveLength(2)
    expect(cfg.proxies[0]).toMatchObject({
      appNames: ['C:\\Program Files (x86)\\Steam\\steamapps\\common\\dota 2 beta\\', 'dota2.exe'],
      socks5ProxyEndpoint: '127.0.0.1:20001',
      supportedProtocols: ['TCP', 'UDP'],
      supportedAddressFamilies: ['IPv4']
    })
    expect(cfg.proxies[1]).toMatchObject({ appNames: ['C:\\Users\\x\\AppData\\Local\\Discord\\'], socks5ProxyEndpoint: '127.0.0.1:20002' })
    expect(cfg.bypassLan).toBe(false)
    expect(cfg.excludes).toEqual(['C:\\FC\\bin\\'])
  })

  it('drops names an earlier app already claimed, ignoring case', () => {
    const claude = (id: string, exe: string): AppEntry => ({ id, name: id, kind: 'app', source: 'custom', folders: [], processNames: [exe], installed: true })
    const cfg = proxifyreConfig(
      [
        { app: claude('a', 'claude.exe'), port: 1 },
        { app: claude('b', 'Claude.exe'), port: 2 }
      ],
      []
    ) as any
    expect(cfg.proxies).toHaveLength(1)
    expect(cfg.proxies[0].appNames).toEqual(['claude.exe'])
  })
})
