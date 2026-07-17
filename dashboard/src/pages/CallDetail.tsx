import React from 'react';
import { useParams, Link } from 'react-router-dom';

const CallDetail: React.FC = () => {
  const { id } = useParams();

  // This would fetch from the API in production
  const call = {
    id,
    title: 'Discovery: Cloud Migration Options',
    date: '2026-07-17',
    duration: '32 min',
    callType: 'discovery',
    score: 78,
    dimensions: [
      { name: 'Discovery Depth', score: 82 },
      { name: 'Objection Handling', score: 70 },
      { name: 'Next Steps', score: 85 },
      { name: 'Talk Ratio', score: 65 },
      { name: 'Technical Accuracy', score: 90 },
      { name: 'Engagement', score: 75 },
      { name: 'Question Quality', score: 80 },
    ],
    summary: 'Customer is evaluating cloud migration for their on-prem .NET workloads with SQL Server databases. They have compliance requirements (SOC2) and are looking for a phased migration approach. Key decision makers include the CTO and VP Engineering.',
    actionItems: [
      'Send migration assessment framework document',
      'Schedule deep-dive on .NET containerization options',
      'Customer to share current architecture diagrams',
    ],
    strengths: [
      'Good open-ended questions about current infrastructure',
      'Clear explanation of AWS migration paths',
    ],
    improvements: [
      'Ask more about timeline and budget constraints earlier',
      'Talk ratio was high — listen more in discovery calls',
    ],
  };

  return (
    <div>
      <Link to="/" className="text-sm text-gray-500 hover:text-gray-300 mb-4 inline-block">
        ← Back to calls
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{call.title}</h2>
          <div className="flex gap-3 mt-1 text-sm text-gray-500">
            <span>{call.date}</span>
            <span>{call.duration}</span>
            <span className="capitalize">{call.callType}</span>
          </div>
        </div>
        <div className="text-4xl font-bold text-emerald-400">{call.score}</div>
      </div>

      {/* Score dimensions */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {call.dimensions.map((dim) => (
          <div key={dim.name} className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">{dim.name}</span>
              <span className="text-sm font-semibold text-gray-100">{dim.score}</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${dim.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Summary</h3>
        <p className="text-sm text-gray-400 leading-relaxed">{call.summary}</p>
      </section>

      {/* Action Items */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Action Items</h3>
        <ul className="space-y-1">
          {call.actionItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
              <span className="text-emerald-400 mt-0.5">•</span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* Strengths & Improvements */}
      <div className="grid grid-cols-2 gap-4">
        <section>
          <h3 className="text-sm font-semibold text-emerald-400 mb-2">Strengths</h3>
          <ul className="space-y-1">
            {call.strengths.map((s, i) => (
              <li key={i} className="text-xs text-gray-400">✓ {s}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="text-sm font-semibold text-yellow-400 mb-2">Improve</h3>
          <ul className="space-y-1">
            {call.improvements.map((s, i) => (
              <li key={i} className="text-xs text-gray-400">→ {s}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default CallDetail;
