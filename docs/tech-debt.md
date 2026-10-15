# Tech debt register

Every item here was discovered by measurement during hardening work, not by taste.
Format per the delivery standard: description, impact, estimated effort, owner.
An item without an owner does not get fixed; in a single-maintainer repo the owner is
either Julian (product or tooling decisions) or "next engineering slot".

Priorities: P1 blocks a core promise or risks data/security. P2 costs developer
velocity or user trust. P3 is hygiene.

## P1

## P2

### D7 — The six grading fields are stored but rendered nowhere
`exposure`, `highlights`, `shadows`, `temperature`, `tint` and `sharpness` are in
`ClipSchema`, have sliders in `RightPanel`, and are read by nothing. The sliders
are disabled with a hint saying so (`ce098e1`), which is honest but means six
stored fields per clip are dead weight and the panel advertises controls that do
not exist. `colorAdjustFactors` reads only brightness, contrast and saturation.

Implementing them needs a shared module in the `color-adjust.ts` mould — one
parameter set, two backends — but neither backend can express these six with what
is already in use. CSS and `ctx.filter` have no white balance, no split
highlight/shadow curves and no sharpening, so the preview and compositor sides
need SVG filters (`feColorMatrix`, `feComponentTransfer`, `feConvolveMatrix`) or
pixel work; the ffmpeg side needs `colortemperature`/`colorbalance`, `curves` and
`unsharp`. Keeping three expressions of one parameter set in parity is the actual
cost, not any one of them.
Impact: six dead fields, a panel that promises controls it does not have.
Effort: 2-3 days. Not worth starting without deciding the parameter semantics
first, since "highlights" and "shadows" have no single standard meaning.
Owner: **Julian** for what the six sliders should mean; engineering after that.

**Correction to the previous version of this entry.** It also claimed that
`clip.filter` preset strings apply in the preview only. That was true when it was
written and is not true now: `compileScene` folds `clip.filter` into the layer's
filter string and `drawMediaLayer` applies it through `ctx.filter`, and the
compositor is the default export engine (`ExportDialog` initialises `engine` to
`'compositor'`). So all 24 FiltersPanel presets do export. The `filtergraph`
fallback still drops them — `RenderLayer` carries brightness, contrast and
saturation but no filter field — and the UI already warns about exactly that when
the fallback engages. Mapping the CSS presets onto ffmpeg filters for the
fallback is still ~0.5 day of work and still open; it is just much less urgent
than "presets do not export" sounded.

### D15 — The filtergraph engine still hard-cuts where the preview blends
**Narrowed from "transitions are preview-only".** The compositor — the default
engine — now renders all twelve types: `shared/transition-pose.ts` describes a
blend once, the preview maps it to CSS and `drawSceneFrame` maps it to canvas
calls, with a parity test walking every type at five progress values. What
remains is the fallback engine only, and the fallback warning names it.

`render-plan.ts` compiles each clip to an independent trimmed stream and never
pairs adjacent ones, so `xfade` is unused. The assembly is the remaining work,
and it is not uniform across the twelve types:
- Clean `xfade` equivalents exist for fade (`fade`), dissolve (`dissolve`), the
  four wipes and the two slides (`wipeleft`, `slideright`, …).
- `zoom-in` maps to `zoomin`; `zoom-out`, `blur` and `flash` have no equivalent —
  `zoomout` does not exist, `hblur` is a different effect, and a flash to white
  is `fadewhite` only in spirit. Those three need either a scale/overlay
  assembly or an honest per-type fallback to a crossfade, which is a product
  decision as much as a filtergraph one.
- `xfade` also requires the two streams to be the same size, format and frame
  rate, which the current independent-trim graph does not guarantee.
Impact: a user who lands on the fallback gets hard cuts where the preview showed
blends, and is now told so in the warning rather than finding out from the file.
Effort: ~1 day for the eight types with clean equivalents and the stream-pairing
rewrite; the other three are a separate decision.
Owner: next engineering slot; **Julian** for what zoom-out, blur and flash should
degrade to on the fallback.

### D23 — Grain is still preview-only, and the filtergraph engine drops effects and transitions
**Narrowed twice.** The nine CSS-filter effects export through the compositor
(`shared/layer-filter.ts`), and letterbox and vignette now do too: both engines
take their numbers from `shared/overlay-effects.ts`, the compositor drawing bars
and a scaled circular gradient after every layer, the preview writing the same
radii as container-query units and the same stops into its CSS gradient. What is
left:
- **Film grain.** Animated noise with an `overlay` blend mode. A deterministic
  frame pump cannot reproduce it without a seeded per-frame noise source, and an
  unseeded one would make two exports of the same project differ. Preview-only by
  nature, not by omission.
- **The `filtergraph` engine drops all of it** - effects, letterbox and vignette
  included: `RenderLayer` carries brightness, contrast and saturation but no
  filter field and no overlay-effect list. The fallback warning names it.
Chroma key is gone from this entry: both engines now key through
`shared/chroma-key.ts`, recorded under "Resolved".
Impact: user-visible and silent for grain; the filtergraph gap at least announces
itself in the fallback warning.
Effort: grain needs a seeded noise tile per frame and a decision on whether two
exports of one project must be byte-identical (they should). Mapping the nine CSS
filters plus the two overlay effects onto ffmpeg filters for the fallback is
about a day and independent of the rest; it overlaps D15's remaining half, since
both are "the filtergraph engine learns what the compositor now knows".
Owner: unowned. The filtergraph mapping is still the piece worth taking first.

### D25 — Pitch shift is stored, has a live-looking slider, and is rendered nowhere
`AudioClipSchema` carries `pitch` (-12..12 semitones) and `AudioInspector` had an
enabled slider for it. Nothing reads the field: `useAudioClips` never touches it,
and `render-plan.ts` emits `atempo` only for `speed` — there is no `asetrate`, no
`rubberband`, nothing. So the slider moved a number and changed no sound in
either the preview or the export. Found while scoping the markers feature, by
grepping the field rather than by a user report; it had the same shape as D7 but
worse, because D7's sliders at least say they are disabled.

The slider is now disabled with a hint saying exactly that, matching D7's
treatment. Implementing it is a real two-backend job, not a wiring job: export
needs `asetrate=sr*2^(p/12),aresample=sr,atempo=2^(-p/12)` (the `atempoChain`
helper already exists for the speed side, and `atempo` is limited to 0.5-2 per
instance so a 12-semitone shift needs chaining), and the preview cannot use
`playbackRate`, which shifts tempo with pitch — a media element source has no
`detune`, so it needs a Web Audio graph.
Impact: one dead control, now honest about it.
Effort: export ~half a day including the parity test against the preview; preview
another half to a day for the Web Audio path. Do export first only if the preview
can follow in the same change — shipping one side would recreate D22's shape.
Owner: next engineering slot.

### D9 — External tooling commits and pushes without instruction
Seven times now an unidentified tool in this environment created commits and
pushed them, using the local git identity, without being asked. One push raced a
local history rewrite; it happened not to collide.

**The sixth and seventh occurrences date the mechanism.** Reflog timestamps
against commit timestamps: `598743e` committed 11:20:42 and pushed 11:21:53;
`de3d003` pushed 10:56:16, minutes after its commit; `ba128fe` 10:32:03;
`038115f` 09:28:03. The gaps between pushes (09:28 → 10:32 → 10:56 → 11:21) track
when commits were *made*, not a fixed schedule, and each push follows its commit
by about a minute. So something watches the repository and publishes shortly
after HEAD moves. Combined with the fifth occurrence — a push that authored
nothing — the picture is a sync daemon or checkpoint feature that mirrors the
branch, reacting to local commits rather than producing them.
The practical consequence is stronger than "do not push without instruction":
**committing is publishing**, within about a minute, whether or not anyone asks
for a push. Holding commits back locally is not a safeguard and never was; the
only private state is uncommitted working tree.

