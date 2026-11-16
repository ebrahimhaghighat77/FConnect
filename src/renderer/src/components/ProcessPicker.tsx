import { LoaderCircle, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { RunningProcess } from '../../../shared/types'
import { errorText } from '../lib'
import { Modal } from './Modal'
import { toast } from './Toast'

export function ProcessPicker({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<RunningProcess[] | null>(null)
  const [query, setQuery] = useState('')
  useEffect(() => {
    window.fc
      .listProcesses()
      .then(setList)
      .catch((e) => {
        toast(errorText(e), 'bad')
        onClose()
      })
  }, [])
  const q = query.toLowerCase()
  const shown = (list ?? []).filter((p) => !q || p.path.toLowerCase().includes(q))

  return (
    <Modal title="Add a running app" onClose={onClose} width={600}>
      <div className="p-4">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-void px-3 focus-within:border-violet/60">
          <Search className="size-4 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or path"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
          />
        </label>
      </div>
      <div className="max-h-[52vh] overflow-y-auto px-2 pb-3">
        {!list ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted">
            <LoaderCircle className="spin size-4" /> Reading running apps
          </div>
        ) : shown.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-muted">No running app matches.</div>
        ) : (
          shown.map((p) => (
            <button
              key={p.path}
              onClick={() => {
                void window.fc.addProcessApp(p).then(() => toast(`${p.name} added and picked`))
                onClose()
              }}
              className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-raised"
            >
              <span className="text-[13px]">{p.name}</span>
              <span className="w-full truncate text-[11.5px] text-faint">{p.path}</span>
            </button>
          ))
        )}
      </div>
    </Modal>
  )
}
