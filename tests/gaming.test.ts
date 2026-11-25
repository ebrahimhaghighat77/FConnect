import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { pauseEntries, regValue } from '../src/main/gaming'

describe('gaming mode', () => {
  it('pauses all three update kinds for three hours, in the format Settings writes', () => {
    const now = Date.UTC(2026, 10, 23, 18, 30, 15, 456)
    const entries = Object.fromEntries(pauseEntries(now))
    expect(Object.keys(entries)).toHaveLength(6)
    expect(entries.PauseUpdatesStartTime).toBe('2026-11-23T18:30:15Z')
    expect(entries.PauseUpdatesExpiryTime).toBe('2026-11-23T21:30:15Z')
    expect(entries.PauseQualityUpdatesEndTime).toBe(entries.PauseUpdatesExpiryTime)
    expect(entries.PauseFeatureUpdatesEndTime).toBe(entries.PauseUpdatesExpiryTime)
  })

  it('reads a REG_SZ value from real reg.exe output', () => {
    const out = execFileSync('reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', '/v', 'ProductName'], { encoding: 'utf8' })
    expect(regValue(out, 'ProductName')).toMatch(/^Windows/)
    expect(regValue(out, 'PauseUpdatesExpiryTime')).toBeUndefined()
  })
})
