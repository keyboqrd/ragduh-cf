// Vectorize Tests

import { CLOUDFLARE_API_TOKEN, queryVectorize } from "./setup";

export interface VectorizeTestOptions {
  createdNamespaceId: string;
  createdDocumentId: string;
}

/**
 * Test: Verify vectors in Vectorize
 */
export async function testVerifyVectorsInVectorize(
  createdNamespaceId: string,
  createdDocumentId: string
): Promise<void> {
  if (!CLOUDFLARE_API_TOKEN) {
    throw new Error("CLOUDFLARE_API_TOKEN not set");
  }

  // Wait for vectors to appear in Vectorize (upsert may have propagation delay)
  const maxAttempts = 10;
  const pollInterval = 2000;
  let matches: any[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // First, query without filter to see if index has any vectors
    const allMatches = await queryVectorize("");  // Empty documentId = no filter

    console.log(`=== ALL VECTORS IN INDEX (attempt ${attempt + 1}) ===`);
    console.log(`Found ${allMatches.length} vectors`);
    if (allMatches.length > 0) {
      console.log("Sample metadata:", JSON.stringify(allMatches[0].metadata, null, 2));
    }

    // Then query with document filter
    matches = await queryVectorize(createdDocumentId);
    console.log(`Found ${matches.length} vectors for document ${createdDocumentId}`);

    if (matches.length > 0) {
      break; // Success
    }

    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  if (matches.length === 0) {
    throw new Error("No vectors found in Vectorize");
  }

  // Verify metadata contains expected fields
  const firstMatch = matches[0];
  if (!firstMatch.metadata) {
    throw new Error("Vector metadata is missing");
  }
  if (firstMatch.metadata.document_id !== createdDocumentId) {
    throw new Error("Vector document_id mismatch");
  }
  if (firstMatch.metadata.namespace_id !== createdNamespaceId) {
    throw new Error("Vector namespace_id mismatch");
  }

  console.log(`Verified ${matches.length} vectors in Vectorize`);
}

/**
 * Run all vectorize tests (for backward compatibility)
 */
export async function runVectorizeTests(options: VectorizeTestOptions): Promise<void> {
  const { createdNamespaceId, createdDocumentId } = options;
  await testVerifyVectorsInVectorize(createdNamespaceId, createdDocumentId);
}
