// Rasterizes a TextClip and an emoji sticker to transparent PNGs using the
// renderer's own canvas API, exactly as the app would. Returns data URLs over
// CDP; the caller writes them to disk for the ffmpeg overlay prototype.
import fs from 'node:fs'

const list = await (await fetch('http://127.0.0.1:9229/json/list')).json()
const p = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl && !t.url.startsWith('devtools://')
  && (t.url.startsWith('http://localhost:5173') || t.url.includes('/dist/index.html')))
if (!p) { console.log('NO TARGET'); process.exit(1) }
const ws = new WebSocket(p.webSocketDebuggerUrl)
await new Promise(r => ws.onopen = r)
let id = 0
const send = (m, pr = {}) => new Promise((ok, fail) => {
  const mid = ++id
  const h = ev => { const r = JSON.parse(ev.data); if (r.id === mid) { ws.removeEventListener('message', h); r.error ? fail(new Error(JSON.stringify(r.error))) : ok(r.result) } }
  ws.addEventListener('message', h); ws.send(JSON.stringify({ id: mid, method: m, params: pr }))
})
await send('Runtime.enable')

const expression = `(async () => {
  const W = 1280, H = 720
  const rasterize = (draw) => {
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const g = c.getContext('2d')
    draw(g)
    return c.toDataURL('image/png')
  }

  // Mirrors the preview's text semantics: fontSize is in CANVAS pixels and
  // (x, y) is the normalized centre of the text block.
  const text = rasterize(g => {
    const t = { text: 'Hello CapJul', fontFamily: 'Arial', fontSize: 48, fontColor: '#ffffff',
                bold: true, x: 0.5, y: 0.5, shadowBlur: 8, shadowX: 2, shadowY: 2 }
    g.font = \`\${t.bold ? 'bold ' : ''}\${t.fontSize}px \${t.fontFamily}\`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.shadowColor = 'rgba(0,0,0,0.5)'
    g.shadowBlur = t.shadowBlur
    g.shadowOffsetX = t.shadowX
    g.shadowOffsetY = t.shadowY
    g.fillStyle = t.fontColor
    g.fillText(t.text, t.x * W, t.y * H)
  })

  // Stickers are emoji strings in this app, so they rasterize as text too.
  const sticker = rasterize(g => {
    g.font = '144px "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('⭐', 0.75 * W, 0.25 * H)
  })

  return JSON.stringify({ text, sticker })
})()`

const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
const { text, sticker } = JSON.parse(r.result.value)
const save = (url, path) => fs.writeFileSync(path, Buffer.from(url.split(',')[1], 'base64'))
save(text, new URL('./media/text1.png', import.meta.url))
save(sticker, new URL('./media/sticker1.png', import.meta.url))
console.log('wrote media/text1.png and media/sticker1.png')
ws.close(); process.exit(0)
