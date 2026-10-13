import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  separator?: never
}

export interface ContextMenuSeparator {
  separator: true
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator

interface Props {
  x: number
  y: number
  items: ContextMenuEntry[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', handle)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handle)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Clamp to viewport
  const left = Math.min(x, window.innerWidth - 180)
  const top = Math.min(y, window.innerHeight - items.length * 32 - 16)

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1000,
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        minWidth: 160,
        padding: '4px 0',
        userSelect: 'none',
      }}
    >
      {items.map((item, i) => {
        if ('separator' in item) {
          return <div key={i} style={{ height: 1, background: 'var(--color-border)', margin: '3px 0' }} />
        }
        return (
          <button
            key={i}
            onClick={() => { item.onClick(); onClose() }}
            className="w-full flex items-center gap-2 px-3"
            style={{
              height: 32, background: 'none', border: 'none', cursor: 'pointer',
              color: item.danger ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontSize: 12, textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-surface)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            {item.icon && <span style={{ opacity: 0.7 }}>{item.icon}</span>}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
