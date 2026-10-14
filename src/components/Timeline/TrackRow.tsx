import { useEditorStore } from '../../store/editorStore'
import { MEDIA_DRAG_MIME } from '../../shared/clip-factory'
import { AudioClipItem, StickerClipItem, TextClipItem, VideoClipItem } from './ClipItems'
import { startClipMove, startClipTrim } from './clip-interaction'
import type { Track } from '../../types'

// One track lane: its second grid, the clips of the kind it holds, and the
// transition markers sitting on the cuts between video clips. Reads the project
// and selection from the store directly so the prop list stays about layout and
// callbacks rather than data plumbing.

export type ClipKind = 'video' | 'text' | 'audio' | 'sticker'

/** Only tracks that hold media clips can receive a drop from the Media panel. */
function isDroppableTrack(track: Track) {
  return track.type === 'video' || track.type === 'audio'
}

export interface TrackRowProps {
  track: Track
  pxPerSec: number
  /** Display length of the lane, floored so short projects still get a grid. */
  timelineDuration: number
  isDropTarget: boolean
  onMarqueeMouseDown: (e: React.MouseEvent) => void
  onDragStateChange: React.Dispatch<React.SetStateAction<string | null>>
  onDropMedia: (e: React.DragEvent, track: Track) => void
  onClipContextMenu: (e: React.MouseEvent, clipId: string, kind: ClipKind) => void
}

export function TrackRow({
  track, pxPerSec, timelineDuration, isDropTarget,
  onMarqueeMouseDown, onDragStateChange, onDropMedia, onClipContextMenu,
}: TrackRowProps) {
  const {
    project,
    selectedClipIds, selectedTextIds, selectedStickerIds, selectedAudioIds,
    updateClip, updateTextClip, updateStickerClip, updateAudioClip,
  } = useEditorStore()

  const timeToX = (t: number) => t * pxPerSec
  const videoClips = track.type === 'video' ? project.clips.filter(c => c.trackId === track.id) : []

  return (
    <div
      className={`relative${isDropTarget ? ' drag-over' : ''}`}
      style={{
        height: track.height,
        borderBottom: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-base)',
      }}
      onMouseDown={onMarqueeMouseDown}
      onDragOver={e => {
        if (!isDroppableTrack(track)) return
        if (!e.dataTransfer.types.includes(MEDIA_DRAG_MIME)) return
        e.preventDefault()
        onDragStateChange(track.id)
      }}
      onDragLeave={e => {
        // Leaving for a child element is not leaving the track.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        onDragStateChange(cur => (cur === track.id ? null : cur))
      }}
      onDrop={e => onDropMedia(e, track)}
    >
      {/* Beat lines */}
      {Array.from({ length: Math.ceil(timelineDuration) }).map((_, i) => (
        <div key={i} className="absolute top-0 bottom-0 w-px"
          style={{ left: timeToX(i), background: i % 5 === 0 ? '#222' : '#1a1a1a' }} />
      ))}

      {/* Video clips */}
      {videoClips.map(clip => (
        <VideoClipItem
          key={clip.id}
          clip={clip}
          track={track}
          pxPerSec={pxPerSec}
          selected={selectedClipIds.includes(clip.id)}
          onMouseDown={e => startClipMove(e, 'clips', clip.id, clip.startTime, updateClip)}
          onResizeLeft={e => startClipTrim(e, 'left', clip, updateClip)}
          onResizeRight={e => startClipTrim(e, 'right', clip, updateClip)}
          onContextMenu={e => onClipContextMenu(e, clip.id, 'video')}
          media={project.media.find(m => m.id === clip.mediaId)}
        />
      ))}

      {/* Transition markers, centred on the cut at the end of each clip. They
          are preview-only: the export drops transitions entirely (D15). */}
      {videoClips.map(clip => {
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
          onMouseDown={e => startClipMove(e, 'audios', clip.id, clip.startTime, updateAudioClip)}
          onResizeLeft={e => startClipTrim(e, 'left', clip, updateAudioClip)}
          onResizeRight={e => startClipTrim(e, 'right', clip, updateAudioClip)}
          onContextMenu={e => onClipContextMenu(e, clip.id, 'audio')}
        />
      ))}

      {/* Text clips */}
      {track.type === 'text' && project.textClips.filter(c => c.trackId === track.id).map(clip => (
        <TextClipItem
          key={clip.id}
          clip={clip}
          pxPerSec={pxPerSec}
          selected={selectedTextIds.includes(clip.id)}
          onMouseDown={e => startClipMove(e, 'texts', clip.id, clip.startTime, updateTextClip)}
          onResizeLeft={e => startClipTrim(e, 'left', clip, updateTextClip)}
          onResizeRight={e => startClipTrim(e, 'right', clip, updateTextClip)}
          onContextMenu={e => onClipContextMenu(e, clip.id, 'text')}
        />
      ))}

      {/* Sticker clips */}
      {track.type === 'sticker' && project.stickerClips.filter(c => c.trackId === track.id).map(clip => (
        <StickerClipItem
          key={clip.id}
          clip={clip}
          pxPerSec={pxPerSec}
          selected={selectedStickerIds.includes(clip.id)}
          onMouseDown={e => startClipMove(e, 'stickers', clip.id, clip.startTime, updateStickerClip)}
          onResizeLeft={e => startClipTrim(e, 'left', clip, updateStickerClip)}
          onResizeRight={e => startClipTrim(e, 'right', clip, updateStickerClip)}
          onContextMenu={e => onClipContextMenu(e, clip.id, 'sticker')}
        />
      ))}
    </div>
  )
}
