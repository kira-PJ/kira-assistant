import React, { useState } from 'react';
import { Link } from 'react-router-dom';

interface CallSummary {
  id: string;
  title: string;
  date: string;
  callType: string;
  duration: string;
  score: number;
  participants: string[];
}

const mockCalls: CallSummary[] = [
  {
    id: '1',
    title: 'Discovery: Cloud Migration Options',
    date: '2026-07-17',
    callType: 'discovery',
    duration: '32 min',
    score: 78,
    participants: ['Customer A'],
  },
  {
    id: '2',
    title: 'Demo: AWS Container Services',
    date: '2026-07-16',
    callType: 'demo',
    duration: '45 min',
    score: 85,
    participants: ['Customer B', 'Tech Lead'],
  },
  {
    id: '3',
    title: 'Training: EKS Fundamentals',
    date: '2026-07-15',
    callType: 'training',
    duration: '60 min',
    score: 91,
    participants: ['Team C'],
  },
];

const scoreColor = (score: number) => {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-yellow-400';
  return 'text-red-400';
};

const CallList: React.FC = () => {
  const [filter, setFilter] = useState('all');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Recent Calls</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-sm text-gray-300 rounded px-3 py-1.5"
        >
          <option value="all">All Types</option>
          <option value="discovery">Discovery</option>
          <option value="demo">Demo</option>
          <option value="training">Training</option>
          <option value="technical">Technical</option>
          <option value="followup">Follow-up</option>
          <option value="negotiation">Negotiation</option>
        </select>
      </div>

      <div className="space-y-3">
        {mockCalls
          .filter(c => filter === 'all' || c.callType === filter)
          .map((call) => (
          <Link
            key={call.id}
            to={`/call/${call.id}`}
            className="block p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-emerald-500/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-100">{call.title}</h3>
                <div className="flex gap-3 mt-1 text-xs text-gray-500">
                  <span>{call.date}</span>
                  <span>{call.duration}</span>
                  <span className="capitalize">{call.callType}</span>
                  <span>{call.participants.join(', ')}</span>
                </div>
              </div>
              <div className={`text-2xl font-bold ${scoreColor(call.score)}`}>
                {call.score}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default CallList;
