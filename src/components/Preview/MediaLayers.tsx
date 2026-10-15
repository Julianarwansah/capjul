import type { Ref } from 'react'
import { clipTransformAt, poseTransformCss } from '../../shared/scene'
import { poseToCss, type TransitionClipPose } from '../../shared/transition-pose'
import type { ActiveTransition } from '../../shared/transitions'
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
  /** This layer's half of a running transition. Omit when none is running. */
  transitionPose?: TransitionClipPose
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
  clip, media, currentTime, filter, muted, transitionPose, videoRef, chromaCanvasRef,
}: MediaLayerProps) {
  if (!media) return null

  // One resolved pose for every media kind. The export compositor draws image
  // and video layers through the same transformAt call, so the preview has to
  // resolve them the same way or an image the user moves, scales, rotates or
  // keyframes exports differently from what they see (tech debt D17).
  const tf = clipTransformAt(clip, currentTime)
  // A transition pose composes with the clip's own pose and grading instead of
  // replacing them. Replacing was the old behaviour: a clip lost its position,
  // rotation, scale and filter for the length of its own transition.
  const styled = transitionPose
    ? poseToCss(transitionPose, tf, filter)
    : { opacity: tf.opacity, transform: poseTransformCss(tf), filter }
  const combinedStyle: React.CSSProperties = { objectFit: 'contain', ...styled }

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
              filter: styled.filter || undefined,
              opacity: styled.opacity,
              transform: styled.transform,
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
  /** The arriving clip's half of the blend. */
  transitionPose: TransitionClipPose
  currentTime: number
  muted: boolean
  videoRef: Ref<HTMLVideoElement>
}

/** The clip arriving during a transition, painted above the outgoing one.
 *  Carries no filter: the layer filter belongs to the clip at the playhead, and
 *  applying it here would grade the incoming clip with the outgoing one's settings. */
export function IncomingMediaLayer({
  activeTransition, transitionPose, currentTime, muted, videoRef,
}: IncomingMediaLayerProps) {
  return (
    <MediaLayer
      clip={activeTransition.clipB}
      media={activeTransition.mediaB}
      currentTime={currentTime}
      filter=""
      muted={muted}
      transitionPose={transitionPose}
      videoRef={videoRef}
    />
  )
}
