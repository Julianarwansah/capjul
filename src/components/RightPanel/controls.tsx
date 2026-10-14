import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { hasKeyframes, keyframeAt } from '../../shared/keyframe-interpolate'
import { EASINGS } from '../../shared/keyframe-easing'
import type { Easing, Keyframe } from '../../types'

// The widgets every inspector in this panel is built from. Kept together because
// they have to look and behave identically across clip kinds - a keyframe
// diamond that worked differently for text than for video would be a bug, not a
// style choice.

export function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="panel-section-header w-full"
        aria-expanded={open}
      >
        <span>{title}</span>
        {open
          ? <ChevronDown size={12} />
          : <ChevronRight size={12} />
        }
      </button>
      {open && <div className="px-3 pt-1 pb-3 animate-fadein">{children}</div>}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between mt-2 mb-1">
      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        style={{
          width: 32, height: 18, borderRadius: 9,
          background: checked ? 'var(--color-primary)' : '#3a3a3a',
          border: 'none', cursor: 'pointer', position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute',
          top: 2, left: checked ? 14 : 2,
          width: 14, height: 14, borderRadius: '50%',
          background: 'white',
          transition: 'left 0.18s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </button>
    </div>
  )
}

export function KfBtn({ atPlayhead, animated, property, onClick, disabled, disabledHint }: {
  /** A keyframe for this property sits at the playhead, so a click removes it. */
  atPlayhead: boolean
  /** The property has keyframes somewhere, so it is animated. */
  animated: boolean
  /** Named in the accessible label: without it every diamond on the panel
   *  announces identically and none can be told apart. */
  property: string
  onClick: () => void
  disabled?: boolean
  disabledHint?: string
}) {
  const label = disabled
    ? (disabledHint ?? 'Tidak tersedia')
    : atPlayhead
      ? `Hapus keyframe ${property} di playhead`
      : `Tambah keyframe ${property} di playhead`
  // Filled means "a keyframe is here". An amber outline without a fill means
  // "this property is animated, but not at the playhead" - the old single
  // `active` flag conflated the two, so the title promised to delete a keyframe
  // that a click would in fact have created.
  const borderColor = disabled ? '#3a3a3a' : atPlayhead || animated ? '#f59e0b' : '#555'
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={label}
      aria-label={label}
      aria-pressed={atPlayhead}
      style={{
        width: 14, height: 14, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', padding: 0,
        background: 'transparent', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: 8, height: 8,
        transform: 'rotate(45deg)',
        background: atPlayhead ? '#f59e0b' : 'transparent',
        border: `1.5px solid ${borderColor}`,
        borderRadius: 1,
      }} />
    </button>
  )
}

const EASING_LABELS: Record<Easing, string> = {
  'linear': 'Linear',
  'ease-in': 'Ease in',
  'ease-out': 'Ease out',
  'ease-in-out': 'Ease in-out',
}

/**
 * The keyframe diamond, plus the curve selector that appears only while a
 * keyframe for this property sits at the playhead - which is the only moment
 * there is a keyframe to choose a curve for.
 *
 * The chosen easing governs the segment *leaving* this keyframe.
 */
export function KfControl({ kfs, property, value, onToggle, onEasing, disabled, disabledHint }: {
  kfs: Keyframe[]
  property: string
  value: number
  onToggle: (property: string, value: number) => void
  onEasing: (kf: Keyframe, easing: Easing) => void
  disabled?: boolean
  disabledHint?: string
}) {
  const currentTime = useEditorStore(s => s.currentTime)
  const atPlayhead = keyframeAt(kfs, property, currentTime)
  return (
    <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
      {atPlayhead && !disabled && (
        <select
          value={atPlayhead.easing}
          onChange={e => onEasing(atPlayhead, e.target.value as Easing)}
          aria-label={`Kurva ${property} menuju keyframe berikutnya`}
          title="Kurva menuju keyframe berikutnya"
          style={{
            height: 18, fontSize: 9, padding: '0 2px', maxWidth: 78,
            background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)', borderRadius: 3, cursor: 'pointer',
          }}
        >
          {EASINGS.map(e => <option key={e} value={e}>{EASING_LABELS[e]}</option>)}
        </select>
      )}
      <KfBtn
        atPlayhead={!!atPlayhead}
        animated={hasKeyframes(kfs, property)}
        property={property}
        onClick={() => onToggle(property, value)}
        disabled={disabled}
        disabledHint={disabledHint}
      />
    </div>
  )
}

export function Slider({ label, value, min, max, step = 1, onChange, disabled, hint }: {
  label: string; value: number; min: number; max: number; step?: number
  onChange: (v: number) => void
  disabled?: boolean
  hint?: string
}) {
  return (
    <div className="mb-2" style={disabled ? { opacity: 0.45 } : undefined}>
      <div className="flex justify-between mb-1">
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        disabled={disabled}
        aria-label={label}
        onChange={e => onChange(+e.target.value)}
      />
      {disabled && hint && (
        <p className="mt-0.5" style={{ color: 'var(--color-text-muted)', fontSize: 9 }}>{hint}</p>
      )}
    </div>
  )
}
