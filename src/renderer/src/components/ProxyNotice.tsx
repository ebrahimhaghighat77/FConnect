import { Waypoints } from 'lucide-react'
import type { Snapshot } from '../../../shared/types'

export function ProxyNotice({ snap, className = '' }: { snap: Snapshot; className?: string }) {
  if (!snap.systemProxy) return null
  const affected = snap.apps.filter((a) => a.followsSystemProxy && snap.settings.selectedApps.includes(a.id))
  if (!affected.length) return null
  const list = affected.map((a) => a.name)
  const names = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0]
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-[12.5px] leading-relaxed ${className}`}>
      <Waypoints className="mt-0.5 size-4 shrink-0 text-warn" />
      <div className="min-w-0">
        <div className="font-medium text-warn">{names} can't use FConnect right now</div>
        <p className="mt-1 text-muted">
          Windows sends apps to a proxy at <span className="select-text font-mono text-ink">{snap.systemProxy}</span>, usually because another
          VPN app such as Happ is in proxy mode. {names} follow that setting, so their traffic goes through that app and never reaches
          FConnect. Turn off the system proxy in that app, then restart {names}.
        </p>
      </div>
    </div>
  )
}
