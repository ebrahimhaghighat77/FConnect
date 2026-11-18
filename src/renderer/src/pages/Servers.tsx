import { ClipboardPaste, FileUp, Gauge, Link2, LoaderCircle, Pencil, RefreshCw, Trash2, Type } from 'lucide-react'
import { useState } from 'react'
import type { ImportSummary, Profile, Snapshot } from '../../../shared/types'
import { Modal } from '../components/Modal'
import { toast } from '../components/Toast'
import { bytes, errorText, pingText, pingTone, splitFlag } from '../lib'
import type { Subscription } from '../../../shared/types'

function Usage({ sub }: { sub: Subscription }) {
  if (!sub.total && !sub.expire) return null
  const pct = sub.total ? Math.min(100, ((sub.used ?? 0) / sub.total) * 100) : 0
  const days = sub.expire ? Math.ceil((sub.expire - Date.now()) / 86400000) : undefined
  return (
    <div className="mb-3 flex items-center gap-4 text-[12px] text-muted">
      {sub.total && (
        <>
          <div className="h-1.5 w-48 overflow-hidden rounded-full bg-raised">
            <div className={`h-full rounded-full ${pct > 90 ? 'bg-bad' : 'bg-gradient-to-r from-violet to-cyan'}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular-nums">
            {bytes(sub.used ?? 0)} of {bytes(sub.total)} used
          </span>
        </>
      )}
      {days !== undefined && <span className={days <= 3 ? 'text-warn' : ''}>{days > 0 ? `${days} days left` : 'Expired'}</span>}
    </div>
  )
}

function report(r: ImportSummary): void {
  if (r.added) toast(`Added ${r.added} ${r.added === 1 ? 'server' : 'servers'}${r.errors.length ? `, skipped ${r.errors.length}` : ''}`)
  else toast(r.errors[0] ? `Nothing added: ${r.errors[0]}` : 'No servers found in that text', 'bad')
}

function ago(t?: number): string {
  if (!t) return 'never updated'
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'updated just now' : m < 60 ? `updated ${m} min ago` : `updated ${Math.round(m / 60)} h ago`
}

function Row({ p, active, testing }: { p: Profile; active: boolean; testing: boolean }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(p.name)
  const { country, label } = splitFlag(p.name)
  const commit = () => {
    setEditing(false)
    if (name.trim() && name !== p.name) void window.fc.renameProfile(p.id, name)
  }
  return (
    <div
      onClick={() => !active && window.fc.selectProfile(p.id).catch((e) => toast(errorText(e), 'bad'))}
      className={`group flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-3 transition-colors ${
        active ? 'grad-ring' : 'border-line bg-panel hover:border-faint'
      }`}
    >
      <span className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${active ? 'border-cyan' : 'border-faint'}`}>
        {active && <span className="size-1.5 rounded-full bg-cyan" />}
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={name}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            className="w-full rounded bg-void px-1.5 py-0.5 text-[14px] outline-none ring-1 ring-violet/60"
          />
        ) : (
          <div className="flex items-center gap-2">
            {country && <span className="rounded bg-violet/20 px-1.5 py-px font-display text-[11px] font-semibold text-violet">{country}</span>}
            <span className="truncate text-[14px] font-medium">{label}</span>
          </div>
        )}
        <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-faint">
          {[p.protocol, ...p.transport.split(' ')].filter(Boolean).map((t, i) => (
            <span key={i} className="rounded bg-raised px-1.5 py-px text-muted">
              {t}
            </span>
          ))}
          <span className="ml-1 truncate">{p.address}</span>
          {p.engine === 'xray' && <span className="ml-1 shrink-0 text-violet/80">runs on Xray</span>}
        </div>
      </div>
      <div className={`w-20 text-right font-display text-[14px] tabular-nums ${pingTone(p.ping)}`}>
        {testing ? <LoaderCircle className="spin ml-auto size-4 text-muted" /> : pingText(p.ping)}
      </div>
      <div className="flex gap-1 opacity-60 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => void window.fc.testProfiles([p.id])} title="Test ping" aria-label={`Test ${p.name}`} className="grid size-8 place-items-center rounded-lg hover:bg-raised">
          <Gauge className="size-4" />
        </button>
        <button onClick={() => setEditing(true)} title="Rename" aria-label={`Rename ${p.name}`} className="grid size-8 place-items-center rounded-lg hover:bg-raised">
          <Pencil className="size-4" />
        </button>
        <button onClick={() => void window.fc.removeProfile(p.id)} title="Delete" aria-label={`Delete ${p.name}`} className="grid size-8 place-items-center rounded-lg hover:bg-raised hover:text-bad">
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  )
}

