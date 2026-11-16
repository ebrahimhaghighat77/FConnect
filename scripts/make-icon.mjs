import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'build', 'icon.svg'))
const png = (size) => Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng())

mkdirSync(join(root, 'resources'), { recursive: true })
writeFileSync(join(root, 'resources', 'icon.png'), png(256))
writeFileSync(join(root, 'build', 'icon.png'), png(512))
writeFileSync(join(root, 'build', 'icon.ico'), await pngToIco([16, 24, 32, 48, 64, 128, 256].map(png)))
console.log('icons written')
