import React, { useState, useCallback, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import TabBar from './components/TabBar';
import TranscriptPanel from './components/panels/TranscriptPanel';
import SuggestionsPanel from './components/panels/SuggestionsPanel';
import ContextPanel from './components/panels/ContextPanel';
import MetricsPanel from './components/panels/MetricsPanel';
import ActionsPanel from './components/panels/ActionsPanel';
import CollapsedStrip from './components/CollapsedStrip';
import SetupWizard from './components/SetupWizard';
import { useSession } from './hooks/useSession';
import { GhostAPI } from './types';

declare global {
  interface Window {
    ghostAPI: GhostAPI;
  }
}

export type TabId = 'transcript' | 'suggestions' | 'context' | 'metrics' | 'actions';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('transcript');
  const [collapsed, setCollapsed] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  const session = useSession();

  // Check first-run
  useEffect(() => {
    window.ghostAPI?.isFirstRun().then((first) => {
      if (first) setShowSetup(true);
    });
  }, []);

  const toggleCollapse = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    window.ghostAPI?.setCollapse(next);
  }, [collapsed]);

  const handleToggleCapture = useCallback(() => {
    if (session.isCapturing) {
      session.stopCapture();
    } else {
      session.startCapture();
    }
  }, [session]);

  useEffect(() => {
    const cleanupCollapse = window.ghostAPI?.onToggleCollapse(toggleCollapse);
    const cleanupCapture = window.ghostAPI?.onToggleCapture(handleToggleCapture);

    return () => {
      cleanupCollapse?.();
      cleanupCapture?.();
    };
  }, [toggleCollapse, handleToggleCapture]);

  if (showSetup) {
    return (
      <SetupWizard
        onComplete={() => setShowSetup(false)}
      />
    );
  }

  if (collapsed) {
    return <CollapsedStrip isCapturing={session.isCapturing} onExpand={toggleCollapse} />;
  }

  const renderPanel = () => {
    switch (activeTab) {
      case 'transcript':
        return (
          <TranscriptPanel
            entries={session.transcript}
            onBookmark={session.bookmarkSegment}
          />
        );
      case 'suggestions':
        return <SuggestionsPanel suggestions={session.suggestions} />;
      case 'context':
        return <ContextPanel techMentions={session.techMentions} />;
      case 'metrics':
        return (
          <MetricsPanel
            talkRatio={session.talkRatio}
            sentiment={session.sentiment}
            techMentions={session.techMentions}
            micActive={session.micActive}
            systemActive={session.systemActive}
          />
        );
      case 'actions':
        return <ActionsPanel />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-ghost-bg rounded-lg overflow-hidden border border-ghost-border">
      <TitleBar
        isCapturing={session.isCapturing}
        sessionState={session.sessionState}
        callType={session.callType}
        onToggleCapture={handleToggleCapture}
        onCollapse={toggleCollapse}
        onCallTypeChange={session.changeCallType}
      />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      {session.error && (
        <div className="px-3 py-1.5 bg-ghost-danger/10 text-ghost-danger text-xs border-b border-ghost-danger/20">
          ⚠ {session.error}
        </div>
      )}
      <main className="flex-1 overflow-hidden">{renderPanel()}</main>
    </div>
  );
};

export default App;
