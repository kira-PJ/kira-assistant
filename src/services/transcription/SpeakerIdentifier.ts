import { TranscriptSegment } from './types';

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
 * with the actual name instead of "Customer".
 */
export class SpeakerIdentifier {
  private speakerNames: Map<string, string> = new Map(); // source → name
  private introPatterns: RegExp[];

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
   * Process a segment and try to detect speaker names
   * Returns the segment with updated speakerName if detected
   */
  processSegment(segment: TranscriptSegment): TranscriptSegment {
    // Don't relabel "You" — that's always from the mic
    if (segment.speaker === 'you') {
      return { ...segment, speakerName: 'You' };
    }

    // Try to detect a name introduction in this segment
    const detectedName = this.detectName(segment.text);
    if (detectedName && segment.speaker === 'other') {
      this.speakerNames.set('other', detectedName);
    }

    // Apply known name
    const knownName = this.speakerNames.get(segment.speaker);
    if (knownName) {
      return { ...segment, speakerName: knownName };
    }

    return segment;
  }

  /**
   * Manually set a speaker name (from pre-call participants input)
   */
  setName(source: 'you' | 'other', name: string): void {
    this.speakerNames.set(source, name);
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
