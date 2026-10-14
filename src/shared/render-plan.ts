import type { Keyframe, MediaFile, Project } from './project-schema'
import { buildFfmpegColorChain, colorAdjustFactors } from './color-adjust'
import { easeFfmpeg } from './keyframe-easing'

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
  brightness: number
  contrast: number
  saturation: number
  chromaEnabled: boolean
  chromaColor: string
  chromaTolerance: number
  reversed: boolean
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
  keyframes: Keyframe[]
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

type InputAllocator = (media: MediaFile) => string

function compileLayers(project: Project, inputFor: InputAllocator): RenderLayer[] {
  const trackZ = new Map(project.tracks.map((t, i) => [t.id, i]))
  const layers: RenderLayer[] = []
  for (const clip of project.clips) {
    if (clip.duration <= 0) continue
    const media = project.media.find(m => m.id === clip.mediaId)
    if (!media) continue // orphaned clip: skip rather than crash the export
    layers.push({
      inputId: inputFor(media),
      kind: media.type === 'image' ? 'image' : 'video',
      z: trackZ.get(clip.trackId) ?? 0,
      start: clip.startTime,
      end: clip.startTime + clip.duration,
      mediaStart: clip.mediaStart,
      mediaEnd: clip.mediaEnd,
      speed: clip.speed || 1,
      opacity: clip.opacity,
      x: clip.x,
      y: clip.y,
      scaleX: clip.scaleX,
      scaleY: clip.scaleY,
      brightness: clip.brightness,
      contrast: clip.contrast,
      saturation: clip.saturation,
      chromaEnabled: clip.chromaEnabled,
      chromaColor: clip.chromaColor,
      chromaTolerance: clip.chromaTolerance,
      reversed: clip.reversed,
    })
  }
  return layers.sort((a, b) => a.z - b.z || a.start - b.start)
}

function compileAudio(project: Project, inputFor: InputAllocator): RenderAudio[] {
  const audio: RenderAudio[] = []
  for (const clip of project.clips) {
    const media = project.media.find(m => m.id === clip.mediaId)
    if (!media || media.type !== 'video') continue
    if (clip.muted || clip.volume <= 0 || clip.duration <= 0) continue
    audio.push({
      inputId: inputFor(media),
      start: clip.startTime,
      mediaStart: clip.mediaStart,
      mediaEnd: clip.mediaEnd,
      speed: clip.speed || 1,
      volume: clip.volume,
      fadein: 0,
      fadeout: 0,
      keyframes: [],
    })
  }
  for (const clip of project.audioClips) {
    const media = project.media.find(m => m.id === clip.mediaId)
    if (!media || clip.duration <= 0) continue
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
      keyframes: clip.keyframes ?? [],
    })
  }
  return audio
}

