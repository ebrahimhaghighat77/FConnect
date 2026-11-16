import { app } from 'electron'
import { execFile } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { runDir } from './store'

const run = promisify(execFile)
const TASK = 'FConnect'

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// A logon task instead of the Run key: FConnect needs admin, and the Run key would raise a UAC prompt at every sign-in.
export async function setLaunchAtLogin(on: boolean, test?: { name: string; exe: string }): Promise<void> {
  if (!app.isPackaged && !test) throw new Error('Start with Windows works in the installed app')
  const name = test?.name ?? TASK
  if (!on) {
    await run('schtasks.exe', ['/Delete', '/F', '/TN', name], { windowsHide: true, timeout: 15000 }).catch(() => undefined)
    return
  }
  const exe = test?.exe ?? process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath
  const user = xml(`${process.env.USERDOMAIN}\\${process.env.USERNAME}`)
  const task = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Start FConnect in the tray when you sign in</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>${user}</UserId><Delay>PT10S</Delay></LogonTrigger></Triggers>
  <Principals><Principal id="Author"><UserId>${user}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author"><Exec><Command>${xml(exe)}</Command><Arguments>--hidden</Arguments></Exec></Actions>
</Task>`
  const file = join(runDir, 'autostart.xml')
  writeFileSync(file, '﻿' + task, 'utf16le')
  await run('schtasks.exe', ['/Create', '/F', '/TN', name, '/XML', file], { windowsHide: true, timeout: 15000 })
}
