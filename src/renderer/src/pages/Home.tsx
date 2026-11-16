import { ArrowDown, ArrowUp, CircleAlert } from 'lucide-react'
import { useState } from 'react'
import type { Page } from '../App'
import type { Snapshot } from '../../../shared/types'
import { AppDetail } from '../components/AppDetail'
import { AppThumb } from '../components/AppThumb'
import { PingGraph } from '../components/PingGraph'
import { ProxyNotice } from '../components/ProxyNotice'
import { RoutingRing } from '../components/RoutingRing'
import { toast } from '../components/Toast'
import { TrafficGraph } from '../components/TrafficGraph'
import { bytes, elapsed, errorText, isRouting, megabytes, pingText, pingTone, rate, splitFlag, useActivity, useNow, useQuality, useTrafficHistory, useWindowWidth } from '../lib'

const HEADLINE = { connected: 'Connected', connecting: 'Connecting', reconnecting: 'Reconnecting', disconnecting: 'Stopping', disconnected: 'Off' }

export function Home({ snap, go }: { snap: Snapshot; go: (p: Page) => void }) {
  const history = useTrafficHistory()
  const activity = useActivity()
  const quality = useQuality()
  const width = useWindowWidth()
  const [detail, setDetail] = useState<string | null>(null)
  const now = useNow()
  const { tunnel } = snap
  const on = tunnel.status === 'connected'
  const holding = tunnel.status === 'reconnecting'
  const selected = snap.apps.filter((a) => snap.settings.selectedApps.includes(a.id))
  const profile = snap.profiles.find((p) => p.id === (tunnel.profileId ?? snap.settings.activeProfileId))
  const current = history[history.length - 1] ?? { up: 0, down: 0 }
  const flag = splitFlag(profile?.name ?? '')
  const autoServer = snap.settings.autoServer ?? true
  const sessionTotal = selected.reduce((n, a) => n + (activity[a.id]?.total ?? 0), 0)
  const sub = snap.subscriptions.find((s) => s.id === profile?.subId)
  const detailApp = selected.find((a) => a.id === detail)

  const press = () => {
    const action = on || holding ? window.fc.disconnect() : window.fc.connect()
    action.catch((e) => toast(errorText(e), 'bad'))
  }

  return (
    <div className="mx-auto flex w-full max-w-[1080px] items-start gap-8 px-8 py-8">
      <div className="flex flex-col items-center">
        <RoutingRing apps={selected} activity={activity} status={tunnel.status} onPress={press} size={width < 1150 ? 370 : 460} />
        {selected.length === 0 && (
          <button onClick={() => go('library')} className="-mt-4 text-[13px] text-cyan hover:underline">
            Pick the games and apps that should use the tunnel
          </button>
        )}
      </div>

      <section className="@container flex min-w-0 flex-1 flex-col gap-5">
        <div>
          <h1 className={`font-display text-[44px] font-semibold leading-none tracking-tight ${on ? 'grad-text' : holding ? 'text-warn' : ''}`}>
            {HEADLINE[tunnel.status]}
          </h1>
          <p className="mt-3 max-w-[46ch] text-[14px] leading-relaxed text-muted">
            {on
              ? `${selected.length} ${selected.length === 1 ? 'app goes' : 'apps go'} through ${profile ? flag.label : 'your server'}. Everything else stays on your normal connection.`
              : 'Only the games and apps you pick use the tunnel. Everything else is left alone, even while you connect or disconnect.'}
          </p>
          {tunnel.note && <p className={`mt-3 text-[13px] ${holding ? 'text-warn' : 'text-cyan'}`}>{tunnel.note}</p>}
          {!snap.driver && tunnel.status === 'disconnected' && (
            <p className="mt-3 max-w-[50ch] text-[12.5px] leading-relaxed text-faint">
              The first connect installs the Windows Packet Filter driver. It lets FConnect pick up traffic from your chosen apps only, and
              it is installed once.
            </p>
          )}
          <ProxyNotice snap={snap} className="mt-4" />
          {tunnel.error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-[13px]">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-bad" />
              <span className="min-w-0 break-words">
                {tunnel.error}{' '}
                <button onClick={() => go('logs')} className="text-cyan hover:underline">
                  Open logs
                </button>
              </span>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-line bg-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12px] text-muted">{autoServer ? 'Fastest server' : 'Server'}</div>
              <div className="mt-1 flex items-center gap-2">
                {flag.country && <span className="rounded bg-violet/20 px-1.5 py-px font-display text-[12px] font-semibold text-violet">{flag.country}</span>}
                <span className="truncate font-display text-[19px] font-medium">{profile ? flag.label : 'No server yet'}</span>
              </div>
              {profile && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[profile.protocol, ...profile.transport.split(' ')].filter(Boolean).map((t, i) => (
                    <span key={i} className="rounded-md bg-raised px-1.5 py-0.5 text-[11px] text-muted">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => go('servers')} className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-[13px] hover:border-violet/60">
              {profile ? 'Change' : 'Add a server'}
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 @md:grid-cols-4">
            <div title="Round trip from this PC through your server, measured on an open connection like game traffic">
              <div className="text-[12px] text-muted">Ping</div>
              <div className={`mt-1 font-display text-[24px] font-semibold tabular-nums ${on ? pingTone(quality?.ping ?? tunnel.ping) : 'text-faint'}`}>
                {on ? pingText(quality?.ping ?? tunnel.ping) : '—'}
              </div>
            </div>
            <div title="How much the ping changes between samples">
              <div className="text-[12px] text-muted">Jitter</div>
              <div className={`mt-1 font-display text-[24px] font-semibold tabular-nums ${on && quality?.jitter != null ? (quality.jitter < 30 ? 'text-ink' : 'text-warn') : 'text-faint'}`}>
                {on && quality?.jitter != null ? `${quality.jitter} ms` : '—'}
              </div>
            </div>
            <div title="Probes that got no answer in the last minute">
              <div className="text-[12px] text-muted">Loss</div>
              <div className={`mt-1 font-display text-[24px] font-semibold tabular-nums ${on && quality ? (quality.loss === 0 ? 'text-live' : quality.loss < 10 ? 'text-warn' : 'text-bad') : 'text-faint'}`}>
                {on && quality ? `${quality.loss}%` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[12px] text-muted">Connected for</div>
              <div className={`mt-1 font-display text-[24px] font-semibold tabular-nums ${on || holding ? 'text-ink' : 'text-faint'}`}>
                {(on || holding) && tunnel.since ? elapsed(tunnel.since, now) : '—'}
              </div>
            </div>
          </div>
          {on && quality && <PingGraph history={quality.history} />}
        </div>

        <div className="rounded-2xl border border-line bg-panel p-5">
          <div className="mb-3 flex items-center gap-5 text-[13px]">
            <span className="flex items-center gap-1.5 text-cyan">
              <ArrowDown className="size-4" />
              <span className="font-display tabular-nums">{rate(current.down)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-violet">
              <ArrowUp className="size-4" />
              <span className="font-display tabular-nums">{rate(current.up)}</span>
            </span>
            <span className="ml-auto text-[12px] text-muted">Tunnel traffic, last minute</span>
          </div>
          <TrafficGraph history={history} />
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-3 text-[12px] text-muted">
            {(on || holding || sessionTotal > 0) && (
              <span>
                Used this session <span className="font-display font-semibold tabular-nums text-ink">{megabytes(sessionTotal)}</span>
              </span>
            )}
            {sub?.total && (
              <span>
                Subscription <span className="font-display font-semibold tabular-nums text-ink">{bytes(sub.used ?? 0)}</span> of {bytes(sub.total)}{' '}
                used
              </span>
            )}
          </div>
        </div>

        {selected.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {selected.map((a) => {
              const act = activity[a.id]
              const routing = on && isRouting(act)
              return (
                <button
                  key={a.id}
                  onClick={() => setDetail(a.id)}
                  title={`See what ${a.name} is talking to`}
                  className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors hover:border-faint ${routing ? 'border-cyan/40 bg-cyan/5' : 'border-line bg-panel'}`}
                >
                  <AppThumb app={a} className="size-7 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">{a.name}</span>
                    <span className={`block text-[11px] tabular-nums ${routing ? 'text-cyan' : 'text-faint'}`}>
                      {routing
                        ? `${rate(act!.down + act!.up)} now`
                        : act?.running
                          ? 'Running, idle'
                          : 'Not running'}
                    </span>
                  </span>
                  {!!act?.total && <span className="shrink-0 text-[11px] tabular-nums text-muted">{megabytes(act.total)}</span>}
                  <span className={`size-2 shrink-0 rounded-full ${routing ? 'bg-live' : act?.running ? 'bg-faint' : 'bg-line'}`} />
                </button>
              )
            })}
          </div>
        )}
      </section>
      {detailApp && <AppDetail app={detailApp} act={activity[detailApp.id]} onClose={() => setDetail(null)} />}
    </div>
  )
}
