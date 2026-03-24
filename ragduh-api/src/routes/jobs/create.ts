import { Hono } from "hono";
import type { Env } from "../../config";
import { createAppServices } from "../../services/app";
import { createIngestJobRequestSchema } from "../../schemas/ingest";

export const createJobRoutes = new Hono<{ Bindings: Env }>();

createJobRoutes.post("/jobs", async (c) => {
  try {
    const data = await c.req.json();
    const parsed = createIngestJobRequestSchema.parse(data);

    const { storage } = createAppServices(c.env);

    // Handle BATCH payload - create job only, documents will be created by worker
    if (parsed.payload.type === "BATCH") {
      const job = await storage.createIngestJob({
        namespaceId: parsed.namespaceId,
        payload: parsed.payload as Record<string, unknown>,
        config: parsed.config || null,
        name: parsed.payload.items[0]?.fileName || `Batch of ${parsed.payload.items.length} items`,
      });

      // Send to queue (non-blocking)
      await c.env.JOB_QUEUE.send({ type: "ingest", jobId: job.id });

      await storage.cleanup();

      return c.json({
        id: job.id,
        status: job.status,
        name: job.name,
        error: job.error,
        createdAt: typeof job.createdAt === "string" ? job.createdAt : job.createdAt?.toISOString(),
        completedAt: job.completedAt ? (typeof job.completedAt === "string" ? job.completedAt : job.completedAt.toISOString()) : null,
        failedAt: job.failedAt ? (typeof job.failedAt === "string" ? job.failedAt : job.failedAt.toISOString()) : null,
        batchCount: parsed.payload.items.length,
      }, 201);
    }

    // Handle single FILE or TEXT payload (existing logic)
    const job = await storage.createIngestJob({
      namespaceId: parsed.namespaceId,
      payload: parsed.payload as Record<string, unknown>,
      config: parsed.config || null,
      name: parsed.payload.fileName || null,
    });

    // Send to queue (non-blocking)
    console.log(`[Create Job] Sending job ${job.id} to queue...`);
    await c.env.JOB_QUEUE.send({ type: "ingest", jobId: job.id });
    console.log(`[Create Job] Job ${job.id} sent to queue`);

    await storage.cleanup();

    return c.json({
      id: job.id,
      status: job.status,
      name: job.name,
      error: job.error,
      createdAt: typeof job.createdAt === "string" ? job.createdAt : job.createdAt?.toISOString(),
      completedAt: job.completedAt ? (typeof job.completedAt === "string" ? job.completedAt : job.completedAt.toISOString()) : null,
      failedAt: job.failedAt ? (typeof job.failedAt === "string" ? job.failedAt : job.failedAt.toISOString()) : null,
    }, 201);
  } catch (error: any) {
    if (error?.errors) {
      return c.json({ error: "Validation failed", details: error.errors }, 400);
    }

    console.error("Create job error:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
