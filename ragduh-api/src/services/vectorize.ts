import { Chunk } from "./partition";

export interface VectorizeConfig {
  binding: VectorizeIndex;
}

export interface QueryVectorizeOptions {
  namespaceId: string;
  embedding: number[];
  topK: number;
  minScore?: number;
  filter?: Record<string, any>;
}

export interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, any>;
}

export class VectorizeService {
  private binding: VectorizeIndex;

  constructor(config: VectorizeConfig) {
    this.binding = config.binding;
  }

  /**
   * Query the Vectorize index
   * Note: Vectorize doesn't support metadata filtering yet, so filtering is done client-side
   */
  async query(options: QueryVectorizeOptions): Promise<VectorizeMatch[]> {
    try {
      // Vectorize query format: index.query(vector, { topK, returnValues, returnMetadata })
      const results = await this.binding.query(options.embedding, {
        topK: options.topK,
        returnValues: false,
        returnMetadata: true,
      });

      let matches = results.matches || [];

      // Always filter by namespace_id for namespace isolation
      matches = matches.filter((match) => {
        const metadata = match.metadata || {};
        return metadata.namespace_id === options.namespaceId;
      });

      // Apply client-side filtering for additional metadata filters
      // Vectorize doesn't support metadata filtering natively yet
      if (options.filter && Object.keys(options.filter).length > 0) {
        matches = matches.filter((match) => {
          const metadata = match.metadata || {};
          return Object.entries(options.filter!).every(([key, value]) => {
            return metadata[key] === value;
          });
        });
      }

      // Apply minScore filter if provided
      if (options.minScore !== undefined) {
        matches = matches.filter((match) => match.score >= options.minScore!);
      }

      return matches.slice(0, options.topK);
    } catch (error) {
      console.error("Vectorize query error:", error);
      return [];
    }
  }

  /**
   * Upsert vectors into Vectorize
   * Uses the namespaceId as a prefix in metadata to simulate namespaces
   */
  async upsert(namespaceId: string, chunks: Chunk[]): Promise<void> {
    const vectorsToUpsert = chunks
      .filter((chunk) => {
        const embedding = chunk.metadata?.embedding as number[] | undefined;
        const hasEmbedding = embedding && embedding.length > 0;
        if (!hasEmbedding) {
          console.warn(`[Vectorize] Chunk ${chunk.id} has no embedding, skipping`);
        }
        return hasEmbedding;
      })
      .map((chunk) => {
        const metadata: Record<string, any> = {
          namespace_id: namespaceId,
          text: chunk.text,
          id: chunk.id,
          document_id: chunk.metadata?.document_id as string || "",
        };
        if (chunk.metadata?.sequence_number !== undefined) {
          metadata.sequence_number = chunk.metadata.sequence_number as number;
        }
        return {
          id: chunk.id,
          values: chunk.metadata?.embedding as number[],
          metadata,
        };
      });

    console.log(`[Vectorize] ${vectorsToUpsert.length} vectors with embeddings out of ${chunks.length} chunks`);

    if (vectorsToUpsert.length === 0) {
      console.warn("[Vectorize] No vectors to upsert");
      return;
    }

    // Vectorize upsert limit is 1000 vectors per batch
    const batchSize = 100;
    for (let i = 0; i < vectorsToUpsert.length; i += batchSize) {
      const batch = vectorsToUpsert.slice(i, i + batchSize);
      console.log(`[Vectorize] Upserting batch ${Math.floor(i / batchSize) + 1}, ${batch.length} vectors`);
      console.log(`[Vectorize] Batch 1 vector IDs: ${batch.map(b => b.id).slice(0, 3).join(", ")}...`);
      console.log(`[Vectorize] Batch 1 metadata sample: document_id=${batch[0]?.metadata?.document_id}, namespace_id=${batch[0]?.metadata?.namespace_id}`);
      await this.binding.upsert(batch);
      console.log(`[Vectorize] Batch ${Math.floor(i / batchSize) + 1} upsert completed`);
    }

    console.log(`[Vectorize] Upsert complete - total ${vectorsToUpsert.length} vectors written`);
  }

