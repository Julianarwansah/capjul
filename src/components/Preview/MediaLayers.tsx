import type { Ref } from 'react'
import { clipTransformAt, poseTransformCss } from '../../shared/scene'
import { transitionStyles, type ActiveTransition, type TransitionStyle } from '../../shared/transitions'
import type { Clip, MediaFile } from '../../types'

// The media layers. Every clip paints through the one component below, whether it
// is the bottom of the stack or a picture-in-picture layer above it, so the
// geometry cannot differ between them. Text, stickers and captions live in
// Overlays.tsx.

export interface MediaLayerProps {
  clip: Clip | null
  media: MediaFile | null | undefined
  currentTime: number
  /** Combined CSS filter string for this clip. */
  filter: string
  muted: boolean
  /** The outgoing half of the active transition's style pair. Omit for a layer
   *  that is not carrying a transition. */
  transitionStyle?: TransitionStyle
  videoRef?: Ref<HTMLVideoElement>
  chromaCanvasRef?: Ref<HTMLCanvasElement>
}

/**
 * One media clip, drawn the way the export compositor draws it: filling the
 * canvas with `object-fit: contain`, positioned by the shared pose helper in
 * POSE_TRANSFORM_ORDER.
 *
 * Stacking is the parent's job. This paints no z-index of its own, so DOM order
 * is paint order and matches `paintOrder()` — which is what keeps the preview and
 * the compositor in agreement about which layer covers which.
 *
 * Renders nothing when no media resolves.
 */
export function MediaLayer({
  clip, media, currentTime, filter, muted, transitionStyle = {}, videoRef, chromaCanvasRef,
}: MediaLayerProps) {
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
    // keyed canvas is what the user actually sees; useChromaKey paints it. Only
    // the base layer is keyed, so an overlay keeps its video visible rather than
    // hiding behind a canvas that was never supplied.
    const chromaOn = (clip?.chromaEnabled ?? false) && !!chromaCanvasRef
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
  videoRef: Ref<HTMLVideoElement>
}

/** The clip arriving during a transition, painted above the outgoing one.
 *  Carries no filter: `clipFilter` belongs to the clip at the playhead, and
 *  applying it here would grade the incoming clip with the outgoing one's settings. */
export function IncomingMediaLayer({
  activeTransition, currentTime, muted, videoRef,
}: IncomingMediaLayerProps) {
  const { transition, clipB, mediaB, progress } = activeTransition
  const [, styleB] = transitionStyles(transition.type, progress)
  return (
    <MediaLayer
      clip={clipB}
      media={mediaB}
      currentTime={currentTime}
      filter=""
      muted={muted}
      transitionStyle={styleB}
      videoRef={videoRef}
    />
  )
}
