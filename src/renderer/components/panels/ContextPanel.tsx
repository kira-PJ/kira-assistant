import React from 'react';
import { TechMention } from '../../types';

interface ContextPanelProps {
  techMentions: TechMention[];
}

const ContextPanel: React.FC<ContextPanelProps> = ({ techMentions }) => {
  if (techMentions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ghost-text-dim">
        <span className="text-3xl mb-2">🔍</span>
        <p className="text-sm">Technology context and lookups</p>
        <p className="text-xs mt-1">Automatically populated when tech is mentioned</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {techMentions.map((mention, idx) => (
        <div key={`${mention.term}-${idx}`} className="bg-ghost-surface rounded-md p-3 border border-ghost-border">
          <h3 className="text-xs font-semibold text-ghost-accent mb-1">{mention.term}</h3>
          <p className="text-xs text-ghost-text-dim leading-relaxed">{mention.context}</p>
          <span className="text-[9px] text-ghost-text-dim mt-1 block">
            {new Date(mention.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      ))}
    </div>
  );
};

export default ContextPanel;
