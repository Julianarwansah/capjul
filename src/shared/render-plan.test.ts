import { describe, expect, it } from 'vitest'
import {
  atempoChain, audioGraphFilters, buildRenderArgs, colorAdjustChain, compileProject,
  overlayOrigin, volumeExpression,
  type RenderAudio, type RenderLayer, type RenderOutput,
} from './render-plan'
import type { AudioClip, Clip, MediaFile, Project } from './project-schema'

const output: RenderOutput = { format: 'mp4', videoBitrate: '8M', audioBitrate: '192k' }

function media(over: Partial<MediaFile> = {}): MediaFile {
  return { id: 'm1', path: '/tmp/a.mp4', name: 'a.mp4', type: 'video', duration: 10, size: 1, ...over }
}

function clip(over: Partial<Clip> = {}): Clip {
  return {
    id: 'c1', mediaId: 'm1', trackId: 't0',
    startTime: 0, duration: 3, mediaStart: 0, mediaEnd: 3,
    speed: 1, volume: 1, muted: false, reversed: false, opacity: 1,
    x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
    brightness: 0, contrast: 0, saturation: 0,
    exposure: 0, highlights: 0, shadows: 0,
    temperature: 0, tint: 0, sharpness: 0,
    chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
    stabilize: false,
    effects: [], keyframes: [],
    ...over,
  }
}

function audioClip(over: Partial<AudioClip> = {}): AudioClip {
  return {
    id: 'a1', trackId: 't0', mediaId: 'm1', startTime: 1, duration: 4,
    mediaStart: 0, mediaEnd: 4, volume: 0.5, muted: false, fadein: 0, fadeout: 0,
    speed: 1, pitch: 0, keyframes: [],
    ...over,
  }
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p', name: 'P', createdAt: 0, duration: 6,
    width: 1280, height: 720, fps: 30, backgroundColor: '#101010',
    media: [media()],
    tracks: [
      { id: 't0', type: 'video', label: 'Main', muted: false, locked: false, height: 64 },
      { id: 't1', type: 'video', label: 'Overlay', muted: false, locked: false, height: 64 },
    ],
    clips: [], textClips: [], stickerClips: [], audioClips: [], transitions: [], captions: [],
    ...over,
  }
}

describe('compileProject', () => {
  it('dedupes inputs when several clips share one media file', () => {
    const plan = compileProject(project({ clips: [clip(), clip({ id: 'c2', startTime: 3 })] }), output)
    expect(plan.inputs).toHaveLength(1)
    expect(plan.layers.map(l => l.inputId)).toEqual(['in0', 'in0'])
  })

  it('derives z from track order and paints low z first', () => {
    const plan = compileProject(project({
      clips: [clip({ trackId: 't1' }), clip({ id: 'c2', trackId: 't0', startTime: 3 })],
    }), output)
    // sorted by z then start, so the main track paints before the overlay track
    expect(plan.layers.map(l => l.z)).toEqual([0, 1])
    expect(plan.layers.map(l => l.start)).toEqual([3, 0])
  })

  it('skips orphaned clips instead of crashing', () => {
    const plan = compileProject(project({ clips: [clip({ mediaId: 'gone' })] }), output)
    expect(plan.layers).toEqual([])
    expect(plan.inputs).toEqual([])
  })

  it('keeps muted and zero-volume clips out of the audio mix', () => {
    const plan = compileProject(project({
      clips: [clip({ muted: true }), clip({ id: 'c2', volume: 0, startTime: 3 })],
    }), output)
    expect(plan.audio).toEqual([])
  })

  it('carries audio clips with fades', () => {
    const ac: AudioClip = {
      id: 'a1', trackId: 't0', mediaId: 'm1', startTime: 1, duration: 4,
      mediaStart: 0, mediaEnd: 4, volume: 0.5, muted: false, fadein: 1, fadeout: 0.5,
      speed: 1, pitch: 0,
      keyframes: [],
    }
    const plan = compileProject(project({ audioClips: [ac] }), output)
    expect(plan.audio).toHaveLength(1)
    expect(plan.audio[0]).toMatchObject({ start: 1, volume: 0.5, fadein: 1, fadeout: 0.5 })
  })
})

