# CapJul

Desktop video editor (CapCut-style) built with Electron and React. Multi-track timeline, live preview, media import via dialog or drag-and-drop, and export through FFmpeg.

## Stack

| Layer | Tech |
| --- | --- |
| Shell | Electron 44 |
| UI | React 19, TypeScript 6, Tailwind CSS v4, Radix UI (dialog), lucide-react |
| Build | Vite 8, vite-plugin-electron |
| State | Zustand (with undo/redo history) |
| Media | FFmpeg / ffprobe, invoked as system binaries |
| Test | Vitest |
| Lint | oxlint |

## Requirements

- **Node.js** 20+
- **`ffmpeg` and `ffprobe` on your `PATH`** — media probing and export shell out to the system binaries, so the app cannot import or export without them.

```sh
# macOS
brew install ffmpeg
```

## Getting started

```sh
npm install
npm run electron:dev
```

`electron:dev` starts Vite on `http://localhost:5173`, waits for it, then launches Electron against it with HMR. `npm run dev` serves only the renderer in a browser — `window.electronAPI` is undefined there, so import/export/probe will not work.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run electron:dev` | Vite + Electron with HMR (the real dev loop) |
| `npm run dev` | Renderer only, in a browser |
| `npm run typecheck` | `tsc -b` across `src/`, `electron/`, and `vite.config.ts` |
| `npm run lint` | oxlint (config in `.oxlintrc.json`) |
| `npm test` | Vitest, single run (`test:watch` to watch) |
| `npm run build` | `tsc -b` gate, then Vite build → `dist/` + `dist-electron/` |
| `npm run preview` | Serve the production build locally |
| `npm run pack` | Build, then package unpacked (no installer) → `release/<platform>/` |
| `npm run dist:mac` | Build, then produce a `.dmg` → `release/` |
| `npm run dist:mac:unsigned` | Same, with certificate discovery disabled for a local build |
| `npm run dist:win` / `dist:linux` | NSIS installer / AppImage |

## Packaging

Every `dist:*` script runs `npm run build` first, because packaging reads
`dist/` and `dist-electron/`. Artifacts land in `release/`, which is gitignored.

`release/` is deliberately **not** `dist/`. electron-builder's default output
directory is `dist`, and it cleans that directory before writing — the same
directory it was being told to package. Setting `directories.output` is what
stops the build from deleting its own input.

Nothing in `dependencies` is needed at runtime: Vite bundles the renderer into
`dist/assets/` and the main process into `dist-electron/main.js`, whose only
imports are `electron` and `node:` builtins. All eight former runtime
dependencies are therefore `devDependencies`, which keeps them out of the asar.
That is worth 42 MB — `lucide-react` alone is 45 MB unpacked. **If you add a
dependency that the main process requires at runtime rather than imports at
build time, it must go back into `dependencies`**, or the packaged app will fail
with a missing-module error that never appears in development.

`ffmpeg` and `ffprobe` are spawned from `PATH` and are not bundled, so a
packaged app still needs them installed on the user's machine.

### What is not done yet

- **Code signing and notarization.** With no Developer ID certificate the build
  is unsigned and macOS Gatekeeper will refuse to launch it on any machine but
  the one that built it. Supply `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` in the environment for a
  distributable build. See `docs/tech-debt.md` D10.
- **Application icon.** There is no `build/icon.icns`, so the packaged app wears
  the default Electron icon. Drop a 1024×1024 `build/icon.icns` (plus
  `icon.ico` and `icon.png` for Windows and Linux) and electron-builder picks it
  up with no config change — `directories.buildResources` already points at
  `build/`.
- **`version` is `0.0.0`**, so artifacts are named `CapJul-0.0.0-*.dmg` and
  `latest-mac.yml` cannot express an upgrade. Bump it before shipping anything.

## Layout

```
electron/
  main.ts       # window, custom media:// protocol, IPC handlers, ffmpeg/ffprobe
  preload.ts    # contextBridge -> window.electronAPI
