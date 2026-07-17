export interface CallSummary {
  id: string;
  title: string;
  date: number;
  durationMs: number;
  callType: string;
  participants: string[];
  topicsCovered: string[];
  keyDecisions: string[];
  overallSentiment: string;
  synopsis: string; // 2-3 paragraph summary
}

export interface CallScore {
  callId: string;
  overall: number; // 0-100
  dimensions: ScoreDimension[];
  strengths: string[];
  improvements: ImprovementSuggestion[];
  timestamp: number;
}

export interface ScoreDimension {
  name: string;
  score: number; // 0-100
  weight: number; // 0-1
  explanation: string;
  evidence: string; // quote from transcript
}

export interface ImprovementSuggestion {
  area: string;
  suggestion: string;
  example: string; // what you could have said instead
  priority: 'high' | 'medium' | 'low';
}

export interface ActionItem {
  id: string;
  text: string;
  owner: 'you' | 'customer' | 'both';
  dueDate?: string;
  context: string; // relevant transcript excerpt
  timestamp: number;
}

export interface FollowUpEmail {
  subject: string;
  body: string;
  actionItems: string[];
  nextSteps: string[];
}

export interface PostCallReport {
  summary: CallSummary;
  score: CallScore;
  actionItems: ActionItem[];
  followUpEmail: FollowUpEmail;
  talkRatio: { you: number; other: number };
  totalWords: { you: number; other: number };
}
