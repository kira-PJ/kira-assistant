import React from 'react';
import { ActionItem } from '../../types';

const mockActions: ActionItem[] = [
  {
    id: '1',
    text: 'Send follow-up email with migration assessment details',
    owner: 'You',
    dueDate: 'EOD Today',
    completed: false,
    timestamp: Date.now() - 30000,
  },
  {
    id: '2',
    text: 'Schedule deep-dive on .NET workload migration options',
    owner: 'You',
    dueDate: 'Next Week',
    completed: false,
    timestamp: Date.now() - 20000,
  },
  {
    id: '3',
    text: 'Customer to share current architecture diagram',
    owner: 'Customer',
    dueDate: 'This Week',
    completed: false,
    timestamp: Date.now() - 10000,
  },
];

const ActionsPanel: React.FC = () => {
  return (
    <div className="h-full overflow-y-auto p-3 space-y-2">
      {mockActions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-ghost-text-dim">
          <span className="text-3xl mb-2">✅</span>
          <p className="text-sm">Action items extracted from conversation</p>
          <p className="text-xs mt-1">Will populate during the call</p>
        </div>
      ) : (
        <>
          <h3 className="text-xs font-semibold text-ghost-text-dim uppercase tracking-wider mb-2">
            Action Items ({mockActions.length})
          </h3>
          {mockActions.map((action) => (
            <div
              key={action.id}
              className="bg-ghost-surface rounded-md p-2.5 border border-ghost-border flex items-start gap-2"
            >
              <input
                type="checkbox"
                checked={action.completed}
                readOnly
                className="mt-0.5 accent-ghost-accent"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-ghost-text leading-relaxed">{action.text}</p>
                <div className="flex gap-3 mt-1">
                  {action.owner && (
                    <span className="text-[10px] text-ghost-text-dim">👤 {action.owner}</span>
                  )}
                  {action.dueDate && (
                    <span className="text-[10px] text-ghost-warning">📅 {action.dueDate}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default ActionsPanel;
