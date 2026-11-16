import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(root, '.cores-cache')
const bin = join(root, 'resources', 'bin')

const items = [
  {
    name: 'xray',
    url: 'https://github.com/XTLS/Xray-core/releases/download/v26.10.31/Xray-windows-64.zip',
    sha256: '2e04a9995a6f2ad1b28c0bb25c708ecb2695e43a1c9c7889c4b6ac2b48cf7a6a',
    keep: ['xray.exe']
  },
  {
    name: 'sing-box',
    url: 'https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-windows-amd64.zip',
    sha256: '99185d75d314a07dbba4a130c8ad986cbeb629a07927975636b341ca61f991df',
    keep: ['sing-box.exe', '*.dll']
  },
  {
    name: 'proxifyre',
    url: 'https://github.com/wiresock/proxifyre/releases/download/v2.6.4/ProxiFyre-v2.6.4-x64.zip',
    sha256: 'c7da1dc5fdf9aaa7828fbf5c2076c4f612cba7889dcac2e3d06dc2e1dee4c3df',
    folder: 'proxifyre'
  },
  {
    name: 'wpf-driver',
    url: 'https://github.com/wiresock/ndisapi/releases/download/v3.6.2/Windows.Packet.Filter.3.6.2.1.x64.msi',
    sha256: '9c388c0b7f189f7fa98720bae2caecf7d64f30910838b80b438ecf8956b8502c',
    file: 'WindowsPacketFilter-x64.msi'
  }
]

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

function wanted(file, patterns) {
  const base = file.split(/[\\/]/).pop().toLowerCase()
  return patterns.some((p) => (p.startsWith('*') ? base.endsWith(p.slice(1)) : base === p))
}

const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

mkdirSync(cache, { recursive: true })
mkdirSync(bin, { recursive: true })

for (const item of items) {
  const download = join(cache, item.url.split('/').pop())
  if (!existsSync(download) || sha(download) !== item.sha256) {
    console.log(`downloading ${item.url}`)
    const res = await fetch(item.url)
    if (!res.ok) throw new Error(`${item.name}: HTTP ${res.status}`)
    writeFileSync(download, Buffer.from(await res.arrayBuffer()))
  }
  const hash = sha(download)
  if (hash !== item.sha256) throw new Error(`${item.name}: sha256 mismatch ${hash}`)

  if (item.file) {
    copyFileSync(download, join(bin, item.file))
    console.log(`  -> ${item.file}`)
    continue
  }
  const out = join(cache, item.name)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out)
  execFileSync('tar', ['-xf', download, '-C', out])
  if (item.folder) {
    const exe = walk(out).find((f) => /proxifyre\.exe$/i.test(f))
    const dest = join(bin, item.folder)
    rmSync(dest, { recursive: true, force: true })
    cpSync(dirname(exe), dest, { recursive: true })
    console.log(`  -> ${item.folder}\\ (${readdirSync(dest).length} files)`)
    continue
  }
  for (const f of walk(out).filter((f) => wanted(f, item.keep))) {
    copyFileSync(f, join(bin, f.split(/[\\/]/).pop()))
    console.log(`  -> ${f.split(/[\\/]/).pop()}`)
  }
}
console.log(`cores ready in ${bin}`)
