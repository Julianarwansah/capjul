import type { MediaFile, Project } from './project-schema'

// The RenderPlan is the compiled form of a Project: everything the encoder
// needs, nothing it does not. It is plain JSON so it can be logged, snapshotted
// in tests, and diffed between preview and export runs.
//
// Model (validated by docs/prototypes/export-pipeline): shift every clip onto
// the timeline, then overlay it onto a background of the full duration. This
// expresses gaps, overlaps, z-order and multiple tracks, which concat cannot.

export interface RenderInput {
  id: string
  path: string
  /** Probed by main before encoding; undefined means "not probed yet". */
  hasAudio?: boolean
}

export interface RenderLayer {
  inputId: string
  kind: 'video' | 'image'
  z: number
  start: number
  end: number
  mediaStart: number
  mediaEnd: number
  speed: number
  opacity: number
  x: number
  y: number
  scaleX: number
  scaleY: number
}

export interface RenderAudio {
  inputId: string
  start: number
  mediaStart: number
  mediaEnd: number
  speed: number
  volume: number
  fadein: number
  fadeout: number
}

export interface RenderOverlay {
  png: string
  z: number
  start: number
  end: number
}

export interface RenderOutput {
  format: 'mp4' | 'mov' | 'webm'
  videoBitrate: string
  audioBitrate: string
}

export interface RenderPlan {
  width: number
  height: number
  fps: number
  duration: number
  background: string
  inputs: RenderInput[]
  layers: RenderLayer[]
  overlays: RenderOverlay[]
  audio: RenderAudio[]
  output: RenderOutput
}

/**
 * Pure Project -> RenderPlan compilation. No I/O, no FFmpeg knowledge beyond
 * the plan shape, so it is fully unit-testable.
 */
export function compileProject(project: Project, output: RenderOutput): RenderPlan {
  const mediaById = new Map(project.media.map(m => [m.id, m]))
  const trackZ = new Map(project.tracks.map((t, i) => [t.id, i]))

  const inputs: RenderInput[] = []
  const inputIdOf = new Map<string, string>()
  const inputFor = (media: MediaFile): string => {
    const existing = inputIdOf.get(media.id)
    if (existing) return existing
    const id = `in${inputs.length}`
    inputs.push({ id, path: media.path })
    inputIdOf.set(media.id, id)
    return id
  }

  const layers: RenderLayer[] = []
  const audio: RenderAudio[] = []

  for (const clip of project.clips) {
    if (clip.duration <= 0) continue
    const media = mediaById.get(clip.mediaId)
    if (!media) continue // orphaned clip: skip rather than crash the export
    const speed = clip.speed || 1
    layers.push({
      inputId: inputFor(media),
      kind: media.type === 'image' ? 'image' : 'video',
      z: trackZ.get(clip.trackId) ?? 0,
      start: clip.startTime,
      end: clip.startTime + clip.duration,
      mediaStart: clip.mediaStart,
      mediaEnd: clip.mediaEnd,
      speed,
      opacity: clip.opacity,
      x: clip.x,
      y: clip.y,
      scaleX: clip.scaleX,
      scaleY: clip.scaleY,
    })
    if (media.type === 'video' && !clip.muted && clip.volume > 0) {
      audio.push({
        inputId: inputFor(media),
        start: clip.startTime,
        mediaStart: clip.mediaStart,
        mediaEnd: clip.mediaEnd,
        speed,
        volume: clip.volume,
        fadein: 0,
        fadeout: 0,
      })
    }
  }

  for (const clip of project.audioClips) {
    if (clip.duration <= 0) continue
    const media = mediaById.get(clip.mediaId)
    if (!media) continue
    const volume = clip.muted ? 0 : clip.volume
    if (volume <= 0) continue
    audio.push({
      inputId: inputFor(media),
      start: clip.startTime,
      mediaStart: clip.mediaStart,
      mediaEnd: clip.mediaEnd,
      speed: clip.speed || 1,
      volume,
      fadein: clip.fadein,
      fadeout: clip.fadeout,
    })
  }

  layers.sort((a, b) => a.z - b.z || a.start - b.start)

  return {
    width: project.width,
    height: project.height,
    fps: project.fps,
    duration: project.duration,
    background: project.backgroundColor,
    inputs,
    layers,
    overlays: [],
    audio,
    output,
  }
}

// --- encoder side -----------------------------------------------------------

const CODECS: Record<RenderOutput['format'], { video: string[]; audio: string[] }> = {
  mp4: { video: ['-c:v', 'libx264'], audio: ['-c:a', 'aac'] },
  mov: { video: ['-c:v', 'libx264'], audio: ['-c:a', 'aac'] },
  webm: { video: ['-c:v', 'libvpx-vp9'], audio: ['-c:a', 'libopus'] },
}

const round4 = (n: number) => Math.round(n * 10000) / 10000

/** atempo only accepts 0.5-100 per instance; chain instances below that. */
export function atempoChain(speed: number): string[] {
  const factors: number[] = []
  let rest = speed
  while (rest < 0.5) {
    factors.push(0.5)
    rest /= 0.5
  }
  factors.push(rest)
  return factors.map(f => `atempo=${round4(f)}`)
}

