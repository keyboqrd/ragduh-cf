// Cleanup Tests

import { API_BASE_URL, E2E_API_KEY, CLOUDFLARE_API_TOKEN, queryD1, queryVectorize } from "./setup";

export interface CleanupTestOptions {
  createdNamespaceId: string;
  createdJobId: string;
  createdDocumentId: string;
}

/**
 * Test: Delete ingest job
 */
export async function testDeleteIngestJob(
  createdNamespaceId: string,
  createdJobId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/namespaces/${createdNamespaceId}/jobs/${createdJobId}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${E2E_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Delete job request failed: ${response.statusText}`);
  }

  const data = await response.json() as any;
  if (!data.message.includes("queued for deletion")) {
    throw new Error("Delete job response unexpected");
  }
  if (data.job.id !== createdJobId) {
    throw new Error("Delete job response should contain job ID");
  }

  console.log(`Ingest job deletion queued: ${createdJobId}`);
}

/**
 * Test: Verify documents deleted
 */
export async function testVerifyDocumentsDeleted(
  createdNamespaceId: string,
  createdJobId: string
): Promise<void> {
  // Poll until documents are deleted (max 30 seconds)
  const maxAttempts = 6;
  const pollInterval = 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(
      `${API_BASE_URL}/api/namespaces/${createdNamespaceId}/documents?ingestJobId=${createdJobId}`,
      {
        headers: {
          "Authorization": `Bearer ${E2E_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get documents: ${response.statusText}`);
    }

    const data = await response.json() as any;
    const remainingDocuments = data.data.filter(
      (d: any) => d.status === "COMPLETED"
    );

    if (remainingDocuments.length === 0) {
      break; // Success, documents are deleted
    }

    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Final check - should be 0
  const finalResponse = await fetch(
    `${API_BASE_URL}/api/namespaces/${createdNamespaceId}/documents?ingestJobId=${createdJobId}`,
    {
      headers: {
        "Authorization": `Bearer ${E2E_API_KEY}`,
      },
    }
  );
  const finalData = await finalResponse.json() as any;
  const finalRemaining = finalData.data.filter(
    (d: any) => d.status === "COMPLETED"
  );

  if (finalRemaining.length !== 0) {
    throw new Error("Documents were not deleted after job deletion");
  }

  console.log("Documents deleted successfully");
}

/**
 * Test: Verify vectors are deleted from Vectorize
 */
export async function testVerifyVectorsDeleted(createdDocumentId: string): Promise<void> {
  if (!CLOUDFLARE_API_TOKEN) {
    console.warn("CLOUDFLARE_API_TOKEN not set - skipping Vectorize verification");
    return;
  }

  // Poll until vectors are deleted (max 30 seconds)
  const maxAttempts = 12;
  const pollInterval = 2500;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const matches = await queryVectorize(createdDocumentId);

    if (matches.length === 0) {
      break; // Success, vectors are deleted
    }

    console.log(`[Vectorize Delete Check] Attempt ${attempt + 1}: ${matches.length} vectors remaining`);

    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Final check - should be 0
  const finalMatches = await queryVectorize(createdDocumentId);
  console.log(`[Vectorize Delete Check] Final: ${finalMatches.length} vectors remaining`);

  if (finalMatches.length !== 0) {
    throw new Error(`Vectorize vectors not deleted: ${finalMatches.length} remaining`);
  }
}

/**
 * Test: Verify document is deleted from D1
 */
export async function testVerifyDocumentDeletedFromD1(createdDocumentId: string): Promise<void> {
  if (!CLOUDFLARE_API_TOKEN) {
    console.warn("CLOUDFLARE_API_TOKEN not set - skipping D1 document verification");
    return;
  }

  const results = await queryD1(
    "SELECT id FROM document WHERE id = ?",
    [createdDocumentId]
  );

  if (results.length !== 0) {
    throw new Error("Document not deleted from D1");
  }
}

/**
 * Test: Verify chunks are deleted from D1
 */
export async function testVerifyChunksDeletedFromD1(createdDocumentId: string): Promise<void> {
  if (!CLOUDFLARE_API_TOKEN) {
    console.warn("CLOUDFLARE_API_TOKEN not set - skipping D1 chunks verification");
    return;
  }

  const results = await queryD1(
    "SELECT id FROM document_chunk WHERE document_id = ?",
    [createdDocumentId]
  );

  if (results.length !== 0) {
    throw new Error("Document chunks not deleted from D1");
  }
}

/**
 * Test: Delete namespace
 */
export async function testDeleteNamespace(createdNamespaceId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/namespaces/${createdNamespaceId}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${E2E_API_KEY}`,
      },
    }
  );

  // Skip if already deleted (404)
  if (response.status === 404) {
    console.log(`Namespace ${createdNamespaceId} already deleted, skipping`);
    return;
  }

  if (!response.ok) {
    throw new Error(`Delete namespace request failed: ${response.statusText}`);
  }

  const data = await response.json() as any;
  if (!data.message.includes("deleted")) {
    throw new Error("Delete namespace response unexpected");
  }

  console.log(`Namespace deleted: ${createdNamespaceId}`);
}

/**
 * Test: Verify namespace not found
 */
export async function testVerifyNamespaceNotFound(createdNamespaceId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/namespaces/${createdNamespaceId}`,
    {
      headers: {
        "Authorization": `Bearer ${E2E_API_KEY}`,
      },
    }
  );

  if (response.status !== 404) {
    throw new Error("Namespace should be not found after deletion");
  }

  console.log("Namespace deletion verified");
}

/**
 * Run all cleanup tests (for backward compatibility)
 */
export async function runCleanupTests(options: CleanupTestOptions): Promise<void> {
  const { createdNamespaceId, createdJobId, createdDocumentId } = options;

  await testDeleteIngestJob(createdNamespaceId, createdJobId);
  await testVerifyDocumentsDeleted(createdNamespaceId, createdJobId);
  await testVerifyVectorsDeleted(createdDocumentId);
  await testVerifyDocumentDeletedFromD1(createdDocumentId);
  await testVerifyChunksDeletedFromD1(createdDocumentId);
  await testDeleteNamespace(createdNamespaceId);
  await testVerifyNamespaceNotFound(createdNamespaceId);
}
