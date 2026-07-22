import React, { useState, useRef, useCallback } from 'react';
import { AISuggestion } from '../../types';

interface SuggestionsPanelProps {
  suggestions: AISuggestion[];
}

const priorityColors = {
  high: 'border-l-ghost-accent',
  medium: 'border-l-ghost-warning',
  low: 'border-l-ghost-text-dim',
};

const typeLabels: Record<string, string> = {
  question: 'Suggested Question',
  answer: 'Answer Help',
  context: 'Context',
  sentiment: 'Sentiment',
  action: 'Insight',
};

/**
 * SuggestionsPanel with:
 * - AI coaching suggestions with feedback buttons
 * - Chat input for mid-call context, questions, and speaker labeling
 *
 * Chat commands:
 * - "Speaker 1 is Michael" → renames Speaker 1 to Michael
 * - "This is a discovery call about AI/ML for insurance" → sets meeting context
 * - "What is Microsoft Fabric?" → asks the AI and shows answer
 * - Any text → sent as context/question to the coaching AI
 */
const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({ suggestions }) => {
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSend = useCallback(async () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text }]);

    // Check if it's a speaker rename command
    const speakerMatch = text.match(/^speaker\s*(\d+)\s+(?:is|=)\s+(.+)$/i);
    if (speakerMatch) {
      const speakerId = `speaker_${parseInt(speakerMatch[1]) - 1}`;
      const name = speakerMatch[2].trim();
      window.ghostAPI?.renameSpeaker?.(speakerId as any, name);
      setChatHistory(prev => [...prev, { role: 'ai', text: `Renamed Speaker ${speakerMatch[1]} to "${name}" (all segments updated)` }]);
      return;
    }

    // Send to AI as a manual question/context
    setSending(true);
    try {
      await (window.ghostAPI as any)?.manualAsk?.(text);
      setChatHistory(prev => [...prev, { role: 'ai', text: 'Processing... check suggestions above for the answer.' }]);
    } catch {
      setChatHistory(prev => [...prev, { role: 'ai', text: 'Failed to process. Try again.' }]);
    }
    setSending(false);
  }, [chatInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFeedback = (id: string, type: 'up' | 'down') => {
    setFeedback(prev => ({ ...prev, [id]: type }));
    // Could persist this via IPC for learning
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Suggestions list — scrollable, with bottom padding for chat input */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 pb-16 space-y-2">
        {suggestions.length === 0 && chatHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-ghost-text-dim">
            <p className="text-[14px] font-medium">Coach</p>
            <p className="text-[13px] mt-2">Type below to give context, rename speakers, or ask questions</p>
            <p className="text-[12px] mt-3 text-ghost-text-dim/60">Examples:</p>
            <p className="text-[12px] text-ghost-text-dim/60">• "Speaker 1 is Michael from Jubilee"</p>
            <p className="text-[12px] text-ghost-text-dim/60">• "This meeting is about AI implementation"</p>
            <p className="text-[12px] text-ghost-text-dim/60">• "What is Microsoft Fabric?"</p>
          </div>
        )}

        {/* Chat messages */}
        {chatHistory.map((msg, i) => (
          <div key={`chat-${i}`} className={`p-2 rounded-md text-[13px] ${
            msg.role === 'user'
              ? 'bg-ghost-speaker-you/10 text-ghost-speaker-you ml-8'
              : 'bg-ghost-surface text-ghost-text-dim mr-8'
          }`}>
            {msg.text}
          </div>
        ))}

        {/* AI Suggestions */}
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className={`bg-ghost-surface border-l-2 ${priorityColors[suggestion.priority]} rounded-r-md p-3`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[12px] font-semibold text-ghost-accent uppercase tracking-wide">
                {typeLabels[suggestion.type] ?? suggestion.type}
              </span>
              <span className="text-[11px] text-ghost-text-dim ml-auto">
                {new Date(suggestion.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-[13px] font-medium text-ghost-text mb-1">{suggestion.title}</p>
            <p className="text-[13px] text-ghost-text-dim leading-relaxed whitespace-pre-wrap">
              {suggestion.content}
            </p>
            {/* Feedback buttons */}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => handleFeedback(suggestion.id, 'up')}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  feedback[suggestion.id] === 'up'
                    ? 'border-ghost-accent text-ghost-accent bg-ghost-accent/10'
                    : 'border-ghost-border text-ghost-text-dim hover:border-ghost-accent'
                }`}
              >
                Helpful
              </button>
              <button
                onClick={() => handleFeedback(suggestion.id, 'down')}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  feedback[suggestion.id] === 'down'
                    ? 'border-ghost-danger text-ghost-danger bg-ghost-danger/10'
                    : 'border-ghost-border text-ghost-text-dim hover:border-ghost-danger'
                }`}
              >
                Not helpful
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Chat input — fixed at bottom, always visible */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-ghost-border p-2 bg-ghost-surface">
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type context, questions, or 'Speaker 1 is...' "
            disabled={sending}
            className="flex-1 px-3 py-2 bg-ghost-bg border border-ghost-border text-ghost-text text-[13px] rounded outline-none focus:border-ghost-accent placeholder:text-ghost-text-dim/50"
          />
          <button
            onClick={handleSend}
            disabled={sending || !chatInput.trim()}
            className="px-3 py-2 bg-ghost-accent text-ghost-bg text-[12px] font-medium rounded hover:bg-ghost-accent-dim disabled:opacity-40"
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuggestionsPanel;
