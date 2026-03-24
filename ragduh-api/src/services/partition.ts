import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export interface Chunk {
  id: string;
  text: string;
  tokenCount: number;
  startIndex: number;
  endIndex: number;
  metadata?: Record<string, unknown>;
}

export interface PartitionOptions {
  chunkSize: number;
  languageCode?: string | null;
}

/**
 * Chunk text using LangChain's RecursiveCharacterTextSplitter.
 *
 * Splits text recursively at paragraph, sentence, word, and character boundaries,
 * ensuring chunks respect the specified size limit without cutting words in half.
 *
 * Default separators (in order of preference):
 * 1. Double newlines (\n\n) - paragraph breaks
 * 2. Single newlines (\n) - line breaks
 * 3. Sentence endings (. ! ?) - sentence boundaries
 * 4. Space ( ) - word boundaries
 * 5. Empty string - character level (last resort)
 */
export async function chunkText(
  text: string,
  options: PartitionOptions
): Promise<Chunk[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: options.chunkSize,
    chunkOverlap: 0,
  });

  const texts = await splitter.splitText(text);

  // Track positions in original text
  let currentPosition = 0;
  const chunks: Chunk[] = [];

  for (const chunkText of texts) {
    // Find the position of this chunk in the original text
    const startIndex = text.indexOf(chunkText, currentPosition);
    const endIndex = startIndex + chunkText.length;

    chunks.push({
      id: crypto.randomUUID(),
      text: chunkText.trim(),
      tokenCount: Math.ceil(chunkText.length / 4), // Rough character-to-token estimate
      startIndex,
      endIndex,
    });

    currentPosition = endIndex;
  }

  return chunks;
}

/**
 * Parse text content and split into pages if delimiter is present
 */
export function parseText(
  content: string,
  delimiter?: string | null
): { page: number | null; text: string }[] {
  const pageDelimiter = delimiter || "___PAGE_DELIMITER___";

  if (!delimiter) {
    return [{ page: null, text: content }];
  }

  const pages = content.split(pageDelimiter);

  return pages
    .map((page, idx) => ({
      text: page.trim(),
      page: idx + 1,
    }))
    .filter((p) => p.text.length > 0);
}

/**
 * Download file from URL and return content
 */
export async function downloadFile(url: string): Promise<{
  content: string;
  mimeType: string;
  sizeInBytes: number;
}> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const content = new TextDecoder("utf-8").decode(bytes);
  const mimeType = response.headers.get("content-type") || "application/octet-stream";

  return {
    content,
    mimeType,
    sizeInBytes: bytes.length,
  };
}
