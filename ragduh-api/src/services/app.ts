import { StorageService } from "./storage";
import { EmbeddingService } from "./embedding";
import { VectorStoreService } from "./vector-store";
import { createAiGateway, type AiGateway } from "ai-gateway-provider";
import type { Env } from "../config";

/**
 * Create all app services
 */
export function createAppServices(env: Env) {
  const ai = env.AI;

  // Create AI Gateway wrapper for LLM
  const aiGateway = createAiGateway({
    accountId: env.CF_ACCOUNT_ID || "",
    gateway: env.CF_GATEWAY_ID || "",
    apiKey: env.CF_AIG_TOKEN || "",
  });

  const storage = new StorageService({
    db: env.DB,
    vectorizeIndex: env.RAGDUH_VECTORIZE_INDEX as any,
    r2: env.R2_BUCKET,
  });

  const embeddingService = new EmbeddingService({
    env,
    model: env.EMBEDDING_MODEL || "@cf/baai/bge-m3",
    dimensions: env.EMBEDDING_DIMENSION ? Number(env.EMBEDDING_DIMENSION) : 1024,
  });

  const vectorStoreService = new VectorStoreService(embeddingService, storage);

  return { storage, embeddingService, vectorStoreService, ai, aiGateway };
}