src/
  components/
    TopBar.tsx          PreviewPanel.tsx     RightPanel.tsx
    Timeline/           LeftPanel/           ExportDialog.tsx  ProjectSettings.tsx
  store/editorStore.ts  # Zustand store + undo/redo history
  types/index.ts        # Clip, TextClip, AudioClip, StickerClip, Track, MediaFile
```

Left panel tabs: Media, Audio, Text, Stickers, Effects, Filters, Transitions, AI Tools, Templates.

Renderer and main never share memory directly — everything goes through the typed `window.electronAPI` surface declared in `src/App.tsx` and implemented in `electron/preload.ts`.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Space` | Play / pause |
| `B` | Split selected clips at playhead |
| `Delete` / `Backspace` | Remove selected clips |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + S` | Save project (`.cjp`) |
| `←` / `→` | Nudge one frame (`Shift` = 5s) |
| `Home` / `End` | Jump to start / end |
| `Cmd/Ctrl + =` / `-` | Timeline zoom in / out |

Shortcuts are suppressed while an `INPUT` or `TEXTAREA` is focused.

## Notes on the media pipeline

Local files are served to the renderer through a custom `media://` protocol registered in `electron/main.ts`. Because Electron 32+ removed `File.path`, dropped files are resolved with `webUtils.getPathForFile` exposed from the preload — a plain `File` object no longer carries its real path.

`media://` is the only mechanism for getting file bytes to the renderer. There is no data-URL bridge and no WASM FFmpeg; both existed as unused alternatives and were removed so there is one strategy to reason about.

`webSecurity` is **enabled**. It was previously disabled, which is unnecessary: `media://` keeps working with it on, verified for `<video>` and `<img>` in both the `file://` production origin and the `http://localhost:5173` dev origin.

One limitation to know about: `fetch('media://…')` **fails** with `URL scheme "media" is not supported`, because the scheme is not registered as privileged. Only element `src` loading works. If you ever need to read bytes in the renderer — waveform analysis, canvas processing, an in-renderer FFmpeg — call `protocol.registerSchemesAsPrivileged` with `supportFetchAPI: true` and `stream: true` **before** `app.whenReady()`.

### The preload must stay CommonJS

Electron runs preload scripts in a sandboxed CommonJS context. Because `package.json` has `"type": "module"`, `vite-plugin-electron` defaults the preload to ESM output — and an ESM preload **fails to execute entirely**, leaving `window.electronAPI` undefined. Since every call site uses optional chaining, this degrades into silent no-ops rather than an error: the UI renders, and import/probe/save/export simply do nothing.

`vite.config.ts` therefore pins the preload to `lib.formats: ['cjs']` with a `.cjs` extension. Do not remove that override. `main.js` stays ESM, which Electron's main process supports.

Note that Vite 8 reads `build.rolldownOptions`, not `build.rollupOptions` — settings placed under the old key are silently ignored.

## Known gaps

The full register — with impact, estimates and an owner per item — lives in
[`docs/tech-debt.md`](docs/tech-debt.md). The short version:

- **Export does not match the preview.** Video, audio, gaps, multiple tracks, speed,
  volume, opacity and transform now render through a compiled filtergraph, but text,
  stickers and captions are still not exported (system FFmpeg has no `drawtext`), and
  the `format`/parity work continues in `docs/export-pipeline-design.md`.
- Dropping media onto a **timeline track** creates a clip; the Transitions, Effects,
  Templates and AI panels remain UI without behavior, as do several toolbar buttons.
- Removing a media item leaves clips that reference it orphaned.
- `strict` mode is off in every tsconfig. Turning it on will surface errors across the
  existing codebase and should be done as its own pass.
- Tests cover the store, the project codec and the render compiler. Components, the IPC
  layer and the encoder are verified manually, not by tests.
