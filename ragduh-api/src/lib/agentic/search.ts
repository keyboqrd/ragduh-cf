import type { ModelMessage } from "ai";
import { generateText } from "ai";

import { formatSources, formatChatHistory, generateQueries, evaluateQueries, Queries } from "./utils";
import { VectorStoreService } from "../../services/vector-store";

type QueryWithType = {
  query: string;
  type: "keyword" | "semantic";
};

export async function agenticSearch({
  model,
  messages,
  queryOptions,
  vectorStoreService,
  maxEvals = 3,
  tokenBudget = 4096,
  onQueries,
}: {
  model: any;
  messages: ModelMessage[];
  queryOptions: any;
  vectorStoreService: VectorStoreService;
  maxEvals?: number;
  tokenBudget?: number;
  onQueries?: (queries: Queries) => void;
}) {
  const queries: Queries = [];
  const chunks: Record<string, any> = {};
  const queryToResult: Record<string, any> = {};
  let totalQueries = 0;
  let totalTokens = 0;

  const lastMessage = messages[messages.length - 1]!.content as string;

  for (let i = 0; i < maxEvals; i++) {
    const { queries: newQueries, totalTokens: queriesTokens } =
      await generateQueries(model, messages, queries);

    newQueries.forEach((q) => {
      if (queries.some((q2) => q2.query === q.query)) return;
      queries.push(q);
    });

    totalTokens += queriesTokens;

    if (onQueries) onQueries(newQueries);

    // Execute searches in parallel for all queries
    // Include the last message as initial query on first eval loop
    const queriesToExecute: QueryWithType[] = [
      ...(i === 0 ? [{ query: lastMessage, type: "semantic" as const }] : []),
      ...newQueries.map((q) => ({ query: q.query, type: q.type })),
    ];

    const results = await Promise.all(
      queriesToExecute.map(async (query) => {
        const result = await vectorStoreService.query({
          query: query.query,
          topK: queryOptions.topK,
          chunkSize: queryOptions.chunkSize,
          minScore: queryOptions.minScore,
          namespaceId: queryOptions.namespaceId,
          rerank: queryOptions.rerank,
          rerankModel: queryOptions.rerankModel,
          rerankLimit: queryOptions.rerankLimit,
          env: queryOptions.env,
        });
        totalQueries++;
        return result;
      }),
    );

    // Process results
    results.forEach((result) => {
      if (result && result.results.length > 0) {
        result.results.forEach((r: any) => {
          if (!chunks[r.id]) {
            chunks[r.id] = r;
          }
        });
      }
    });

    // Store query to result mapping
    results.forEach((result) => {
      if (result) {
        queryToResult[result.query] = result;
      }
    });

    const { canAnswer, totalTokens: evalsTokens } = await evaluateQueries(
      model,
      messages,
      Object.values(chunks).map((c: any) => ({ text: c.text, id: c.id })),
    );
    totalTokens += evalsTokens;

    if (canAnswer || totalTokens >= tokenBudget) break;
  }

  return {
    queries,
    chunks,
    queryToResult,
    totalQueries,
  };
}
