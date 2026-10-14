import { useMemo } from 'react'
import { Lock, Unlock, Volume2, VolumeX } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { TRACK_COLORS } from './track-colors'
import { stickerLabel } from '../../shared/sticker-assets'
import { useThumbnail, useWaveform } from './useClipPreviews'
import { WaveformCanvas } from './WaveformCanvas'
import type { Clip, TextClip, AudioClip, StickerClip, Track, MediaFile } from '../../types'

export function TrackLabel({ track }: { track: Track }) {
  const { updateTrack } = useEditorStore()
  return (
    <div
      className="flex items-center gap-1.5 px-2"
      style={{
        height: track.height,
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-panel)',
      }}
    >
      <div
        className="w-2 h-4 rounded-sm shrink-0"
        style={{ background: TRACK_COLORS[track.type] }}
      />
      <span className="text-xs truncate flex-1" style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>
        {track.label}
      </span>
      <div className="flex items-center gap-0.5">
        <TinyBtn
          icon={track.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
          active={track.muted}
        />
        <TinyBtn
          icon={track.locked ? <Lock size={10} /> : <Unlock size={10} />}
          onClick={() => updateTrack(track.id, { locked: !track.locked })}
          active={track.locked}
        />
      </div>
    </div>
  )
}

function TinyBtn({ icon, onClick, active }: { icon: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-5 h-5 rounded flex items-center justify-center"
      style={{
        background: active ? 'rgba(255,71,87,0.15)' : 'transparent',
        border: 'none', cursor: 'pointer',
        color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
      }}
    >
      {icon}
    </button>
  )
}

