import React, { useState } from 'react';
import { CallType, SessionState } from '../types';

interface TitleBarProps {
  isCapturing: boolean;
  sessionState: SessionState;
  callType: CallType;
  onToggleCapture: () => void;
  onCollapse: () => void;
  onCallTypeChange: (type: CallType) => void;
}

const callTypes: { id: CallType; label: string }[] = [
  { id: 'discovery', label: 'Discovery' },
  { id: 'demo', label: 'Demo' },
  { id: 'training', label: 'Training' },
  { id: 'technical', label: 'Technical' },
  { id: 'followup', label: 'Follow-up' },
  { id: 'negotiation', label: 'Negotiation' },
];

const TitleBar: React.FC<TitleBarProps> = ({
  isCapturing,
  sessionState,
  callType,
  onToggleCapture,
  onCollapse,
  onCallTypeChange,
}) => {
  const [opacity, setOpacity] = useState(95);

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setOpacity(value);
    window.ghostAPI?.setOpacity(value / 100);
  };

  return (
    <div className="draggable flex items-center justify-between h-10 px-3 bg-ghost-surface border-b border-ghost-border shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-ghost-accent font-bold text-sm">✦</span>
        <span className="text-xs text-ghost-text-dim font-medium">K.I.R.A.</span>
        {/* Call type selector */}
        <select
          value={callType}
          onChange={(e) => onCallTypeChange(e.target.value as CallType)}
          className="no-drag text-[10px] bg-ghost-bg border border-ghost-border text-ghost-text-dim rounded px-1 py-0.5 cursor-pointer"
        >
          {callTypes.map((ct) => (
            <option key={ct.id} value={ct.id}>{ct.label}</option>
          ))}
        </select>
      </div>

      <div className="no-drag flex items-center gap-2">
        {/* Session state indicator */}
        {sessionState === 'initializing' && (
          <span className="text-[10px] text-ghost-warning animate-pulse">Initializing...</span>
        )}

        {/* Capture toggle */}
        <button
          onClick={onToggleCapture}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            isCapturing
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-ghost-accent/20 text-ghost-accent hover:bg-ghost-accent/30'
          }`}
          title={isCapturing ? 'Stop capture (Ctrl+Shift+R)' : 'Start capture (Ctrl+Shift+R)'}
        >
          {isCapturing ? '⏹ REC' : '⏵ Start'}
        </button>

        {/* Opacity slider */}
        <input
          type="range"
          min="10"
          max="100"
          value={opacity}
          onChange={handleOpacityChange}
          className="w-12 h-1 accent-ghost-accent cursor-pointer"
          title={`Opacity: ${opacity}%`}
        />

        {/* Window controls */}
        <button
          onClick={onCollapse}
          className="text-ghost-text-dim hover:text-ghost-text text-sm px-1"
          title="Minimize (Ctrl+Shift+M)"
        >
          ─
        </button>
        <button
          onClick={() => window.ghostAPI?.toggleMaximize()}
          className="text-ghost-text-dim hover:text-ghost-text text-sm px-1"
          title="Maximize / Restore"
        >
          □
        </button>
        <button
          onClick={() => window.ghostAPI?.closeWindow()}
          className="text-ghost-text-dim hover:text-red-400 text-sm px-1"
          title="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
