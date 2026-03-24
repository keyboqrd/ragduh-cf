// Chat Tests

import { API_BASE_URL, E2E_API_KEY } from "./setup";

export interface ChatTestOptions {
  createdNamespaceId: string;
  createdDocumentId: string;
}

/**
 * Test: Chat query - answer questions based on ingested content
 */
export async function testChatQuery(createdNamespaceId: string, createdDocumentId: string): Promise<void> {
  const question = `What is the unique test identifier mentioned in the document?`;

  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-namespace-id": createdNamespaceId,
      "Authorization": `Bearer ${E2E_API_KEY}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: question }],
      topK: 5,
      minScore: 0.3,
      rerank: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.statusText}`);
  }

  // Parse SSE response
  const text = await response.text();

  console.log("=== CHAT SSE RAW RESPONSE ===");
  console.log(text);
  console.log("=== END SSE RAW RESPONSE ===");

  // Extract sources from data-sources event
  // SSE format: event: data-sources\n(data: {...}\n\n
  // Parse line by line to handle SSE format correctly
  const sourcesLine = text.match(/event: data-sources\n(data: \{[^\n]*\})/);
  const sources = sourcesLine
    ? JSON.parse(sourcesLine[1].replace('data: ', ''))?.results || []
    : [];

  console.log("=== SOURCES ===");
  console.log(JSON.stringify(sources, null, 2));

  // Extract text from text-delta events
  const textDeltaMatches = text.match(/event: text-delta\ndata: {"delta":"([^"]+)"}/g);
  const content = textDeltaMatches
    ? textDeltaMatches.map(m => {
        const delta = m.match(/"delta":"([^"]+)"/);
        return delta ? delta[1] : '';
      }).join('')
    : '';

  console.log(`Chat content length: ${content.length}`);

  if (content.length <= 0) {
    throw new Error("Chat content should not be empty");
  }

  // Verify sources were retrieved
  if (sources && sources.length > 0) {
    const sourceText = sources.map((s: any) => s.text).join(" ");
    if (!sourceText.includes("E2E Test Document")) {
      throw new Error("Source text does not contain expected content");
    }
  }

  console.log("Chat query successful");
}

/**
 * Test: Get document chunks
 */
export async function testGetDocumentChunks(
  createdNamespaceId: string,
  createdDocumentId: string
): Promise<void> {
  // Document chunks endpoint requires x-namespace-id header
  const response = await fetch(
    `${API_BASE_URL}/api/documents/${createdDocumentId}/chunks?limit=5`,
    {
      headers: {
        "x-namespace-id": createdNamespaceId,
        "Authorization": `Bearer ${E2E_API_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Get chunks request failed: ${response.statusText}`);
  }

  const data = await response.json() as any;

  if (!data.data || data.data.length === 0) {
    throw new Error("No chunks returned");
  }

  const firstChunk = data.data[0];
  if (firstChunk.id === undefined || firstChunk.text === undefined || firstChunk.sequence_number === undefined) {
    throw new Error(`Chunk missing required fields: ${JSON.stringify(firstChunk)}`);
  }

  console.log(`Retrieved ${data.data.length} document chunks`);
}

/**
 * Run all chat tests (for backward compatibility)
 */
export async function runChatTests(options: ChatTestOptions): Promise<void> {
  const { createdNamespaceId, createdDocumentId } = options;
  await testChatQuery(createdNamespaceId, createdDocumentId);
  await testGetDocumentChunks(createdNamespaceId, createdDocumentId);
}
