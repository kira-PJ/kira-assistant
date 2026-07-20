import React, { useState, useEffect } from 'react';
import { SentimentData, TalkRatio, TechMention } from '../../types';

interface MetricsPanelProps {
  talkRatio: TalkRatio;
  sentiment: SentimentData | null;
  techMentions: TechMention[];
  micActive: boolean;
  systemActive: boolean;
}

interface AudioDevice { name: string; description: string; isMonitor: boolean; }

const sentimentLabels: Record<string, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  confused: 'Confused',
  hesitant: 'Hesitant',
  frustrated: 'Frustrated',
};

const sentimentColors: Record<string, string> = {
  positive: 'text-ghost-accent',
  neutral: 'text-ghost-text-dim',
  confused: 'text-ghost-warning',
  hesitant: 'text-ghost-warning',
  frustrated: 'text-ghost-danger',
};

const MetricsPanel: React.FC<MetricsPanelProps> = ({
  talkRatio,
  sentiment,
  techMentions,
  micActive,
  systemActive,
}) => {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [showDevices, setShowDevices] = useState(false);

  useEffect(() => {
    window.ghostAPI?.listAudioDevices?.().then((d: any) => setDevices(d ?? []));
  }, [showDevices]);

  const switchDevice = (type: 'mic' | 'system', name: string) => {
    (window.ghostAPI as any)?.switchAudioDevice?.(type, name);
  };

  const micDevices = devices.filter(d => !d.isMonitor);
  const systemDevices = devices.filter(d => d.isMonitor);

  return (
    <div className="h-full overflow-y-auto p-3 space-y-4">
      {/* VAD Indicators + Audio Switch */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] font-medium ${micActive ? 'bg-ghost-speaker-you/15 text-ghost-speaker-you' : 'bg-ghost-surface text-ghost-text-dim'}`}>
            <span className={`w-2 h-2 rounded-full ${micActive ? 'bg-ghost-speaker-you animate-pulse' : 'bg-ghost-text-dim/40'}`} />
            Mic
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[12px] font-medium ${systemActive ? 'bg-ghost-speaker-other/15 text-ghost-speaker-other' : 'bg-ghost-surface text-ghost-text-dim'}`}>
            <span className={`w-2 h-2 rounded-full ${systemActive ? 'bg-ghost-speaker-other animate-pulse' : 'bg-ghost-text-dim/40'}`} />
            System
          </div>
        </div>
        <button
          onClick={() => setShowDevices(!showDevices)}
          className="text-[11px] px-2 py-1 rounded border border-ghost-border text-ghost-text-dim hover:text-ghost-text hover:border-ghost-accent"
        >
          {showDevices ? 'Hide' : 'Switch Audio'}
        </button>
      </div>

      {/* Audio device switcher (mid-call) */}
      {showDevices && devices.length > 0 && (
        <div className="bg-ghost-surface rounded-lg p-3 border border-ghost-border space-y-2">
          <div>
            <span className="text-[11px] text-ghost-text-dim block mb-1">Microphone</span>
            <select
              onChange={(e) => switchDevice('mic', e.target.value)}
              className="w-full px-2 py-1.5 bg-ghost-bg border border-ghost-border text-ghost-text text-[12px] rounded"
            >
              <option value="">System Default</option>
              {micDevices.map((d) => (
                <option key={d.name} value={d.name}>{d.description || d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-[11px] text-ghost-text-dim block mb-1">Speaker Output (others)</span>
            <select
              onChange={(e) => switchDevice('system', e.target.value)}
              className="w-full px-2 py-1.5 bg-ghost-bg border border-ghost-border text-ghost-text text-[12px] rounded"
            >
              <option value="">System Default Monitor</option>
              {systemDevices.map((d) => (
                <option key={d.name} value={d.name}>{d.description || d.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Talk Ratio */}
      <div className="bg-ghost-surface rounded-lg p-4 border border-ghost-border">
        <h3 className="text-[12px] font-semibold text-ghost-text-dim uppercase tracking-wider mb-3">Talk Ratio</h3>
        <div className="flex h-3 rounded-full overflow-hidden bg-ghost-bg">
          <div
            className="bg-ghost-speaker-you transition-all duration-500 rounded-l-full"
            style={{ width: `${talkRatio.you}%` }}
          />
          <div
            className="bg-ghost-speaker-other transition-all duration-500 rounded-r-full"
            style={{ width: `${talkRatio.other}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[12px]">
          <span className="text-ghost-speaker-you font-medium">You: {talkRatio.you}%</span>
          <span className="text-ghost-speaker-other font-medium">Other: {talkRatio.other}%</span>
        </div>
        {talkRatio.yourWordCount !== undefined && (
          <div className="flex justify-between mt-1 text-[12px] text-ghost-text-dim">
            <span>{talkRatio.yourWordCount} words</span>
            <span>{talkRatio.otherWordCount} words</span>
          </div>
        )}
      </div>

      {/* Sentiment */}
      <div className="bg-ghost-surface rounded-lg p-4 border border-ghost-border">
        <h3 className="text-[12px] font-semibold text-ghost-text-dim uppercase tracking-wider mb-3">Sentiment</h3>
        {sentiment ? (
          <div>
            <p className={`text-[16px] font-semibold ${sentimentColors[sentiment.sentiment] ?? 'text-ghost-text'}`}>
              {sentimentLabels[sentiment.sentiment] ?? sentiment.sentiment}
            </p>
            <p className="text-[12px] text-ghost-text-dim mt-1">
              {sentiment.reason}
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-ghost-bg overflow-hidden">
              <div
                className="h-full bg-ghost-accent rounded-full transition-all"
                style={{ width: `${Math.round(sentiment.confidence * 100)}%` }}
              />
            </div>
            <span className="text-[12px] text-ghost-text-dim">Confidence: {Math.round(sentiment.confidence * 100)}%</span>
          </div>
        ) : (
          <p className="text-[13px] text-ghost-text-dim">Waiting for conversation data...</p>
        )}
      </div>

      {/* Tech Keywords */}
      {techMentions.length > 0 && (
        <div className="bg-ghost-surface rounded-lg p-4 border border-ghost-border">
          <h3 className="text-[13px] font-semibold text-ghost-text-dim uppercase tracking-wider mb-3">Technologies Mentioned</h3>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set(techMentions.map(m => m.term))].slice(0, 15).map((term) => (
              <span
                key={term}
                className="px-2.5 py-1 bg-ghost-accent/10 text-ghost-accent text-[13px] rounded-md font-medium"
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