It has now been narrowed, which is the useful part. **The mechanism is not in
this repository.** There are no git hooks (`.git/hooks` holds only the samples),
`core.hooksPath` is unset, there is no `.husky`, no `lint-staged`, no git
aliases, and `.github/workflows/ci.yml` only checks out and runs gates — it has
no commit or push step. Whatever does this runs client-side: an editor or agent
feature using the machine's git identity.

The evidence that it is generated rather than written: commit `347159f` is
titled "feat: add PreviewControls component for enhanced playback controls in
the PreviewPanel" and its diff is two pure renames with 0 insertions and 0
deletions. No one describes a file move that way; a tool that saw two unfamiliar
paths did.

Impact: process risk — unreviewed or half-finished states become public history,
with commit messages that misdescribe the change. This is the only item in the
register that cannot be fixed from inside the codebase, and the dating above
makes it the sharpest one: a commit is a publication with about a minute of
privacy, so "I have not pushed it" no longer means anything anyone can rely on.
Effort: unknown until the tool is identified. Check editor/agent auto-commit,
checkpointing or branch-sync settings; `git reflog show origin/main` timestamps
against `git log --format='%h %ad %s' --date=iso` will show which pushes do not
correspond to a session that asked for one.
Owner: **Julian** — this is your environment, not the codebase.

### D10 — Packaging works, but nothing it produces is distributable
The pipeline itself is done and verified end to end — see "Resolved" for what was
fixed and what a build produces. What is left is the part that cannot be done
from inside the codebase:

- **No code signing.** `electron-builder` reports `0 identities found` and skips
  signing, so the `.dmg` it produces is unsigned. macOS Gatekeeper refuses to
  launch an unsigned, un-notarized app on any machine other than the one that
  built it, and even there the user gets a quarantine warning. This needs a
  Developer ID Application certificate — an Apple Developer account, not a
  config change.
- **No notarization.** Requires `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and
  `APPLE_TEAM_ID`, and depends on signing existing first.
- **No application icon.** There is no `build/icon.icns`, so the packaged app
  wears the default Electron icon. `directories.buildResources` already points at
  `build/`, so dropping icons in needs no config change — but designing one is
  not an engineering task.
- **`version` is still `0.0.0`**, so artifacts are named `CapJul-0.0.0-arm64.dmg`
  and `latest-mac.yml` cannot express an upgrade. Bumping it is a release
  decision.

Impact: delivery. A build can be produced on this machine and run on this
machine, which is further than before, but it still cannot reach a user.
Effort: signing and notarization are under an hour of configuration once the
certificate and Apple credentials exist; the icon is a design task; the version
bump is a decision.
Owner: **Julian** — every remaining item needs an account, a credential or a
design, none of which is in the repo.

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
now. Five files remain over the threshold:

| File | Lines |
|---|---|
| `src/store/editorStore.ts` | 470 |
| `src/components/ExportDialog.tsx` | 438 |
| `src/shared/render-plan.ts` | 429 |
| `src/components/Preview/index.tsx` | 395 |
| `electron/main.ts` | 354 |

The four worst offenders are done, and all four are recorded under "Resolved"
with what they were split into. `PreviewPanel.tsx` went 770 → 371,
`Timeline/index.tsx` went 728 → 197, `RightPanel.tsx` went 657 → 82 and
`ClipItems.tsx` went 325 → 271.

`render-plan.ts` grew from 417 to 429 as part of the easing work and is not new
debt; it is one coherent job — turning a project into an ffmpeg filtergraph.

`Preview/index.tsx` stopped short of 300 deliberately: what remains is store
wiring, refs, the video sync effects, the playback loop and the drag handler, and
splitting those further would scatter playback logic rather than clarify it. It
has since grown 371 → 395 from the D16 work, which added the shared paint list and
the single ordered render pass that replaced four fixed layer groups. The render
pass is longer but has one job; the layer filter moved out to a module-level
`layerFilter` helper.

What is left is different in kind from what was fixed. `editorStore` is long
because it is the single choke point for every mutation — length there is
concentration, not tangle, and splitting it would work against the property that
makes `mutate()` safe. `ExportDialog` is one dialog with two engine paths and a
progress state machine; its size is the state machine, and the honest split would
have to come from the export pipeline growing a third engine rather than from
moving JSX around. `electron/main.ts` is IPC registration, which is flat by
nature.
Impact: maintainability. None of the five is broken, and none has the property
that made `RightPanel` worth splitting — four near-duplicate blocks edited in
lockstep, where a change applied to three of four is invisible.
Effort: `editorStore` is arguably not worth splitting at all. The other four
would each be about half a day and would mostly move lines rather than reduce
coupling.
Owner: next engineering slot, and only when one of them needs changing anyway.

### D21 — The filtergraph engine rounds keyframe coefficients to 4 decimals
`volumeExpression` in `render-plan.ts` passes every coefficient it emits through
`round4`, while `interpolate` — used by the preview and the canvas compositor —
works at full precision. A linear volume ramp therefore disagrees between the two
engines by up to about 1.5e-4 over a three-second segment.

Found by the numeric parity test added with keyframe easing, which evaluates the
emitted ffmpeg expression and compares it to `interpolate()` sample by sample.
The test asserts agreement to 5e-4 and documents why it cannot be tighter.
Impact: none in practice. It is four orders of magnitude below an audible
difference, and it only affects the `filtergraph` engine — the default
`compositor` engine draws from `interpolate` directly and is exact.
Effort: ~1 hour to drop `round4` from the coefficients, but it changes the
emitted filtergraph text for every existing project, so the 28 `render-plan`
string assertions would need updating and the output should be listened to
before and after. Not worth doing on its own.
Owner: unowned until it measures audible.

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
- Image clips now honour position, scale, rotation and keyframes in the preview
  (was D17). `BaseMediaLayer` resolves one pose through `clipTransformAt` above
  the media-kind branch and both video and image consume it, which is what
  `drawMediaLayer` already did on the export side. `IncomingMediaLayer` resolves
  the arriving clip's keyframes the same way instead of reading its static pose.
- `parity.test.ts` grew a "media layer pose parity" block pinning the invariant
  D17 had broken: `compileScene` gives image and video layers the same transform
  and keyframes, and the preview's `clipTransformAt` returns exactly the pose the
  compositor's `transformAt` computes, for both kinds, with and without
  keyframes. Ordering D18 was found while writing these and is filed separately
  because the pose numbers are identical either way — no test on them can see it.
- Verified after the change: 181 tests, zero lint warnings, and a 9-check browser
  run confirming the no-media placeholder still takes `BaseMediaLayer`'s early
  return (no broken `media://` element), text overlay rendering and mousedown
  selection still work, grid and zoom still apply, playback still advances and
  freezes, and zero page errors across the whole run. What was **not** verified
  at runtime is an actual image clip on canvas: creating one needs a media import
  through `electronAPI`, which does not exist in a browser tab. The repo has no
  DOM test environment either (`vitest.config.ts` sets `environment: 'node'`,
  though its `include` already covers `*.test.tsx`), so the image render path is
  covered by the parity tests and by both branches now consuming one
  `combinedStyle` object — not by an observed frame.
