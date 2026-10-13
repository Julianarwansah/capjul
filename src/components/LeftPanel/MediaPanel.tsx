import { useState, useRef } from 'react'
import { Upload, Search, Grid2X2, List, Film, Image, Music2, X, Plus } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { MediaFile, MediaType, Clip, FfprobeStream } from '../../types'

function getMediaType(path: string): MediaType {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'aac', 'm4a', 'flac'].includes(ext)) return 'audio'
  return 'image'
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

async function probeDimensions(path: string) {
  const empty = { duration: 0, width: 0, height: 0 }
  try {
    const probed = await window.electronAPI?.probeMedia(path)
    if (!probed?.ok) return empty
    const vs = probed.value.streams.find((s: FfprobeStream) => s.codec_type === 'video')
    return {
      duration: parseFloat(probed.value.format.duration ?? '0'),
      width: vs?.width ?? 0,
      height: vs?.height ?? 0,
    }
  } catch (err) {
    console.error('[media] probe failed for', path, err instanceof Error ? err.message : err)
    return empty
  }
}

export function MediaPanel() {
  const { project, addMedia, addClip, currentTime } = useEditorStore()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [filter, setFilter] = useState<'all' | 'video' | 'image' | 'audio'>('all')
  const dropRef = useRef<HTMLDivElement>(null)

  const filtered = project.media.filter(m => {
    if (filter !== 'all' && m.type !== filter) return false
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function importFiles() {
    const opened = await window.electronAPI?.openMedia()
    const paths = opened?.ok ? opened.value : []
    if (!paths.length) return
    const newFiles: MediaFile[] = []
    for (const p of paths) {
      newFiles.push({
        id: crypto.randomUUID(),
        path: p,
        name: p.split('/').pop() ?? p,
        type: getMediaType(p),
        size: 0,
        ...(await probeDimensions(p)),
      })
    }
    addMedia(newFiles)
  }

  function addToTimeline(media: MediaFile) {
    if (media.type === 'audio') return
    const mainTrack = project.tracks.find(t => t.type === 'video')
    if (!mainTrack) return
    const clip: Clip = {
      id: crypto.randomUUID(),
      mediaId: media.id,
      trackId: mainTrack.id,
      startTime: currentTime,
      duration: media.duration || 5,
      mediaStart: 0,
      mediaEnd: media.duration || 5,
      speed: 1, volume: 1, muted: false, reversed: false, opacity: 1,
      x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
      filter: undefined,
      brightness: 0, contrast: 0, saturation: 0,
      exposure: 0, highlights: 0, shadows: 0,
      temperature: 0, tint: 0, sharpness: 0,
      chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
      stabilize: false,
    }
    addClip(clip)
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    dropRef.current?.classList.remove('drag-over')
    // Electron >=32 removed File.path; the real path must come from webUtils in the preload.
    const dropped = Array.from(e.dataTransfer.files)
      .map(f => ({ path: window.electronAPI?.getPathForFile(f) ?? '', name: f.name, size: f.size }))
      .filter(f => f.path)
    if (!dropped.length) return
    const newFiles: MediaFile[] = []
    for (const { path: p, name, size } of dropped) {
      newFiles.push({
        id: crypto.randomUUID(),
        path: p,
        name,
        type: getMediaType(name),
        size,
        ...(await probeDimensions(p)),
      })
    }
    addMedia(newFiles)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 flex flex-col gap-2 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <div
            className="flex-1 flex items-center gap-2 rounded px-2 h-7"
            style={{ background: 'var(--color-bg-surface)' }}
          >
            <Search size={13} style={{ color: 'var(--color-text-muted)' }} />
            <input
              className="flex-1 bg-transparent outline-none text-xs"
              style={{ color: 'var(--color-text-primary)' }}
              placeholder="Search media..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            className="w-7 h-7 rounded flex items-center justify-center"
            style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)' }}
            onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}
          >
            {view === 'grid' ? <List size={14} /> : <Grid2X2 size={14} />}
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1">
          {(['all', 'video', 'image', 'audio'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="text-xs px-2 py-1 rounded capitalize"
              style={{
                background: filter === f ? 'var(--color-primary)' : 'var(--color-bg-surface)',
                color: filter === f ? 'white' : 'var(--color-text-secondary)',
                border: 'none', cursor: 'pointer',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Import button */}
      <button
        onClick={importFiles}
        className="mx-3 mt-3 mb-2 flex items-center justify-center gap-2 h-9 rounded text-sm shrink-0"
        style={{
          background: 'rgba(255,71,87,0.12)',
          color: 'var(--color-primary)',
          border: '1px dashed var(--color-primary)',
          cursor: 'pointer',
        }}
      >
        <Plus size={16} />
        Import Media
      </button>

      {/* Drop zone + grid */}
      <div
        ref={dropRef}
        className="flex-1 overflow-y-auto p-2"
        onDragOver={e => { e.preventDefault(); dropRef.current?.classList.add('drag-over') }}
        onDragLeave={() => dropRef.current?.classList.remove('drag-over')}
        onDrop={handleDrop}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-10">
            <Upload size={36} style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
              Drop media files here<br />or click Import Media
            </p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map(m => <MediaGridItem key={m.id} media={m} onAdd={addToTimeline} />)}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map(m => <MediaListItem key={m.id} media={m} onAdd={addToTimeline} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function MediaGridItem({ media, onAdd }: { media: MediaFile; onAdd: (m: MediaFile) => void }) {
  const { removeMedia } = useEditorStore()
  return (
    <div
      className="group relative rounded overflow-hidden cursor-pointer"
      style={{ background: 'var(--color-bg-surface)', aspectRatio: '16/9' }}
      onDoubleClick={() => onAdd(media)}
    >
      {media.type === 'video' && (
        <video
          src={`media://${media.path}`}
          className="w-full h-full object-cover"
          muted preload="metadata"
        />
      )}
      {media.type === 'image' && (
        <img src={`media://${media.path}`} className="w-full h-full object-cover" alt={media.name} />
      )}
      {media.type === 'audio' && (
        <div className="w-full h-full flex items-center justify-center" style={{ background: '#1a1a2e' }}>
          <Music2 size={28} style={{ color: 'var(--color-track-audio)' }} />
        </div>
      )}
      {/* Overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
        style={{ background: 'rgba(0,0,0,0.6)' }}
      >
        <button
          onClick={() => onAdd(media)}
          className="text-xs px-2 py-1 rounded"
          style={{ background: 'var(--color-primary)', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Add
        </button>
        <button
          onClick={() => removeMedia(media.id)}
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          <X size={12} />
        </button>
      </div>
      {/* Duration badge */}
      {media.duration > 0 && (
        <div
          className="absolute bottom-1 right-1 text-xs px-1 rounded"
          style={{ background: 'rgba(0,0,0,0.7)', color: 'white', fontSize: 10 }}
        >
          {formatDuration(media.duration)}
        </div>
      )}
      {/* Type icon */}
      <div className="absolute top-1 left-1" style={{ color: 'white', opacity: 0.7 }}>
        {media.type === 'video' ? <Film size={12} /> : media.type === 'image' ? <Image size={12} /> : <Music2 size={12} />}
      </div>
    </div>
  )
}

function MediaListItem({ media, onAdd }: { media: MediaFile; onAdd: (m: MediaFile) => void }) {
  const { removeMedia } = useEditorStore()
  return (
    <div
      className="flex items-center gap-2 p-2 rounded group cursor-pointer"
      style={{ background: 'var(--color-bg-surface)' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-surface)'}
      onDoubleClick={() => onAdd(media)}
    >
      <div
        className="w-12 h-8 rounded overflow-hidden shrink-0 flex items-center justify-center"
        style={{ background: '#111' }}
      >
        {media.type === 'video' && <Film size={14} style={{ color: 'var(--color-track-video)' }} />}
        {media.type === 'image' && <Image size={14} style={{ color: '#f59e0b' }} />}
        {media.type === 'audio' && <Music2 size={14} style={{ color: 'var(--color-track-audio)' }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate" style={{ color: 'var(--color-text-primary)' }}>{media.name}</p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {media.duration > 0 ? formatDuration(media.duration) : ''}{media.width ? ` · ${media.width}×${media.height}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
        <button
          onClick={() => onAdd(media)}
          className="text-xs px-2 py-0.5 rounded"
          style={{ background: 'var(--color-primary)', color: 'white', border: 'none', cursor: 'pointer' }}
        >+</button>
        <button
          onClick={() => removeMedia(media.id)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}
