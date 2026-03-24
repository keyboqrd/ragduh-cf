import { Hono } from "hono";
import type { Env } from "../../config";
import { createAppServices } from "../../services/app";
import { listDocumentsSchema } from "../../schemas/ingest";

export const listDocumentRoutes = new Hono<{ Bindings: Env }>();

listDocumentRoutes.get("/namespaces/:namespaceId/documents", async (c) => {
  try {
    const namespaceId = c.req.param("namespaceId");
    const query = listDocumentsSchema.parse(c.req.query());

    const { storage } = createAppServices(c.env);

    const result = await storage.listDocuments({
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
      data: result.data.map((doc: any) => ({
        id: doc.id,
        name: doc.name,
        status: doc.status,
        totalChunks: doc.totalChunks,
        totalTokens: doc.totalTokens,
        totalPages: doc.totalPages,
        createdAt: doc.createdAt,
      })),
      pagination: result.pagination,
    });
  } catch (error: any) {
    if (error?.errors) {
      return c.json({ error: "Validation failed", details: error.errors }, 400);
    }
    console.error("List documents error:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
