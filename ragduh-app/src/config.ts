// Frontend configuration - synced with ragduh-api config

export const LLM_MODELS = {
  google: [
    { model: "google:gemma-3-27b-it", name: "Gemma 3 27B IT" },
  ],
} as const;

export const RERANKER_MODELS = {
  workersai: [
    { model: "workersai:@cf/baai/bge-reranker-base", name: "BGE Reranker Base" },
  ],
} as const;

// Flatten models for dropdown
export const ALL_LLM_MODELS = [
  ...LLM_MODELS.google,
] as const;

export const ALL_RERANKER_MODELS = [
  ...RERANKER_MODELS.workersai,
] as const;
