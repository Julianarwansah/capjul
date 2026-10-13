import fs from 'node:fs/promises'
import { app } from 'electron'
import { ProjectSchema, type Project } from '../src/shared/project-schema'
import { parseProjectFile, serializeProjectFile } from '../src/shared/project-codec'
import { fail, ok, type ErrorCode, type IpcResult } from '../src/shared/ipc-contract'

let lastSavedPath: string | null = null

export function getLastSavedPath(): string | null {
  return lastSavedPath
}

export function mapFsError(err: unknown): { code: ErrorCode; message: string } {
  const e = err as NodeJS.ErrnoException
  switch (e?.code) {
    case 'ENOENT':
      return { code: 'E_NOT_FOUND', message: `file not found: ${e.path ?? 'unknown path'}` }
    case 'EACCES':
    case 'EPERM':
      return { code: 'E_PERMISSION', message: `permission denied: ${e.path ?? 'unknown path'}` }
    case 'ENOSPC':
      return { code: 'E_DISK_FULL', message: 'the disk is full; the project was kept in memory' }
    default:
      return { code: 'E_IO', message: e?.message ?? String(err) }
  }
}

/**
 * Write to a temp file in the target's own directory, fsync, then rename.
 * Same-directory rename is atomic on POSIX and replaces on Windows (libuv
 * uses MOVEFILE_REPLACE_EXISTING), so a failed or interrupted save can never
 * leave a truncated document at the target path.
 */
export async function atomicWrite(target: string, data: string): Promise<void> {
  const tmp = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  const handle = await fs.open(tmp, 'w')
  try {
    await handle.writeFile(data, 'utf-8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await fs.rename(tmp, target)
  } catch (err) {
    await fs.rm(tmp, { force: true })
    throw err
  }
}

export async function readProjectFile(filePath: string): Promise<IpcResult<Project>> {
  let text: string
  try {
    text = await fs.readFile(filePath, 'utf-8')
  } catch (err) {
    const mapped = mapFsError(err)
    return fail(mapped.code, mapped.message)
  }
  const parsed = parseProjectFile(text)
  if (!parsed.ok) return fail(parsed.code, parsed.message)
  lastSavedPath = filePath
  return ok(parsed.project)
}

export async function writeProjectFile(filePath: string, project: Project): Promise<IpcResult<string>> {
  const validated = ProjectSchema.safeParse(project)
  if (!validated.success) {
    const issue = validated.error.issues[0]
    return fail('E_VALIDATION', `project failed validation at "${issue.path.join('.')}"`)
  }
  try {
    await atomicWrite(filePath, serializeProjectFile(validated.data, app.getVersion()))
  } catch (err) {
    const mapped = mapFsError(err)
    return fail(mapped.code, mapped.message)
  }
  lastSavedPath = filePath
  return ok(filePath)
}
