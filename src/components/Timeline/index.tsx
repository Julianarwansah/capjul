import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Scissors, Trash2 } from 'lucide-react'
import { Copy, Clipboard } from 'lucide-react'
import { selectHasSelection, useEditorStore } from '../../store/editorStore'
import { copyClipAfter, MEDIA_DRAG_MIME, makeAudioClipFromMedia, makeClipFromMedia } from '../../shared/clip-factory'
import type { Splittable } from '../../shared/clip-split'
import { AudioClipItem, StickerClipItem, TextClipItem, TrackLabel, VideoClipItem } from './ClipItems'
import { ContextMenu, type ContextMenuEntry } from './ContextMenu'
import type { AudioClip, Clip, StickerClip, TextClip, Track } from '../../types'

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const RULER_HEIGHT = 28
const LABEL_WIDTH = 140
// Short and empty projects still get a usable ruler. project.duration stays the
// real content length — this floor is display-only.
const MIN_TIMELINE_SECONDS = 60

export function Timeline() {
  const {
    project, currentTime, setCurrentTime, zoom, setZoom, isPlaying,
    selectedClipIds, selectedTextIds, selectedStickerIds, selectedAudioIds,
    setSelected, clearSelection,
    updateClip, updateTextClip, updateStickerClip, updateAudioClip,
    splitClip, splitAudioClip, splitTextClip, splitStickerClip,
    removeClip, removeTextClip, removeStickerClip, removeAudioClip,
    addTrack, addClip, addAudioClip, addTextClip, addStickerClip,
    rippleDelete, splitAtPlayhead, deleteSelection,
  } = useEditorStore()
  const hasSelection = useEditorStore(selectHasSelection)

  const timelineRef = useRef<HTMLDivElement>(null)
  const [dropTrackId, setDropTrackId] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; clipId: string; kind: 'video' | 'text' | 'audio' | 'sticker' } | null>(null)
  const [clipboard, setClipboard] = useState<{ kind: 'video' | 'text' | 'audio' | 'sticker'; data: unknown } | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const pxPerSec = zoom
  const timelineDuration = Math.max(project.duration, MIN_TIMELINE_SECONDS)
  const totalWidth = Math.max(timelineDuration * pxPerSec + 200, 800)

  function timeToX(t: number) { return t * pxPerSec }
  function xToTime(x: number) { return Math.max(0, x / pxPerSec) }

  // Auto-scroll timeline to keep playhead visible during playback
  useEffect(() => {
    if (!isPlaying) return
    const el = timelineRef.current
    if (!el) return
    const playheadX = currentTime * pxPerSec
    const visibleLeft = el.scrollLeft
    const visibleRight = el.scrollLeft + el.clientWidth - LABEL_WIDTH
    if (playheadX > visibleRight - 40 || playheadX < visibleLeft) {
      el.scrollLeft = Math.max(0, playheadX - el.clientWidth * 0.3)
    }
  }, [currentTime, isPlaying, pxPerSec])

  // Snap a time to nearby clip edges or playhead (within ~8px at current zoom)
  function snapTime(t: number, excludeId?: string): number {
    const SNAP_PX = 8
    const threshold = SNAP_PX / pxPerSec
    const snaps: number[] = [currentTime, 0]
    for (const c of project.clips) {
      if (c.id === excludeId) continue
      snaps.push(c.startTime, c.startTime + c.duration)
    }
    for (const c of project.audioClips) {
      if (c.id === excludeId) continue
      snaps.push(c.startTime, c.startTime + c.duration)
    }
    for (const c of project.textClips) {
      if (c.id === excludeId) continue
      snaps.push(c.startTime, c.startTime + c.duration)
    }
    let best = t
    let bestDist = threshold
    for (const s of snaps) {
      const dist = Math.abs(t - s)
      if (dist < bestDist) { bestDist = dist; best = s }
    }
    return best
  }

  // Reads the store through getState() so the callback's identity changes only
  // with the clipboard - which is exactly what the keydown effect depends on.
  const handlePasteClipboard = useCallback(() => {
    if (!clipboard) return
    const { kind, data } = clipboard
    const st = useEditorStore.getState()
    const newClip = copyClipAfter(data as Splittable)
    if (kind === 'video') st.addClip(newClip as Clip)
    else if (kind === 'text') st.addTextClip(newClip as TextClip)
    else if (kind === 'audio') st.addAudioClip(newClip as AudioClip)
    else st.addStickerClip(newClip as StickerClip)
  }, [clipboard])

  // Split, duplicate and delete are bound once in App.tsx. This listener only
  // owns paste, which needs the clipboard state kept above.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyV') {
        e.preventDefault()
        handlePasteClipboard()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handlePasteClipboard])

  // Click on ruler to seek
  function handleRulerClick(e: React.MouseEvent) {
    if (!timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const scrollLeft = timelineRef.current.scrollLeft
    const x = e.clientX - rect.left + scrollLeft - LABEL_WIDTH
    setCurrentTime(xToTime(x))
  }

  // Drag clip
  function handleClipMouseDown(e: React.MouseEvent, clipId: string, clipStart: number) {
    e.stopPropagation()
    e.preventDefault()
    const x = e.clientX
    if (e.shiftKey) {
      const next = selectedClipIds.includes(clipId)
        ? selectedClipIds.filter(id => id !== clipId)
        : [...selectedClipIds, clipId]
      setSelected({ clips: next, texts: selectedTextIds, stickers: selectedStickerIds, audios: selectedAudioIds })
    } else {
      setSelected({ clips: [clipId] })
    }

    function onMove(me: MouseEvent) {
      const dx = me.clientX - x
      const raw = Math.max(0, clipStart + xToTime(dx))
      const newStart = me.shiftKey ? raw : snapTime(raw, clipId)
      updateClip(clipId, { startTime: newStart })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Resize clip
  function handleResizeMouseDown(e: React.MouseEvent, clipId: string, side: 'left' | 'right', clip: Clip) {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX

    function onMove(me: MouseEvent) {
      const dx = xToTime(me.clientX - startX)
      if (side === 'right') {
        const newDur = Math.max(0.1, clip.duration + dx)
        updateClip(clipId, { duration: newDur, mediaEnd: clip.mediaStart + newDur })
      } else {
        const newStart = Math.max(0, clip.startTime + dx)
        const newDur = Math.max(0.1, clip.duration - dx)
        updateClip(clipId, { startTime: newStart, duration: newDur, mediaStart: clip.mediaStart + dx })
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleAudioResizeMouseDown(e: React.MouseEvent, clipId: string, side: 'left' | 'right', clip: AudioClip) {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    function onMove(me: MouseEvent) {
      const dx = xToTime(me.clientX - startX)
      if (side === 'right') {
        updateAudioClip(clipId, { duration: Math.max(0.1, clip.duration + dx), mediaEnd: clip.mediaStart + Math.max(0.1, clip.duration + dx) })
      } else {
        const newStart = Math.max(0, clip.startTime + dx)
        const newDur = Math.max(0.1, clip.duration - dx)
        updateAudioClip(clipId, { startTime: newStart, duration: newDur, mediaStart: clip.mediaStart + dx })
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleSimpleResizeMouseDown(
    e: React.MouseEvent,
    side: 'left' | 'right',
    clip: TextClip | StickerClip,
    updateFn: (id: string, changes: Partial<TextClip | StickerClip>) => void,
  ) {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    function onMove(me: MouseEvent) {
      const dx = xToTime(me.clientX - startX)
      if (side === 'right') {
        updateFn(clip.id, { duration: Math.max(0.1, clip.duration + dx) })
      } else {
        const newStart = Math.max(0, clip.startTime + dx)
        const newDur = Math.max(0.1, clip.duration - dx)
        updateFn(clip.id, { startTime: newStart, duration: newDur })
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleAudioMouseDown(e: React.MouseEvent, clipId: string, clipStart: number) {
    e.stopPropagation()
    e.preventDefault()
    const x = e.clientX
    if (e.shiftKey) {
      const next = selectedAudioIds.includes(clipId)
        ? selectedAudioIds.filter(id => id !== clipId)
        : [...selectedAudioIds, clipId]
      setSelected({ clips: selectedClipIds, texts: selectedTextIds, stickers: selectedStickerIds, audios: next })
    } else {
      setSelected({ audios: [clipId] })
    }
    function onMove(me: MouseEvent) {
      const raw = Math.max(0, clipStart + xToTime(me.clientX - x))
      const newStart = me.shiftKey ? raw : snapTime(raw, clipId)
      updateAudioClip(clipId, { startTime: newStart })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleTextMouseDown(e: React.MouseEvent, clipId: string, clipStart: number) {
    e.stopPropagation()
    e.preventDefault()
    const x = e.clientX
    if (e.shiftKey) {
      const next = selectedTextIds.includes(clipId)
        ? selectedTextIds.filter(id => id !== clipId)
        : [...selectedTextIds, clipId]
      setSelected({ clips: selectedClipIds, texts: next, stickers: selectedStickerIds, audios: selectedAudioIds })
    } else {
      setSelected({ texts: [clipId] })
    }
    function onMove(me: MouseEvent) {
      const raw = Math.max(0, clipStart + xToTime(me.clientX - x))
      const newStart = me.shiftKey ? raw : snapTime(raw, clipId)
      updateTextClip(clipId, { startTime: newStart })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleStickerMouseDown(e: React.MouseEvent, clipId: string, clipStart: number) {
    e.stopPropagation()
    e.preventDefault()
    const x = e.clientX
    if (e.shiftKey) {
      const next = selectedStickerIds.includes(clipId)
        ? selectedStickerIds.filter(id => id !== clipId)
        : [...selectedStickerIds, clipId]
      setSelected({ clips: selectedClipIds, texts: selectedTextIds, stickers: next, audios: selectedAudioIds })
    } else {
      setSelected({ stickers: [clipId] })
    }
    function onMove(me: MouseEvent) {
      const raw = Math.max(0, clipStart + xToTime(me.clientX - x))
      const newStart = me.shiftKey ? raw : snapTime(raw, clipId)
      updateStickerClip(clipId, { startTime: newStart })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function openCtxMenu(e: React.MouseEvent, clipId: string, kind: 'video' | 'text' | 'audio' | 'sticker') {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, clipId, kind })
  }

  function ctxMenuItems(): ContextMenuEntry[] {
    if (!ctxMenu) return []
    const { clipId, kind } = ctxMenu

    function getClipData() {
      if (kind === 'video') return project.clips.find(c => c.id === clipId)
      if (kind === 'text') return project.textClips.find(c => c.id === clipId)
      if (kind === 'audio') return project.audioClips.find(c => c.id === clipId)
      return project.stickerClips.find(c => c.id === clipId)
    }

    function doDuplicate() {
      const clip = getClipData()
      if (!clip) return
      const newClip = copyClipAfter(clip as Splittable)
      if (kind === 'video') addClip(newClip as Clip)
      else if (kind === 'text') addTextClip(newClip as TextClip)
      else if (kind === 'audio') addAudioClip(newClip as AudioClip)
      else addStickerClip(newClip as StickerClip)
    }

    function doSplit() {
      if (kind === 'video') splitClip(clipId, currentTime)
      else if (kind === 'audio') splitAudioClip(clipId, currentTime)
      else if (kind === 'text') splitTextClip(clipId, currentTime)
      else splitStickerClip(clipId, currentTime)
    }

    function doDelete() {
      if (kind === 'video') removeClip(clipId)
      else if (kind === 'audio') removeAudioClip(clipId)
      else if (kind === 'text') removeTextClip(clipId)
      else removeStickerClip(clipId)
      clearSelection()
    }

    function doRippleDelete() {
      rippleDelete(clipId, kind)
      clearSelection()
    }

    function doCopy() {
      setClipboard({ kind, data: getClipData() })
    }

    const items: ContextMenuEntry[] = [
      { label: 'Duplikat', icon: <Copy size={12} />, onClick: doDuplicate },
      { label: 'Salin', icon: <Copy size={12} />, onClick: doCopy },
    ]
    if (clipboard) {
      items.push({ label: `Tempel (${clipboard.kind})`, icon: <Clipboard size={12} />, onClick: handlePasteClipboard })
    }
    items.push(
      { separator: true as const },
      { label: 'Split di Playhead', icon: <Scissors size={12} />, onClick: doSplit },
      { separator: true as const },
      { label: 'Hapus', icon: <Trash2 size={12} />, onClick: doDelete, danger: true },
      { label: 'Ripple Delete', icon: <Trash2 size={12} />, onClick: doRippleDelete, danger: true },
    )
    return items
  }

  function handleMarqueeMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    const container = timelineRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const startX = e.clientX - rect.left + container.scrollLeft - LABEL_WIDTH
    const startY = e.clientY - rect.top + container.scrollTop - RULER_HEIGHT

    let curX = startX, curY = startY

    // Arrow, not `function`: hoisted declarations lose the non-null narrowing of `container`.
    const onMove = (me: MouseEvent) => {
      curX = me.clientX - rect.left + container.scrollLeft - LABEL_WIDTH
      curY = me.clientY - rect.top + container.scrollTop - RULER_HEIGHT
      setMarquee({
        x: Math.min(startX, curX) + LABEL_WIDTH,
        y: Math.min(startY, curY) + RULER_HEIGHT,
        w: Math.abs(curX - startX),
        h: Math.abs(curY - startY),
      })
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const t1 = xToTime(Math.min(startX, curX))
      const t2 = xToTime(Math.max(startX, curX))
      if (t2 - t1 < 0.05) { setMarquee(null); return }
      const clips = project.clips.filter(c => c.startTime < t2 && c.startTime + c.duration > t1).map(c => c.id)
      const audios = project.audioClips.filter(c => c.startTime < t2 && c.startTime + c.duration > t1).map(c => c.id)
      const texts = project.textClips.filter(c => c.startTime < t2 && c.startTime + c.duration > t1).map(c => c.id)
      const stickers = project.stickerClips.filter(c => c.startTime < t2 && c.startTime + c.duration > t1).map(c => c.id)
      setSelected({ clips, audios, texts, stickers })
      setMarquee(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function isDroppableTrack(track: Track) {
    return track.type === 'video' || track.type === 'audio'
  }

  // Drop media from the Media panel onto a track at the drop position.
  function handleTrackDrop(e: React.DragEvent, track: Track) {
    e.preventDefault()
    setDropTrackId(null)
    const mediaId = e.dataTransfer.getData(MEDIA_DRAG_MIME)
    const media = project.media.find(m => m.id === mediaId)
    if (!media || !timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft - LABEL_WIDTH
    const startTime = xToTime(x)
    if (track.type === 'video') {
      const clip = makeClipFromMedia(media, track.id, startTime)
      if (clip) addClip(clip)
    } else if (track.type === 'audio') {
      const audioClip = makeAudioClipFromMedia(media, track.id, startTime)
      if (audioClip) addAudioClip(audioClip)
    }
  }

  // Ruler ticks
  function renderRuler() {
    const ticks = []
    const interval = zoom > 100 ? 1 : zoom > 50 ? 2 : zoom > 25 ? 5 : 10
    for (let t = 0; t <= timelineDuration; t += interval) {
      ticks.push(
        <div key={t} className="absolute flex flex-col items-start" style={{ left: timeToX(t) }}>
          <div style={{ height: t % (interval * 5) === 0 ? 10 : 6, width: 1, background: t % (interval * 5) === 0 ? '#555' : '#333' }} />
          {t % (interval * 5) === 0 && (
            <span style={{ fontSize: 9, color: '#666', marginTop: 1, transform: 'translateX(-50%)', userSelect: 'none' }}>
              {formatTime(t)}
            </span>
          )}
        </div>
      )
    }
    return ticks
  }

  const allTracks = project.tracks

  return (
    <>
    <div
      className="flex flex-col shrink-0"
      style={{ height: 280, borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-panel)' }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 shrink-0"
        style={{ height: 36, borderBottom: '1px solid var(--color-border)' }}
      >
        <button
          className="text-xs px-2 h-6 rounded flex items-center gap-1"
          style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }}
          onClick={() => addTrack('video')}
        >
          <Plus size={11} /> Track
        </button>
        <button
          className="text-xs px-2 h-6 rounded flex items-center gap-1"
          title="Split di posisi playhead (⌘B)"
          style={{
            background: hasSelection ? 'var(--color-bg-surface)' : 'transparent',
            color: hasSelection ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
            border: 'none', cursor: hasSelection ? 'pointer' : 'default',
            opacity: hasSelection ? 1 : 0.4,
          }}
          onClick={splitAtPlayhead}
          disabled={!hasSelection}
        >
          <Scissors size={11} /> Split
        </button>
        <button
          className="text-xs px-2 h-6 rounded flex items-center gap-1"
          title="Hapus yang dipilih (Delete)"
          style={{
            background: hasSelection ? 'rgba(255,71,87,0.1)' : 'transparent',
            color: hasSelection ? 'var(--color-primary)' : 'var(--color-text-muted)',
            border: 'none', cursor: hasSelection ? 'pointer' : 'default',
            opacity: hasSelection ? 1 : 0.4,
          }}
          onClick={deleteSelection}
          disabled={!hasSelection}
        >
          <Trash2 size={11} /> Hapus
        </button>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Zoom</span>
          <input
            type="range" min={20} max={300} step={10} value={zoom}
            onChange={e => setZoom(+e.target.value)}
            style={{ width: 80 }}
          />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)', width: 32 }}>{Math.round(zoom / 80 * 100)}%</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Track labels */}
        <div
          className="flex flex-col shrink-0 overflow-hidden"
          style={{ width: LABEL_WIDTH, borderRight: '1px solid var(--color-border)' }}
        >
          {/* Ruler placeholder */}
          <div style={{ height: RULER_HEIGHT, borderBottom: '1px solid var(--color-border)' }} />

          {/* Track labels */}
          {allTracks.map(track => (
            <TrackLabel key={track.id} track={track} />
          ))}
        </div>

        {/* Timeline scroll area */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-x-auto overflow-y-auto"
          onScroll={() => {}}
          onWheel={e => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault()
              const delta = e.deltaY > 0 ? -15 : 15
              setZoom(Math.max(10, Math.min(500, zoom + delta)))
            }
          }}
        >
          <div style={{ width: totalWidth, minHeight: '100%' }}>
            {/* Ruler */}
            <div
              className="sticky top-0 relative cursor-pointer"
              style={{
                height: RULER_HEIGHT, zIndex: 10,
                background: 'var(--color-bg-panel)',
                borderBottom: '1px solid var(--color-border)',
              }}
              onClick={handleRulerClick}
            >
              {renderRuler()}

              {/* Playhead on ruler */}
              <div
                className="absolute top-0 bottom-0 w-px pointer-events-none z-20"
                style={{ left: timeToX(currentTime), background: 'var(--color-primary)' }}
              >
                <div style={{
                  position: 'absolute', top: 0, left: -5, width: 10, height: 10,
                  background: 'var(--color-primary)',
                  clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
                }} />
              </div>
            </div>

            {/* Marquee selection box */}
            {marquee && (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: marquee.x,
                  top: marquee.y,
                  width: marquee.w,
                  height: marquee.h,
                  border: '1.5px solid var(--color-primary)',
                  background: 'rgba(255,71,87,0.08)',
                  zIndex: 20,
                }}
              />
            )}

            {/* Tracks */}
            {allTracks.map(track => (
              <div
                key={track.id}
                className={`relative${dropTrackId === track.id ? ' drag-over' : ''}`}
                style={{
                  height: track.height,
                  borderBottom: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-bg-base)',
                }}
                onMouseDown={handleMarqueeMouseDown}
                onDragOver={e => {
                  if (!isDroppableTrack(track)) return
                  if (!e.dataTransfer.types.includes(MEDIA_DRAG_MIME)) return
                  e.preventDefault()
                  setDropTrackId(track.id)
                }}
                onDragLeave={e => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return
                  setDropTrackId(cur => (cur === track.id ? null : cur))
                }}
                onDrop={e => handleTrackDrop(e, track)}
              >
                {/* Beat lines */}
                {Array.from({ length: Math.ceil(timelineDuration) }).map((_, i) => (
                  <div key={i} className="absolute top-0 bottom-0 w-px"
                    style={{ left: timeToX(i), background: i % 5 === 0 ? '#222' : '#1a1a1a' }} />
                ))}

                {/* Video clips */}
                {track.type === 'video' && project.clips.filter(c => c.trackId === track.id).map(clip => (
                  <VideoClipItem
                    key={clip.id}
                    clip={clip}
                    track={track}
                    pxPerSec={pxPerSec}
                    selected={selectedClipIds.includes(clip.id)}
                    onMouseDown={e => handleClipMouseDown(e, clip.id, clip.startTime)}
                    onResizeLeft={e => handleResizeMouseDown(e, clip.id, 'left', clip)}
                    onResizeRight={e => handleResizeMouseDown(e, clip.id, 'right', clip)}
                    onContextMenu={e => openCtxMenu(e, clip.id, 'video')}
                    media={project.media.find(m => m.id === clip.mediaId)}
                  />
                ))}

                {/* Transition markers */}
                {track.type === 'video' && project.clips.filter(c => c.trackId === track.id).map(clip => {
                  const tr = project.transitions.find(t => t.clipId === clip.id)
                  if (!tr) return null
                  const cx = timeToX(clip.startTime + clip.duration)
                  const tw = Math.max(6, tr.duration * pxPerSec)
                  return (
                    <div
                      key={`tr-${clip.id}`}
                      title={`${tr.type} (${tr.duration}s)`}
                      style={{
                        position: 'absolute',
                        left: cx - tw / 2,
                        top: 6,
                        width: tw,
                        height: track.height - 14,
                        background: 'rgba(255,210,0,0.25)',
                        border: '1px solid rgba(255,210,0,0.7)',
                        borderRadius: 3,
                        zIndex: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                      }}
                    >
                      <span style={{ fontSize: 7, color: '#ffd700', fontWeight: 'bold' }}>T</span>
                    </div>
                  )
                })}

                {/* Audio clips */}
                {track.type === 'audio' && project.audioClips.filter(c => c.trackId === track.id).map(clip => (
                  <AudioClipItem
                    key={clip.id}
                    clip={clip}
                    pxPerSec={pxPerSec}
                    selected={selectedAudioIds.includes(clip.id)}
                    media={project.media.find(m => m.id === clip.mediaId)}
                    onMouseDown={e => handleAudioMouseDown(e, clip.id, clip.startTime)}
                    onResizeLeft={e => handleAudioResizeMouseDown(e, clip.id, 'left', clip)}
                    onResizeRight={e => handleAudioResizeMouseDown(e, clip.id, 'right', clip)}
                    onContextMenu={e => openCtxMenu(e, clip.id, 'audio')}
                  />
                ))}

                {/* Text clips */}
                {track.type === 'text' && project.textClips.filter(c => c.trackId === track.id).map(clip => (
                  <TextClipItem
                    key={clip.id}
                    clip={clip}
                    pxPerSec={pxPerSec}
                    selected={selectedTextIds.includes(clip.id)}
                    onMouseDown={e => handleTextMouseDown(e, clip.id, clip.startTime)}
                    onResizeLeft={e => handleSimpleResizeMouseDown(e, 'left', clip, updateTextClip as (id: string, changes: Partial<TextClip | StickerClip>) => void)}
                    onResizeRight={e => handleSimpleResizeMouseDown(e, 'right', clip, updateTextClip as (id: string, changes: Partial<TextClip | StickerClip>) => void)}
                    onContextMenu={e => openCtxMenu(e, clip.id, 'text')}
                  />
                ))}

                {/* Sticker clips */}
                {track.type === 'sticker' && project.stickerClips.filter(c => c.trackId === track.id).map(clip => (
                  <StickerClipItem
                    key={clip.id}
                    clip={clip}
                    pxPerSec={pxPerSec}
                    selected={selectedStickerIds.includes(clip.id)}
                    onMouseDown={e => handleStickerMouseDown(e, clip.id, clip.startTime)}
                    onResizeLeft={e => handleSimpleResizeMouseDown(e, 'left', clip, updateStickerClip as (id: string, changes: Partial<TextClip | StickerClip>) => void)}
                    onResizeRight={e => handleSimpleResizeMouseDown(e, 'right', clip, updateStickerClip as (id: string, changes: Partial<TextClip | StickerClip>) => void)}
                    onContextMenu={e => openCtxMenu(e, clip.id, 'sticker')}
                  />
                ))}
              </div>
            ))}

            {/* Playhead line across tracks */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{
                left: timeToX(currentTime),
                width: 2,
                top: RULER_HEIGHT,
                background: 'rgba(255,71,87,0.5)',
                zIndex: 15,
              }}
            />
          </div>
        </div>
      </div>
    </div>

    {ctxMenu && (
      <ContextMenu
        x={ctxMenu.x}
        y={ctxMenu.y}
        items={ctxMenuItems()}
        onClose={() => setCtxMenu(null)}
      />
    )}
    </>
  )
}
