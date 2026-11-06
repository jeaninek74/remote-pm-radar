import { truncate } from './text';

export type Urgency = 'High' | 'Medium' | 'Low' | 'Unknown';

const EXPLICIT = [
  /urgently hiring/i,
  /hiring immediately/i,
  /immediate opening/i,
  /immediate start/i,
  /start (?:date )?(?:asap|immediately)/i,
  /asap start/i,
  /expedited hiring/i,
  /fast interview process/i,
  /quick start/i,
  /immediate placement/i,
  /contract start (?:needed|required)/i,
  /short[- ]term implementation need/i,
  /immediate need/i,
  /fill(?:ing)? (?:this|the) (?:role|position) (?:quickly|as soon as possible)/i,
  /multiple openings/i,
  /multiple positions/i,
  /high[- ]volume hiring/i,
];

export interface UrgencyVerdict {
  level: Urgency;
  evidence: string | null;
  confirmed: boolean;
}

function sentenceAround(text: string, index: number): string {
  const start = Math.max(0, text.lastIndexOf('.', index) + 1);
  const endOfSentence = text.indexOf('.', index);
  const end = endOfSentence === -1 ? Math.min(text.length, index + 160) : endOfSentence + 1;
  return truncate(text.slice(start, end).replace(/\s+/g, ' ').trim(), 180);
}

/**
 * Only explicit language in the posting counts as High. Recentness alone is
 * never treated as urgency, and inferred urgency is labelled as inferred.
 */
export function detectUrgency(description: string): UrgencyVerdict {
  if (!description || description.trim().length < 40) {
    return { level: 'Unknown', evidence: null, confirmed: false };
  }
  for (const pattern of EXPLICIT) {
    const match = pattern.exec(description);
    if (match) {
      return {
        level: 'High',
        evidence: `Posting states: "${sentenceAround(description, match.index)}"`,
        confirmed: true,
      };
    }
  }
  return { level: 'Low', evidence: null, confirmed: false };
}
