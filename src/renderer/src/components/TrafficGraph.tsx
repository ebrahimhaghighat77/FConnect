import type { Traffic } from '../../../shared/types'

const W = 320
const H = 72

function path(values: number[], max: number): string {
  if (values.length < 2) return ''
  const step = W / 59
  const offset = W - step * (values.length - 1)
  return values.map((v, i) => `${i ? 'L' : 'M'}${(offset + i * step).toFixed(1)},${(H - 4 - (v / max) * (H - 10)).toFixed(1)}`).join(' ')
}

export function TrafficGraph({ history }: { history: Traffic[] }) {
  const max = Math.max(64 * 1024, ...history.map((h) => Math.max(h.up, h.down)))
  const down = path(history.map((h) => h.down), max)
  const up = path(history.map((h) => h.up), max)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[72px] w-full" aria-hidden>
      <defs>
        <linearGradient id="downFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22D3EE" stopOpacity="0.35" />
          <stop offset="1" stopColor="#22D3EE" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" x2={W} y1={H - 4} y2={H - 4} stroke="#272738" />
      {down && <path d={`${down} L${W},${H - 4} L${W - (W / 59) * (history.length - 1)},${H - 4} Z`} fill="url(#downFill)" />}
      {down && <path d={down} fill="none" stroke="#22D3EE" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />}
      {up && <path d={up} fill="none" stroke="#8B5CF6" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}
