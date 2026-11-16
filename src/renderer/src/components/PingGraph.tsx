const W = 240
const H = 36

export function PingGraph({ history }: { history: (number | null)[] }) {
  const good = history.filter((v): v is number => v !== null)
  if (good.length < 2) return <div className="h-9" />
  const max = Math.max(150, ...good) * 1.15
  const step = W / 39
  const offset = W - step * (history.length - 1)
  let d = ''
  history.forEach((v, i) => {
    if (v === null) return
    const x = (offset + i * step).toFixed(1)
    const y = (H - 3 - (v / max) * (H - 6)).toFixed(1)
    d += `${d && history[i - 1] !== null ? 'L' : 'M'}${x},${y} `
  })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-9 w-full" aria-hidden>
      {history.map((v, i) =>
        v === null ? <line key={i} x1={offset + i * step} x2={offset + i * step} y1={2} y2={H - 2} stroke="#F43F5E" strokeOpacity={0.6} /> : null
      )}
      <path d={d} fill="none" stroke="#34D399" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
