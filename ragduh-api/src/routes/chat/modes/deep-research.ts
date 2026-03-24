import { Context } from "hono";
import { z } from "zod";
import { streamText, type ModelMessage } from "ai";

import type { Env } from "../../../config";
import { chatSchema } from "../../../schemas/chat";
import { createAppServices } from "../../../services/app";
import { DeepResearchPipeline } from "../../../lib/deep-research";
import { getLLMModel } from "../../../services/llm";
import { DEFAULT_SYSTEM_PROMPT, NEW_MESSAGE_PROMPT } from "../../../lib/prompts";

type ChatRequest = z.infer<typeof chatSchema>;

/**
 * Deep Research mode: Iterative research with planning and gap-filling
 * Returns streaming response with research process logs
 */
export async function handleDeepResearchMode(
  c: Context<{ Bindings: Env }>,
  data: ChatRequest,
  namespaceId: string,
  query: string,
) {
  const { vectorStoreService } = createAppServices(c.env);

  const model = await getLLMModel(data.llmModel, c.env);

  const pipeline = new DeepResearchPipeline({
    model,
    query,
    messages: data.messages as ModelMessage[],
    vectorStoreService,
    namespaceId,
    topK: data.topK,
    minScore: data.minScore,
    chunkSize: data.chunkSize,
    env: c.env,
  });

  // Create custom SSE stream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send initial status
        controller.enqueue(encoder.encode(`event: research-status\ndata: ${JSON.stringify({ stage: "planning", message: "正在生成研究计划..." })}\n\n`));

        // Run research to get sources
        const { results, queryToResult } = await pipeline.runResearchWithLogs();

        // Send queries status
        const queries = Object.keys(queryToResult || {});
        if (queries.length > 0) {
          controller.enqueue(encoder.encode(`event: research-status\ndata: ${JSON.stringify({ stage: "searching", message: `已执行 ${queries.length} 个查询`, queries })}\n\n`));
        }

        // Format sources for display
        const chunks = results.getAll().map(r => ({
          id: r.id,
          text: r.content,
          score: r.score,
        }));

        // Send sources event
        controller.enqueue(encoder.encode(`event: data-sources\ndata: ${JSON.stringify({ results: chunks })}\n\n`));

        // Send answer generation status
        controller.enqueue(encoder.encode(`event: research-status\ndata: ${JSON.stringify({ stage: "answering", message: "正在生成回答..." })}\n\n`));

        // Build messages for final answer
        const newMessages: ModelMessage[] = [
          ...data.messages.slice(0, -1),
          {
            role: "user",
            content: NEW_MESSAGE_PROMPT.compile({
              chunks: chunks.map((c, idx) => `<source_${idx + 1}>\n${c.text}\n</source_${idx + 1}>`).join("\n\n"),
              query: `<query>${query}</query>`,
            }),
          },
        ];

        const result = streamText({
          model,
          system: data.systemPrompt || DEFAULT_SYSTEM_PROMPT.compile(),
          messages: newMessages,
          temperature: data.temperature,
        });

        // Forward text chunks
        for await (const delta of result.fullStream) {
          if (delta.type === "text-delta" && delta.text) {
            controller.enqueue(encoder.encode(`event: text-delta\ndata: ${JSON.stringify({ delta: delta.text })}\n\n`));
          }
        }

        // Send completion status
        controller.enqueue(encoder.encode(`event: research-status\ndata: ${JSON.stringify({ stage: "complete", message: "研究完成" })}\n\n`));
      } catch (err) {
        console.error("Error in deep research:", err);
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : "Unknown error" })}\n\n`));
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
