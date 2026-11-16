import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

export function Modal({ title, onClose, children, width = 520 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <motion.div
        role="dialog"
        aria-modal
        aria-label={title}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width }}
        className="max-h-[80vh] overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl shadow-black/70"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-display text-[17px] font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  )
}
