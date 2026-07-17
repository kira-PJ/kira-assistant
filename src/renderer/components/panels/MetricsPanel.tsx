import React from 'react';
import { SentimentData, TalkRatio, TechMention } from '../../types';

interface MetricsPanelProps {
  talkRatio: TalkRatio;
  sentiment: SentimentData | null;
  techMentions: TechMention[];
  micActive: boolean;
  systemActive: boolean;
}

const sentimentEmojis: Record<string, string> = {
  positive: '😊',
  neutral: '😐',
  confused: '🤔',
  hesitant: '😬',
  frustrated: '😤',
};

const MetricsPanel: React.FC<MetricsPanelProps> = ({
  talkRatio,
  sentiment,
  techMentions,
  micActive,
  systemActive,
}) => {
  return (
    <div className="h-full overflow-y-auto p-3 space-y-4">
      {/* VAD Indicators */}
      <div className="flex gap-3">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${micActive ? 'bg-ghost-speaker-you/20 text-ghost-speaker-you' : 'bg-ghost-surface text-ghost-text-dim'}`}>
          <span className={`w-2 h-2 rounded-full ${micActive ? 'bg-ghost-speaker-you animate-pulse' : 'bg-ghost-text-dim'}`} />
          Mic
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${systemActive ? 'bg-ghost-speaker-other/20 text-ghost-speaker-other' : 'bg-ghost-surface text-ghost-text-dim'}`}>
          <span className={`w-2 h-2 rounded-full ${systemActive ? 'bg-ghost-speaker-other animate-pulse' : 'bg-ghost-text-dim'}`} />
          System
        </div>
      </div>

      {/* Talk Ratio */}
      <div className="bg-ghost-surface rounded-md p-3 border border-ghost-border">
        <h3 className="text-xs font-semibold text-ghost-text mb-2">Talk Ratio</h3>
        <div className="flex h-4 rounded-full overflow-hidden bg-ghost-bg">
          <div
            className="bg-ghost-speaker-you transition-all duration-500"
            style={{ width: `${talkRatio.you}%` }}
          />
          <div
            className="bg-ghost-speaker-other transition-all duration-500"
            style={{ width: `${talkRatio.other}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[10px]">
          <span className="text-ghost-speaker-you">You: {talkRatio.you}%</span>
          <span className="text-ghost-speaker-other">Customer: {talkRatio.other}%</span>
        </div>
      </div>

      {/* Sentiment */}
      <div className="bg-ghost-surface rounded-md p-3 border border-ghost-border">
        <h3 className="text-xs font-semibold text-ghost-text mb-2">Customer Sentiment</h3>
        {sentiment ? (
          <div className="flex items-center gap-2">
            <span className="text-2xl">{sentimentEmojis[sentiment.sentiment] ?? '😐'}</span>
            <div>
              <p className="text-sm font-medium text-ghost-text capitalize">{sentiment.sentiment}</p>
              <p className="text-[10px] text-ghost-text-dim">
                {sentiment.reason} ({Math.round(sentiment.confidence * 100)}%)
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ghost-text-dim">Waiting for conversation data...</p>
        )}
      </div>

      {/* Keywords */}
      {techMentions.length > 0 && (
        <div className="bg-ghost-surface rounded-md p-3 border border-ghost-border">
          <h3 className="text-xs font-semibold text-ghost-text mb-2">Tech Detected</h3>
          <div className="flex flex-wrap gap-1">
            {[...new Set(techMentions.map(m => m.term))].slice(0, 10).map((term) => (
              <span
                key={term}
                className="px-2 py-0.5 bg-ghost-accent/10 text-ghost-accent text-[10px] rounded-full"
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MetricsPanel;