/** Preview semantics: translate(x*100%, y*100%) on a canvas-filling element,
 *  scale about the centre. Equivalent overlay origin for a scaled box. */
export function overlayOrigin(layer: RenderLayer, width: number, height: number) {
  const bw = width * layer.scaleX
  const bh = height * layer.scaleY
  return {
    x: Math.round(width / 2 + layer.x * width - bw / 2),
    y: Math.round(height / 2 + layer.y * height - bh / 2),
  }
}

function colorLiteral(background: string): string {
  return /^#[0-9a-f]{6}$/i.test(background) ? background : 'black'
}

export function buildRenderArgs(plan: RenderPlan, outputPath: string): string[] {
  const args = ['-y', '-hide_banner']
  for (const input of plan.inputs) {
    const layer = plan.layers.find(l => l.inputId === input.id)
    // Still images are looped at input level so they behave like a stream.
    if (layer?.kind === 'image') args.push('-loop', '1')
    args.push('-i', input.path)
  }
  for (const overlay of plan.overlays) args.push('-loop', '1', '-i', overlay.png)

  const fc: string[] = []
  fc.push(
    `color=c=${colorLiteral(plan.background)}:s=${plan.width}x${plan.height}` +
    `:r=${plan.fps}:d=${round4(plan.duration)}[base]`,
  )

  const inputIndex = new Map(plan.inputs.map((n, i) => [n.id, i]))
  let acc = 'base'

  plan.layers.forEach((layer, i) => {
    const idx = inputIndex.get(layer.inputId)
    const bw = Math.round(plan.width * layer.scaleX)
    const bh = Math.round(plan.height * layer.scaleY)
    const chain: string[] = []
    if (layer.kind === 'image') {
      chain.push(`trim=start=0:end=${round4(layer.end - layer.start)}`, 'setpts=PTS-STARTPTS')
    } else {
      chain.push(
        `trim=start=${round4(layer.mediaStart)}:end=${round4(layer.mediaEnd)}`,
        `setpts=(PTS-STARTPTS)/${round4(layer.speed)}`,
      )
    }
    chain.push(
      `scale=${bw}:${bh}:force_original_aspect_ratio=decrease`,
      `pad=${bw}:${bh}:(ow-iw)/2:(oh-ih)/2`,
      'setsar=1',
      `fps=${plan.fps}`,
    )
    if (layer.opacity < 1) chain.push('format=rgba', `colorchannelmixer=aa=${round4(layer.opacity)}`)
    chain.push(`setpts=PTS+${round4(layer.start)}/TB`)
    fc.push(`[${idx}:v]${chain.join(',')}[vx${i}]`)

    const { x, y } = overlayOrigin(layer, plan.width, plan.height)
    const next = `vtmp${i}`
    fc.push(`[${acc}][vx${i}]overlay=x=${x}:y=${y}:eof_action=pass:format=auto[${next}]`)
    acc = next
  })

  plan.overlays.forEach((overlay, i) => {
    const idx = plan.inputs.length + i
    const next = `otmp${i}`
    fc.push(
      `[${acc}][${idx}:v]overlay=0:0:enable='between(t,${round4(overlay.start)},${round4(overlay.end)})'` +
      `:eof_action=pass:format=auto[${next}]`,
    )
    acc = next
  })

  fc.push(`[${acc}]format=yuv420p[vout]`)

  const audible = plan.audio.filter(a => plan.inputs.find(n => n.id === a.inputId)?.hasAudio !== false)
  const audioLabels: string[] = []
  audible.forEach((entry, i) => {
    const idx = inputIndex.get(entry.inputId)
    const chain = [
      `[${idx}:a]atrim=start=${round4(entry.mediaStart)}:end=${round4(entry.mediaEnd)}`,
      'asetpts=PTS-STARTPTS',
      ...atempoChain(entry.speed),
      `volume=${round4(entry.volume)}`,
    ]
    const span = (entry.mediaEnd - entry.mediaStart) / entry.speed
    if (entry.fadein > 0) chain.push(`afade=t=in:st=0:d=${round4(entry.fadein)}`)
    if (entry.fadeout > 0) chain.push(`afade=t=out:st=${round4(Math.max(0, span - entry.fadeout))}:d=${round4(entry.fadeout)}`)
    chain.push(`adelay=${Math.round(entry.start * 1000)}:all=1[ax${i}]`)
    fc.push(chain.join(','))
    audioLabels.push(`[ax${i}]`)
  })

  let graph = fc.join(';\n')
  if (audioLabels.length) {
    graph += ';\n' +
      `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0[aout]`
  }

  const codecs = CODECS[plan.output.format]
  args.push('-filter_complex', graph)
  args.push('-map', '[vout]')
  if (audioLabels.length) args.push('-map', '[aout]')
  args.push('-t', String(round4(plan.duration)), '-r', String(plan.fps))
  args.push(...codecs.video)
  if (audioLabels.length) args.push(...codecs.audio, '-b:a', plan.output.audioBitrate)
  args.push('-b:v', plan.output.videoBitrate)
  if (plan.output.format !== 'webm') args.push('-movflags', '+faststart')
  args.push(outputPath)
  return args
}
