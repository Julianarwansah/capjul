import { z } from 'zod'

// Kept out of ipc-contract.ts on purpose: the preload imports the contract, and
// bundling zod into the preload would add ~85 KB to a script that only needs
// channel names and types. Only main (and tests) import this module.
export const ExportRequestSchema = z.object({
  inputs: z.array(z.object({
    path: z.string(),
    start: z.number(),
    end: z.number(),
  })),
  duration: z.number(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  videoBitrate: z.string(),
  audioBitrate: z.string(),
  format: z.enum(['mp4', 'mov', 'webm']),
})

export type ExportRequest = z.infer<typeof ExportRequestSchema>
