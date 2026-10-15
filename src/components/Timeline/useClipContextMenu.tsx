import { useCallback, useEffect, useState } from 'react'
import { AudioLines, Clipboard, Copy, Scissors, Trash2 } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { copyClipAfter } from '../../shared/clip-factory'
import type { Splittable } from '../../shared/clip-split'
import type { ContextMenuEntry } from './ContextMenu'
import type { ClipKind } from './TrackRow'
import type { AudioClip, Clip, StickerClip, TextClip } from '../../types'

// The right-click menu for a timeline clip, and the copy/paste clipboard it
// feeds. Paste is bound here rather than in App.tsx because the clipboard is
// timeline state; split, duplicate and delete stay in App.tsx, which owns every
// other global shortcut.

export interface ClipContextMenuTarget {
  x: number
  y: number
  clipId: string
  kind: ClipKind
}

interface ClipboardEntry {
  kind: ClipKind
  data: unknown
}

/** Reads the store fresh. Every menu action goes through this rather than
 *  capturing state when the menu was built, because the playhead moves between
 *  the menu opening and an entry being clicked. */
const store = () => useEditorStore.getState()

export function useClipContextMenu() {
  const [target, setTarget] = useState<ClipContextMenuTarget | null>(null)
  const [clipboard, setClipboard] = useState<ClipboardEntry | null>(null)

  const open = useCallback((e: React.MouseEvent, clipId: string, kind: ClipKind) => {
    e.preventDefault()
    e.stopPropagation()
    setTarget({ x: e.clientX, y: e.clientY, clipId, kind })
  }, [])

  const close = useCallback(() => setTarget(null), [])

  const paste = useCallback(() => {
    if (!clipboard) return
    const s = store()
    const newClip = copyClipAfter(clipboard.data as Splittable)
    if (clipboard.kind === 'video') s.addClip(newClip as Clip)
    else if (clipboard.kind === 'text') s.addTextClip(newClip as TextClip)
    else if (clipboard.kind === 'audio') s.addAudioClip(newClip as AudioClip)
    else s.addStickerClip(newClip as StickerClip)
  }, [clipboard])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyV') {
        e.preventDefault()
        paste()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paste])

  /** Menu entries for the open target, or an empty list when nothing is open. */
  function items(): ContextMenuEntry[] {
    if (!target) return []
    const { clipId, kind } = target

    // `kind === 'video'` means "lives in the clips array", which includes image
    // clips; only a clip whose media actually carries audio can give it up.
    // Offering the action otherwise would put a dead row in the menu.
    const targetClip = store().project.clips.find(c => c.id === clipId)
    const targetMedia = targetClip && store().project.media.find(m => m.id === targetClip.mediaId)
    const canDetachAudio = kind === 'video' && targetMedia?.type === 'video'

    function clipData() {
      const p = store().project
      if (kind === 'video') return p.clips.find(c => c.id === clipId)
      if (kind === 'text') return p.textClips.find(c => c.id === clipId)
      if (kind === 'audio') return p.audioClips.find(c => c.id === clipId)
      return p.stickerClips.find(c => c.id === clipId)
    }

    function doDuplicate() {
      const clip = clipData()
      if (!clip) return
      const s = store()
      const newClip = copyClipAfter(clip as Splittable)
      if (kind === 'video') s.addClip(newClip as Clip)
      else if (kind === 'text') s.addTextClip(newClip as TextClip)
      else if (kind === 'audio') s.addAudioClip(newClip as AudioClip)
      else s.addStickerClip(newClip as StickerClip)
    }

    function doSplit() {
      const s = store()
      const t = s.currentTime
      if (kind === 'video') s.splitClip(clipId, t)
      else if (kind === 'audio') s.splitAudioClip(clipId, t)
      else if (kind === 'text') s.splitTextClip(clipId, t)
      else s.splitStickerClip(clipId, t)
    }

    function doDelete() {
      const s = store()
      if (kind === 'video') s.removeClip(clipId)
      else if (kind === 'audio') s.removeAudioClip(clipId)
      else if (kind === 'text') s.removeTextClip(clipId)
      else s.removeStickerClip(clipId)
      s.clearSelection()
    }

    function doRippleDelete() {
      const s = store()
      s.rippleDelete(clipId, kind)
      s.clearSelection()
    }

    const entries: ContextMenuEntry[] = [
      { label: 'Duplikat', icon: <Copy size={12} />, onClick: doDuplicate },
      { label: 'Salin', icon: <Copy size={12} />, onClick: () => setClipboard({ kind, data: clipData() }) },
    ]
    if (clipboard) {
      entries.push({ label: `Tempel (${clipboard.kind})`, icon: <Clipboard size={12} />, onClick: paste })
    }
    entries.push(
      { separator: true as const },
      { label: 'Split di Playhead', icon: <Scissors size={12} />, onClick: doSplit },
    )
    if (canDetachAudio) {
      entries.push({
        label: 'Pisahkan audio',
        icon: <AudioLines size={12} />,
        onClick: () => store().detachAudio(clipId),
      })
    }
    entries.push(
      { separator: true as const },
      { label: 'Hapus', icon: <Trash2 size={12} />, onClick: doDelete, danger: true },
      { label: 'Ripple Delete', icon: <Trash2 size={12} />, onClick: doRippleDelete, danger: true },
    )
    return entries
  }

  return { target, open, close, items }
}
