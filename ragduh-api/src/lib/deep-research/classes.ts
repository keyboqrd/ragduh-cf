/**
 * SearchResult represents a single search result from the vector store
 */
export class SearchResult {
  id: string;
  url: string;
  title: string;
  content: string;
  score: number;

  constructor(options: {
    id: string;
    url?: string;
    title?: string;
    content: string;
    score?: number;
  }) {
    this.id = options.id;
    this.url = options.url || "";
    this.title = options.title || "";
    this.content = options.content;
    this.score = options.score || 0;
  }
}

/**
 * SearchResults is a collection of SearchResult objects
 */
export class SearchResults {
  private results: SearchResult[] = [];

  add(result: SearchResult): void {
    this.results.push(result);
  }

  addMany(results: SearchResult[]): void {
    this.results.push(...results);
  }

  getAll(): SearchResult[] {
    return this.results;
  }

  getContent(): string[] {
    return this.results.map((r) => r.content);
  }

  getScores(): number[] {
    return this.results.map((r) => r.score);
  }
}
