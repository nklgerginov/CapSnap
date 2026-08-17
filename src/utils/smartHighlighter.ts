import { SubtitleBlock, SubtitleWord } from '../types';

// High-impact power words that drive viewer retention in short-form content
const POWER_WORDS = new Set([
  'secret', 'viral', 'crazy', 'insane', 'stop', 'never', 'always', 'best', 'worst',
  'money', 'cash', 'profit', 'growth', 'hack', 'boost', 'danger', 'warning', 'proven',
  'results', 'magic', 'fast', 'quick', 'easy', 'simple', 'life', 'death', 'truth',
  'lie', 'win', 'lose', 'fail', 'rich', 'free', 'key', 'focus', 'smart', 'trend',
  'views', 'power', 'mistake', 'guaranteed', 'ultimate', 'massive', 'essential',
  'illegal', 'shortcut', 'strategy', 'trick', 'tip', 'hook', 'million', 'billion',
  'first', 'top', 'new', 'now', 'today', 'future', 'ai', 'god', 'king', 'rule',
  'law', 'trap', 'hidden', 'banned', 'shocking', 'exposed', 'unlocked', 'master'
]);

// Action & Hook Verbs/Question Words
const ACTION_WORDS = new Set([
  'how', 'why', 'what', 'stop', 'do', 'make', 'get', 'create', 'build', 'change',
  'transform', 'discover', 'unlock', 'generate', 'grow', 'double', 'triple', 'save',
  'avoid', 'watch', 'listen', 'learn', 'try', 'use', 'start'
]);

// Mood & Sentiment Keywords Mapping
export const MOOD_EMOJI_MAP: Record<string, { mood: 'hype' | 'happy' | 'dramatic' | 'shock' | 'inspirational' | 'warning' | 'curious'; emoji: string; color: string }> = {
  hype: { mood: 'hype', emoji: '🔥', color: '#FF3B30' },
  excited: { mood: 'hype', emoji: '⚡', color: '#FFE600' },
  happy: { mood: 'happy', emoji: '😄', color: '#22C55E' },
  positive: { mood: 'happy', emoji: '✨', color: '#06B6D4' },
  shock: { mood: 'shock', emoji: '😱', color: '#EC4899' },
  warning: { mood: 'warning', emoji: '⚠️', color: '#F97316' },
  dramatic: { mood: 'dramatic', emoji: '💥', color: '#A855F7' },
  inspirational: { mood: 'inspirational', emoji: '🚀', color: '#3B82F6' },
  curious: { mood: 'curious', emoji: '🤔', color: '#EAB308' },
};

// Color Presets for Smart Auto-Captions
export const HIGHLIGHT_COLOR_PRESETS = [
  { id: 'gold', name: 'Electric Gold', hex: '#FFE600', badgeClass: 'bg-amber-400 text-slate-950' },
  { id: 'neon_green', name: 'Neon Green', hex: '#22C55E', badgeClass: 'bg-green-500 text-slate-950' },
  { id: 'hot_pink', name: 'Hot Pink', hex: '#EC4899', badgeClass: 'bg-pink-500 text-white' },
  { id: 'cyber_cyan', name: 'Cyber Cyan', hex: '#06B6D4', badgeClass: 'bg-cyan-400 text-slate-950' },
  { id: 'coral_orange', name: 'Coral Flame', hex: '#F97316', badgeClass: 'bg-orange-500 text-white' },
];

/**
 * Derives the emotional mood and suggested overlay emoji for a block based on its text and sentiment
 */
export function detectBlockMoodAndEmoji(text: string): { mood: SubtitleBlock['mood']; emoji?: string } {
  const lower = text.toLowerCase();

  if (/\b(warning|danger|mistake|fail|illegal|trap|stop|never|worst|banned|scam)\b/i.test(lower)) {
    return { mood: 'warning', emoji: '⚠️' };
  }
  if (/\b(crazy|insane|shocking|unbelievable|omg|mind|blown|wild|what|exposed)\b/i.test(lower)) {
    return { mood: 'shock', emoji: '😱' };
  }
  if (/\b(viral|fire|lit|crush|boost|double|growth|money|cash|rich|win|winner|huge|massive|10x)\b/i.test(lower)) {
    return { mood: 'hype', emoji: '🔥' };
  }
  if (/\b(secret|unlock|magic|hack|future|ai|proven|smart|master|strategy|unlocked)\b/i.test(lower)) {
    return { mood: 'inspirational', emoji: '🚀' };
  }
  if (/\b(how|why|question|wonder|truth|think|really|wait|secret|curious)\b/i.test(lower) || text.includes('?')) {
    return { mood: 'curious', emoji: '🤔' };
  }
  if (/\b(love|happy|best|easy|simple|awesome|great|clean|perfect|good|yes)\b/i.test(lower) || text.includes('!')) {
    return { mood: 'happy', emoji: '✨' };
  }
  if (/\b(power|focus|life|death|game|level|king|rule|law|fight|strong)\b/i.test(lower)) {
    return { mood: 'dramatic', emoji: '⚡' };
  }

  return { mood: 'neutral', emoji: undefined };
}