describe('atempoChain', () => {
  it('passes speeds inside the native range through', () => {
    expect(atempoChain(1.5)).toEqual(['atempo=1.5'])
  })
  it('chains instances for speeds below 0.5', () => {
    // 0.5 * 0.5 * 0.8 = 0.2, each factor inside atempo's 0.5-100 range
    expect(atempoChain(0.2)).toEqual(['atempo=0.5', 'atempo=0.5', 'atempo=0.8'])
  })
})

describe('colorAdjustChain', () => {
  const layer = (over: Partial<RenderLayer> = {}): RenderLayer => ({
    inputId: 'in0', kind: 'video', z: 0, start: 0, end: 1, mediaStart: 0, mediaEnd: 1,
    speed: 1, opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1,
    brightness: 0, contrast: 0, saturation: 0,
    chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
    reversed: false,
    ...over,
  })

  it('is empty when every channel is neutral', () => {
    expect(colorAdjustChain(layer())).toEqual([])
  })

  it('maps brightness multiplicatively, like the preview CSS brightness()', () => {
    expect(colorAdjustChain(layer({ brightness: 20 })))
      .toEqual(['colorchannelmixer=rr=1.2:gg=1.2:bb=1.2'])
  })

  it('maps contrast and saturation onto eq, like the preview CSS', () => {
    expect(colorAdjustChain(layer({ contrast: -10, saturation: 50 })))
      .toEqual(['eq=contrast=0.9:saturation=1.5'])
  })

  it('reaches the filtergraph only when non-neutral', () => {
    const neutral = buildRenderArgs(compileProject(project({ clips: [clip()] }), output), '/o.mp4').join(' ')
    expect(neutral).not.toContain('eq=')
    expect(neutral).not.toContain('colorchannelmixer')

    const adjusted = buildRenderArgs(
      compileProject(project({ clips: [clip({ contrast: 30 })] }), output), '/o.mp4',
    ).join(' ')
    expect(adjusted).toContain('eq=contrast=1.3:saturation=1')
  })
})

describe('overlayOrigin', () => {
  it('matches the preview transform semantics', () => {
    // Same case the prototype rendered and verified by eye.
    const o = overlayOrigin({ x: 0.28, y: 0.28, scaleX: 0.3, scaleY: 0.3 } as never, 1280, 720)
    expect(o).toEqual({ x: 806, y: 454 })
  })
  it('is 0,0 for a full-frame clip', () => {
    const o = overlayOrigin({ x: 0, y: 0, scaleX: 1, scaleY: 1 } as never, 1280, 720)
    expect(o).toEqual({ x: 0, y: 0 })
  })
})

