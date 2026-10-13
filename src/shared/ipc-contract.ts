import type { FfprobeResult } from './ffprobe'
import type { Project } from './project-schema'
import type { RenderPlan } from './render-plan'

export type { RenderPlan } from './render-plan'

// This module must stay free of runtime dependencies: the preload imports it,
// and anything imported here at value level is bundled into the preload.

// The single source of truth for the renderer <-> main boundary. Main, preload
// and the renderer all derive their types from this module, so a channel added
// on one side and forgotten on another is a compile error.

export const IPC = {
  projectSave: 'project:save',
  projectOpen: 'project:open',
  projectAutosave: 'project:autosave',
  projectRecovery: 'project:recovery',
  projectRestore: 'project:restore',
  mediaProbe: 'media:probe',
  mediaExport: 'media:export',
  exportProgress: 'export:progress',
  dialogOpenMedia: 'dialog:openMedia',
} as const

export type ErrorCode =
  | 'E_CANCELLED'
  | 'E_NOT_FOUND'
  | 'E_PERMISSION'
  | 'E_DISK_FULL'
  | 'E_IO'
  | 'E_CORRUPT'
  | 'E_VALIDATION'
  | 'E_FUTURE_VERSION'
  | 'E_UNSUPPORTED_VERSION'
  | 'E_TOO_LARGE'
  | 'E_FFMPEG_MISSING'
  | 'E_EXPORT_FAILED'

// Errors cross IPC as values: thrown exceptions lose their shape in transit.
export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: ErrorCode; message: string } }

export const ok = <T>(value: T): IpcResult<T> => ({ ok: true, value })
export const fail = (code: ErrorCode, message: string): IpcResult<never> =>
  ({ ok: false, error: { code, message } })

export interface RecoveryInfo {
  at: number
  name: string
}

export interface ExportPayload {
  plan: RenderPlan
  /** Base64 PNGs, index-aligned with plan.overlays. Main writes them to temp files. */
  overlayImages: string[]
}

export interface ElectronApi {
  getPathForFile: (file: File) => string
  openMedia: () => Promise<IpcResult<string[]>>
  saveProject: (project: Project, path?: string) => Promise<IpcResult<string>>
  openProject: () => Promise<IpcResult<Project>>
  autosaveProject: (project: Project) => Promise<IpcResult<{ at: number }>>
  recoveryInfo: () => Promise<IpcResult<RecoveryInfo | null>>
  restoreAutosave: () => Promise<IpcResult<Project>>
  probeMedia: (path: string) => Promise<IpcResult<FfprobeResult>>
  exportVideo: (payload: ExportPayload) => Promise<IpcResult<string>>
  onExportProgress: (cb: (percent: number) => void) => () => void
}
