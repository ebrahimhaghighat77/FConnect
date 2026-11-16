import { Gamepad2, House, Minus, ScrollText, Server, Settings2, ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'
import { useSnapshot } from './lib'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { Logs } from './pages/Logs'
import { Servers } from './pages/Servers'
import { Settings } from './pages/Settings'
import { ToastHost } from './components/Toast'

export type Page = 'home' | 'library' | 'servers' | 'settings' | 'logs'

const NAV: { id: Page; label: string; icon: typeof House }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'library', label: 'Library', icon: Gamepad2 },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'settings', label: 'Settings', icon: Settings2 },
  { id: 'logs', label: 'Logs', icon: ScrollText }
]

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="12" fill="none" stroke="url(#lg)" strokeWidth="3" />
      <circle cx="16" cy="16" r="4" fill="url(#lg)" />
      <circle cx="16" cy="4" r="2.6" fill="#22D3EE" />
    </svg>
  )
}

export function App() {
  const snap = useSnapshot()
  const [page, setPage] = useState<Page>('home')
  const status = snap?.tunnel.status ?? 'disconnected'

  return (
    <div className="flex h-full flex-col">
      <header className="drag flex h-10 shrink-0 items-center justify-between border-b border-line/60 pl-4">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-[15px] font-semibold tracking-tight">FConnect</span>
        </div>
        <div className="no-drag flex h-full">
          <button
            aria-label="Minimize"
            onClick={() => window.fc.windowAction('minimize')}
            className="grid w-12 place-items-center text-muted hover:bg-raised hover:text-ink"
          >
            <Minus className="size-4" />
          </button>
          <button
            aria-label="Close to tray"
            onClick={() => window.fc.windowAction('close')}
            className="grid w-12 place-items-center text-muted hover:bg-bad hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[84px] shrink-0 flex-col items-center gap-1 border-r border-line/60 py-4">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = page === id
            return (
              <button
                key={id}
                onClick={() => setPage(id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex w-[68px] flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-medium transition-colors ${
                  active ? 'bg-raised text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {active && <span className="absolute left-[-8px] top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-violet to-cyan" />}
                <Icon className={`size-5 ${active ? 'text-cyan' : ''}`} />
                {label}
              </button>
            )
          })}
          <div className="mt-auto flex flex-col items-center gap-1.5 text-[11px] text-muted" title={`Tunnel ${status}`}>
            <span
              className={`size-2.5 rounded-full ${
                status === 'connected' ? 'bg-live shadow-[0_0_10px] shadow-live' : status === 'disconnected' ? 'bg-faint' : status === 'reconnecting' ? 'breathe bg-warn' : 'breathe bg-cyan'
              }`}
            />
            {status === 'connected' ? 'On' : status === 'disconnected' ? 'Off' : '…'}
          </div>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {snap && !snap.elevated && (
            <div className="mx-8 mt-6 flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-[13px] text-warn">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              FConnect isn't running as administrator, so it can't redirect your apps. Close it from the tray and open it again
              with Run as administrator.
            </div>
          )}
          {snap &&
            (page === 'home' ? (
              <Home snap={snap} go={setPage} />
            ) : page === 'library' ? (
              <Library snap={snap} />
            ) : page === 'servers' ? (
              <Servers snap={snap} />
            ) : page === 'settings' ? (
              <Settings snap={snap} />
            ) : (
              <Logs />
            ))}
        </main>
      </div>
      <ToastHost />
    </div>
  )
}
