import { EmbeddingService } from "./embedding";
import { StorageService } from "./storage";
import type { Env } from "../config";

export interface QueryVectorStoreOptions {
  query: string;
  topK?: number;
  minScore?: number;
  filter?: Record<string, any>;
  namespaceId: string;
  mode?: "semantic" | "keyword";
  rerank?: boolean;
  rerankModel?: string;
  rerankLimit?: number;
  env: Env;
  chunkSize?: number;
}

export interface QueryResult {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface QueryVectorStoreResult {
  query: string;
  results: QueryResult[];
  topK: number;
  actualTopK: number;
}

export class VectorStoreService {
  private embeddingService: EmbeddingService;
  private storageService: StorageService;

  constructor(embeddingService: EmbeddingService, storageService: StorageService) {
    this.embeddingService = embeddingService;
    this.storageService = storageService;
  }

  async query(options: QueryVectorStoreOptions): Promise<QueryVectorStoreResult | null> {
    // Generate embedding for the query
    const embedding = await this.embeddingService.generateEmbedding(options.query);

    if (embedding.length === 0) {
      throw new Error("Failed to generate embedding for query");
    }

    // Calculate topK limit based on chunkSize to ensure total tokens <= 10240
    // Formula: topK = floor(10240 / chunkSize)
    // Default chunkSize is 2048 (from ingest config), so default topK = 5
    const MAX_CONTEXT_TOKENS = 10240;
    const chunkSize = options.chunkSize || 2048;
    const maxTopK = Math.floor(MAX_CONTEXT_TOKENS / chunkSize);
    const effectiveTopK = Math.min(options.topK || maxTopK, maxTopK);

    // Query Vectorize via storage service
    const vectorizeResults = await this.storageService.queryVectorize(
      options.namespaceId,
      embedding,
      effectiveTopK,
      options.minScore,
      options.filter
    );

    let results: QueryResult[] = vectorizeResults.map((r: any) => ({
      id: r.id,
      text: r.metadata?.text || "",
      score: r.score,
      metadata: r.metadata,
    }));

    // Apply reranking if requested
    if (options.rerank) {
      results = await this.rerank(
        results,
        options.query,
        options.env,
        options.rerankModel,
        options.rerankLimit
      );
    }

    return {
      query: options.query,
      results,
      topK: options.topK || maxTopK,
      actualTopK: effectiveTopK,
    };
  }

  // Rerank results using AI Gateway
  async rerank(
    results: QueryResult[],
    query: string,
    env: Env,
    model?: string,
    limit?: number
  ): Promise<QueryResult[]> {
    if (results.length === 0) {
      return [];
    }

    if (!query) {
      return results;
    }

    try {
      // Truncate documents to avoid token limits (BGE reranker max ~512 tokens per doc)
      const MAX_DOC_LENGTH = 500;
      const documents = results
        .map((r) => r.text)
        .filter(t => t && t.length > 0)
        .map(t => t.length > MAX_DOC_LENGTH ? t.substring(0, MAX_DOC_LENGTH) : t);

      if (documents.length === 0) {
        return results;
      }

      // Truncate query if too long
      const truncatedQuery = query.length > 500 ? query.substring(0, 500) : query;

      // Contexts must be array of objects with 'text' key
      const requestBody = JSON.stringify({
        query: truncatedQuery,
        contexts: documents.map(text => ({ text })),
      });

      // Use AI Gateway HTTP API for reranking
      const rerankResponse = await fetch(
        `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.CF_GATEWAY_ID}/workers-ai/run/${model || "@cf/baai/bge-reranker-base"}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.CF_AIG_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: requestBody,
        }
      );

      if (!rerankResponse.ok) {
        const errorText = await rerankResponse.text();
        throw new Error(`Rerank API failed: ${rerankResponse.status} ${errorText}`);
      }

      const rerankResult = await rerankResponse.json() as {
        response: { id: number; score: number }[];
      };

      // Sort by score descending and apply limit
      const rerankedResults = rerankResult.response
        .sort((a, b) => b.score - a.score)
        .slice(0, limit || rerankResult.response.length);

      // Map back to original results with rerank scores
      return rerankedResults.map((result) => {
        const originalResult = results[result.id];
        return {
          ...originalResult,
          score: result.score,
        };
      });
    } catch (error) {
      console.error("Reranking failed, returning original results:", error);
      return results;
    }
  }
}
