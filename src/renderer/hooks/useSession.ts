import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TranscriptEntry,
  AISuggestion,
  SentimentData,
  TalkRatio,
  TechMention,
  SessionState,
  CallType,
} from '../types';

/**
 * useSession - Central state hook for the K.I.R.A. session
 *
 * Subscribes to all IPC events from the main process and provides
 * live state for transcript, suggestions, metrics, and session control.
 */
export function useSession() {
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [talkRatio, setTalkRatio] = useState<TalkRatio>({ you: 50, other: 50 });
  const [techMentions, setTechMentions] = useState<TechMention[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [callType, setCallType] = useState<CallType>('discovery');
  const [micActive, setMicActive] = useState(false);
  const [systemActive, setSystemActive] = useState(false);

  const cleanupRefs = useRef<(() => void)[]>([]);

  useEffect(() => {
    const api = window.ghostAPI;
    if (!api) return;

    // Subscribe to live events
    cleanupRefs.current.push(
      api.onTranscriptSegment((segment) => {
        setTranscript((prev) => {
          if (segment.isPartial) {
            // Replace the last partial from the same speaker, or append
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx].isPartial && prev[lastIdx].speaker === segment.speaker) {
              const updated = [...prev];
              updated[lastIdx] = segment;
              return updated;
            }
          }
          // Final result: remove any trailing partial from same speaker, then append
          const filtered = prev.filter(
            (s, i) => !(i === prev.length - 1 && s.isPartial && s.speaker === segment.speaker)
          );
          return [...filtered, segment];
        });
      })
    );

    cleanupRefs.current.push(
      api.onCoachingSuggestion((suggestion) => {
        setSuggestions((prev) => [suggestion, ...prev].slice(0, 50));
      })
    );

    cleanupRefs.current.push(
      api.onSentimentUpdate((analysis) => {
        setSentiment(analysis);
      })
    );

    cleanupRefs.current.push(
      api.onTalkRatioUpdate((ratio) => {
        setTalkRatio(ratio);
      })
    );

    cleanupRefs.current.push(
      api.onTechMention((mention) => {
        setTechMentions((prev) => [mention, ...prev].slice(0, 20));
      })
    );

    cleanupRefs.current.push(
      api.onSessionState((state) => {
        setSessionState(state as SessionState);
        if (state === 'active') setError(null);
      })
    );

    cleanupRefs.current.push(
      api.onSessionError((errMsg) => {
        setError(errMsg);
      })
    );

    cleanupRefs.current.push(
      api.onVadChange(({ source, active }) => {
        if (source === 'mic') setMicActive(active);
        if (source === 'system') setSystemActive(active);
      })
    );

    return () => {
      cleanupRefs.current.forEach((fn) => fn());
      cleanupRefs.current = [];
    };
  }, []);

  const startCapture = useCallback(async () => {
    const result = await window.ghostAPI?.startCapture();
    if (result && !result.success) {
      setError(result.error ?? 'Failed to start capture');
    }
  }, []);

  const stopCapture = useCallback(async () => {
    await window.ghostAPI?.stopCapture();
  }, []);

  const changeCallType = useCallback(async (type: CallType) => {
    setCallType(type);
    await window.ghostAPI?.setCallType(type);
  }, []);

  const bookmarkSegment = useCallback((segmentId: string) => {
    setTranscript((prev) =>
      prev.map((s) => (s.id === segmentId ? { ...s, isBookmarked: !s.isBookmarked } : s))
    );
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    setSuggestions([]);
    setTechMentions([]);
    setSentiment(null);
    setTalkRatio({ you: 50, other: 50 });
  }, []);

  return {
    // State
    sessionState,
    transcript,
    suggestions,
    sentiment,
    talkRatio,
    techMentions,
    error,
    callType,
    micActive,
    systemActive,
    isCapturing: sessionState === 'active',

    // Actions
    startCapture,
    stopCapture,
    changeCallType,
    bookmarkSegment,
    clearTranscript,
  };
}
