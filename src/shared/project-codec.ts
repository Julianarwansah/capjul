import {
  CURRENT_SCHEMA_VERSION,
  ProjectFileSchema,
  ProjectSchema,
  type Project,
} from './project-schema'
import { computeDuration } from './project-duration'
import { isKnownSticker } from './sticker-assets'
import type { ErrorCode } from './ipc-contract'

const MAX_PROJECT_BYTES = 50 * 1024 * 1024

export type ParseOutcome =
  | { ok: true; project: Project; migratedFrom: number | null }
  | { ok: false; code: ErrorCode; message: string }

type Raw = Record<string, unknown>

const bad = (code: ErrorCode, message: string): ParseOutcome => ({ ok: false, code, message })

// Version steps, applied oldest first. A missing step for a version below the
// current one means the file is too old to migrate.
const migrations: Record<number, (raw: Raw) => Raw> = {
  // v1 was a bare Project carrying an unmaintained updatedAt field.
  1: ({ updatedAt: _dropped, ...rest }) => rest,
  // v2 stored stickers as emoji strings, which no canvas can rasterize
  // (design doc F4). v3 stickers reference bundled vector assets; sources that
  // are not known assets cannot render or export, so they are dropped on load.
  2: raw => ({
    ...raw,
    stickerClips: Array.isArray(raw.stickerClips)
      ? (raw.stickerClips as Raw[]).filter(s => typeof s?.src === 'string' && isKnownSticker(s.src))
      : [],
  }),
}

/**
 * Parses, migrates and validates project file bytes. Runs in the main process:
 * untrusted file content must never cross IPC as a raw string.
 */
export function parseProjectFile(text: string): ParseOutcome {
  if (text.length > MAX_PROJECT_BYTES) {
    return bad('E_TOO_LARGE', `project file is larger than ${Math.round(MAX_PROJECT_BYTES / 1e6)} MB`)
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return bad('E_CORRUPT', err instanceof Error ? err.message : 'file is not valid JSON')
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return bad('E_CORRUPT', 'project file is not a JSON object')
  }
  const obj = raw as Raw

  const declared = obj.schemaVersion
  const from = declared === undefined
    ? 1
    : typeof declared === 'number' ? declared : Number.NaN
  if (Number.isNaN(from)) return bad('E_CORRUPT', 'schemaVersion is not a number')
  if (from > CURRENT_SCHEMA_VERSION) {
    return bad('E_FUTURE_VERSION',
      `file is schema v${from}; this build reads up to v${CURRENT_SCHEMA_VERSION}. Open it with a newer CapJul.`)
  }
  if (from < 1) return bad('E_UNSUPPORTED_VERSION', `schema v${from} is too old to migrate`)

  let source: unknown = obj
  // Every version from v2 up is an envelope; only v1 was a bare project.
  if (declared !== undefined) {
    if (obj.app !== 'capjul') return bad('E_CORRUPT', 'envelope app field is not "capjul"')
    source = obj.project
    if (typeof source !== 'object' || source === null) return bad('E_CORRUPT', 'envelope has no project')
  }

  let current = source as Raw
  for (let v = from; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = migrations[v]
    if (!step) return bad('E_UNSUPPORTED_VERSION', `no migration path from schema v${v}`)
    current = step(current)
  }

  const parsed = ProjectSchema.safeParse(current)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue.path.length ? issue.path.join('.') : '(root)'
    return bad('E_CORRUPT', `invalid project at "${where}": ${issue.message}`)
  }

  // duration is derived data; recompute so old or hand-edited files self-heal.
  const project: Project = { ...parsed.data, duration: computeDuration(parsed.data) }
  return { ok: true, project, migratedFrom: from === CURRENT_SCHEMA_VERSION ? null : from }
}

export function serializeProjectFile(project: Project, appVersion: string): string {
  const file = ProjectFileSchema.parse({
    app: 'capjul',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAt: Date.now(),
    appVersion,
    project,
  })
  return JSON.stringify(file)
}
