export interface GhostAPI {
  // Config
  getConfig: (key: string) => Promise<unknown>;
  setConfig: (key: string, value: unknown) => Promise<void>;

  // Window
  setOpacity: (opacity: number) => Promise<void>;
  setCollapse: (collapsed: boolean) => Promise<void>;
  getWindowState: () => Promise<WindowState | null>;
  toggleMaximize: () => Promise<void>;
  closeWindow: () => Promise<void>;

  // Session
  startCapture: () => Promise<{ success: boolean; error?: string }>;
  stopCapture: () => Promise<{ success: boolean }>;
  setCallType: (type: string) => Promise<void>;
  getSessionState: () => Promise<string>;
  getTranscript: () => Promise<TranscriptEntry[]>;
  getSuggestions: () => Promise<AISuggestion[]>;
  getTalkRatio: () => Promise<TalkRatio>;

  // First-run
  isFirstRun: () => Promise<boolean>;
  completeSetup: (data: Record<string, unknown>) => Promise<void>;

  // Live events
  onTranscriptSegment: (callback: (segment: TranscriptEntry) => void) => () => void;
  onCoachingSuggestion: (callback: (suggestion: AISuggestion) => void) => () => void;
  onSentimentUpdate: (callback: (analysis: SentimentData) => void) => () => void;
  onTalkRatioUpdate: (callback: (ratio: TalkRatio) => void) => () => void;
  onTechMention: (callback: (mention: TechMention) => void) => () => void;
  onSessionState: (callback: (state: string) => void) => () => void;
  onSessionError: (callback: (error: string) => void) => () => void;
  onVadChange: (callback: (data: { source: string; active: boolean }) => void) => () => void;

  // Hotkey events
  onToggleCollapse: (callback: () => void) => () => void;
  onQuickAsk: (callback: () => void) => () => void;
  onToggleCapture: (callback: () => void) => () => void;
  onBookmarkMoment: (callback: () => void) => () => void;
  onOpenSettings: (callback: () => void) => () => void;
}

export interface WindowState {
  bounds: { x: number; y: number; width: number; height: number };
  opacity: number;
  isVisible: boolean;
}

export interface TranscriptEntry {
  id: string;
  speaker: 'you' | 'other';
  speakerName: string;
  text: string;
  timestamp: number;
  confidence: number;
  isBookmarked?: boolean;
  isPartial?: boolean;
}

export interface AISuggestion {
  id: string;
  type: 'question' | 'answer' | 'context' | 'sentiment' | 'action';
  title: string;
  content: string;
  priority: 'high' | 'medium' | 'low';
  timestamp: number;
  sources?: string[];
  metadata?: Record<string, unknown>;
}

export interface ActionItem {
  id: string;
  text: string;
  owner?: string;
  dueDate?: string;
  completed: boolean;
  timestamp: number;
}

export interface SentimentData {
  sentiment: 'positive' | 'neutral' | 'confused' | 'hesitant' | 'frustrated';
  confidence: number;
  reason: string;
  timestamp: number;
}

export interface TalkRatio {
  you: number;
  other: number;
  yourWordCount?: number;
  otherWordCount?: number;
}

export interface TechMention {
  term: string;
  context: string;
  timestamp: number;
}

export type SessionState = 'idle' | 'initializing' | 'active' | 'error';
export type CallType = 'discovery' | 'demo' | 'training' | 'technical' | 'followup' | 'negotiation';
