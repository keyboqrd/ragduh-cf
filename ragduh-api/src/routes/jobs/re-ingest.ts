import { Hono } from "hono";
import type { Env } from "../../config";
import { createAppServices } from "../../services/app";
import { DatabaseService } from "../../services/database";

export const reIngestRoutes = new Hono<{ Bindings: Env }>();

/**
 * Re-ingest 路由
 *
 * 功能：
 * - 重新处理已有的 ingest job
 * - 清理旧的向量数据
 * - 重新生成 embeddings
 */
reIngestRoutes.post("/jobs/:jobId/re-ingest", async (c) => {
  try {
    const jobId = c.req.param("jobId");
    const { storage } = createAppServices(c.env);

    // 获取 ingest job
    const job = await storage.getIngestJob(jobId);
    if (!job) {
      await storage.cleanup();
      return c.json({ error: "Ingest job not found" }, 404);
    }

    // 获取该 job 下的所有文档
    const documents = await c.env.DB
      .prepare("SELECT id FROM document WHERE ingestJobId = ?")
      .bind(jobId)
      .all<{ id: string }>();

    const documentIds = (documents.results || []).map((r) => r.id);

    // 更新 ingest job 状态为 PROCESSING（重置）
    await c.env.DB
      .prepare(`
        UPDATE ingest_job
        SET status = 'PROCESSING',
            preProcessingAt = ?,
            processingAt = ?,
            completedAt = NULL,
            failedAt = NULL,
            error = NULL
        WHERE id = ?
      `)
      .bind(new Date().toISOString(), new Date().toISOString(), jobId)
      .run();

    // 重置所有文档状态为 QUEUED_FOR_RESYNC
    await c.env.DB
      .prepare(`
        UPDATE document
        SET status = 'QUEUED_FOR_RESYNC',
            queuedAt = ?,
            preProcessingAt = NULL,
            processingAt = NULL,
            completedAt = NULL,
            failedAt = NULL,
            error = NULL
        WHERE ingestJobId = ?
      `)
      .bind(new Date().toISOString(), jobId)
      .run();

    // 发送到队列进行重新处理
    await c.env.JOB_QUEUE.send({
      type: "re-ingest",
      jobId,
      documentIds,
    });

    await storage.cleanup();

    return c.json({
      message: "Re-ingest job queued",
      jobId: job.id,
      documentsCount: documentIds.length,
    });

  } catch (error: any) {
    console.error("Re-ingest error:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
