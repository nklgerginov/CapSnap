import { useState, useCallback, useRef } from 'react';
import { SubtitleBlock } from '../types';

export function useSubtitleHistory(initialBlocks: SubtitleBlock[] = []) {
  const [past, setPast] = useState<SubtitleBlock[][]>([]);
  const [present, setPresent] = useState<SubtitleBlock[]>(initialBlocks);
  const [future, setFuture] = useState<SubtitleBlock[][]>([]);

  const presentRef = useRef<SubtitleBlock[]>(present);
  presentRef.current = present;

  const pastRef = useRef<SubtitleBlock[][]>(past);
  pastRef.current = past;

  const futureRef = useRef<SubtitleBlock[][]>(future);
  futureRef.current = future;

  const lastUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isBatchingRef = useRef<boolean>(false);

  // Update blocks with optional history tracking configuration
  const updateBlocks = useCallback(
    (
      action: SubtitleBlock[] | ((prev: SubtitleBlock[]) => SubtitleBlock[]),
      options?: { skipHistory?: boolean; isContinuous?: boolean }
    ) => {
      const currentBlocks = presentRef.current;
      const nextBlocks = typeof action === 'function' ? action(currentBlocks) : action;

      if (nextBlocks === currentBlocks) return;

      if (!options?.skipHistory) {
        if (options?.isContinuous) {
          // For continuous operations like dragging/resizing, capture initial state when continuous motion starts
          if (!isBatchingRef.current) {
            isBatchingRef.current = true;
            setPast(prevPast => [...prevPast.slice(-49), currentBlocks]);
            setFuture([]);
          }
          if (lastUpdateTimeoutRef.current) clearTimeout(lastUpdateTimeoutRef.current);
          lastUpdateTimeoutRef.current = setTimeout(() => {
            isBatchingRef.current = false;
          }, 400);
        } else {
          // Discrete edit (split, merge, delete, add, update, auto-snap, highlight)
          isBatchingRef.current = false;
          if (lastUpdateTimeoutRef.current) clearTimeout(lastUpdateTimeoutRef.current);
          setPast(prevPast => [...prevPast.slice(-49), currentBlocks]);
          setFuture([]);
        }
      }

      setPresent(nextBlocks);
    },
    []
  );

  // Reset history stack (for initial video load, AI re-transcription, transcript auto-align)
  const resetBlocks = useCallback((newBlocks: SubtitleBlock[]) => {
    if (lastUpdateTimeoutRef.current) clearTimeout(lastUpdateTimeoutRef.current);
    isBatchingRef.current = false;
    setPast([]);
    setPresent(newBlocks);
    setFuture([]);
  }, []);

  // Undo operation
  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;

    const previous = pastRef.current[pastRef.current.length - 1];
    const newPast = pastRef.current.slice(0, pastRef.current.length - 1);
    const current = presentRef.current;

    setPast(newPast);
    setPresent(previous);
    setFuture(prevFuture => [current, ...prevFuture]);
  }, []);

  // Redo operation
  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;

    const next = futureRef.current[0];
    const newFuture = futureRef.current.slice(1);
    const current = presentRef.current;

    setPast(prevPast => [...prevPast, current]);
    setPresent(next);
    setFuture(newFuture);
  }, []);

  return {
    blocks: present,
    setBlocks: updateBlocks,
    resetBlocks,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    historyLength: past.length,
    futureLength: future.length,
  };
}
