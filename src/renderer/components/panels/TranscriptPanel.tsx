import React, { useRef, useEffect } from 'react';
import { TranscriptEntry } from '../../types';

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
  onBookmark: (id: string) => void;
}

const TranscriptPanel: React.FC<TranscriptPanelProps> = ({ entries, onBookmark }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ghost-text-dim">
        <span className="text-3xl mb-2">🎙️</span>
        <p className="text-sm">Start a capture to see live transcript</p>
        <p className="text-xs mt-1">Press Ctrl+Shift+R to begin</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto p-3 space-y-3">
      {entries.map((entry) => (
        <div key={entry.id} className="group">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span
              className={`text-xs font-semibold ${
                entry.speaker === 'you' ? 'text-ghost-speaker-you' : 'text-ghost-speaker-other'
              }`}
            >
              {entry.speakerName}
            </span>
            <span className="text-[10px] text-ghost-text-dim">{formatTime(entry.timestamp)}</span>
            <button
              onClick={() => onBookmark(entry.id)}
              className={`text-[10px] transition-opacity ml-auto ${
                entry.isBookmarked
                  ? 'opacity-100 text-ghost-warning'
                  : 'opacity-0 group-hover:opacity-100 text-ghost-text-dim hover:text-ghost-warning'
              }`}
              title="Bookmark"
            >
              🔖
            </button>
          </div>
          <p
            className="text-sm text-ghost-text leading-relaxed"
            style={{ opacity: Math.max(0.6, entry.confidence) }}
          >
            {entry.text}
          </p>
        </div>
      ))}
    </div>
  );
};

export default TranscriptPanel;
