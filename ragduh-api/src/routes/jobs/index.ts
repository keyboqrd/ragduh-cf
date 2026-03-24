import { Hono } from "hono";
import type { Env } from "../../config";
import { createJobRoutes } from "./create";
import { getJobRoutes } from "./get";
import { listJobRoutes } from "./list";
import { deleteJobRoutes } from "./delete";
import { reIngestRoutes } from "./re-ingest";

export const jobsRoutes = new Hono<{ Bindings: Env }>();

jobsRoutes.route("/", createJobRoutes);
jobsRoutes.route("/", getJobRoutes);
jobsRoutes.route("/", listJobRoutes);
jobsRoutes.route("/", deleteJobRoutes);
jobsRoutes.route("/", reIngestRoutes);
