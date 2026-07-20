import React, { useState, useEffect, useCallback } from 'react';
import { AISuggestion } from '../types';

interface QuestionPopupProps {
  suggestion: AISuggestion | null;
  onDismiss: () => void;
}

/**
 * QuestionPopup — Floating notification that appears when the other party asks a question.
 * Shows the question detection + AI-suggested answer prominently so the user can respond.
 * Auto-dismisses after 10 seconds or click to close.
 */
const QuestionPopup: React.FC<QuestionPopupProps> = ({ suggestion, onDismiss }) => {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (suggestion) {
      setVisible(true);
      setExiting(false);

      // Auto-dismiss after 10 seconds
      const timer = setTimeout(() => {
        dismiss();
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [suggestion]);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      onDismiss();
    }, 300);
  }, [onDismiss]);

  if (!visible || !suggestion) return null;

  // Parse the content — it contains simpleAnswer + key points
  const lines = suggestion.content.split('\n').filter(l => l.trim());
  const mainAnswer = lines[0] ?? '';
  const details = lines.slice(1).join(' ');

  return (
    <div
      className={`fixed top-12 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md transition-all duration-300 ${
        exiting ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
      }`}
    >
      <div className="bg-ghost-surface border border-ghost-accent/60 rounded-lg shadow-lg shadow-ghost-accent/10 p-3 relative">
        {/* Dismiss button */}
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 text-ghost-text-dim hover:text-ghost-text text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-ghost-border/50"
        >
          ✕
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[13px] font-semibold text-ghost-accent">Question Detected</span>
          {/* Countdown bar */}
          <div className="flex-1 h-0.5 bg-ghost-border rounded-full overflow-hidden ml-2">
            <div
              className="h-full bg-ghost-accent rounded-full"
              style={{ animation: 'shrink 10s linear forwards' }}
            />
          </div>
        </div>

        {/* Question/Answer content */}
        <p className="text-xs text-ghost-text leading-relaxed mb-1">{mainAnswer}</p>
        {details && (
          <p className="text-[10px] text-ghost-text-dim leading-relaxed">{details}</p>
        )}

        {/* Metadata: avoid */}
        {suggestion.metadata?.avoid ? (
          <p className="text-[10px] text-ghost-danger/80 mt-1.5 italic">
            Avoid: {String(suggestion.metadata.avoid)}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default QuestionPopup;
