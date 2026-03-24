import { Context } from "hono";
import { z } from "zod";

import type { Env } from "../../config";
import { chatSchema } from "../../schemas/chat";
import { extractTextFromParts } from "../../lib/string-utils";
import { condenseChatHistory } from "./utils/condense";
import { handleNormalMode } from "./modes/normal";
import { handleAgenticMode } from "./modes/agentic";
import { handleDeepResearchMode } from "./modes/deep-research";

type ChatRequest = z.infer<typeof chatSchema>;

/**
 * Main chat route handler
 * Routes to appropriate mode handler based on request mode
 */
export const chatRoute = async (c: Context<{ Bindings: Env }>) => {
  try {
    // Parse and validate request
    const body = await c.req.json();
    const data = chatSchema.parse(body);

    // Get namespace ID from header or query
    const namespaceId = c.req.header("x-namespace-id") || c.req.query("namespaceId");
    if (!namespaceId) {
      return c.json({ error: "x-namespace-id header or namespaceId query param is required" }, 400);
    }

    // Extract last message text
    const lastMessage = extractTextFromParts(
      data.messages[data.messages.length - 1]?.content || ""
    );

    // Condense chat history if needed
    const query = await condenseChatHistory(c, data, lastMessage);

    // For normal mode, we need to handle sources separately before streaming
    if (data.mode === "normal") {
      return handleNormalMode(c, data, namespaceId, query);
    }

    // Route based on mode
    switch (data.mode) {
      case "agentic":
        return handleAgenticMode(c, data, namespaceId, query);

      case "deepResearch":
        return handleDeepResearchMode(c, data, namespaceId, query);

      default:
        return c.json({ error: `Unknown mode: ${data.mode}` }, 400);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: "Validation error", details: error.errors }, 400);
    }

    console.error("Chat route error:", error);
    return c.json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
};