- Media layers now apply rotation and scale in the same order as the export
  (was D18). The preview emitted `translate() scale() rotate()` — T·S·R, because
  a CSS list composes left to right — while `drawMediaLayer` calls
  `ctx.translate`, `ctx.rotate`, `ctx.scale`, which is T·R·S. Rotation and
  non-uniform scale do not commute, so the two disagreed whenever
  `scaleX !== scaleY` and `rotation !== 0`, and agreed exactly under a uniform
  scale, which is why it survived. The conversion moved to `scene.ts` as
  `poseTransformCss` with the order named as `POSE_TRANSFORM_ORDER`, and
  `drawMediaLayer` carries a comment pointing back at it.
- Exports are unchanged by that fix; only the preview moved, and it moved toward
  the output. Projects using a non-uniform scale with a rotation look different
  on screen now — different meaning correct.
- The D18 test was verified by planting the bug back and watching it fail, the
  same method used for D3. With the old order restored, two of the five new order
  tests failed — the composed matrix diverged by 0.5, not by float noise — while
  all six "media layer pose parity" tests still passed. That is the point of the
  exercise: `clipTransformAt` returns the same six numbers in either order, so no
  test that compares poses can see this. The new tests parse the emitted CSS,
  compose both sides into 3x3 matrices, and compare, with two further cases
  pinning *why* it hid: uniform scale and zero rotation both make the wrong order
  produce the right matrix.
- Smoke-checked in a browser after moving the function into `scene.ts`, since the
  risk there is module loading rather than rendering: 544 DOM nodes, placeholder
  and transport controls mounted, zero page errors. The order change itself is not
  observable without a media clip, which needs `electronAPI` to import.
- **P1 while open: clips could only be dragged right and only be made longer.**
  `xToTime` clamped with `Math.max(0, ...)`, which is correct for an absolute
  ruler position and wrong for a pixel *delta* — and all seven drag and resize
  handlers fed it a delta. Every negative delta became zero, so moving a clip
  earlier, trimming a clip shorter, and extending a clip's head by dragging its
  left edge leftward all did nothing at all. Splitting, duplication, deletion and
  the right-hand and bottom directions worked, which is why it did not look
  broken from a distance.
  Found by probing the running app, not by reading: a script added a text clip,
  dragged it 160px right (moved), then 80px left twice (did not move), then
  exercised both resize handles in both directions. Four of six gestures were
  dead. Reading `xToTime` alone does not reveal this, because the clamp is
  correct at two of its three call sites.
  Fixed by adding an unclamped `dxToTime` for deltas and leaving `xToTime` for
  the ruler click, marquee bounds and media drop position, which really are
  absolute. Re-probed afterwards: all six gestures move, and leftward drags now
  land where they should.
  Fixing it exposed one new risk, handled in the same change: a negative delta
  can now push `mediaStart` below zero, which is not merely past the end of the
  source but an invalid `ffmpeg -ss`. Both left-resize paths floor it at 0.
- `snapTime` moved to `src/shared/timeline-snap.ts` with 11 tests. It had been
  untested pure logic living inside the component. The tests pin the 8px
  threshold at a given zoom, the candidate order that breaks ties, `excludeId`,
  and that audio and text clips are snap targets while **sticker clips are not** —
  an omission the old code made silently, now recorded as D19 so that adding
  stickers fails a test instead of happening by accident.
- `Timeline/index.tsx` went 728 → 197 lines (part of D13). Out came
  `TrackRow.tsx` (one track lane: grid, its clips, transition markers),
  `Ruler.tsx` (ticks, labels, playhead marker), `TimelineToolbar.tsx` (add track,
  split, delete, zoom), `useClipContextMenu.tsx` (the right-click menu and the
  copy/paste clipboard it feeds) and `useMarqueeSelection.ts` (rubber-band
  selection). What is left in the orchestrator is layout, scroll and drop
  handling.
- The seven near-identical mouse handlers in `Timeline` — four for moving a clip
  and three for trimming one — collapsed into `startClipMove` and `startClipTrim`
  in `Timeline/clip-interaction.ts`, with the arithmetic behind them moved to
  `shared/clip-drag.ts` as pure functions and 17 tests. Two of the three trimming
  handlers had been mathematically identical, which is how the clamped-delta bug
  above survived in more than one copy; there is now one copy and it is tested.
  Those tests assert the negative direction explicitly, so the bug cannot return
  quietly.
- Menu actions and marquee release now read the store with `getState()` at the
  moment they fire rather than capturing it when the menu opened or the drag
  started. A clip menu left open while the playhead moves used to split at the
  stale time.
- Verified after the split with a 13-check browser run: toolbar disabled state,
  drag right and left, trim from both handles in both directions, context menu
  opening with all five entries in order, Duplikat adding a clip and dismissing
  the menu, marquee selecting and clearing its box, and zero page errors
  throughout.
- The keyframe diamond in `RightPanel` lit up whenever a property had a keyframe
  *anywhere*, while its title said "Hapus keyframe" — but a click with the
  playhead between keyframes adds one instead of removing anything. It now fills
  only when a keyframe is actually at the playhead, and shows an amber outline
  without a fill when the property is animated elsewhere, so the two states are
  distinguishable instead of conflated. Its accessible label names the property,
  which it did not before: all fourteen diamonds announced identically.
- Keyframe easing shipped (schema v4) with the curve vocabulary in
  `shared/keyframe-easing.ts` rather than in `project-schema.ts`. That placement
  is deliberate and load-bearing: `project-schema` imports zod, and a renderer
  component importing the easing list from there pulled the whole validator into
  the client bundle — measured at +26 KB gzipped, 127 → 153 KB, before it was
  moved back out. `keyframe-easing.ts` imports nothing for that reason. If this
  is ever "tidied" by moving the list next to the schema, check the bundle size
  afterwards.
- Every dead button is gone (was D5). The decision on all seven was **cut**, not
  keep, on one principle: a control that does nothing is a promise the app
  cannot keep, and the honest cheap fix is to stop making it. Recoverable from
  git if any turns out to have been wanted.
  - `TopBar` **Templates** — cut. The left rail already has a working Templates
    tab with real `applyTemplate` handlers, so this was a second, dead way to
    reach the same thing.
  - `TopBar` **Layers** — cut. No layers panel exists, and the track stack is
    already visible in the timeline. Building one is a feature, not a wiring job.
  - `TopBar` **Share** — cut. There is no sharing infrastructure; Export is the
    delivery path and sits right next to it.
  - `AudioPanel` **Moods**, **Recommended** and **Sound Effects** — all cut, and
    the now-empty `effects` sub-tab with them. These were the worst offenders:
    hardcoded `Music Track 1..4` at `Upbeat · 2:30` and a fixed `SOUND_EFFECTS`
    array that rendered like a populated library rather than like a placeholder.
    What is left in the panel is Import Audio and voiceover recording, both of
    which work. A real music/SFX library is a feature that needs asset sourcing
    and licensing first.
  - **AI Tools** tab and `AIPanel.tsx` — cut entirely, including the `'ai'`
    member of `LeftPanelTab`. Every item in it was inert. A "Beta" badge does not
    make zero functionality honest, and it was the largest single promise in the
    UI. If AI features are wanted, they should arrive as a feature, not as a
    menu that was already there.
  Verified in a browser afterwards: the top bar has eleven buttons and all of
  them do something, the left rail has eight tabs, the Audio panel has two
  sub-tabs and no mock content, the Templates panel still renders and still
  works, and zero page errors. A scan for `<button>` elements with no handler
  now returns none anywhere in `src/`. Bundle fell to 125 KB gzipped.
