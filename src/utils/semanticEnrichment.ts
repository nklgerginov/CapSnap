import { SemanticCue, SubtitleBlock } from '../types';
import { getEmojiForWord, EMOJI_KEYWORD_MAP } from './emojiMap';
import { isKeyPhraseWord } from './smartHighlighter';

export interface SemanticEnrichmentResult {
  blocks: SubtitleBlock[];
  cues: SemanticCue[];
}

const CTA_WORDS = new Set(['buy', 'subscribe', 'follow', 'download', 'join', 'try', 'click', 'learn']);
const EMOJI_KEYWORDS = Object.keys(EMOJI_KEYWORD_MAP);
const BROLL_HINTS: Array<[RegExp, string]> = [
  [/\b(money|cash|profit|price|cost)\b/i, 'currency or product pricing'],
  [/\b(grow|growth|results|views|viral)\b/i, 'analytics or growth chart'],
  [/\b(fast|speed|quick)\b/i, 'speed or motion cutaway'],
];

function cue(
  type: SemanticCue['type'],
  blockIndex: number,
  wordIndex: number,
  start: number,
  end: number,
  label: string,
  payload?: string
): SemanticCue {
  return {
    id: `semantic-${type}-${blockIndex}-${wordIndex}`,
    type,
    start,
    end,
    label,
    payload,
    confidence: 0.8,
  };
}

/**
 * Adds editable semantic metadata without changing any word timestamps.
 * A future Gemini job can replace this heuristic implementation while keeping
 * the result contract stable for the timeline and renderer.
 */
export function enrichSubtitleSemantics(blocks: SubtitleBlock[]): SemanticEnrichmentResult {
  const cues: SemanticCue[] = [];
  blocks.forEach((block, blockIndex) => {
    block.words.forEach((word, wordIndex) => {
      const normalized = word.text.toLowerCase().replace(/[^\w$%]/g, '');
      if (isKeyPhraseWord(word.text)) {
        cues.push(cue('keyword', blockIndex, wordIndex, word.start, word.end, word.text));
      }
      const emoji = word.emoji || getEmojiForWord(word.text);
      if (emoji || EMOJI_KEYWORDS.some(keyword => normalized.includes(keyword))) {
        cues.push(cue('emoji', blockIndex, wordIndex, word.start, word.end, 'Emoji overlay', emoji));
      }
      if (CTA_WORDS.has(normalized)) {
        cues.push(cue('cta', blockIndex, wordIndex, word.start, word.end, `CTA: ${word.text}`));
      }
      const bRoll = BROLL_HINTS.find(([pattern]) => pattern.test(word.text));
      if (bRoll) {
        cues.push(cue('b_roll', blockIndex, wordIndex, word.start, word.end, 'B-roll suggestion', bRoll[1]));
      }
      if (word.isEmphasized) {
        cues.push(cue('sfx', blockIndex, wordIndex, word.start, word.end, 'Highlight sound effect', 'pop'));
      }
    });
  });
  return { blocks, cues };
}
