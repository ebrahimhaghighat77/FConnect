import { ArrowDownToLine, ExternalLink, LoaderCircle, RefreshCw, RotateCw } from 'lucide-react'
import { useState } from 'react'
import type { Snapshot, ToggleSetting } from '../../../shared/types'
import { toast } from '../components/Toast'
import { bytes, errorText, useActivity } from '../lib'

const DEFAULTS: Record<ToggleSetting, boolean> = {
  verbose: false,
  killSwitch: true,
  autoConnect: true,
  autoServer: true,
  failover: true,
  launchAtLogin: false,
  autoUpdate: true,
  gamingMode: false
}

const GROUPS: { title: string; items: { key: ToggleSetting; label: string; detail: string }[] }[] = [
  {
    title: 'Updates',
    items: [
      {
        key: 'autoUpdate',
        label: 'Check for updates automatically',
        detail: 'Looks for a new version on GitHub when FConnect starts and every six hours. Nothing is downloaded until you choose to.'
      }
    ]
  },
  {
    title: 'Protection',
    items: [
      {
        key: 'killSwitch',
        label: 'Kill switch',
        detail: 'If the server or the tunnel drops, your picked apps are paused instead of falling back to your Iranian IP. FConnect keeps trying to reconnect.'
      }
    ]
  },
  {
    title: 'Servers',
    items: [
      { key: 'autoServer', label: 'Pick the fastest server', detail: 'Each connect tests your servers and uses the one with the lowest ping.' },
      { key: 'failover', label: 'Switch servers when one stops responding', detail: 'If the server stops answering for about ten seconds, FConnect moves to the next fastest one. Only your picked apps notice.' }
    ]
  },
  {
    title: 'Automation',
    items: [
      {
        key: 'autoConnect',
        label: 'Connect when a picked game starts',
        detail: 'FConnect connects when one of your picked games opens and disconnects about 45 seconds after the last one closes. Apps like Discord do not trigger it.'
      },
      { key: 'launchAtLogin', label: 'Start with Windows', detail: 'Opens FConnect in the tray when you sign in, without a UAC prompt.' }
    ]
  },
  {
    title: 'Troubleshooting',
    items: [{ key: 'verbose', label: 'Detailed logs', detail: 'Logs every connection. Takes effect the next time you connect.' }]
  }
]

export function Switch({ on, busy, onChange, label }: { on: boolean; busy: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-gradient-to-r from-violet to-cyan' : 'bg-line'}`}
    >
      <span className={`absolute left-0 top-0.5 size-5 rounded-full bg-ink shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

const button = 'flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-[13px] disabled:opacity-50'
const primary = `${button} bg-gradient-to-r from-violet to-cyan font-semibold text-void`
const secondary = `${button} border border-line hover:border-violet/60`

function UpdateRow({ snap }: { snap: Snapshot }) {
  const u = snap.update
  const activity = useActivity()
  const live = snap.tunnel.status !== 'disconnected'
  const game = live ? snap.apps.find((a) => a.kind === 'game' && snap.settings.selectedApps.includes(a.id) && activity[a.id]?.running) : undefined
  const act = (fn: () => Promise<void>) => void fn().catch((e) => toast(errorText(e), 'bad'))
  const size = u.size ? ` (up to ${bytes(u.size)})` : ''

  const text =
    u.status === 'checking'
      ? 'Checking GitHub for a new version…'
      : u.status === 'latest'
        ? 'You have the latest version.'
        : u.status === 'available'
          ? u.portable
            ? `Version ${u.version} is available. The portable app can't update itself, so download the new one from GitHub.`
            : `Version ${u.version} is available${size}.`
          : u.status === 'downloading'
            ? `Downloading version ${u.version}…`
            : u.status === 'ready'
              ? game
                ? `Version ${u.version} is ready. Close ${game.name} first: updating restarts FConnect and the game would lose the tunnel for a moment.`
                : `Version ${u.version} is ready. FConnect restarts to finish${live ? ' and connects again' : ''}.`
              : u.status === 'error'
                ? u.error
                : 'Not checked yet.'

  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-5">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium">FConnect {u.current}</div>
          <p className={`mt-1 max-w-[60ch] text-[12.5px] leading-relaxed ${u.status === 'error' ? 'text-bad' : u.status === 'available' || u.status === 'ready' ? 'text-cyan' : 'text-faint'}`}>
            {text}
          </p>
        </div>
        {u.status === 'available' && !u.portable && (
          <button onClick={() => act(window.fc.openReleases)} className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
            What's new
            <ExternalLink className="size-3.5" />
          </button>
        )}
        {u.status === 'available' && u.portable ? (
          <button onClick={() => act(window.fc.openReleases)} className={primary}>
            <ExternalLink className="size-4" />
            Get it on GitHub
          </button>
        ) : u.status === 'available' ? (
          <button onClick={() => act(window.fc.downloadUpdate)} className={primary}>
            <ArrowDownToLine className="size-4" />
            Download
          </button>
        ) : u.status === 'ready' ? (
          <button disabled={!!game} onClick={() => act(window.fc.installUpdate)} className={primary}>
            <RotateCw className="size-4" />
            Restart and update
          </button>
        ) : u.status === 'error' && u.version ? (
          <button onClick={() => act(window.fc.downloadUpdate)} className={secondary}>
            <RefreshCw className="size-4" />
            Try again
          </button>
        ) : u.status !== 'downloading' ? (
          <button disabled={u.status === 'checking'} onClick={() => act(window.fc.checkUpdate)} className={secondary}>
            {u.status === 'checking' ? <LoaderCircle className="spin size-4" /> : <RefreshCw className="size-4" />}
            Check now
          </button>
        ) : null}
      </div>
      {u.status === 'downloading' && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-gradient-to-r from-violet to-cyan transition-[width]" style={{ width: `${u.percent ?? 0}%` }} />
          </div>
          <span className="w-10 text-right font-display text-[12px] tabular-nums text-muted">{u.percent ?? 0}%</span>
        </div>
      )}
    </div>
  )
}

export function Settings({ snap }: { snap: Snapshot }) {
  const [busy, setBusy] = useState<ToggleSetting | null>(null)
  const value = (k: ToggleSetting) => snap.settings[k] ?? DEFAULTS[k]

  const change = async (k: ToggleSetting, on: boolean) => {
    setBusy(k)
    try {
      await window.fc.setSetting(k, on)
    } catch (e) {
      toast(errorText(e), 'bad')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[760px] px-8 py-7">
      <h1 className="font-display text-[30px] font-semibold tracking-tight">Settings</h1>
      {GROUPS.map((g) => (
        <section key={g.title} className="mt-7">
          <h2 className="mb-2.5 font-display text-[15px] font-medium text-muted">{g.title}</h2>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            {g.title === 'Updates' && <UpdateRow snap={snap} />}
            {g.items.map((it) => (
              <div key={it.key} className="flex items-start gap-5 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{it.label}</div>
                  <p className="mt-1 max-w-[60ch] text-[12.5px] leading-relaxed text-faint">{it.detail}</p>
                </div>
                <Switch on={value(it.key)} busy={busy === it.key} onChange={(v) => void change(it.key, v)} label={it.label} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
