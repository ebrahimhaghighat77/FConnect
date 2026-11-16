import { useState } from 'react'
import type { AppEntry } from '../../../shared/types'
import { appImage } from '../lib'

export function AppThumb({ app, className = '' }: { app: AppEntry; className?: string }) {
  const [coverFailed, setCoverFailed] = useState(false)
  const [iconFailed, setIconFailed] = useState(false)
  const icon = appImage(app)
  const initials = app.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  if (app.cover && !coverFailed) {
    return <img src={app.cover} alt="" draggable={false} onError={() => setCoverFailed(true)} className={`object-cover object-top ${className}`} />
  }
  return (
    <div className={`grid place-items-center bg-gradient-to-br from-violet/25 via-raised to-cyan/20 ${className}`}>
      {icon && !iconFailed ? (
        <img src={icon} alt="" draggable={false} onError={() => setIconFailed(true)} className="size-[46%] object-contain drop-shadow-lg" />
      ) : (
        <span className="font-display text-lg font-semibold text-ink/80">{initials}</span>
      )}
    </div>
  )
}
