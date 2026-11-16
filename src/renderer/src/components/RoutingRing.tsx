import { motion } from 'motion/react'
import { Power } from 'lucide-react'
import type { AppActivity, AppEntry, TunnelStatus } from '../../../shared/types'
import { isRouting } from '../lib'
import { AppThumb } from './AppThumb'

const MAX_NODES = 10

interface Props {
  apps: AppEntry[]
  activity: Record<string, AppActivity>
  status: TunnelStatus
  onPress: () => void
  size?: number
}

export function RoutingRing({ apps, activity, status, onPress, size = 460 }: Props) {
  const SIZE = size
  const C = SIZE / 2
  const ORBIT = Math.round(SIZE * 0.404)
  const CORE = Math.round(SIZE * 0.2)
  const on = status === 'connected'
  const busy = status === 'connecting' || status === 'disconnecting'
  const retrying = status === 'reconnecting'
  const shown = apps.slice(0, MAX_NODES)
  const extra = apps.length - shown.length
  const nodes = shown.map((app, i) => {
    const a = (-90 + (i * 360) / Math.max(shown.length, 1)) * (Math.PI / 180)
    return { app, x: C + ORBIT * Math.cos(a), y: C + ORBIT * Math.sin(a), cos: Math.cos(a), sin: Math.sin(a) }
  })

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="absolute inset-0" aria-hidden>
        <defs>
          <linearGradient id="spoke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8B5CF6" />
            <stop offset="1" stopColor="#22D3EE" />
          </linearGradient>
        </defs>
        <circle cx={C} cy={C} r={ORBIT} fill="none" stroke="#272738" strokeDasharray="2 7" />
        <circle cx={C} cy={C} r={CORE + 34} fill="none" stroke={on ? 'url(#spoke)' : '#272738'} strokeOpacity={on ? 0.35 : 1} />
        {nodes.map(({ app, cos, sin }) => {
          const live = on && isRouting(activity[app.id])
          return (
            <line
              key={app.id}
              x1={C + (CORE + 34) * cos}
              y1={C + (CORE + 34) * sin}
              x2={C + (ORBIT - 30) * cos}
              y2={C + (ORBIT - 30) * sin}
              stroke={live ? 'url(#spoke)' : on ? '#3a3a52' : '#272738'}
              strokeWidth={live ? 2.5 : 1.5}
              strokeDasharray={live ? '6 6' : undefined}
              className={live ? 'flow' : undefined}
            />
          )
        })}
      </svg>

      {nodes.map(({ app, x, y }) => {
        const live = on && isRouting(activity[app.id])
        const running = !!activity[app.id]?.running
        return (
          <div
            key={app.id}
            className="absolute"
            style={{ left: x - 28, top: y - 28 }}
            title={`${app.name}: ${live ? 'traffic is going through the tunnel' : running ? 'running, no traffic right now' : 'not running'}`}
          >
            <div
              className={`size-14 overflow-hidden rounded-2xl border-2 transition-all duration-500 ${
                live ? 'border-cyan shadow-[0_0_22px] shadow-cyan/50' : on ? 'border-violet/50' : 'border-line opacity-70 grayscale-[60%]'
              }`}
            >
              <AppThumb app={app} className="size-full" />
            </div>
            {(live || running) && (
              <span className={`absolute -right-1 -top-1 size-3 rounded-full border-2 border-void ${live ? 'bg-live' : 'bg-faint'}`} />
            )}
          </div>
        )
      })}
      {extra > 0 && (
        <div className="absolute rounded-full bg-raised px-2 py-0.5 text-[11px] text-muted" style={{ left: C + 12, top: C - ORBIT - 44 }}>
          +{extra} more
        </div>
      )}

      <div className="absolute" style={{ left: C - CORE, top: C - CORE, width: CORE * 2, height: CORE * 2 }}>
        <div
          className={`absolute inset-0 rounded-full transition-shadow duration-700 ${
            on ? 'shadow-[0_0_60px_8px_rgba(139,92,246,0.45),0_0_110px_20px_rgba(34,211,238,0.18)]' : ''
          }`}
        />
        {(busy || on || retrying) && (
          <div
            className={`absolute -inset-[3px] rounded-full ${busy || retrying ? 'spin' : 'spin-slow opacity-80'}`}
            style={{
              background: retrying
                ? 'conic-gradient(from 0deg, transparent 0 55%, #F59E0B 85%, #F59E0B)'
                : busy
                ? 'conic-gradient(from 0deg, transparent 0 55%, #22D3EE 80%, #8B5CF6)'
                : 'conic-gradient(from 0deg, transparent 0 70%, #22D3EE 92%, #8B5CF6)',
              willChange: 'transform'
            }}
          />
        )}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onPress}
          disabled={busy}
          aria-label={on || retrying ? 'Disconnect' : 'Connect'}
          className={`relative flex size-full flex-col items-center justify-center gap-2 rounded-full transition-colors ${
            on ? 'grad-ring' : retrying ? 'border-2 border-warn/60 bg-panel' : 'border-2 border-line bg-panel hover:border-violet/60'
          }`}
        >
          <Power className={`size-10 ${on ? 'text-cyan' : retrying ? 'text-warn' : busy ? 'text-muted' : 'text-ink'}`} strokeWidth={2.2} />
          <span className="font-display text-[17px] font-semibold">
            {status === 'connecting' ? 'Connecting…' : status === 'disconnecting' ? 'Stopping…' : on || retrying ? 'Disconnect' : 'Connect'}
          </span>
        </motion.button>
      </div>
    </div>
  )
}
