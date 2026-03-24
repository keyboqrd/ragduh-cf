import { Context } from "hono";
import type { Env } from "../../../config";
import type { ModelMessage } from "ai";
import { generateText } from "ai";
import { CONDENSE_SYSTEM_PROMPT, CONDENSE_USER_PROMPT } from "../../../lib/prompts";
import { getLLMModel } from "../../../services/llm";

/**
 * Condense chat history into single query
 * Used for multi-turn conversations to create standalone query
 */
export async function condenseChatHistory(
  c: Context<{ Bindings: Env }>,
  data: { messages: any[]; llmModel: any },
  lastMessage: string,
): Promise<string> {
  console.log("Condensing chat history, messages:", data.messages.length, "lastMessage:", lastMessage);

  if (data.messages.length <= 1) {
    return lastMessage;
  }

  const model = await getLLMModel(data.llmModel, c.env);

  const messagesToCondense = data.messages.slice(0, -1);
  const chatHistory = messagesToCondense
    .map((m) => `- ${m.role}: ${extractTextFromParts(m.content as any)}`)
    .join("\n\n");

  console.log("Chat history to condense:", chatHistory.slice(0, 200));

  const result = await generateText({
    model,
    temperature: 0,
    system: CONDENSE_SYSTEM_PROMPT.compile({
      question: lastMessage,
      chatHistory,
    }),
    prompt: CONDENSE_USER_PROMPT.compile({
      query: lastMessage,
      chatHistory,
    }),
  });

  console.log("Condensed query result:", result.text);
  return result.text.trim();
}

/**
 * Extract text from content parts
 */
function extractTextFromParts(content: any): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text" || part.type === "text-content")
      .map((part) => part.text || part.content || "")
      .join(" ");
  }

  return String(content || "");
}
