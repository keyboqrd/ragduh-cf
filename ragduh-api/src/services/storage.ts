import { DatabaseService } from "./database";
import { VectorizeService } from "./vectorize";
import { listIngestJobs, listDocuments } from "./database-list";
import {
  queueDeleteIngestJob,
  queueDeleteDocument,
  executeDeleteIngestJob,
  executeDeleteDocument,
} from "./database-delete";
import { Chunk } from "./partition";

// Unified interface for vectorize operations
interface IVectorize {
  query(options: any): Promise<any[]>;
  upsert(namespaceId: string, chunks: Chunk[]): Promise<void>;
  delete(namespaceId: string, documentId: string): Promise<void>;
  getDocumentChunks(namespaceId: string, documentId: string, limit?: number): Promise<any[]>;
}

export interface StorageConfig {
  db: D1Database;
  vectorizeIndex: VectorizeIndex;
}

/**
 * StorageService - Facade for database and Vectorize operations
 */
export class StorageService {
  private database: DatabaseService;
  private vectorize: IVectorize;

  constructor(config: StorageConfig) {
    this.database = new DatabaseService({ binding: config.db });
    this.vectorize = new VectorizeService({ binding: config.vectorizeIndex as VectorizeIndex }) as unknown as IVectorize;
  }

  // Database operations (via DatabaseService)
  async createIngestJob(data: {
    namespaceId: string;
    payload: Record<string, unknown>;
    config?: Record<string, unknown> | null;
    name?: string | null;
  }) {
    return this.database.createIngestJob(data);
  }

  async getIngestJob(id: string) {
    return this.database.getIngestJob(id);
  }

  async updateIngestJobStatus(id: string, status: string, error?: string | null) {
    return this.database.updateIngestJobStatus(id, status, error);
  }

  async createDocuments(data: {
    namespaceId: string;
    ingestJobId: string;
    documents: Array<{
      name?: string | null;
      source: Record<string, unknown>;
      totalCharacters?: number;
      totalChunks?: number;
      totalPages?: number;
      documentProperties?: Record<string, unknown>;
      status?: string;
      error?: string | null;
      failedAt?: Date | null;
    }>;
  }) {
    return this.database.createDocuments(data);
  }

  async updateDocument(id: string, data: Record<string, unknown>) {
    return this.database.updateDocument(id, data);
  }

  async updateDocumentStatus(id: string, status: string, error?: string | null) {
    return this.database.updateDocumentStatus(id, status, error);
  }

  async getDocument(id: string) {
    return this.database.getDocument(id);
  }

  async updateTotalPages(namespaceId: string, totalPages: number) {
    return this.database.updateTotalPages(namespaceId, totalPages);
  }

  async updateNamespaceCounters(
    namespaceId: string,
    delta: { totalDocuments?: number; totalPages?: number; totalIngestJobs?: number }
  ) {
    return this.database.updateNamespaceCounters(namespaceId, delta);
  }

  async cleanup(): Promise<void> {
    return this.database.cleanup();
  }

  // List operations (via database-list.ts)
  async listIngestJobs(params: {
    namespaceId: string;
    cursor?: string;
    limit: number;
    ingestJobId?: string;
    statuses?: string[];
    orderBy: "createdAt" | "updatedAt";
    order: "asc" | "desc";
  }) {
    return listIngestJobs(this.database, params);
  }

  async listDocuments(params: {
    namespaceId: string;
    cursor?: string;
    limit: number;
    ingestJobId?: string;
    statuses?: string[];
    orderBy: "createdAt" | "updatedAt";
    order: "asc" | "desc";
  }) {
    return listDocuments(this.database, params);
  }

  // Delete operations (via database-delete.ts)
  async queueDeleteIngestJob(id: string, namespaceId: string) {
    return queueDeleteIngestJob(this.database, id, namespaceId);
  }

  async queueDeleteDocument(id: string, namespaceId: string) {
    return queueDeleteDocument(this.database, id, namespaceId);
  }

  async executeDeleteIngestJob(jobId: string, namespaceId: string) {
    return executeDeleteIngestJob(
      this.database,
      jobId,
      namespaceId,
      (nsId, docId) => this.vectorize.delete(nsId, docId)
    );
  }

  async executeDeleteDocument(documentId: string, namespaceId: string) {
    return executeDeleteDocument(
      this.database,
      documentId,
      namespaceId,
      (nsId, docId) => this.vectorize.delete(nsId, docId)
    );
  }

  // Vectorize operations
  async queryVectorize(
    namespaceId: string,
    embedding: number[],
    topK: number,
    minScore?: number,
    filter?: Record<string, any>
  ): Promise<any[]> {
    return this.vectorize.query({ namespaceId, embedding, topK, minScore, filter });
  }

  async upsertToVectorize(namespaceId: string, chunks: Chunk[]): Promise<void> {
    return this.vectorize.upsert(namespaceId, chunks);
  }

  async deleteFromVectorize(namespaceId: string, documentId: string): Promise<void> {
    return this.vectorize.delete(namespaceId, documentId);
  }

  async deleteDocument(documentId: string, namespaceId: string): Promise<void> {
    // Delete from D1 (cascade will delete document_chunk)
    await this.database.db
      .prepare("DELETE FROM document WHERE id = ? AND namespaceId = ?")
      .bind(documentId, namespaceId)
      .run();
  }

  async getDocumentsByIngestJob(namespaceId: string, ingestJobId: string): Promise<any[]> {
    const { results } = await this.database.db
      .prepare("SELECT * FROM document WHERE namespaceId = ? AND ingestJobId = ? ORDER BY createdAt ASC")
      .bind(namespaceId, ingestJobId)
      .all();

    return (results || []).map((row: any) => ({
      ...row,
      source: row.source ? JSON.parse(row.source) : null,
      documentProperties: row.documentProperties ? JSON.parse(row.documentProperties) : null,
    }));
  }

  async deleteDocumentChunks(documentId: string): Promise<void> {
    await this.database.db
      .prepare("DELETE FROM document_chunk WHERE document_id = ?")
      .bind(documentId)
      .run();
  }

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
    return this.database.getDocumentChunks(namespaceId, documentId, limit);
  }

  async createDocumentChunks(chunks: Array<{
    id: string;
    documentId: string;
    namespaceId: string;
    sequence_number: number;
    text: string;
  }>): Promise<void> {
    return this.database.createDocumentChunks(chunks);
  }
}
