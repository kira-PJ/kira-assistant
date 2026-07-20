import React from 'react';
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

const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({ suggestions }) => {
  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ghost-text-dim">
        <p className="text-[14px] font-medium">AI coaching suggestions</p>
        <p className="text-[13px] mt-2">Suggestions will appear here during active calls</p>
        <p className="text-[13px] mt-1 text-ghost-text-dim/60">Based on what's being discussed — questions to ask, answers to give, context lookups</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-2">
      {suggestions.map((suggestion) => (
        <div
          key={suggestion.id}
          className={`bg-ghost-surface border-l-2 ${priorityColors[suggestion.priority]} rounded-r-md p-3`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[13px] font-semibold text-ghost-accent uppercase tracking-wide">
              {typeLabels[suggestion.type] ?? suggestion.type}
            </span>
            <span className="text-[12px] text-ghost-text-dim ml-auto">
              {new Date(suggestion.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-[13px] font-medium text-ghost-text mb-1">{suggestion.title}</p>
          <p className="text-[13px] text-ghost-text-dim leading-relaxed whitespace-pre-wrap">
            {suggestion.content}
          </p>
        </div>
      ))}
    </div>
  );
};

export default SuggestionsPanel;
