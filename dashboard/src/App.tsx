import React, { useState } from 'react';

// Mock data — will connect to API later
const mockCalls = [
  {
    id: '1',
    name: 'Discovery: Cloud Migration with Acme Corp',
    date: '2026-07-19',
    duration: '32 min',
    callType: 'discovery',
    score: 78,
    participants: 'Moses (CTO), Sarah (Engineer)',
    summary: 'Customer evaluating cloud migration for 50 .NET apps. SOC2 compliance required. Budget ~$200K. Timeline: Q3 decision.',
    recommendations: [
      'Ask about their current monitoring/observability setup',
      'Clarify who else is involved in the decision (procurement?)',
      'Send AWS MAP program info — could offset migration costs',
    ],
    strengths: ['Good discovery questions about compliance', 'Clear explanation of shared responsibility model'],
    improvements: ['Talk ratio was 60/40 — listen more', 'Missed opportunity to ask about timeline drivers'],
    dimensions: [
      { name: 'Discovery Depth', score: 82 },
      { name: 'Question Quality', score: 75 },
      { name: 'Technical Accuracy', score: 90 },
      { name: 'Engagement', score: 72 },
      { name: 'Next Steps', score: 85 },
      { name: 'Talk Ratio', score: 60 },
      { name: 'Objection Handling', score: 70 },
    ],
    transcript: [
      { speaker: 'other', name: 'Moses', text: "Hi, thanks for making the time. So as I mentioned, we're looking at options for moving our on-prem workloads to the cloud. We have about 50 .NET applications running on Windows Server with SQL Server databases." },
      { speaker: 'you', name: 'You', text: "Thanks Moses. That's helpful context. Can you tell me more about what's driving this decision now? Has something changed in your infrastructure or business needs?" },
      { speaker: 'other', name: 'Moses', text: "Yeah, our data center lease is up in Q1 next year, and renewal costs went up 40%. Plus we're growing fast and the current setup can't scale. We also have SOC2 compliance requirements that are getting harder to maintain on-prem." },
      { speaker: 'you', name: 'You', text: "That makes sense. The lease expiry gives a natural timeline. For the SOC2 piece — AWS has over 140 compliance certifications including SOC2. Most of the heavy lifting shifts to AWS's responsibility. Your team would still own application-level controls." },
    ],
  },
  {
    id: '2',
    name: 'Training: EKS Workshop — Team Bravo',
    date: '2026-07-18',
    duration: '55 min',
    callType: 'training',
    score: 88,
    participants: 'Team Bravo (6 people)',
    summary: 'EKS fundamentals workshop. Covered cluster architecture, pod deployment, and service discovery. Team engaged well, some confusion on networking.',
    recommendations: [
      'Follow up with a hands-on lab session for networking concepts',
      'Share the EKS best practices whitepaper',
      'Schedule a deeper dive on Fargate vs EC2 node groups',
    ],
    strengths: ['Great use of diagrams and analogies', 'Good pace management', 'Engaged all participants'],
    improvements: ['Networking section needed more examples', 'Could have paused for questions more often'],
    dimensions: [
      { name: 'Discovery Depth', score: 70 },
      { name: 'Question Quality', score: 85 },
      { name: 'Technical Accuracy', score: 95 },
      { name: 'Engagement', score: 90 },
      { name: 'Next Steps', score: 88 },
      { name: 'Talk Ratio', score: 75 },
      { name: 'Objection Handling', score: 80 },
    ],
    transcript: [],
  },
];

type View = 'list' | 'detail';

const App: React.FC = () => {
  const [view, setView] = useState<View>('list');
  const [selectedCall, setSelectedCall] = useState<typeof mockCalls[0] | null>(null);

  const openCall = (call: typeof mockCalls[0]) => {
    setSelectedCall(call);
    setView('detail');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#e2e8f0' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #1e293b', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#16db93', fontSize: '20px', fontWeight: 'bold' }}>✦</span>
          <h1 style={{ fontSize: '18px', fontWeight: 600 }}>K.I.R.A.</h1>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Knowledge, Insights & Response Assistant</span>
        </div>
        {view === 'detail' && (
          <button onClick={() => setView('list')} style={{ fontSize: '13px', color: '#16db93', background: 'none', border: 'none', cursor: 'pointer' }}>
            ← All Calls
          </button>
        )}
      </header>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}>
        {view === 'list' ? <CallList calls={mockCalls} onOpen={openCall} /> : selectedCall && <CallDetail call={selectedCall} />}
      </main>
    </div>
  );
};

