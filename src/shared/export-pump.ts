// Renderer-only: pumps composited frames to a consumer. The consumer is
// injected so the pump can be verified without the app's IPC transport.
import { prepareScene, type PreparedScene } from './compositor'
import type { Scene } from './scene'
import type { MediaFile } from './project-schema'

export interface PumpOptions {
  scene: Scene
  media: MediaFile[]
  resolveMediaUrl: (path: string) => string
  /** Receives one RGBA frame; must apply backpressure by resolving slowly. */
  sendFrame: (bytes: Uint8Array) => Promise<void>
  onProgress?: (frame: number, total: number) => void
}

export async function pumpPrepared(
  prepared: PreparedScene,
  scene: Scene,
  o: Pick<PumpOptions, 'sendFrame' | 'onProgress'>,
): Promise<{ frames: number }> {
  const canvas = document.createElement('canvas')
  canvas.width = scene.width
  canvas.height = scene.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2d canvas context unavailable')

  const total = Math.max(1, Math.ceil(scene.duration * scene.fps))
  for (let frame = 0; frame < total; frame++) {
    const t = frame / scene.fps
    await prepared.seekActiveVideos(t)
    prepared.drawFrame(ctx, t)
    const { data } = ctx.getImageData(0, 0, scene.width, scene.height)
    // Copy: the ImageData buffer is not guaranteed to outlive this iteration.
    await o.sendFrame(new Uint8Array(data.buffer.slice(0)))
    o.onProgress?.(frame + 1, total)
  }
  return { frames: total }
}

export async function runExportPump(o: PumpOptions): Promise<{ frames: number }> {
  const prepared = await prepareScene(o.scene, o.media, o.resolveMediaUrl)
  try {
    return await pumpPrepared(prepared, o.scene, o)
  } finally {
    prepared.dispose()
  }
}
