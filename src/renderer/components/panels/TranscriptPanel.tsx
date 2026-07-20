import React, { useRef, useEffect, useState, useCallback } from 'react';
import { TranscriptEntry } from '../../types';

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
  onBookmark: (id: string) => void;
  onRenameSpeaker: (source: 'you' | 'other', newName: string) => void;
}

/**
 * Inline editable speaker name component.
 * Click on a speaker name to rename it — applies to all future segments from that source.
 */
const EditableSpeakerName: React.FC<{
  name: string;
  speaker: 'you' | 'other';
  onRename: (source: 'you' | 'other', newName: string) => void;
}> = ({ name, speaker, onRename }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(name);
  }, [name]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) {
      onRename(speaker, trimmed);
    } else {
      setValue(name);
    }
    setEditing(false);
  }, [value, name, speaker, onRename]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setValue(name); setEditing(false); }
        }}
        className="text-xs font-semibold bg-ghost-bg border border-ghost-accent rounded px-1 py-0 w-24 outline-none text-ghost-text"
        style={{ lineHeight: '1.4' }}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`text-xs font-semibold cursor-pointer hover:underline ${
        speaker === 'you' ? 'text-ghost-speaker-you' : 'text-ghost-speaker-other'
      }`}
      title="Click to rename speaker"
    >
      {name}
    </span>
  );
};

const TranscriptPanel: React.FC<TranscriptPanelProps> = ({ entries, onBookmark, onRenameSpeaker }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const handleRenameSpeaker = useCallback((source: 'you' | 'other', newName: string) => {
    onRenameSpeaker(source, newName);
  }, [onRenameSpeaker]);

  const handleCopyAll = useCallback(() => {
    const text = entries
      .filter(e => !e.isPartial)
      .map(e => `[${e.speakerName}]: ${e.text}`)
      .join('\n');
    window.ghostAPI?.copyToClipboard?.(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [entries]);

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
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-ghost-border bg-ghost-surface/50">
        <span className="text-[10px] text-ghost-text-dim">
          {entries.filter(e => !e.isPartial).length} segments
        </span>
        <button
          onClick={handleCopyAll}
          className="text-[10px] px-2 py-0.5 rounded border border-ghost-border text-ghost-text-dim hover:text-ghost-text hover:border-ghost-accent transition-colors"
          title="Copy full transcript"
        >
          {copied ? '✓ Copied' : '📋 Copy All'}
        </button>
      </div>

      {/* Transcript entries — user-select enabled */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 select-text">
        {entries.map((entry) => (
          <div key={entry.id} className="group">
            <div className="flex items-baseline gap-2 mb-0.5">
              <EditableSpeakerName
                name={entry.speakerName}
                speaker={entry.speaker}
                onRename={handleRenameSpeaker}
              />
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
              className={`text-sm leading-relaxed ${
                entry.isPartial
                  ? 'text-ghost-text-dim italic'
                  : 'text-ghost-text'
              }`}
              style={{ opacity: entry.isPartial ? 0.6 : Math.max(0.7, entry.confidence) }}
            >
              {entry.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TranscriptPanel;