export function Servers({ snap }: { snap: Snapshot }) {
  const [dialog, setDialog] = useState<'text' | 'sub' | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const testing = new Set(snap.testing)
  const manual = snap.profiles.filter((p) => !p.subId)

  const run = async (fn: () => Promise<ImportSummary | null>) => {
    setBusy(true)
    try {
      const r = await fn()
      if (!r) return
      report(r)
      setDialog(null)
      setText('')
    } catch (e) {
      toast(errorText(e), 'bad')
    } finally {
      setBusy(false)
    }
  }

  const group = (key: string, title: string, items: Profile[], extra?: React.ReactNode, sub?: Subscription) => (
    <section key={key} className="mt-7">
      <div className="mb-2.5 flex items-center gap-3">
        <h2 className="font-display text-[15px] font-medium">{title}</h2>
        <span className="text-[12px] text-faint">{items.length}</span>
        <div className="ml-auto flex items-center gap-1">{extra}</div>
      </div>
      {sub && <Usage sub={sub} />}
      <div className="flex flex-col gap-2">
        {items.map((p) => (
          <Row key={p.id} p={p} active={p.id === snap.settings.activeProfileId} testing={testing.has(p.id)} />
        ))}
      </div>
    </section>
  )

  return (
    <div className="mx-auto w-full max-w-[980px] px-8 py-7">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[30px] font-semibold tracking-tight">Servers</h1>
          <p className="mt-1 text-[13px] text-muted">
            v2ray links, WireGuard, Hysteria2, TUIC, Shadowsocks, SSH, NaïveProxy, AnyTLS, subscriptions and Xray JSON all work here.
          </p>
        </div>
        <button
          disabled={!snap.profiles.length || testing.size > 0}
          onClick={() => void window.fc.testProfiles([])}
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line px-3.5 text-[13px] hover:border-violet/60 disabled:opacity-50"
        >
          {testing.size ? <LoaderCircle className="spin size-4" /> : <Gauge className="size-4" />}
          {testing.size ? `Testing ${testing.size}` : 'Test all'}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {[
          { icon: ClipboardPaste, title: 'Paste from clipboard', sub: 'Copied links or a whole list', run: () => run(() => window.fc.importClipboard()), primary: true },
          { icon: Type, title: 'Paste text', sub: 'Links, base64 or Xray JSON', run: () => setDialog('text') },
          { icon: Link2, title: 'Add subscription', sub: 'A link from your provider', run: () => setDialog('sub') },
          { icon: FileUp, title: 'Import file', sub: 'WireGuard .conf, JSON or a list', run: () => run(() => window.fc.importFile()) }
        ].map(({ icon: Icon, title, sub, run: go, primary }) => (
          <button
            key={title}
            onClick={go}
            disabled={busy}
            className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-left ${primary ? 'grad-ring' : 'border border-line bg-panel hover:border-faint'}`}
          >
            <Icon className={`size-5 shrink-0 ${primary ? 'text-cyan' : 'text-muted'}`} />
            <span>
              <span className="block text-[13.5px] font-medium">{title}</span>
              <span className="block text-[12px] text-faint">{sub}</span>
            </span>
          </button>
        ))}
      </div>

      {(snap.settings.autoServer ?? true) && snap.profiles.length > 1 && (
        <p className="mt-5 rounded-xl border border-cyan/30 bg-cyan/5 px-4 py-2.5 text-[12.5px] text-muted">
          The fastest server is picked each time you connect, so the highlighted one can change. Turn this off in Settings to always use
          the server you choose.
        </p>
      )}

      {snap.profiles.length === 0 && (
        <p className="mt-14 text-center text-[13px] text-muted">
          No servers yet. Copy a link from your provider and choose Paste from clipboard, or import a WireGuard .conf file.
        </p>
      )}

      {manual.length > 0 && group('manual', 'Added by you', manual)}
      {snap.subscriptions.map((s) =>
        group(
          s.id,
          s.name,
          snap.profiles.filter((p) => p.subId === s.id),
          <>
            <span className="mr-2 text-[12px] text-faint">{ago(s.updatedAt)}</span>
            <button onClick={() => run(() => window.fc.updateSubscription(s.id))} title="Update" aria-label={`Update ${s.name}`} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink">
              <RefreshCw className={`size-4 ${busy ? 'spin' : ''}`} />
            </button>
            <button onClick={() => void window.fc.removeSubscription(s.id)} title="Remove subscription" aria-label={`Remove ${s.name}`} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-bad">
              <Trash2 className="size-4" />
            </button>
          </>,
          s
        )
      )}

      {dialog && (
        <Modal title={dialog === 'text' ? 'Paste servers' : 'Add a subscription'} onClose={() => setDialog(null)}>
          <div className="p-5">
            {dialog === 'text' ? (
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'vless://…\nwireguard://…\nor a base64 block, an Xray JSON config, or a WireGuard [Interface] config'}
                className="h-48 w-full resize-none rounded-xl border border-line bg-void p-3 font-mono text-[12px] outline-none focus:border-violet/60"
              />
            ) : (
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && text.trim() && run(() => window.fc.addSubscription(text.trim()))}
                placeholder="https://…"
                className="h-10 w-full rounded-xl border border-line bg-void px-3 text-[13px] outline-none focus:border-violet/60"
              />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDialog(null)} className="h-9 rounded-lg px-4 text-[13px] text-muted hover:text-ink">
                Cancel
              </button>
              <button
                disabled={!text.trim() || busy}
                onClick={() => run(() => (dialog === 'text' ? window.fc.importText(text) : window.fc.addSubscription(text.trim())))}
                className="flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-violet to-cyan px-4 text-[13px] font-semibold text-void disabled:opacity-50"
              >
                {busy && <LoaderCircle className="spin size-4" />}
                {dialog === 'text' ? 'Add servers' : 'Add subscription'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
