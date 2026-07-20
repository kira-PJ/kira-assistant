import { TranscriptSegment } from './types';

/**
 * Default speaker labels per call type.
 */
const SPEAKER_LABELS: Record<string, { you: string; other: string }> = {
  discovery: { you: 'You', other: 'Speaker' },
  demo: { you: 'You', other: 'Speaker' },
  training: { you: 'You', other: 'Trainer' },
  technical: { you: 'You', other: 'Speaker' },
  followup: { you: 'You', other: 'Speaker' },
  negotiation: { you: 'You', other: 'Speaker' },
};

/**
 * SpeakerIdentifier - Multi-speaker support with diarization
 *
 * Works with AWS Transcribe speaker diarization which assigns
 * speaker IDs (speaker_0, speaker_1, speaker_2) to segments.
 *
 * When user renames "Speaker 1" → "Timothy", all segments with
 * speaker_0 get renamed retroactively AND going forward.
 */
export class SpeakerIdentifier {
  private youName = 'You';
  private defaultOtherName = 'Speaker';
  private participants: string[] = [];
  /** Map speakerId (e.g. 'speaker_0') → display name */
  private speakerIdNames: Map<string, string> = new Map();
  /** Per-segment overrides for manual edits */
  private segmentOverrides: Map<string, string> = new Map();
  private callType = 'discovery';
  private myRole: 'leading' | 'attending' = 'leading';
  private introPatterns: RegExp[];

  constructor() {
    this.introPatterns = [
      /(?:(?:hi|hey|hello|good morning|good afternoon),?\s*)?(?:I'm|I am|my name is|this is|it's)\s+([A-Z][a-z]+)/i,
      /(?:hi|hey|hello),?\s*([A-Z][a-z]+)\s+here/i,
      /(?:this is|it's|I'm)\s+([A-Z][a-z]+)\s+(?:from|at|with)/i,
      /(?:let me introduce myself,?\s*)?(?:I'm|I am)\s+([A-Z][a-z]+)/i,
    ];
  }

  /**
   * Set call type to adjust default labels.
   */
  setCallType(type: string, myRole?: 'leading' | 'attending'): void {
    this.callType = type;
    if (myRole) this.myRole = myRole;

    const labels = SPEAKER_LABELS[type] ?? SPEAKER_LABELS['discovery'];
    if (type === 'training') {
      this.defaultOtherName = this.myRole === 'attending' ? 'Trainer' : 'Student';
    } else if (type === 'demo') {
      this.defaultOtherName = this.myRole === 'attending' ? 'Presenter' : 'Attendee';
    } else {
      this.defaultOtherName = labels.other;
    }
  }

  /**
   * Set participants from pre-call config.
   */
  setParticipants(participantList: string): void {
    this.participants = participantList
      .split(/[,;]/)
      .map(p => p.replace(/\(.*?\)/g, '').trim())
      .filter(p => p.length > 0);
  }

  /**
   * Process a segment — assign speaker name based on diarized speaker ID.
   */
  processSegment(segment: TranscriptSegment): TranscriptSegment {
    // Per-segment override (manual edit of a specific segment)
    const override = this.segmentOverrides.get(segment.id);
    if (override) {
      return { ...segment, speakerName: override };
    }

    // Mic = always you
    if (segment.speaker === 'you') {
      return { ...segment, speakerName: this.youName };
    }

    // Check if this speaker ID has been renamed (e.g., speaker_0 → "Timothy")
    const namedSpeaker = this.speakerIdNames.get(segment.speaker);
    if (namedSpeaker) {
      return { ...segment, speakerName: namedSpeaker };
    }

    // Try to detect a name introduction
    const detectedName = this.detectName(segment.text);
    if (detectedName) {
      this.speakerIdNames.set(segment.speaker, detectedName);
      if (!this.participants.includes(detectedName)) {
        this.participants.push(detectedName);
      }
      return { ...segment, speakerName: detectedName };
    }

    // Use Transcribe's speaker label if present (e.g., "Speaker 1")
    if (segment.speakerName && segment.speakerName.startsWith('Speaker ')) {
      return segment;
    }

    // Fallback
    return { ...segment, speakerName: this.defaultOtherName };
  }

  /**
   * Rename a speaker by their diarized ID.
   * This renames ALL segments (past and future) from that speaker.
   * Called when user clicks "Speaker 1" and types "Timothy".
   */
  renameSpeakerId(speakerId: string, newName: string): void {
    this.speakerIdNames.set(speakerId, newName);
    if (!this.participants.includes(newName)) {
      this.participants.push(newName);
    }
  }

  /**
   * Rename a specific segment by its ID (fine-grained override).
   */
  renameSegment(segmentId: string, newName: string): void {
    this.segmentOverrides.set(segmentId, newName);
  }

  /**
   * Rename by source type (legacy support).
   */
  renameSpeaker(source: string, name: string): void {
    if (source === 'you') {
      this.youName = name;
    } else {
      // If it's a speaker_X id, rename that specific speaker
      if (source.startsWith('speaker_')) {
        this.renameSpeakerId(source, name);
      } else {
        this.defaultOtherName = name;
      }
    }
  }

  setName(source: 'you' | 'other', name: string): void {
    this.renameSpeaker(source, name);
  }

  getNames(): Record<string, string> {
    const names: Record<string, string> = { you: this.youName };
    for (const [id, name] of this.speakerIdNames) {
      names[id] = name;
    }
    names['_default'] = this.defaultOtherName;
    names['_participants'] = this.participants.join(', ');
    return names;
  }

  getParticipants(): string[] {
    return [...this.participants];
  }

  /**
   * Get the display name for a speaker ID (for retroactive rename in UI)
   */
  getNameForSpeakerId(speakerId: string): string | undefined {
    return this.speakerIdNames.get(speakerId);
  }

  private detectName(text: string): string | null {
    for (const pattern of this.introPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        if (name.length >= 2 && name.length <= 15 && /^[A-Z]/.test(name)) {
          const falsePositives = ['The', 'This', 'That', 'Here', 'There', 'Just', 'Well', 'Also', 'Actually'];
          if (!falsePositives.includes(name)) return name;
        }
      }
    }
    return null;
  }
}
