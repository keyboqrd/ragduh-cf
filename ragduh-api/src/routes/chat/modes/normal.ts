import { Context } from "hono";
import { z } from "zod";
import { streamText, type ModelMessage } from "ai";

import type { Env } from "../../../config";
import { chatSchema } from "../../../schemas/chat";
import { createAppServices } from "../../../services/app";
import { DEFAULT_SYSTEM_PROMPT, NEW_MESSAGE_PROMPT } from "../../../lib/prompts";
import { extractTextFromParts } from "../../../lib/string-utils";
import { getLLMModel } from "../../../services/llm";

type ChatRequest = z.infer<typeof chatSchema>;

/**
 * Normal mode: Direct vector query + RAG streaming response
 */
export async function handleNormalMode(
  c: Context<{ Bindings: Env }>,
  data: ChatRequest,
  namespaceId: string,
  query: string,
) {
  const { vectorStoreService } = createAppServices(c.env);

  // Query vector store
  const vectorResult = await vectorStoreService.query({
    query,
    topK: data.topK,
    chunkSize: data.chunkSize,
    minScore: data.minScore,
    namespaceId,
    rerank: data.rerank,
    rerankModel: data.rerankModel?.split(":")[1],
    rerankLimit: data.rerankLimit,
    env: c.env,
  });

  const chunks = vectorResult?.results || [];
  const actualTopK = vectorResult?.actualTopK || chunks.length;

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

  // Build messages
  const systemPrompt = data.systemPrompt || DEFAULT_SYSTEM_PROMPT.compile();
  const newMessages: ModelMessage[] = [
    ...data.messages.slice(0, -1),
    {
      role: "user",
      content: NEW_MESSAGE_PROMPT.compile({
        chunks: chunks
          .map((c, idx) => `<source_${idx + 1}>\n${c.text}\n</source_${idx + 1}>`)
          .join("\n\n"),
        query: `<query>${query}</query>`,
      }),
    },
  ];

  const result = streamText({
    model,
    system: systemPrompt,
    messages: newMessages,
    temperature: data.temperature,
  });

  // Create custom SSE stream with sources event first, then text
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send sources event first
      controller.enqueue(encoder.encode(`event: data-sources\ndata: ${JSON.stringify({ results: chunks, actualTopK, requestedTopK: data.topK })}\n\n`));

      // Forward text chunks using fullStream for more reliable events
      try {
        for await (const delta of result.fullStream) {
          if (delta.type === "text-delta" && delta.text) {
            controller.enqueue(encoder.encode(`event: text-delta\ndata: ${JSON.stringify({ delta: delta.text })}\n\n`));
          }
        }
      } catch (err) {
        console.error("Error streaming text:", err);
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
