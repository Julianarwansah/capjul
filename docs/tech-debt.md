# Tech debt register

Every item here was discovered by measurement during hardening work, not by taste.
Format per the delivery standard: description, impact, estimated effort, owner.
An item without an owner does not get fixed; in a single-maintainer repo the owner is
either Julian (product or tooling decisions) or "next engineering slot".

Priorities: P1 blocks a core promise or risks data/security. P2 costs developer
velocity or user trust. P3 is hygiene.

## P1

## P2

### D5 — Seven button sites still do nothing
Was "15 of 53 buttons". Split, Duplicate and Delete in `TopBar` and Fullscreen in
`PreviewControls` are now wired, so what is left is not missing handlers — it is
placeholder UI standing in for features that do not exist:

- `TopBar`: Templates, Layers, Share. Three explicit `onClick={() => {}}`.
- `AudioPanel`: the Moods chips, the four "Recommended" tracks with their `+`
  buttons, and the Sound Effects list. These render hardcoded mock data
  (`Music Track 1..4`, `Upbeat · 2:30`, a fixed `SOUND_EFFECTS` array) for a
  music and effects library the app does not have. Wiring them up means
  inventing that library first — asset sourcing and licensing, not a handler.
- `AIPanel`: the suggestion list items.

Impact: user trust — the UI promises functions it does not have. The audio
placeholders are the worst offenders because they look like populated content.
Effort: Templates/Layers/Share are a keep-or-cut call. The audio library is a
real feature, days not hours. Cutting the placeholders is ~1 hour.
Owner: **Julian** for keep/cut on all seven; engineering for whatever is kept.

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

### D13 — The 300-line threshold has been crossed again (was D6)
D6 was marked resolved in `12f1f1a` and that was accurate at the time. It is not
now. Eight files are over the threshold:

| File | Lines |
|---|---|
| `src/components/PreviewPanel.tsx` | 770 |
| `src/components/Timeline/index.tsx` | 725 |
| `src/components/RightPanel.tsx` | 571 |
| `src/store/editorStore.ts` | 476 |
| `src/components/ExportDialog.tsx` | 438 |
| `src/shared/render-plan.ts` | 417 |
| `electron/main.ts` | 354 |
| `src/components/Timeline/ClipItems.tsx` | 325 |

This is feature work landing in the same few files — keyframes, the Phase 2
compositor, the selection-wide store actions — not neglect, and nothing here is
broken. The real cost is that the register's "every file is under 300 lines"
claim went stale and nobody noticed, which matters more than the line counts:
the register is supposed to record measurement, not aspiration.
Impact: maintainability; the next feature is likely to land in an 800-line file too.
Effort: `PreviewPanel` and `Timeline` about a day each; the rest opportunistically.
Owner: next engineering slot.

### D14 — Two transport controls are not keyboard-operable
Found while adding the `aria-label`s the icon buttons were missing:

- The preview progress bar (`PreviewControls`) is a `div` with an `onClick` seek.
  No `role="slider"`, no `tabIndex`, no arrow-key handling, no focus ring.
  Seeking is mouse-only.
- The playback-speed menu is a `div` of buttons with no Escape-to-close and no
  focus management. Tab reaches the items, but the menu cannot be dismissed
  without a mouse.

The icon buttons themselves now carry `aria-label` — previously `title` only,
which screen readers do not announce — so this is the remainder.
Impact: accessibility. WCAG 2.1 AA 2.1.1 (Keyboard) fails on both counts.
Effort: progress bar ~2 hours; speed menu ~1 hour, or free if it is replaced by
the existing `ContextMenu`, which already handles Escape and outside-click.
Owner: next engineering slot.

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
  in `store/defaults.ts` (was D6). The "every file is under 300 lines" half of that
  claim has since gone stale and is tracked as D13.
- Split, Duplicate and Delete work from the top bar, and Fullscreen from the
  transport controls. The selection-wide fan-out moved into the store as
  `splitAtPlayhead`, `duplicateSelection` and `deleteSelection`, each a single
  `mutate()` so one gesture costs exactly one undo step. All four clip kinds are
  handled in one place instead of being reimplemented per call site (part of D5).
  Fullscreen enters and exits through the native API with state synced from the
  `fullscreenchange` event; the exit path was verified by clicking the toggle in
  a real browser. Escape-to-exit relies on browser-level fullscreen handling and
  could not be observed under headless Chrome, where a synthetic Escape does not
  leave fullscreen.
- Two `window` keydown listeners — one in `App.tsx`, one in `Timeline` — both
  handled Delete and both handled split, with different shortcuts (`B` versus
  `S`) and different coverage: App's reached video clips only. Both fired on
  every keypress, so Timeline's handler is what actually removed text, sticker
  and audio clips while App's ran first as a redundant video-only pass. Each
  `mutate()` recorded its own snapshot, so one Delete keypress could spend up to
  five undo steps. `App.tsx` is now the only global binding site; `Timeline`
  keeps paste, which needs its own clipboard state.
- Splitting a clip corrupted its keyframe animation. Keyframe times are absolute
  project time and neither `transformAt` (preview) nor `volumeExpression`
  (export) clamps them to the owning clip, so both halves kept every keyframe
  and the head half animated toward a pose it should never reach. `splitKeyframes`
  now gives each half only its own points plus one synthesized at the cut, so
  motion stays continuous and a half with no keyframes of its own holds the last
  pose instead of snapping back to the clip's base value
  (`src/shared/clip-split.ts`, 16 tests).
- Duplicating or pasting a clip left its keyframes at the original's times, so
  the copy replayed the original's poses at the wrong moment. All three copy
  paths — toolbar/shortcut, context menu, paste — now share `copyClipAfter`.
- Icon-only buttons in `TopBar` and `PreviewControls` carry `aria-label`. They
  had `title` only, which screen readers do not announce (the rest of D14).
