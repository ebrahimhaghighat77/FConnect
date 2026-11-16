import { useState } from 'react'
import type { Snapshot, ToggleSetting } from '../../../shared/types'
import { toast } from '../components/Toast'
import { errorText } from '../lib'

const DEFAULTS: Record<ToggleSetting, boolean> = {
  verbose: false,
  killSwitch: true,
  autoConnect: true,
  autoServer: true,
  failover: true,
  launchAtLogin: false
}

const GROUPS: { title: string; items: { key: ToggleSetting; label: string; detail: string }[] }[] = [
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

function Switch({ on, busy, onChange, label }: { on: boolean; busy: boolean; onChange: (v: boolean) => void; label: string }) {
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
