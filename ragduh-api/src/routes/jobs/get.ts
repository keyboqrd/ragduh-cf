import { Hono } from "hono";
import type { Env } from "../../config";
import { createAppServices } from "../../services/app";

export const getJobRoutes = new Hono<{ Bindings: Env }>();

// GET /api/jobs/:id - Get job status
getJobRoutes.get("/jobs/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const { storage } = createAppServices(c.env);

    const job = await storage.getIngestJob(id);

    await storage.cleanup();

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    return c.json({
      id: job.id,
      status: job.status,
      error: job.error,
      name: job.name,
      createdAt: typeof job.createdAt === "string" ? job.createdAt : job.createdAt?.toISOString(),
      completedAt: job.completedAt ? (typeof job.completedAt === "string" ? job.completedAt : job.completedAt.toISOString()) : null,
      failedAt: job.failedAt ? (typeof job.failedAt === "string" ? job.failedAt : job.failedAt.toISOString()) : null,
    });
  } catch (error: any) {
    console.error("Get job error:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

// GET /api/namespaces/:namespaceId/jobs/:jobId - Get job by namespace and ID
getJobRoutes.get("/namespaces/:namespaceId/jobs/:jobId", async (c) => {
  try {
    const namespaceId = c.req.param("namespaceId");
    const jobId = c.req.param("jobId");

    const { storage } = createAppServices(c.env);

    const job = await storage.getIngestJob(jobId);

    await storage.cleanup();

    if (!job || job.namespaceId !== namespaceId) {
      return c.json({ error: "Job not found" }, 404);
    }

    return c.json({
      id: job.id,
      namespaceId: job.namespaceId,
      status: job.status,
      error: job.error,
      name: job.name,
      createdAt: typeof job.createdAt === "string" ? job.createdAt : job.createdAt?.toISOString(),
      completedAt: job.completedAt ? (typeof job.completedAt === "string" ? job.completedAt : job.completedAt.toISOString()) : null,
      failedAt: job.failedAt ? (typeof job.failedAt === "string" ? job.failedAt : job.failedAt.toISOString()) : null,
    });
  } catch (error: any) {
    console.error("Get job error:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
