import { Hono } from "hono";
import type { Env } from "../../config";
import { createAppServices } from "../../services/app";

export const deleteJobRoutes = new Hono<{ Bindings: Env }>();

deleteJobRoutes.delete("/namespaces/:namespaceId/jobs/:jobId", async (c) => {
  try {
    const namespaceId = c.req.param("namespaceId");
    const jobId = c.req.param("jobId");

    const { storage } = createAppServices(c.env);

    const job = await storage.getIngestJob(jobId);

    if (!job || job.namespaceId !== namespaceId) {
      await storage.cleanup();
      return c.json({ error: "Job not found" }, 404);
    }

    if (job.status === "DELETING" || job.status === "QUEUED_FOR_DELETE") {
      await storage.cleanup();
      return c.json({ error: "Job is already being deleted" }, 400);
    }

    // Queue deletion (async)
    const queuedJob = await storage.queueDeleteIngestJob(jobId, namespaceId);

    if (!queuedJob) {
      await storage.cleanup();
      return c.json({ error: "Failed to queue job for deletion" }, 500);
    }

    // Send to job queue
    await c.env.JOB_QUEUE.send({
      type: "delete",
      deleteType: "DELETE_INGEST_JOB",
      jobId,
      namespaceId,
    });

    await storage.cleanup();

    return c.json({
      message: "Job queued for deletion",
      job: {
        id: queuedJob.id,
        namespaceId: queuedJob.namespaceId,
        status: "QUEUED_FOR_DELETE",
        name: queuedJob.name,
      }
    });
  } catch (error: any) {
    console.error("Delete job error:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
