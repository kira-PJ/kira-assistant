import React from 'react';
import { TechMention } from '../../types';

interface ContextPanelProps {
  techMentions: TechMention[];
}

const ContextPanel: React.FC<ContextPanelProps> = ({ techMentions }) => {
  if (techMentions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ghost-text-dim">
        <p className="text-[14px] font-medium">Technology Context</p>
        <p className="text-[13px] mt-2">Auto-populated when tech terms are mentioned during a call</p>
        <p className="text-[13px] mt-1 text-ghost-text-dim/60">Detects AWS services, databases, languages, frameworks, and cloud concepts</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {techMentions.map((mention, idx) => (
        <div key={`${mention.term}-${idx}`} className="bg-ghost-surface rounded-lg p-3 border border-ghost-border">
          <h3 className="text-[13px] font-semibold text-ghost-accent mb-1">{mention.term}</h3>
          <p className="text-[13px] text-ghost-text-dim leading-relaxed">{mention.context}</p>
          <span className="text-[12px] text-ghost-text-dim/60 mt-1.5 block">
            {new Date(mention.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      ))}
    </div>
  );
};

export default ContextPanel;
