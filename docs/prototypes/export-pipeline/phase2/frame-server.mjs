import http from 'node:http'
import { spawn } from 'node:child_process'
const W = 1280, H = 720, FPS = 30, DUR = 4
const proc = spawn('ffmpeg', [
  '-y', '-v', 'error',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
  '-i', '/tmp/rp/videoA.mp4',
  '-map', '0:v', '-map', '1:a',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', String(DUR),
  '/tmp/rp/pump.mp4',
])
proc.stderr.on('data', d => process.stderr.write('[ffmpeg] ' + d))
proc.on('close', code => { console.log('ffmpeg closed', code); setTimeout(() => process.exit(code ?? 0), 100) })
let frames = 0
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (req.method === 'POST' && req.url === '/frame') {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      frames++
      const buf = Buffer.concat(chunks)
      const drained = proc.stdin.write(buf)
      if (drained) { res.writeHead(204); res.end() }
      else proc.stdin.once('drain', () => { res.writeHead(204); res.end() })
    })
  } else if (req.method === 'POST' && req.url === '/end') {
    console.log('frames received:', frames)
    proc.stdin.end()
    res.writeHead(204); res.end()
  } else { res.writeHead(404); res.end() }
})
server.listen(9444, () => console.log('frame server on 9444'))
