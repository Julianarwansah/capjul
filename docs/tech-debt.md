# Tech debt register

Every item here was discovered by measurement during hardening work, not by taste.
Format per the delivery standard: description, impact, estimated effort, owner.
An item without an owner does not get fixed; in a single-maintainer repo the owner is
either Julian (product or tooling decisions) or "next engineering slot".

Priorities: P1 blocks a core promise or risks data/security. P2 costs developer
velocity or user trust. P3 is hygiene.

## P1

### D1 — Text, sticker and caption layers are not exported
`compileProject` emits `overlays: []`. System FFmpeg has no `drawtext`/`subtitles`/`ass`
(Homebrew build lacks libfreetype/libass), so the rasterized-overlay path from
`docs/export-pipeline-design.md` milestone 2 is required.
Impact: core promise — what you see is not what you export.
Effort: 2-3 days (rasterizer in renderer, overlay inputs, parity harness).
Owner: next engineering slot. Blocked by D2 for stickers only; text can proceed now.

### D2 — Stickers are emoji strings, and canvas cannot rasterize color emoji
`StickerClip.src` holds an emoji. Measured: `fillText('⭐')` and the SVG-text route both
paint **0 opaque pixels** in the Electron renderer, while plain text paints fine. Any
canvas-based render path (export milestone 2, or a future full compositor) will produce
blank stickers.
Impact: blocks sticker export; forces a product decision.
Effort: decision 0; migration to bundled image assets ~1 day (+ asset sourcing).
Owner: **Julian** — choose the asset set and licence (Twemoji CC-BY, Noto OFL, or
self-authored). Engineering cannot pick a licence.

### D3 — `strict` is off in every tsconfig
`tsconfig.app.json` and `tsconfig.node.json` omit `strict`. The `File.path` bug and
several others survived partly because of this.
Impact: reliability — whole classes of null/implicit-any errors are invisible.
Effort: 1-2 days to enable and fix what surfaces across ~4k lines.
Owner: next engineering slot, as its own pass (not bundled with features).

### D4 — No CI enforces the local gates
`typecheck`, `lint`, `test`, `build` all exist and pass locally, but nothing runs them on
push. This repo has already received an auto-commit and an auto-push from external
tooling (see D9), so unverified commits can reach `main`.
Impact: reliability — the gates are advisory.
Effort: 2-4 hours (GitHub Actions: typecheck + lint + test + build on push).
Owner: next engineering slot.

## P2

### D5 — 15 of 53 buttons do nothing
Six have explicit no-op handlers (Split, Duplicate, Fullscreen, Templates, Layers,
Share in `TopBar`/`PreviewPanel`); nine have no handler at all (Templates, AI,
Transitions, Effects and Audio panels).
Impact: user trust — the UI promises functions it does not have.
Effort: 0.5-1 day per real feature; but first a keep/cut decision per button.
Owner: **Julian** for keep/cut; engineering for the kept ones.

### D6 — Three files exceed the 300-line split threshold
`Timeline/index.tsx` 478, `PreviewPanel.tsx` 387, `editorStore.ts` 315.
Impact: developer velocity — mixed responsibilities, painful diffs.
Effort: 0.5-1 day each; Timeline first (clip items extract cleanly).
Owner: next engineering slot, paired with whichever feature touches them.

### D7 — Preview/export parity gaps beyond font size
Text `shadow*`, `strokeWidth`, `letterSpacing` are emitted in px, so they do not scale
with the canvas; clip color filters are a CSS filter string with no export equivalent.
Impact: parity — exported text will not match the preview even after D1.
Effort: folded into D1 if the parity harness is built; else 1 day.
Owner: next engineering slot.

### D8 — `removeMedia` orphans clips that reference it
Deleting a media item leaves clips with a dangling `mediaId`; the compiler skips them
silently, the timeline shows a nameless block.
Impact: reliability/UX — invisible data corruption in the project.
Effort: 2 hours (cascade delete or block with a warning).
Owner: next engineering slot.

### D9 — External tooling commits and pushes without instruction
Twice during hardening work, an unidentified tool in this environment created a commit
and pushed it. One push raced a local history rewrite; it happened not to collide.
Impact: process risk — unreviewed or half-finished states can become public history.
Effort: configuration change, ~30 minutes to identify and disable/confirm.
Owner: **Julian** — this is your environment, not the codebase.

### D10 — No packaging script despite electron-builder config
`package.json` has a `build` key (dmg/nsis/AppImage) but no script invokes it; signing
and notarization are unaddressed.
Impact: delivery — the app cannot reach a user outside this machine.
Effort: 1 day including macOS signing/notarization decisions.
Owner: **Julian** for signing identity; engineering for the pipeline.

## P3

### D11 — Undo history holds 50 deep clones of the whole project
~7.5 MB resident at current project sizes; grows linearly with project size.
Impact: memory, only at scale.
Effort: 1 day (structural sharing / patch-based history) if project sizes grow 10x.
Owner: unowned until measured pressure — revisit with a profiler, not preemptively.

### D12 — Export probes every input serially before encoding
One `ffprobe` per input at export start; fine for a handful of clips, linear beyond.
Impact: latency at scale only.
Effort: 1 hour (cache probe results per path+mtime from import time).
Owner: unowned until it measures slow.

## Resolved during this hardening pass

Kept here for traceability; each has a commit.

- Command injection via filename in `ffmpeg:probe` (`execSync` + string interpolation).
- Undo factory-resetting the project (unseeded history + pre-change snapshots + off-by-one).
- `project.duration` hardcoded 60 and never recomputed.
- Preload emitted as ESM, so `window.electronAPI` was undefined and every native feature
  silently no-oped.
- `webSecurity: false` with no need for it.
- `media://` accepting relative-looking URLs, directories and missing files.
- Three dead IPC channels, one of them a read-any-file-as-base64 primitive.
- 15 unused runtime dependencies and the COOP/COEP headers that served them.
- Preview canvas collapsed to 0x0 by invalid CSS width; text sized at ~0.6px.
- Export swallowing failures and leaking its progress listener.
- Concat-only export replaced by the compiled RenderPlan filtergraph.
