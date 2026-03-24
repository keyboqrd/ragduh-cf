import { createAppServices } from "../services/app";
import type { Env } from "../config";
import { Chunk } from "../services/partition";

export interface IngestJobMessage {
  jobId: string;
}

export interface ReIngestJobMessage {
  jobId: string;
  documentIds: string[];
}

export async function processIngestJob(
  jobId: string,
  env: Env
): Promise<void> {
  console.log(`[Job ${jobId}] Starting processing...`);

  const { storage, embeddingService } = createAppServices(env);

  try {
    // Step 1: 获取 job 配置
    console.log(`[Job ${jobId}] Fetching job details...`);
    const job = await storage.getIngestJob(jobId);
    if (!job) {
      throw new Error(`Ingest job ${jobId} not found`);
    }

    const payload = job.payload as {
      type: "FILE" | "TEXT" | "BATCH";
      fileUrl?: string;
      text?: string;
      fileName?: string;
      items?: Array<{
        type: "FILE" | "TEXT";
        fileUrl?: string;
        text?: string;
        fileName?: string;
        mimeType?: string;
      }>;
    };

    const config = (job.config || {}) as {
      chunkSize?: number;
      languageCode?: string | null;
      metadata?: Record<string, unknown>;
    };

    console.log(`[Job ${jobId}] Payload type: ${payload.type}`);

    // ========== 幂等性保护：清理上次失败残留的数据 ==========
    // 检查是否有上次运行残留的 Document（可能因为 CPU 超限/超时导致卡住）
    const staleDocs = await storage.getDocumentsByIngestJob(job.namespaceId, jobId);
    if (staleDocs.length > 0) {
      console.log(`[Job ${jobId}] Found ${staleDocs.length} stale documents, cleaning up...`);
      for (const doc of staleDocs) {
        try {
          console.log(`[Job ${jobId}] Cleaning up stale document: ${doc.id} (status: ${doc.status})`);
          // 清理 Vectorize 数据
          await storage.deleteFromVectorize(job.namespaceId, doc.id);
          // 清理 D1 chunks
          await storage.deleteDocumentChunks(doc.id);
          // 清理 Document 记录
          await storage.deleteDocument(doc.id, job.namespaceId);
        } catch (cleanupError) {
          console.error(`[Job ${jobId}] Failed to cleanup stale document ${doc.id}:`, cleanupError);
          // 继续清理其他文档
        }
      }
    }

    // ========== 超时检测：检查 Job 是否卡住 ==========
    // 如果 Job 在 PROCESSING 状态超过 10 分钟，认为已超时
    const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟
    const now = Date.now();
    const jobUpdatedAt = new Date(job.updatedAt).getTime();
    const timeSinceUpdate = now - jobUpdatedAt;

    if (job.status === "PROCESSING" && timeSinceUpdate > STALE_TIMEOUT_MS) {
      console.warn(
        `[Job ${jobId}] Detected stale job: status=${job.status}, updatedAt=${job.updatedAt}, ` +
        `elapsed=${Math.round(timeSinceUpdate / 1000)}s. Retrying...`
      );
    }

    // Step 2: 更新状态 → PRE_PROCESSING
    console.log(`[Job ${jobId}] Updating status to PRE_PROCESSING...`);
    await storage.updateIngestJobStatus(jobId, "PRE_PROCESSING");

    // Step 3: 根据 payload 类型创建 Document 记录 (status: QUEUED)
    let documentsIds: string[] = [];

    if (payload.type === "BATCH") {
      console.log(`[Job ${jobId}] Creating documents for BATCH payload...`);
      documentsIds = await createDocumentsForBatch(
        jobId,
        job.namespaceId,
        payload.items || [],
        storage
      );
    } else if (payload.type === "TEXT") {
      console.log(`[Job ${jobId}] Creating document for TEXT payload...`);
      const documentId = await createDocumentForText(
        jobId,
        job.namespaceId,
        { text: payload.text!, fileName: payload.fileName },
        storage
      );
      documentsIds = [documentId];
    } else if (payload.type === "FILE") {
      console.log(`[Job ${jobId}] Creating document for FILE payload...`);
      const documentId = await createDocumentForFile(
        jobId,
        job.namespaceId,
        { fileUrl: payload.fileUrl!, fileName: payload.fileName || "" },
        storage
      );
      documentsIds = [documentId];
    }

    // Step 4: 更新状态 → PROCESSING
    console.log(`[Job ${jobId}] Updating status to PROCESSING...`);
    await storage.updateIngestJobStatus(jobId, "PROCESSING");

    // Step 5: 分批处理文档 (每批 30 个)
    const BATCH_SIZE = 30;
    let success = true;
    let totalPages = 0;

    for (let i = 0; i < documentsIds.length; i += BATCH_SIZE) {
      const batch = documentsIds.slice(i, i + BATCH_SIZE);
      console.log(`[Job ${jobId}] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}...`);

      const batchResult = await processDocumentBatch(
        batch,
        job.namespaceId,
        config,
        storage,
        embeddingService
      );

      if (!batchResult.success) {
        success = false;
      }
      totalPages += batchResult.totalPages;
    }

    // Step 6: 更新最终状态
    if (success) {
      console.log(`[Job ${jobId}] Marking as COMPLETED...`);
      await storage.updateIngestJobStatus(jobId, "COMPLETED");

      // 更新 total pages
      if (totalPages > 0) {
        console.log(`[Job ${jobId}] Updating total pages: ${totalPages}`);
        await storage.updateTotalPages(job.namespaceId, totalPages);
      }
    } else {
      console.log(`[Job ${jobId}] Marking as FAILED...`);
      await storage.updateIngestJobStatus(
        jobId,
        "FAILED",
        "Failed to process some documents"
      );
    }

  } catch (error) {
    // onFailure 回调
    console.error(`[Job ${jobId}] Failed:`, error);
    await storage.updateIngestJobStatus(
      jobId,
      "FAILED",
      error instanceof Error ? error.message : "Unknown error"
    );
    throw error;
  } finally {
    console.log(`[Job ${jobId}] Cleaning up...`);
    await storage.cleanup();
  }
}

