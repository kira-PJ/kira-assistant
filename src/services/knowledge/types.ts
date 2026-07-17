export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: WebSearchResult[];
  summary: string;
  timestamp: number;
  cached: boolean;
}

export interface AWSServiceInfo {
  name: string;
  shortName: string;
  description: string;
  category: string;
  useCases: string[];
  relatedServices: string[];
  docUrl: string;
  pricingUrl: string;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  source: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeSearchResult {
  entry: KnowledgeEntry;
  score: number;
  matchedSnippet: string;
}

export interface FAQEntry {
  id: string;
  question: string;
  answer: string;
  timesUsed: number;
  lastUsed: number;
  tags: string[];
}
