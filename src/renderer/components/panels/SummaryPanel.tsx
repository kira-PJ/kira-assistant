import React, { useState, useEffect } from 'react';

interface ProcessedData {
  title: string;
  summary: string;
  topics: { name: string; description: string }[];
  actionItems: { text: string; owner: string; dueDate?: string }[];
  keyTakeaways: string[];
  nextSteps: string[];
}

/**
 * SummaryPanel — Shows the post-call summary, action items, and key takeaways.
 * Appears in the app after a call ends and processing completes.
 */
const SummaryPanel: React.FC = () => {
  const [data, setData] = useState<ProcessedData | null>(null);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    // Listen for post-call processing events from main process
    const api = window.ghostAPI;
    if (!api) return;

    // Check if there's already processed data from the current/last session
    const cleanupStatus = (api as any).onPostCallStatus?.((s: string) => {
      setStatus(s);
    });
    const cleanupResult = (api as any).onPostCallResult?.((result: ProcessedData) => {
      setData(result);
      setStatus('');
    });

    return () => {
      cleanupStatus?.();
      cleanupResult?.();
    };
  }, []);

  if (status && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ghost-text-dim">
        <div className="animate-pulse text-base font-medium">{status}</div>
        <p className="text-sm mt-2">Generating summary from your call...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ghost-text-dim">
        <p className="text-base font-medium">No summary yet</p>
        <p className="text-sm mt-2">A summary will be generated automatically when your call ends</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      {/* Title + Summary */}
      <div>
        <h3 className="text-[15px] font-semibold text-ghost-text mb-2">{data.title}</h3>
        <p className="text-[14px] text-ghost-text leading-relaxed">{data.summary}</p>
      </div>

      {/* Key Takeaways */}
      {data.keyTakeaways.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ghost-text-dim uppercase tracking-wider mb-2">Key Takeaways</h4>
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

      {/* Action Items */}
      {data.actionItems.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ghost-accent uppercase tracking-wider mb-2">Action Items</h4>
          <div className="space-y-2">
            {data.actionItems.map((item, i) => (
              <div key={i} className="flex gap-2 items-start">
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

      {/* Topics */}
      {data.topics.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ghost-text-dim uppercase tracking-wider mb-2">Topics Covered</h4>
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

      {/* Next Steps */}
      {data.nextSteps.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ghost-text-dim uppercase tracking-wider mb-2">Next Steps</h4>
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
    </div>
  );
};

export default SummaryPanel;