// === Call List ===
const CallList: React.FC<{ calls: typeof mockCalls; onOpen: (c: typeof mockCalls[0]) => void }> = ({ calls, onOpen }) => (
  <div>
    <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px' }}>Recent Calls</h2>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {calls.map((call) => (
        <div
          key={call.id}
          onClick={() => onOpen(call)}
          style={{ padding: '20px', background: '#111827', border: '1px solid #1e293b', borderRadius: '12px', cursor: 'pointer', transition: 'border-color 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#16db93')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e293b')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 500, marginBottom: '6px' }}>{call.name}</h3>
              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#64748b' }}>
                <span>{call.date}</span>
                <span>{call.duration}</span>
                <span style={{ textTransform: 'capitalize' }}>{call.callType}</span>
                <span>{call.participants}</span>
              </div>
              <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '8px', lineHeight: '1.5' }}>{call.summary}</p>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700, color: call.score >= 80 ? '#16db93' : call.score >= 60 ? '#f59e0b' : '#ef4444', minWidth: '50px', textAlign: 'right' }}>
              {call.score}
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// === Call Detail ===
const CallDetail: React.FC<{ call: typeof mockCalls[0] }> = ({ call }) => (
  <div>
    {/* Header */}
    <div style={{ marginBottom: '32px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '8px' }}>{call.name}</h2>
      <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#64748b' }}>
        <span>{call.date}</span>
        <span>{call.duration}</span>
        <span style={{ textTransform: 'capitalize' }}>{call.callType}</span>
        <span>{call.participants}</span>
      </div>
    </div>

    {/* Score + Dimensions */}
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '24px', marginBottom: '32px', background: '#111827', padding: '24px', borderRadius: '12px', border: '1px solid #1e293b' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', fontWeight: 700, color: '#16db93' }}>{call.score}</div>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Overall Score</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {call.dimensions.map((dim) => (
          <div key={dim.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', width: '130px', flexShrink: 0 }}>{dim.name}</span>
            <div style={{ flex: 1, height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${dim.score}%`, height: '100%', background: dim.score >= 80 ? '#16db93' : dim.score >= 60 ? '#f59e0b' : '#ef4444', borderRadius: '3px' }} />
            </div>
            <span style={{ fontSize: '11px', color: '#e2e8f0', width: '28px', textAlign: 'right' }}>{dim.score}</span>
          </div>
        ))}
      </div>
    </div>

    {/* Recommendations */}
    <Section title="📋 Recommendations" color="#16db93">
      {call.recommendations.map((rec, i) => (
        <li key={i} style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '8px', paddingLeft: '8px' }}>{rec}</li>
      ))}
    </Section>

    {/* Strengths & Improvements */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
      <div style={{ background: '#111827', padding: '20px', borderRadius: '12px', border: '1px solid #1e293b' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#16db93', marginBottom: '12px' }}>✓ Strengths</h4>
        {call.strengths.map((s, i) => (
          <p key={i} style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px', lineHeight: '1.5' }}>• {s}</p>
        ))}
      </div>
      <div style={{ background: '#111827', padding: '20px', borderRadius: '12px', border: '1px solid #1e293b' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', marginBottom: '12px' }}>→ Improve</h4>
        {call.improvements.map((s, i) => (
          <p key={i} style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '6px', lineHeight: '1.5' }}>• {s}</p>
        ))}
      </div>
    </div>

    {/* Transcript */}
    {call.transcript.length > 0 && (
      <Section title="💬 Transcript" color="#64748b">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {call.transcript.map((seg, i) => (
            <div key={i}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: seg.speaker === 'you' ? '#60a5fa' : '#16db93' }}>
                {seg.name}
              </span>
              <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6', marginTop: '4px' }}>{seg.text}</p>
            </div>
          ))}
        </div>
      </Section>
    )}
  </div>
);

// === Section Helper ===
const Section: React.FC<{ title: string; color: string; children: React.ReactNode }> = ({ title, color, children }) => (
  <div style={{ marginBottom: '32px', background: '#111827', padding: '20px', borderRadius: '12px', border: '1px solid #1e293b' }}>
    <h4 style={{ fontSize: '14px', fontWeight: 600, color, marginBottom: '16px' }}>{title}</h4>
    <ul style={{ listStyle: 'none', padding: 0 }}>{children}</ul>
  </div>
);

export default App;
