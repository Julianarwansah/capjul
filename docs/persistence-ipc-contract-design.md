# Persistence and IPC contract design

Status: proposal. Companion to [`export-pipeline-design.md`](./export-pipeline-design.md).
Scope: the two trust boundaries of a local desktop app — bytes from disk, and messages
between OS processes. Everything here was measured against the current code first.

## 1. Problem statement

CapJul has exactly two boundaries where untrusted or mistyped data can enter the
application, and neither is defended.

**The file boundary.** A `.cjp` project is a bare JSON blob. Saving is
`fs.writeFileSync(path, data)` in the main process: synchronous (it blocks every window
event for the duration), non-atomic (a crash or power loss mid-write leaves a truncated
file), and unversioned. Loading is `JSON.parse` in the renderer followed by
`loadProject(parsed)` with no shape validation — only syntax errors are caught. A file
that is valid JSON but wrong-shaped (missing `tracks`, `clips: null`, a string where a
number belongs) enters the Zustand store and fails later, far from the cause. There is
no autosave and no crash recovery, so an app crash loses everything since the last
manual save.

**The process boundary.** Six IPC channels plus one event stream connect renderer and
main. The contract exists in three non-communicating places: a `declare global` block in
`src/App.tsx`, an object literal in `electron/preload.ts` (where the export payload is
typed `unknown`), and a private `interface ExportOptions` in `electron/main.ts` that
duplicates `src/types/index.ts`. Nothing enforces that they agree. Channel names are
string literals repeated per file.

Two supporting facts: `Project.updatedAt` is written once at creation and never again
(dead field), and no code records where a project was last saved, so neither autosave
nor "save" (as opposed to "save as") is currently possible.

## 2. Trust model

Threats are realistic but bounded. This is a single-user local app with no network
service, so there is no remote attacker. The inputs that must be treated as hostile are:

- **Project files from anywhere.** Downloaded, emailed, synced from another machine, or
  hand-edited. They may be truncated, corrupted, from a different app version, or
  deliberately crafted (including `__proto__` / `constructor` keys).
- **Filesystem failures.** Full disk, read-only volume, permission loss, file moved
  between save and autosave.
- **Renderer compromise.** If the renderer ever executes hostile content (a crafted
  project is the most plausible vector), every IPC channel is an attacker-controlled
  call into the main process. Channels must therefore validate their own arguments; the
  renderer is not trusted to send well-formed payloads.

Not in scope: multi-user access, encryption at rest, malicious local processes.

## 3. Data model: the `.cjp` envelope

Current files are a bare `Project`. Introduce an envelope at schema version 2 and treat
the absence of an envelope as version 1.

```ts
interface ProjectFile {          // schemaVersion 2
  app: 'capjul'
  schemaVersion: 2
  savedAt: number                // epoch ms, written by main
  appVersion: string             // informational, from package.json
  project: Project
}
```

Reading:

1. Parse JSON. Failure → `E_CORRUPT`.
2. No `schemaVersion` key → v1: the whole document is the `Project`.
3. `schemaVersion > CURRENT` → `E_FUTURE_VERSION` ("saved by a newer CapJul"). Never
   guess at an unknown shape.
4. `schemaVersion < CURRENT` → run the migration chain, oldest first.
5. Validate the resulting `Project` against the schema. Failure → `E_CORRUPT` with the
   validation path in the message.

The migration registry is a map from version to step function, applied in order:

```ts
const migrations: Record<number, (p: UnknownShape) => UnknownShape> = {
  1: p => ({ ...p, duration: computeDuration(p) }),   // v1 stored a hardcoded 60
  // 2: next step goes here when v3 exists
}
```

v1 files keep opening forever; there is no write-side compatibility to maintain because
a desktop app ships reader and writer together. If a future version must stop reading
v1, that is a deliberate cutoff announced in release notes, not silent failure.

`updatedAt` is dropped from `Project`. It has never been maintained, and `savedAt` in the
envelope is the honest timestamp. The v1→v2 migration simply ignores it.

### Why validation lives in main

The simpler alternative is validating in the renderer after `JSON.parse`. It is worse in
three ways: hostile shapes briefly live in renderer state; the schema must be duplicated
or imported across the boundary anyway; and main already owns the bytes, so it can
reject before anything crosses IPC. Main parses, migrates and validates, and sends a
`Project` — never a raw string — to the renderer. This also removes the current
whole-document string round-trip from the IPC payload.

### Why zod for the schema

`Project` is deeply nested (Clip alone has ~30 fields). Hand-written validators would be
hundreds of lines of code that can drift from the types. A single zod schema gives
validation and the TypeScript type from one definition (`z.infer`), which also deletes
the hand-maintained `Project`/`Clip`/… interfaces in `src/types/index.ts`. Zod ignores
unknown keys during parsing, which is what makes `__proto__`-style keys inert: the
parsed object is constructed from known keys only. Health check: zod is actively
maintained with very high weekly downloads; it adds ~60 KB to the renderer bundle if
imported there, but it is only needed in main, so it stays a main-process dependency.
UI-only types (`LeftPanelTab`, `AspectRatio`, `FfprobeResult`) remain plain types.

