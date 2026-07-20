import React from 'react';
import { TabId } from '../App';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; label: string }[] = [
  { id: 'transcript', label: 'Transcript' },
  { id: 'suggestions', label: 'Coach' },
  { id: 'summary', label: 'Summary' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'context', label: 'Context' },
  { id: 'history', label: 'History' },
];

const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="flex bg-ghost-surface border-b border-ghost-border shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 py-2 px-1 text-[13px] font-medium transition-colors border-b-2 ${
            activeTab === tab.id
              ? 'border-ghost-accent text-ghost-accent'
              : 'border-transparent text-ghost-text-dim hover:text-ghost-text'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default TabBar;
