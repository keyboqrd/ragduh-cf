// E2E Test Configuration and Helpers

export const API_BASE_URL = process.env.E2E_API_URL || "http://localhost:8787";
export const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
export const CF_ACCOUNT_ID = "b5594238c553f425aba4f73694ff8bd4";
export const E2E_D1_DATABASE_ID = "f026b8d7-cd08-4a0f-ad30-636ddb3e7135";
export const E2E_VECTORIZE_INDEX = "ragduh-vec-test";

export const E2E_API_KEY = process.env.API_KEY || (() => {
  console.error("[E2E SETUP] API_KEY not found in environment!");
  throw new Error("API_KEY environment variable is required for E2E tests");
})();

// Test data - unique content for reliable retrieval testing
export const TEST_DOCUMENT_ID = `E2E-TEST-ID-${Date.now()}-${Math.random().toString(36).substring(7)}`;
export const TEST_DOCUMENT_CONTENT = `
# E2E Test Document

## Unique Identifier
The unique test identifier is: ${TEST_DOCUMENT_ID}

## Overview
This document is created for end-to-end testing of the Ragduh API.
It tests the complete ingestion pipeline including:
- Document creation
- Chunking and embedding
- Vector storage
- Semantic retrieval
- Chat with context

## Test Sections

### Section 1: Ingestion
The document ingestion process converts text into searchable chunks.
Each chunk is embedded using Cloudflare Workers AI with the bge-m3 model.

### Section 2: Retrieval
Semantic retrieval finds relevant chunks based on query embeddings.
The system uses Vectorize for fast similarity search.

### Section 3: Chat
Chat queries combine retrieved context with LLM responses.
The system streams responses using Server-Sent Events.
`;

// E2E-specific resource names (with timestamp to avoid conflicts)
export const E2E_NAMESPACE_NAME = `e2e-test-ns-${Date.now()}`;
export const E2E_NAMESPACE_SLUG = `e2e-${Date.now()}`;

export interface IngestJob {
  id: string;
  status: string;
  error?: string | null;
  createdAt: string | Date;
  completedAt?: string | Date | null;
  failedAt?: string | Date | null;
}

export interface Document {
  id: string;
  status: string;
  totalChunks: number;
}

export interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * Clear ALL E2E resources before tests: D1 tables, Vectorize index, Queue
 */
export async function clearAllE2EResources(): Promise<void> {
  if (!CLOUDFLARE_API_TOKEN) {
    console.error("CLOUDFLARE_API_TOKEN not set - cannot clear resources");
    return;
  }

  try {
    // 1. Clear D1 tables - delete ALL data (not just e2e)
    console.log("Clearing D1 database tables...");

    // Delete in reverse foreign key order to avoid constraint issues
    // document_chunk references document, so delete chunks first
    await queryD1("DELETE FROM document_chunk");
    console.log("  - document_chunk cleared");

    await queryD1("DELETE FROM document");
    console.log("  - document cleared");

    await queryD1("DELETE FROM ingest_job");
    console.log("  - ingest_job cleared");

    await queryD1("DELETE FROM namespace");
    console.log("  - namespace cleared");

    console.log("D1 tables cleared (all data)");

    // 2. Clear Vectorize index - delete all vectors
    console.log("Clearing Vectorize index...");
    await clearVectorizeIndex();
    console.log("Vectorize index cleared");

    // 3. Clear Queue messages (purge queue)
    console.log("Clearing Queue messages...");
    await purgeQueue();
    console.log("Queue cleared");

    console.log("All E2E resources cleared successfully");
  } catch (e) {
    console.error("Clear resources failed:", e);
    throw e; // Re-throw to fail tests clearly
  }
}

/**
 * Helper: Clear all vectors from Vectorize index
 * Repeatedly queries and deletes until index is empty
 */
