import React, { useState, useEffect } from 'react';
import { CallType } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [transcriptionMode, setTranscriptionMode] = useState<'local' | 'cloud'>('local');
  const [callType, setCallType] = useState<CallType>('discovery');
  const [opacity, setOpacity] = useState(95);

  useEffect(() => {
    if (!isOpen) return;
    window.ghostAPI?.getConfig('transcriptionMode').then(v => setTranscriptionMode((v as any) ?? 'local'));
    window.ghostAPI?.getConfig('callType').then(v => setCallType((v as any) ?? 'discovery'));
    window.ghostAPI?.getConfig('windowOpacity').then(v => setOpacity(((v as number) ?? 0.95) * 100));
  }, [isOpen]);

  const save = async () => {
    await window.ghostAPI?.setConfig('transcriptionMode', transcriptionMode);
    await window.ghostAPI?.setConfig('callType', callType);
    await window.ghostAPI?.setOpacity(opacity / 100);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-ghost-surface border border-ghost-border rounded-lg p-4 w-[90%] max-w-sm">
        <h2 className="text-sm font-semibold text-ghost-text mb-4">Settings</h2>

        {/* Transcription mode toggle */}
        <label className="text-xs text-ghost-text-dim mb-1 block">Transcription Mode</label>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTranscriptionMode('local')}
            className={`flex-1 py-1.5 text-xs rounded border ${transcriptionMode === 'local' ? 'border-ghost-accent text-ghost-accent bg-ghost-accent/10' : 'border-ghost-border text-ghost-text-dim'}`}
          >
            🖥️ Local (Whisper)
          </button>
          <button
            onClick={() => setTranscriptionMode('cloud')}
            className={`flex-1 py-1.5 text-xs rounded border ${transcriptionMode === 'cloud' ? 'border-ghost-accent text-ghost-accent bg-ghost-accent/10' : 'border-ghost-border text-ghost-text-dim'}`}
          >
            ☁️ Cloud (AWS)
          </button>
        </div>

        {/* Opacity */}
        <label className="text-xs text-ghost-text-dim mb-1 block">Opacity: {opacity}%</label>
        <input
          type="range" min="10" max="100" value={opacity}
          onChange={e => setOpacity(Number(e.target.value))}
          className="w-full h-1 accent-ghost-accent mb-4"
        />

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-1.5 text-xs text-ghost-text-dim border border-ghost-border rounded hover:text-ghost-text">Cancel</button>
          <button onClick={save} className="flex-1 py-1.5 text-xs bg-ghost-accent text-ghost-bg rounded font-medium hover:bg-ghost-accent-dim">Save</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