/** Pure Project -> RenderPlan compilation. No I/O, fully unit-testable. */
export function compileProject(project: Project, output: RenderOutput): RenderPlan {
  const inputs: RenderInput[] = []
  const inputIdOf = new Map<string, string>()
  const inputFor: InputAllocator = (media) => {
    const existing = inputIdOf.get(media.id)
    if (existing) return existing
    const id = `in${inputs.length}`
    inputs.push({ id, path: media.path })
    inputIdOf.set(media.id, id)
    return id
  }

  return {
    width: project.width,
    height: project.height,
    fps: project.fps,
    duration: project.duration,
    background: project.backgroundColor,
    inputs,
    layers: compileLayers(project, inputFor),
    overlays: [],
    audio: compileAudio(project, inputFor),
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

/**
 * Mirror of the preview's CSS filter string: brightness(1+b/100),
 * contrast(1+c/100), saturate(1+s/100). CSS brightness is multiplicative while
 * ffmpeg's eq brightness is additive, so brightness goes through
 * colorchannelmixer to match; eq's contrast and saturation use the same
 * mid-grey-relative model as CSS.
 */
export function colorAdjustChain(layer: RenderLayer): string[] {
  return buildFfmpegColorChain(colorAdjustFactors(layer))
}

function inputArgs(plan: RenderPlan): string[] {
  const args = ['-y', '-hide_banner']
  for (const input of plan.inputs) {
    const layer = plan.layers.find(l => l.inputId === input.id)
    // Still images are looped at input level so they behave like a stream.
    if (layer?.kind === 'image') args.push('-loop', '1')
    args.push('-i', input.path)
  }
  for (const overlay of plan.overlays) args.push('-loop', '1', '-i', overlay.png)
  return args
}

function layerChain(plan: RenderPlan, layer: RenderLayer): string {
  const bw = Math.round(plan.width * layer.scaleX)
  const bh = Math.round(plan.height * layer.scaleY)
  const chain = layer.kind === 'image'
    ? [`trim=start=0:end=${round4(layer.end - layer.start)}`, 'setpts=PTS-STARTPTS']
    : layer.reversed
    ? [
        `trim=start=${round4(layer.mediaStart)}:end=${round4(layer.mediaEnd)}`,
        'reverse',
        `setpts=(PTS-STARTPTS)/${round4(layer.speed)}`,
      ]
    : [
        `trim=start=${round4(layer.mediaStart)}:end=${round4(layer.mediaEnd)}`,
        `setpts=(PTS-STARTPTS)/${round4(layer.speed)}`,
      ]
  chain.push(
    `scale=${bw}:${bh}:force_original_aspect_ratio=decrease`,
    `pad=${bw}:${bh}:(ow-iw)/2:(oh-ih)/2`,
    'setsar=1',
    ...colorAdjustChain(layer),
    `fps=${plan.fps}`,
  )
  if (layer.chromaEnabled) {
    // Convert hex color to 0xRRGGBB format for FFmpeg
    const hex = layer.chromaColor.replace('#', '')
    chain.push(`chromakey=0x${hex}:${round4(layer.chromaTolerance)}:0.1:format=rgba`)
  }
  if (layer.opacity < 1) chain.push('format=rgba', `colorchannelmixer=aa=${round4(layer.opacity)}`)
  chain.push(`setpts=PTS+${round4(layer.start)}/TB`)
  return chain.join(',')
}

function videoGraph(plan: RenderPlan): string[] {
  const inputIndex = new Map(plan.inputs.map((n, i) => [n.id, i]))
  const filters = [
    `color=c=${colorLiteral(plan.background)}:s=${plan.width}x${plan.height}` +
    `:r=${plan.fps}:d=${round4(plan.duration)}[base]`,
  ]
  let acc = 'base'
  plan.layers.forEach((layer, i) => {
    filters.push(`[${inputIndex.get(layer.inputId)}:v]${layerChain(plan, layer)}[vx${i}]`)
    const { x, y } = overlayOrigin(layer, plan.width, plan.height)
    const next = `vtmp${i}`
    filters.push(`[${acc}][vx${i}]overlay=x=${x}:y=${y}:eof_action=pass:format=auto[${next}]`)
    acc = next
  })
  plan.overlays.forEach((overlay, i) => {
    const idx = plan.inputs.length + i
    const next = `otmp${i}`
    filters.push(
      `[${acc}][${idx}:v]overlay=0:0:enable='between(t,${round4(overlay.start)},${round4(overlay.end)})'` +
      `:eof_action=pass:format=auto[${next}]`,
    )
    acc = next
  })
  filters.push(`[${acc}]format=yuv420p[vout]`)
  return filters
}

/** Clips from audio-less files must stay out of the mix or the graph breaks. */
export function audibleAudio(inputs: RenderInput[], audio: RenderAudio[]): RenderAudio[] {
  return audio.filter(a => inputs.find(n => n.id === a.inputId)?.hasAudio !== false)
}

/**
 * Volume over stream time, matching the preview's interpolate() at the same
 * timeline instants. Stream time is timeline time minus the entry's start:
 * adelay shifts the stream onto the timeline one-to-one, whatever the speed.
 *
 * A linear segment stays in slope form, which is shorter and is byte-identical
 * to what every pre-v4 project produced. An eased segment goes through
 * easeFfmpeg, the same curve table the preview uses.
 */
export function volumeExpression(keyframes: Keyframe[], fallback: number, start: number): string {
  const pts = keyframes
    .filter(k => k.property === 'volume')
    .sort((a, b) => a.time - b.time)
    .map(k => ({ t: round4(k.time - start), v: round4(k.value), easing: k.easing }))
  if (pts.length === 0) return String(round4(fallback))
  let expr = String(pts[pts.length - 1].v)
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i], b = pts[i + 1]
    let seg: string
    if (b.t === a.t) {
      seg = String(b.v)
    } else if (a.easing === 'linear') {
      seg = `${a.v}+(t-${a.t})*${round4((b.v - a.v) / (b.t - a.t))}`
    } else {
      const u = `(t-${a.t})/${round4(b.t - a.t)}`
      seg = `${a.v}+(${round4(b.v - a.v)})*${easeFfmpeg(a.easing, u)}`
    }
    expr = `if(lt(t,${b.t}),${seg},${expr})`
  }
  return `if(lt(t,${pts[0].t}),${pts[0].v},${expr})`
}

