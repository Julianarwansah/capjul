# Export pipeline design

Status: Phase 1 complete for everything except transitions and color filters.
Phase 2 has started: the compositor core (`src/shared/scene.ts` + `src/shared/compositor.ts`)
is implemented and pixel-verified for all four layer kinds, but nothing consumes it
yet - the frame pump, IPC transport and rawvideo encoder wiring are the next step.
Until then export still uses the Phase 1 filtergraph.
Milestone 1 (`src/shared/render-plan.ts` wired through `media:export`) plus milestone 2:
text clips and stickers are rasterized in the renderer
(`src/shared/text-rasterizer.ts`, layout math in `src/shared/text-layout.ts`) and
composited as transparent PNG overlays. Stickers are original in-repo vector assets,
which resolves F4 without a third-party licence. Findings below come from two throwaway
prototypes (`docs/prototypes/export-pipeline/`).
Scope: replacing `buildFFmpegArgs` in `electron/main.ts` with a real timeline compositor.

## 1. Problem statement

Export is the product's core promise and currently does not deliver it.
`buildFFmpegArgs` maps each video clip to one `-ss/-to/-i` input and joins them with a
single `concat` filter. Consequences, verified against the code:

- Text clips, sticker clips, audio clips, transitions, filters, speed, volume, opacity
  and transform (x/y/scale/rotation) are all ignored.
- The `format` chosen in the export dialog (mp4/mov/webm) never reaches FFmpeg; codecs
  are always mp4-family.
- Any input without an audio stream makes `[i:a]` in the concat filter fail, so a
  video-only project cannot export at all.
- Progress divides by `project.duration`, which until this batch was a hardcoded 60.

The concat model cannot express a timeline at all: it has no notion of tracks, z-order,
gaps or overlays. This document replaces it.

## 2. Validated findings

All of the following were measured, not assumed. Evidence lives in
`scratch/export-proto/` (filtergraph, rendered frames, rasterized PNGs).

**F1 — The composition model works.** A single filtergraph using
"shift each clip onto the timeline, then overlay onto a background of the full duration"
correctly rendered: sequential clips on one track with source trim (`mediaStart`/
`mediaEnd`) and per-clip speed; a gap between clips showing the background instead of a
frozen frame (`overlay=eof_action=pass`); a second track as a positioned/scaled overlay
that persists across clip switches on the track below; and multi-source audio with
per-clip volume, fade and timeline placement. Output verified by frame extraction at
t=0.5/2.5/3.5/4.5/6.5 and by `ffprobe` (1280x720, 30fps, exact duration).

This model supersedes concat. It handles gaps, overlaps, z-order and multiple tracks
uniformly, which concat structurally cannot.

**F2 — System FFmpeg cannot render text.** The Homebrew build in use (ffmpeg 8.1.1) is
configured without `--enable-libfreetype`, `--enable-libfontconfig` or `--enable-libass`.
`drawtext`, `subtitles` and `ass` are absent. We cannot control which FFmpeg a user has
installed, so any design that depends on FFmpeg text filters is unshippable.

