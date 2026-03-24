export interface CreateIngestJobRequest {
  namespaceId: string;
  payload: {
    type: "TEXT" | "FILE";
    text?: string;
    fileUrl?: string;
    fileName?: string;
  };
  config?: {
    chunkSize?: number;
    languageCode?: string | null;
  };
}

export interface BatchItem {
  type: "TEXT" | "FILE";
  text?: string;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
}

export interface CreateBatchIngestJobRequest {
  namespaceId: string;
  payload: {
    type: "BATCH";
    items: BatchItem[];
  };
  config?: {
    chunkSize?: number;
    languageCode?: string | null;
  };
}

export interface IngestJob {
  id: string;
  status: string;
  name?: string | null;
  error?: string | null;
  createdAt: string;
  completedAt?: string | null;
  failedAt?: string | null;
  batchCount?: number;
}

export interface IngestJobWithNamespace extends IngestJob {
  namespaceId: string;
}

export interface Document {
  id: string;
  name: string;
  status: string;
  totalChunks: number;
  totalTokens: number;
  totalPages: number;
  createdAt: string;
  error?: string | null;
  totalCharacters?: number;
  documentProperties?: Record<string, unknown> | null;
  updatedAt?: string;
  preProcessingAt?: string | null;
  processingAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    limit: number;
    hasMore: boolean;
    startCursor: string | null;
    endCursor: string | null;
    nextCursor: string | null;
    prevCursor: string | null;
  };
}

export interface ApiError {
  message: string;
}

export interface ListOptions {
  cursor?: string;
  limit?: number;
  statuses?: string[];
  orderBy?: "createdAt" | "updatedAt";
  order?: "asc" | "desc";
}

export interface Namespace {
  id: string;
  name: string | null;
  slug: string | null;
  organizationId: string;
  createdAt: string;
}

// Chat interfaces
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatSource {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface ChatResponse {
  message: ChatMessage;
  sources?: ChatSource[];
  logs?: string[];
}

export interface ChatOptions {
  namespaceId?: string;
  temperature?: number;
  topK?: number;
  minScore?: number;
  rerank?: boolean;
  rerankLimit?: number;
  rerankModel?: string;
  llmModel?: string;
  systemPrompt?: string;
  mode?: "normal" | "agentic" | "deepResearch";
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

function getApiKey(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('e2e_api_key');
  }
  return null;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = getApiKey();
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

// Get MIME type based on file extension
function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    // Text files
    txt: 'text/plain',
    md: 'text/markdown',
    // Web files
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    // JavaScript/TypeScript
    js: 'text/javascript',
    jsx: 'text/javascript',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    // Python
    py: 'text/x-python',
    pyw: 'text/x-python',
    // Java
    java: 'text/x-java-source',
    // C#
    cs: 'text/x-csharp',
    // C/C++
    c: 'text/x-c',
    cpp: 'text/x-c++src',
    cc: 'text/x-c++src',
    h: 'text/x-c',
    hpp: 'text/x-c++hdr',
    hxx: 'text/x-c++hdr',
    // Go
    go: 'text/x-go',
    // Rust
    rs: 'text/x-rust',
    // Ruby
    rb: 'text/x-ruby',
    // PHP
    php: 'text/x-php',
    // Swift
    swift: 'text/x-swift',
    // Kotlin
    kt: 'text/x-kotlin',
    kts: 'text/x-kotlin',
    // Vue/Svelte
    vue: 'text/x-vue',
    svelte: 'text/x-svelte',
    // Config files
    json: 'application/json',
    yaml: 'text/yaml',
    yml: 'text/yaml',
    toml: 'text/x-toml',
    xml: 'application/xml',
    ini: 'text/x-ini',
    cfg: 'text/x-ini',
    conf: 'text/x-ini',
    // Shell scripts
    sh: 'text/x-sh',
    bash: 'text/x-sh',
    zsh: 'text/x-sh',
    fish: 'text/x-sh',
    ps1: 'text/x-powershell',
    bat: 'text/x-bat',
    cmd: 'text/x-bat',
    // Build files
    makefile: 'text/x-makefile',
    cmake: 'text/x-cmake',
    gradle: 'text/x-gradle',
    // Other config
    env: 'text/plain',
    gitignore: 'text/x-gitignore',
    dockerignore: 'text/plain',
    npmrc: 'text/plain',
    editorconfig: 'text/plain',
    eslintignore: 'text/plain',
    prettierignore: 'text/plain',
    tsconfig: 'application/json',
    jsconfig: 'application/json',
    // SQL
    sql: 'application/sql',
  };
  return mimeTypes[ext || ''] || 'text/plain';
}

