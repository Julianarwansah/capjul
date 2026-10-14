import { useEditorStore } from '../../store/editorStore'
import { AudioInspector } from './AudioInspector'
import { ClipInspector } from './ClipInspector'
import { StickerInspector } from './StickerInspector'
import { TextInspector } from './TextInspector'

/**
 * The right-hand inspector: works out which clip is selected and delegates the
 * actual controls to one inspector per clip kind. The widgets those inspectors
 * share live in ./controls.
 *
 * Only the first selected clip of each kind is inspected. More than one kind can
 * be selected at once - a marquee across tracks - so all four branches are
 * independent conditionals rather than a switch.
 */
export function RightPanel() {
  const { project, selectedClipIds, selectedTextIds, selectedAudioIds, selectedStickerIds } = useEditorStore()

  const selectedClip = selectedClipIds[0]
    ? project.clips.find(c => c.id === selectedClipIds[0])
    : null
  const selectedText = selectedTextIds[0]
    ? project.textClips.find(t => t.id === selectedTextIds[0])
    : null
  const selectedAudio = selectedAudioIds[0]
    ? project.audioClips.find(c => c.id === selectedAudioIds[0])
    : null
  const selectedSticker = selectedStickerIds[0]
    ? project.stickerClips.find(c => c.id === selectedStickerIds[0])
    : null

  const hasSelection = !!(selectedClip || selectedText || selectedAudio || selectedSticker)

  const panelTitle = selectedClip ? 'Video Clip'
    : selectedText ? 'Teks'
    : selectedAudio ? 'Audio'
    : selectedSticker ? 'Stiker'
    : 'Properties'

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{ width: 240, borderLeft: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)' }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 shrink-0 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {panelTitle}
        </span>
        {hasSelection && (
          <span
            className="ml-auto text-xs px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(255,71,87,0.12)', color: 'var(--color-primary)' }}
          >
            Selected
          </span>
        )}
      </div>

      {/* No selection */}
      {!hasSelection && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4">
          <div style={{ opacity: 0.15, fontSize: 32 }}>✦</div>
          <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Select a clip on the timeline to edit its properties
          </p>
        </div>
      )}

      {selectedClip && <ClipInspector clip={selectedClip} />}
      {selectedText && <TextInspector clip={selectedText} />}
      {selectedAudio && <AudioInspector clip={selectedAudio} />}
      {selectedSticker && <StickerInspector clip={selectedSticker} />}
    </div>
  )
}
