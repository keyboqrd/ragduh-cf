import { Hono } from "hono";
import type { Env } from "../../config";
import { createAppServices } from "../../services/app";

export const getDocumentRoutes = new Hono<{ Bindings: Env }>();

// GET /api/documents/:id - Get document details
getDocumentRoutes.get("/documents/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const { storage } = createAppServices(c.env);

    const document = await storage.getDocument(id);

    await storage.cleanup();

    if (!document) {
      return c.json({ error: "Document not found" }, 404);
    }

    return c.json({
      id: document.id,
      name: document.name,
      status: document.status,
      error: document.error,
      totalChunks: document.totalChunks,
      totalTokens: document.totalTokens,
      totalCharacters: document.totalCharacters,
      totalPages: document.totalPages,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      processingAt: document.processingAt,
      completedAt: document.completedAt,
      failedAt: document.failedAt,
    });
  } catch (error: any) {
    console.error("Get document error:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

// GET /api/namespaces/:namespaceId/documents/:documentId - Get document by namespace and ID
getDocumentRoutes.get("/namespaces/:namespaceId/documents/:documentId", async (c) => {
  try {
    const namespaceId = c.req.param("namespaceId");
    const documentId = c.req.param("documentId");

    const { storage } = createAppServices(c.env);

    const document = await storage.getDocument(documentId);

    await storage.cleanup();

    if (!document || document.namespaceId !== namespaceId) {
      return c.json({ error: "Document not found" }, 404);
    }

    return c.json({
      id: document.id,
      name: document.name,
      status: document.status,
      error: document.error,
      totalChunks: document.totalChunks,
      totalTokens: document.totalTokens,
      totalCharacters: document.totalCharacters,
      totalPages: document.totalPages,
      documentProperties: document.documentProperties,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      processingAt: document.processingAt,
      completedAt: document.completedAt,
      failedAt: document.failedAt,
    });
  } catch (error: any) {
    console.error("Get document error:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
