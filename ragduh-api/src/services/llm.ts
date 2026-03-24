import { createAiGateway } from "ai-gateway-provider";
import { createGoogleGenerativeAI } from "ai-gateway-provider/providers/google";
import type { Env } from "../config";

/**
 * Get LLM model from provider string
 * @param llmString - Format: "provider:modelName" (e.g., "google:gemini-2.0-flash")
 */
export async function getLLMModel(llmString: string, env: Env) {
  const [provider, modelName] = llmString.split(":") as [string, string];

  if (!env.CF_ACCOUNT_ID || !env.CF_GATEWAY_ID) {
    throw new Error("AI Gateway not configured: missing CF_ACCOUNT_ID or CF_GATEWAY_ID");
  }

  const aiGateway = createAiGateway({
    accountId: env.CF_ACCOUNT_ID,
    gateway: env.CF_GATEWAY_ID,
    apiKey: env.CF_AIG_TOKEN,
  });

  if (provider === "google") {
    const google = createGoogleGenerativeAI();
    return aiGateway(google(modelName));
  }

  if (provider === "openai") {
    const { createOpenAI } = await import("ai-gateway-provider/providers/openai");
    const openai = createOpenAI();
    return aiGateway(openai(modelName));
  }

  throw new Error(`Unknown provider: ${provider}`);
}