function volumeFilter(entry: RenderAudio): string {
  if (!entry.keyframes.some(k => k.property === 'volume')) return `volume=${round4(entry.volume)}`
  // The expression's commas must stay inside quotes, or ffmpeg reads them as
  // filter-chain separators.
  return `volume=volume='${volumeExpression(entry.keyframes, entry.volume, entry.start)}':eval=frame`
}

/** Audio filter chains. indexOffset shifts input indices when the video comes
 *  from another input (the composited rawvideo pipe is input 0). */
export function audioGraphFilters(
  inputs: RenderInput[],
  entries: RenderAudio[],
  indexOffset = 0,
): string[] {
  const inputIndex = new Map(inputs.map((n, i) => [n.id, i + indexOffset]))
  return entries.map((entry, i) => {
    const span = (entry.mediaEnd - entry.mediaStart) / entry.speed
    const chain = [
      `[${inputIndex.get(entry.inputId)}:a]atrim=start=${round4(entry.mediaStart)}:end=${round4(entry.mediaEnd)}`,
      'asetpts=PTS-STARTPTS',
      ...atempoChain(entry.speed),
      volumeFilter(entry),
    ]
    if (entry.fadein > 0) chain.push(`afade=t=in:st=0:d=${round4(entry.fadein)}`)
    if (entry.fadeout > 0) {
      chain.push(`afade=t=out:st=${round4(Math.max(0, span - entry.fadeout))}:d=${round4(entry.fadeout)}`)
    }
    chain.push(`adelay=${Math.round(entry.start * 1000)}:all=1[ax${i}]`)
    return chain.join(',')
  })
}

function outputArgs(plan: RenderPlan, audioCount: number, outputPath: string): string[] {
  const codecs = CODECS[plan.output.format]
  const args = ['-map', '[vout]']
  if (audioCount) args.push('-map', '[aout]')
  args.push('-t', String(round4(plan.duration)), '-r', String(plan.fps), ...codecs.video)
  if (audioCount) args.push(...codecs.audio, '-b:a', plan.output.audioBitrate)
  args.push('-b:v', plan.output.videoBitrate)
  if (plan.output.format !== 'webm') args.push('-movflags', '+faststart')
  args.push(outputPath)
  return args
}

export function audioMixFilter(count: number): string {
  const labels = Array.from({ length: count }, (_, i) => `[ax${i}]`).join('')
  return `${labels}amix=inputs=${count}:duration=longest:normalize=0[aout]`
}

export function buildRenderArgs(plan: RenderPlan, outputPath: string): string[] {
  const entries = audibleAudio(plan.inputs, plan.audio)
  const mix = entries.length ? [audioMixFilter(entries.length)] : []
  const graph = [
    ...videoGraph(plan),
    ...audioGraphFilters(plan.inputs, entries),
    ...mix,
  ].join(';\n')
  return [...inputArgs(plan), '-filter_complex', graph, ...outputArgs(plan, entries.length, outputPath)]
}

/** Arguments for the Phase 2 path: video arrives as raw RGBA on stdin (input
 *  0), media files follow and contribute audio only. */
export function buildCompositedArgs(
  inputs: RenderInput[],
  audio: RenderAudio[],
  scene: { width: number; height: number; fps: number; duration: number },
  output: RenderOutput,
  outputPath: string,
): string[] {
  const args = ['-y', '-hide_banner']
  args.push(
    '-f', 'rawvideo', '-pix_fmt', 'rgba',
    '-s', `${scene.width}x${scene.height}`,
    '-r', String(scene.fps),
    '-i', 'pipe:0',
  )
  for (const input of inputs) args.push('-i', input.path)

  const entries = audibleAudio(inputs, audio)
  const filters = audioGraphFilters(inputs, entries, 1)
  const mix = entries.length ? [audioMixFilter(entries.length)] : []
  if (filters.length) args.push('-filter_complex', [...filters, ...mix].join(';\n'))

  const codecs = CODECS[output.format]
  args.push('-map', '0:v')
  if (entries.length) args.push('-map', '[aout]')
  args.push('-t', String(round4(scene.duration)), '-r', String(scene.fps), ...codecs.video)
  if (entries.length) args.push(...codecs.audio, '-b:a', output.audioBitrate)
  args.push('-b:v', output.videoBitrate)
  if (output.format !== 'webm') args.push('-movflags', '+faststart')
  args.push(outputPath)
  return args
}
