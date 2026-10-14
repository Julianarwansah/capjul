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

### D15 — Transitions are preview-only and vanish on export
`TransitionsPanel` creates real `project.transitions` entries, including
"apply to all" across a track. `PreviewPanel` renders them through
`transitionStyles()` — 11 types: fade, dissolve, four wipes, two slides, two
zooms, blur, flash. Nothing on the export side ever reads them: `transitions`
appears nowhere in `render-plan.ts` or `compositor.ts`, only in
`project-schema.ts` and test fixtures.

So a crossfade the user picked, saw working in the preview, and then exported is
silently dropped. Unlike D7's disabled sliders there is no hint that the feature
does not reach the output — the preview actively demonstrates it working, which
makes this a worse promise to break.
Impact: user trust and output correctness. This is a whole feature, not a field.
Effort: ~1-2 days. `xfade` in the filtergraph for video-to-video on one track,
but the current `RenderPlan` compiles each clip to its own trimmed stream, so
transitions need adjacent streams paired with an offset — a structural change to
how the video graph is assembled, not a filter appended to the existing one.
Owner: next engineering slot; **Julian** if the answer is to cut transitions from
the UI instead.

### D17 — Image clips ignore position, scale, rotation and keyframes in the preview
`BaseMediaLayer` (`src/components/Preview/MediaLayers.tsx`) resolves a full pose
through `clipTransformAt` for video, but the image branch still renders with
`objectFit: contain` filling the canvas and only a static `clip.opacity`. No
`translate`, no `scale`, no `rotate`, no keyframed opacity.

The export side does apply all of it: `compileScene` emits image layers with the
same `transform` and `keyframes` as video, and `compositor.ts` runs both through
`transformAt`. So an image clip the user drags, resizes, rotates or animates in
the right-hand panel exports correctly while the preview keeps showing it
centred and still.

This is the inverse of D15 and in some ways worse. There the preview showed a
feature the export dropped; here the preview hides a change the export keeps.
Either way the preview — the surface the user actually edits on — does not
predict the output.

`IncomingMediaLayer` has the smaller version of the same defect: the clip
arriving during a transition reads `clipB`'s static pose instead of resolving its
keyframes. It is only visible for the length of a transition, and transitions do
not export at all yet (D15), so it is not separately urgent.

Both were found while extracting the media layers out of `PreviewPanel` and are
marked `D17` in the code at the exact branches. They were deliberately left
unfixed there: mixing a visible rendering change into a structural refactor is
how regressions hide.
Impact: preview does not match export for every image clip with a non-default
transform. Images are common — photos, logos, PNG overlays — so this is
frequently hit, not theoretical.
Effort: ~2 hours. Apply the resolved pose in the image branch as the video
branch already does, then extend `parity.test.ts` to pin that image and video
layers resolve their pose identically. The transition-incoming case is a few
minutes more.
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
now. Eight files remain over the threshold:

| File | Lines |
|---|---|
| `src/components/Timeline/index.tsx` | 728 |
| `src/components/RightPanel.tsx` | 571 |
| `src/store/editorStore.ts` | 470 |
| `src/components/ExportDialog.tsx` | 438 |
| `src/shared/render-plan.ts` | 417 |
| `src/components/Preview/index.tsx` | 370 |
| `electron/main.ts` | 354 |
| `src/components/Timeline/ClipItems.tsx` | 325 |

The worst offender is done. `PreviewPanel.tsx` (770) became `Preview/` with the
transition style table and the active-transition query moved to
`shared/transitions.ts`, the media layer stack to `MediaLayers.tsx`, text and
sticker and caption and effect overlays to `Overlays.tsx`, the floating button
clusters to `Toolbar.tsx`, and audio element management and chroma key to two
hooks. The orchestrator is 370 lines and the six files it delegates to are all
under 270. It stopped short of 300 on purpose: what is left is store wiring,
refs, the video sync effects, the playback loop and the drag handler, and
splitting those further would scatter playback logic rather than clarify it.

The rest is feature work landing in the same few files — keyframes, the Phase 2
compositor, the selection-wide store actions — not neglect, and nothing here is
broken. The real cost is that the register's "every file is under 300 lines"
claim went stale and nobody noticed, which matters more than the line counts:
the register is supposed to record measurement, not aspiration.
Impact: maintainability; the next feature is likely to land in a 700-line file too.
Effort: `Timeline` about a day — the clip item rendering, marquee selection,
drag/resize and context menu are four separable concerns still in one file. The
rest opportunistically.
Owner: next engineering slot.

