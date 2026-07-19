import React, { useState, useEffect } from 'react';
import { CallType } from '../types';

interface AudioDevice {
  name: string;
  description: string;
  isMonitor: boolean;
}

interface PreCallPanelProps {
  onStart: (config: PreCallConfig) => void;
  onCancel: () => void;
}

export interface PreCallConfig {
  meetingName: string;
  meetingContext: string;
  callType: CallType;
  myRole: 'leading' | 'attending'; // am I leading/presenting or attending/learning?
  participants: string;
  micDevice?: string;
  systemDevice?: string;
}

const callTypes: { id: CallType; label: string; description: string }[] = [
  { id: 'discovery', label: 'Discovery', description: "I'm asking questions to understand their needs" },
  { id: 'demo', label: 'Demo / Presentation', description: "I'm showing or presenting something" },
  { id: 'training', label: 'Training', description: "A learning/teaching session" },
  { id: 'technical', label: 'Technical Deep-Dive', description: 'Detailed technical discussion' },
  { id: 'followup', label: 'Follow-up', description: 'Continuing a previous conversation' },
  { id: 'negotiation', label: 'Negotiation', description: 'Pricing, contracts, terms' },
];

const PreCallPanel: React.FC<PreCallPanelProps> = ({ onStart, onCancel }) => {
  const [meetingName, setMeetingName] = useState('');
  const [meetingContext, setMeetingContext] = useState('');
  const [callType, setCallType] = useState<CallType>('discovery');
  const [myRole, setMyRole] = useState<'leading' | 'attending'>('leading');
  const [participants, setParticipants] = useState('');
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [micDevice, setMicDevice] = useState('');
  const [systemDevice, setSystemDevice] = useState('');

  useEffect(() => {
    // Load available audio devices
    window.ghostAPI?.listAudioDevices?.().then((devs: AudioDevice[]) => {
      setDevices(devs ?? []);
    });
  }, []);

  const micDevices = devices.filter(d => !d.isMonitor);
  const systemDevices = devices.filter(d => d.isMonitor);

  const handleStart = () => {
    onStart({
      meetingName: meetingName || `Meeting ${new Date().toLocaleTimeString()}`,
      meetingContext,
      callType,
      myRole,
      participants,
      micDevice: micDevice || undefined,
      systemDevice: systemDevice || undefined,
    });
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <h2 className="text-sm font-semibold text-ghost-text">New Session</h2>

      {/* Meeting name */}
      <div>
        <label className="text-xs text-ghost-text-dim block mb-1">Meeting Name</label>
        <input
          type="text"
          value={meetingName}
          onChange={(e) => setMeetingName(e.target.value)}
          placeholder="e.g., Discovery call with Acme Corp"
          className="w-full px-2 py-1.5 bg-ghost-bg border border-ghost-border text-ghost-text text-xs rounded placeholder:text-ghost-text-dim/50"
        />
      </div>

      {/* Meeting context — the key to reducing hallucinations */}
      <div>
        <label className="text-xs text-ghost-text-dim block mb-1">
          Meeting Context <span className="text-ghost-accent">(helps AI accuracy)</span>
        </label>
        <textarea
          value={meetingContext}
          onChange={(e) => setMeetingContext(e.target.value)}
          placeholder="What is this meeting about? e.g., 'Customer wants to migrate 50 .NET apps to AWS. They have compliance concerns (SOC2). Budget is ~$200K. Decision by Q3.'"
          rows={3}
          className="w-full px-2 py-1.5 bg-ghost-bg border border-ghost-border text-ghost-text text-xs rounded placeholder:text-ghost-text-dim/50 resize-none"
        />
      </div>

      {/* Call type */}
      <div>
        <label className="text-xs text-ghost-text-dim block mb-1">Call Type</label>
        <div className="grid grid-cols-2 gap-1.5">
          {callTypes.map((ct) => (
            <button
              key={ct.id}
              onClick={() => setCallType(ct.id)}
              className={`p-2 rounded text-left border transition-colors ${
                callType === ct.id
                  ? 'border-ghost-accent bg-ghost-accent/10'
                  : 'border-ghost-border hover:border-ghost-accent/50'
              }`}
            >
              <span className="text-[11px] font-medium text-ghost-text block">{ct.label}</span>
              <span className="text-[9px] text-ghost-text-dim">{ct.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* My role */}
      <div>
        <label className="text-xs text-ghost-text-dim block mb-1">My Role</label>
        <div className="flex gap-2">
          <button
            onClick={() => setMyRole('leading')}
            className={`flex-1 py-1.5 px-2 rounded text-xs border ${
              myRole === 'leading'
                ? 'border-ghost-accent text-ghost-accent bg-ghost-accent/10'
                : 'border-ghost-border text-ghost-text-dim'
            }`}
          >
            Leading / Presenting
          </button>
          <button
            onClick={() => setMyRole('attending')}
            className={`flex-1 py-1.5 px-2 rounded text-xs border ${
              myRole === 'attending'
                ? 'border-ghost-accent text-ghost-accent bg-ghost-accent/10'
                : 'border-ghost-border text-ghost-text-dim'
            }`}
          >
            Attending / Learning
          </button>
        </div>
      </div>

      {/* Participants */}
      <div>
        <label className="text-xs text-ghost-text-dim block mb-1">Participants (optional)</label>
        <input
          type="text"
          value={participants}
          onChange={(e) => setParticipants(e.target.value)}
          placeholder="e.g., John (CTO), Sarah (Engineer)"
          className="w-full px-2 py-1.5 bg-ghost-bg border border-ghost-border text-ghost-text text-xs rounded placeholder:text-ghost-text-dim/50"
        />
      </div>

      {/* Audio devices */}
      {devices.length > 0 && (
        <div>
          <label className="text-xs text-ghost-text-dim block mb-1">Audio Devices</label>
          <div className="space-y-2">
            <div>
              <span className="text-[10px] text-ghost-text-dim">Microphone</span>
              <select
                value={micDevice}
                onChange={(e) => setMicDevice(e.target.value)}
                className="w-full mt-0.5 px-2 py-1 bg-ghost-bg border border-ghost-border text-ghost-text text-[10px] rounded"
              >
                <option value="">System Default</option>
                {micDevices.map((d) => (
                  <option key={d.name} value={d.name}>{d.description || d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <span className="text-[10px] text-ghost-text-dim">System Audio (other speakers)</span>
              <select
                value={systemDevice}
                onChange={(e) => setSystemDevice(e.target.value)}
                className="w-full mt-0.5 px-2 py-1 bg-ghost-bg border border-ghost-border text-ghost-text text-[10px] rounded"
              >
                <option value="">System Default Monitor</option>
                {systemDevices.map((d) => (
                  <option key={d.name} value={d.name}>{d.description || d.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 text-xs text-ghost-text-dim border border-ghost-border rounded hover:text-ghost-text"
        >
          Cancel
        </button>
        <button
          onClick={handleStart}
          className="flex-1 py-2 text-xs bg-ghost-accent text-ghost-bg font-medium rounded hover:bg-ghost-accent-dim"
        >
          Start Capture →
        </button>
      </div>
    </div>
  );
};

export default PreCallPanel;
