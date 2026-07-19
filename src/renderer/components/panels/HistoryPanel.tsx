import React, { useState, useEffect } from 'react';

interface SavedCallMeta {
  id: string;
  name: string;
  date: string;
  durationMs: number;
  callType: string;
  participants: string;
  segmentCount: number;
}

interface SavedCallFull extends SavedCallMeta {
  transcript: { speaker: string; speakerName: string; text: string; timestamp: number }[];
  context: string;
}

const HistoryPanel: React.FC = () => {
  const [calls, setCalls] = useState<SavedCallMeta[]>([]);
  const [selectedCall, setSelectedCall] = useState<SavedCallFull | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.ghostAPI?.listSavedCalls?.().then((data: SavedCallMeta[]) => {
      setCalls(data ?? []);
      setLoading(false);
    });
  }, []);

  const openCall = async (id: string) => {
    const call = await window.ghostAPI?.getSavedCall?.(id);
    if (call) setSelectedCall(call as SavedCallFull);
  };

  if (selectedCall) {
    return (
      <div className="h-full overflow-y-auto p-3">
        <button
          onClick={() => setSelectedCall(null)}
          className="text-xs text-ghost-accent hover:underline mb-3"
        >
          ← Back to history
        </button>
        <h3 className="text-sm font-semibold text-ghost-text mb-1">{selectedCall.name}</h3>
        <div className="flex gap-3 text-[10px] text-ghost-text-dim mb-3">
          <span>{new Date(selectedCall.date).toLocaleDateString()}</span>
          <span>{Math.round(selectedCall.durationMs / 60000)} min</span>
          <span className="capitalize">{selectedCall.callType}</span>
        </div>
        {selectedCall.context && (
          <p className="text-[10px] text-ghost-text-dim italic mb-3 bg-ghost-bg p-2 rounded">
            {selectedCall.context}
          </p>
        )}
        <div className="space-y-2">
          {selectedCall.transcript.map((seg, i) => (
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-ghost-text-dim text-xs">
        Loading...
      </div>
    );
  }

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

  return (
    <div className="h-full overflow-y-auto p-3 space-y-2">
      <h3 className="text-xs font-semibold text-ghost-text-dim uppercase tracking-wider mb-2">
        Past Calls ({calls.length})
      </h3>
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
