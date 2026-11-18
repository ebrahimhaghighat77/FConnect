import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppEntry, Profile, Settings, Subscription } from '../shared/types'

export interface Data {
  profiles: Profile[]
  subscriptions: Subscription[]
  customApps: AppEntry[]
  settings: Settings
  resumeAfterUpdate?: boolean
}

const dir = app.getPath('userData')
const file = join(dir, 'data.json')

function load(): Data {
  const empty: Data = { profiles: [], subscriptions: [], customApps: [], settings: { selectedApps: [] } }
  if (!existsSync(file)) return empty
  try {
    return { ...empty, ...JSON.parse(readFileSync(file, 'utf8')) }
  } catch {
    return empty
  }
}

export const data: Data = load()

export function save(): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(file + '.tmp', JSON.stringify(data, null, 2))
  renameSync(file + '.tmp', file)
}

export const runDir = join(dir, 'run')
mkdirSync(runDir, { recursive: true })
