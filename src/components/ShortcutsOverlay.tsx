import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useEditorStore } from '../store/editorStore'
import { SHORTCUTS, SHORTCUT_GROUPS } from '../shared/shortcuts'

// The keyboard reference. It renders from the same table App.tsx dispatches
// through, so it cannot document a binding that does not exist or omit one that
// does - the reason it is a table rather than a hand-written list.

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function ShortcutsOverlay() {
  const open = useEditorStore(s => s.showShortcuts)
  const setShowShortcuts = useEditorStore(s => s.setShowShortcuts)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // A modal owns focus while open and gives it back on close, so the key that
  // opened the dialog is not the key that ends up somewhere unexpected after.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => previous?.focus()
  }, [open])

  if (!open) return null

  function onKeyDown(e: React.KeyboardEvent) {
    // The dialog swallows every key: a global binding firing while the user reads
    // the list of global bindings would be its own kind of confusion.
    e.stopPropagation()
    if (e.key === 'Escape' || (e.code === 'Slash' && e.shiftKey)) {
      e.preventDefault()
      setShowShortcuts(false)
      return
    }
    if (e.key !== 'Tab') return
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (!nodes || nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', zIndex: 60 }}
      onKeyDown={onKeyDown}
      onClick={() => setShowShortcuts(false)}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Pintasan keyboard"
        onClick={e => e.stopPropagation()}
        className="rounded-lg flex flex-col"
        style={{
          width: 520, maxHeight: '80vh',
          background: 'var(--color-bg-panel)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div
          className="flex items-center justify-between px-4 shrink-0"
          style={{ height: 44, borderBottom: '1px solid var(--color-border)' }}
        >
          <h2 className="text-sm" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            Pintasan keyboard
          </h2>
          <button
            ref={closeRef}
            onClick={() => setShowShortcuts(false)}
            aria-label="Tutup daftar pintasan"
            title="Tutup (Esc)"
            className="flex items-center justify-center rounded"
            style={{
              width: 24, height: 24, border: 'none', cursor: 'pointer',
              background: 'transparent', color: 'var(--color-text-secondary)',
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3">
          {SHORTCUT_GROUPS.map(group => {
            const rows = SHORTCUTS.filter(s => s.group === group)
            if (rows.length === 0) return null
            return (
              <section key={group} className="mb-4">
                <h3
                  className="text-xs mb-1"
                  style={{ color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}
                >
                  {group}
                </h3>
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <tbody>
                    {rows.map(s => (
                      <tr key={s.id}>
                        <td className="py-0.5" style={{ width: 84, verticalAlign: 'top' }}>
                          <kbd
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              background: 'var(--color-bg-surface)',
                              border: '1px solid var(--color-border)',
                              color: 'var(--color-text-primary)',
                              fontFamily: 'inherit',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {s.keys}
                          </kbd>
                        </td>
                        <td className="text-xs py-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                          {s.description}
                          {s.scope === 'timeline' && (
                            <span style={{ color: 'var(--color-text-muted)' }}> · hanya di timeline</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
