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

const typeIcons = {
  question: '❓',
  answer: '💬',
  context: '📖',
  sentiment: '😊',
  action: '✅',
};

const SuggestionsPanel: React.FC<SuggestionsPanelProps> = ({ suggestions }) => {
  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ghost-text-dim">
        <span className="text-3xl mb-2">💡</span>
        <p className="text-sm">AI suggestions will appear here during calls</p>
        <p className="text-xs mt-1">Start capturing to activate coaching</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-2">
      {suggestions.map((suggestion) => (
        <div
          key={suggestion.id}
          className={`bg-ghost-surface border-l-2 ${priorityColors[suggestion.priority]} rounded-r-md p-2.5`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs">{typeIcons[suggestion.type]}</span>
            <span className="text-xs font-semibold text-ghost-text">{suggestion.title}</span>
            <span className="ml-auto text-[9px] text-ghost-text-dim">
              {new Date(suggestion.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-xs text-ghost-text-dim leading-relaxed whitespace-pre-wrap">
            {suggestion.content}
          </p>
          {suggestion.sources && suggestion.sources.length > 0 && (
            <div className="mt-1.5 flex gap-1">
              {suggestion.sources.map((src, i) => (
                <span key={i} className="text-[10px] text-ghost-accent hover:underline cursor-pointer">
                  [Source {i + 1}]
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default SuggestionsPanel;
