import { describe, expect, it } from 'vitest'
import { SHORTCUTS, findShortcut, type ShortcutEvent } from './shortcuts'

function ev(code: string, over: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return { code, shiftKey: false, metaKey: false, ctrlKey: false, ...over }
}
const meta = { metaKey: true }
const shift = { shiftKey: true }
const metaShift = { metaKey: true, shiftKey: true }

const idFor = (e: ShortcutEvent) => findShortcut(e)?.id

describe('the table itself', () => {
  it('has no duplicate ids', () => {
    const ids = SHORTCUTS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has no duplicate printed key labels within a group', () => {
    for (const group of new Set(SHORTCUTS.map(s => s.group))) {
      const keys = SHORTCUTS.filter(s => s.group === group).map(s => s.keys)
      expect(new Set(keys).size, group).toBe(keys.length)
    }
  })

  // Two entries accepting the same event would make the first one shadow the
  // second, silently. Every event the table knows about must match exactly one
  // row.
  it('matches each of its own events exactly once', () => {
    const events = [
      ev('Space'), ev('KeyZ', meta), ev('KeyZ', metaShift), ev('Delete'), ev('Backspace'),
      ev('KeyS', meta), ev('KeyB'), ev('KeyB', meta), ev('KeyD', meta), ev('KeyV', meta),
      ev('KeyA', meta), ev('Escape'),
      ev('ArrowLeft'), ev('ArrowLeft', shift), ev('ArrowRight'), ev('ArrowRight', shift),
      ev('Comma'), ev('Period'), ev('KeyJ'), ev('KeyJ', shift), ev('KeyK'), ev('KeyL'),
      ev('KeyL', shift), ev('Home'), ev('End'), ev('KeyM'), ev('BracketLeft'),
      ev('BracketRight'), ev('Equal', meta), ev('Minus', meta), ev('Slash', shift),
    ]
    for (const e of events) {
      const matches = SHORTCUTS.filter(s => s.match(e)).map(s => s.id)
      expect(matches, e.code).toHaveLength(1)
    }
  })
})

describe('findShortcut', () => {
  it('resolves playback keys', () => {
    expect(idFor(ev('Space'))).toBe('play-pause')
    expect(idFor(ev('KeyK'))).toBe('pause')
    expect(idFor(ev('ArrowLeft'))).toBe('step-back-frame')
    expect(idFor(ev('ArrowLeft', shift))).toBe('step-back-5s')
    expect(idFor(ev('ArrowRight'))).toBe('step-fwd-frame')
    expect(idFor(ev('ArrowRight', shift))).toBe('step-fwd-5s')
    expect(idFor(ev('Comma'))).toBe('prev-frame')
    expect(idFor(ev('Period'))).toBe('next-frame')
    expect(idFor(ev('KeyJ'))).toBe('back-1s')
    expect(idFor(ev('KeyJ', shift))).toBe('back-5s')
    expect(idFor(ev('KeyL'))).toBe('fwd-1s')
    expect(idFor(ev('KeyL', shift))).toBe('fwd-5s')
    expect(idFor(ev('Home'))).toBe('home')
    expect(idFor(ev('End'))).toBe('end')
  })

  it('resolves editing keys', () => {
    expect(idFor(ev('KeyZ', meta))).toBe('undo')
    expect(idFor(ev('KeyZ', metaShift))).toBe('redo')
    expect(idFor(ev('Delete'))).toBe('delete-selection')
    expect(idFor(ev('Backspace'))).toBe('delete-selection')
    expect(idFor(ev('KeyB'))).toBe('split')
    expect(idFor(ev('KeyB', meta))).toBe('split')
    expect(idFor(ev('KeyD', meta))).toBe('duplicate')
    expect(idFor(ev('KeyS', meta))).toBe('save')
    expect(idFor(ev('KeyA', meta))).toBe('select-all')
    expect(idFor(ev('Escape'))).toBe('clear-selection')
  })

  it('resolves marker keys', () => {
    expect(idFor(ev('KeyM'))).toBe('toggle-marker')
    expect(idFor(ev('BracketLeft'))).toBe('prev-marker')
    expect(idFor(ev('BracketRight'))).toBe('next-marker')
  })

  it('resolves view keys', () => {
    expect(idFor(ev('Equal', meta))).toBe('zoom-in')
    expect(idFor(ev('Minus', meta))).toBe('zoom-out')
    expect(idFor(ev('Slash', shift))).toBe('shortcuts')
  })

  // ⌘M minimises the window on macOS, so the marker binding is the one plain-key
  // row that guards on the modifier. Losing the guard would make the binding
  // unreachable behind the OS.
  it('leaves ⌘M unbound', () => {
    expect(findShortcut(ev('KeyM', meta))).toBeUndefined()
  })

  it('treats ctrl as the modifier on non-mac platforms', () => {
    expect(idFor(ev('KeyZ', { ctrlKey: true }))).toBe('undo')
    expect(idFor(ev('KeyS', { ctrlKey: true }))).toBe('save')
  })

  it('returns undefined for keys nothing claims', () => {
    expect(findShortcut(ev('KeyQ'))).toBeUndefined()
    expect(findShortcut(ev('KeyQ', meta))).toBeUndefined()
    expect(findShortcut(ev('Slash'))).toBeUndefined()
    expect(findShortcut(ev('KeyV'))).toBeUndefined()
  })

  it('marks paste as timeline-scoped so App does not dispatch it', () => {
    expect(findShortcut(ev('KeyV', meta))?.scope).toBe('timeline')
    for (const s of SHORTCUTS) {
      if (s.id !== 'paste') expect(s.scope, s.id).toBe('global')
    }
  })
})
