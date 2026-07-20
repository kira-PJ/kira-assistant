import { TranscriptSegment } from './types';

/**
 * Default speaker labels per call type.
 * The "other" name is used when no participant name is given or detected.
 */
const SPEAKER_LABELS: Record<string, { you: string; other: string }> = {
  discovery: { you: 'You', other: 'Customer' },
  demo: { you: 'You (Presenter)', other: 'Attendee' },
  training: { you: 'You', other: 'Trainer' },
  technical: { you: 'You', other: 'Peer' },
  followup: { you: 'You', other: 'Customer' },
  negotiation: { you: 'You', other: 'Counterpart' },
};

/**
 * SpeakerIdentifier - Detects speaker names from introductions
 *
 * Listens for patterns like:
 * - "Hi, I'm Moses"
 * - "My name is Sarah"
 * - "This is John speaking"
 * - "Hey everyone, Moses here"
 *
 * Once detected, relabels future segments from that source
 * with the actual name instead of the default label.
 *
 * Default labels change based on call type:
 * - training: "Trainer" / "You"
 * - discovery: "Customer" / "You"
 * - demo: "Attendee" / "You (Presenter)"
 */
export class SpeakerIdentifier {
  private speakerNames: Map<string, string> = new Map(); // source → name
  private introPatterns: RegExp[];
  private callType: string = 'discovery';
  private myRole: 'leading' | 'attending' = 'leading';

  constructor() {
    this.introPatterns = [
      /(?:(?:hi|hey|hello|good morning|good afternoon),?\s*)?(?:I'm|I am|my name is|this is|it's)\s+([A-Z][a-z]+)/i,
      /(?:hi|hey|hello),?\s*([A-Z][a-z]+)\s+here/i,
      /(?:this is|it's|I'm)\s+([A-Z][a-z]+)\s+(?:from|at|with)/i,
      /(?:let me introduce myself,?\s*)?(?:I'm|I am)\s+([A-Z][a-z]+)/i,
    ];

    // Default: mic is always "You"
    this.speakerNames.set('mic', 'You');
  }

  /**
   * Set call type to adjust default speaker labels.
   * When myRole='attending' and type='training', the other person is the Trainer.
   * When myRole='leading' and type='training', you are the trainer.
   */
  setCallType(type: string, myRole?: 'leading' | 'attending'): void {
    this.callType = type;
    if (myRole) this.myRole = myRole;

    // Apply role-aware defaults unless a custom name was already set via setName
    const labels = SPEAKER_LABELS[type] ?? SPEAKER_LABELS['discovery'];

    // For training, flip labels based on who is leading
    if (type === 'training') {
      if (this.myRole === 'attending') {
        // I'm attending: the other person is Trainer, I'm Student
        if (!this.speakerNames.has('other_custom')) this.speakerNames.set('other', 'Trainer');
        if (!this.speakerNames.has('you_custom')) this.speakerNames.set('you', 'You');
      } else {
        // I'm leading: I'm the trainer, other is Student
        if (!this.speakerNames.has('other_custom')) this.speakerNames.set('other', 'Student');
        if (!this.speakerNames.has('you_custom')) this.speakerNames.set('you', 'You (Trainer)');
      }
    } else if (type === 'demo') {
      if (this.myRole === 'leading') {
        if (!this.speakerNames.has('other_custom')) this.speakerNames.set('other', 'Attendee');
        if (!this.speakerNames.has('you_custom')) this.speakerNames.set('you', 'You (Presenter)');
      } else {
        if (!this.speakerNames.has('other_custom')) this.speakerNames.set('other', 'Presenter');
        if (!this.speakerNames.has('you_custom')) this.speakerNames.set('you', 'You');
      }
    } else {
      if (!this.speakerNames.has('other_custom')) this.speakerNames.set('other', labels.other);
    }
  }

  /**
   * Process a segment and try to detect speaker names
   * Returns the segment with updated speakerName if detected
   */
  processSegment(segment: TranscriptSegment): TranscriptSegment {
    // For "you" speaker, use known name (may be customized)
    if (segment.speaker === 'you') {
      const youName = this.speakerNames.get('you') ?? 'You';
      return { ...segment, speakerName: youName };
    }

    // Try to detect a name introduction in this segment
    const detectedName = this.detectName(segment.text);
    if (detectedName && segment.speaker === 'other') {
      this.speakerNames.set('other', detectedName);
    }

    // Apply known name, fall back to call-type default
    const knownName = this.speakerNames.get(segment.speaker);
    if (knownName) {
      return { ...segment, speakerName: knownName };
    }

    // Final fallback: use call-type default
    const labels = SPEAKER_LABELS[this.callType] ?? SPEAKER_LABELS['discovery'];
    return { ...segment, speakerName: labels.other };
  }

  /**
   * Manually set a speaker name (from pre-call participants input or real-time edit)
   */
  setName(source: 'you' | 'other', name: string): void {
    this.speakerNames.set(source, name);
    // Mark as custom so setCallType doesn't overwrite it
    if (source === 'other') this.speakerNames.set('other_custom', 'true');
    if (source === 'you') this.speakerNames.set('you_custom', 'true');
  }

  /**
   * Rename a speaker mid-session (triggered by UI edit).
   * Updates all future labels for that speaker source.
   */
  renameSpeaker(source: 'you' | 'other', newName: string): void {
    this.setName(source, newName);
  }

  /**
   * Get current speaker names
   */
  getNames(): Record<string, string> {
    return Object.fromEntries(this.speakerNames);
  }

  /**
   * Detect a name from an introduction phrase
   */
  private detectName(text: string): string | null {
    for (const pattern of this.introPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        // Sanity check — name should be 2-15 chars, start with uppercase
        if (name.length >= 2 && name.length <= 15 && /^[A-Z]/.test(name)) {
          // Filter out common false positives
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
