// THROWAWAY PROTOTYPE - validates whether one ffmpeg filtergraph can express
// CapJul's timeline. Not production code; do not import from src/.
//
// Model under test: "shift each clip onto the timeline, then overlay it on a
// background of the full duration". This handles gaps, multiple tracks and
// z-order uniformly, unlike the current concat approach in electron/main.ts.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const dir = new URL('.', import.meta.url)
const tl = JSON.parse(fs.readFileSync(new URL('./timeline.json', dir), 'utf8'))
const { width: W, height: H, fps: FPS, duration: TOTAL, backgroundColor: BG } = tl

// --- inputs: dedupe media so each file is opened once ---
const paths = [...new Set([
  ...tl.clips.map(c => tl.media[c.mediaId]),
  ...tl.audioClips.map(c => tl.media[c.mediaId]),
])]
const inputOf = new Map(paths.map((p, i) => [p, i]))
// Rasterized text/sticker layers come from the renderer as transparent PNGs.
const overlays = tl.overlays ?? []

const fc = []
fc.push(`color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${TOTAL}[base]`)

// --- video: contain-fit to the clip's scaled box, shift, overlay ---
// CapJul preview semantics: the element fills the canvas, then
// transform: translate(x*100%, y*100%) scale(sx, sy) applies. Translate
// percentages resolve against the UNSCALED box, and scale is about the centre.
const overlayXY = c => {
  const bw = W * c.scaleX
  const bh = H * c.scaleY
  return {
    x: Math.round(W / 2 + c.x * W - bw / 2),
    y: Math.round(H / 2 + c.y * H - bh / 2),
  }
}

const vclips = [...tl.clips].sort((a, b) => a.z - b.z || a.startTime - b.startTime)
const audioLabels = []
let acc = 'base'

vclips.forEach((c, i) => {
  const src = inputOf.get(tl.media[c.mediaId])
  const bw = Math.round(W * c.scaleX)
  const bh = Math.round(H * c.scaleY)
  const chain = [
    `trim=start=${c.mediaStart}:end=${c.mediaEnd}`,
    `setpts=(PTS-STARTPTS)/${c.speed}`,
    `scale=${bw}:${bh}:force_original_aspect_ratio=decrease`,
    `pad=${bw}:${bh}:(ow-iw)/2:(oh-ih)/2`,
    'setsar=1',
    `fps=${FPS}`,
    `setpts=PTS+${c.startTime}/TB`,
  ]
  if (c.opacity < 1) chain.push('format=rgba', `colorchannelmixer=aa=${c.opacity}`)
  fc.push(`[${src}:v]${chain.join(',')}[vx${i}]`)

  const { x, y } = overlayXY(c)
  const next = `vtmp${i}`
  // eof_action=pass: once this clip ends the accumulator passes through, so a
  // gap shows the background instead of a frozen last frame.
  fc.push(`[${acc}][vx${i}]overlay=x=${x}:y=${y}:eof_action=pass:format=auto[${next}]`)
  acc = next

  if (c.volume > 0) {
    fc.push([
      `[${src}:a]atrim=start=${c.mediaStart}:end=${c.mediaEnd}`,
      'asetpts=PTS-STARTPTS',
      `atempo=${c.speed}`,
      `volume=${c.volume}`,
      `adelay=${Math.round(c.startTime * 1000)}:all=1[ax${i}]`,
    ].join(','))
    audioLabels.push(`[ax${i}]`)
  }
})
// Rasterized layers are full-canvas PNGs with the element already positioned,
// so they overlay at 0,0 and are gated purely by their time window.
overlays.forEach((o, i) => {
  const idx = paths.length + i
  const next = `otmp${i}`
  fc.push(`[${acc}][${idx}:v]overlay=0:0:enable='between(t,${o.startTime},${o.startTime + o.duration})':eof_action=pass:format=auto[${next}]`)
  acc = next
})
fc.push(`[${acc}]format=yuv420p[vout]`)

// --- audio tracks ---
tl.audioClips.forEach((c, j) => {
  const src = inputOf.get(tl.media[c.mediaId])
  const chain = [
    `[${src}:a]atrim=start=${c.mediaStart}:end=${c.mediaStart + c.duration}`,
    'asetpts=PTS-STARTPTS',
    `atempo=${c.speed ?? 1}`,
    `volume=${c.volume}`,
  ]
  if (c.fadein) chain.push(`afade=t=in:st=0:d=${c.fadein}`)
  if (c.fadeout) chain.push(`afade=t=out:st=${Math.max(0, c.duration - c.fadeout)}:d=${c.fadeout}`)
  chain.push(`adelay=${Math.round(c.startTime * 1000)}:all=1[am${j}]`)
  fc.push(chain.join(','))
  audioLabels.push(`[am${j}]`)
})

const graph = fc.join(';\n')
console.log('=== filtergraph ===\n' + graph + '\n')

if (!audioLabels.length) throw new Error('no audio streams')
const full = graph + ';\n' +
  `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0[aout]`

const args = [
  '-y', '-hide_banner',
  ...paths.flatMap(p => ['-i', p]),
  ...overlays.flatMap(o => ['-loop', '1', '-i', o.file]),
  '-filter_complex', full,
  '-map', '[vout]', '-map', '[aout]',
  '-t', String(TOTAL),
  '-r', String(FPS),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k',
  '-movflags', '+faststart',
  'out/render.mp4',
]

console.log('=== running ffmpeg ===')
try {
  const stderr = execFileSync('ffmpeg', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
} catch (e) {
  console.log('FFMPEG FAILED\n' + String(e.stderr || e.message).split('\n').slice(-25).join('\n'))
  process.exit(1)
}
console.log('ffmpeg exited 0')
