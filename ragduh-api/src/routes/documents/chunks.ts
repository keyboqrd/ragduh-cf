import { Hono } from "hono";
import type { Env } from "../../config";
import { createAppServices } from "../../services/app";

export const getDocumentChunksRoutes = new Hono<{ Bindings: Env }>();

getDocumentChunksRoutes.get("/documents/:id/chunks", async (c) => {
  try {
    const documentId = c.req.param("id");
    const namespaceId = c.req.header("x-namespace-id");

    if (!namespaceId) {
      return c.json(
        { message: "Missing x-namespace-id header" },
        400
      );
    }

    const limit = c.req.query("limit");
    const { storage } = createAppServices(c.env);

    const chunks = await storage.getDocumentChunks(
      namespaceId,
      documentId,
      limit ? parseInt(limit) : undefined
    );

    return c.json({
      data: chunks,
      total: chunks.length,
    });
  } catch (error) {
    console.error("Error fetching document chunks:", error);
    return c.json(
      { message: "Failed to fetch document chunks" },
      500
    );
  }
});
