import React, { useState, useEffect, useCallback } from 'react';

interface ProcessedData {
  title: string;
  summary: string;
  topics: { name: string; description: string }[];
  actionItems: { text: string; owner: string; dueDate?: string }[];
  keyTakeaways: string[];
  nextSteps: string[];
  followUpEmail?: { subject: string; body: string };
  vocabulary?: { term: string; definition: string }[];
}

type SummaryTab = 'overview' | 'email' | 'vocabulary';

/**
 * SummaryPanel — Post-call hub with summary, follow-up email, export, and vocabulary.
 */
const SummaryPanel: React.FC = () => {
  const [data, setData] = useState<ProcessedData | null>(null);
  const [status, setStatus] = useState<string>('');
  const [activeTab, setActiveTab] = useState<SummaryTab>('overview');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const api = window.ghostAPI;
    if (!api) return;

    const cleanupStatus = (api as any).onPostCallStatus?.((s: string) => {
      setStatus(s);
    });
    const cleanupResult = (api as any).onPostCallResult?.((result: ProcessedData) => {
      setData(result);
      setStatus('');
    });

    return () => { cleanupStatus?.(); cleanupResult?.(); };
  }, []);

  const copyToClipboard = useCallback((text: string, label: string) => {
    window.ghostAPI?.copyToClipboard?.(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  }, []);

  const exportMarkdown = useCallback(() => {
    if (!data) return;
    let md = `# ${data.title}\n\n`;
    md += `${data.summary}\n\n`;
    if (data.keyTakeaways.length) {
      md += `## Key Takeaways\n${data.keyTakeaways.map(k => `- ${k}`).join('\n')}\n\n`;
    }
    if (data.actionItems.length) {
      md += `## Action Items\n${data.actionItems.map(a => `- [ ] ${a.text} (${a.owner}${a.dueDate ? ', due: ' + a.dueDate : ''})`).join('\n')}\n\n`;
    }
    if (data.topics.length) {
      md += `## Topics\n${data.topics.map(t => `- **${t.name}**: ${t.description}`).join('\n')}\n\n`;
    }
    if (data.nextSteps.length) {
      md += `## Next Steps\n${data.nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`;
    }
    copyToClipboard(md, 'markdown');
  }, [data, copyToClipboard]);

  const exportEmail = useCallback(() => {
    if (!data?.followUpEmail) return;
    copyToClipboard(`Subject: ${data.followUpEmail.subject}\n\n${data.followUpEmail.body}`, 'email');
  }, [data, copyToClipboard]);

  if (status && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ghost-text-dim">
        <div className="animate-pulse text-[14px] font-medium">{status}</div>
        <p className="text-[13px] mt-2">Generating summary from your call...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ghost-text-dim">
        <p className="text-[14px] font-medium">No summary yet</p>
        <p className="text-[13px] mt-2">A summary will be generated automatically when your call ends</p>
        <p className="text-[12px] mt-1 text-ghost-text-dim/60">Includes: summary, action items, follow-up email, vocabulary</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Sub-tabs + Export */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-ghost-border bg-ghost-surface/50">
        <div className="flex gap-1">
          {(['overview', 'email', 'vocabulary'] as SummaryTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-[12px] font-medium rounded transition-colors ${
                activeTab === tab
                  ? 'bg-ghost-accent/15 text-ghost-accent'
                  : 'text-ghost-text-dim hover:text-ghost-text'
              }`}
            >
              {tab === 'overview' ? 'Overview' : tab === 'email' ? 'Follow-up' : 'Vocabulary'}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={exportMarkdown}
            className="text-[11px] px-2.5 py-1 rounded border border-ghost-border text-ghost-text-dim hover:text-ghost-text hover:border-ghost-accent"
          >
            {copied === 'markdown' ? 'Copied' : 'Copy Notes'}
          </button>
          <button
            onClick={() => {
              const json = JSON.stringify(data, null, 2);
              copyToClipboard(json, 'json');
            }}
            className="text-[11px] px-2.5 py-1 rounded border border-ghost-border text-ghost-text-dim hover:text-ghost-text hover:border-ghost-accent"
          >
            {copied === 'json' ? 'Copied' : 'Export JSON'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === 'overview' && <OverviewContent data={data} />}
        {activeTab === 'email' && <EmailContent data={data} onCopy={exportEmail} copied={copied === 'email'} />}
        {activeTab === 'vocabulary' && <VocabularyContent data={data} />}
      </div>
    </div>
  );
};

// === Overview Tab ===
const OverviewContent: React.FC<{ data: ProcessedData }> = ({ data }) => (
  <>
    <div>
      <h3 className="text-[15px] font-semibold text-ghost-text mb-2">{data.title}</h3>
      <p className="text-[14px] text-ghost-text leading-relaxed">{data.summary}</p>
    </div>

    {data.keyTakeaways.length > 0 && (
      <div>
        <h4 className="text-[12px] font-semibold text-ghost-text-dim uppercase tracking-wider mb-2">Key Takeaways</h4>
        <ul className="space-y-1.5">
          {data.keyTakeaways.map((item, i) => (
            <li key={i} className="text-[13px] text-ghost-text leading-relaxed pl-4 relative">
              <span className="absolute left-0 text-ghost-accent">•</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    )}

    {data.actionItems.length > 0 && (
      <div>
        <h4 className="text-[12px] font-semibold text-ghost-accent uppercase tracking-wider mb-2">Action Items</h4>
        <div className="space-y-2">
          {data.actionItems.map((item, i) => (
            <div key={i} className="flex gap-2.5 items-start">
              <span className="w-4 h-4 border-2 border-ghost-border rounded flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] text-ghost-text leading-relaxed">{item.text}</p>
                <span className="text-[11px] text-ghost-text-dim">
                  {item.owner}{item.dueDate ? ` · Due: ${item.dueDate}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {data.topics.length > 0 && (
      <div>
        <h4 className="text-[12px] font-semibold text-ghost-text-dim uppercase tracking-wider mb-2">Topics Covered</h4>
        <div className="space-y-2">
          {data.topics.map((topic, i) => (
            <div key={i}>
              <span className="text-[13px] font-medium text-ghost-text">{topic.name}</span>
              <p className="text-[12px] text-ghost-text-dim leading-relaxed">{topic.description}</p>
            </div>
          ))}
        </div>
      </div>
    )}

    {data.nextSteps.length > 0 && (
      <div>
        <h4 className="text-[12px] font-semibold text-ghost-text-dim uppercase tracking-wider mb-2">Next Steps</h4>
        <ol className="space-y-1.5">
          {data.nextSteps.map((step, i) => (
            <li key={i} className="text-[13px] text-ghost-text leading-relaxed pl-5 relative">
              <span className="absolute left-0 text-ghost-accent font-semibold text-[12px]">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    )}
  </>
);

// === Follow-up Email Tab ===
const EmailContent: React.FC<{ data: ProcessedData; onCopy: () => void; copied: boolean }> = ({ data, onCopy, copied }) => {
  if (!data.followUpEmail) {
    return (
      <div className="text-center text-ghost-text-dim py-8">
        <p className="text-[14px] font-medium">No follow-up email generated</p>
        <p className="text-[12px] mt-1">This will be available after your next call</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[12px] font-semibold text-ghost-text-dim uppercase tracking-wider">Follow-up Email Draft</h4>
        <button
          onClick={onCopy}
          className="text-[12px] px-3 py-1 rounded border border-ghost-accent text-ghost-accent hover:bg-ghost-accent/10 font-medium"
        >
          {copied ? 'Copied' : 'Copy Email'}
        </button>
      </div>

      <div className="bg-ghost-surface rounded-lg border border-ghost-border p-4">
        <div className="mb-3 pb-3 border-b border-ghost-border">
          <span className="text-[11px] text-ghost-text-dim">Subject:</span>
          <p className="text-[14px] text-ghost-text font-medium">{data.followUpEmail.subject}</p>
        </div>
        <p className="text-[13px] text-ghost-text leading-relaxed whitespace-pre-wrap">{data.followUpEmail.body}</p>
      </div>
    </div>
  );
};

// === Vocabulary Tab ===
const VocabularyContent: React.FC<{ data: ProcessedData }> = ({ data }) => {
  const vocab = data.vocabulary ?? [];

  if (vocab.length === 0) {
    return (
      <div className="text-center text-ghost-text-dim py-8">
        <p className="text-[14px] font-medium">No new vocabulary detected</p>
        <p className="text-[12px] mt-1">New technical terms and jargon will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-[12px] font-semibold text-ghost-text-dim uppercase tracking-wider">New Terms Learned</h4>
      {vocab.map((v, i) => (
        <div key={i} className="bg-ghost-surface rounded-lg p-3 border border-ghost-border">
          <span className="text-[13px] font-semibold text-ghost-accent">{v.term}</span>
          <p className="text-[12px] text-ghost-text-dim leading-relaxed mt-1">{v.definition}</p>
        </div>
      ))}
    </div>
  );
};

export default SummaryPanel;
