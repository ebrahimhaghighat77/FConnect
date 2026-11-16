import { Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LogLine } from '../../../shared/types'
import { toast } from '../components/Toast'

const TONE: Record<LogLine['src'], string> = { xray: 'text-violet', 'sing-box': 'text-cyan', proxifyre: 'text-live', app: 'text-muted' }

export function Logs() {
  const [lines, setLines] = useState<LogLine[]>([])
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.fc.logs().then(setLines)
    return window.fc.onLog((l) => setLines((xs) => [...xs.slice(-599), l]))
  }, [])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [lines])

  const text = () => lines.map((l) => `${new Date(l.t).toLocaleTimeString()} [${l.src}] ${l.text}`).join('\n')

  return (
    <div className="flex min-h-0 flex-1 flex-col px-8 py-7">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-tight">Logs</h1>
          <p className="mt-1 text-[13px] text-muted">Warnings and errors from the tunnel engines. Useful when a server won't connect.</p>
        </div>
        <button
          disabled={!lines.length}
          onClick={() => void navigator.clipboard.writeText(text()).then(() => toast('Logs copied'))}
          className="flex h-9 items-center gap-2 rounded-lg border border-line px-3.5 text-[13px] hover:border-violet/60 disabled:opacity-50"
        >
          <Copy className="size-4" /> Copy all
        </button>
      </div>
      <div className="mt-5 min-h-0 flex-1 select-text overflow-y-auto rounded-2xl border border-line bg-panel p-4 font-mono text-[12px] leading-relaxed">
        {lines.length === 0 ? (
          <p className="text-faint">Nothing logged yet. Connect once and messages from the engines will show up here.</p>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="break-all">
              <span className="text-faint">{new Date(l.t).toLocaleTimeString()}</span> <span className={TONE[l.src]}>{l.src}</span>{' '}
              <span className="text-ink/90">{l.text}</span>
            </div>
          ))
        )}
        <div ref={end} />
      </div>
    </div>
  )
}
