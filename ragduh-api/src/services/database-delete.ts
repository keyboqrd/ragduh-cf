import { DatabaseService } from "./database";

interface DeleteResult {
  id: string;
  namespaceId: string;
  name: string | null;
  status: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Queue ingest job for deletion
 */
export async function queueDeleteIngestJob(
  db: DatabaseService,
  id: string,
  namespaceId: string
): Promise<DeleteResult | null> {
  const job = await db.db
    .prepare("SELECT id, namespaceId, name, status, error, createdAt, updatedAt FROM ingest_job WHERE id = ? AND namespaceId = ?")
    .bind(id, namespaceId)
    .first<DeleteResult>();

  if (!job) {
    return null;
  }

  await db.db
    .prepare("UPDATE ingest_job SET status = 'QUEUED_FOR_DELETE' WHERE id = ?")
    .bind(id)
    .run();

  return job;
}

/**
 * Queue document for deletion
 */
export async function queueDeleteDocument(
  db: DatabaseService,
  id: string,
  namespaceId: string
): Promise<any | null> {
  const document = await db.db
    .prepare("SELECT * FROM document WHERE id = ? AND namespaceId = ?")
    .bind(id, namespaceId)
    .first();

  if (!document) {
    return null;
  }

  await db.db
    .prepare("UPDATE document SET status = 'QUEUED_FOR_DELETE' WHERE id = ?")
    .bind(id)
    .run();

  return document;
}

/**
 * Execute ingest job deletion
 */
export async function executeDeleteIngestJob(
  db: DatabaseService,
  jobId: string,
  namespaceId: string,
  deleteFromVectorize: (namespaceId: string, documentId: string) => Promise<void>,
  deleteFromR2?: (key: string) => Promise<void>
): Promise<DeleteResult | null> {
  // Get job with documents
  const job = await db.db
    .prepare("SELECT * FROM ingest_job WHERE id = ? AND namespaceId = ?")
    .bind(jobId, namespaceId)
    .first<any>();

  if (!job) {
    return null;
  }

  const documents = await db.db
    .prepare("SELECT id, totalPages, source FROM document WHERE ingestJobId = ?")
    .bind(jobId)
    .all<any>();

  // Update status to DELETING
  await db.db
    .prepare("UPDATE ingest_job SET status = 'DELETING' WHERE id = ?")
    .bind(jobId)
    .run();

  // Delete from Vectorize and R2
  for (const doc of documents.results || []) {
    await deleteFromVectorize(namespaceId, doc.id);

    if (deleteFromR2 && doc.source) {
      try {
        const source = typeof doc.source === "string" ? JSON.parse(doc.source) : doc.source;
        if (source.type === "R2" && source.r2Key) {
          await deleteFromR2(source.r2Key);
        }
      } catch (e) {
        console.error(`Failed to delete R2 object for document ${doc.id}:`, e);
      }
    }
  }

  const deletedDocuments = documents.results?.length || 0;
  const deletedPages = (documents.results || []).reduce((sum: number, doc: any) => sum + (doc.totalPages || 0), 0);

  // Delete documents
  if (documents.results && documents.results.length > 0) {
    const ids = documents.results.map((d: any) => d.id);
    const placeholders = ids.map(() => "?").join(", ");
    await db.db
      .prepare(`DELETE FROM document WHERE id IN (${placeholders})`)
      .bind(...ids)
      .run();
  }

  // Delete ingest job
  await db.db
    .prepare("DELETE FROM ingest_job WHERE id = ?")
    .bind(jobId)
    .run();

  // Update namespace counts
  await db.db
    .prepare(`UPDATE namespace SET
      totalDocuments = totalDocuments - ?,
      totalPages = totalPages - ?,
      totalIngestJobs = totalIngestJobs - 1
      WHERE id = ?`)
    .bind(deletedDocuments, deletedPages, namespaceId)
    .run();

  return {
    id: job.id,
    namespaceId: job.namespaceId,
    name: job.name,
    status: job.status,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

/**
 * Execute document deletion
 */
export async function executeDeleteDocument(
  db: DatabaseService,
  documentId: string,
  namespaceId: string,
  deleteFromVectorize: (namespaceId: string, documentId: string) => Promise<void>,
  deleteFromR2?: (key: string) => Promise<void>
): Promise<any | null> {
  const document = await db.db
    .prepare("SELECT * FROM document WHERE id = ? AND namespaceId = ?")
    .bind(documentId, namespaceId)
    .first<any>();

  if (!document) {
    return null;
  }

  await db.db
    .prepare("UPDATE document SET status = 'DELETING' WHERE id = ?")
    .bind(documentId)
    .run();

  await deleteFromVectorize(namespaceId, documentId);

  // Delete from R2
  if (deleteFromR2 && document.source) {
    try {
      const source = typeof document.source === "string" ? JSON.parse(document.source) : document.source;
      if (source.type === "R2" && source.r2Key) {
        await deleteFromR2(source.r2Key);
      }
    } catch (e) {
      console.error(`Failed to delete R2 object for document ${documentId}:`, e);
    }
  }

  const totalPages = document.totalPages || 0;

  // Delete document
  await db.db
    .prepare("DELETE FROM document WHERE id = ?")
    .bind(documentId)
    .run();

  // Update namespace counts
  await db.db
    .prepare("UPDATE namespace SET totalDocuments = totalDocuments - 1, totalPages = totalPages - ? WHERE id = ?")
    .bind(totalPages, namespaceId)
    .run();

  return document;
}