/**
 * 为 TEXT payload 创建 Document 记录
 */
async function createDocumentForText(
  jobId: string,
  namespaceId: string,
  payload: { text?: string; fileName?: string },
  storage: any
): Promise<string> {
  const { text, fileName } = payload;

  // 截取前 1KB 内容保存到 metadata（用于预览/搜索）
  const MAX_METADATA_SIZE = 1024; // 1KB
  const contentPreview = text ? text.slice(0, MAX_METADATA_SIZE) : "";

  const [document] = await storage.createDocuments({
    namespaceId,
    ingestJobId: jobId,
    documents: [{
      name: fileName || "untitled.txt",
      source: { type: "TEXT", text: text || "" },
      totalCharacters: text?.length || 0,
      documentProperties: {
        fileSize: text?.length || 0,
        mimeType: "text/plain",
        metadata: {
          contentPreview: contentPreview,
          previewTruncated: (text?.length || 0) > MAX_METADATA_SIZE,
        },
      },
      status: "QUEUED",
    }],
  });

  console.log(`[Job ${jobId}] Document created: ${document.id}`);
  return document.id;
}

/**
 * 为 FILE payload 创建 Document 记录
 */
async function createDocumentForFile(
  jobId: string,
  namespaceId: string,
  payload: { fileUrl: string; fileName: string },
  storage: any
): Promise<string> {
  const { fileUrl, fileName } = payload;

  // 先下载文件获取元数据
  const { downloadFile } = await import("../services/partition");
  const fileData = await downloadFile(fileUrl);

  // 截取前 1KB 内容保存到 metadata（用于预览/搜索）
  const MAX_METADATA_SIZE = 1024; // 1KB
  const contentPreview = fileData.content.slice(0, MAX_METADATA_SIZE);

  const [document] = await storage.createDocuments({
    namespaceId,
    ingestJobId: jobId,
    documents: [{
      name: fileName,
      source: { type: "FILE", fileUrl },
      totalCharacters: fileData.content.length,
      documentProperties: {
        fileSize: fileData.sizeInBytes,
        mimeType: fileData.mimeType || "application/octet-stream",
        metadata: {
          contentPreview: contentPreview,
          previewTruncated: fileData.content.length > MAX_METADATA_SIZE,
        },
      },
      status: "QUEUED",
    }],
  });

  console.log(`[Job ${jobId}] Document created: ${document.id}`);
  return document.id;
}

