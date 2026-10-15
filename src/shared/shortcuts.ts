// The keyboard surface of the app, as data.
//
// App.tsx dispatches through this table and the shortcuts overlay renders from
// it, so a binding cannot be live in one and absent from the other - which is
// exactly how the marker and zoom bindings ended up undocumented when they were
// added. Array order is match precedence: findShortcut returns the first entry
// whose matcher accepts the event, mirroring the if/else chain this replaced.

export interface ShortcutEvent {
  code: string
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}

export type ShortcutGroup = 'Playback' | 'Editing' | 'Markers' | 'View' | 'File'

export interface Shortcut {
  id: string
  group: ShortcutGroup
  /** As printed in the overlay: "⌘⇧Z", "[ / ]", "⇧←". */
  keys: string
  description: string
  /**
   * `global` bindings are dispatched by App.tsx. `timeline` bindings are owned by
   * a component with state App cannot see - paste needs the timeline's clipboard
   * - and are listed here so the overlay documents them without App pretending
   * to handle them.
   */
  scope: 'global' | 'timeline'
  match: (e: ShortcutEvent) => boolean
}

const mod = (e: ShortcutEvent) => e.metaKey || e.ctrlKey
// `plain` deliberately does not exclude the modifier: the if/else chain this
// table replaced did not either, so ⌘K paused and ⌘Home went to the start, and a
// refactor is not where that changes. Only the bindings that guarded on mod in
// the old chain guard here.
const plain = (c: string) => (e: ShortcutEvent) => e.code === c
const plainNoMod = (c: string) => (e: ShortcutEvent) => e.code === c && !mod(e)
const modCode = (c: string) => (e: ShortcutEvent) => e.code === c && mod(e)

export const SHORTCUTS = [
  { id: 'play-pause', group: 'Playback', keys: 'Space', scope: 'global', description: 'Putar / jeda', match: plain('Space') },
  { id: 'undo', group: 'Editing', keys: '⌘Z', scope: 'global', description: 'Undo', match: e => mod(e) && e.code === 'KeyZ' && !e.shiftKey },
  { id: 'redo', group: 'Editing', keys: '⌘⇧Z', scope: 'global', description: 'Redo', match: e => mod(e) && e.code === 'KeyZ' && e.shiftKey },
  { id: 'delete-selection', group: 'Editing', keys: 'Delete', scope: 'global', description: 'Hapus yang dipilih', match: e => e.code === 'Delete' || e.code === 'Backspace' },
  { id: 'save', group: 'File', keys: '⌘S', scope: 'global', description: 'Simpan proyek', match: modCode('KeyS') },
  // Bound with and without the modifier: plain B was the original binding, ⌘B is
  // what CapCut users reach for.
  { id: 'split', group: 'Editing', keys: 'B', scope: 'global', description: 'Potong di playhead', match: plain('KeyB') },
  { id: 'duplicate', group: 'Editing', keys: '⌘D', scope: 'global', description: 'Duplikat yang dipilih', match: modCode('KeyD') },
  { id: 'paste', group: 'Editing', keys: '⌘V', scope: 'timeline', description: 'Tempel salinan', match: modCode('KeyV') },

  { id: 'step-back-frame', group: 'Playback', keys: '←', scope: 'global', description: 'Mundur satu frame', match: e => e.code === 'ArrowLeft' && !e.shiftKey },
  { id: 'step-fwd-frame', group: 'Playback', keys: '→', scope: 'global', description: 'Maju satu frame', match: e => e.code === 'ArrowRight' && !e.shiftKey },
  { id: 'step-back-5s', group: 'Playback', keys: '⇧←', scope: 'global', description: 'Mundur 5 detik', match: e => e.code === 'ArrowLeft' && e.shiftKey },
  { id: 'step-fwd-5s', group: 'Playback', keys: '⇧→', scope: 'global', description: 'Maju 5 detik', match: e => e.code === 'ArrowRight' && e.shiftKey },
  { id: 'prev-frame', group: 'Playback', keys: ',', scope: 'global', description: 'Frame sebelumnya', match: plain('Comma') },
  { id: 'next-frame', group: 'Playback', keys: '.', scope: 'global', description: 'Frame berikutnya', match: plain('Period') },
  { id: 'back-1s', group: 'Playback', keys: 'J', scope: 'global', description: 'Mundur 1 detik', match: e => e.code === 'KeyJ' && !e.shiftKey },
  { id: 'back-5s', group: 'Playback', keys: '⇧J', scope: 'global', description: 'Mundur 5 detik', match: e => e.code === 'KeyJ' && e.shiftKey },
  { id: 'pause', group: 'Playback', keys: 'K', scope: 'global', description: 'Hentikan pemutaran', match: plain('KeyK') },
  { id: 'fwd-1s', group: 'Playback', keys: 'L', scope: 'global', description: 'Maju 1 detik', match: e => e.code === 'KeyL' && !e.shiftKey },
  { id: 'fwd-5s', group: 'Playback', keys: '⇧L', scope: 'global', description: 'Maju 5 detik', match: e => e.code === 'KeyL' && e.shiftKey },
  { id: 'home', group: 'Playback', keys: 'Home', scope: 'global', description: 'Ke awal timeline', match: plain('Home') },
  { id: 'end', group: 'Playback', keys: 'End', scope: 'global', description: 'Ke akhir timeline', match: plain('End') },

  // ⌘M minimises the window on macOS, so the marker binding guards on mod where
  // its neighbours do not - as it did before the table existed.
  { id: 'toggle-marker', group: 'Markers', keys: 'M', scope: 'global', description: 'Tambah / hapus marker di playhead', match: plainNoMod('KeyM') },
  { id: 'prev-marker', group: 'Markers', keys: '[', scope: 'global', description: 'Ke marker sebelumnya', match: plain('BracketLeft') },
  { id: 'next-marker', group: 'Markers', keys: ']', scope: 'global', description: 'Ke marker berikutnya', match: plain('BracketRight') },

  { id: 'zoom-in', group: 'View', keys: '⌘+', scope: 'global', description: 'Perbesar timeline', match: modCode('Equal') },
  { id: 'zoom-out', group: 'View', keys: '⌘-', scope: 'global', description: 'Perkecil timeline', match: modCode('Minus') },
  { id: 'shortcuts', group: 'View', keys: '?', scope: 'global', description: 'Buka / tutup daftar pintasan', match: e => e.code === 'Slash' && e.shiftKey },
] as const satisfies readonly Shortcut[]

/** The literal ids, so a table entry App.tsx does not dispatch is a compile
 *  error rather than a dead row in the overlay. */
export type ShortcutEntry = (typeof SHORTCUTS)[number]
export type ShortcutId = ShortcutEntry['id']

/** The first binding that accepts the event, in table order. */
export function findShortcut(e: ShortcutEvent): ShortcutEntry | undefined {
  return SHORTCUTS.find(s => s.match(e))
}

/** The table grouped for display, in the order the groups are declared here. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = ['Playback', 'Editing', 'Markers', 'View', 'File']
