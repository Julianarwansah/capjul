import type { RefObject } from 'react'
import { clipTransformAt, poseTransformCss } from '../../shared/scene'
import { transitionStyles, type ActiveTransition, type TransitionStyle } from '../../shared/transitions'
import type { Clip, MediaFile, Track } from '../../types'

// The media layer stack: the background clip (or the outgoing half of a
// transition), the incoming half during a transition, and any picture-in-picture
// overlays above them. Text, stickers and captions live in Overlays.tsx.

export interface BaseMediaLayerProps {
  media: MediaFile | null | undefined
  clip: Clip | null
  currentTime: number
  /** Combined CSS filter string for the clip. */
  filter: string
  /** The outgoing half of the active transition's style pair, or {}. */
  transitionStyle: TransitionStyle
  muted: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  chromaCanvasRef: RefObject<HTMLCanvasElement | null>
}

/** The bottom of the stack: the clip at the playhead, or the outgoing clip while
 *  a transition runs. Renders nothing when no media resolves. */
export function BaseMediaLayer({
  media, clip, currentTime, filter, transitionStyle, muted, videoRef, chromaCanvasRef,
}: BaseMediaLayerProps) {
  if (!media) return null

  // One resolved pose for every media kind. The export compositor draws image
  // and video layers through the same transformAt call, so the preview has to
  // resolve them the same way or an image the user moves, scales, rotates or
  // keyframes exports differently from what they see (tech debt D17).
  const tf = clipTransformAt(clip, currentTime)
  const combinedStyle: React.CSSProperties = {
    objectFit: 'contain',
    filter,
    opacity: tf.opacity,
    transform: poseTransformCss(tf),
    ...transitionStyle,
  }

  if (media.type === 'video') {
    // With chroma key on, the video element is drawn fully transparent and the
    // keyed canvas is what the user actually sees; useChromaKey paints it.
    const chromaOn = clip?.chromaEnabled ?? false
    return (
      <>
        <video
          ref={videoRef}
          src={`media://${media.path}`}
          className="absolute inset-0 w-full h-full"
          style={{ ...combinedStyle, opacity: chromaOn ? 0 : (combinedStyle.opacity ?? 1) }}
          muted={muted}
          playsInline
        />
        {chromaOn && (
          <canvas
            ref={chromaCanvasRef}
            className="absolute inset-0 w-full h-full"
            style={{
              filter: filter || undefined,
              opacity: tf.opacity,
              transform: combinedStyle.transform,
              objectFit: 'contain',
            }}
          />
        )}
      </>
    )
  }

  if (media.type === 'image') {
    return (
      <img
        src={`media://${media.path}`}
        className="absolute inset-0 w-full h-full"
        style={combinedStyle}
        alt=""
      />
    )
  }

  return null
}

export interface IncomingMediaLayerProps {
  activeTransition: ActiveTransition
  currentTime: number
  muted: boolean
  videoRef: RefObject<HTMLVideoElement | null>
}

/** The clip arriving during a transition, painted above the outgoing one.
 *  Carries no filter: `clipFilter` belongs to the clip at the playhead, and
 *  applying it here would grade the incoming clip with the outgoing one's settings. */
export function IncomingMediaLayer({
  activeTransition, currentTime, muted, videoRef,
}: IncomingMediaLayerProps) {
  const { transition, clipB, mediaB, progress } = activeTransition
  const [, styleB] = transitionStyles(transition.type, progress)
  if (!mediaB) return null

  const tf = clipTransformAt(clipB, currentTime)
  const combinedStyle: React.CSSProperties = {
    objectFit: 'contain',
    opacity: tf.opacity,
    transform: poseTransformCss(tf),
    ...styleB,
  }

  if (mediaB.type === 'video') {
    return (
      <video
        ref={videoRef}
        key={mediaB.id}
        src={`media://${mediaB.path}`}
        className="absolute inset-0 w-full h-full"
        style={combinedStyle}
        muted={muted}
        playsInline
      />
    )
  }

  if (mediaB.type === 'image') {
    return (
      <img
        src={`media://${mediaB.path}`}
        className="absolute inset-0 w-full h-full"
        style={combinedStyle}
        alt=""
      />
    )
  }

  return null
}

export interface OverlayVideosProps {
  clips: Clip[]
  videoRefs: Array<RefObject<HTMLVideoElement | null>>
  media: MediaFile[]
  tracks: Track[]
  currentTime: number
  muted: boolean
}

/** Picture-in-picture video clips from tracks above the first. A muted track
 *  hides its overlay entirely, matching how the audio path treats mute. */
export function OverlayVideos({ clips, videoRefs, media, tracks, currentTime, muted }: OverlayVideosProps) {
  return (
    <>
      {clips.map((clip, i) => {
        const file = media.find(m => m.id === clip.mediaId)
        if (!file || file.type !== 'video') return null
        if (tracks.find(t => t.id === clip.trackId)?.muted) return null
        const tf = clipTransformAt(clip, currentTime)
        return (
          <video
            key={clip.id}
            ref={videoRefs[i]}
            src={`media://${file.path}`}
            className="absolute"
            style={{
              left: `${tf.x * 100}%`,
              top: `${tf.y * 100}%`,
              width: `${tf.scaleX * 40}%`,
              height: 'auto',
              aspectRatio: '16/9',
              transform: `translate(-50%, -50%) rotate(${tf.rotation}deg)`,
              opacity: tf.opacity,
              objectFit: 'contain',
              zIndex: i + 2,
              border: '2px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
            }}
            muted={muted}
            playsInline
          />
        )
      })}
    </>
  )
}
