import { AnimatePresence, motion } from 'motion/react'
import { Check, File, Folder, ListPlus, Plus, RefreshCw, Search, Trash2, Activity } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AppActivity, AppEntry, Snapshot } from '../../../shared/types'
import { AppThumb } from '../components/AppThumb'
import { ProcessPicker } from '../components/ProcessPicker'
import { ProxyNotice } from '../components/ProxyNotice'
import { toast } from '../components/Toast'
import { errorText, isRouting, rate, useActivity } from '../lib'

const SOURCE: Record<AppEntry['source'], string> = {
  preset: 'Installed',
  steam: 'Steam',
  epic: 'Epic Games',
  system: 'Installed',
  custom: 'Added by you'
}

function Status({ app, act, on }: { app: AppEntry; act?: AppActivity; on: boolean }) {
  if (on && isRouting(act))
    return (
      <span className="flex items-center gap-1 text-live">
        <Activity className="size-3" /> {rate(act!.up + act!.down)}
      </span>
    )
  if (act?.running) return <span className="text-cyan">Running</span>
  return <>{app.installed ? SOURCE[app.source] : 'Not found on this PC'}</>
}

function Tick({ on, className = '' }: { on: boolean; className?: string }) {
  return (
    <span
      className={`grid size-6 shrink-0 place-items-center rounded-full border transition-colors ${
        on ? 'border-transparent bg-gradient-to-br from-violet to-cyan text-void' : 'border-ink/30 bg-void/60 text-transparent'
      } ${className}`}
    >
      <Check className="size-3.5" strokeWidth={3} />
    </span>
  )
}

function RemoveButton({ app }: { app: AppEntry }) {
  return (
    <button
      onClick={() => void window.fc.removeCustomApp(app.id)}
      aria-label={`Remove ${app.name}`}
      className="absolute -left-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-line bg-raised text-muted opacity-0 hover:text-bad focus:opacity-100 group-hover:opacity-100"
    >
      <Trash2 className="size-3.5" />
    </button>
  )
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      <h2 className="font-display text-[16px] font-medium">{title}</h2>
      <span className="text-[12px] text-faint">{count}</span>
    </div>
  )
}

type Filter = 'all' | 'game' | 'app' | 'selected'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'game', label: 'Games' },
  { id: 'app', label: 'Apps' },
  { id: 'selected', label: 'Using tunnel' }
]

