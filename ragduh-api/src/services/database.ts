import { Chunk } from "./partition";

export interface DatabaseConfig {
  binding: D1Database;
}

export class DatabaseService {
  public db: D1Database;

  constructor(config: DatabaseConfig) {
    this.db = config.binding;
  }

  // ============ Organization ============

  async getOrCreateDefaultOrganization() {
    const defaultOrg = {
      id: "default-org",
      name: "Default Organization",
      slug: "default",
    };

    // Try to get existing
    let result = await this.db
      .prepare("SELECT * FROM organization WHERE slug = ?")
      .bind(defaultOrg.slug)
      .first<any>();

    if (result) {
      return result;
    }

    // Create if not exists
    try {
      await this.db
        .prepare("INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)")
        .bind(defaultOrg.id, defaultOrg.name, defaultOrg.slug)
        .run();
      return defaultOrg;
    } catch (e: any) {
      // Ignore unique constraint errors (already exists)
      if (!e.message.includes("UNIQUE")) {
        throw e;
      }
      return await this.db
        .prepare("SELECT * FROM organization WHERE slug = ?")
        .bind(defaultOrg.slug)
        .first<any>();
    }
  }

  // ============ Namespace ============

  async listNamespaces(): Promise<any[]> {
    const { results } = await this.db
      .prepare("SELECT id, name, slug, organizationId, createdAt FROM namespace ORDER BY createdAt DESC")
      .all();
    return results || [];
  }

