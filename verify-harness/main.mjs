import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = process.env.HARNESS_OUT || '/tmp/capjul-verify'

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    // The harness loads media by absolute file path.
    webPreferences: { webSecurity: false },
  })

  await win.loadFile(path.join(here, 'dist', 'index.html'))

  const deadline = Date.now() + 90_000
  let title = ''
  while (Date.now() < deadline) {
    title = await win.webContents.executeJavaScript('document.title')
    if (title === 'DONE' || title === 'ERROR') break
    await new Promise(r => setTimeout(r, 250))
  }

  if (title === 'ERROR') {
    console.error('HARNESS ERROR:', await win.webContents.executeJavaScript('window.__error'))
    app.exit(1)
    return
  }
  if (title !== 'DONE') {
    console.error('HARNESS TIMEOUT; last title =', JSON.stringify(title))
    const err = await win.webContents.executeJavaScript('window.__error || null')
    if (err) console.error('partial error:', err)
    app.exit(2)
    return
  }

  const pngs = await win.webContents.executeJavaScript('window.__pngs')
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })
  for (const p of pngs) {
    fs.writeFileSync(path.join(outDir, `${p.name}.png`), Buffer.from(p.dataUrl.split(',')[1], 'base64'))
  }
  console.log(`WROTE ${pngs.length} frames to ${outDir}`)
  for (const p of pngs) console.log(' -', p.name, `t=${p.t}`)
  app.exit(0)
})
