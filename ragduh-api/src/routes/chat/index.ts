import { Hono } from "hono";
import { chatRoute } from "./chat";
import type { Env } from "../../config";

export const chatRoutes = new Hono<{ Bindings: Env }>();

chatRoutes.post("/", chatRoute);
