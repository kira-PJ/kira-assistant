import React from 'react';
import { TabId } from '../App';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'transcript', label: 'Transcript', icon: '📝' },
  { id: 'suggestions', label: 'AI Coach', icon: '💡' },
  { id: 'context', label: 'Context', icon: '🔍' },
  { id: 'metrics', label: 'Metrics', icon: '📊' },
  { id: 'actions', label: 'Actions', icon: '✅' },
];

const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="flex bg-ghost-surface border-b border-ghost-border shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 py-1.5 px-1 text-xs font-medium transition-colors border-b-2 ${
            activeTab === tab.id
              ? 'border-ghost-accent text-ghost-accent'
              : 'border-transparent text-ghost-text-dim hover:text-ghost-text'
          }`}
        >
          <span className="block text-center">
            <span className="text-sm">{tab.icon}</span>
            <span className="block mt-0.5">{tab.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
};

export default TabBar;
