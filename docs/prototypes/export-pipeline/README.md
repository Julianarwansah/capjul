# Export pipeline prototype — evidence, not production code

Throwaway scripts that produced the validated findings in
[`docs/export-pipeline-design.md`](../../export-pipeline-design.md). Do not import from
`src/` and do not extend these in place; the production implementation should be written
fresh from the design doc.

## What is here

- `timeline.json` — a test timeline shaped like CapJul's `Project` types: two video
  clips on one track with a gap between them, a second track as a scaled/positioned
  overlay, and a music track with fade-in.
- `build.mjs` — turns that timeline into one FFmpeg filtergraph using the
  "shift each clip onto the timeline, overlay onto a full-duration background" model,
  then renders `out/render.mp4`.
- `rasterize.mjs` — connects to a running CapJul over CDP and rasterizes a text layer
  and an emoji sticker with the renderer's own canvas API, writing transparent PNGs.
  This is how finding F3 (text rasterizes fine) and F4 (color emoji paints zero pixels)
  were produced.
- `evidence/` — rendered frames and rasterized layers referenced by the design doc:
  - `ov-2.5.png` — text rasterized in the renderer, composited by FFmpeg `overlay`
  - `frame-3.5.png` — a timeline gap showing the background, not a frozen frame
  - `text1.png` — canvas-rasterized text layer (works)
  - `sticker1.png` — canvas-rasterized emoji layer (blank; finding F4)

## Running it

Media is generated, not committed:

```sh
ffmpeg -y -f lavfi -i "testsrc=size=640x360:rate=30:duration=6" \
  -f lavfi -i "sine=frequency=440:duration=6" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest media/videoA.mp4
ffmpeg -y -f lavfi -i "smptebars=size=640x360:rate=30:duration=6" \
  -f lavfi -i "sine=frequency=880:duration=6" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest media/videoB.mp4
ffmpeg -y -f lavfi -i "sine=frequency=220:duration=10" -c:a pcm_s16le media/music.wav

node build.mjs                       # renders out/render.mp4
# for the rasterizer, launch the app with --remote-debugging-port=9229 first:
node rasterize.mjs
```

`testsrc`'s baked-in frame counter is what makes trim offsets and speed verifiable by
eye: at timeline t=2.5 with `mediaStart: 1`, the counter reads 3.

## Phase 2 harness (compositor + frame pump)

`phase2/` verifies the renderer-side half of the Phase 2 compositor without the app's
IPC transport, which a native save dialog makes unautomatable.

- `frame-server.mjs` — a node HTTP server that stands in for the main process: it
  accepts RGBA frames over POST and pipes them into `ffmpeg -f rawvideo -pix_fmt rgba
  -i pipe:0`, applying backpressure by answering only after stdin drains.
- `pump-page.html` — a page that loads an esbuild bundle of `src/shared/export-pump.ts`
  (`--loader:.svg=text`) and pumps a scene into that server.

Run it:

```sh
npx esbuild src/shared/export-pump.ts --bundle --format=iife --global-name=PUMP \
  --loader:.svg=text --outfile=/tmp/rp/pump.js
# serve pump-page.html next to pump.js, launch headless Chrome with
# --allow-file-access-from-files on port 9334, start frame-server.mjs, then evaluate
# runExportPump with sendFrame posting to http://127.0.0.1:9444/frame
```

Measured: 120 frames (4 s at 30 fps, 1280x720) pumped and encoded in 2.9 s, ffmpeg
exit 0, output duration exactly 4.0 s, and the encoded frame at t=2 shows the
composited text layer.
