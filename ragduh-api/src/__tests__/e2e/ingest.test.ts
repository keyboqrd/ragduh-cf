// Document Ingestion Tests

import { API_BASE_URL, E2E_API_KEY, CLOUDFLARE_API_TOKEN, TEST_DOCUMENT_CONTENT, queryD1 } from "./setup";

export interface IngestTestResult {
  createdJobId: string;
  createdDocumentId: string;
}

/**
 * Test: Create ingest job with TEXT payload
 */
export async function createIngestJob(createdNamespaceId: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${E2E_API_KEY}`,
    },
    body: JSON.stringify({
      namespaceId: createdNamespaceId,
      payload: {
        type: "TEXT",
        text: TEST_DOCUMENT_CONTENT,
        fileName: "e2e-test-document.txt",
      },
      config: {
        chunkSize: 512,
        languageCode: "en",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create ingest job: ${response.statusText}`);
  }

  const data = await response.json() as any;

  if (!data.id) {
    throw new Error("Job ID not found");
  }
  if (data.status !== "QUEUED") {
    throw new Error("Job status should be QUEUED");
  }

  console.log(`Created ingest job: ${data.id}`);
  return data.id;
}

/**
 * Test: Wait for ingest job to complete
 */
export async function waitForJobCompletion(createdJobId: string): Promise<void> {
  const maxAttempts = 45;
  const pollInterval = 2000;

  let job: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`${API_BASE_URL}/api/jobs/${createdJobId}`, {
      headers: {
        "Authorization": `Bearer ${E2E_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    job = await response.json();

    if (job.status === "COMPLETED") {
      break;
    }

    if (job.status === "FAILED") {
      throw new Error(`Ingest job failed: ${job.error}`);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  if (job?.status !== "COMPLETED") {
    throw new Error(`Ingest job did not complete: ${job?.status}`);
  }

  if (!job?.completedAt) {
    throw new Error("Job completedAt should be defined");
  }

  console.log(`Ingest job completed: ${createdJobId}`);
}

/**
 * Test: Verify documents created
 */
export async function verifyDocumentsCreated(
  createdNamespaceId: string,
  createdJobId: string
): Promise<string> {
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

  if (data.data.length === 0) {
    throw new Error("No documents created");
  }

  const document = data.data[0] as any;

  if (document.totalChunks <= 0) {
    throw new Error("Document should have chunks");
  }
  if (document.status !== "COMPLETED") {
    throw new Error("Document status should be COMPLETED");
  }

  console.log(`Created document: ${document.id} with ${document.totalChunks} chunks`);
  return document.id;
}

/**
 * Test: Verify document in D1 database
 */
export async function verifyDocumentInD1(createdDocumentId: string): Promise<void> {
  if (!CLOUDFLARE_API_TOKEN) {
    console.warn("CLOUDFLARE_API_TOKEN not set - skipping D1 document verification");
    return;
  }

  const results = await queryD1(
    "SELECT id, name, status, totalChunks FROM document WHERE id = ?",
    [createdDocumentId]
  );

  if (results.length !== 1) {
    throw new Error("Expected 1 document in D1");
  }

  if (results[0].id !== createdDocumentId) {
    throw new Error("Document ID mismatch in D1");
  }
  if (results[0].status !== "COMPLETED") {
    throw new Error("Document status should be COMPLETED in D1");
  }
  if (results[0].totalChunks <= 0) {
    throw new Error("Document should have chunks in D1");
  }

  console.log("D1 document verified");
}

/**
 * Test: Verify document chunks in D1
 */
export async function verifyDocumentChunksInD1(createdDocumentId: string): Promise<void> {
  if (!CLOUDFLARE_API_TOKEN) {
    console.warn("CLOUDFLARE_API_TOKEN not set - skipping D1 chunks verification");
    return;
  }

  const results = await queryD1(
    "SELECT id, sequence_number, text FROM document_chunk WHERE document_id = ? ORDER BY sequence_number",
    [createdDocumentId]
  );

  if (results.length === 0) {
    throw new Error("No chunks found in D1");
  }

  // Verify chunks contain parts of our test content
  const allText = results.map(r => r.text).join(" ");
  if (!allText.includes("E2E Test Document")) {
    throw new Error("D1 chunks do not contain expected content");
  }

  console.log("D1 chunks verified");
}