## 4. API contract: one module, six channels

A single pure module, `src/shared/ipc-contract.ts`, owns channel names, payload types
and result types. It imports nothing from node or DOM, so main, preload and renderer can
all import it. Preload builds its exposed object from it; main registers handlers typed
by it; the renderer's `window.electronAPI` type is derived from it, replacing the
`declare global` block in `App.tsx`. Adding a channel then requires editing one place,
and forgetting a side is a compile error rather than a runtime `undefined`.

Results cross the boundary as values, never as thrown errors — IPC exceptions lose their
shape and arrive as opaque strings:

```ts
type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: ErrorCode; message: string } }

type ErrorCode =
  | 'E_CANCELLED'          // user dismissed a dialog; not a failure
  | 'E_NOT_FOUND' | 'E_PERMISSION' | 'E_DISK_FULL' | 'E_IO'
  | 'E_CORRUPT' | 'E_VALIDATION'
  | 'E_FUTURE_VERSION' | 'E_UNSUPPORTED_VERSION' | 'E_TOO_LARGE'
  | 'E_FFMPEG_MISSING' | 'E_EXPORT_FAILED'
```

| Channel | Request | Response | Notes |
| --- | --- | --- | --- |
| `project:save` | `{ project: Project, path?: string }` | `IpcResult<string>` (final path) | `path` absent → save-as dialog. Main serializes, validates, writes atomically, remembers the path. |
| `project:open` | — | `IpcResult<Project>` | Dialog, read, migrate, validate in main. |
| `project:autosave` | `{ project: Project }` | `IpcResult<{ at: number }>` | Writes `userData/autosave.cjp`. Never touches the user's file. |
| `project:recovery` | — | `IpcResult<{ at: number; name: string } \| null>` | Present when an autosave is newer than the last explicit save. |
| `project:restore` | — | `IpcResult<Project>` | Loads the autosave through the same migrate+validate path. |
| `media:probe` | `{ path: string }` | `IpcResult<FfprobeResult>` | Path validated as an existing file first. |
| `media:export` | `{ plan: ExportRequest }` | `IpcResult<string>` (output path) | Contract shared with the export pipeline design. |
| `export:progress` | — (event, main → renderer) | `{ percent: number }` | Unchanged shape. |
| `dialog:openMedia` | — | `IpcResult<string[]>` | Kept; returns paths only. |

`getPathForFile` stays outside this table: it is a synchronous `webUtils` call in the
preload, not IPC.

Argument validation is per-channel in main: `media:probe` and any path argument must be a
string that resolves to an existing regular file; `project:save`'s `project` is validated
against the zod schema before serialization; `media:export`'s plan is validated against
its own schema. A failed validation returns `E_VALIDATION` and is logged with the channel
name and the offending path, never the payload contents.

### Why not electron-trpc or a codegen layer

Eight channels do not justify a runtime framework. The contract module is boring,
dependency-free at runtime, and type-checked at compile time on all three sides. If the
channel count ever passes ~20, revisit.

## 5. Component breakdown

**ProjectCodec** (main). `parse(bytes) → migrate → validate → Project`, and
`serialize(Project) → bytes`. Pure, unit-testable without a filesystem. Owns the
migration registry and the zod schema.

**ProjectStore** (main). Atomic write, autosave slot, last-saved path, recovery info.
The only code that touches project files.

**IpcContract** (`src/shared/ipc-contract.ts`). Types and channel constants only.

**Renderer save coordinator** (small hook). Subscribes to store changes, marks dirty,
debounces 5 s, calls `project:autosave`. Clears dirty on successful explicit save.

## 6. Atomic write

```
tmp = path + '.tmp-' + pid + '-' + random
write tmp (fs.promises) → fsync tmp → rename tmp → path
```

Same-directory temp guarantees the rename is within one filesystem, so it is atomic on
POSIX; libuv implements rename on Windows with `MOVEFILE_REPLACE_EXISTING`, so overwrite
works there too. `fsync` before rename prevents a zero-length file after power loss. On
any failure the temp file is removed and the original is untouched — a failed save can
never destroy the user's document. Writes use `fs.promises`, removing the current
main-process block.

## 7. Autosave and recovery

Autosave writes only to `app.getPath('userData')/autosave.cjp`, through the same atomic
path. It is triggered by the renderer's dirty debounce, never by a timer in main, so an
idle app does not write. The autosave is cleared after a successful explicit save and on
clean quit; it survives a crash, which is the entire point.

On launch, `project:recovery` reports an autosave newer than the last explicit save. The
renderer shows a one-line restore prompt ("Recovered copy from 14:32 — restore?").
Restore goes through `project:restore`, i.e. the same migrate+validate path as any file.
No silent auto-restore: overwriting a user's in-memory project without asking is worse
than losing an autosave.

