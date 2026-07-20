import React, { useState, useCallback, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import TabBar from './components/TabBar';
import TranscriptPanel from './components/panels/TranscriptPanel';
import SuggestionsPanel from './components/panels/SuggestionsPanel';
import ContextPanel from './components/panels/ContextPanel';
import MetricsPanel from './components/panels/MetricsPanel';
import HistoryPanel from './components/panels/HistoryPanel';
import SummaryPanel from './components/panels/SummaryPanel';
import CollapsedStrip from './components/CollapsedStrip';
import SetupWizard from './components/SetupWizard';
import PreCallPanel, { PreCallConfig } from './components/PreCallPanel';
import QuestionPopup from './components/QuestionPopup';
import ErrorBoundary from './components/ErrorBoundary';
import LoginScreen from './components/LoginScreen';
import SettingsModal from './components/SettingsModal';
import { useSession } from './hooks/useSession';
import { useTheme } from './hooks/useTheme';
import { AISuggestion, GhostAPI } from './types';

declare global {
  interface Window {
    ghostAPI: GhostAPI;
  }
}

export type TabId = 'transcript' | 'suggestions' | 'context' | 'metrics' | 'history' | 'summary';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('transcript');
  const [collapsed, setCollapsed] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showPreCall, setShowPreCall] = useState(false);
  const [questionPopup, setQuestionPopup] = useState<AISuggestion | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ pending: number; failed: number; total: number }>({ pending: 0, failed: 0, total: 0 });

  const session = useSession();
  const { theme, toggleTheme } = useTheme();

  // Show popup when a question-answer suggestion arrives
  useEffect(() => {
    const latest = session.suggestions[0];
    if (latest && latest.type === 'answer' && (latest.title === 'Question detected' || latest.title === 'Customer asked')) {
      setQuestionPopup(latest);
    }
  }, [session.suggestions]);

  // Check auth state on mount
  useEffect(() => {
    window.ghostAPI?.authGetState?.().then((state) => {
      if (!state?.isAuthenticated) {
        setShowLogin(true);
      }
      setAuthChecked(true);
    }).catch(() => {
      setAuthChecked(true);
    });

    // Listen for auth expiry
    const cleanupAuth = window.ghostAPI?.onAuthStateChange?.((state) => {
      if (!state.isAuthenticated) {
        setShowLogin(true);
      }
    });

    // Listen for sync status
    const cleanupSync = window.ghostAPI?.onSyncStatus?.((status) => {
      setSyncStatus(status);
    });

    return () => { cleanupAuth?.(); cleanupSync?.(); };
  }, []);

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
      // Show pre-call panel instead of starting immediately
      setShowPreCall(true);
    }
  }, [session]);

  const handlePreCallStart = useCallback(async (config: PreCallConfig) => {
    setShowPreCall(false);
    session.changeCallType(config.callType);
    await window.ghostAPI?.startSession(config);
  }, [session]);

  useEffect(() => {
    const cleanupCollapse = window.ghostAPI?.onToggleCollapse(toggleCollapse);
    const cleanupCapture = window.ghostAPI?.onToggleCapture(handleToggleCapture);
    const cleanupSettings = window.ghostAPI?.onOpenSettings(() => setShowSettings(true));

    return () => {
      cleanupCollapse?.();
      cleanupCapture?.();
      cleanupSettings?.();
    };
  }, [toggleCollapse, handleToggleCapture]);

  if (showSetup) {
    return (
      <SetupWizard
        onComplete={() => setShowSetup(false)}
      />
    );
  }

  if (showLogin && authChecked) {
    return <LoginScreen onAuthenticated={() => setShowLogin(false)} />;
  }

  if (collapsed) {
    return <CollapsedStrip isCapturing={session.isCapturing} onExpand={toggleCollapse} />;
  }

  if (showPreCall && !session.isCapturing) {
    return (
      <div className="flex flex-col h-screen bg-ghost-bg rounded-lg overflow-hidden border border-ghost-border">
        <TitleBar
          isCapturing={session.isCapturing}
          sessionState={session.sessionState}
          callType={session.callType}
          theme={theme}
          syncStatus={syncStatus}
          onToggleCapture={handleToggleCapture}
          onCollapse={toggleCollapse}
          onCallTypeChange={session.changeCallType}
          onToggleTheme={toggleTheme}
          onOpenSettings={() => setShowSettings(true)}
        />
        <PreCallPanel
          onStart={handlePreCallStart}
          onCancel={() => setShowPreCall(false)}
        />
      </div>
    );
  }

  const renderPanel = () => {
    switch (activeTab) {
      case 'transcript':
        return (
          <TranscriptPanel
            entries={session.transcript}
            onBookmark={session.bookmarkSegment}
            onRenameSpeaker={session.renameSpeaker}
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
      case 'history':
        return <HistoryPanel />;
      case 'summary':
        return <SummaryPanel />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-ghost-bg rounded-lg overflow-hidden border border-ghost-border">
      <TitleBar
        isCapturing={session.isCapturing}
        sessionState={session.sessionState}
        callType={session.callType}
        theme={theme}
        syncStatus={syncStatus}
        onToggleCapture={handleToggleCapture}
        onCollapse={toggleCollapse}
        onCallTypeChange={session.changeCallType}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setShowSettings(true)}
      />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      {session.error && (
        <div className="px-3 py-1.5 bg-ghost-danger/10 text-ghost-danger text-xs border-b border-ghost-danger/20">
          ⚠ {session.error}
        </div>
      )}
      <main className="flex-1 overflow-hidden">
        <ErrorBoundary fallbackLabel="this panel">
          {renderPanel()}
        </ErrorBoundary>
      </main>
      <QuestionPopup
        suggestion={questionPopup}
        onDismiss={() => setQuestionPopup(null)}
      />
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
};

export default App;