- Sticker clips are snap targets when dragging (was D19). They were the one kind
  left out, so stickers neither snapped to each other nor offered their edges to
  anything else. The test that pinned the omission was inverted rather than
  deleted, so it now pins the fix.
- Packaging has scripts and produces a working artifact (was most of D10). Added
  `pack`, `dist`, `dist:mac`, `dist:win`, `dist:linux` and `dist:mac:unsigned`,
  each running `npm run build` first because packaging reads `dist/` and
  `dist-electron/`. Also added the `description` and `author` fields
  electron-builder wants, and `linux.category` for AppImage.
- **The builder's output directory was `dist/`, which is also its input.**
  electron-builder defaults `directories.output` to `dist` and cleans it before
  writing, while `build.files` said to package `dist/**/*` — so a build would
  have deleted the thing it was packaging. Output now goes to `release/`, which
  is gitignored. This had never been hit because no script invoked the builder.
- All eight runtime dependencies moved to `devDependencies`, because none of them
  is needed at runtime: Vite bundles the renderer into `dist/assets/` and the
  main process into `dist-electron/main.js`, and that bundle's only imports are
  `electron` and seven `node:` builtins — verified by listing every import
  specifier, not assumed. ffmpeg and ffprobe are spawned from `PATH`, not
  resolved through a package. electron-builder still copies production
  dependencies into the asar regardless of `build.files`, which is how 5,932
  files and 42 MB of dead weight got in; `lucide-react` alone is 45 MB unpacked.
  `app.asar` went 43 MB → 596 KB and the app bundle 342 MB → 289 MB, the
  remainder being Electron itself. The README now says plainly that a dependency
  the main process needs at *runtime* has to go back into `dependencies`, or the
  packaged app breaks in a way development never shows.
- Verified by building and running the real thing rather than by reading config:
  `dist:mac` produced `CapJul-0.0.0-arm64.dmg` (122 MB), `hdiutil verify`
  reported the checksum valid, the volume mounted with the standard
  drag-to-install layout, and `latest-mac.yml` carried a correct version, sha512
  and size. Then the packaged app was launched with a debugging port and
  inspected from inside: 511 DOM nodes so React mounted, `window.electronAPI`
  present as an object (the preload bridge working — it has been broken before),
  eight sidebar tabs with AI Tools correctly absent, the transport slider there,
  and zero page errors. `Info.plist` carries `com.capjul.editor` and `CapJul`.
- The timeline ruler is a real slider (was D20). `role="slider"` with
  `aria-valuetext` in timecode, focusable, arrow keys to step (shift for five
  seconds) and Home/End. It stops propagation for the same reason the preview
  scrubber does: `App.tsx` binds the same arrows globally, so without it one
  keypress would seek twice. There are now two `role="slider"` elements in the
  app, distinguished by `aria-label` — "Timeline position" and "Seek".
- **Stepping the playhead no longer drifts.** Found by the browser check above
  rather than by reading: after thirty ArrowRight presses at 30fps the ruler read
  `0:00`, not `0:01`. The playhead was at `0.9999999999999999` — 1.11e-16 short
  of a second, because every step did `currentTime + 1/fps` and the errors
  accumulated. The timecode truncates, which is correct for a timecode, so the
  deficit showed up as a whole missing second.
  `shared/frame-time.ts` now steps in whole frames via
  `Math.round(t * fps) + frames`, and `App.tsx`'s arrow, J/L and comma/period
  handlers use it too, so all three seek surfaces share one stepping rule and
  always land on the frame grid. Seven tests, including that 3,000 steps forward
  and back return exactly to zero and that 23.976fps — where naive accumulation
  drifts worst — stays exact.
  One deliberate behaviour change: stepping from a time that came from a
  click-seek now snaps to the nearest frame first. For a frame-based editor that
  is the correct behaviour, but it is a change.
- `RightPanel.tsx` went 657 → 82 lines (part of D13). The register recorded it as
  571; it had grown to 657 with the easing UI, which is itself the argument for
  splitting it — the file was four inspector panels in one, and every new
  keyframed property had to be added to all four blocks in lockstep. Out came
  `controls.tsx` (`Section`, `Toggle`, `KfBtn`, `KfControl`, `Slider`,
  `EASING_LABELS`), one file per clip kind (`ClipInspector`, `TextInspector`,
  `AudioInspector`, `StickerInspector`) and `constants.ts`. Each inspector reads
  the store itself, so callers pass only the clip; what is left in `index.tsx` is
  selection resolution, the header, the empty state and four independent
  conditionals.
  Two Fast Refresh warnings appeared from the split, because Vite requires a file
  to export only components. `controls.tsx` exporting `SPEED_PRESETS` beside
  `Slider` was one; `constants.ts` exists purely to hold it. The other was
  `NOT_RENDERED_HINT`, which moved into `ClipInspector.tsx` as its only consumer
  rather than into `constants.ts` — a constant used in exactly one place belongs
  there.
- `ClipItems.tsx` went 325 → 271 (part of D13), and deliberately stopped there.
  The four clip renderers were *not* split into 30-line files: they are cohesive
  siblings over one shared visual language, and separating them would scatter
  that language across four files for no reduction in coupling. The real seam was
  the media-loading layer, which had nothing to do with rendering clips at all —
  `useThumbnail` and `useWaveform` moved to `useClipPreviews.ts` and
  `WaveformCanvas` to its own file, both because they are separately testable and
  because their presence in a component file was the second Fast Refresh
  violation of the same kind.
- The `RightPanel` move is not a pure refactor and is recorded as such. While
  relocating the controls I added `aria-expanded` to `Section`, `aria-label` to
  `Toggle`, `Slider`, the speed presets and the colour inputs, `<label htmlFor>`
  to the text fields, and `aria-pressed` to bold/italic/underline and the
  animation buttons. None of it changes what a mouse user sees. It is listed here
  rather than buried in the diff because "refactor" commits are read as
  no-behaviour-change commits, and this one adds accessible state that was not
  exposed before.
- Verified after the `RightPanel` split with a 12-check browser run rather than by
  reading: empty state and header on no selection, header switching to "Teks",
  all four text sections rendering, the content textarea holding the clip's text,
  eight font families in the select, a collapsed section reporting
  `aria-expanded="false"`, bold reaching the overlay and reporting pressed, the
  easing selector appearing at the playhead with all four curves offered, and
  zero page errors throughout.
- The preview and the compositor now share one paint order (was D16).
  `shared/paint-order.ts` holds `paintOrder(project)` — every paintable clip with
  its track index, sorted, excluding zero-length clips and clips whose media is
  gone — and `activePaintAt(project, t)`, the half-open windowed version.
  `compileScene` maps that list onto canvas layers; the preview maps it onto DOM
  elements in the same order. Neither derives its own selection or stacking any
  more, and `scene.ts`'s opening comment no longer claims a guarantee the code
  did not provide.
