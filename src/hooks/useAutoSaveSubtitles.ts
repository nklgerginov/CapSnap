import { useState, useEffect, useRef, useCallback } from 'react';
import { SubtitleBlock } from '../types';

const STORAGE_KEY = 'autocap_subtitle_blocks_autosave';
const STORAGE_TIME_KEY = 'autocap_subtitle_blocks_autosave_time';

export function getAutoSavedBlocks(): SubtitleBlock[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as SubtitleBlock[];
    }
  } catch (err) {
    console.warn('Failed to parse auto-saved subtitle blocks from localStorage:', err);
  }
  return null;
}

export function getAutoSavedTimestamp(): string | null {
  try {
    return localStorage.getItem(STORAGE_TIME_KEY);
  } catch {
    return null;
  }
}

export function clearAutoSavedBlocks() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_TIME_KEY);
  } catch (err) {
    console.warn('Failed to clear auto-saved subtitle blocks from localStorage:', err);
  }
}

export function useAutoSaveSubtitles(blocks: SubtitleBlock[]) {
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(() => {
    const timeStr = getAutoSavedTimestamp();
    return timeStr ? new Date(timeStr) : null;
  });
  const [isSaved, setIsSaved] = useState<boolean>(true);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performSave = useCallback((blocksToSave: SubtitleBlock[]) => {
    try {
      if (blocksToSave && blocksToSave.length > 0) {
        const json = JSON.stringify(blocksToSave);
        localStorage.setItem(STORAGE_KEY, json);
        const now = new Date();
        localStorage.setItem(STORAGE_TIME_KEY, now.toISOString());
        setLastSavedAt(now);
        setIsSaved(true);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_TIME_KEY);
        setIsSaved(true);
      }
    } catch (err) {
      console.warn('Auto-save to localStorage failed:', err);
    }
  }, []);

  // Periodic / debounced auto-save on blocks mutation
  useEffect(() => {
    if (!blocks || blocks.length === 0) return;

    setIsSaved(false);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save by 500ms
    saveTimeoutRef.current = setTimeout(() => {
      performSave(blocks);
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [blocks, performSave]);

  // Flush save synchronously before tab unload/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (blocks && blocks.length > 0) {
        performSave(blocks);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [blocks, performSave]);

  return {
    lastSavedAt,
    isSaved,
    clearAutoSave: clearAutoSavedBlocks,
    forceSaveNow: () => performSave(blocks),
  };
}