/**
 * 为 BATCH payload 创建多个 Document 记录
 */
async function createDocumentsForBatch(
  jobId: string,
  namespaceId: string,
  items: Array<{
    type: "FILE" | "TEXT";
    fileUrl?: string;
    text?: string;
    fileName?: string;
    mimeType?: string;
  }>,
  storage: any
): Promise<string[]> {
  const documentIds: string[] = [];

  for (const item of items) {
    try {
      if (item.type === "TEXT") {
        const id = await createDocumentForText(
          jobId,
          namespaceId,
          { text: item.text, fileName: item.fileName },
          storage
        );
        documentIds.push(id);
      } else if (item.type === "FILE") {
        const id = await createDocumentForFile(
          jobId,
          namespaceId,
          { fileUrl: item.fileUrl!, fileName: item.fileName || "" },
          storage
        );
        documentIds.push(id);
      }
    } catch (error) {
      console.error(`[Job ${jobId}] Failed to create document for item:`, error);
      // 继续处理其他 items
    }
  }

  return documentIds;
}

/**
 * 批量处理文档
 */
async function processDocumentBatch(
  documentIds: string[],
  namespaceId: string,
  config: { chunkSize?: number; languageCode?: string | null },
  storage: any,
  embeddingService: any
): Promise<{ success: boolean; totalPages: number }> {
  let success = true;
  let totalPages = 0;

  for (const documentId of documentIds) {
    try {
      const result = await processSingleDocument(
        documentId,
        namespaceId,
        config,
        storage,
        embeddingService
      );

      if (result.success) {
        totalPages += result.totalPages;
      } else {
        success = false;
      }
    } catch (error) {
      console.error(`[Document ${documentId}] Failed:`, error);
      success = false;
    }
  }

  return { success, totalPages };
}

/**
 * 处理单个文档
 *
 * 状态流转:
 * QUEUED → PRE_PROCESSING → PROCESSING → COMPLETED/FAILED
 *
 * 支持大文档分批处理：
 * - 每批最多 2000 chunks（避免 subrequest 超限）
 * - 每批独立执行：embedding → D1 → Vectorize
 */