async function clearVectorizeIndex(): Promise<void> {
  let iteration = 0;
  const maxIterations = 10; // Safety limit
  const MAX_TOP_K = 100;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`[Vectorize Clear] Iteration ${iteration}...`);

    // Query all vectors
    const queryResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/vectorize/v2/indexes/${E2E_VECTORIZE_INDEX}/query`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vector: new Array(1024).fill(0),
          topK: MAX_TOP_K,
          returnValues: false,
          returnMetadata: "indexed",
        }),
      }
    );

    if (!queryResponse.ok) {
      console.error(`[Vectorize Clear] Query failed: ${queryResponse.status}`);
      break;
    }

    const queryData = await queryResponse.json() as any;
    const matches = queryData.result?.matches || [];

    if (matches.length === 0) {
      console.log("[Vectorize Clear] Index is now empty");
      break;
    }

    const allVectorIds = matches.map((m: any) => m.id);
    console.log(`[Vectorize Clear] Found ${allVectorIds.length} vectors to delete`);

    // Delete in batches of 100
    for (let i = 0; i < allVectorIds.length; i += 100) {
      const batch = allVectorIds.slice(i, i + 100);
      const batchNum = Math.floor(i / 100) + 1;
      console.log(`[Vectorize Clear] Deleting batch ${batchNum}, ${batch.length} vectors`);

      const deleteResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/vectorize/v2/indexes/${E2E_VECTORIZE_INDEX}/delete_by_ids`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: batch }),
        }
      );

      if (!deleteResponse.ok) {
        console.error(`[Vectorize Clear] Delete batch ${batchNum} failed: ${deleteResponse.status}`);
      }
    }

    // Wait for deletion to propagate before next iteration
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Final verification
  const verifyResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/vectorize/v2/indexes/${E2E_VECTORIZE_INDEX}/query`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vector: new Array(1024).fill(0),
        topK: 10,
        returnValues: false,
        returnMetadata: "indexed",
      }),
    }
  );

  if (verifyResponse.ok) {
    const verifyData = await verifyResponse.json() as any;
    const remainingCount = verifyData.result?.matches?.length || 0;
    console.log(`[Vectorize Clear] Final verification: ${remainingCount} vectors remaining`);
    if (remainingCount > 0) {
      console.warn("[Vectorize Clear] WARNING: Index still not empty after cleanup");
    }
  }
}

/**
 * Helper: Purge queue messages
 */
export async function purgeQueue(): Promise<void> {
  if (!CLOUDFLARE_API_TOKEN) return;

  try {
    // List queues to find the job queue
    const queuesResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/queues`,
      {
        headers: {
          "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
        },
      }
    );

    if (queuesResponse.ok) {
      const queuesData = await queuesResponse.json() as any;
      const queue = queuesData.result?.find((q: any) => q.name === "ragduh-queue-test");

      if (queue) {
        console.log("[Queue Purge] Purging job queue...");
        const purgeResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/queues/${queue.name}/purge`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
            },
          }
        );

        if (purgeResponse.ok) {
          console.log("[Queue Purge] Queue purged successfully");
        } else {
          console.warn(`[Queue Purge] Purge failed: ${purgeResponse.status}`);
        }
      }
    }
  } catch (error) {
    console.warn("[Queue Purge] Error:", error);
  }
}

/**
 * Helper: Direct D1 query via Cloudflare API
 */
export async function queryD1(sql: string, bindParams: any[] = []): Promise<any[]> {
  if (!CLOUDFLARE_API_TOKEN) {
    throw new Error("CLOUDFLARE_API_TOKEN not set");
  }

  const rawResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${E2E_D1_DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql,
        params: bindParams,
      }),
    }
  );

  if (!rawResponse.ok) {
    const error = await rawResponse.text();
    throw new Error(`D1 query failed: ${error}`);
  }

  const rawJson = await rawResponse.json() as any;

  // Cloudflare D1 API returns: { result: [{ results: [...], success: true, meta: {...} }], errors: [], messages: [], success: true }
  // The actual query results are nested inside the first element of the result array
  const results = rawJson.result?.[0]?.results || rawJson.result || rawJson.results || [];
  return results;
}

/**
 * Helper: Direct Vectorize query via Cloudflare API (v2 index)
 */
export async function queryVectorize(documentId: string): Promise<VectorizeMatch[]> {
  if (!CLOUDFLARE_API_TOKEN) {
    throw new Error("CLOUDFLARE_API_TOKEN not set");
  }

  // Vectorize v2 API via Cloudflare Management API
  // Note: returnMetadata="all" limits topK to 50, use "indexed" for topK=100
  // But "indexed" only returns indexed metadata fields, not full text

  const requestBody = {
    vector: new Array(1024).fill(0),
    topK: 50,  // Max with returnMetadata="all" is 50
    returnMetadata: "all",  // Need full metadata for client-side filtering
  };

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/vectorize/v2/indexes/${E2E_VECTORIZE_INDEX}/query`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Vectorize query failed: ${responseText}`);
  }

  const responseText = await response.text();
  const data = JSON.parse(responseText);
  let matches = data.result?.matches || [];

  // Client-side filter by document_id (same approach as Worker Binding API)
  if (documentId && matches.length > 0) {
    const beforeFilter = matches.length;
    matches = matches.filter((m: any) => m.metadata?.document_id === documentId);
    console.log(`Filtered from ${beforeFilter} to ${matches.length} matches for document ${documentId}`);
  }

  return matches;
}
