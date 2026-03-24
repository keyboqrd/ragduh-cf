import { Context } from "hono";
import { z } from "zod";
import { streamText, type ModelMessage } from "ai";

import type { Env } from "../../../config";
import { chatSchema } from "../../../schemas/chat";
import { createAppServices } from "../../../services/app";
import { DEFAULT_SYSTEM_PROMPT, NEW_MESSAGE_PROMPT } from "../../../lib/prompts";
import { extractTextFromParts } from "../../../lib/string-utils";
import { getLLMModel } from "../../../services/llm";
import { agenticPipeline } from "../../../lib/agentic";

type ChatRequest = z.infer<typeof chatSchema>;

/**
 * Agentic mode: Multi-turn query generation and search with iterative refinement
 */
export async function handleAgenticMode(
  c: Context<{ Bindings: Env }>,
  data: ChatRequest,
  namespaceId: string,
  query: string,
) {
  const { vectorStoreService } = createAppServices(c.env);

  // Get LLM model
  let model;
  try {
    model = await getLLMModel(data.llmModel, c.env);
  } catch (error) {
    console.error("Failed to get LLM model:", error);
    return c.json({
      error: "LLM model initialization failed",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }

  const queryOptions = {
    topK: data.topK,
    chunkSize: data.chunkSize,
    minScore: data.minScore,
    namespaceId,
    rerank: data.rerank,
    rerankModel: data.rerankModel?.split(":")[1],
    rerankLimit: data.rerankLimit,
  };

  // Use agentic pipeline
  return agenticPipeline({
    model,
    queryOptions,
    vectorStoreService,
    systemPrompt: data.systemPrompt || DEFAULT_SYSTEM_PROMPT.compile(),
    temperature: data.temperature,
    messagesWithoutQuery: data.messages.slice(0, -1) as ModelMessage[],
    lastMessage: extractTextFromParts(data.messages[data.messages.length - 1]?.content || ""),
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
