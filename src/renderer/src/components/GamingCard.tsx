import { Gamepad2 } from 'lucide-react'
import { useState } from 'react'
import type { Snapshot } from '../../../shared/types'
import { errorText } from '../lib'
import { Switch } from '../pages/Settings'
import { toast } from './Toast'

export function GamingCard({ snap }: { snap: Snapshot }) {
  const [busy, setBusy] = useState(false)
  const on = snap.settings.gamingMode ?? false
  const g = snap.gaming

  const toggle = async (v: boolean) => {
    setBusy(true)
    try {
      await window.fc.setSetting('gamingMode', v)
    } catch (e) {
      toast(errorText(e), 'bad')
    } finally {
      setBusy(false)
    }
  }

  const text = !snap.elevated
    ? 'Needs FConnect to run as administrator.'
    : !on
      ? 'While you play, Windows Update, driver and Store downloads wait, so the game gets your whole connection.'
      : g.active
        ? `${g.game} is running, so Windows Update, driver and Store downloads are on hold. They resume 30 seconds after you close it.`
        : 'Waiting for a game from your Library to start. Downloads run normally until then.'

  return (
    <div className={`mt-6 w-full rounded-2xl border p-4 transition-colors ${g.active ? 'border-cyan/40 bg-cyan/5' : 'border-line bg-panel'}`}>
      <div className="flex items-center gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${g.active ? 'bg-cyan/15 text-cyan' : 'bg-raised text-muted'}`}>
          <Gamepad2 className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-[14px] font-medium">Gaming mode</span>
          {g.active && <span className="rounded-md bg-cyan/15 px-1.5 py-px text-[11px] font-semibold text-cyan">Active</span>}
        </div>
        <Switch on={on} busy={busy || !snap.elevated} onChange={(v) => void toggle(v)} label="Gaming mode" />
      </div>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-faint">{text}</p>
      {g.error && <p className="mt-2 text-[12px] leading-relaxed text-bad">{g.error}</p>}
    </div>
  )
}
