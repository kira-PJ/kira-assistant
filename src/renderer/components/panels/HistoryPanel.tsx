import React, { useState, useEffect, useCallback } from 'react';

interface SavedCallMeta {
  id: string;
  name: string;
  date: string;
  durationMs: number;
  callType: string;
  participants: string;
  segmentCount: number;
}

interface TranscriptSeg {
  speaker: string;
  speakerName: string;
  text: string;
  timestamp: number;
  isPartial?: boolean;
}

interface SavedCallFull extends SavedCallMeta {
  transcript: TranscriptSeg[];
  context: string;
}

const HistoryPanel: React.FC = () => {
  const [calls, setCalls] = useState<SavedCallMeta[]>([]);
  const [selectedCall, setSelectedCall] = useState<SavedCallFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadCalls();
  }, []);

  const loadCalls = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await window.ghostAPI?.listSavedCalls?.();
      setCalls(data ?? []);
    } catch (err: any) {
      console.error('[HistoryPanel] Failed to load calls:', err);
      setError(err?.message ?? 'Failed to load call history');
    } finally {
      setLoading(false);
    }
  };

  const openCall = async (id: string) => {
    try {
      const call = await window.ghostAPI?.getSavedCall?.(id);
      if (call) setSelectedCall(call as SavedCallFull);
    } catch (err: any) {
      console.error('[HistoryPanel] Failed to load call:', err);
    }
  };

  const handleCopyTranscript = useCallback(() => {
    if (!selectedCall) return;
    // Only copy final (non-partial) segments
    const finals = selectedCall.transcript.filter(s => !s.isPartial);
    const text = finals
      .map(s => `[${s.speakerName}]: ${s.text}`)
      .join('\n');
    window.ghostAPI?.copyToClipboard?.(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [selectedCall]);

  // === Call Detail View ===
  if (selectedCall) {
    // Filter out partial segments for display
    const finals = selectedCall.transcript.filter(s => !s.isPartial);

    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="px-3 pt-3 pb-2 border-b border-ghost-border">
          <button
            onClick={() => setSelectedCall(null)}
            className="text-xs text-ghost-accent hover:underline mb-2"
          >
            ← Back to history
          </button>
          <h3 className="text-sm font-semibold text-ghost-text mb-1">{selectedCall.name}</h3>
          <div className="flex gap-3 text-[10px] text-ghost-text-dim">
            <span>{new Date(selectedCall.date).toLocaleDateString()}</span>
            <span>{Math.round(selectedCall.durationMs / 60000)} min</span>
            <span className="capitalize">{selectedCall.callType}</span>
            <span>{finals.length} segments</span>
          </div>
          {selectedCall.context && (
            <p className="text-[10px] text-ghost-text-dim italic mt-2 bg-ghost-bg p-2 rounded">
              {selectedCall.context}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleCopyTranscript}
              className="text-[10px] px-2 py-0.5 rounded border border-ghost-border text-ghost-text-dim hover:text-ghost-text hover:border-ghost-accent transition-colors"
            >
              {copied ? '✓ Copied' : '📋 Copy Transcript'}
            </button>
          </div>
        </div>

        {/* Transcript — selectable */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 select-text">
          {finals.map((seg, i) => (
            <div key={i}>
              <span className={`text-[10px] font-semibold ${seg.speaker === 'you' ? 'text-ghost-speaker-you' : 'text-ghost-speaker-other'}`}>
                {seg.speakerName}
              </span>
              <p className="text-xs text-ghost-text leading-relaxed">{seg.text}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // === Loading State ===
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-ghost-text-dim text-xs">
        <span className="animate-pulse">Loading...</span>
      </div>
    );
  }

  // === Error State ===
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ghost-text-dim">
        <span className="text-3xl mb-2">⚠️</span>
        <p className="text-sm text-ghost-danger">Failed to load history</p>
        <p className="text-[10px] mt-1">{error}</p>
        <button
          onClick={loadCalls}
          className="mt-3 text-xs px-3 py-1 rounded border border-ghost-border hover:border-ghost-accent text-ghost-text-dim hover:text-ghost-text"
        >
          Retry
        </button>
      </div>
    );
  }

  // === Empty State ===
  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ghost-text-dim">
        <span className="text-3xl mb-2">📂</span>
        <p className="text-sm">No saved calls yet</p>
        <p className="text-xs mt-1">Calls are saved when you stop capture</p>
        <p className="text-[10px] mt-2 text-ghost-text-dim/60">
          Stored at: ~/.config/kira-assistant/calls/
        </p>
      </div>
    );
  }

  // === Call List ===
  return (
    <div className="h-full overflow-y-auto p-3 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-ghost-text-dim uppercase tracking-wider">
          Past Calls ({calls.length})
        </h3>
        <button
          onClick={loadCalls}
          className="text-[10px] text-ghost-text-dim hover:text-ghost-accent"
          title="Refresh"
        >
          🔄
        </button>
      </div>
      {calls.map((call) => (
        <button
          key={call.id}
          onClick={() => openCall(call.id)}
          className="w-full text-left p-2.5 bg-ghost-surface rounded-md border border-ghost-border hover:border-ghost-accent/50 transition-colors"
        >
          <p className="text-xs font-medium text-ghost-text truncate">{call.name}</p>
          <div className="flex gap-3 mt-1 text-[10px] text-ghost-text-dim">
            <span>{new Date(call.date).toLocaleDateString()}</span>
            <span>{Math.round(call.durationMs / 60000)} min</span>
            <span className="capitalize">{call.callType}</span>
            <span>{call.segmentCount} segments</span>
          </div>
        </button>
      ))}
    </div>
  );
};

export default HistoryPanel;
