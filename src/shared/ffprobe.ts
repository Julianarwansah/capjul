import { z } from 'zod'

// ffprobe output is external input; validate the slice we actually read.
export const FfprobeStreamSchema = z.object({
  codec_type: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  r_frame_rate: z.string().optional(),
  duration: z.string().optional(),
  codec_name: z.string().optional(),
})

export const FfprobeResultSchema = z.object({
  streams: z.array(FfprobeStreamSchema).default([]),
  format: z.object({
    duration: z.string().optional(),
    size: z.string().optional(),
    bit_rate: z.string().optional(),
    filename: z.string().optional(),
  }).default({}),
})

export type FfprobeStream = z.infer<typeof FfprobeStreamSchema>
export type FfprobeResult = z.infer<typeof FfprobeResultSchema>
