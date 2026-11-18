export type Protocol =
  | 'vless'
  | 'vmess'
  | 'trojan'
  | 'shadowsocks'
  | 'socks'
  | 'hysteria2'
  | 'tuic'
  | 'wireguard'
  | 'ssh'
  | 'anytls'
  | 'naive'

export interface ProxyNode {
  protocol: Protocol
  server: string
  port: number
  uuid?: string
  password?: string
  username?: string
  method?: string
  flow?: string
  encryption?: string
  alterId?: number
  vmessSecurity?: string
  network: 'tcp' | 'ws' | 'grpc' | 'httpupgrade' | 'xhttp' | 'kcp' | 'h2'
  headerType?: string
  host?: string
  path?: string
  serviceName?: string
  grpcMode?: string
  xhttpMode?: string
  xhttpExtra?: unknown
  kcpSeed?: string
  security: 'none' | 'tls' | 'reality'
  sni?: string
  fingerprint?: string
  alpn?: string[]
  insecure?: boolean
  publicKey?: string
  shortId?: string
  spiderX?: string
  mldsa65Verify?: string
  pinnedCertSha256?: string
  verifyCertByName?: string
  fragment?: { packets: string; length: string; interval: string }
  obfs?: string
  obfsPassword?: string
  serverPorts?: string[]
  congestion?: string
  udpRelayMode?: string
  plugin?: string
  pluginOpts?: string
  privateKey?: string
  peerPublicKey?: string
  preSharedKey?: string
  localAddress?: string[]
  mtu?: number
  reserved?: number[]
  keepAlive?: number
}

export type Engine = 'sing-box' | 'xray'

export interface Profile {
  id: string
  name: string
  engine: Engine
  protocol: Protocol | 'xray-json'
  transport: string
  address: string
  node?: ProxyNode
  xrayJson?: Record<string, unknown>
  subId?: string
  ping?: number | null
}

export interface Subscription {
  id: string
  name: string
  url: string
  updatedAt?: number
  used?: number
  total?: number
  expire?: number
}

export interface AppEntry {
  id: string
  name: string
  kind: 'game' | 'app'
  source: 'preset' | 'steam' | 'epic' | 'system' | 'custom'
  folders: string[]
  helperFolders?: string[]
  processNames: string[]
  installed: boolean
  steamAppId?: number
  iconExe?: string
  cover?: string
  hint?: string
  followsSystemProxy?: boolean
}

export interface Settings {
  activeProfileId?: string
  selectedApps: string[]
  verbose?: boolean
  killSwitch?: boolean
  autoConnect?: boolean
  autoServer?: boolean
  failover?: boolean
  launchAtLogin?: boolean
}

export type ToggleSetting = 'verbose' | 'killSwitch' | 'autoConnect' | 'autoServer' | 'failover' | 'launchAtLogin'

export type TunnelStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'disconnecting'

export interface TunnelState {
  status: TunnelStatus
  since?: number
  profileId?: string
  error?: string
  note?: string
  ping?: number | null
}

export interface Traffic {
  up: number
  down: number
}

export interface Peer {
  host: string
  port: number
  network: 'tcp' | 'udp'
  hits: number
  last: number
  country?: string
  place?: string
}

export interface AppActivity {
  running: boolean
  up: number
  down: number
  total: number
  peers: Peer[]
}

export interface Quality {
  ping: number | null
  jitter: number | null
  loss: number
  history: (number | null)[]
}

export interface Snapshot {
  profiles: Profile[]
  subscriptions: Subscription[]
  settings: Settings
  apps: AppEntry[]
  tunnel: TunnelState
  elevated: boolean
  driver: boolean
  systemProxy?: string
  testing: string[]
}

export interface ImportSummary {
  added: number
  errors: string[]
}

export interface FcApi {
  snapshot(): Promise<Snapshot>
  importText(text: string): Promise<ImportSummary>
  importClipboard(): Promise<ImportSummary>
  importFile(): Promise<ImportSummary | null>
  addSubscription(url: string): Promise<ImportSummary>
  updateSubscription(id: string): Promise<ImportSummary>
  removeSubscription(id: string): Promise<void>
  removeProfile(id: string): Promise<void>
  renameProfile(id: string, name: string): Promise<void>
  selectProfile(id: string): Promise<void>
  testProfiles(ids: string[]): Promise<void>
  toggleApp(id: string, on: boolean): Promise<void>
  addCustomApp(mode: 'exe' | 'folder'): Promise<void>
  addProcessApp(p: RunningProcess): Promise<void>
  removeCustomApp(id: string): Promise<void>
  listProcesses(): Promise<RunningProcess[]>
  rescanApps(): Promise<void>
  connect(): Promise<void>
  disconnect(): Promise<void>
  logs(): Promise<LogLine[]>
  setSetting(key: ToggleSetting, on: boolean): Promise<void>
  windowAction(action: 'minimize' | 'close'): void
  onState(cb: (s: Snapshot) => void): () => void
  onTraffic(cb: (t: Traffic) => void): () => void
  onActivity(cb: (a: Record<string, AppActivity>) => void): () => void
  onQuality(cb: (q: Quality | null) => void): () => void
  onLog(cb: (l: LogLine) => void): () => void
}

export interface RunningProcess {
  name: string
  path: string
}

export interface LogLine {
  t: number
  src: 'xray' | 'sing-box' | 'proxifyre' | 'app'
  text: string
}
