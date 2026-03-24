import { Hono } from "hono";
import type { Env } from "../../config";
import { createAppServices } from "../../services/app";

export const deleteDocumentRoutes = new Hono<{ Bindings: Env }>();

// DELETE /api/documents/:id - Delete document
deleteDocumentRoutes.delete("/documents/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const { storage } = createAppServices(c.env);

    const document = await storage.getDocument(id);

    if (!document) {
      await storage.cleanup();
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.status === "DELETING" || document.status === "QUEUED_FOR_DELETE") {
      await storage.cleanup();
      return c.json({ error: "Document is already being deleted" }, 400);
    }

    // Queue deletion (async)
    const queuedDoc = await storage.queueDeleteDocument(document.id, document.namespaceId);

    // Send to job queue
    await c.env.JOB_QUEUE.send({
      type: "delete",
      deleteType: "DELETE_DOCUMENT",
      documentId: document.id,
      namespaceId: document.namespaceId,
    });

    await storage.cleanup();

    return c.json({
      message: "Document queued for deletion",
      document: {
        id: queuedDoc.id,
        name: queuedDoc.name,
        status: queuedDoc.status,
      }
    });
  } catch (error: any) {
    console.error("Delete document error:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

// DELETE /api/namespaces/:namespaceId/documents/:documentId - Delete document by namespace and ID
deleteDocumentRoutes.delete("/namespaces/:namespaceId/documents/:documentId", async (c) => {
  try {
    const namespaceId = c.req.param("namespaceId");
    const documentId = c.req.param("documentId");

    const { storage } = createAppServices(c.env);

    const document = await storage.getDocument(documentId);

    if (!document || document.namespaceId !== namespaceId) {
      await storage.cleanup();
      return c.json({ error: "Document not found" }, 404);
    }

    if (document.status === "DELETING" || document.status === "QUEUED_FOR_DELETE") {
      await storage.cleanup();
      return c.json({ error: "Document is already being deleted" }, 400);
    }

    // Queue deletion (async)
    const queuedDoc = await storage.queueDeleteDocument(documentId, namespaceId);

    // Send to job queue
    await c.env.JOB_QUEUE.send({
      type: "delete",
      deleteType: "DELETE_DOCUMENT",
      documentId: documentId,
      namespaceId,
    });

    await storage.cleanup();

    return c.json({
      message: "Document queued for deletion",
      document: {
        id: queuedDoc.id,
        name: queuedDoc.name,
        status: queuedDoc.status,
      }
    });
  } catch (error: any) {
    console.error("Delete document error:", error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});
