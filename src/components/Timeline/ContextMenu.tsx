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

  // Focus the first item on open and hand focus back on close, so the menu can
  // be reached and left without a pointer.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => previous?.focus()
  }, [])

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

  // Arrow-key navigation, and Escape handled here rather than only on window so
  // that closing the menu does not also clear the selection through App.tsx's
  // global Escape binding. React's root listener runs before window listeners,
  // so stopping propagation here is enough.
  function onKeyDown(e: React.KeyboardEvent) {
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const at = nodes.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      if (nodes.length === 0) return
      const next = e.key === 'ArrowDown'
        ? (at + 1) % nodes.length
        : (at - 1 + nodes.length) % nodes.length
      nodes[next].focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      e.stopPropagation()
      nodes[e.key === 'Home' ? 0 : nodes.length - 1]?.focus()
    }
  }

  // Clamp to viewport
  const left = Math.min(x, window.innerWidth - 180)
  const top = Math.min(y, window.innerHeight - items.length * 32 - 16)

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Aksi clip"
      onKeyDown={onKeyDown}
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
            role="menuitem"
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
