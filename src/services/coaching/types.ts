export type CallType = 
  | 'discovery' 
  | 'demo' 
  | 'training' 
  | 'technical' 
  | 'followup' 
  | 'negotiation';

export type SuggestionType = 'question' | 'answer' | 'context' | 'sentiment' | 'action';
export type Priority = 'high' | 'medium' | 'low';
export type Sentiment = 'positive' | 'neutral' | 'confused' | 'hesitant' | 'frustrated';

export interface CoachingSuggestion {
  id: string;
  type: SuggestionType;
  title: string;
  content: string;
  priority: Priority;
  timestamp: number;
  sources?: string[];
  metadata?: Record<string, unknown>;
}

export interface SentimentAnalysis {
  sentiment: Sentiment;
  confidence: number;
  reason: string;
  timestamp: number;
}

export interface TalkRatioData {
  you: number;  // percentage 0-100
  other: number;
  yourWordCount: number;
  otherWordCount: number;
}

export interface ActionItemData {
  id: string;
  text: string;
  owner: string;
  dueDate?: string;
  timestamp: number;
}

export interface TechMention {
  term: string;
  context: string;
  timestamp: number;
}

export interface CoachingContext {
  callType: CallType;
  recentTranscript: string;      // Last ~2000 tokens of transcript
  fullTranscriptLength: number;
  talkRatio: TalkRatioData;
  detectedTech: TechMention[];
  currentSentiment?: SentimentAnalysis;
  callDurationMs: number;
  segmentCount: number;
}

export interface CoachingEvents {
  'suggestion': (suggestion: CoachingSuggestion) => void;
  'sentiment': (analysis: SentimentAnalysis) => void;
  'action-item': (item: ActionItemData) => void;
  'talk-ratio': (ratio: TalkRatioData) => void;
  'tech-mention': (mention: TechMention) => void;
  'error': (error: Error) => void;
}