### D16 — The preview does not consume compileScene, contrary to its own comment
`src/shared/scene.ts` opens with: "The renderer compositor and (later) the
preview both consume this, which is what makes parity structural rather than
hoped for." The compositor does. The preview does not — `PreviewPanel` derives
its own active layers, track order and paint stacking independently
(`videoTracks` / `allActiveClips` / `activeTextClips` / `activeStickerClips`),
and has its own `clipTransform` wrapper around the shared `transformAt`.

What is genuinely shared today is narrower than the comment claims: the
transform and pose math (`transformAt`, `textTransformAt`, `stickerTransformAt`)
and the colour-adjust factors, which `parity.test.ts` pins. Layer *selection*
and *ordering* are not shared, so the two can disagree about which clips are
visible at time t, or in what order, without any test failing.
Impact: latent parity risk, and a comment that overstates the guarantee. No
observed drift bug yet.
Effort: the comment is a one-line correction. Actually migrating the preview to
`compileScene` is 2-3 days and needs DOM-layer video elements mapped onto scene
layers, so it is a real project, not a cleanup.
Owner: next engineering slot. Correct the comment immediately; schedule the
migration alongside D7, since both touch the same preview render path.

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
  had `title` only, which screen readers do not announce (part of D14).
- The preview progress bar is a real `role="slider"`: focusable, with
  `aria-valuetext` in timecode, arrow-key seeking (shift for 5s) and Home/End.
  The hit area grew vertically only — `handleSeek` reads `currentTarget`'s
  bounding rect, so widening the element would have broken the click-to-time
  mapping. Its key handler stops propagation, because `App.tsx` binds the same
  arrows globally and both would otherwise fire per keypress (was D14).
- The playback-speed popup now behaves like the menu its trigger already
  advertised via `aria-haspopup`: `menuitemradio` items with `aria-checked`,
  roving `tabIndex`, focus landing on the current speed when it opens,
  ArrowUp/Down/Home/End to cycle, Escape and outside-click to close, and focus
  returned to the trigger (was D14).
- Both were verified in a real browser rather than assumed. A 13-step scenario
  added a text clip to make `duration` non-zero, then asserted the slider's
  `aria-valuetext` was exactly `00:00.03` after one ArrowRight at 30fps — one
  frame, not two, which is what disproves the double-seek — and that Escape
  detaches the menu and resets `aria-expanded`. Zero page errors. Not verified:
  that focus actually returns to the trigger (the tooling asserts DOM state, not
  `document.activeElement`), and screen-reader announcement, which needs a real
  assistive-technology pass rather than an attribute check.
- `PreviewPanel.tsx` (770 lines) split into `Preview/`: `MediaLayers.tsx`,
  `Overlays.tsx`, `Toolbar.tsx`, `useAudioClips.ts`, `useChromaKey.ts`, with the
  transition style table and active-transition query moved to
  `shared/transitions.ts` and the media-clip pose resolver added to `scene.ts` as
  `clipTransformAt`, completing the trio with `textTransformAt` and
  `stickerTransformAt`. The orchestrator is now 370 lines. Purely structural —
  no rendering changed, which is why the two pose defects found on the way were
  filed as D17 instead of fixed inline (part of D13).
- `transitionStyles` and `findActiveTransition` were untested pure functions
  buried in the component. Both now live in `shared/transitions.ts` with 20 tests
  covering the 12 transition types, the window a transition occupies, next-clip
  resolution across tracks, and the missing-clip and missing-media cases.
- A zero-duration transition produced `progress: NaN`, which would have flowed
  into CSS as `opacity: NaN`. Unreachable from the panel's slider (min 0.1) but
  reachable from a hand-edited project file; now pinned to 1 with a test.
- The last `exhaustive-deps` warning in the codebase is gone. `overlayVideoRefs`
  was an array literal rebuilt every render, so it could not be listed as a
  dependency; the three refs are now individually stable and collected with
  `useMemo`. `npm run lint` reports zero warnings for the first time.