export function VideoClipItem({
  clip, track, pxPerSec, selected, onMouseDown, onResizeLeft, onResizeRight, onContextMenu, media
}: {
  clip: Clip; track: Track; pxPerSec: number; selected: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onResizeLeft: (e: React.MouseEvent) => void
  onResizeRight: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
  media: MediaFile | undefined
}) {
  const left = clip.startTime * pxPerSec
  const width = clip.duration * pxPerSec
  const thumbnail = useThumbnail(media?.type === 'video' ? media.path : undefined, clip.mediaStart + 0.1)

  return (
    <div
      className="absolute top-1 timeline-clip"
      style={{
        left, width, height: track.height - 8,
        background: selected ? '#2a4a6e' : '#1a3a5e',
        border: selected ? '1.5px solid var(--color-primary)' : '1.5px solid #2a5082',
        borderRadius: 4, overflow: 'hidden', cursor: 'grab',
      }}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
    >
      {/* Thumbnail strip */}
      {thumbnail ? (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${thumbnail})`,
            backgroundSize: 'auto 100%',
            backgroundRepeat: 'repeat-x',
            opacity: 0.5,
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(rgba(74,158,255,0.15), rgba(74,158,255,0.05))' }} />
      )}

      {/* Clip name */}
      <div className="absolute inset-0 flex items-center px-2 gap-1">
        <span className="text-xs font-medium truncate" style={{ color: '#fff', fontSize: 10, userSelect: 'none' }}>
          {media?.name ?? 'Video'}
        </span>
        {clip.speed !== 1 && (
          <span className="text-xs px-1 rounded" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 9 }}>
            {clip.speed}x
          </span>
        )}
      </div>

      {/* Keyframe markers */}
      {clip.keyframes && clip.keyframes.length > 0 && [...new Set(clip.keyframes.map(k => k.time))].map(t => {
        const localX = (t - clip.startTime) * pxPerSec
        if (localX < 4 || localX > width - 4) return null
        return (
          <div
            key={t}
            style={{
              position: 'absolute', bottom: 3, left: localX - 4,
              width: 8, height: 8, transform: 'rotate(45deg)',
              background: '#f59e0b', borderRadius: 1, pointerEvents: 'none',
            }}
          />
        )
      })}

      {/* Resize handles */}
      <div className="range-handle left-0" onMouseDown={onResizeLeft} />
      <div className="range-handle right-0" style={{ right: 0, left: 'auto' }} onMouseDown={onResizeRight} />
    </div>
  )
}

/** Deterministic pseudo-random seeded by string hash + index — stable across renders */
function seededHeight(seed: string, index: number): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  h = (Math.imul(h ^ (h >>> 16), 0x45d9f3b)) | 0
  h = (Math.imul(h ^ index, 0xbf58476d)) | 0
  return (((h >>> 0) % 10) + 2)
}

export function AudioClipItem({
  clip, pxPerSec, selected, media, onMouseDown, onResizeLeft, onResizeRight, onContextMenu,
}: {
  clip: AudioClip; pxPerSec: number; selected?: boolean; media?: MediaFile
  onMouseDown?: (e: React.MouseEvent) => void
  onResizeLeft?: (e: React.MouseEvent) => void
  onResizeRight?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
}) {
  const left = clip.startTime * pxPerSec
  const width = clip.duration * pxPerSec
  const height = 38

  const waveform = useWaveform(media?.path)

  // Stable fake waveform used as fallback / loading placeholder
  const barCount = Math.floor(width / 4)
  const fakeBars = useMemo(
    () => Array.from({ length: barCount }, (_, i) => seededHeight(clip.id, i)),
    [clip.id, barCount],
  )

  return (
    <div
      className="absolute top-1"
      style={{
        left, width, height,
        background: selected ? '#1f4d33' : '#1a3e2a',
        border: selected ? '1.5px solid #4ade80' : '1.5px solid #2a5e3a',
        borderRadius: 4, overflow: 'hidden', cursor: 'grab',
      }}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
    >
      {waveform ? (
        <WaveformCanvas waveform={waveform} width={Math.max(1, width - 3)} height={height - 2} />
      ) : (
        /* Loading / no-file placeholder */
        <div className="absolute bottom-0 left-0 right-0" style={{ height: 12 }}>
          {fakeBars.map((h, i) => (
            <div
              key={i}
              className="absolute bottom-0 w-px"
              style={{ left: i * 4, height: h, background: 'rgba(74,222,128,0.4)' }}
            />
          ))}
        </div>
      )}

      {/* Label on top of waveform */}
      <div className="absolute inset-0 flex items-start px-1.5 pt-0.5 pointer-events-none">
        <span style={{ color: '#4ade80', fontSize: 9, userSelect: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
          {media?.name ?? 'Audio'}
        </span>
      </div>

      {onResizeLeft && <div className="range-handle left-0" onMouseDown={onResizeLeft} />}
      {onResizeRight && <div className="range-handle right-0" style={{ right: 0, left: 'auto' }} onMouseDown={onResizeRight} />}
    </div>
  )
}

export function TextClipItem({
  clip, pxPerSec, selected, onMouseDown, onResizeLeft, onResizeRight, onContextMenu,
}: {
  clip: TextClip; pxPerSec: number; selected?: boolean
  onMouseDown?: (e: React.MouseEvent) => void
  onResizeLeft?: (e: React.MouseEvent) => void
  onResizeRight?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
}) {
  const left = clip.startTime * pxPerSec
  const width = clip.duration * pxPerSec
  return (
    <div
      className="absolute top-1"
      style={{
        left, width, height: 38,
        background: selected ? '#3d2800' : '#2e1f00',
        border: selected ? '1.5px solid #f59e0b' : '1.5px solid #5e3a00',
        borderRadius: 4, overflow: 'hidden', cursor: 'grab',
      }}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
    >
      <div className="absolute inset-0 flex items-center px-2">
        <span className="text-xs truncate" style={{ color: '#f59e0b', fontSize: 10 }}>T: {clip.text}</span>
      </div>
      {onResizeLeft && <div className="range-handle left-0" onMouseDown={onResizeLeft} />}
      {onResizeRight && <div className="range-handle right-0" style={{ right: 0, left: 'auto' }} onMouseDown={onResizeRight} />}
    </div>
  )
}

export function StickerClipItem({
  clip, pxPerSec, selected, onMouseDown, onResizeLeft, onResizeRight, onContextMenu,
}: {
  clip: StickerClip; pxPerSec: number; selected?: boolean
  onMouseDown?: (e: React.MouseEvent) => void
  onResizeLeft?: (e: React.MouseEvent) => void
  onResizeRight?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
}) {
  const left = clip.startTime * pxPerSec
  const width = clip.duration * pxPerSec
  return (
    <div
      className="absolute top-1"
      style={{
        left, width, height: 38,
        background: selected ? '#2a1452' : '#1f0e3e',
        border: selected ? '1.5px solid #a78bfa' : '1.5px solid #4a2e7e',
        borderRadius: 4, overflow: 'hidden', cursor: 'grab',
      }}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
    >
      <div className="absolute inset-0 flex items-center px-2 gap-1">
        <span className="text-xs truncate" style={{ color: '#a78bfa', fontSize: 10 }}>
          {stickerLabel(clip.src)}
        </span>
      </div>
      {onResizeLeft && <div className="range-handle left-0" onMouseDown={onResizeLeft} />}
      {onResizeRight && <div className="range-handle right-0" style={{ right: 0, left: 'auto' }} onMouseDown={onResizeRight} />}
    </div>
  )
}
