/**
 * Deep Research Pipeline
 */

import type { ModelMessage } from "ai";
import { generateText, streamText } from "ai";

import { getPrompts, RESEARCH_CONFIG } from "./config";
import { SearchResult, SearchResults } from "./classes";

interface DeepResearchOptions {
  model: any;
  query: string;
  messages: ModelMessage[];
  vectorStoreService: any;
  namespaceId: string;
  env: any;
  topK?: number;
  minScore?: number;
  chunkSize?: number;
  aiGateway?: any;
}

interface QueryResult {
  query: string;
  results: SearchResult[];
}

// Get prompts at runtime (not module scope) to get correct date
const getPROMPTS = () => getPrompts();

export class DeepResearchPipeline {
  private model: any;
  private query: string;
  private messages: ModelMessage[];
  private vectorStoreService: any;
  private namespaceId: string;
  private topK: number;
  private minScore: number;
  private chunkSize: number;
  private env: any;
  private aiGateway?: any;
  private totalTokens: number = 0;

  constructor(options: DeepResearchOptions) {
    this.model = options.model;
    this.query = options.query;
    this.messages = options.messages;
    this.vectorStoreService = options.vectorStoreService;
    this.namespaceId = options.namespaceId;
    this.topK = options.topK || 10;
    this.minScore = options.minScore || 0.5;
    this.chunkSize = options.chunkSize || 2048;
    this.env = options.env;
    this.aiGateway = options.aiGateway;
  }

  async runResearch(): Promise<{
    results: SearchResults;
    queryToResult: Record<string, QueryResult>;
  }> {
    const searchResults = new SearchResults();
    const queryToResult: Record<string, QueryResult> = {};

    // Step 1: Generate initial queries
    const initialQueries = await this.generateInitialQueries();

    // Step 2: Perform searches for initial queries
    for (const query of initialQueries) {
      const results = await this.performSearch(query);
      if (results.length > 0) {
        queryToResult[query] = { query, results };
        searchResults.addMany(results);
      }
    }

    // Step 3: Iterative research (fill gaps)
    const additionalResults = await this.conductIterativeResearch(searchResults);
    for (const result of additionalResults) {
      searchResults.add(result);
    }

    return {
      results: searchResults,
      queryToResult,
    };
  }

  async runResearchWithLogs(): Promise<{
    results: SearchResults;
    queryToResult: Record<string, QueryResult>;
  }> {
    return this.runResearch();
  }

  private async generateInitialQueries(): Promise<string[]> {
    const PROMPTS = getPROMPTS();
    const result = await generateText({
      model: this.model,
      temperature: 0,
      system: PROMPTS.planningPrompt,
      prompt: `Research topic: ${this.query}`,
    });

    this.totalTokens += result.usage?.totalTokens || 0;

    // Parse the queries from the response
    const queries = this.parseQueriesFromResponse(result.text);
    return queries.slice(0, RESEARCH_CONFIG.maxQueries);
  }

  private parseQueriesFromResponse(response: string): string[] {
    const lines = response.split("\n");
    const queries: string[] = [];

    for (const line of lines) {
      const match = line.match(/^\d+\.\s*(.+)/);
      if (match) {
        queries.push(match[1].trim());
      }
    }

    return queries;
  }

  private async performSearch(query: string): Promise<SearchResult[]> {
    try {
      const result = await this.vectorStoreService.query({
        query,
        topK: this.topK,
        minScore: this.minScore,
        chunkSize: this.chunkSize,
        namespaceId: this.namespaceId,
        env: this.env,
      });

      if (!result) return [];

      return result.results.map((r: any) => new SearchResult({
        id: r.id,
        url: r.metadata?.url || "",
        title: r.metadata?.title || "",
        content: r.text,
        score: r.score,
      }));
    } catch (error) {
      console.error("Search error:", error);
      return [];
    }
  }

  private async conductIterativeResearch(
    currentResults: SearchResults
  ): Promise<SearchResult[]> {
    const additionalResults: SearchResult[] = [];
    let iterations = 0;

    while (iterations < RESEARCH_CONFIG.budget) {
      // Evaluate what's missing
      const followUpQueries = await this.evaluateAndGenerateFollowUps(
        currentResults
      );

      if (followUpQueries.length === 0) break;

      // Search for follow-up queries
      for (const query of followUpQueries.slice(0, RESEARCH_CONFIG.maxQueries)) {
        const results = await this.performSearch(query);
        if (results.length > 0) {
          additionalResults.push(...results);
          currentResults.addMany(results);
        }
      }

      iterations++;
    }

    return additionalResults;
  }

  private async evaluateAndGenerateFollowUps(
    currentResults: SearchResults
  ): Promise<string[]> {
    const sourcesContent = currentResults.getContent().join("\n\n");
    const PROMPTS = getPROMPTS();

    const result = await generateText({
      model: this.model,
      temperature: 0,
      system: PROMPTS.evaluationPrompt,
      prompt: `
Research goal: ${this.query}

Current sources:
${sourcesContent}

What additional information is needed? Generate follow-up queries.
      `.trim(),
    });

    this.totalTokens += result.usage?.totalTokens || 0;

    return this.parseQueriesFromResponse(result.text);
  }

  private async filterResults(
    results: SearchResults
  ): Promise<SearchResults> {
    const filtered = new SearchResults();

    for (const result of results.getAll()) {
      const isRelevant = await this.evaluateRelevance(result.content);
      if (isRelevant) {
        filtered.add(result);
      }
    }

    return filtered;
  }

  private async evaluateRelevance(content: string): Promise<boolean> {
    const PROMPTS = getPROMPTS();
    const result = await generateText({
      model: this.model,
      temperature: 0,
      system: PROMPTS.filterPrompt,
      prompt: `
Research topic: ${this.query}

Content to evaluate:
${content}

Is this content relevant to the research topic? Answer with YES or NO.
      `.trim(),
    });

    this.totalTokens += result.usage?.totalTokens || 0;

    return result.text.toUpperCase().includes("YES");
  }

  async generateResearchAnswer(
    results: SearchResults
  ): Promise<string> {
    const sourcesContent = results.getContent().join("\n\n");
    const PROMPTS = getPROMPTS();

    const result = await generateText({
      model: this.model,
      temperature: 0.7,
      system: PROMPTS.answerPrompt,
      prompt: `
Research topic: ${this.query}

Sources:
${sourcesContent}

Generate a comprehensive report.
      `.trim(),
    });

    this.totalTokens += result.usage?.totalTokens || 0;

    return result.text;
  }

  /**
   * Run research and return streaming response
   * runResearch returns streamText result
   */
  async runResearchStream() {
    const { results } = await this.runResearch();

    // Use streamText for streaming response
    const PROMPTS = getPROMPTS();
    const answerStream = streamText({
      model: this.model,
      system: PROMPTS.answerPrompt,
      prompt: `
Research topic: ${this.query}

Sources:
${results.getContent().join("\n\n")}

Generate a comprehensive report.
      `.trim(),
    });

    return answerStream.toUIMessageStream();
  }
}
