import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { parseImport, parseLink } from '../src/main/core/links'
import { singboxOutbound, socksBackendConfig } from '../src/main/core/singboxConfig'
import { xrayConfig, xrayTunnelConfig } from '../src/main/core/xrayConfig'

const BIN = join(__dirname, '..', 'resources', 'bin')
const TMP = mkdtempSync(join(tmpdir(), 'fconnect-loop-'))
const procs: ChildProcess[] = []
afterAll(() => procs.forEach((p) => p.kill()))

const sb = (...args: string[]) => execFileSync(join(BIN, 'sing-box.exe'), args, { encoding: 'utf8' })
const keypair = () => {
  const out = sb('generate', 'wg-keypair')
  return { priv: /PrivateKey: (\S+)/.exec(out)![1], pub: /PublicKey: (\S+)/.exec(out)![1] }
}
function run(engine: 'sing-box' | 'xray', name: string, cfg: unknown): void {
  const path = join(TMP, `${name}.json`)
  writeFileSync(path, JSON.stringify(cfg))
  procs.push(spawn(join(BIN, `${engine}.exe`), ['run', '-c', path], { stdio: 'ignore' }))
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const viaProxy = (proxyPort: number, url: string) =>
  new Promise<string>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: proxyPort, path: url, timeout: 8000 }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve(body))
    })
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.end()
  })

const target = createServer((req, res) => res.end(`hello from ${req.socket.remoteAddress}`))
const TARGET = 53111
target.listen(TARGET, '127.0.0.1')
afterAll(() => target.close())

it('WireGuard .conf goes through a real WireGuard server', async () => {
  const server = keypair()
  const client = keypair()
  run('sing-box', 'wg-server', {
    log: { level: 'warn' },
    endpoints: [
      { type: 'wireguard', tag: 'wg-in', address: ['10.66.0.1/24'], private_key: server.priv, listen_port: 51999, peers: [{ public_key: client.pub, allowed_ips: ['10.66.0.2/32'] }] }
    ],
    outbounds: [{ type: 'direct', tag: 'direct' }],
    dns: { servers: [{ type: 'hosts', tag: 'hosts', predefined: { 'probe.test': '10.66.0.1' } }] },
    route: {
      rules: [
        { port: 53, action: 'hijack-dns' },
        { ip_cidr: ['10.66.0.1/32'], action: 'route-options', override_address: '127.0.0.1' }
      ],
      final: 'direct'
    }
  })
  const conf = `[Interface]\nPrivateKey = ${client.priv}\nAddress = 10.66.0.2/32\nMTU = 1380\n[Peer]\nPublicKey = ${server.pub}\nEndpoint = 127.0.0.1:51999\nAllowedIPs = 0.0.0.0/0\nPersistentKeepalive = 25\n`
  const profile = parseImport(conf, 'loop').profiles[0]
  run('xray', 'wg-client', xrayConfig(profile, { port: 53112, protocol: 'http' }))
  run('xray', 'wg-tunnel', xrayTunnelConfig(profile, { apps: [{ id: 'x', port: 53120 }], probe: 53121, metrics: 53122 }, true))
  await wait(2000)
  expect(await viaProxy(53112, `http://10.66.0.1:${TARGET}/`)).toMatch(/^hello from/)
  expect(await viaProxy(53121, `http://probe.test:${TARGET}/`)).toMatch(/^hello from/)
}, 30000)

it('AnyTLS link goes through a real AnyTLS server', async () => {
  const pem = sb('generate', 'tls-keypair', 'any.test')
  const cert = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.exec(pem)![0]
  const key = /-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/.exec(pem)![0]
  writeFileSync(join(TMP, 'cert.pem'), cert)
  writeFileSync(join(TMP, 'key.pem'), key)
  run('sing-box', 'any-server', {
    log: { level: 'warn' },
    inbounds: [
      { type: 'anytls', listen: '127.0.0.1', listen_port: 53113, users: [{ password: 'pw' }], tls: { enabled: true, certificate_path: join(TMP, 'cert.pem'), key_path: join(TMP, 'key.pem') } }
    ],
    outbounds: [{ type: 'direct', tag: 'direct' }]
  })
  const node = parseLink('anytls://pw@127.0.0.1:53113?sni=any.test&insecure=1#loop').node!
  run('sing-box', 'any-client', socksBackendConfig(singboxOutbound(node, 'proxy'), 53114))
  await wait(2000)
  expect(await viaProxy(53114, `http://127.0.0.1:${TARGET}/`)).toMatch(/^hello from/)
}, 20000)
