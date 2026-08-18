import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'capsnap_free_ai_uses';

/** How many Gemini AI transcriptions a free-tier browser gets before CapSnap
 * Pro is required. Pro users (see useProStatus) bypass this limit entirely. */
export const FREE_AI_USE_LIMIT = 3;

interface AiUsageState {
  usedCount: number;
}

const DEFAULT_STATE: AiUsageState = { usedCount: 0 };

function readStoredState(): AiUsageState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    const usedCount = typeof parsed.usedCount === 'number' && parsed.usedCount >= 0 ? parsed.usedCount : 0;
    return { usedCount };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeStoredState(state: AiUsageState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable (private browsing, storage full, etc).
    // Usage tracking will still work for this session but won't persist.
  }
}

/**
 * Tracks how many of the FREE_AI_USE_LIMIT free Gemini AI transcriptions
 * this browser has used, persisted via localStorage (soft client-side
 * tracking — consistent with the rest of this fully client-side app; not a
 * hard server-enforced quota).
 *
 * Call `consumeUse()` immediately before making a paid Gemini AI
 * transcription call. It returns `true` and decrements the remaining count
 * if a free use was available, or `false` if the limit has been reached
 * (caller should fall back to offline transcription and/or prompt upgrade).
 * Callers should check `isPro` from useProStatus first and skip this check
 * entirely for Pro users, who have unlimited AI transcriptions.
 */
export function useAiUsage() {
  const [state, setState] = useState<AiUsageState>(() => readStoredState());

  // Keep usage in sync across tabs.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setState(readStoredState());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const usesRemaining = Math.max(0, FREE_AI_USE_LIMIT - state.usedCount);
  const hasUsesRemaining = usesRemaining > 0;

  const consumeUse = useCallback((): boolean => {
    // Read fresh from storage rather than trusting React state, in case
    // another tab consumed a use since our last render.
    const current = readStoredState();
    if (current.usedCount >= FREE_AI_USE_LIMIT) {
      setState(current);
      return false;
    }
    const next: AiUsageState = { usedCount: current.usedCount + 1 };
    writeStoredState(next);
    setState(next);
    return true;
  }, []);

  const resetUsage = useCallback(() => {
    writeStoredState(DEFAULT_STATE);
    setState(DEFAULT_STATE);
  }, []);

  return { usesRemaining, hasUsesRemaining, consumeUse, resetUsage };
}
