import { Chunk } from "./partition";
import type { Env } from "../config";

export interface EmbeddingConfig {
  env: Env;
  model?: string;
  dimensions?: number;
}

export class EmbeddingService {
  private env: Env;
  private model: string;
  private dimensions?: number;

  constructor(config: EmbeddingConfig) {
    this.env = config.env;
    this.model = config.model || "@cf/baai/bge-m3";
    this.dimensions = config.dimensions;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    console.log(`Generating embedding for text length: ${text.length}`);

    const response = await fetch(
      `https://gateway.ai.cloudflare.com/v1/${this.env.CF_ACCOUNT_ID}/${this.env.CF_GATEWAY_ID}/workers-ai/run/${this.model}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.env.CF_AIG_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Embedding API failed: ${response.status}`);
    }

    const result = await response.json() as { data: number[][] };
    return result.data?.[0] || [];
  }

  async generateBatchEmbeddings(chunks: Chunk[]): Promise<void> {
    console.log(`[Embedding] Starting batch embedding for ${chunks.length} chunks`);

    // Workers AI limits:
    // - Max 100 texts per batch
    // - Max ~60000 tokens per batch (context window)
    // We use a conservative token budget to stay within limits

    const MAX_TEXTS_PER_BATCH = 100;
    const MAX_TOKENS_PER_BATCH = 50000;  // Conservative limit (est. 1 char ≈ 0.75 tokens)
    const MAX_CHARS_PER_BATCH = MAX_TOKENS_PER_BATCH * 3 / 4;  // ~66000 chars

    if (chunks.length === 0) {
      console.warn('[Embedding] No chunks to embed');
      return;
    }

    let i = 0;
    let batchNum = 0;

    while (i < chunks.length) {
      batchNum++;

      // Dynamic batch sizing based on token estimate
      let batch: Chunk[] = [];
      let batchChars = 0;

      while (
        i + batch.length < chunks.length &&
        batch.length < MAX_TEXTS_PER_BATCH &&
        batchChars < MAX_CHARS_PER_BATCH
      ) {
        const chunk = chunks[i + batch.length];
        batchChars += chunk.text.length;
        batch.push(chunk);
      }

      // Ensure at least one chunk per batch (handle very large chunks)
      if (batch.length === 0) {
        batch = [chunks[i]];
        i++;
      } else {
        i += batch.length;
      }

      console.log(`[Embedding] Processing batch ${batchNum}, ${batch.length} chunks, ~${Math.round(batchChars * 0.75 / 1000)}K tokens`);

      try {
        const texts = batch.map((chunk) => chunk.text);

        const response = await fetch(
          `https://gateway.ai.cloudflare.com/v1/${this.env.CF_ACCOUNT_ID}/${this.env.CF_GATEWAY_ID}/workers-ai/run/${this.model}`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${this.env.CF_AIG_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: texts,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Embedding API error response: ${errorText}`);
          throw new Error(`Embedding API failed: ${response.status} ${errorText}`);
        }

        const result = await response.json() as { data: number[][] };

        result.data.forEach((embedding, idx) => {
          const chunk = batch[idx];
          if (!chunk.metadata) {
            chunk.metadata = {};
          }
          chunk.metadata.embedding = embedding;
          console.log(`Chunk ${chunk.id} got embedding with dim ${embedding.length}`);
        });
      } catch (error) {
        console.error(`Batch ${batchNum} failed:`, error);
        throw error;
      }
    }

    console.log(`[Embedding] Completed ${batchNum} batches`);
  }
}
