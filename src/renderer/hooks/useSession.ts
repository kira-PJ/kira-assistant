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
          const lastIdx = prev.length - 1;
          const last = lastIdx >= 0 ? prev[lastIdx] : null;

          // If partial: replace the current partial block for this speaker
          if (segment.isPartial) {
            if (last && last.isPartial && last.speaker === segment.speaker) {
              const updated = [...prev];
              updated[lastIdx] = segment;
              return updated;
            }
            // New partial after a final — append as new entry
            return [...prev, segment];
          }

          // Final result: merge into the last block if same speaker and within 8 seconds
          const timeSinceLast = last ? segment.timestamp - last.timestamp : Infinity;
          const sameSpeaker = last && last.speaker === segment.speaker;
          const withinGap = timeSinceLast < 8000;

          if (last && last.isPartial && last.speaker === segment.speaker) {
            // Replace partial with final
            const updated = [...prev];
            if (sameSpeaker && lastIdx > 0 && !prev[lastIdx - 1].isPartial && prev[lastIdx - 1].speaker === segment.speaker) {
              // Merge into the block before the partial
              updated.splice(lastIdx, 1); // remove partial
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                text: updated[updated.length - 1].text + ' ' + segment.text,
                timestamp: segment.timestamp,
                confidence: segment.confidence,
                isPartial: false,
              };
            } else {
              updated[lastIdx] = segment;
            }
            return updated;
          }

          if (sameSpeaker && withinGap && last && !last.isPartial) {
            // Same speaker, still talking — append to the existing block
            const updated = [...prev];
            updated[lastIdx] = {
              ...last,
              text: last.text + ' ' + segment.text,
              timestamp: segment.timestamp,
              confidence: Math.min(last.confidence, segment.confidence),
              isPartial: false,
            };
            return updated;
          }

          // New speaker or long pause — start a new block
          return [...prev, segment];
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

  const renameSpeaker = useCallback((source: 'you' | 'other', newName: string) => {
    // Update all existing entries from this speaker retroactively
    setTranscript((prev) =>
      prev.map((s) => (s.speaker === source ? { ...s, speakerName: newName } : s))
    );
    // Persist to main process for future segments
    window.ghostAPI?.renameSpeaker?.(source, newName);
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
    renameSpeaker,
    clearTranscript,
  };
}
