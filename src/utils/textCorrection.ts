import { SubtitleBlock, SubtitleWord } from '../types';

/**
 * Text Correction & Punctuation Cleanup Utility for Subtitles
 * 
 * Fixes common issues from AI speech recognition & manual inputs across multilingual scripts:
 * 1. Capitalizes the first letter of sentences (Latin, Cyrillic / Bulgarian, Greek, etc.)
 * 2. Capitalizes standalone 'i', 'i\'m', 'i\'ve', 'i\'ll', 'i\'d'
 * 3. Fixes punctuation spacing (removes spaces before punctuation, adds space after)
 * 4. Fixes broken contraction spacing (e.g., "do n't" -> "don't", "it 's" -> "it's")
 * 5. Cleans up repeated punctuation (e.g., ",," -> ",", "??" -> "?")
 * 6. Preserves word-level timing, highlights, speakers, and emojis.
 */

export interface CorrectionResult {
  updatedBlocks: SubtitleBlock[];
  stats: {
    capitalizedCount: number;
    punctuationFixedCount: number;
    totalWordsModified: number;
  };
}

const STANDALONE_I_REGEX = /^i(['’][a-z]+)?$/i;
const COMMON_ACRONYMS = new Set(['ai', 'api', 'ui', 'ux', 'tv', 'hd', '4k', 'id', 'url', 'usa', 'uk', 'ceo', 'cto', 'gop', 'dna', 'fyi', 'asap', 'faq', 'vip', 'diy', 'ok', 'bg', 'eu']);

/**
 * Corrects raw string text with proper sentence capitalization and punctuation spacing.
 */
export function correctRawSubtitleText(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;

  // 1. Fix detached contractions: "don 't" -> "don't", "it 's" -> "it's", "you 're" -> "you're"
  text = text.replace(/\b([\p{L}]+)\s+['’]\s*([\p{L}]+)\b/gu, "$1'$2");
  text = text.replace(/\b([\p{L}]+)\s+n['’]t\b/giu, "$1n't");

  // 2. Remove space before punctuation: "word ," -> "word,", "sentence ." -> "sentence."
  text = text.replace(/\s+([,.:;!?%])/gu, '$1');

  // 3. Ensure space after punctuation (unless end of text or followed by digit/quote)
  text = text.replace(/([,.:;!?])([\p{L}])/gu, '$1 $2');

  // 4. Clean up duplicate punctuation (e.g., ",," -> ",", "!!" -> "!")
  text = text.replace(/,{2,}/g, ',');
  text = text.replace(/;{2,}/g, ';');
  text = text.replace(/:{2,}/g, ':');
  text = text.replace(/!{2,}/g, '!');
  text = text.replace(/\?{2,}/g, '?');
  // Preserve valid ellipsis "..." but collapse 4+ dots
  text = text.replace(/\.{4,}/g, '...');
  text = text.replace(/(?<!\.)\.\.(?!\.)/g, '.');

  // 5. Remove multiple consecutive spaces
  text = text.replace(/[ \t]+/g, ' ').trim();

  // 6. Sentence capitalization: capitalize first letter of text and after . ! ? (multilingual Unicode letters)
  text = text.replace(/(^|[.!?]\s+)([\p{Ll}])/gu, (_match, prefix, letter) => {
    return prefix + letter.toUpperCase();
  });

  // 7. Capitalize standalone 'I' and contractions ('I'm', 'I've', 'I'll', 'I'd')
  text = text.replace(/\b(i)('m|'ve|'ll|'d)?\b/g, (_match, _i, suffix) => {
    return 'I' + (suffix || '');
  });

  // 8. Capitalize recognized common tech acronyms
  text = text.replace(/\b([\p{L}]{2,4})\b/giu, (match) => {
    if (COMMON_ACRONYMS.has(match.toLowerCase())) {
      return match.toUpperCase();
    }
    return match;
  });

  return text;
}

/**
 * Applies smart text corrections and punctuation fixes across SubtitleBlocks and SubtitleWords.
 */
export function correctSubtitleBlocks(blocks: SubtitleBlock[]): CorrectionResult {
  if (!blocks || blocks.length === 0) {
    return {
      updatedBlocks: [],
      stats: { capitalizedCount: 0, punctuationFixedCount: 0, totalWordsModified: 0 },
    };
  }

  let capitalizedCount = 0;
  let punctuationFixedCount = 0;
  let totalWordsModified = 0;

  let shouldCapitalizeNext = true;

  const updatedBlocks: SubtitleBlock[] = blocks.map((block) => {
    const updatedWords: SubtitleWord[] = block.words.map((word) => {
      let original = word.text.trim();
      let text = original;

      // 1. Fix detached apostrophes in the word token (e.g. "don 't" or " 's ")
      if (/['’]/.test(text)) {
        const cleanedApostrophe = text.replace(/\s*['’]\s*/g, "'");
        if (cleanedApostrophe !== text) {
          text = cleanedApostrophe;
          punctuationFixedCount++;
        }
      }

      // 2. Remove leading punctuation spaces or unwanted punctuation duplicates
      const cleanedPunct = text
        .replace(/,{2,}/g, ',')
        .replace(/!{2,}/g, '!')
        .replace(/\?{2,}/g, '?')
        .replace(/(?<!\.)\.\.(?!\.)/g, '.');
      
      if (cleanedPunct !== text) {
        text = cleanedPunct;
        punctuationFixedCount++;
      }

      // 3. Fix standalone lowercase "i" or "i'm", "i've", "i'll", "i'd"
      if (STANDALONE_I_REGEX.test(text)) {
        text = 'I' + text.slice(1);
        capitalizedCount++;
      } else if (COMMON_ACRONYMS.has(text.toLowerCase().replace(/[^\p{L}]/gu, ''))) {
        // Acronym match e.g. "ai," -> "AI,"
        const punctMatch = text.match(/[^\p{L}]+$/u);
        const punct = punctMatch ? punctMatch[0] : '';
        const core = text.slice(0, text.length - punct.length);
        if (COMMON_ACRONYMS.has(core.toLowerCase()) && core !== core.toUpperCase()) {
          text = core.toUpperCase() + punct;
          capitalizedCount++;
        }
      }

      // 4. Check if this word starts a sentence (using Unicode letters \p{L})
      const firstAlphaMatch = text.match(/[\p{L}]/u);
      if (firstAlphaMatch && firstAlphaMatch.index !== undefined) {
        const firstAlphaIdx = firstAlphaMatch.index;
        const char = text[firstAlphaIdx];

        if (shouldCapitalizeNext && char === char.toLowerCase() && char !== char.toUpperCase()) {
          text = text.substring(0, firstAlphaIdx) + char.toUpperCase() + text.substring(firstAlphaIdx + 1);
          capitalizedCount++;
          shouldCapitalizeNext = false;
        } else if (char === char.toUpperCase()) {
          shouldCapitalizeNext = false;
        }
      }

      // 5. Determine if this word ends with sentence-terminating punctuation (. ! ?)
      if (/[.!?]$/.test(text.trim())) {
        shouldCapitalizeNext = true;
      }

      if (text !== original) {
        totalWordsModified++;
      }

      return {
        ...word,
        text,
      };
    });

    return {
      ...block,
      words: updatedWords,
    };
  });

  return {
    updatedBlocks,
    stats: {
      capitalizedCount,
      punctuationFixedCount,
      totalWordsModified,
    },
  };
}
