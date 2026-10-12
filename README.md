# CapJul

Desktop video editor (CapCut-style) built with Electron and React. Multi-track timeline, live preview, media import via dialog or drag-and-drop, and export through FFmpeg.

## Stack

| Layer | Tech |
| --- | --- |
| Shell | Electron 44 |
| UI | React 19, TypeScript 6, Tailwind CSS v4, Radix UI, Framer Motion, lucide-react |
| Build | Vite 8, vite-plugin-electron |
| State | Zustand (with undo/redo history) |
| Media | FFmpeg / ffprobe (system binary), wavesurfer.js, @ffmpeg/ffmpeg |
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
| `npm run build` | `tsc -b` gate, then Vite build → `dist/` + `dist-electron/` |
| `npm run preview` | Serve the production build locally |

Packaging targets (dmg / nsis / AppImage) are configured under the `build` key in `package.json` but have no npm script yet — run `npx electron-builder` directly.

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

The dev server sends `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers so `SharedArrayBuffer` is available for the `@ffmpeg/ffmpeg` WASM build.

## Known gaps

- Dropping media onto a **timeline track** does not create a clip yet; only the Media panel drop zone imports files.
- `strict` mode is off in every tsconfig. Turning it on will surface errors across the existing codebase and should be done as its own pass.
- No test suite.
