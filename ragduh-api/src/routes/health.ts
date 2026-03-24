import { Hono } from "hono";
import type { Env } from "../config";

export const healthRoutes = new Hono<{ Bindings: Env }>();

healthRoutes.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

healthRoutes.get("/health/ready", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

healthRoutes.get("/health/live", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});