- **The drift was reachable in two clicks, and is now measured rather than
  assumed.** The preview rendered all text and then all stickers, so stickers
  always painted on top. Stacking is a property of the tracks, and
  `TextPanel`/`StickerPanel` create a track on first use by appending, so adding
  a sticker before any text put the sticker track lower — the compositor then
  painted text on top while the preview painted the sticker on top. Verified
  against a `git worktree` at the pre-fix commit: both orders came back
  `["text","sticker"]`, identical regardless of which was added first. After the
  fix the two orders are opposite and each matches its track order. Running the
  baseline is what makes the check non-vacuous; without it a passing test proves
  only that the code did something.
- Four more preview/export divergences fell out of routing overlays through the
  one `MediaLayer` component, all in the same direction — the preview had its own
  idea of what an overlay was:
  - Overlay clips were positioned with `left`/`top`/`width: 40%`/
    `translate(-50%,-50%)`/`aspectRatio: 16/9` and a 2px white border, while the
    compositor draws every layer full-canvas with `objectFit: contain` in
    `POSE_TRANSFORM_ORDER`. The border was never going to appear in an export.
    Overlays now use the base layer's renderer verbatim.
  - Image clips on any track above the first were skipped by the preview
    (`file.type !== 'video'`) and painted by the compositor. They render now.
  - Overlays carried no filter at all, so grading on a picture-in-picture layer
    was invisible in the preview and present in the export. Each layer now
    computes its own through the same `layerFilter` the base uses.
  - Three hardcoded `useRef`s capped overlays at three video elements. They are
    now a map keyed by clip id, registered through a React 19 ref cleanup
    function, so the count is uncapped and stale entries cannot linger.
- **One behaviour change that is not a parity fix.** `OverlayVideos` hid an
  overlay whose track was muted; that hide is gone, because track mute is an
  audio concept everywhere else it is read (`useAudioClips`, the timeline's
  speaker icon) and because no export engine honoured it — so the preview was
  hiding a layer that the export would paint. Track mute still does nothing on
  export, which is a real bug and is filed as D24 rather than fixed here, since
  fixing it needs a semantics decision first.
- 22 new tests, including a suite that walks ten project shapes at ten timestamps
  and asserts `activePaintAt` and `compileScene` return the same sequence of
  layer kinds. That assertion is the point of the whole change: before it, the
  two sides could disagree about what is on screen with nothing failing.
- **The four overlay divergences above were committed as "not browser-verified",
  and that caveat was wrong.** The entry claimed `media://` not resolving in a
  plain browser made them uncheckable without Electron. It does not: the elements
  carry their styles whether or not the media loads, and the technique recorded
  under D22 below — importing the app's own modules over Vite's dev URL to get a
  handle on the real store — supplies the project without a file dialog. Re-run
  properly, with the expected transform computed in-page by the same
  `poseTransformCss`/`clipTransformAt` the compositor uses rather than restated in
  the test: **15/15 on the fixed tree, 3/15 against a `git worktree` at the
  pre-D16 commit.** The two baseline passes are the controls — the base layer's
  transform, which did not change, and the graded overlay merely existing.
- **Measuring found a worse version of the geometry bug than reading had.** The
  old overlay transform was `translate(-50%, -50%) rotate(15deg)` — it carried no
  scale term at all. `scaleX` survived only by being folded into
  `width: ${scaleX * 40}%`, and `scaleY` was dropped completely, the height
  coming from `height: auto` with `aspectRatio: 16/9`. So a non-uniform scale on
  any clip above the first track was not merely mis-sized in the preview, it was
  unrepresentable there, while the export applied both axes. The fixed overlay
  now reports `translate(20%, -10%) rotate(15deg) scale(1.5, 0.8)` for the same
  clip, byte-identical to the shared formula's output. The old path also set
  `zIndex: 3/4/5` explicitly, which is what made DOM order insufficient on its
  own; grading on an overlay reported an empty filter string.
- **Two instrumentation bugs found on the way, both of which would have produced
  a confidently wrong result.** The canvas selector was
  `[style*="aspect-ratio"]`, which matches a `MediaPanel` thumbnail as well as the
  preview canvas and picks it first in document order once the project has media;
  that run reported one painted layer and a base transform of `""`, i.e. it
  measured a thumbnail. The prototype spy was installed on the wrong interface,
  described under D22 below. Both scripts now assert that their instrument
  installed and that the element under test is the one intended, and exit non-zero
  rather than reporting a wall of failures. A check that can silently measure the
  wrong thing is worse than no check, because it gets believed.
- Clip speed is honoured in the preview (was D22). Three separate effects — base
  layer, overlays, transition incoming — each hand-wrote
  `currentTime - startTime + mediaStart` and each dropped the speed factor, while
  `mediaTimeAt` multiplied by it. A clip set to 2× played at normal speed on
  screen and exported at double speed. `scene.ts` now has one private
  `sourceTimeAt` formula behind two typed entry points, `mediaTimeAt` for compiled
  layers and `clipMediaTimeAt` for raw clips, and all three effects call it. Both
  apply the same `|| 1` guard `compileScene` uses, so a degenerate speed of 0
  resolves identically on the two sides rather than dividing the preview from the
  export in a new way. Each effect also sets `playbackRate`, without which the
  element plays at its natural rate and gets dragged forward by the next seek
  correction.
- **One thing deliberately not fixed alongside it.** `playbackRate` is the clip's
  own speed and is *not* multiplied by the transport's `playbackSpeed`, even
  though the physically correct rate is the product. `useAudioClips` sets audio
  elements to `clip.speed` alone, so scaling video by the transport as well would
  desync audio from video whenever the transport is not at 1×. Transport speed
  therefore still works by seek correction, exactly as before. Making both sides
  rate-correct under transport speed is a separate change with its own A/V risk.
- **D22's own effort estimate was wrong, and the correction is worth keeping.**
  It claimed the fix "needs a real media file to verify, so it cannot be checked
  in a plain browser." It can. Vite's dev server serves source modules by URL, so
  `await import('/src/store/editorStore.ts')` from the page returns the *same
  module instance* the UI rendered from, and `useEditorStore.getState()` is then
  a full handle on the real store — no dialog, no file, no UI clicking. Combined
  with a setter spy on `HTMLMediaElement.prototype.currentTime`, the value a sync
  effect assigns is observable even though `media://` never resolves and the
  element has no media. 16 checks: five speeds on the base layer including a trim
  offset, two on an overlay, and the playback rate for each. Against a
  `git worktree` at the pre-fix commit the same run scored 3/16 — speed 2 at t=2
  sought to 2 instead of 4, speed 4 at t=1.5 sought to 1.5 instead of 6, one case
  did not seek at all because the wrong value happened to equal the element's
  existing `currentTime`, and `playbackRate` was never assigned. The two speed-1
  controls passed in both runs, which is the evidence that ordinary playback did
  not move.
  The technique is now the default for preview questions that look like they need
  Electron. One trap found the hard way: the first spy was installed on
  `HTMLVideoElement.prototype`, where neither `currentTime` nor `playbackRate`
  lives, so every case returned `null` — indistinguishable from a fix that does
  nothing. Any spy like this needs an explicit "did the spy install" assertion,
  or a broken instrument reads as a broken feature.
