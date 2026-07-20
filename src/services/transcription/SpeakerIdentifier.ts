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
 * SpeakerIdentifier - Multi-speaker support
 *
 * The audio has two channels: mic (you) and system (everyone else).
 * Since system audio mixes all other participants into one stream,
 * we can't auto-separate them. Instead we:
 *
 * 1. Allow pre-setting participant names from the pre-call panel
 * 2. Auto-detect name introductions
 * 3. Support per-segment renaming (edit ONE segment, not all)
 * 4. Track multiple "other" speakers by segment ID
 *
 * When user renames a segment to "Timothy", only that segment and
 * consecutive segments from the same speaker get that name — NOT all
 * "other" segments globally.
 */
export class SpeakerIdentifier {
  private youName = 'You';
  private defaultOtherName = 'Speaker';
  private participants: string[] = []; // Pre-set participant names
  private segmentOverrides: Map<string, string> = new Map(); // segmentId → custom name
  private lastOtherName: string | null = null; // Track last assigned "other" name
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
   * First participant becomes the default "other" name.
   * All are stored for reference.
   */
  setParticipants(participantList: string): void {
    this.participants = participantList
      .split(/[,;]/)
      .map(p => p.replace(/\(.*?\)/g, '').trim())
      .filter(p => p.length > 0);

    // Use first participant as default other name
    if (this.participants.length > 0) {
      this.defaultOtherName = this.participants[0];
      this.lastOtherName = this.participants[0];
    }
  }

  /**
   * Process a segment — assign speaker name.
   */
  processSegment(segment: TranscriptSegment): TranscriptSegment {
    // Check for per-segment override
    const override = this.segmentOverrides.get(segment.id);
    if (override) {
      return { ...segment, speakerName: override };
    }

    // "You" is always from mic
    if (segment.speaker === 'you') {
      return { ...segment, speakerName: this.youName };
    }

    // Try to detect a name introduction
    const detectedName = this.detectName(segment.text);
    if (detectedName) {
      this.lastOtherName = detectedName;
      // Add to participants if new
      if (!this.participants.includes(detectedName)) {
        this.participants.push(detectedName);
      }
    }

    // Use last known other name or default
    const name = this.lastOtherName ?? this.defaultOtherName;
    return { ...segment, speakerName: name };
  }

  /**
   * Rename a specific segment (and optionally consecutive segments).
   * This does NOT rename ALL "other" segments — only the targeted ones.
   */
  renameSegment(segmentId: string, newName: string): void {
    this.segmentOverrides.set(segmentId, newName);
    // Track this as the current speaker so future segments use this name
    this.lastOtherName = newName;
    // Add to participants if new
    if (!this.participants.includes(newName)) {
      this.participants.push(newName);
    }
  }

  /**
   * Rename a speaker by source ('you' or 'other').
   * For 'other', this sets the DEFAULT name for future segments
   * but does NOT retroactively rename all past segments.
   */
  renameSpeaker(source: 'you' | 'other', name: string): void {
    if (source === 'you') {
      this.youName = name;
    } else {
      this.defaultOtherName = name;
      this.lastOtherName = name;
    }
  }

  /**
   * Set name for legacy compatibility
   */
  setName(source: 'you' | 'other', name: string): void {
    this.renameSpeaker(source, name);
  }

  /**
   * Get current state
   */
  getNames(): Record<string, string> {
    return {
      you: this.youName,
      other: this.lastOtherName ?? this.defaultOtherName,
      participants: this.participants.join(', '),
    };
  }

  /**
   * Get list of known participants
   */
  getParticipants(): string[] {
    return [...this.participants];
  }

  /**
   * Detect a name from an introduction phrase
   */
  private detectName(text: string): string | null {
    for (const pattern of this.introPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        if (name.length >= 2 && name.length <= 15 && /^[A-Z]/.test(name)) {
          const falsePositives = ['The', 'This', 'That', 'Here', 'There', 'Just', 'Well', 'Also', 'Actually'];
          if (!falsePositives.includes(name)) {
            return name;
          }
        }
      }
    }
    return null;
  }
}
