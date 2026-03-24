-- Migration: Initial schema (migrated from Prisma)
-- Creates all tables: organization, namespace, ingest_job, document

-- Organization table
CREATE TABLE IF NOT EXISTS "organization" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "logo" TEXT,
  "totalDocuments" INTEGER NOT NULL DEFAULT 0,
  "totalIngestJobs" INTEGER NOT NULL DEFAULT 0,
  "totalPages" REAL NOT NULL DEFAULT 0.0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "organization_status_idx" ON "organization" ("status");

-- Namespace table
CREATE TABLE IF NOT EXISTS "namespace" (
  "id" TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "totalIngestJobs" INTEGER NOT NULL DEFAULT 0,
  "totalDocuments" INTEGER NOT NULL DEFAULT 0,
  "totalPages" REAL NOT NULL DEFAULT 0.0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE,
  UNIQUE ("organizationId", "slug")
);

CREATE INDEX IF NOT EXISTS "namespace_status_idx" ON "namespace" ("status");
CREATE INDEX IF NOT EXISTS "namespace_organizationId_status_idx" ON "namespace" ("organizationId", "status");

-- Ingest Job table
CREATE TABLE IF NOT EXISTS "ingest_job" (
  "id" TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "tenantId" TEXT,
  "externalId" TEXT,
  "namespaceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'BACKLOG',
  "error" TEXT,
  "name" TEXT,
  "payload" TEXT NOT NULL,
  "config" TEXT,
  "queuedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  "preProcessingAt" DATETIME,
  "processingAt" DATETIME,
  "completedAt" DATETIME,
  "failedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("namespaceId") REFERENCES "namespace"("id") ON DELETE CASCADE,
  UNIQUE ("namespaceId", "externalId")
);

CREATE INDEX IF NOT EXISTS "ingest_job_namespaceId_createdAt_id_idx" ON "ingest_job" ("namespaceId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "ingest_job_namespaceId_status_createdAt_id_idx" ON "ingest_job" ("namespaceId", "status", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "ingest_job_namespaceId_tenantId_createdAt_id_idx" ON "ingest_job" ("namespaceId", "tenantId", "createdAt" DESC, "id" DESC);

-- Document table
CREATE TABLE IF NOT EXISTS "document" (
  "id" TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "externalId" TEXT,
  "name" TEXT,
  "tenantId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'BACKLOG',
  "error" TEXT,
  "source" TEXT NOT NULL,
  "config" TEXT,
  "queuedAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
  "preProcessingAt" DATETIME,
  "processingAt" DATETIME,
  "completedAt" DATETIME,
  "failedAt" DATETIME,
  "namespaceId" TEXT NOT NULL,
  "ingestJobId" TEXT NOT NULL,
  "documentProperties" TEXT,
  "totalChunks" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "totalCharacters" INTEGER NOT NULL DEFAULT 0,
  "totalPages" REAL NOT NULL DEFAULT 0.0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("namespaceId") REFERENCES "namespace"("id") ON DELETE CASCADE,
  FOREIGN KEY ("ingestJobId") REFERENCES "ingest_job"("id") ON DELETE CASCADE,
  UNIQUE ("namespaceId", "externalId")
);

CREATE INDEX IF NOT EXISTS "document_namespaceId_createdAt_id_idx" ON "document" ("namespaceId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "document_namespaceId_status_createdAt_id_idx" ON "document" ("namespaceId", "status", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "document_namespaceId_tenantId_createdAt_id_idx" ON "document" ("namespaceId", "tenantId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "document_ingestJobId_createdAt_id_idx" ON "document" ("ingestJobId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "document_ingestJobId_status_createdAt_id_idx" ON "document" ("ingestJobId", "status", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "document_ingestJobId_tenantId_createdAt_id_idx" ON "document" ("ingestJobId", "tenantId", "createdAt" DESC, "id" DESC);

-- Document Chunk table
CREATE TABLE IF NOT EXISTS document_chunk (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    namespace_id TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (document_id) REFERENCES document(id) ON DELETE CASCADE,
    FOREIGN KEY (namespace_id) REFERENCES namespace(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_chunk_document ON document_chunk(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunk_namespace ON document_chunk(namespace_id);