async function processSingleDocument(
  documentId: string,
  namespaceId: string,
  config: { chunkSize?: number; languageCode?: string | null },
  storage: any,
  embeddingService: any
): Promise<{ success: boolean; totalPages: number }> {
  console.log(`[Document ${documentId}] Starting processing...`);

  try {
    // 获取文档信息
    const document = await storage.getDocument(documentId);
    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }

    const source = document.source as {
      type: "TEXT" | "FILE";
      text?: string;
      fileUrl?: string;
    };

    // 更新状态 → PRE_PROCESSING
    await storage.updateDocumentStatus(documentId, "PRE_PROCESSING");

    // 获取内容
    let content: string;
    if (source.type === "TEXT") {
      content = source.text || "";
    } else if (source.type === "FILE") {
      const { downloadFile } = await import("../services/partition");
      const fileData = await downloadFile(source.fileUrl!);
      content = fileData.content;
    } else {
      throw new Error(`Unsupported source type: ${(source as any).type}`);
    }

    // 更新状态 → PROCESSING
    await storage.updateDocumentStatus(documentId, "PROCESSING");

    // Chunking
    console.log(`[Document ${documentId}] Chunking content...`);
    const { chunkText } = await import("../services/partition");
    const allChunks = await chunkText(content, {
      chunkSize: config.chunkSize || 2048,
      languageCode: config.languageCode,
    });
    console.log(`[Document ${documentId}] Created ${allChunks.length} chunks`);

    // 大文档分批处理：每批最多 2000 chunks
    // 2000 chunks → 20 次 embedding (100/batch) + 20 次 upsert (100/batch) = 40 subrequests
    // 预留 10 次余量给其他操作（50 限额）
    const MAX_CHUNKS_PER_BATCH = 2000;
    const totalBatches = Math.ceil(allChunks.length / MAX_CHUNKS_PER_BATCH);

    let processedChunks = 0;

    for (let i = 0; i < allChunks.length; i += MAX_CHUNKS_PER_BATCH) {
      const chunkBatch = allChunks.slice(i, i + MAX_CHUNKS_PER_BATCH);
      const batchNum = Math.floor(i / MAX_CHUNKS_PER_BATCH) + 1;

      console.log(`[Document ${documentId}] Processing batch ${batchNum}/${totalBatches} (${chunkBatch.length} chunks)`);

      // 生成这一批的 embeddings
      console.log(`[Document ${documentId}] Generating embeddings for batch ${batchNum}...`);
      await embeddingService.generateBatchEmbeddings(chunkBatch);

      // 添加 metadata（sequence_number 是全局的）
      chunkBatch.forEach((chunk: Chunk, idx: number) => {
        if (!chunk.metadata) chunk.metadata = {};
        chunk.metadata.sequence_number = processedChunks + idx;
        chunk.metadata.document_id = documentId;
      });

      // 存储到 D1
      console.log(`[Document ${documentId}] Storing batch ${batchNum} to D1...`);
      await storage.createDocumentChunks(chunkBatch.map((c: Chunk) => ({
        id: c.id,
        documentId: document.id,
        namespaceId,
        sequence_number: c.metadata!.sequence_number as number,
        text: c.text,
      })));

      // Upsert 到 Vectorize
      console.log(`[Document ${documentId}] Upserting batch ${batchNum} to Vectorize...`);
      await storage.upsertToVectorize(namespaceId, chunkBatch);

      processedChunks += chunkBatch.length;
      console.log(`[Document ${documentId}] Batch ${batchNum} completed (${processedChunks}/${allChunks.length} chunks)`);

      // 批次间短暂等待，避免瞬时压力
      if (batchNum < totalBatches) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // 计算 stats
    const docTotalPages = content.length / 1000;
    const docTotalTokens = allChunks.reduce((sum: number, c: Chunk) => sum + c.tokenCount, 0);

    // 更新状态 → COMPLETED
    console.log(`[Document ${documentId}] Marking as COMPLETED...`);
    await storage.updateDocumentStatus(documentId, "COMPLETED");

    // 更新文档的统计信息
    await storage.updateDocument(documentId, {
      totalChunks: allChunks.length,
      totalCharacters: content.length,
      totalTokens: docTotalTokens,
      totalPages: docTotalPages,
    });

    console.log(`[Document ${documentId}] Processing complete (${processedChunks} chunks in ${totalBatches} batches)`);
    return { success: true, totalPages: docTotalPages };

  } catch (error) {
    // onFailure 回调 - 更新文档状态为 FAILED
    console.error(`[Document ${documentId}] Failed:`, error);

    await storage.updateDocumentStatus(
      documentId,
      "FAILED",
      error instanceof Error ? error.message : "Unknown error"
    );

    // 清理部分数据
    try {
      await storage.deleteFromVectorize(namespaceId, documentId);
    } catch (cleanupError) {
      console.error(`[Document ${documentId}] Failed to clean up Vectorize:`, cleanupError);
    }

    return { success: false, totalPages: 0 };
  }
}