- Timeline markers shipped (schema v5). `M` toggles a marker on the playhead's
  frame, `[` and `]` jump to the previous and next one, dragged clips snap to
  them, and the ruler paints a flag per marker with a hover/focus delete button.
  The toolbar carries the same toggle plus a clear-all that shows the count and
  disappears with the last marker. Markers go through `mutate()`, so undo and
  autosave cover them for free, and they are stored sorted by time whatever order
  they arrive in.
  Four decisions are recorded because each is the kind that gets "tidied" later:
  - **No label field.** A label with no rename affordance would be a stored value
    nothing can set — the exact shape of D7 and D25. If labels are wanted, the
    rename UI ships in the same change.
  - **The flags are a sibling layer of the ruler, not children of it.** The ruler
    is `role="slider"`, which must not contain focusable descendants, and a
    marker's delete button is one. The layer is `pointer-events: none` except for
    the buttons, so the ruler's click-to-seek still owns the whole strip.
  - **One binding both adds and removes**, with "on the playhead" meaning the same
    frame. Undoing a marker must not require aiming at a 7px flag.
  - **Markers sort last among snap candidates**, appended rather than inserted, so
    the tie-break order that clips and stickers already rely on cannot change.
    The test for it uses exact binary fractions for the same reason the sticker
    one does.
  Markers deliberately never reach the export; the schema comment says so, so a
  future reader does not have to discover it by exporting.
  36 new tests: 20 on the pure toggle/neighbour/tolerance logic, 5 on snapping,
  6 on `formatTimecode`, 5 on the v4→v5 migration including that a hand-edited
  non-array becomes an empty list while a malformed entry is still rejected.
  Verified with 23 browser checks driven by real CDP key events, not by calling
  the handler: toggle on and off, flag positions at `time * pxPerSec`, toolbar
  label and `aria-pressed` flipping, `[`/`]` stepping without re-selecting and
  without wrapping at the ends, per-marker delete, undo restoring it, and clear
  removing the clear button itself.
- `formatTimecode` lives in `shared/frame-time.ts`, not in the component that
  paints the flags. Two reasons: a component file may only export components or
  Fast Refresh warns, and deriving minutes, seconds and frames all from the frame
  index keeps the readout on the grid `stepFrames` walks — the frame field cannot
  round up to the frame rate at a second boundary, which a `t % 1` computation can.
- **A screenshot caught a layout bug every DOM assertion had passed over.** The
  playhead line drawn across the tracks was positioned against the page, not the
  timeline: it ran from the top bar, through the preview, to the bottom of the
  window. The scroll-content div had no `position: relative`, so the line's
  containing block was the initial one. The marquee box shared the bug, and the
  proof that `relative` is the fix rather than a workaround is that
  `useMarqueeSelection` already adds `labelWidth` and `rulerHeight` back into its
  rect — coordinate math written for exactly the container that was missing. One
  word in one style object; before and after screenshots are the evidence.
  It survived this long because every earlier timeline verification asserted
  behaviour — drag, trim, marquee select and clear — and none of them looked at
  where an overlay was painted. A marquee that appears 140px from the cursor still
  selects the right clips, so a behaviour-only check calls it passing.
- A marker on the playhead's exact frame is visually subsumed by the playhead
  head, which carries `z-20` inside the ruler. That is intended and commented at
  the marker layer: the playhead is the primary cursor and must never be covered,
  and the marker is not lost — the toolbar flips to "Hapus Marker" and `[` `]`
  still land on it. Raising the marker layer above `z-20` would trade a hidden
  marker for a hidden playhead.
- The `Pitch Shift` slider in `AudioInspector` is disabled with an honest hint
  rather than left live, because the field it wrote is read by nothing in either
  engine. Filed as D25 with the two-backend cost spelled out; this is D7's
  treatment applied before a user could be misled by it, not after.
- Track mute is honoured everywhere (was D24). `shared/track-audio.ts` holds the
  one predicate: `compileAudio` drops a muted video clip's audio entry entirely
  and zeroes a muted audio clip's volume, which covers both export engines at
  once because both build their audio graph from `compileProject`, and the
  preview passes master-mute-or-track-mute into every `MediaLayer`. The semantics
  decision the item was waiting on was made rather than escalated — mute
  silences, never hides, because hiding is what a track visibility control would
  do and the timeline has none — and the reasoning is in the commit.
- The keyboard surface has a single source of truth and a reference (new
  feature). 27 bindings across four features were documented nowhere; `?` or the
  top bar button now opens a modal listing them, grouped. `shared/shortcuts.ts`
  carries each binding's matcher and label; `App.tsx` dispatches through
  `findShortcut` and a switch whose cases are exhaustive over the literal id
  union, so a table row with no handler is a compile error, and the overlay
  renders the same array, so it cannot document a binding that does not exist.
  The handler refactor preserved behaviour quirks deliberately: the old chain did
  not guard most plain keys on the modifier, so `⌘K` paused and still does, and
  `⌘M` stays unbound because macOS gives it to window minimise.
  34 browser checks dispatch real key events for every binding — the regression
  suite the if/else chain never had, and the thing that makes the refactor safe
  rather than assumed. The modal traps Tab, takes and returns focus, and swallows
  keys while open.
- **Two harness bugs from that run, recorded because both produced failures that
  looked like app bugs.** The store helper wrapped its argument as
  `return <expression>`, so a semicolon-joined pair of calls silently dropped the
  second: the selection was never set, split correctly refused to split an
  unselected clip, and three checks failed in a cascade. And on macOS a mouse
  click does not focus a button, so "focus returns to the trigger" measured
  platform behaviour until the check focused the button first. The first is the
  more general trap: a test helper that evaluates one expression will eat the
  rest of a statement list without a warning.
