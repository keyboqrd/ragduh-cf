import { z } from "zod";
import { fileNameSchema } from "./common";

// ============ Ingest Job Status Enums ============

export const IngestJobStatusEnum = z.enum([
  "QUEUED",
  "PRE_PROCESSING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);

export const DocumentStatusEnum = z.enum([
  "QUEUED",
  "PRE_PROCESSING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "QUEUED_FOR_RESYNC",
  "QUEUED_FOR_DELETE",
  "DELETING",
]);

export type IngestJobStatus = z.infer<typeof IngestJobStatusEnum>;
export type DocumentStatus = z.infer<typeof DocumentStatusEnum>;

// ============ Payload Schemas ============

// FILE payload - for uploading a file from URL
export const filePayloadSchema = z.object({
  type: z.literal("FILE"),
  fileUrl: z.string().url("Must be a valid URL"),
  fileName: fileNameSchema,
});

export type FilePayload = z.infer<typeof filePayloadSchema>;

// TEXT payload - for direct text content
export const textPayloadSchema = z.object({
  type: z.literal("TEXT"),
  text: z.string().min(1, "Text cannot be empty"),
  fileName: fileNameSchema.optional().default("untitled.txt"),
  mimeType: z.string().optional(),
});

export type TextPayload = z.infer<typeof textPayloadSchema>;

// BATCH payload item - each item can be TEXT or FILE
export const batchItemSchema = z.discriminatedUnion("type", [
  textPayloadSchema,
  filePayloadSchema,
]);

export type BatchItem = z.infer<typeof batchItemSchema>;

// BATCH payload - for ingesting multiple documents in a single job
export const batchPayloadSchema = z.object({
  type: z.literal("BATCH"),
  items: z
    .array(batchItemSchema)
    .min(1, "Batch must contain at least one item")
    .max(100, "Batch cannot contain more than 100 items"),
});

export type BatchPayload = z.infer<typeof batchPayloadSchema>;

// Discriminated union for all payload types
export const ingestJobPayloadSchema = z.discriminatedUnion("type", [
  filePayloadSchema,
  textPayloadSchema,
  batchPayloadSchema,
]);

export type IngestJobPayload = z.infer<typeof ingestJobPayloadSchema>;

// Ingest job config
export const ingestJobConfigSchema = z.object({
  chunkSize: z.number().int().positive().default(2048),
  languageCode: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type IngestJobConfig = z.infer<typeof ingestJobConfigSchema>;

// Create ingest job request
export const createIngestJobRequestSchema = z.object({
  namespaceId: z.string().min(1, "Namespace ID is required"),
  payload: ingestJobPayloadSchema,
  config: ingestJobConfigSchema.optional(),
});

export type CreateIngestJobRequest = z.infer<
  typeof createIngestJobRequestSchema
>;

// List ingest jobs query params
export const listIngestJobsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().transform(Number).default("20"),
  ingestJobId: z.string().optional(),
  statuses: z.union([
    z.string(),
    z.array(z.string()),
  ]).transform((val) => {
    if (typeof val === "string") return [val];
    return val;
  }).optional(),
  orderBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type ListIngestJobsQuery = z.infer<typeof listIngestJobsSchema>;

// List documents query params
export const listDocumentsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().transform(Number).default("20"),
  ingestJobId: z.string().optional(),
  statuses: z.union([
    z.string(),
    z.array(z.string()),
  ]).transform((val) => {
    if (typeof val === "string") return [val];
    return val;
  }).optional(),
  orderBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type ListDocumentsQuery = z.infer<typeof listDocumentsSchema>;

// Re-ingest job request
export const reIngestJobRequestSchema = z.object({
  jobId: z.string().min(1, "Job ID is required"),
});

export type ReIngestJobRequest = z.infer<typeof reIngestJobRequestSchema>;
