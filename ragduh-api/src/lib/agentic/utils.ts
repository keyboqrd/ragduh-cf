import { ModelMessage } from "ai";
import { generateText } from "ai";
import { z } from "zod";

import { EVALUATE_QUERIES_PROMPT, GENERATE_QUERIES_PROMPT } from "./prompts";

export const formatChatHistory = (messages: ModelMessage[]) => {
  return messages.map((m) => `${m.role}: ${m.content as string}`).join("\n\n");
};

export const formatSources = (sources: { text: string; id: string }[]) => {
  return sources
    .map((s, idx) => `<source_${idx + 1}>\n${s.text}\n</source_${idx + 1}>`)
    .join("\n\n");
};

const schema = z.object({
  queries: z.array(
    z.object({
      type: z.enum(["keyword", "semantic"]),
      query: z.string(),
    }),
  ),
});

export type Queries = z.infer<typeof schema>["queries"];

export const generateQueries = async (
  model: any,
  messages: ModelMessage[],
  oldQueries: Queries,
) => {
  const queriesResult = await generateText({
    model,
    temperature: 0,
    system: GENERATE_QUERIES_PROMPT,
    prompt: `
${
  oldQueries.length > 0
    ? "以下查询已经被使用过，请生成不同的查询：\n" +
      oldQueries.map((q) => `- ${q.query}`).join("\n")
    : ""
}

聊天记录:
${formatChatHistory(messages)}

请生成搜索查询（只返回 JSON）：`,
  });

  const rawText = queriesResult.text.trim();

  // Try to find JSON object in response
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : rawText;

  // Clean markdown and common artifacts
  const cleanText = jsonText
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .replace(/[^\x20-\x7E\u4e00-\u9fa5]/g, "") // Remove non-printable chars but keep Chinese
    .replace(/"/g, '"')  // Chinese quotes to English
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .trim();

  // Try parsing with different bracket fixes
  try {
    const parsed = JSON.parse(cleanText);
    return {
      queries: schema.parse(parsed).queries,
      totalTokens: queriesResult.usage?.totalTokens || 0,
    };
  } catch (e) {
    console.error("generateQueries parse error:", { rawText, cleanText, error: e });
    // Return fallback queries based on last message
    const lastMessage = messages[messages.length - 1]?.content as string || "";
    return {
      queries: [
        { type: "semantic" as const, query: lastMessage.slice(0, 50) }
      ],
      totalTokens: queriesResult.usage?.totalTokens || 0,
    };
  }
};

const evalSchema = z.object({
  canAnswer: z.boolean(),
});

export const evaluateQueries = async (
  model: any,
  messages: ModelMessage[],
  sources: { text: string; id: string }[],
) => {
  const evaluateQueriesResult = await generateText({
    model,
    temperature: 0,
    system: EVALUATE_QUERIES_PROMPT,
    prompt: `
聊天记录:
${formatChatHistory(messages)}

检索到的来源:
${formatSources(sources)}

请评估是否能回答用户问题（只返回 JSON）：`,
  });

  const rawText = evaluateQueriesResult.text.trim();

  // Try to find JSON object in response
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : rawText;

  // Clean markdown and common artifacts
  const cleanText = jsonText
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .replace(/[^\x20-\x7E\u4e00-\u9fa5]/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleanText);
    return {
      canAnswer: evalSchema.parse(parsed).canAnswer,
      totalTokens: evaluateQueriesResult.usage?.totalTokens || 0,
    };
  } catch (e) {
    console.error("evaluateQueries parse error:", { rawText, cleanText, error: e });
    // Default to true to stop the loop and return answer
    return {
      canAnswer: true,
      totalTokens: evaluateQueriesResult.usage?.totalTokens || 0,
    };
  }
};