describe('buildRenderArgs', () => {
  const graphOf = (plan: ReturnType<typeof compileProject>) => {
    const args = buildRenderArgs(plan, '/tmp/out.mp4')
    return args[args.indexOf('-filter_complex') + 1]
  }

  it('lays a background of the full duration', () => {
    const graph = graphOf(compileProject(project(), output))
    expect(graph).toContain('color=c=#101010:s=1280x720:r=30:d=6[base]')
  })

  it('overlays every layer with eof_action=pass so gaps show the background', () => {
    const graph = graphOf(compileProject(project({ clips: [clip(), clip({ id: 'c2', startTime: 4 })] }), output))
    expect(graph.match(/eof_action=pass/g)).toHaveLength(2)
  })

  it('mixes audio with normalize=0 so extra tracks do not drop the level', () => {
    const graph = graphOf(compileProject(project({ clips: [clip()] }), output))
    expect(graph).toContain('normalize=0')
  })

  it('drops audio chains for inputs probed without an audio stream', () => {
    const plan = compileProject(project({ clips: [clip()] }), output)
    plan.inputs[0].hasAudio = false
    const args = buildRenderArgs(plan, '/tmp/out.mp4')
    expect(args.join(' ')).not.toContain('[aout]')
    expect(args).not.toContain('-c:a')
  })

  it('emits a video-only encode when nothing is audible', () => {
    const plan = compileProject(project({ clips: [clip({ muted: true })] }), output)
    const args = buildRenderArgs(plan, '/tmp/out.mp4')
    expect(args).toContain('-map')
    expect(args.join(' ')).not.toContain('-map [aout]')
  })

  it('loops still images at input level', () => {
    const p = project({
      media: [media({ type: 'image', path: '/tmp/a.png' })],
      clips: [clip()],
    })
    const args = buildRenderArgs(compileProject(p, output), '/tmp/out.mp4')
    const i = args.indexOf('/tmp/a.png')
    expect(args.slice(i - 3, i)).toEqual(['-loop', '1', '-i'])
  })

  it('honours the container format instead of always encoding mp4', () => {
    const withClip = project({ clips: [clip()] })
    const webm = buildRenderArgs(compileProject(withClip, { ...output, format: 'webm' }), '/tmp/out.webm')
    expect(webm).toContain('libvpx-vp9')
    expect(webm).toContain('libopus')
    expect(webm).not.toContain('+faststart')

    const mp4 = buildRenderArgs(compileProject(withClip, output), '/tmp/out.mp4')
    expect(mp4).toContain('libx264')
    expect(mp4).toContain('aac')
    expect(mp4).toContain('+faststart')
  })

  it('chains atempo for slow clips', () => {
    const graph = graphOf(compileProject(project({ clips: [clip({ speed: 0.2 })] }), output))
    expect(graph).toContain('atempo=0.5,atempo=0.5,atempo=0.8')
  })
})

describe('volumeExpression', () => {
  const kf = (time: number, value: number) => ({ id: `k${time}`, time, property: 'volume', value })

  it('is the plain volume when nothing is keyframed', () => {
    expect(volumeExpression([], 0.8, 0)).toBe('0.8')
  })

  it('holds the first value before the first keyframe and the last after the last', () => {
    const expr = volumeExpression([kf(1, 0.2), kf(2, 0.6)], 1, 0)
    expect(expr.startsWith('if(lt(t,1),0.2,')).toBe(true)
    expect(expr.endsWith(',0.6))')).toBe(true)
  })

  it('interpolates linearly between keyframes, shifted into stream time by start', () => {
    // stream time = timeline - start, so a ramp over [2,4] runs over t in [0,2]
    expect(volumeExpression([kf(2, 0), kf(4, 1)], 1, 2))
      .toBe('if(lt(t,0),0,if(lt(t,2),0+(t-0)*0.5,1))')
  })

  it('ignores keyframes for other properties', () => {
    expect(volumeExpression([{ id: 'x', time: 1, property: 'x', value: 5 }], 0.4, 0)).toBe('0.4')
  })
})

describe('audioGraphFilters volume', () => {
  const inputs = [{ id: 'in0', path: '/tmp/a.mp3' }]
  const entry = (over: Partial<RenderAudio> = {}): RenderAudio => ({
    inputId: 'in0', start: 1, mediaStart: 0, mediaEnd: 2, speed: 1,
    volume: 0.5, fadein: 0, fadeout: 0, keyframes: [],
    ...over,
  })

  it('uses a static volume when nothing is keyframed', () => {
    const [chain] = audioGraphFilters(inputs, [entry()])
    expect(chain).toContain('volume=0.5,')
    expect(chain).not.toContain('eval=frame')
  })

  it('switches to a per-frame expression when volume is keyframed', () => {
    const [chain] = audioGraphFilters(inputs, [entry({
      keyframes: [
        { id: 'a', time: 1, property: 'volume', value: 0 },
        { id: 'b', time: 3, property: 'volume', value: 1 },
      ],
    })])
    expect(chain).toContain("volume=volume='if(lt(t,0),0,if(lt(t,2),0+(t-0)*0.5,1))':eval=frame")
  })

  it('carries audio clip volume keyframes into the plan', () => {
    const kfs = [{ id: 'v', time: 1, property: 'volume', value: 0.25 }]
    const plan = compileProject(project({ audioClips: [audioClip({ keyframes: kfs })] }), output)
    expect(plan.audio[0].keyframes).toEqual(kfs)
  })
})
