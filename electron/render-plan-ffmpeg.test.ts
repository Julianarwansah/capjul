import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildRenderArgs, compileProject } from '../src/shared/render-plan'
import { windowProject } from '../src/shared/project-window'
import type { Project } from '../src/shared/project-schema'

// A filtergraph is text, and text can be wrong in ways no string assertion sees:
// a filter name this ffmpeg does not have, an option it no longer accepts, a
// label consumed twice. The app already requires ffmpeg on PATH (README), so
// this runs the very binary the export will use, over the very args this module
// emits. Skipped when ffmpeg is absent, which is the only environment where the
// app could not export anyway.
const haveFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0

describe.runIf(haveFfmpeg)('the emitted render args run in real ffmpeg', () => {
  let dir = ''
  let input = ''
  const output = () => join(dir, 'out.mp4')

  function project(): Project {
    return {
      id: 'p', name: 'P', createdAt: 0, duration: 1,
      width: 320, height: 240, fps: 30, backgroundColor: '#000000',
      media: [{ id: 'm1', path: input, name: 'in0', type: 'video', duration: 1, size: 1 }],
      tracks: [{ id: 't0', type: 'video', label: 'Main', muted: false, locked: false, height: 64 }],
      clips: [{
        id: 'c1', mediaId: 'm1', trackId: 't0',
        startTime: 0, duration: 1, mediaStart: 0, mediaEnd: 1,
        speed: 1, volume: 0.8, muted: false, reversed: false, opacity: 1,
        x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
        brightness: 10, contrast: 0, saturation: 0,
        exposure: 0, highlights: 0, shadows: 0,
        temperature: 0, tint: 0, sharpness: 0,
        chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
        stabilize: false,
        effects: [], keyframes: [],
      }],
      textClips: [], stickerClips: [],
      // An audio clip on the same input, so the graph exercises atrim, volume,
      // afade, amix and - when enabled - loudnorm, not just the video chain.
      audioClips: [{
        id: 'a1', mediaId: 'm1', trackId: 't0',
        startTime: 0, duration: 1, mediaStart: 0, mediaEnd: 1,
        volume: 1, muted: false, fadein: 0.2, fadeout: 0.2, speed: 1, pitch: 0, keyframes: [],
      }],
      transitions: [], captions: [], markers: [],
    }
  }

  function encode(normalizeLoudness: boolean) {
    const plan = compileProject(project(), {
      format: 'mp4', videoBitrate: '1M', audioBitrate: '128k', normalizeLoudness,
    })
    return spawnSync('ffmpeg', buildRenderArgs(plan, output()), { stdio: 'pipe' })
  }

  it('generates a one second fixture with picture and tone', () => {
    dir = mkdtempSync(join(tmpdir(), 'capjul-ff-'))
    input = join(dir, 'in0.mp4')
    const made = spawnSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30:duration=1',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', input,
    ], { stdio: 'pipe' })
    expect(made.status, made.stderr?.toString()).toBe(0)
    expect(statSync(input).size).toBeGreaterThan(0)
  }, 30000)

  it('encodes the plain graph', () => {
    const r = encode(false)
    expect(r.status, r.stderr?.toString()).toBe(0)
    expect(statSync(output()).size).toBeGreaterThan(0)
  }, 30000)

  it('encodes the same graph with loudnorm chained', () => {
    const r = encode(true)
    expect(r.status, r.stderr?.toString()).toBe(0)
    expect(statSync(output()).size).toBeGreaterThan(0)
  }, 30000)

  it('encodes a windowed plan, so a range export is a valid graph too', () => {
    // The window starts and ends mid-clip, so the plan carries trimmed media
    // windows and re-based starts - the case where a hand-built graph would most
    // likely reference a timestamp past the end of its trim.
    const plan = compileProject(windowProject(project(), 0.3, 0.8), {
      format: 'mp4', videoBitrate: '1M', audioBitrate: '128k', normalizeLoudness: false,
    })
    expect(plan.duration).toBeCloseTo(0.5, 9)
    const r = spawnSync('ffmpeg', buildRenderArgs(plan, output()), { stdio: 'pipe' })
    expect(r.status, r.stderr?.toString()).toBe(0)
    expect(statSync(output()).size).toBeGreaterThan(0)
  }, 30000)

  it('removes its scratch directory', () => {
    rmSync(dir, { recursive: true, force: true })
    expect(statSync(dir, { throwIfNoEntry: false })).toBeUndefined()
  }, 30000)
})
