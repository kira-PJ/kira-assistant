import React, { useState } from 'react';
import { CallType, SessionState } from '../types';
import { Theme } from '../hooks/useTheme';

interface TitleBarProps {
  isCapturing: boolean;
  sessionState: SessionState;
  callType: CallType;
  theme: Theme;
  onToggleCapture: () => void;
  onCollapse: () => void;
  onCallTypeChange: (type: CallType) => void;
  onToggleTheme: () => void;
  onOpenSettings?: () => void;
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
  theme,
  onToggleCapture,
  onCollapse,
  onCallTypeChange,
  onToggleTheme,
  onOpenSettings,
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
        <span className="text-ghost-accent font-bold text-[13px]">K.I.R.A.</span>
        <select
          value={callType}
          onChange={(e) => onCallTypeChange(e.target.value as CallType)}
          className="no-drag text-[11px] bg-ghost-bg border border-ghost-border text-ghost-text-dim rounded px-1.5 py-0.5 cursor-pointer"
        >
          {callTypes.map((ct) => (
            <option key={ct.id} value={ct.id}>{ct.label}</option>
          ))}
        </select>
      </div>

      <div className="no-drag flex items-center gap-1.5">
        {sessionState === 'initializing' && (
          <span className="text-[11px] text-ghost-warning animate-pulse">Initializing...</span>
        )}

        {/* Capture toggle */}
        <button
          onClick={onToggleCapture}
          className={`px-2.5 py-1 rounded text-[12px] font-semibold transition-colors ${
            isCapturing
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-ghost-accent/15 text-ghost-accent hover:bg-ghost-accent/25'
          }`}
          title={isCapturing ? 'Stop (Ctrl+Shift+R)' : 'Start (Ctrl+Shift+R)'}
        >
          {isCapturing ? 'Stop' : 'Start'}
        </button>

        {/* Opacity */}
        <input
          type="range"
          min="10"
          max="100"
          value={opacity}
          onChange={handleOpacityChange}
          className="w-10 h-1 accent-ghost-accent cursor-pointer"
          title={`Opacity: ${opacity}%`}
        />

        {/* Theme */}
        <button
          onClick={onToggleTheme}
          className="text-ghost-text-dim hover:text-ghost-text text-[11px] px-1.5 py-0.5 rounded hover:bg-ghost-border/30"
          title={`${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="text-ghost-text-dim hover:text-ghost-text text-[11px] px-1.5 py-0.5 rounded hover:bg-ghost-border/30"
          title="Settings"
        >
          Settings
        </button>

        {/* Window controls */}
        <div className="flex items-center ml-1 border-l border-ghost-border pl-1.5">
          <button onClick={onCollapse} className="text-ghost-text-dim hover:text-ghost-text w-5 h-5 flex items-center justify-center rounded hover:bg-ghost-border/30 text-[11px]" title="Minimize">
            ─
          </button>
          <button onClick={() => window.ghostAPI?.toggleMaximize()} className="text-ghost-text-dim hover:text-ghost-text w-5 h-5 flex items-center justify-center rounded hover:bg-ghost-border/30 text-[11px]" title="Maximize">
            □
          </button>
          <button onClick={() => window.ghostAPI?.closeWindow()} className="text-ghost-text-dim hover:text-red-400 w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/10 text-[11px]" title="Close">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};

export default TitleBar;