  async createNamespace(data: {
    id?: string;
    name: string;
    slug: string;
  }): Promise<any> {
    const org = await this.getOrCreateDefaultOrganization();
    const id = data.id || crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db
      .prepare("INSERT INTO namespace (id, name, slug, organizationId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, data.name, data.slug, org.id, now, now)
      .run();

    return {
      id,
      name: data.name,
      slug: data.slug,
      organizationId: org.id,
      createdAt: now,
    };
  }

  async deleteNamespace(id: string): Promise<void> {
    // Delete associated documents first (cascade may not work in SQLite)
    await this.db
      .prepare("DELETE FROM document WHERE namespaceId = ?")
      .bind(id)
      .run();

    // Delete associated ingest jobs
    await this.db
      .prepare("DELETE FROM ingest_job WHERE namespaceId = ?")
      .bind(id)
      .run();

    // Delete namespace
    await this.db
      .prepare("DELETE FROM namespace WHERE id = ?")
      .bind(id)
      .run();
  }

  async updateNamespace(
    id: string,
    data: { name?: string; slug?: string }
  ): Promise<any> {
    const updates: string[] = [];
    const binds: any[] = [];

    if (data.name !== undefined) {
      updates.push("name = ?");
      binds.push(data.name);
    }
    if (data.slug !== undefined) {
      updates.push("slug = ?");
      binds.push(data.slug);
    }
    updates.push("updatedAt = ?");
    binds.push(new Date().toISOString());
    binds.push(id);

    await this.db
      .prepare(`UPDATE namespace SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...binds)
      .run();

    return await this.db
      .prepare("SELECT id, name, slug, organizationId, createdAt, updatedAt FROM namespace WHERE id = ?")
      .bind(id)
      .first();
  }

  async getNamespace(id: string): Promise<any> {
    return await this.db
      .prepare("SELECT id, name, slug, organizationId, createdAt, updatedAt FROM namespace WHERE id = ?")
      .bind(id)
      .first();
  }

  // ============ IngestJob ============

  async createIngestJob(data: {
    namespaceId: string;
    payload: Record<string, unknown>;
    config?: Record<string, unknown> | null;
    name?: string | null;
  }): Promise<any> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db
      .prepare(`INSERT INTO ingest_job (id, namespaceId, payload, config, name, status, queuedAt, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, 'QUEUED', ?, ?, ?)`)
      .bind(
        id,
        data.namespaceId,
        JSON.stringify(data.payload),
        data.config ? JSON.stringify(data.config) : null,
        data.name,
        now,
        now,
        now
      )
      .run();

    // Update namespace ingest job count
    await this.db
      .prepare("UPDATE namespace SET totalIngestJobs = totalIngestJobs + 1 WHERE id = ?")
      .bind(data.namespaceId)
      .run();

    return await this.db
      .prepare("SELECT id, status, name, error, createdAt, completedAt, failedAt FROM ingest_job WHERE id = ?")
      .bind(id)
      .first();
  }

  async getIngestJob(id: string): Promise<any> {
    const job = await this.db
      .prepare("SELECT * FROM ingest_job WHERE id = ?")
      .bind(id)
      .first();

    if (!job) return null;

    // Get documents for this job
    const docs = await this.db
      .prepare("SELECT * FROM document WHERE ingestJobId = ? ORDER BY createdAt DESC")
      .bind(id)
      .all();

    return {
      ...job,
      payload: JSON.parse(job.payload as string),
      config: job.config ? JSON.parse(job.config as string) : null,
      documents: docs.results || [],
    };
  }

  async updateIngestJobStatus(
    id: string,
    status: string,
    error?: string | null
  ): Promise<void> {
    const updates: string[] = ["status = ?"];
    const binds: any[] = [status, id];

    if (status === "QUEUED") {
      updates.push("queuedAt = ?");
      binds.splice(1, 0, new Date().toISOString());
    } else if (status === "PRE_PROCESSING") {
      updates.push("preProcessingAt = ?", "queuedAt = COALESCE(queuedAt, ?)");
      binds.splice(1, 0, new Date().toISOString(), new Date().toISOString());
    } else if (status === "PROCESSING") {
      updates.push("processingAt = ?");
      binds.splice(1, 0, new Date().toISOString());
    } else if (status === "COMPLETED") {
      updates.push("completedAt = ?", "failedAt = NULL", "error = NULL");
      binds.splice(1, 0, new Date().toISOString());
    } else if (status === "FAILED") {
      updates.push("failedAt = ?", "error = ?", "completedAt = NULL");
      binds.splice(1, 0, new Date().toISOString(), error || null);
    } else if (error !== undefined) {
      updates.push("error = ?");
      binds.splice(1, 0, error);
    }

    await this.db
      .prepare(`UPDATE ingest_job SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...binds)
      .run();
  }

  // ============ Document ============

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
  }): Promise<Array<{ id: string; status: string }>> {
    const now = new Date().toISOString();
    const results: Array<{ id: string; status: string }> = [];

    for (const doc of data.documents) {
      const id = crypto.randomUUID();

      // 根据 status 设置对应的时间字段
      const queuedAt = doc.status === "QUEUED" ? now : null;
      const preProcessingAt = doc.status === "PRE_PROCESSING" ? now : null;
      const processingAt = doc.status === "PROCESSING" ? now : null;
      const completedAt = doc.status === "COMPLETED" ? now : null;
      const failedAt = doc.status === "FAILED" ? now : null;

      await this.db
        .prepare(`INSERT INTO document
          (id, namespaceId, ingestJobId, name, source, status, error, totalCharacters, totalChunks, totalPages, documentProperties, createdAt, updatedAt, queuedAt, preProcessingAt, processingAt, completedAt, failedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          id,
          data.namespaceId,
          data.ingestJobId,
          doc.name,
          JSON.stringify(doc.source),
          doc.status || "BACKLOG",
          doc.error || null,
          doc.totalCharacters || 0,
          doc.totalChunks || 0,
          doc.totalPages || 0,
          doc.documentProperties ? JSON.stringify(doc.documentProperties) : null,
          now,
          now,
          queuedAt,
          preProcessingAt,
          processingAt,
          completedAt,
          failedAt
        )
        .run();

      results.push({ id, status: doc.status || "BACKLOG" });
    }

    // Update namespace document count
    await this.db
      .prepare("UPDATE namespace SET totalDocuments = totalDocuments + ? WHERE id = ?")
      .bind(data.documents.length, data.namespaceId)
      .run();

    return results;
  }

  async updateDocument(id: string, data: Record<string, unknown>): Promise<void> {
    const updates: string[] = [];
    const binds: any[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key === "source" || key === "config" || key === "documentProperties") {
        updates.push(`${key} = ?`);
        binds.push(value ? JSON.stringify(value) : null);
      } else if (key === "failedAt" || key === "completedAt" || key === "processingAt" || key === "queuedAt" || key === "preProcessingAt") {
        updates.push(`${key} = ?`);
        binds.push(value ? new Date(value as any).toISOString() : null);
      } else {
        updates.push(`${key} = ?`);
        binds.push(value);
      }
    }
    binds.push(id);

    await this.db
      .prepare(`UPDATE document SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...binds)
      .run();
  }

  /**
   * 更新文档状态
   * QUEUED → PRE_PROCESSING → PROCESSING → COMPLETED/FAILED
   */
  async updateDocumentStatus(
    id: string,
    status: string,
    error?: string | null
  ): Promise<void> {
    const updates: string[] = ["status = ?"];
    const binds: any[] = [status, id];

    if (status === "QUEUED") {
      updates.push("queuedAt = ?");
      binds.splice(1, 0, new Date().toISOString());
    } else if (status === "PRE_PROCESSING") {
      updates.push("preProcessingAt = ?", "queuedAt = COALESCE(queuedAt, ?)");
      binds.splice(1, 0, new Date().toISOString(), new Date().toISOString());
    } else if (status === "PROCESSING") {
      updates.push("processingAt = ?");
      binds.splice(1, 0, new Date().toISOString());
    } else if (status === "COMPLETED") {
      updates.push("completedAt = ?", "failedAt = NULL", "error = NULL");
      binds.splice(1, 0, new Date().toISOString());
    } else if (status === "FAILED") {
      updates.push("failedAt = ?", "error = ?", "completedAt = NULL");
      binds.splice(1, 0, new Date().toISOString(), error || null);
    } else if (error !== undefined) {
      updates.push("error = ?");
      binds.splice(1, 0, error);
    }

    await this.db
      .prepare(`UPDATE document SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...binds)
      .run();
  }

  async getDocument(id: string): Promise<any> {
    const doc = await this.db
      .prepare("SELECT * FROM document WHERE id = ?")
      .bind(id)
      .first();

    if (!doc) return null;

    return {
      ...doc,
      source: JSON.parse(doc.source as string),
      config: doc.config ? JSON.parse(doc.config as string) : null,
      documentProperties: doc.documentProperties ? JSON.parse(doc.documentProperties as string) : null,
    };
  }

  async updateTotalPages(namespaceId: string, totalPages: number): Promise<void> {
    if (totalPages >= 0) {
      await this.db
        .prepare("UPDATE namespace SET totalPages = totalPages + ? WHERE id = ?")
        .bind(totalPages, namespaceId)
        .run();
    } else {
      await this.db
        .prepare("UPDATE namespace SET totalPages = totalPages - ? WHERE id = ?")
        .bind(Math.abs(totalPages), namespaceId)
        .run();
    }
  }

  /**
   * 更新 namespace 计数器 - 用于删除时更新统计
   */
  async updateNamespaceCounters(
    namespaceId: string,
    delta: { totalDocuments?: number; totalPages?: number; totalIngestJobs?: number }
  ): Promise<void> {
    const updates: string[] = [];
    const binds: any[] = [];

    if (delta.totalDocuments !== undefined) {
      updates.push("totalDocuments = totalDocuments + ?");
      binds.push(delta.totalDocuments);
    }
    if (delta.totalPages !== undefined) {
      updates.push("totalPages = totalPages + ?");
      binds.push(delta.totalPages);
    }
    if (delta.totalIngestJobs !== undefined) {
      updates.push("totalIngestJobs = totalIngestJobs + ?");
      binds.push(delta.totalIngestJobs);
    }

    if (updates.length === 0) return;

    binds.push(namespaceId);
    await this.db
      .prepare(`UPDATE namespace SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...binds)
      .run();
  }

  async listIngestJobs(params: {
    namespaceId: string;
    cursor?: string;
    limit: number;
    ingestJobId?: string;
    statuses?: string[];
    orderBy: "createdAt" | "updatedAt";
    order: "asc" | "desc";
  }): Promise<any[]> {
    return this.listIngestJobsImpl(params);
  }

  private async listIngestJobsImpl(params: any): Promise<any[]> {
    // Implementation moved to database-list.ts
    const { results } = await this.db
      .prepare("SELECT * FROM ingest_job WHERE namespaceId = ? LIMIT ?")
      .bind(params.namespaceId, params.limit)
      .all();
    return (results || []).map((r: any) => ({
      ...r,
      payload: r.payload ? JSON.parse(r.payload) : null,
      config: r.config ? JSON.parse(r.config) : null,
    }));
  }

  async listDocuments(params: {
    namespaceId: string;
    cursor?: string;
    limit: number;
    ingestJobId?: string;
    statuses?: string[];
    orderBy: "createdAt" | "updatedAt";
    order: "asc" | "desc";
  }): Promise<any[]> {
    // Implementation moved to database-list.ts
    const { results } = await this.db
      .prepare("SELECT * FROM document WHERE namespaceId = ? LIMIT ?")
      .bind(params.namespaceId, params.limit)
      .all();
    return (results || []).map((r: any) => ({
      ...r,
      source: r.source ? JSON.parse(r.source) : null,
      config: r.config ? JSON.parse(r.config) : null,
      documentProperties: r.documentProperties ? JSON.parse(r.documentProperties) : null,
    }));
  }

  // ============ Document Chunks ============

  async createDocumentChunks(chunks: Array<{
    id: string;
    documentId: string;
    namespaceId: string;
    sequence_number: number;
    text: string;
  }>): Promise<void> {
    for (const chunk of chunks) {
      await this.db
        .prepare(`INSERT INTO document_chunk (id, document_id, namespace_id, sequence_number, text)
                  VALUES (?, ?, ?, ?, ?)`)
        .bind(
          chunk.id,
          chunk.documentId,
          chunk.namespaceId,
          chunk.sequence_number,
          chunk.text
        )
        .run();
    }
  }

  async getDocumentChunks(
    namespaceId: string,
    documentId: string,
    limit?: number
  ): Promise<Array<{
    id: string;
    text: string;
    sequence_number: number;
  }>> {
    let sql = "SELECT id, text, sequence_number FROM document_chunk WHERE namespace_id = ? AND document_id = ? ORDER BY sequence_number";
    const binds: any[] = [namespaceId, documentId];

    if (limit) {
      sql += " LIMIT ?";
      binds.push(limit);
    }

    const { results } = await this.db.prepare(sql).bind(...binds).all<any>();
    return results || [];
  }

  async cleanup(): Promise<void> {
    // No cleanup needed for D1
  }
}
