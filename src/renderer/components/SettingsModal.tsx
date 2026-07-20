import React, { useState, useEffect } from 'react';
import { CallType } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type LLMProvider = 'bedrock' | 'groq' | 'gemini';

const providers: { id: LLMProvider; label: string; desc: string; needsKey: boolean }[] = [
  { id: 'groq', label: 'Groq (Free)', desc: 'Llama 3.3 70B — fast, free tier', needsKey: true },
  { id: 'gemini', label: 'Gemini (Free)', desc: 'Gemini 2.0 Flash — high quality, free tier', needsKey: true },
  { id: 'bedrock', label: 'AWS Bedrock', desc: 'Claude Haiku — best quality, costs ~$0.25/call', needsKey: false },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [transcriptionMode, setTranscriptionMode] = useState<'local' | 'cloud'>('local');
  const [callType, setCallType] = useState<CallType>('discovery');
  const [opacity, setOpacity] = useState(95);
  const [llmProvider, setLlmProvider] = useState<LLMProvider>('bedrock');
  const [apiKey, setApiKey] = useState('');
  const [hasGroqKey, setHasGroqKey] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    window.ghostAPI?.getConfig('transcriptionMode').then(v => setTranscriptionMode((v as any) ?? 'local'));
    window.ghostAPI?.getConfig('callType').then(v => setCallType((v as any) ?? 'discovery'));
    window.ghostAPI?.getConfig('windowOpacity').then(v => setOpacity(((v as number) ?? 0.95) * 100));
    window.ghostAPI?.getLLMProvider?.().then(state => {
      if (state) {
        setLlmProvider(state.provider as LLMProvider);
        setHasGroqKey(state.hasGroqKey);
        setHasGeminiKey(state.hasGeminiKey);
      }
    });
    setApiKey('');
    setSaved(false);
  }, [isOpen]);

  const selectedProvider = providers.find(p => p.id === llmProvider);
  const needsNewKey = selectedProvider?.needsKey && (
    (llmProvider === 'groq' && !hasGroqKey) ||
    (llmProvider === 'gemini' && !hasGeminiKey)
  );

  const save = async () => {
    await window.ghostAPI?.setConfig('transcriptionMode', transcriptionMode);
    await window.ghostAPI?.setConfig('callType', callType);
    await window.ghostAPI?.setOpacity(opacity / 100);

    // Switch LLM provider
    const keyToSend = apiKey.trim() || undefined;
    await window.ghostAPI?.switchLLMProvider?.(llmProvider, keyToSend);

    setSaved(true);
    setTimeout(() => onClose(), 600);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-ghost-surface border border-ghost-border rounded-lg p-4 w-[90%] max-w-sm max-h-[90vh] overflow-y-auto">
        <h2 className="text-sm font-semibold text-ghost-text mb-4">Settings</h2>

        {/* === AI Coach Provider === */}
        <label className="text-xs text-ghost-text-dim mb-1 block font-medium">AI Coach Provider</label>
        <div className="space-y-1.5 mb-3">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => { setLlmProvider(p.id); setApiKey(''); }}
              className={`w-full text-left p-2 rounded border transition-colors ${
                llmProvider === p.id
                  ? 'border-ghost-accent bg-ghost-accent/10'
                  : 'border-ghost-border hover:border-ghost-accent/50'
              }`}
            >
              <span className="text-[11px] font-medium text-ghost-text block">{p.label}</span>
              <span className="text-[9px] text-ghost-text-dim">{p.desc}</span>
              {/* Show checkmark if key already configured */}
              {p.id === 'groq' && hasGroqKey && (
                <span className="text-[9px] text-ghost-accent ml-2">✓ key set</span>
              )}
              {p.id === 'gemini' && hasGeminiKey && (
                <span className="text-[9px] text-ghost-accent ml-2">✓ key set</span>
              )}
            </button>
          ))}
        </div>

        {/* API key input if needed */}
        {selectedProvider?.needsKey && (
          <div className="mb-4">
            <label className="text-[10px] text-ghost-text-dim block mb-1">
              {llmProvider === 'groq' ? 'Groq API Key' : 'Google AI API Key'}
              {(llmProvider === 'groq' && hasGroqKey) || (llmProvider === 'gemini' && hasGeminiKey)
                ? ' (already set — leave blank to keep)'
                : ''
              }
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                llmProvider === 'groq'
                  ? 'gsk_... (from console.groq.com)'
                  : 'AIza... (from aistudio.google.com)'
              }
              className="w-full px-2 py-1.5 bg-ghost-bg border border-ghost-border text-ghost-text text-[10px] rounded placeholder:text-ghost-text-dim/50 outline-none focus:border-ghost-accent"
            />
            <p className="text-[9px] text-ghost-text-dim/70 mt-1">
              {llmProvider === 'groq'
                ? 'Get a free key at console.groq.com → API Keys'
                : 'Get a free key at aistudio.google.com → Get API key'
              }
            </p>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-ghost-border my-3" />

        {/* Transcription mode toggle */}
        <label className="text-xs text-ghost-text-dim mb-1 block">Transcription Mode</label>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTranscriptionMode('local')}
            className={`flex-1 py-1.5 text-xs rounded border ${transcriptionMode === 'local' ? 'border-ghost-accent text-ghost-accent bg-ghost-accent/10' : 'border-ghost-border text-ghost-text-dim'}`}
          >
            Local (Whisper)
          </button>
          <button
            onClick={() => setTranscriptionMode('cloud')}
            className={`flex-1 py-1.5 text-xs rounded border ${transcriptionMode === 'cloud' ? 'border-ghost-accent text-ghost-accent bg-ghost-accent/10' : 'border-ghost-border text-ghost-text-dim'}`}
          >
            Cloud (AWS Transcribe)
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
          <button onClick={save} className="flex-1 py-1.5 text-xs bg-ghost-accent text-ghost-bg rounded font-medium hover:bg-ghost-accent-dim">
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