export function Library({ snap }: { snap: Snapshot }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [menu, setMenu] = useState(false)
  const [picker, setPicker] = useState(false)
  const activity = useActivity()
  const selected = new Set(snap.settings.selectedApps)
  const on = snap.tunnel.status === 'connected'

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return snap.apps.filter(
      (a) =>
        (!q || a.name.toLowerCase().includes(q)) &&
        (filter === 'all' || (filter === 'selected' ? selected.has(a.id) : a.kind === filter))
    )
  }, [snap.apps, query, filter, snap.settings.selectedApps])
  const games = list.filter((a) => a.kind === 'game')
  const apps = list.filter((a) => a.kind === 'app')

  const toggle = (a: AppEntry) => void window.fc.toggleApp(a.id, !selected.has(a.id))
  const add = (mode: 'exe' | 'folder') => {
    setMenu(false)
    window.fc.addCustomApp(mode).catch((e) => toast(errorText(e), 'bad'))
  }

  return (
    <div className="px-8 py-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-tight">Library</h1>
          <p className="mt-1 text-[13px] text-muted">
            {selected.size
              ? `${selected.size} picked. Changes apply right away${on ? ' to the running tunnel' : ''}.`
              : 'Pick the games and apps that should use the tunnel.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void window.fc.rescanApps().then(() => toast('Library rescanned'))}
            className="grid size-9 place-items-center rounded-lg border border-line text-muted hover:text-ink"
            title="Scan Steam, Epic and Discord again"
            aria-label="Rescan installed games"
          >
            <RefreshCw className="size-4" />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              className="flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-violet to-cyan px-3.5 text-[13px] font-semibold text-void"
            >
              <Plus className="size-4" /> Add app
            </button>
            <AnimatePresence>
              {menu && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-raised p-1 shadow-2xl shadow-black/60"
                >
                  {[
                    { icon: File, label: 'Program file (.exe)', run: () => add('exe') },
                    { icon: Folder, label: 'Whole folder', run: () => add('folder') },
                    {
                      icon: ListPlus,
                      label: 'From running apps',
                      run: () => {
                        setMenu(false)
                        setPicker(true)
                      }
                    }
                  ].map(({ icon: Icon, label, run }) => (
                    <button key={label} onClick={run} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-line/60">
                      <Icon className="size-4 text-cyan" />
                      {label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex h-9 w-72 items-center gap-2 rounded-lg border border-line bg-panel px-3 focus-within:border-violet/60">
          <Search className="size-4 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games and apps"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
          />
        </label>
        <div className="flex rounded-lg border border-line bg-panel p-0.5" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] ${filter === f.id ? 'bg-raised text-ink' : 'text-muted hover:text-ink'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 && (
        <div className="mt-16 text-center text-[13px] text-muted">
          {query ? `Nothing matches "${query}".` : 'Nothing here yet. Use Add app to pick a program or folder.'}
        </div>
      )}

      <ProxyNotice snap={snap} className="mt-4" />
      {snap.apps
        .filter((a) => a.hint && selected.has(a.id))
        .map((a) => (
          <p key={a.id} className="mt-4 flex items-start gap-2 rounded-xl border border-cyan/30 bg-cyan/5 px-4 py-2.5 text-[12.5px] text-muted">
            <span className="font-medium text-ink">{a.name}:</span> {a.hint}
          </p>
        ))}

      {games.length > 0 && (
        <section className="mt-7">
          {apps.length > 0 && <SectionTitle title="Games" count={games.length} />}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
            {games.map((a) => {
              const isOn = selected.has(a.id)
              return (
                <div key={a.id} className="group relative">
                  <button
                    onClick={() => toggle(a)}
                    aria-pressed={isOn}
                    className={`relative block w-full overflow-hidden rounded-2xl border-2 text-left transition-all duration-200 ${
                      isOn ? 'border-transparent shadow-[0_0_0_2px_#8B5CF6,0_0_28px_-6px_#22D3EE]' : 'border-line hover:border-faint'
                    }`}
                  >
                    <AppThumb app={a} className={`aspect-[2/3] w-full ${a.installed ? '' : 'opacity-40 grayscale'}`} />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-void via-void/85 to-transparent px-3 pb-2.5 pt-10">
                      <div className="truncate font-display text-[14px] font-medium">{a.name}</div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        <Status app={a} act={isOn ? activity[a.id] : undefined} on={on} />
                      </div>
                    </div>
                    <Tick on={isOn} className="absolute right-2 top-2" />
                  </button>
                  {a.source === 'custom' && <RemoveButton app={a} />}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {apps.length > 0 && (
        <section className="mt-8">
          {games.length > 0 && <SectionTitle title="Apps" count={apps.length} />}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
            {apps.map((a) => {
              const isOn = selected.has(a.id)
              return (
                <div key={a.id} className="group relative">
                  <button
                    onClick={() => toggle(a)}
                    aria-pressed={isOn}
                    title={a.hint}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      isOn ? 'grad-ring' : 'border-line bg-panel hover:border-faint'
                    }`}
                  >
                    <AppThumb app={a} className={`size-9 shrink-0 rounded-lg ${a.installed ? '' : 'opacity-40 grayscale'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{a.name}</span>
                      <span className="block text-[11px] text-muted">
                        <Status app={a} act={isOn ? activity[a.id] : undefined} on={on} />
                      </span>
                    </span>
                    <Tick on={isOn} />
                  </button>
                  {a.source === 'custom' && <RemoveButton app={a} />}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {picker && <ProcessPicker onClose={() => setPicker(false)} />}
    </div>
  )
}
