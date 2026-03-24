import { Hono } from "hono";
import type { Env } from "../../config";
import { getDocumentRoutes } from "./get";
import { listDocumentRoutes } from "./list";
import { deleteDocumentRoutes } from "./delete";
import { getDocumentChunksRoutes } from "./chunks";

export const documentsRoutes = new Hono<{ Bindings: Env }>();

documentsRoutes.route("/", getDocumentRoutes);
documentsRoutes.route("/", listDocumentRoutes);
documentsRoutes.route("/", deleteDocumentRoutes);
documentsRoutes.route("/", getDocumentChunksRoutes);
