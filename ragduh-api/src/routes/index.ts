import { Hono } from "hono";
import type { Env } from "../config";
import { healthRoutes } from "./health";
import { jobsRoutes } from "./jobs";
import { documentsRoutes } from "./documents";
import { namespacesRoutes } from "./namespaces";

export function createRouter() {
  const app = new Hono<{ Bindings: Env }>();

  // Register routes
  app.route("/", healthRoutes);
  app.route("/api", jobsRoutes);
  app.route("/api", documentsRoutes);
  app.route("/api", namespacesRoutes);

  return app;
}
