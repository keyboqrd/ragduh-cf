import { Hono } from "hono";
import type { Env } from "../../config";
import { createAppServices } from "../../services/app";
import { listIngestJobsSchema } from "../../schemas/ingest";

export const listJobRoutes = new Hono<{ Bindings: Env }>();

listJobRoutes.get("/namespaces/:namespaceId/jobs", async (c) => {
  try {
    const namespaceId = c.req.param("namespaceId");
    const query = listIngestJobsSchema.parse(c.req.query());

    const { storage } = createAppServices(c.env);

    const result = await storage.listIngestJobs({
      namespaceId,
      cursor: query.cursor,
      limit: query.limit,
      ingestJobId: query.ingestJobId,
      statuses: query.statuses,
      orderBy: query.orderBy,
      order: query.order,
    });

    await storage.cleanup();

    return c.json({
      data: result.data.map((job: any) => ({
        id: job.id,
        namespaceId: job.namespaceId,
        status: job.status,
        name: job.name,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
        failedAt: job.failedAt,
      })),
      pagination: result.pagination,
    });
  } catch (error: any) {
    if (error?.errors) {
      return c.json({ error: "Validation failed", details: error.errors }, 400);
    }
    console.error("List jobs error:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
