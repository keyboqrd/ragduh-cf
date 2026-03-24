// Shared environment configuration for all routes and workers

export interface Env {
  // Cloudflare AI binding for embeddings/rerank (Workers AI)
  AI: Ai;

  // D1 Database binding
  DB: D1Database;

  // Vectorize index binding
  RAGDUH_VECTORIZE_INDEX: VectorizeIndex;

  // Queue binding
  JOB_QUEUE: Queue;

  // Environment variables
  ENVIRONMENT: string;
  API_KEY: string;

  // AI Gateway configuration
  CF_ACCOUNT_ID?: string;
  CF_GATEWAY_ID?: string;
  CF_AIG_TOKEN?: string;

  // Local mode flag (uses mock AI and Vectorize)
  LOCAL_MODE?: string;

  // Embedding model and dimension
  EMBEDDING_MODEL?: string;
  EMBEDDING_DIMENSION?: number;
}

// LLM Models - Only Gemma
export const LLM_MODELS = {
  google: [
    { model: "gemma-3-27b-it", name: "Gemma 3 27B IT" },
  ],
} as const;

export type LLM = "google:gemma-3-27b-it";
export const DEFAULT_LLM: LLM = "google:gemma-3-27b-it";

// Reranker Models - Cloudflare Workers AI
export const RERANKER_MODELS = {
  workersai: [
    { model: "@cf/baai/bge-reranker-base", name: "BGE Reranker Base" },
  ],
} as const;

export type RerankingModel = "workersai:@cf/baai/bge-reranker-base";
export const DEFAULT_RERANKER: RerankingModel = "workersai:@cf/baai/bge-reranker-base";
