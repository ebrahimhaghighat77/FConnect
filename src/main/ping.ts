import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Profile } from '../shared/types'
import { Core, freePort, portOpen, waitFor } from './core/cores'
import { QualityProbe } from './core/quality'
import { singboxOutbound, socksBackendConfig } from './core/singboxConfig'
import { xrayConfig } from './core/xrayConfig'
import { runDir } from './store'

const probeDir = join(runDir, 'probe')
mkdirSync(probeDir, { recursive: true })

// Measured the same way as the live ping on Home, so the list and the home screen agree.
async function testOne(p: Profile): Promise<number> {
  const port = await freePort()
  const core = new Core(p.engine, () => undefined)
  const probe = new QualityProbe(port)
  try {
    const cfg =
      p.engine === 'xray' ? xrayConfig(p, { port, protocol: 'http' }) : socksBackendConfig(singboxOutbound(p.node!, 'proxy'), port)
    await core.start(`probe-${p.id}`, cfg, probeDir)
    await waitFor(() => portOpen(port), core, 5000)
    const first = await probe.sample(5000)
    if (first === null) return -1
    const second = await probe.sample(3000)
    return Math.min(first, second ?? first)
  } catch {
    return -1
  } finally {
    probe.close()
    await core.stop()
  }
}

export async function testProfiles(profiles: Profile[], onResult: (id: string, ms: number) => void): Promise<void> {
  const queue = [...profiles]
  const worker = async (): Promise<void> => {
    for (let p = queue.shift(); p; p = queue.shift()) onResult(p.id, await testOne(p))
  }
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker))
}
