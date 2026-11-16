export interface Preset {
  id: string
  name: string
  kind: 'game' | 'app'
  steamAppId?: number
  epicName?: RegExp
  processNames: string[]
  extraFolders?: string[]
  hint?: string
  followsSystemProxy?: boolean
}

const EAC = 'C:\\Program Files (x86)\\EasyAntiCheat_EOS'

export const PRESETS: Preset[] = [
  {
    id: 'dota2',
    name: 'Dota 2',
    kind: 'game',
    steamAppId: 570,
    processNames: ['dota2.exe'],
    hint: "If Dota 2 can't sign in or find a match, turn on Steam too. Steam downloads then use the tunnel as well."
  },
  {
    id: 'arc-raiders',
    name: 'ARC Raiders',
    kind: 'game',
    steamAppId: 1808500,
    epicName: /arc\s*raiders/i,
    processNames: ['PioneerGame.exe'],
    extraFolders: ['C:\\Program Files\\Elytra', EAC]
  },
  {
    id: 'broken-arrow',
    name: 'Broken Arrow',
    kind: 'game',
    steamAppId: 1604270,
    processNames: ['BrokenArrow.exe', 'EACLauncher.exe'],
    extraFolders: [EAC]
  },
  { id: 'discord', name: 'Discord', kind: 'app', processNames: ['Discord.exe'], followsSystemProxy: true },
  {
    id: 'claude',
    name: 'Claude',
    kind: 'app',
    processNames: ['claude.exe', 'cowork-svc.exe', 'claude-ssh-broker.exe'],
    followsSystemProxy: true,
    hint: 'Covers the Claude app, Claude Code and their helpers, also after Claude updates. Restart Claude after you connect so it opens fresh connections.'
  },
  {
    id: 'steam',
    name: 'Steam',
    kind: 'app',
    processNames: ['steam.exe', 'steamwebhelper.exe'],
    followsSystemProxy: true,
    hint: 'Only the Steam client. Game downloads also go through the tunnel while this is on.'
  }
]
