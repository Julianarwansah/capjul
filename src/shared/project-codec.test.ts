import { describe, expect, it } from 'vitest'
import { parseProjectFile, serializeProjectFile } from './project-codec'
import { CURRENT_SCHEMA_VERSION } from './project-schema'
import type { Project } from './project-schema'

function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Test',
    createdAt: 1000,
    duration: 0,
    width: 1920,
    height: 1080,
    fps: 30,
    backgroundColor: '#000000',
    media: [],
    tracks: [{ id: 't1', type: 'video', label: 'Main', muted: false, locked: false, height: 64 }],
    clips: [],
    textClips: [],
    stickerClips: [],
    audioClips: [],
    transitions: [],
    captions: [],
    ...over,
  }
}

const clip = {
  id: 'c1', mediaId: 'm1', trackId: 't1',
  startTime: 2, duration: 3, mediaStart: 0, mediaEnd: 3,
  speed: 1, volume: 1, muted: false, reversed: false, opacity: 1,
  x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
  brightness: 0, contrast: 0, saturation: 0,
  exposure: 0, highlights: 0, shadows: 0,
  temperature: 0, tint: 0, sharpness: 0,
  chromaEnabled: false, chromaColor: '#00ff00', chromaTolerance: 0.3,
  stabilize: false,
  effects: [], keyframes: [],
}

describe('serialize', () => {
  it('writes a v2 envelope', () => {
    const text = serializeProjectFile(makeProject(), '1.2.3')
    const envelope = JSON.parse(text)
    expect(envelope.app).toBe('capjul')
    expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(envelope.appVersion).toBe('1.2.3')
    expect(typeof envelope.savedAt).toBe('number')
    expect(envelope.project.name).toBe('Test')
  })
})

describe('parse: round trip', () => {
  it('returns the same project', () => {
    // duration is derived, so the source of truth already carries it
    const original = makeProject({ clips: [clip], duration: 5 })
    const out = parseProjectFile(serializeProjectFile(original, '0.0.1'))
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.project).toEqual(original)
      expect(out.migratedFrom).toBe(null)
    }
  })
})

describe('parse: v1 migration', () => {
  it('reads a bare project, drops updatedAt and recomputes duration', () => {
    const v1 = { ...makeProject({ clips: [clip] }), updatedAt: 999, duration: 60 }
    const out = parseProjectFile(JSON.stringify(v1))
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.migratedFrom).toBe(1)
      expect(out.project.duration).toBe(5)
      expect('updatedAt' in out.project).toBe(false)
    }
  })
})

describe('parse: rejection', () => {
  it('rejects invalid JSON with E_CORRUPT', () => {
    const out = parseProjectFile('{not json')
    expect(out).toMatchObject({ ok: false, code: 'E_CORRUPT' })
  })

  it('rejects non-object JSON', () => {
    expect(parseProjectFile('[1,2,3]')).toMatchObject({ ok: false, code: 'E_CORRUPT' })
    expect(parseProjectFile('42')).toMatchObject({ ok: false, code: 'E_CORRUPT' })
  })

  it('rejects a file from a newer version without guessing', () => {
    const out = parseProjectFile(JSON.stringify({ app: 'capjul', schemaVersion: 99, project: {} }))
    expect(out).toMatchObject({ ok: false, code: 'E_FUTURE_VERSION' })
  })

  it('rejects versions below the migration window', () => {
    const out = parseProjectFile(JSON.stringify({ schemaVersion: 0 }))
    expect(out).toMatchObject({ ok: false, code: 'E_UNSUPPORTED_VERSION' })
  })

  it('rejects an envelope that is not from capjul', () => {
    const out = parseProjectFile(JSON.stringify({ app: 'other', schemaVersion: 2, project: {} }))
    expect(out).toMatchObject({ ok: false, code: 'E_CORRUPT' })
  })

  it('reports the failing path for a wrong-shaped project', () => {
    const broken = makeProject()
    // clips must be an array
    const out = parseProjectFile(JSON.stringify({ ...broken, clips: 'nope' }))
    expect(out).toMatchObject({ ok: false, code: 'E_CORRUPT' })
    if (!out.ok) expect(out.message).toContain('clips')
  })

  it('rejects a missing required field', () => {
    const { fps, ...rest } = makeProject()
    void fps
    const out = parseProjectFile(JSON.stringify(rest))
    expect(out).toMatchObject({ ok: false, code: 'E_CORRUPT' })
  })

  it('refuses oversized files before parsing', () => {
    const out = parseProjectFile('0'.repeat(51 * 1024 * 1024))
    expect(out).toMatchObject({ ok: false, code: 'E_TOO_LARGE' })
  })
})

