import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../config";
import { DatabaseService } from "../../services/database";

export const listNamespaceRoutes = new Hono<{ Bindings: Env }>();

const createNamespaceSchema = z.object({
  name: z.string(),
  slug: z.string(),
});

const updateNamespaceSchema = z.object({
  name: z.string().optional(),
  slug: z.string().optional(),
});

// List namespaces
listNamespaceRoutes.get("/namespaces", async (c) => {
  const db = new DatabaseService({ binding: c.env.DB });
  try {
    const namespaces = await db.listNamespaces();

    return c.json({
      data: namespaces,
    });
  } catch (error) {
    console.error("Error listing namespaces:", error);
    return c.json({ message: "Failed to list namespaces" }, 500);
  } finally {
    await db.cleanup();
  }
});

// Create namespace
listNamespaceRoutes.post("/namespaces", async (c) => {
  const db = new DatabaseService({ binding: c.env.DB });
  try {
    const body = await c.req.json();
    const data = createNamespaceSchema.parse(body);

    const namespace = await db.createNamespace(data);

    return c.json({
      data: namespace,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ message: "Invalid request", errors: error.errors }, 400);
    }
    console.error("Error creating namespace:", error);
    return c.json({ message: "Failed to create namespace" }, 500);
  } finally {
    await db.cleanup();
  }
});

// Get namespace by ID
listNamespaceRoutes.get("/namespaces/:id", async (c) => {
  const db = new DatabaseService({ binding: c.env.DB });
  try {
    const id = c.req.param("id");
    const namespace = await db.getNamespace(id);

    if (!namespace) {
      return c.json({ message: "Namespace not found" }, 404);
    }

    return c.json({
      data: {
        id: namespace.id,
        name: namespace.name,
      },
    });
  } catch (error) {
    console.error("Error getting namespace:", error);
    return c.json({ message: "Failed to get namespace" }, 500);
  } finally {
    await db.cleanup();
  }
});

// Delete namespace
listNamespaceRoutes.delete("/namespaces/:id", async (c) => {
  const db = new DatabaseService({ binding: c.env.DB });
  try {
    const id = c.req.param("id");
    await db.deleteNamespace(id);

    return c.json({
      message: "Namespace deleted",
    });
  } catch (error) {
    console.error("Error deleting namespace:", error);
    return c.json({ message: "Failed to delete namespace" }, 500);
  } finally {
    await db.cleanup();
  }
});

// Update namespace (rename)
listNamespaceRoutes.patch("/namespaces/:id", async (c) => {
  const db = new DatabaseService({ binding: c.env.DB });
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const data = updateNamespaceSchema.parse(body);

    const namespace = await db.updateNamespace(id, data);

    return c.json({
      data: namespace,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ message: "Invalid request", errors: error.errors }, 400);
    }
    console.error("Error updating namespace:", error);
    return c.json({ message: "Failed to update namespace" }, 500);
  } finally {
    await db.cleanup();
  }
});
