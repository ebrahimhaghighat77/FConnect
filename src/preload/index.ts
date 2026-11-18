import { contextBridge, ipcRenderer } from 'electron'
import type { FcApi } from '../shared/types'

const call =
  (name: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(`fc:${name}`, ...args)

const listen =
  (channel: string) =>
  (cb: (payload: any) => void): (() => void) => {
    const fn = (_e: unknown, payload: unknown): void => cb(payload)
    ipcRenderer.on(channel, fn)
    return () => ipcRenderer.removeListener(channel, fn)
  }

const api: FcApi = {
  snapshot: call('snapshot'),
  importText: call('importText'),
  importClipboard: call('importClipboard'),
  importFile: call('importFile'),
  addSubscription: call('addSubscription'),
  updateSubscription: call('updateSubscription'),
  removeSubscription: call('removeSubscription'),
  removeProfile: call('removeProfile'),
  renameProfile: call('renameProfile'),
  selectProfile: call('selectProfile'),
  testProfiles: call('testProfiles'),
  toggleApp: call('toggleApp'),
  addCustomApp: call('addCustomApp'),
  addProcessApp: call('addProcessApp'),
  removeCustomApp: call('removeCustomApp'),
  listProcesses: call('listProcesses'),
  rescanApps: call('rescanApps'),
  connect: call('connect'),
  disconnect: call('disconnect'),
  logs: call('logs'),
  setSetting: call('setSetting'),
  checkUpdate: call('checkUpdate'),
  downloadUpdate: call('downloadUpdate'),
  installUpdate: call('installUpdate'),
  openReleases: call('openReleases'),
  windowAction: (action) => ipcRenderer.send('fc:window', action),
  onState: listen('fc:state'),
  onTraffic: listen('fc:traffic'),
  onActivity: listen('fc:activity'),
  onQuality: listen('fc:quality'),
  onLog: listen('fc:log')
} as FcApi

contextBridge.exposeInMainWorld('fc', api)
contextBridge.exposeInMainWorld('fcDev', { relaunch: call('devRelaunch'), stop: call('devStop'), autostart: call('devAutostart'), quit: call('devQuit') })