describe('parse: v2 -> v3 sticker migration', () => {
  it('drops emoji sticker sources and keeps bundled asset ids', () => {
    const sticker = (id: string, src: string) => ({
      id, trackId: 't1', startTime: 0, duration: 3, src,
      x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1,
    })
    const v2 = {
      app: 'capjul', schemaVersion: 2, savedAt: 1, appVersion: '0.0.0',
      project: {
        ...makeProject(),
        stickerClips: [sticker('s1', '⭐'), sticker('s2', 'star')],
      },
    }
    const out = parseProjectFile(JSON.stringify(v2))
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.migratedFrom).toBe(2)
      expect(out.project.stickerClips.map(s => s.id)).toEqual(['s2'])
    }
  })
})

describe('parse: v3 -> v4 keyframe easing', () => {
  it('gives keyframes written before easing existed the linear default', () => {
    const v3 = {
      app: 'capjul', schemaVersion: 3, savedAt: 1, appVersion: '0.0.0',
      project: {
        ...makeProject(),
        clips: [{
          ...clip,
          keyframes: [
            { id: 'k1', time: 2, property: 'x', value: 0 },
            { id: 'k2', time: 5, property: 'x', value: 1 },
          ],
        }],
      },
    }
    const out = parseProjectFile(JSON.stringify(v3))
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.migratedFrom).toBe(3)
      // 'linear' is exactly the interpolation a v3 file was authored against, so
      // the animation is unchanged rather than merely parseable.
      expect(out.project.clips[0].keyframes.map(k => k.easing)).toEqual(['linear', 'linear'])
    }
  })

  it('preserves an easing value a current-version file carries', () => {
    const current = {
      app: 'capjul', schemaVersion: CURRENT_SCHEMA_VERSION, savedAt: 1, appVersion: '0.0.0',
      project: {
        ...makeProject(),
        clips: [{
          ...clip,
          keyframes: [{ id: 'k1', time: 2, property: 'x', value: 0, easing: 'ease-in-out' }],
        }],
      },
    }
    const out = parseProjectFile(JSON.stringify(current))
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.migratedFrom).toBe(null)
      expect(out.project.clips[0].keyframes[0].easing).toBe('ease-in-out')
    }
  })

  it('rejects an easing name it does not know rather than falling back', () => {
    const bad = {
      app: 'capjul', schemaVersion: CURRENT_SCHEMA_VERSION, savedAt: 1, appVersion: '0.0.0',
      project: {
        ...makeProject(),
        clips: [{ ...clip, keyframes: [{ id: 'k1', time: 2, property: 'x', value: 0, easing: 'bounce' }] }],
      },
    }
    expect(parseProjectFile(JSON.stringify(bad)).ok).toBe(false)
  })
})

describe('parse: hostile keys', () => {
  it('neutralises __proto__ payloads', () => {
    // Computed keys create own properties; a literal __proto__ key would set
    // the prototype instead and test nothing.
    const text = JSON.stringify({
      ...makeProject(),
      ['__proto__']: { polluted: true },
      clips: [{ ...clip, ['__proto__']: { polluted: true } }],
    })
    const out = parseProjectFile(text)
    expect(out.ok).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    if (out.ok) {
      expect(Object.prototype.hasOwnProperty.call(out.project, '__proto__')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(out.project.clips[0], '__proto__')).toBe(false)
    }
  })
})
