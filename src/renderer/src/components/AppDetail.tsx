import type { AppActivity, AppEntry } from '../../../shared/types'
import { ago, megabytes, rate, useNow } from '../lib'
import { AppThumb } from './AppThumb'
import { Modal } from './Modal'

export function AppDetail({ app, act, onClose }: { app: AppEntry; act?: AppActivity; onClose: () => void }) {
  const now = useNow()
  const peers = act?.peers ?? []
  return (
    <Modal title={app.name} onClose={onClose} width={620}>
      <div className="flex items-center gap-4 border-b border-line px-5 py-4">
        <AppThumb app={app} className="size-12 shrink-0 rounded-xl" />
        <div className="grid flex-1 grid-cols-3 gap-4">
          <div>
            <div className="text-[11.5px] text-muted">Right now</div>
            <div className="font-display text-[18px] font-semibold tabular-nums">{rate((act?.up ?? 0) + (act?.down ?? 0))}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted">Used this session</div>
            <div className="font-display text-[18px] font-semibold tabular-nums">{megabytes(act?.total ?? 0)}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted">Status</div>
            <div className="font-display text-[18px] font-semibold">{act?.running ? 'Running' : 'Closed'}</div>
          </div>
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-display text-[14.5px] font-medium">What {app.name} is talking to</h3>
          <span className="text-[11.5px] text-faint">Through the tunnel, newest first</span>
        </div>
        {peers.length === 0 ? (
          <p className="rounded-xl border border-line bg-void px-4 py-3 text-[12.5px] text-faint">
            No traffic from {app.name} yet. Start it while connected and the servers it uses show up here.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line">
            {peers.map((p) => (
              <div key={`${p.network}:${p.host}:${p.port}`} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                <span className={`w-10 shrink-0 rounded px-1.5 py-px text-center text-[10.5px] font-semibold uppercase ${p.network === 'udp' ? 'bg-cyan/15 text-cyan' : 'bg-violet/15 text-violet'}`}>
                  {p.network}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block select-text truncate font-mono text-[12px]">
                    {p.host}:{p.port}
                  </span>
                  {p.host.startsWith('10.10.34.') ? (
                    <span className="block truncate text-[11px] text-warn">Filtered DNS answer. FConnect sends it to the real site instead.</span>
                  ) : (
                    p.place && <span className="block truncate text-[11px] text-faint">{p.place}</span>
                  )}
                </span>
                {p.country && <span className="rounded bg-raised px-1.5 py-px font-display text-[11px] font-semibold text-muted">{p.country}</span>}
                <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-faint">{ago(p.last, now)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
          The ping on the home screen is the round trip from this PC through your server. The last hop, from your server to these
          servers, can only be measured on the server itself.
        </p>
      </div>
    </Modal>
  )
}
