import { cors } from "hono/cors";
import type { Env } from "./config";
import { processIngestJob, processReIngestJob } from "./workers/ingest-worker";
import { processDeleteJob } from "./workers/delete-worker";
import { Hono } from "hono";
import { healthRoutes } from "./routes/health";
import { jobsRoutes } from "./routes/jobs";
import { documentsRoutes } from "./routes/documents";
import { chatRoutes } from "./routes/chat";
import { namespacesRoutes } from "./routes/namespaces";

// Create base app
const app = new Hono<{ Bindings: Env }>();

// Middleware - must be registered before routes
app.use("/*", cors());

// API Key Authentication middleware
app.use('/*', async (c, next) => {
  // Skip auth for health check endpoint
  if (c.req.path === '/health') {
    await next();
    return;
  }

  const authHeader = c.req.header('Authorization');
  const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const validApiKey = c.env.API_KEY;

  console.log(`[Auth Middleware] path=${c.req.path}, authHeader=${authHeader}, apiKey=${apiKey}, validApiKey=${validApiKey}, match=${apiKey === validApiKey}`);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[Auth Middleware] Unauthorized - Missing or invalid Authorization header');
    return c.json({ error: 'Unauthorized - Missing or invalid Authorization header' }, 401);
  }

  if (!apiKey || apiKey !== validApiKey) {
    console.log('[Auth Middleware] Unauthorized - Invalid API key');
    return c.json({ error: 'Unauthorized - Invalid API key' }, 401);
  }

  await next();
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Register routes
app.route("/", healthRoutes);
app.route("/api", jobsRoutes);
app.route("/api", documentsRoutes);
app.route("/api", namespacesRoutes);
app.route("/api/chat", chatRoutes);

// Cloudflare Worker handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext): Promise<void> {
    // Check if this is DLQ (dead letter queue)
    const isDLQ = batch.queue.includes("dlq");
    console.log(`[Queue Handler] Received batch on queue: ${batch.queue}, message count: ${batch.messages.length}, isDLQ: ${isDLQ}`);

    for (const message of batch.messages) {
      const body = message.body as {
        type?: string;
        jobId?: string;
        deleteType?: string;
        documentId?: string;
        namespaceId: string;
      };
      console.log(`[Queue Handler] Processing message:`, { type: body?.type, jobId: body?.jobId, queue: batch.queue });

      // DLQ messages - mark as failed and ack
      if (isDLQ) {
        try {
          console.log(`[DLQ] Processing failed job:`, body);
          if (body.type === "ingest" && body.jobId) {
            // Mark ingest job as failed
            const { createAppServices } = await import("./services/app");
            const { storage } = createAppServices(env);
            await storage.updateIngestJobStatus(body.jobId, "FAILED", "Job failed after retries - sent to DLQ");
            console.log(`[DLQ] Job ${body.jobId} marked as FAILED`);
          }
        } catch (error) {
          console.error(`[DLQ] Failed to process:`, error);
        }
        message.ack();
        continue;
      }

      // Route based on message type
      if (body && typeof body === "object" && "type" in body) {
        try {
          if (body.type === "delete") {
            await processDeleteJob({
              type: body.deleteType as "DELETE_INGEST_JOB" | "DELETE_DOCUMENT",
              jobId: body.jobId,
              documentId: body.documentId,
              namespaceId: body.namespaceId,
            }, env);
          } else if (body.type === "ingest" && body.jobId) {
            await processIngestJob(body.jobId, env);
          } else if (body.type === "re-ingest" && body.jobId) {
            await processReIngestJob(body.jobId, (body as any).documentIds || [], env);
          } else {
            console.error("Unknown job type:", body.type);
            message.retry();
            continue;
          }
          message.ack();
        } catch (error) {
          console.error(`Queue message failed:`, error);
          message.retry();
        }
      } else {
        console.error("Invalid queue message:", body);
        message.ack();
      }
    }
  },
};
