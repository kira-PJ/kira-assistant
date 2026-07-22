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
    // Self-introduction patterns
    this.introPatterns = [
      /(?:(?:hi|hey|hello|good morning|good afternoon),?\s*)?(?:I'm|I am|my name is|this is|it's)\s+([A-Z][a-z]+)/i,
      /(?:hi|hey|hello),?\s*([A-Z][a-z]+)\s+here/i,
      /(?:this is|it's|I'm)\s+([A-Z][a-z]+)\s+(?:from|at|with)/i,
      /(?:let me introduce myself,?\s*)?(?:I'm|I am)\s+([A-Z][a-z]+)/i,
    ];

    // Context patterns — detecting names mentioned by others
    // "let Timothy answer", "Kevin has a question", "thank you Timothy"
    this.contextPatterns = [
      /\b(?:let|let me let|I'll let|over to)\s+([A-Z][a-z]+)\s+(?:answer|explain|respond|take|handle|go ahead|speak)/i,
      /\b(?:thank you|thanks),?\s+([A-Z][a-z]+)/i,
      /\b([A-Z][a-z]+),?\s+(?:please go ahead|go ahead|over to you|your turn|you can|please)/i,
      /\b([A-Z][a-z]+)\s+(?:has a question|asked|is asking|wants to know|would like)/i,
      /\b(?:welcome|hi|hey|hello),?\s+([A-Z][a-z]+)/i,
      /\b(?:yes|yeah),?\s+([A-Z][a-z]+)/i,
      /\b([A-Z][a-z]+)\s+(?:will be|is going to|can|could|would)\s+(?:share|answer|explain|take|present)/i,
      /\b(?:so|ok|right),?\s+([A-Z][a-z]+),?\s/i,
    ];
  }

  private contextPatterns: RegExp[];

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
   * Also detects names from conversational context:
   * - Self-introductions ("I'm Timothy")
   * - References ("let Timothy answer", "thank you Kevin")
   * - Handoffs ("over to you Timothy" → next speaker = Timothy)
   */
  processSegment(segment: TranscriptSegment): TranscriptSegment {
    // Per-segment override (manual edit)
    const override = this.segmentOverrides.get(segment.id);
    if (override) {
      return { ...segment, speakerName: override };
    }

    // Mic = always you
    if (segment.speaker === 'you') {
      return { ...segment, speakerName: this.youName };
    }

    // If this speaker ID was renamed by user, apply that name
    if (this.pendingNextSpeaker && segment.speaker !== this.lastSpeakerId) {
      // Only apply if user explicitly set this via chat command
      // (pendingNextSpeaker is now only set from user input, not auto-detection)
      this.speakerIdNames.set(segment.speaker, this.pendingNextSpeaker);
      if (!this.participants.includes(this.pendingNextSpeaker)) {
        this.participants.push(this.pendingNextSpeaker);
      }
      this.pendingNextSpeaker = null;
    }

    // Check if this speaker ID has been named already (by user via chat/click)
    const namedSpeaker = this.speakerIdNames.get(segment.speaker);
    if (namedSpeaker) {
      this.lastSpeakerId = segment.speaker;
      return { ...segment, speakerName: namedSpeaker };
    }

    // Auto name detection DISABLED — was creating false names like "Snowflake", "Fabric"
    // Speaker naming is now ONLY via:
    // 1. User chat: "Speaker 1 is Michael"
    // 2. User clicking name in transcript
    // 3. Pre-call participant list

    this.lastSpeakerId = segment.speaker;

    // Use Transcribe's speaker label if present
    if (segment.speakerName && segment.speakerName.startsWith('Speaker ')) {
      return segment;
    }

    return { ...segment, speakerName: this.defaultOtherName };
  }

  private lastSpeakerId: string | null = null;
  private pendingNextSpeaker: string | null = null;

  /**
   * Detect names referenced in context (handoffs, thank-yous, etc.)
   * When "let Timothy answer" is detected, mark Timothy as the next speaker.
   */
  private detectContextNames(text: string): void {
    for (const pattern of this.contextPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        if (this.isValidName(name)) {
          // This name was referenced — the next different speaker is likely this person
          this.pendingNextSpeaker = name;
          if (!this.participants.includes(name)) {
            this.participants.push(name);
          }
        }
      }
    }
  }

  /**
   * Try to match a pre-set participant name in the text
   */
  private matchParticipantFromText(text: string): string | null {
    for (const p of this.participants) {
      if (text.toLowerCase().includes(p.toLowerCase())) {
        return p;
      }
    }
    return null;
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

  private detectSelfIntro(text: string): string | null {
    for (const pattern of this.introPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        if (this.isValidName(name)) return name;
      }
    }
    return null;
  }

  private isValidName(name: string): boolean {
    if (name.length < 2 || name.length > 15) return false;
    if (!/^[A-Z]/.test(name)) return false;
    const falsePositives = new Set([
      'The', 'This', 'That', 'Here', 'There', 'Just', 'Well', 'Also',
      'Actually', 'So', 'Now', 'Then', 'Right', 'Sure', 'Yes', 'Yeah',
      'Like', 'Very', 'Much', 'Good', 'Great', 'Nice', 'Fine', 'Thanks',
      'Thank', 'Please', 'Sorry', 'What', 'How', 'Why', 'When', 'Where',
      'Which', 'Who', 'Basically', 'Obviously', 'Absolutely', 'Definitely',
    ]);
    return !falsePositives.has(name);
  }
}