**F3 — The renderer can rasterize text.** Drawing a `TextClip` with the renderer's
canvas API (`fillText` with the clip's font/size/color/shadow at canvas resolution) and
compositing the resulting transparent PNG with `overlay` produced correct output,
verified visually. This is the bridge around F2.

**F4 — Color emoji cannot be rasterized by canvas.** `fillText('⭐')` with
`"Apple Color Emoji"` and with `sans-serif` fallback both measured the glyph (width 120)
but painted **0 opaque pixels**. The SVG `<text>` → `Image` → canvas route also produced
0. Plain text rasterizes fine (2544 opaque pixels in the same probe). Consequence:
sticker clips, which store an emoji string in `src`, are incompatible with *any*
canvas-based render path — including a future full-canvas compositor. This is a product
decision, not an implementation detail: stickers must become image assets, or be
explicitly excluded from export.

**F5 — Preview parity was unmeasurable until now.** Two pre-existing bugs made the
preview show nothing: the canvas container's `width` was invalid CSS
(`min(100%, 80vh * 1.77px)`), collapsing it to 0x0, and text `fontSize` was emitted as a
percentage of the root font-size (~0.6px for a 48px clip). Both are fixed in this batch
(canvas now sized with container-query units, text sized in `cqh`). Parity between
preview and export is now a meaningful acceptance criterion for video and text.

**F6 — Coordinate mapping is derivable but subtle.** The preview positions clips with
`transform: translate(x*100%, y*100%) scale(sx, sy)` on a canvas-filling element, where
translate percentages resolve against the unscaled box and scale is about the centre.
The equivalent overlay origin is `x = W/2 + x*W - (W*sx)/2`, `y = H/2 + y*H - (H*sy)/2`.
Verified by rendering a clip at x=0.28, y=0.28, scale=0.3 and inspecting the frame.
This formula is the single place where preview and export can silently diverge; it must
live in one shared module with a unit test.

**F7 — `atempo` accepts 0.5-100; the product allows speed 0.1-10.** Speeds below 0.5
need chained `atempo` filters (e.g. `atempo=0.4,atempo=0.5` for 0.2).

**F8 — `amix` attenuates by 1/N by default.** `normalize=0` is required or every
additional track drops the overall level.

## 3. Target architecture

Two phases. Phase 1 ships a working export for everything except stickers. Phase 2
removes the last parity gap by making the preview and the exporter use the same
compositor.

### Phase 1 — hybrid (option C)

```
renderer                          main process                 external
+------------------+  RenderPlan  +-------------------+
| TimelineCompiler | ------------>| Encoder           |
|  Project -> Plan |              |  utilityProcess   |----> ffmpeg (video/audio graph)
+------------------+              +-------------------+
| Rasterizer       |  PNG bytes   |                   |
|  text -> canvas  | ------------>|  temp files       |
+------------------+              +-------------------+
```

**TimelineCompiler** (renderer or shared module, pure function, unit-testable).
Input: `Project`. Output: `RenderPlan` (section 4). No FFmpeg knowledge, no I/O.
This is where F6's coordinate math and F7's atempo chaining live.

**Rasterizer** (renderer). Turns each `TextClip` active over the export window into a
full-canvas transparent PNG at export resolution, using the same font/size/color/shadow
values the preview uses. Sends PNG bytes to main over IPC. Per F4, sticker clips are
out of scope until they become image assets; an image-asset sticker is simply another
rasterized-or-copied PNG.

**Encoder** (main process). Builds the filtergraph from the RenderPlan, spawns FFmpeg
with an argument array (never a shell), and streams stderr for progress. FFmpeg already
runs as a child process, so a hung or crashing encode cannot take the app down and the
UI stays responsive; a separate `utilityProcess` is deferred to Phase 2, where it becomes
necessary because frame pumping moves into our own JS. This corrects an earlier draft of
this document that placed the Phase 1 encoder in a utility process.

**FFmpeg resolution.** Keep using a system FFmpeg for video/audio (F1 proves that part
needs no exotic filters), but detect it at startup and fail with an actionable message
instead of a silent null. Do not depend on FFmpeg text filters (F2). If we later want a
guaranteed-capable binary, bundling one is an option, but Phase 1 does not need it.

### Phase 2 — single compositor (option B)

Move all compositing into the renderer: draw each frame to a canvas (video frames via
`drawImage` from decoded `<video>` elements, text and images natively) and pipe raw
frames to FFmpeg as a `rawvideo` input for encoding only. Preview and export then share
one compositor, so parity holds by construction and every CSS-visible property
(filters, blend modes, strokes) exports for free. Cost: a frame pump, backpressure
handling, and re-implementing the compositor once in canvas. Note F4 still applies:
emoji stickers will not draw on canvas in Phase 2 either, which is another reason to
settle the sticker question in Phase 1.

### Sticker decision (resolved: original vector assets, no third-party licence)

The "free" constraint ruled out licensing a third-party emoji set, and F4 ruled out
keeping emoji strings: canvas cannot rasterize color emoji fonts at all. The resolution
is a set of twelve original SVG stickers authored in this repository
(`src/assets/stickers/`), bundled as raw strings and drawn to canvas via data URLs.
Zero cost, zero external licence obligations, and vectors rasterize cleanly where emoji
paint zero pixels.

`StickerClip.src` is now an asset id. Legacy files holding emoji strings are handled by
the v2->v3 schema migration, which drops sticker clips whose source is not a known
asset; a migration test pins that behavior.

## 4. RenderPlan schema

```ts
interface RenderPlan {
  width: number; height: number; fps: number; duration: number
  background: string
  inputs: Array<{ id: string; path: string }>          // deduped media files
  layers: Array<{
    inputId: string
    kind: 'video' | 'image'
    z: number
    start: number; end: number                          // timeline window
    mediaStart: number; mediaEnd: number                // source trim
    speed: number
    opacity: number
    x: number; y: number; scaleX: number; scaleY: number  // normalized, preview semantics
  }>
  overlays: Array<{ png: string; z: number; start: number; end: number }>  // rasterized text/stickers
  audio: Array<{
    inputId: string
    start: number; duration: number
    mediaStart: number
    speed: number; volume: number; fadein: number; fadeout: number
  }>
  output: { format: 'mp4' | 'mov' | 'webm'; videoBitrate: string; audioBitrate: string }
}
```

The plan is plain JSON: it can be logged, snapshotted in tests, and diffed between
preview and export runs. The Encoder is a pure function from RenderPlan to an FFmpeg
argument array, which makes the whole pipeline testable without touching disk.

## 5. Failure modes

| Failure | Blast radius | Detection | Response |
| --- | --- | --- | --- |
| FFmpeg/ffprobe not installed | export + import probe | startup probe of `ffmpeg -version` | dialog with install instructions; disable Export button |
| FFmpeg lacks a needed filter | export | validate filter list once at startup | fall back or message; never silent |
| Rasterizer returns blank PNG (F4 class of bug) | one layer missing | assert non-zero opaque pixel count per rasterized layer in dev builds | skip layer + log; surface a warning chip in the export dialog |
| FFmpeg crashes mid-export | current export | utilityProcess exit code | dialog with the tail of stderr; UI stays alive |
| Export exceeds disk space | export | FFmpeg stderr / write error | abort, delete partial file, message |
| Path with shell metacharacters | RCE | n/a | already fixed: argument arrays only, verified live |
| Speed < 0.5 (F7) | wrong playback rate | compiler emits chained atempo | covered by unit test |
| Track count grows (amix, F8) | level drop | `normalize=0` | covered by unit test |

## 6. Acceptance criteria for Phase 1

1. A project with 2 video tracks, a gap, per-clip speed, one text clip and one music
   track exports with all of those present in the output, verified by frame extraction.
2. Exported frame at time t matches the preview at time t for video and text within a
   visible-difference threshold (screenshot diff, not eyeballing).
3. Chosen format and bitrates are honoured: a `.webm` export produces VP9/Opus, not mp4
   codecs in a webm container.
4. A video-only project (no audio stream in any input) exports successfully.
5. Killing FFmpeg mid-export leaves the app responsive and shows an error, not a stuck
   progress bar.
6. `TimelineCompiler` and `RenderPlan -> args` have unit tests; no test needs FFmpeg.

## 7. Estimates

Per-type estimates, assuming one engineer who knows the codebase:

- TimelineCompiler + RenderPlan + unit tests: 1 day
- Rasterizer (text) + IPC transfer: 0.5 day
- Encoder in utilityProcess + progress + error surfacing: 1-1.5 days
- Format/codec correctness (mp4/mov/webm): 0.5 day
- Parity harness (preview vs export screenshot diff): 1 day
- Sticker asset migration (if approved): 1 day

Total roughly 5-5.5 days, which exceeds the 5-day threshold for a single milestone, so
ship it as two: (a) compiler + encoder for video/audio with tests, (b) text overlays +
parity harness + stickers.

## 8. Open questions

1. ~~Stickers: image assets or preview-only?~~ Resolved: image assets. The asset set
   and its licence are still undecided and gate the implementation, not the decision.
2. Do we bundle FFmpeg to guarantee a known-capable binary, or keep system FFmpeg with
   capability detection? Phase 1 assumes the latter.
3. Transitions: `xfade` is available in the tested build, but cross-track transitions
   need a defined semantic first. Out of scope for Phase 1.
4. Should the preview itself move to canvas in Phase 1 (to make parity cheap), or stay
   DOM until Phase 2?
