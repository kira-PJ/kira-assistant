import React, { useState } from 'react';

interface SetupWizardProps {
  onComplete: () => void;
}

type Step = 'welcome' | 'aws' | 'transcription' | 'hotkeys' | 'done';

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState<Step>('welcome');
  const [awsRegion, setAwsRegion] = useState('us-east-1');
  const [transcriptionMode, setTranscriptionMode] = useState<'local' | 'cloud'>('local');
  const [tavilyKey, setTavilyKey] = useState('');

  const handleFinish = async () => {
    await window.ghostAPI?.completeSetup({
      awsRegion,
      transcriptionMode,
      tavilyApiKey: tavilyKey || undefined,
    });
    onComplete();
  };

  return (
    <div className="flex flex-col h-screen bg-ghost-bg p-6">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-ghost-accent font-bold text-lg">✦</span>
        <span className="text-ghost-text font-semibold">K.I.R.A. Setup</span>
      </div>

      {step === 'welcome' && (
        <div className="flex-1 flex flex-col justify-center">
          <h2 className="text-lg font-semibold text-ghost-text mb-2">
            Welcome to K.I.R.A.
          </h2>
          <p className="text-sm text-ghost-text-dim mb-1">
            Knowledge, Insights & Response Assistant
          </p>
          <p className="text-xs text-ghost-text-dim mb-6 leading-relaxed">
            Your invisible AI call companion. Real-time transcription, coaching suggestions,
            and tech context — all hidden from screen share.
          </p>
          <button
            onClick={() => setStep('aws')}
            className="self-start px-4 py-2 bg-ghost-accent text-ghost-bg text-sm font-medium rounded hover:bg-ghost-accent-dim transition-colors"
          >
            Get Started →
          </button>
        </div>
      )}

      {step === 'aws' && (
        <div className="flex-1 flex flex-col">
          <h2 className="text-sm font-semibold text-ghost-text mb-4">AWS Configuration</h2>
          <p className="text-xs text-ghost-text-dim mb-4">
            K.I.R.A. uses AWS Bedrock (Claude) for AI coaching. You can skip this for local-only mode.
          </p>

          <label className="text-xs text-ghost-text-dim mb-1">AWS Region</label>
          <select
            value={awsRegion}
            onChange={(e) => setAwsRegion(e.target.value)}
            className="mb-4 px-2 py-1.5 bg-ghost-surface border border-ghost-border text-ghost-text text-xs rounded"
          >
            <option value="us-east-1">US East (N. Virginia)</option>
            <option value="us-west-2">US West (Oregon)</option>
            <option value="eu-west-1">EU (Ireland)</option>
            <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
          </select>

          <p className="text-[10px] text-ghost-text-dim mb-6">
            AWS credentials should be configured via environment variables or ~/.aws/credentials.
            K.I.R.A. uses your default AWS profile.
          </p>

          <div className="flex gap-2 mt-auto">
            <button onClick={() => setStep('welcome')} className="px-3 py-1.5 text-xs text-ghost-text-dim hover:text-ghost-text">
              ← Back
            </button>
            <button onClick={() => setStep('transcription')} className="px-4 py-1.5 bg-ghost-accent text-ghost-bg text-xs font-medium rounded hover:bg-ghost-accent-dim">
              Next →
            </button>
          </div>
        </div>
      )}

      {step === 'transcription' && (
        <div className="flex-1 flex flex-col">
          <h2 className="text-sm font-semibold text-ghost-text mb-4">Transcription</h2>

          <div className="space-y-3 mb-6">
            <label className="flex items-start gap-3 p-3 bg-ghost-surface border border-ghost-border rounded cursor-pointer hover:border-ghost-accent/50">
              <input
                type="radio"
                name="tx"
                checked={transcriptionMode === 'local'}
                onChange={() => setTranscriptionMode('local')}
                className="mt-0.5 accent-ghost-accent"
              />
              <div>
                <p className="text-xs font-medium text-ghost-text">Local (whisper.cpp)</p>
                <p className="text-[10px] text-ghost-text-dim">Free, offline, good accuracy. Requires whisper-cli binary.</p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 bg-ghost-surface border border-ghost-border rounded cursor-pointer hover:border-ghost-accent/50">
              <input
                type="radio"
                name="tx"
                checked={transcriptionMode === 'cloud'}
                onChange={() => setTranscriptionMode('cloud')}
                className="mt-0.5 accent-ghost-accent"
              />
              <div>
                <p className="text-xs font-medium text-ghost-text">Cloud (AWS Transcribe)</p>
                <p className="text-[10px] text-ghost-text-dim">Higher accuracy, speaker ID, ~$0.024/min. Requires AWS credentials.</p>
              </div>
            </label>
          </div>

          <label className="text-xs text-ghost-text-dim mb-1">Tavily API Key (optional — for web search)</label>
          <input
            type="password"
            value={tavilyKey}
            onChange={(e) => setTavilyKey(e.target.value)}
            placeholder="tvly-..."
            className="mb-4 px-2 py-1.5 bg-ghost-surface border border-ghost-border text-ghost-text text-xs rounded placeholder:text-ghost-text-dim/50"
          />

          <div className="flex gap-2 mt-auto">
            <button onClick={() => setStep('aws')} className="px-3 py-1.5 text-xs text-ghost-text-dim hover:text-ghost-text">
              ← Back
            </button>
            <button onClick={() => setStep('hotkeys')} className="px-4 py-1.5 bg-ghost-accent text-ghost-bg text-xs font-medium rounded hover:bg-ghost-accent-dim">
              Next →
            </button>
          </div>
        </div>
      )}

      {step === 'hotkeys' && (
        <div className="flex-1 flex flex-col">
          <h2 className="text-sm font-semibold text-ghost-text mb-4">Hotkeys</h2>
          <p className="text-xs text-ghost-text-dim mb-4">
            These are the default keyboard shortcuts. You can change them later in settings.
          </p>

          <div className="space-y-2 mb-6">
            {[
              { label: 'Toggle visibility', key: 'Ctrl+Shift+G' },
              { label: 'Collapse/Expand', key: 'Ctrl+Shift+M' },
              { label: 'Start/Stop capture', key: 'Ctrl+Shift+R' },
              { label: 'Quick ask AI', key: 'Ctrl+Shift+A' },
              { label: 'Bookmark moment', key: 'Ctrl+Shift+B' },
            ].map(({ label, key }) => (
              <div key={label} className="flex items-center justify-between px-3 py-2 bg-ghost-surface rounded border border-ghost-border">
                <span className="text-xs text-ghost-text">{label}</span>
                <kbd className="text-[10px] px-1.5 py-0.5 bg-ghost-bg rounded border border-ghost-border text-ghost-accent font-mono">
                  {key}
                </kbd>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-auto">
            <button onClick={() => setStep('transcription')} className="px-3 py-1.5 text-xs text-ghost-text-dim hover:text-ghost-text">
              ← Back
            </button>
            <button onClick={handleFinish} className="px-4 py-1.5 bg-ghost-accent text-ghost-bg text-xs font-medium rounded hover:bg-ghost-accent-dim">
              Finish Setup ✓
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SetupWizard;