  /**
   * Delete vectors by documentId
   * Uses sequence_number for pagination since vectors are returned by similarity, not by ID
   */
  async delete(namespaceId: string, documentId: string): Promise<void> {
    console.log(`[Vectorize Delete] Starting delete for document ${documentId} in namespace ${namespaceId}`);
    try {
      const MAX_TOP_K = 50; // Vectorize max topK with returnMetadata: "all" is 50
      const allIdsToDelete: string[] = [];

      let hasMore = true;
      let lastSequenceNumber = -1;

      // Get the correct vector dimension from the index
      const indexInfo = await this.binding.describe();
      const vectorDimension = (indexInfo as any)?.dimensions || 1024;
      console.log(`[Vectorize Delete] Vector dimension: ${vectorDimension}`);

      while (hasMore) {
        // Query with dummy vector to get vector IDs
        // Use returnMetadata: "all" to get full metadata (indexed + unindexed fields)
        console.log(`[Vectorize Delete] Querying with topK=${MAX_TOP_K}, returnMetadata="all"`);
        const queryResults = await this.binding.query(
          new Array(vectorDimension).fill(0),
          {
            topK: MAX_TOP_K,
            returnValues: false,
            returnMetadata: "all",
          }
        );

        const matches = queryResults.matches || [];
        console.log(`[Vectorize Delete] Query returned ${matches.length} matches`);

        // Filter to get IDs matching the documentId and namespaceId
        // Use sequence_number for pagination since it's sequential within a document
        const filteredMatches = matches.filter((match) => {
          const metadata = match.metadata || {};
          return (
            metadata.document_id === documentId &&
            metadata.namespace_id === namespaceId &&
            (match.metadata?.sequence_number as number) > lastSequenceNumber
          );
        });
        console.log(`[Vectorize Delete] Filtered to ${filteredMatches.length} matches for document ${documentId}`);

        if (filteredMatches.length === 0) {
          hasMore = false;
          break;
        }

        const filteredIds = filteredMatches.map((match) => match.id);
        allIdsToDelete.push(...filteredIds);

        // Find the max sequence_number in this batch
        const maxSeqInBatch = Math.max(
          ...filteredMatches.map((m) => (m.metadata?.sequence_number as number) || 0)
        );
        lastSequenceNumber = maxSeqInBatch;

        // If we got fewer than MAX_TOP_K filtered matches, we've reached the end
        if (filteredMatches.length < MAX_TOP_K) {
          hasMore = false;
        }
      }

      if (allIdsToDelete.length > 0) {
        // Delete in batches of 100
        const batchSize = 100;
        for (let i = 0; i < allIdsToDelete.length; i += batchSize) {
          const batch = allIdsToDelete.slice(i, i + batchSize);
          console.log(`[Vectorize] Deleting batch ${Math.floor(i / batchSize) + 1}, ${batch.length} vectors`);
          console.log(`[Vectorize] Delete batch IDs: ${batch.slice(0, 3).join(", ")}...`);
          await this.binding.deleteByIds(batch);
          console.log(`[Vectorize] Delete batch ${Math.floor(i / batchSize) + 1} completed`);
        }
        console.log(`[Vectorize] Deleted ${allIdsToDelete.length} vectors for document ${documentId}`);
      } else {
        console.log(`[Vectorize] No vectors found to delete for document ${documentId}`);
      }
    } catch (error) {
      console.error("Vectorize delete error:", error);
      throw error;
    }
  }

  /**
   * Get all chunks for a document
   */
  async getDocumentChunks(
    namespaceId: string,
    documentId: string,
    limit?: number
  ): Promise<Array<{
    id: string;
    text: string;
    sequence_number: number;
    score?: number;
  }>> {
    const MAX_TOP_K = 100; // Vectorize max topK is 100
    const allChunks: Array<{
      id: string;
      text: string;
      sequence_number: number;
      score?: number;
    }> = [];

    let hasMore = true;
    let lastSequenceNumber = -1;

    // Get the correct vector dimension from the index
    const indexInfo = await this.binding.describe();
    const vectorDimension = (indexInfo as any)?.dimensions || 1024;

    while (hasMore) {
      // Query with dummy vector and filter by documentId
      // Use returnMetadata: "all" to get full metadata
      const results = await this.binding.query(
        new Array(vectorDimension).fill(0),
        {
          topK: MAX_TOP_K,
          returnValues: false,
          returnMetadata: "all",
        }
      );

      const matches = results.matches || [];

      // Filter by documentId and namespaceId
      const filteredMatches = matches.filter((match) => {
        const metadata = match.metadata || {};
        return (
          metadata.document_id === documentId &&
          metadata.namespace_id === namespaceId &&
          (match.metadata?.sequence_number as number) > lastSequenceNumber
        );
      });

      if (filteredMatches.length === 0) {
        hasMore = false;
        break;
      }

      const chunks = filteredMatches
        .map((match) => ({
          id: match.metadata?.id as string || match.id,
          text: match.metadata?.text as string || "",
          sequence_number: (match.metadata?.sequence_number as number) || 0,
          score: match.score,
        }))
        .sort((a, b) => a.sequence_number - b.sequence_number);

      allChunks.push(...chunks);
      lastSequenceNumber = chunks[chunks.length - 1].sequence_number;

      // If we got fewer than MAX_TOP_K, we've reached the end
      if (filteredMatches.length < MAX_TOP_K) {
        hasMore = false;
      }

      // Respect limit if specified
      if (limit && allChunks.length >= limit) {
        hasMore = false;
      }
    }

    return limit ? allChunks.slice(0, limit) : allChunks;
  }
}