export async function createIngestJob(
  namespaceId: string,
  file: File,
  chunkSize?: number
): Promise<IngestJob> {
  // For demo, we read the file content and send as TEXT payload
  const text = await readFileAsText(file);

  const response = await fetch(`${API_BASE_URL}/api/jobs`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      namespaceId: namespaceId,
      payload: {
        type: "TEXT" as const,
        text,
        fileName: file.name,
      },
      config: {
        chunkSize: chunkSize || 2048,
        languageCode: "en",
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function createBatchIngestJob(
  namespaceId: string,
  files: File[],
  chunkSize?: number,
  jobName?: string
): Promise<IngestJob & { batchCount: number }> {
  // Read all file contents and detect MIME types
  const items = await Promise.all(
    files.map(async (file) => ({
      type: "TEXT" as const,
      text: await readFileAsText(file),
      fileName: file.name,
      mimeType: getMimeType(file.name),
    }))
  );

  const response = await fetch(`${API_BASE_URL}/api/jobs`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      namespaceId: namespaceId,
      name: jobName,
      payload: {
        type: "BATCH" as const,
        items,
      },
      config: {
        chunkSize: chunkSize || 2048,
        languageCode: "en",
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function getIngestJob(jobId: string): Promise<IngestJob> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function listIngestJobs(
  namespaceId: string,
  options?: ListOptions
): Promise<PaginationResult<IngestJobWithNamespace>> {
  const params = new URLSearchParams();
  if (options?.cursor) params.set("cursor", options.cursor);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.orderBy) params.set("orderBy", options.orderBy);
  if (options?.order) params.set("order", options.order);
  if (options?.statuses?.length) {
    for (const status of options.statuses) {
      params.append("statuses", status);
    }
  }

  const response = await fetch(
    `${API_BASE_URL}/api/namespaces/${namespaceId}/jobs?${params.toString()}`,
    {
      headers: getHeaders(),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function deleteIngestJob(
  namespaceId: string,
  jobId: string
): Promise<{ message: string; job: { id: string; namespaceId: string; status: string; name: string | null } }> {
  const response = await fetch(
    `${API_BASE_URL}/api/namespaces/${namespaceId}/jobs/${jobId}`,
    {
      method: "DELETE",
      headers: getHeaders(),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function listDocuments(
  namespaceId: string,
  options?: ListOptions
): Promise<PaginationResult<Document>> {
  const params = new URLSearchParams();
  if (options?.cursor) params.set("cursor", options.cursor);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.orderBy) params.set("orderBy", options.orderBy);
  if (options?.order) params.set("order", options.order);
  if (options?.statuses?.length) {
    for (const status of options.statuses) {
      params.append("statuses", status);
    }
  }

  const response = await fetch(
    `${API_BASE_URL}/api/namespaces/${namespaceId}/documents?${params.toString()}`,
    {
      headers: getHeaders(),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function getDocument(documentId: string): Promise<Document> {
  const response = await fetch(`${API_BASE_URL}/api/documents/${documentId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function deleteDocument(
  namespaceId: string,
  documentId: string
): Promise<{ message: string; document: { id: string; name: string; status: string } }> {
  const response = await fetch(
    `${API_BASE_URL}/api/namespaces/${namespaceId}/documents/${documentId}`,
    {
      method: "DELETE",
      headers: getHeaders(),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function sendMessage(
  namespaceId: string,
  messages: ChatMessage[],
  options?: ChatOptions
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      ...getHeaders(),
      "x-namespace-id": namespaceId,
    },
    body: JSON.stringify({
      messages,
      temperature: options?.temperature,
      topK: options?.topK || 10,
      minScore: options?.minScore,
      rerank: options?.rerank ?? true,
      rerankLimit: options?.rerankLimit,
      rerankModel: options?.rerankModel,
      llmModel: options?.llmModel,
      systemPrompt: options?.systemPrompt,
      mode: options?.mode || "normal",
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }

  return response.body;
}

export async function getNamespace(id: string): Promise<Namespace> {
  const response = await fetch(`${API_BASE_URL}/api/namespaces/${id}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.data;
}

export async function listNamespaces(
  organizationId?: string
): Promise<Namespace[]> {
  const params = new URLSearchParams();
  if (organizationId) params.set("organizationId", organizationId);

  const response = await fetch(
    `${API_BASE_URL}/api/namespaces?${params.toString()}`,
    {
      headers: getHeaders(),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.data;
}

export async function createNamespace(
  name: string,
  slug: string
): Promise<Namespace> {
  const response = await fetch(`${API_BASE_URL}/api/namespaces`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ name, slug }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.data;
}

export async function updateNamespace(
  id: string,
  name?: string,
  slug?: string
): Promise<Namespace> {
  const response = await fetch(`${API_BASE_URL}/api/namespaces/${id}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ name, slug }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.data;
}

export async function deleteNamespace(id: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/api/namespaces/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export interface DocumentChunk {
  id: string;
  text: string;
  sequence_number: number;
  score?: number;
}

export async function getDocumentChunks(
  namespaceId: string,
  documentId: string,
  limit?: number
): Promise<DocumentChunk[]> {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));

  const response = await fetch(
    `${API_BASE_URL}/api/documents/${documentId}/chunks?${params.toString()}`,
    {
      headers: {
        ...getHeaders(),
        "x-namespace-id": namespaceId,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.data;
}