/**
  Check if a word text represents a key phrase / power word / number / currency
 */
export function isKeyPhraseWord(text: string): boolean {
  const clean = text.toLowerCase().replace(/[^a-z0-9$%]/g, '');
  if (!clean) return false;

  // 1. Numbers, Currency, Multipliers or Percentages ($100, 10x, 50%, #1, 100k)
  if (/[\d$%#]|^\d+x?$/i.test(text) || /\d/.test(clean)) return true;

  // 2. Power words & Retention triggers
  if (POWER_WORDS.has(clean)) return true;

  // 3. Action verbs
  if (ACTION_WORDS.has(clean)) return true;

  // 4. All-Caps words (e.g. NOW, MUST, STOP)
  if (text.length >= 2 && text === text.toUpperCase() && /[A-Z]/.test(text)) return true;

  // 5. Exclamation / Question emphasis
  if (text.includes('!') || text.includes('?')) return true;

  return false;
}

/**
 * Smart Auto-Caption Highlighting Engine:
 * Scans subtitle blocks and automatically applies highlight colorOverrides & emphasis flags
 * to detected key phrases to optimize short-form video retention.
 */
export function applySmartAutoCaptionHighlights({
  blocks,
  highlightColor = '#FFE600',
  forceAtLeastOnePerBlock = true,
}: {
  blocks: SubtitleBlock[];
  highlightColor?: string;
  forceAtLeastOnePerBlock?: boolean;
}): SubtitleBlock[] {
  return blocks.map(block => {
    let hasHighlightedWord = false;

    // First pass: identify key phrase matches
    const newWords = block.words.map(w => {
      const isKey = isKeyPhraseWord(w.text);
      if (isKey) {
        hasHighlightedWord = true;
        return {
          ...w,
          isEmphasized: true,
          colorOverride: highlightColor,
        };
      }
      return {
        ...w,
        // Preserve existing colorOverride if present, else clear
        isEmphasized: false,
        colorOverride: undefined,
      };
    });

    // Fallback pass: if no key phrases detected in this block, highlight the longest/most prominent word
    if (forceAtLeastOnePerBlock && !hasHighlightedWord && newWords.length > 0) {
      // Find index of word with longest clean text (excluding small stop words)
      let bestIdx = 0;
      let maxLen = 0;
      newWords.forEach((w, idx) => {
        const cleanLen = w.text.replace(/[^a-zA-Z0-9]/g, '').length;
        if (cleanLen > maxLen) {
          maxLen = cleanLen;
          bestIdx = idx;
        }
      });

      if (maxLen > 2) {
        newWords[bestIdx] = {
          ...newWords[bestIdx],
          isEmphasized: true,
          colorOverride: highlightColor,
        };
      }
    }

    const blockFullText = newWords.map(w => w.text).join(' ');
    const moodData = block.mood && block.suggestedEmoji ? { mood: block.mood, emoji: block.suggestedEmoji } : detectBlockMoodAndEmoji(blockFullText);

    return {
      ...block,
      words: newWords,
      mood: block.mood || moodData.mood,
      suggestedEmoji: block.suggestedEmoji || moodData.emoji,
    };
  });
}

/**
 * Remove all color overrides & emphasis flags from subtitle blocks
 */
export function clearSubtitleHighlights(blocks: SubtitleBlock[]): SubtitleBlock[] {
  return blocks.map(block => ({
    ...block,
    words: block.words.map(w => ({
      ...w,
      isEmphasized: false,
      colorOverride: undefined,
    })),
  }));
}