/**
 * Re-ingest 流程
 *
 * 功能：
 * - 重新处理已有的 documents
 * - 清理旧的向量数据 (cleanup: true)
 * - 重新生成 embeddings
 */
export async function processReIngestJob(
  jobId: string,
  documentIds: string[],
  env: Env
): Promise<void> {
  console.log(`[Re-Ingest Job ${jobId}] Starting processing...`);

  const { storage, embeddingService } = createAppServices(env);

  try {
    // 获取 ingest job
    console.log(`[Re-Ingest Job ${jobId}] Fetching job details...`);
    const job = await storage.getIngestJob(jobId);
    if (!job) {
      throw new Error(`Ingest job ${jobId} not found`);
    }

    const config = (job.config || {}) as {
      chunkSize?: number;
      languageCode?: string | null;
    };

    // ========== 超时检测：检查 Job 是否卡住 ==========
    const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟
    const now = Date.now();
    const jobUpdatedAt = new Date(job.updatedAt).getTime();
    const timeSinceUpdate = now - jobUpdatedAt;

    if (job.status === "PROCESSING" && timeSinceUpdate > STALE_TIMEOUT_MS) {
      console.warn(
        `[Re-Ingest Job ${jobId}] Detected stale job: status=${job.status}, updatedAt=${job.updatedAt}, ` +
        `elapsed=${Math.round(timeSinceUpdate / 1000)}s. Retrying...`
      );
    }

    // 分批处理文档
    const BATCH_SIZE = 30;
    let success = true;
    let totalPages = 0;

    for (let i = 0; i < documentIds.length; i += BATCH_SIZE) {
      const batch = documentIds.slice(i, i + BATCH_SIZE);
      console.log(`[Re-Ingest Job ${jobId}] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}...`);

      const batchResult = await processDocumentBatchWithCleanup(
        batch,
        job.namespaceId,
        config,
        storage,
        embeddingService
      );

      if (!batchResult.success) {
        success = false;
      }
      totalPages += batchResult.totalPages;
    }

    // 更新最终状态
    if (success) {
      console.log(`[Re-Ingest Job ${jobId}] Marking as COMPLETED...`);
      await storage.updateIngestJobStatus(jobId, "COMPLETED");
    } else {
      console.log(`[Re-Ingest Job ${jobId}] Marking as FAILED...`);
      await storage.updateIngestJobStatus(
        jobId,
        "FAILED",
        "Failed to re-process some documents"
      );
    }

  } catch (error) {
    console.error(`[Re-Ingest Job ${jobId}] Failed:`, error);
    await storage.updateIngestJobStatus(
      jobId,
      "FAILED",
      error instanceof Error ? error.message : "Unknown error"
    );
    throw error;
  } finally {
    console.log(`[Re-Ingest Job ${jobId}] Cleaning up...`);
    await storage.cleanup();
  }
}

/**
 * 批量处理文档（带清理）- 用于 re-ingest
 */
async function processDocumentBatchWithCleanup(
  documentIds: string[],
  namespaceId: string,
  config: { chunkSize?: number; languageCode?: string | null },
  storage: any,
  embeddingService: any
): Promise<{ success: boolean; totalPages: number }> {
  let success = true;
  let totalPages = 0;

  for (const documentId of documentIds) {
    try {
      const result = await processSingleDocumentWithCleanup(
        documentId,
        namespaceId,
        config,
        storage,
        embeddingService
      );

      if (result.success) {
        totalPages += result.totalPages;
      } else {
        success = false;
      }
    } catch (error) {
      console.error(`[Document ${documentId}] Failed:`, error);
      success = false;
    }
  }

  return { success, totalPages };
}

/**
 * 处理单个文档（带清理）- 用于 re-ingest
 */
