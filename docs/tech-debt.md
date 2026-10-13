# Tech debt register

Every item here was discovered by measurement during hardening work, not by taste.
Format per the delivery standard: description, impact, estimated effort, owner.
An item without an owner does not get fixed; in a single-maintainer repo the owner is
either Julian (product or tooling decisions) or "next engineering slot".

Priorities: P1 blocks a core promise or risks data/security. P2 costs developer
velocity or user trust. P3 is hygiene.

## P1

## P2

### D5 — 15 of 53 buttons do nothing
Six have explicit no-op handlers (Split, Duplicate, Fullscreen, Templates, Layers,
Share in `TopBar`/`PreviewPanel`); nine have no handler at all (Templates, AI,
Transitions, Effects and Audio panels).
Impact: user trust — the UI promises functions it does not have.
Effort: 0.5-1 day per real feature; but first a keep/cut decision per button.
Owner: **Julian** for keep/cut; engineering for the kept ones.

### D7 — Parity: preset filters and grading fields remain unrendered
The parity harness now exists as `src/shared/parity.test.ts`: structural, not
pixel-level, because CSS and canvas rasterization will never be pixel-identical and a
pixel diff would measure the wrong thing. It pins the shared math - one color-adjust
source for both backends, text centring and font fraction, sticker size/centre, and the
clip transform semantics.
What remains: `clip.filter` preset strings (FiltersPanel) apply in the preview only, and
`exposure`, `highlights`, `shadows`, `temperature`, `tint`, `sharpness` are stored but
rendered nowhere (their sliders are disabled with a hint). Both belong to the Phase 2
compositor, where curves and white balance can actually be implemented.
Impact: parity confidence is now structural; two feature areas stay preview-only or off.
Effort: preset filters ~0.5 day to map or drop; grading 2-3 days inside Phase 2.
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
- Text clips now export, rasterized in the renderer and composited as PNG overlays.
- CI workflow enforces typecheck, lint, test and build on every push and PR (was D4).
- `strict: true` in both tsconfigs; the codebase turned out to be already strict-clean,
  verified by planting an implicit-any probe and watching tsc reject it (was D3).
- `removeMedia` now cascades to the clips and audio clips referencing it, as one undo
  step (was D8).
- Stickers are now original vector assets authored in-repo (src/assets/stickers), which
  sidesteps both the canvas emoji limitation and any third-party licence; they export
  through the same rasterized-overlay path as text. Legacy emoji sticker clips are
  dropped by the v2->v3 migration (was D1, D2).
- Preview text shadow/stroke/letter-spacing scale with the canvas (cqh), and clip
  brightness/contrast/saturation export through colorchannelmixer + eq derived from the
  same factors module as the preview's CSS filter string. The structural parity harness
  pins that shared math (part of D7).
- The three over-long files are split: Timeline clip items and track labels live in
  `Timeline/ClipItems.tsx`, transport controls in `PreviewControls.tsx`, store defaults
  in `store/defaults.ts`. Every file is now under 300 lines (was D6).
