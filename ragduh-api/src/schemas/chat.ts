import { z } from "zod";
import { LLM_MODELS, DEFAULT_LLM, RERANKER_MODELS, DEFAULT_RERANKER, type LLM, type RerankingModel } from "../config";

// LLM Schema
const llmSchema = z.enum(
  Object.entries(LLM_MODELS).flatMap(([provider, models]) =>
    models.map((m) => `${provider}:${m.model}`),
  ) as unknown as [LLM, ...LLM[]]
);

export const llmSchemaWithDefault = z.union([llmSchema, z.literal("")])
  .transform((val) => val === "" ? DEFAULT_LLM : val)
  .default(DEFAULT_LLM);

// Reranker Schema
const rerankerSchema = z.enum(
  Object.entries(RERANKER_MODELS).flatMap(([provider, models]) =>
    models.map((m) => `${provider}:${m.model}`),
  ) as unknown as [RerankingModel, ...RerankingModel[]]
);

export const rerankerSchemaWithDefault = z.union([rerankerSchema, z.literal("")])
  .transform((val) => val === "" ? DEFAULT_RERANKER : val)
  .default(DEFAULT_RERANKER);

// Messages Schema
export const messagesSchema = z.any().transform((messages) => {
  // Basic validation for UI messages
  if (!Array.isArray(messages)) {
    throw new Error("Messages must be an array");
  }
  return messages;
});

// Base query vector store schema
export const baseQueryVectorStoreSchema = z.object({
  query: z.string().describe("The query to search for."),
  topK: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .describe("The number of results to fetch from the vector store. Defaults to `10`."),
  chunkSize: z
    .number()
    .int()
    .positive()
    .optional()
    .default(2048)
    .describe("The chunk size used during ingestion, used to calculate topK limit. Defaults to `2048`."),
  rerank: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to rerank the results. Defaults to `true`."),
  rerankLimit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("The number of results to return after reranking. Defaults to `topK`."),
  rerankModel: rerankerSchemaWithDefault.describe("The reranking model to use."),
  filter: z
    .record(z.string(), z.any())
    .optional()
    .describe("A filter to apply to the results."),
  minScore: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("The minimum score to return."),
  includeRelationships: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include relationships in the results. Defaults to `false`."),
  includeMetadata: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to include metadata in the results. Defaults to `true`."),
  keywordFilter: z.string().optional(),
  mode: z.enum(["semantic", "keyword"]).optional().default("semantic"),
});

// Chat schema
export const chatSchema = baseQueryVectorStoreSchema
  .omit({ query: true })
  .extend({
    systemPrompt: z
      .string()
      .optional()
      .describe("The system prompt to use for the chat. Defaults to the default system prompt."),
    messages: messagesSchema,
    temperature: z.number().optional(),
    mode: z.enum(["normal", "agentic", "deepResearch"]).optional().default("normal"),
    rerankModel: rerankerSchemaWithDefault,
    llmModel: llmSchemaWithDefault,
  })
  .refine((data) => {
    if (data.rerankLimit && data.rerankLimit > data.topK) {
      return false;
    }
    return true;
  }, {
    message: "rerankLimit cannot be larger than topK",
    path: ["rerankLimit"],
  });

export type ChatRequest = z.infer<typeof chatSchema>;