async function processSingleDocumentWithCleanup(
  documentId: string,
  namespaceId: string,
  config: { chunkSize?: number; languageCode?: string | null },
  storage: any,
  embeddingService: any
): Promise<{ success: boolean; totalPages: number }> {
  console.log(`[Document ${documentId}] Starting re-processing with cleanup...`);

  try {
    const document = await storage.getDocument(documentId);
    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }

    const source = document.source as {
      type: "TEXT" | "FILE";
      text?: string;
      fileUrl?: string;
    };

    // 清理旧的向量数据
    console.log(`[Document ${documentId}] Deleting old vectors...`);
    await storage.deleteFromVectorize(namespaceId, documentId);

    // 清理旧的 chunks
    console.log(`[Document ${documentId}] Deleting old chunks from D1...`);
    await storage.db
      .prepare("DELETE FROM document_chunk WHERE document_id = ?")
      .bind(documentId)
      .run();

    // 更新状态 → PRE_PROCESSING
    await storage.updateDocumentStatus(documentId, "PRE_PROCESSING");

    // 获取内容
    let content: string;
    if (source.type === "TEXT") {
      content = source.text || "";
    } else if (source.type === "FILE") {
      const { downloadFile } = await import("../services/partition");
      const fileData = await downloadFile(source.fileUrl!);
      content = fileData.content;
    } else {
      throw new Error(`Unsupported source type: ${(source as any).type}`);
    }

    // 更新状态 → PROCESSING
    await storage.updateDocumentStatus(documentId, "PROCESSING");

    // Chunking
    console.log(`[Document ${documentId}] Chunking content...`);
    const { chunkText } = await import("../services/partition");
    const chunks = await chunkText(content, {
      chunkSize: config.chunkSize || 2048,
      languageCode: config.languageCode,
    });
    console.log(`[Document ${documentId}] Created ${chunks.length} chunks`);

    // 生成 embeddings
    console.log(`[Document ${documentId}] Generating embeddings...`);
    await embeddingService.generateBatchEmbeddings(chunks);

    // 添加 metadata
    chunks.forEach((chunk: Chunk, idx: number) => {
      if (!chunk.metadata) chunk.metadata = {};
      chunk.metadata.sequence_number = idx;
      chunk.metadata.document_id = documentId;
    });

    // 存储到 D1
    console.log(`[Document ${documentId}] Storing chunks in D1...`);
    await storage.createDocumentChunks(chunks.map((c: Chunk) => ({
      id: c.id,
      documentId: document.id,
      namespaceId,
      sequence_number: c.metadata!.sequence_number as number,
      text: c.text,
    })));

    // Upsert 到 Vectorize
    console.log(`[Document ${documentId}] Upserting to Vectorize...`);
    await storage.upsertToVectorize(namespaceId, chunks);

    // 计算 stats
    const docTotalPages = content.length / 1000;
    const docTotalTokens = chunks.reduce((sum: number, c: Chunk) => sum + c.tokenCount, 0);

    // 更新状态 → COMPLETED
    console.log(`[Document ${documentId}] Marking as COMPLETED...`);
    await storage.updateDocumentStatus(documentId, "COMPLETED");

    await storage.updateDocument(documentId, {
      totalChunks: chunks.length,
      totalCharacters: content.length,
      totalTokens: docTotalTokens,
      totalPages: docTotalPages,
    });

    console.log(`[Document ${documentId}] Re-processing complete`);
    return { success: true, totalPages: docTotalPages };

  } catch (error) {
    console.error(`[Document ${documentId}] Failed:`, error);

    await storage.updateDocumentStatus(
      documentId,
      "FAILED",
      error instanceof Error ? error.message : "Unknown error"
    );

    try {
      await storage.deleteFromVectorize(namespaceId, documentId);
    } catch (cleanupError) {
      console.error(`[Document ${documentId}] Failed to clean up Vectorize:`, cleanupError);
    }

    return { success: false, totalPages: 0 };
  }
}
