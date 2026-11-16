import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'

interface Toast {
  id: number
  text: string
  tone: 'ok' | 'bad'
}

let push: (t: Omit<Toast, 'id'>) => void = () => undefined

export function toast(text: string, tone: Toast['tone'] = 'ok'): void {
  push({ text, tone })
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    let n = 0
    push = (t) => {
      const id = ++n
      setItems((xs) => [...xs, { ...t, id }])
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.tone === 'bad' ? 7000 : 3500)
    }
  }, [])
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[360px] flex-col gap-2" role="status" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className={`rounded-xl border bg-raised px-4 py-3 text-[13px] shadow-2xl shadow-black/50 ${
              t.tone === 'bad' ? 'border-bad/50 text-ink' : 'border-line text-ink'
            }`}
          >
            <span className={`mr-2 inline-block size-2 rounded-full ${t.tone === 'bad' ? 'bg-bad' : 'bg-live'}`} />
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