The slot is cleared after a successful explicit save and on orderly quit, meaning the
app `quit` event (Cmd+Q, menu, dock). `SIGKILL` and `SIGTERM` never run cleanup and
therefore retain the slot — deliberately: a session ended by a signal may well have lost
edits, which is precisely when a recovery prompt should appear. Verified by killing the
running app with `SIGKILL` (slot survives, prompt appears, restore returns the project)
and by observing that a signal-terminated session still offers recovery on next launch.

## 8. Failure modes

| Failure | Detected by | User sees | State after |
| --- | --- | --- | --- |
| Truncated/corrupt file | JSON parse or zod | "File is damaged" + restore offer | store untouched |
| File from newer app | `schemaVersion > CURRENT` | "Saved by a newer CapJul" | store untouched |
| Hostile keys (`__proto__`) | zod reconstructs from known keys | nothing; keys dropped | clean Project |
| Disk full on save | write/rename error | "Save failed: disk full", project kept in memory | original file intact, temp removed |
| Permission denied | write error | actionable message | original intact |
| Crash mid-edit | autosave present at next launch | restore prompt | user's file untouched |
| Crash mid-save | atomic rename | nothing | previous version intact |
| Autosave write failing repeatedly | 3 consecutive errors | one warning, autosave backs off | explicit save unaffected |
| Oversized file (>50 MB) | size check before parse | "File too large" | not parsed |
| ffmpeg absent at export | startup capability probe | Export disabled with install hint | n/a |

Every row ends in either a visible message or a deliberate, documented silence. There is
no path that logs and continues.

**Observability, adapted.** A single-user desktop app has no dashboard and no alerting
channel, so the skill's metrics/alerts/runbook requirement is met in the only form that
exists locally: every `ErrorCode` is logged with the channel name, the operation and a
correlation id (the export/save attempt id), appended to `userData/capjul.log` with a
size cap, and simultaneously surfaced in the UI where a human can act on it. The log is
what a bug report attaches. "We will monitor it" has no meaning here; "every failure has
a code, a log line and a visible message" does.

## 9. Adapted capacity and consistency notes

The skill's QPS/replica math has no referent in a single-user local app; the honest
equivalents are size, write frequency and memory.

- Serialized size: a `Clip` is ~30 fields ≈ 350 B of JSON. 200 clips + 100 text clips +
  envelope ≈ 150 KB. A 50 MB ceiling is ~300x headroom.
- Autosave write rate: worst case one 150 KB atomic write per 5 s of active editing ≈
  30 KB/s. Trivial for any SSD; if a project ever serializes above 5 MB the coordinator
  lengthens the interval rather than writing on every debounce.
- Undo history: 50 deep clones × 150 KB ≈ 7.5 MB resident. Acceptable; if project sizes
  grow 10x, switch history to structural sharing (immer-style patches) — flagged, not
  done.
- Consistency: the file store is CP by construction — one writer, and on any doubt we
  fail loudly rather than serve a stale or partial document. Availability is deliberately
  sacrificed: a disk error surfaces instead of being papered over. The autosave slot is a
  second copy for durability, not a replica for availability.

## 10. Rollout

No server, no fleet: the reader and writer ship in one release. The constraint that
matters is forward-reading — every future build must keep reading v1 and v2 — so the
migration registry and its tests are permanent code, not a one-off. The IPC contract
change is compile-time: all three sides move in a single commit, and the old
string-based channels are deleted in the same commit so nothing can keep using them.

## 11. Acceptance criteria

1. `SIGKILL` the app mid-save → the original `.cjp` is byte-identical afterwards.
2. Open a v1 file → loads with recomputed duration; saving writes a v2 envelope; the v1
   file is not modified by opening it.
3. Open a hand-corrupted file → `E_CORRUPT` dialog and a restore offer; the store keeps
   its previous project; no unhandled rejection.
4. Open a file containing `"__proto__": {"polluted": true}` → `({} as any).polluted` is
   `undefined` afterwards and the load either succeeds without the key or fails with
   `E_CORRUPT`; it never partially applies.
5. `SIGKILL` mid-edit, relaunch → recovery prompt appears and restore yields the
   autosaved project.
6. `grep unknown electron/preload.ts` finds nothing; `ExportOptions` exists once; adding
   a channel without updating all three sides fails `npm run typecheck`.
7. Every `ErrorCode` has at least one test that produces it.

## 12. Open questions

1. Autosave interval (5 s proposed) and whether the restore prompt should also offer
   "discard autosave".
2. Whether `media:probe` should cache results per path+mtime to avoid re-probing on
   every import of the same file.
3. Single-window is assumed throughout. If multi-window ever lands, the autosave slot
   and last-saved path become per-window and this design needs revisiting.
