import { z } from "zod";

// File name validation
export const fileNameSchema = z
  .string()
  .min(1, "File name cannot be empty")
  .max(255, "File name must be less than 255 characters");

// Chunk options for controlling how text is split
export const chunkOptionsSchema = z.object({
  chunk_size: z.number().int().positive().default(2048),
  delimiter: z.string().optional().nullable(),
  language_code: z.string().optional().nullable(),
});

export type ChunkOptions = z.infer<typeof chunkOptionsSchema>;

// Parse options (kept for compatibility, mostly unused for plain text)
export const parseOptionsSchema = z.object({
  mode: z.enum(["fast", "balanced", "accurate"]).default("balanced"),
  disable_image_extraction: z.boolean().default(false),
  disable_image_captions: z.boolean().default(false),
  additional_config: z.record(z.string(), z.unknown()).optional().nullable(),
  extras: z.string().optional().nullable(),
});

export type ParseOptions = z.infer<typeof parseOptionsSchema>;
