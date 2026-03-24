import type { ModelMessage } from "ai";
import { streamText, generateText } from "ai";

import { NEW_MESSAGE_PROMPT } from "../prompts";
import { agenticSearch } from "./search";
import { formatSources } from "./utils";
import { VectorStoreService } from "../../services/vector-store";

type AgenticPipelineOptions = {
  model: any;
  queryOptions: any;
  vectorStoreService: VectorStoreService;
  systemPrompt?: string;
  temperature?: number;
  messagesWithoutQuery: ModelMessage[];
  lastMessage: string;
  afterQueries?: (totalQueries: number) => void;
  maxEvals?: number;
  tokenBudget?: number;
};

const agenticPipeline = async ({
  model,
  queryOptions,
  vectorStoreService,
  headers,
  systemPrompt,
  temperature,
  messagesWithoutQuery,
  lastMessage,
  afterQueries,
  maxEvals = 2,
  tokenBudget = 4096,
  includeLogs = true,
}: AgenticPipelineOptions & {
  headers?: HeadersInit;
  afterQueries?: (totalQueries: number) => void;
  includeLogs?: boolean;
}) => {
  const messages: ModelMessage[] = [
    ...messagesWithoutQuery,
    { role: "user", content: lastMessage },
  ];

  const runAgenticSearch = async () => {
    // step 1. generate queries
    const { chunks, queryToResult, totalQueries } = await agenticSearch({
      model,
      messages,
      queryOptions,
      vectorStoreService,
      maxEvals,
      tokenBudget,
    });

    afterQueries?.(totalQueries);

    // Calculate actualTopK based on chunkSize limit
    const MAX_CONTEXT_TOKENS = 10240;
    const chunkSize = queryOptions.chunkSize || 2048;
    const maxTopK = Math.floor(MAX_CONTEXT_TOKENS / chunkSize);
    const actualTopK = Math.min(queryOptions.topK || maxTopK, maxTopK);

    return {
      chunks,
      queryToResult,
      totalQueries,
      actualTopK,
      dedupedData: Object.values(chunks),
    };
  };

  // Run search first to get sources
  const searchResult = await runAgenticSearch();

  const newMessages: ModelMessage[] = [
    ...messagesWithoutQuery,
    {
      role: "user",
      content: NEW_MESSAGE_PROMPT.compile({
        chunks: formatSources(searchResult.dedupedData as any),
        query: `<query>${lastMessage}</query>`,
      }),
    },
  ];

  const result = streamText({
    model,
    system: systemPrompt,
    messages: newMessages,
    temperature,
  });

  // Create custom SSE stream with sources event first, then text
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial status
      controller.enqueue(encoder.encode(`event: research-status\ndata: ${JSON.stringify({ stage: "planning", message: "正在生成查询..." })}\n\n`));

      // Run search first to get sources
      const searchResult = await runAgenticSearch();

      // Send queries status
      const queries = Object.values(searchResult.queryToResult).map((r: any) => r.query);
      if (queries.length > 0) {
        controller.enqueue(encoder.encode(`event: research-status\ndata: ${JSON.stringify({ stage: "searching", message: `已执行 ${queries.length} 个查询`, queries })}\n\n`));
      }

      // Send sources event
      controller.enqueue(encoder.encode(`event: data-sources\ndata: ${JSON.stringify({
        results: searchResult.dedupedData,
        actualTopK: searchResult.actualTopK,
        requestedTopK: queryOptions.topK,
        ...(includeLogs && {
          logs: Object.values(searchResult.queryToResult),
        }),
      })}\n\n`));

      // Send answer generation status
      controller.enqueue(encoder.encode(`event: research-status\ndata: ${JSON.stringify({ stage: "answering", message: "正在生成回答..." })}\n\n`));

      // Forward text chunks
      try {
        for await (const delta of result.fullStream) {
          if (delta.type === "text-delta" && delta.text) {
            controller.enqueue(encoder.encode(`event: text-delta\ndata: ${JSON.stringify({ delta: delta.text })}\n\n`));
          }
        }
      } catch (err) {
        console.error("Error streaming text:", err);
      }

      // Send completion status
      controller.enqueue(encoder.encode(`event: research-status\ndata: ${JSON.stringify({ stage: "complete", message: "完成" })}\n\n`));

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...headers,
    },
  });
};

export const generateAgenticResponse = async ({
  model,
  queryOptions,
  vectorStoreService,
  systemPrompt,
  temperature,
  messagesWithoutQuery,
  lastMessage,
  afterQueries,
  maxEvals = 3,
  tokenBudget = 4096,
}: AgenticPipelineOptions) => {
  const messages: ModelMessage[] = [
    ...messagesWithoutQuery,
    { role: "user", content: lastMessage },
  ];

  // step 1. generate queries
  const { chunks, totalQueries } = await agenticSearch({
    model,
    messages,
    queryOptions,
    vectorStoreService,
    maxEvals,
    tokenBudget,
  });

  afterQueries?.(totalQueries);

  // TODO: shrink chunks and only select relevant ones to pass to the LLM
  const dedupedData = Object.values(chunks);
  const newMessages: ModelMessage[] = [
    ...messagesWithoutQuery,
    {
      role: "user",
      content: NEW_MESSAGE_PROMPT.compile({
        chunks: formatSources(dedupedData as any),
        query: `<query>${lastMessage}</query>`,
      }),
    },
  ];

  const answer = await generateText({
    model: model,
    system: systemPrompt,
    messages: newMessages,
    temperature: temperature,
  });

  return {
    answer: answer.text,
    sources: dedupedData,
  };
};

export default agenticPipeline;
export { agenticPipeline };