- Trims snap, and snapping can be turned off (new feature). Moves snapped to the
  playhead, other clips' edges and markers; trims landed wherever the pointer
  stopped, so the same gesture boundary behaved two ways. Edges now snap through
  the same `snapTime`, and a magnet button in the timeline toolbar turns the whole
  behaviour off, with shift-during-gesture still freeing a single drag as before.
  Snapping is expressed as a *corrected delta* fed to the existing `trimChanges`
  rather than as a second trim implementation: `trimChanges` stays the single
  owner of the minimum duration, the floor at timeline zero and the media window
  moving with the edge, which is where the clamped-delta bug (P1) originally
  lived and the last place a second copy of that logic should exist.
  `snapTime` returns its input unchanged when nothing is in range, so the
  no-snap path returns the original delta exactly; the first version round-
  tripped through time and back and came out 45.000000000000014, which the test
  caught and the early return fixed.
  The magnet is session UI state, not project data: it is not in the schema, not
  saved, not exported, because whether *this editing session* wants snapping is
  not a property of the film. Lucide has no magnet-off glyph, so the off state
  strikes the magnet through — a shape change, since colour alone would leave
  the state invisible to anyone not seeing the colour — and `aria-pressed`
  carries it for assistive tech.
  8 unit tests on the corrected delta, including that a trim cannot snap to the
  other end of the clip being trimmed. 7 browser checks dragging real mouse
  gestures on a real trim handle: snap to a neighbour's edge, snap to the
  playhead, shift frees, magnet off frees, magnet button flips and reports, and a
  far-from-anything trim landing exactly where the pointer stopped.
  The probe's first version missed the snap threshold on every case because it
  grabbed the handle's centre, which sits 4px inside the clip edge, and a trim
  moves the edge by the pointer delta - so every drag landed 0.04s past its aim.
  The app was correct; the gesture math was not. Recorded because the failure
  pattern (uniformly off by the handle's half-width) is what distinguishes a bad
  probe from a bad feature.
- Audio fades are audible in the preview (was D26). `shared/audio-fade.ts` holds
  `audioSpan` — the audible length in timeline seconds, `(mediaEnd - mediaStart) /
  speed`, which is the span the export's `afade` chain times its ramps against —
  and `fadeGain`, the product of the two linear ramps. The product rather than
  the minimum because the export applies `afade` in and `afade` out as filters in
  series, and series filters multiply; where the ramps overlap a clip faded over
  its whole length sits at a quarter at the midpoint, in both engines.
  `render-plan.ts` now takes its span from `audioSpan` instead of recomputing the
  division inline, and `useAudioClips` multiplies the envelope into the volume it
  already writes. 11 tests on the envelope, including that a degenerate speed of
  0 resolves like the render plan's `|| 1` guard and that the fade window shrinks
  with tempo.
- **The export side of fades had no test at all before this change.** Five were
  added against `audioGraphFilters`: no fades means no `afade`, the in-ramp starts
  at the trimmed clip's start, the out-ramp ends at the end of the audible span,
  the span is in output seconds so double tempo moves a 1s fade-out from `st=3`
  to `st=1`, and the fades sit between `volume` and `adelay` in the chain. The
  last one is the ordering the preview's single multiplication assumes.
- Verified with the volume-spy route D26 itself proposed: nine browser checks
  reading what `useAudioClips` assigns to `el.volume` at six points across a
  1s-in/1s-out clip, plus a no-fade control and a keyframed-volume-times-fade
  case. 9/9 on the fixed tree; 4/9 against a `git worktree` at the pre-fix commit,
  where every point inside a fade read 1 — the clip played flat to its ends and
  the fade existed only in the exported file. The two controls passed in both,
  which is the evidence the envelope does not leak into unfaded playback.
  One harness bug worth recording: the first version read each value twice, and
  the second read cleared the log and then sought to a time the store was already
  at, which is not a state change, so React never re-ran the effect. Seven of
  eight checks "passed" on `null`. A spy-based check must read once, and must
  move the playhead off the target before moving it back on.
- The nine CSS-filter effects now export through the compositor (D23 narrowed to
  the three overlay effects, chroma key and the filtergraph engine).
  `shared/layer-filter.ts` composes preset, grading and effects into the one
  string both engines draw with; `compileScene` and the preview's `layerFilter`
  both call it, so the two cannot compose differently again. Canvas `ctx.filter`
  accepts the same function list CSS does, which is the entire mechanism —
  `drawMediaLayer` already assigned `layer.filter` to it. The scene test now
  asserts a layer carrying `blur` reports `sepia(0.4) brightness(1.2) blur(5px)`,
  and seven tests pin the composition order and that the three overlay effects
  contribute an empty string, keeping that remaining gap visible instead of
  silent.
  **Not pixel-verified.** The app-side surface is two facts, both pinned: the
  layer carries the string, and `compositor.ts` assigns it to `ctx.filter`. That
  the canvas then renders `blur(5px)` as a blur is a browser guarantee, not app
  code. Confirming it visually needs a real export, which needs Electron and a
  media file; the parity harness is structural by design and stays that way.
- Transitions render in the compositor, the default export engine (D15 narrowed
  to the filtergraph fallback). `shared/transition-pose.ts` describes a blend once
  — alpha, translation in canvas fractions, uniform scale, blur as a fraction of
  canvas width, inset clip — and the two engines map it: `poseToCss` for the
  preview, canvas calls in `drawMediaLayer` for the export. A parity test walks
  all twelve types at five progress values asserting the CSS inset, blur and
  translate describe the same rectangle, radius and offset the canvas geometry
  does. Two mappings of one pose is exactly where this codebase diverged before
  (D18), so the walk is the point, not the decoration.
- **The export draw path became testable in node, which is what made this
  shippable with evidence.** `drawSceneFrame` and the three per-kind draw helpers
  were closures inside `prepareScene`, over the maps of decoded media it builds,
  and `prepareScene` needs a live DOM — so the code deciding what an exported
  frame contains had no test at all. The helpers are now module-level over an
  injected `SceneSources`, and sixteen tests drive them with a recording canvas
  context: paint order, contain fit, pose order, alpha, filter, save/restore
  balance, and seven transition cases — both clips at halved alpha at the
  midpoint, the incoming clip drawn before its own time range begins, wipes
  clipping to complementary halves, slides offsetting by canvas widths, blur
  reaching `ctx.filter` at canvas scale, and a hard cut outside the window.
  Those tests assert the exact call sequence the export pump issues; they are as
  close to the encoded pixels as node gets, and the commit says plainly that they
  are not the pixels.
- Two supporting changes the blend required. The `Scene` carries its transitions
  and media layers carry their clip id, because a blend addresses its two ends
  and two clips routinely share one media file. And `seekActiveVideos` now seeks
  the incoming clip during the first half of the window, when it is not yet
  inside its own time range — without that the blend would have shown whatever
  frame the element last held, a bug no amount of draw-order correctness would
  have hidden.
- **The preview's transition behaviour changed in two ways, both fixes.** A pose
  now composes with the clip's own pose and grading instead of replacing them:
  the old style object was spread over the top, so a clip lost its position,
  rotation, scale and filter for the length of its own transition — verified in
  the browser by a rotated clip keeping `rotate(90deg)` mid-slide. And blur is
  resolution-relative (`cqw` in the preview, fraction times canvas width on the
  canvas) rather than a fixed 16px, so a 4K export blurs proportionally; at a
  1280-wide canvas it is exactly the old value.
- The filtergraph fallback warning now names what it drops — transitions, clip
  effects, preset filters — instead of the older "per-clip filters may differ
  slightly", which understated it before and would have badly understated it now.
- Verified in the browser with nine checks reading the preview DOM mid-blend:
  opacities at the window's start, middle and end; no incoming element outside
  the window; complementary wipe insets; the slide's transform wrapping outside
  the clip pose in canvas order. 9/9, on top of the 16 mock-context and 19 pose
  tests.
- Tracks can be restacked from the track head (new feature). `moveTrack` swaps a
  track with its neighbour through `mutate()`, so it is undoable like every other
  project change, and the guard against moving past either end sits *outside*
  `mutate()` — returning an unchanged project from inside it would spend an undo
  step on nothing, the same trap `splitAtPlayhead` guards. The buttons speak in
  stacking terms (bring forward / send backward, `BringToFront` / `SendToBack`
  icons) rather than list terms, because in this timeline a lower row paints on
  top: array order is creation order and `paintOrder` paints index 0 first.
  Up/down chevrons would have promised the opposite of what they do.
  **Considered and deliberately not changed:** that convention is inverted
  relative to Premiere and CapCut, where the top row is the front layer. Fixing
  it is not a one-line reverse of the rendered list — the array is creation
  order, so a naive reverse puts the audio track above the video tracks — and
  every drop target, marquee offset and existing project's mental model moves
  with it. It is a product decision, recorded here so it is not rediscovered as
  a bug, and restacking at least gives users a way to arrange the stack they
  have. If it is ever taken on, `paintOrder` is the single place the change
  lands, which is what makes it conceivable at all.
  Restacking is observable without media and is verified that way: two text
  clips on two text tracks, and the paint order of the preview canvas read back
  from the DOM before and after each click, plus the row order in the store and
  the disabled state at both ends of the stack. Six store tests cover the swap,
  the clamps, the unknown id, the single undo step, and — the one that ties it to
  the rest of the editor — that `paintOrder`'s output follows the restack, which
  is only assertable because D16 made paint order a function of track index.
- `⌘A` selects every clip of every kind and `Escape` clears the selection, both
  added to the shortcut table and therefore to the overlay, which now lists 29
  rows. While adding buttons to the track head, `TinyBtn` gained `title`,
  `aria-label` and `disabled`; the mute and lock buttons that already used it had
  no accessible names at all, so they are labelled now too. As with the RightPanel
  a11y additions, that is a behaviour change riding in a feature commit and is
  listed here rather than left implicit in the diff.
- Letterbox and vignette export through the compositor (D23 narrowed again).
  `shared/overlay-effects.ts` holds the numbers both engines draw from: the bar
  fraction of canvas height, the vignette's gradient stops, and the ellipse radii
  as fractions - the CSS `farthest-corner` ellipse for a centred box, sqrt(2)/2 of
  each axis, stated once so neither side can drift into its own idea of the
  shape. The compositor paints both after every layer, reading them off the
  bottom media layer's effects exactly as the preview does; the preview writes
  the same radii as container-query units and the same stops into its CSS
  gradient, and a canvas radial gradient being a circle, the compositor scales
  the context by the axis ratio to draw the ellipse the CSS names.
  Grain stays preview-only and the entry says why in one line: it is animated
  noise under a blend mode, and an unseeded per-frame noise source would make two
  exports of the same project differ.
  Five mock-context tests pin the compositor side - bar rects at the shared
  fraction, scaling with intensity, the gradient's radius and both stops, that
  grain changes nothing in the call sequence, and that an overlay clip's effects
  do not bar the frame because these belong to the bottom layer only. Five
  browser checks read the preview's computed gradient and bar heights back and
  parse the numbers out, because Chrome serialises a radial-gradient its own way
  - implicit `ellipse`, no `at center`, four decimals, spaces inside the rgba -
  and substring-matching that serialization measured Chrome, not the app. The
  first attempt did exactly that and failed two checks whose values were correct.
- Detaching a video clip's audio onto its own track (new feature). "Pisahkan
  audio" in the clip menu lifts the audio window - start, duration, media window,
  volume, mute, speed - onto an audio track, reusing one if the project has it
  and creating one if not, and mutes the source clip so the same audio does not
  play from two places. One `mutate()`, so one undo step restores both halves.
  The guard lives in two places with two different jobs: the store action no-ops
  for image clips and unknown ids *outside* `mutate()` so a no-op spends no undo
  step, and the menu row is gated on the media type separately, because
  `kind === 'video'` means "lives in the clips array" and includes image clips.
  The first probe run showed the row on an image clip - a menu entry whose only
  possible behaviour is nothing - and the check failed for exactly the right
  reason.
- The context menu itself was completed while gaining that row. It had no ARIA
  roles, no focus management and no arrow-key navigation: four or five unnamed
  buttons in a fixed div. It is now `role="menu"` with `role="menuitem"` rows,
  focuses its first item on open and returns focus on close, cycles with
  ArrowUp/Down and Home/End, and handles Escape with propagation stopped - which
  also fixes a latent double-action where closing the menu cleared the selection
  through App.tsx's global Escape binding.
- Chroma key exports (D23 narrowed again). The pixel math moved to
  `shared/chroma-key.ts` and both engines call it: the preview hook, and the
  compositor through a new `keyedFrame` source that draws a keyed layer's keyed
  copy rather than its raw frame, so the green is gone before the pose, the
  filter and any blend see it. One scratch canvas per keyed media id, because a
  per-frame canvas allocation would put the garbage collector inside the export
  loop. Alpha is multiplied rather than assigned - identical for opaque video,
  correct for sources that already carry transparency, which the old preview code
  would have flattened. The 441 distance constant stays exactly as it was,
  slightly below the true RGB maximum, because correcting it would silently
  widen every existing key.
  The preview keys a 640px-wide downscale for performance while the export keys
  at full resolution; the two agree on which pixels survive and differ only in
  how finely the soft edge is sampled. The hook's old comment claimed full-
  resolution export parity that did not exist, and now states the trade that does.
- **Headless Chrome's `getImageData` readback is not trustworthy on a canvas that
  was drawn through a transform from a decoded data-URL image.** Found while
  pixel-verifying the above: the readback reported a mid-tolerance column as
  fully keyed - alpha 0 - while the same frame, exported to PNG and looked at,
  was correctly blended. A control canvas drawn without the transform read back
  fine in the same run, and the disagreement was not reproducible across
  identical runs. Pixel assertions in this repo therefore go through an exported
  PNG, and numeric readback is treated as a lead rather than as evidence. Anyone
  adding canvas tests here should know that before trusting a green run.
- Captions burn into both export engines (was D27). The blocker was line breaks,
  not rasterization: `layoutText` splits on explicit newlines only while the
  preview's caption box wrapped in CSS, so exporting captions as they stood would
  have shipped different breaks from the ones the user read - and for subtitles
  the breaks are the content. `shared/caption-layout.ts` now owns one greedy wrap
  with the measuring function injected, one style, and one anchor (box bottom at
  8% of canvas height, computed from the box height *excluding* the rasterizer's
  bleed, which is transparent margin centred on the box and must not move it).
  The compositor and the filtergraph path measure with a real `measureText` in
  the caption face; the preview measures with the same and renders the resulting
  lines under `white-space: pre`, so CSS never wraps again and cannot disagree.
  The Scene carries captions as id, window and raw text; wrapping stays per
  renderer because measuring needs a canvas and `compileScene` is DOM-free, which
  the parity tests and the main process both rely on.
  The compositor rasterizes each caption once in `prepareScene` and draws it above
  every layer and above overlay effects, where `CaptionOverlay` sits in the
  preview DOM. The filtergraph engine gets captions through the overlay-PNG path
  text clips already use, above stickers; its sidecar `.srt` option stays, as a
  delivery mode rather than as the only way captions survive an export.
  Verified three ways: 13 unit tests on the wrap, the anchor and the window; 5
  mock-context tests on the draw; 8 browser checks that the preview's DOM carries
  explicit breaks equal to `wrapLines` against a real `measureText`; and a
  rendered PNG of the export draw path showing the wrapped, anchored caption.
- Optional loudness normalization on the mixed audio, in both engines at once
  (new feature). A checkbox in the export dialog chains
  `loudnorm=I=-14:TP=-1.5:LRA=11` into the `amix` that already ends every audio
  graph, under the same `[aout]` label, so no `-map` anywhere knows the flag
  exists and both engines inherit it from the one function. `amix` already ran
  with `normalize=0`, without which its own level scaling would have fought the
  loudness pass instead of feeding it an honest mix. Single-pass, so dynamic
  rather than sample-accurate; the checkbox says so on its face. The schema field
  defaults to false so older payloads still parse over IPC, and the flag-off mix
  string is asserted byte-identical to what every earlier export produced -
  changing it would retune existing projects behind a checkbox nobody ticked.
- **A new class of verification arrived with it: the emitted ffmpeg command is
  executed.** `electron/render-plan-ffmpeg.test.ts` builds a one-second fixture
  with picture and tone, then runs the exact argument list `buildRenderArgs`
  emits through the real binary - plain and normalized - asserting exit 0 and a
  non-empty output. A filtergraph is text, and text can be wrong in ways no
  string assertion sees: a filter this ffmpeg does not have, an option it no
  longer accepts, a label consumed twice. The test lives under `electron/`
  because it needs node types, which only that tsconfig project carries, and
  `vitest.config.ts` gained one include glob for it; it skips when ffmpeg is
  absent, which is the only environment where the app could not export anyway.
  Any future change to the video or audio graph inherits this check for free,
  which is the point of putting it in now rather than when a bad filter ships.
