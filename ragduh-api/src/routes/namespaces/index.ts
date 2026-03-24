import { Hono } from "hono";
import type { Env } from "../../config";
import { listNamespaceRoutes } from "./list";

export const namespacesRoutes = new Hono<{ Bindings: Env }>();

namespacesRoutes.route("/", listNamespaceRoutes);
