import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Scissors,
  Trash2,
  Clock,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  Zap,
  Target,
  CheckSquare,
  Square,
  MoveHorizontal,
  Layers,
  Plus,
  Combine,
  Magnet,
  Copy,
  Keyboard,
  BarChart3,
  Activity,
  Type,
  Play,
  Pause,
  X,
  Sparkles,
  Info,
  Undo2,
  Redo2,
} from 'lucide-react';
import { SubtitleBlock, VideoTransformSettings } from '../types';
import { computeAudioEnergyProfile, AudioEnergyProfile } from '../utils/audioAnalyzer';

interface TimelineEditorProps {
  blocks: SubtitleBlock[];
  currentTime: number;
  duration: number;
  waveform: number[];
  audioBuffer?: AudioBuffer | null;
  onSeek: (time: number) => void;
  onUpdateBlock: (updated: SubtitleBlock, options?: { isContinuous?: boolean }) => void;
  onUpdateBlocks?: (updated: SubtitleBlock[], options?: { isContinuous?: boolean }) => void;
  onDeleteBlock: (blockId: string) => void;
  onDeleteBlocks?: (blockIds: string[]) => void;
  onSplitBlock: (blockId: string, wordIndex: number) => void;
  onAddBlock?: (startTime: number) => void;
  onMergeBlocks?: (blockIds: string[]) => void;
  transform?: VideoTransformSettings;
  onChangeTransform?: (updated: Partial<VideoTransformSettings>) => void;
  onRefineAudioSync?: () => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

interface BlockDragInitialState {
  id: string;
  initialStart: number;
  initialEnd: number;
  initialWords: { id: string; start: number; end: number }[];
}

interface DragState {
  activeBlockId: string;
  mode: 'move' | 'resize-left' | 'resize-right';
  startX: number;
  initialBlocks: BlockDragInitialState[];
  timelineWidthPx: number;
}

interface MarqueeState {
  startX: number;
  currentX: number;
  startY: number;
  currentY: number;
}

type WaveformStyle = 'peaks' | 'spectrum' | 'solid';

export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  blocks,
  currentTime,
  duration,
  waveform,
  audioBuffer,
  onSeek,
  onUpdateBlock,
  onUpdateBlocks,
  onDeleteBlock,
  onDeleteBlocks,
  onSplitBlock,
  onAddBlock,
  onMergeBlocks,
  transform,
  onRefineAudioSync,
  videoRef,
  isPlaying,
  onTogglePlay,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const [zoomLevel, setZoomLevel] = useState(1); // 1x to 4x zoom
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [marqueeState, setMarqueeState] = useState<MarqueeState | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [displayTime, setDisplayTime] = useState<number>(currentTime);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [waveformStyle, setWaveformStyle] = useState<WaveformStyle>('peaks');
  const [showWordPills, setShowWordPills] = useState<boolean>(true);
  const [magnetEnabled, setMagnetEnabled] = useState<boolean>(true);
  const [snapGuideX, setSnapGuideX] = useState<number | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);

  const timelineRef = useRef<HTMLDivElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Compute Audio Speech Profile for speech energy background highlighting
  const audioProfile = useMemo<AudioEnergyProfile | null>(() => {
    if (!audioBuffer) return null;
    try {
      return computeAudioEnergyProfile(audioBuffer);
    } catch {
      return null;
    }
  }, [audioBuffer]);

  // Throttled requestAnimationFrame loop for fluid playhead updates without React state thrashing
  useEffect(() => {
    let lastTime = 0;
    const updateLoop = () => {
      if (videoRef?.current && !videoRef.current.paused) {
        const now = videoRef.current.currentTime;
        if (Math.abs(now - lastTime) >= 0.08) {
          lastTime = now;
          setDisplayTime(now);
        }
      }
      animFrameRef.current = requestAnimationFrame(updateLoop);
    };

    animFrameRef.current = requestAnimationFrame(updateLoop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [videoRef, isPlaying]);

  // Keep displayTime synced when currentTime prop changes from external seeks or pauses
  useEffect(() => {
    if (!videoRef?.current || videoRef.current.paused) {
      setDisplayTime(currentTime);
    }
  }, [currentTime, videoRef]);

  const safeDuration = Math.max(0.1, duration || 10);
  const progressPercent = Math.min(100, Math.max(0, (displayTime / safeDuration) * 100));

  const trimStartPct = transform?.trimStart ? (transform.trimStart / safeDuration) * 100 : 0;
  const trimEndPct = transform?.trimEnd ? (transform.trimEnd / safeDuration) * 100 : 100;

  // High-precision seek execution
  const executeSeek = useCallback((targetTime: number) => {
    const safeTime = Math.max(0, Math.min(safeDuration, targetTime));
    if (videoRef?.current) {
      videoRef.current.currentTime = safeTime;
    }
    setDisplayTime(safeTime);
    onSeek(safeTime);
  }, [safeDuration, videoRef, onSeek]);

  // Keyboard Navigation Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if (e.key === ' ') {
        e.preventDefault();
        onTogglePlay?.();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedBlockIds.length > 0) {
          e.preventDefault();
          if (onDeleteBlocks) {
            onDeleteBlocks(selectedBlockIds);
          } else {
            selectedBlockIds.forEach(id => onDeleteBlock(id));
          }
          setSelectedBlockIds([]);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedBlockIds(blocks.map(b => b.id));
      } else if (e.key === 'Escape') {
        setSelectedBlockIds([]);
        setShowShortcutsModal(false);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const delta = e.shiftKey ? -0.5 : -0.1;
        if (selectedBlockIds.length > 0) {
          handleNudgeSelected(delta);
        } else {
          executeSeek(displayTime + delta);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const delta = e.shiftKey ? 0.5 : 0.1;
        if (selectedBlockIds.length > 0) {
          handleNudgeSelected(delta);
        } else {
          executeSeek(displayTime + delta);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBlockIds, blocks, displayTime, executeSeek, onDeleteBlock, onDeleteBlocks, onTogglePlay]);

  // Render High-Precision Waveform & Time Ruler onto Canvas
  const drawWaveform = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parentWidth = timelineRef.current?.clientWidth || 800;
    const height = 64; // 64px height (ruler + waveform)
    const dpr = window.devicePixelRatio || 1;

    canvas.width = parentWidth * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, parentWidth, height);

    // 1. Draw Time Ruler Tick Marks at top (16px high)
    const rulerHeight = 16;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(0, 0, parentWidth, rulerHeight);

    ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerHeight);
    ctx.lineTo(parentWidth, rulerHeight);
    ctx.stroke();

    // Determine tick interval based on zoom and duration
    let tickIntervalSec = 5;
    if (zoomLevel >= 3) tickIntervalSec = 0.5;
    else if (zoomLevel >= 2) tickIntervalSec = 1;
    else if (zoomLevel >= 1.5) tickIntervalSec = 2;

    const totalTicks = Math.floor(safeDuration / tickIntervalSec);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';

    for (let t = 0; t <= totalTicks; t++) {
      const timeSec = t * tickIntervalSec;
      const x = (timeSec / safeDuration) * parentWidth;

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.beginPath();
      ctx.moveTo(x, rulerHeight - 6);
      ctx.lineTo(x, rulerHeight);
      ctx.stroke();

      // Format timestamp MM:SS
      const mins = Math.floor(timeSec / 60);
      const secs = Math.floor(timeSec % 60);
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      ctx.fillText(timeStr, x, rulerHeight - 7);
    }

    // 2. Draw Speech Energy Background Bands (if available)
    const waveYTop = rulerHeight + 2;
    const waveH = height - waveYTop;

    if (audioProfile && audioProfile.speechIntervals.length > 0) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.08)'; // Subtle emerald glow for speech
      for (const interval of audioProfile.speechIntervals) {
        const startX = (interval.start / safeDuration) * parentWidth;
        const endX = (interval.end / safeDuration) * parentWidth;
        ctx.fillRect(startX, waveYTop, Math.max(2, endX - startX), waveH);
      }
    }

    if (!waveform || waveform.length === 0) {
      // Fallback baseline
      ctx.fillStyle = 'rgba(51, 65, 85, 0.5)';
      ctx.fillRect(0, waveYTop + waveH / 2 - 1, parentWidth, 2);
      return;
    }

    // 3. Render Waveform Bars
    const totalBars = waveform.length;
    const barWidth = parentWidth / totalBars;
    const gap = Math.max(0.2, barWidth * 0.15);
    const actualBarW = Math.max(1, barWidth - gap);

    const progressRatio = displayTime / safeDuration;

    for (let i = 0; i < totalBars; i++) {
      const amp = waveform[i];
      const x = i * barWidth;
      const isPlayed = i / totalBars <= progressRatio;

      if (waveformStyle === 'spectrum') {
        // Mirrored spectrum
        const barH = Math.max(2, amp * (waveH - 8));
        const y = waveYTop + (waveH - barH) / 2;

        if (isPlayed) {
          const grad = ctx.createLinearGradient(0, y, 0, y + barH);
          grad.addColorStop(0, '#fef08a');
          grad.addColorStop(0.5, '#f59e0b');
          grad.addColorStop(1, '#d97706');
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.45)';
        }

        ctx.fillRect(x, y, actualBarW, barH);
      } else if (waveformStyle === 'solid') {
        // Solid block bars
        const barH = Math.max(3, amp * (waveH - 6));
        const y = waveYTop + waveH - barH;

        if (isPlayed) {
          ctx.fillStyle = '#f59e0b';
        } else {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
        }

        ctx.fillRect(x, y, actualBarW, barH);
      } else {
        // Default "peaks" gradient bars
        const barH = Math.max(2, amp * (waveH - 6));
        const y = waveYTop + (waveH - barH) / 2;

        if (isPlayed) {
          const grad = ctx.createLinearGradient(0, y, 0, y + barH);
          grad.addColorStop(0, '#fde047');
          grad.addColorStop(0.5, '#f59e0b');
          grad.addColorStop(1, '#b45309');
          ctx.fillStyle = grad;
        } else {
          const grad = ctx.createLinearGradient(0, y, 0, y + barH);
          grad.addColorStop(0, 'rgba(251, 191, 36, 0.6)');
          grad.addColorStop(1, 'rgba(180, 83, 9, 0.25)');
          ctx.fillStyle = grad;
        }

        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, actualBarW, barH, 1.5);
        } else {
          ctx.rect(x, y, actualBarW, barH);
        }
        ctx.fill();
      }
    }
  }, [waveform, zoomLevel, displayTime, safeDuration, waveformStyle, audioProfile]);

  useEffect(() => {
    drawWaveform();
    window.addEventListener('resize', drawWaveform);
    return () => window.removeEventListener('resize', drawWaveform);
  }, [drawWaveform]);

  // Selection Management
  const handleSelectBlock = (blockId: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;

    if (isMulti) {
      setSelectedBlockIds(prev =>
        prev.includes(blockId) ? prev.filter(id => id !== blockId) : [...prev, blockId]
      );
    } else {
      setSelectedBlockIds([blockId]);
    }

    const clickedBlock = blocks.find(b => b.id === blockId);
    if (clickedBlock) {
      executeSeek(clickedBlock.start);
    }
  };

  const handleSelectAll = () => {
    setSelectedBlockIds(blocks.map(b => b.id));
  };

  const handleDeselectAll = () => {
    setSelectedBlockIds([]);
  };

  const handleDeleteSelected = () => {
    if (selectedBlockIds.length === 0) return;
    if (onDeleteBlocks) {
      onDeleteBlocks(selectedBlockIds);
    } else {
      selectedBlockIds.forEach(id => onDeleteBlock(id));
    }
    setSelectedBlockIds([]);
  };

  const handleMergeSelected = () => {
    if (selectedBlockIds.length < 2) return;
    if (onMergeBlocks) {
      onMergeBlocks(selectedBlockIds);
      setSelectedBlockIds([]);
    }
  };

  // Nudge selected block(s)
  const handleNudgeSelected = (deltaSec: number) => {
    if (selectedBlockIds.length === 0) return;
    const targetBlocks = blocks.filter(b => selectedBlockIds.includes(b.id));

    let shift = deltaSec;
    for (const b of targetBlocks) {
      const dur = b.end - b.start;
      if (b.start + shift < 0) shift = -b.start;
      if (b.start + shift + dur > safeDuration) shift = safeDuration - (b.start + dur);
    }

    const updatedBlocks: SubtitleBlock[] = targetBlocks.map(b => {
      const newStart = Math.max(0, b.start + shift);
      const newEnd = newStart + (b.end - b.start);
      const words = b.words.map(w => ({
        ...w,
        start: Number(Math.max(0, w.start + shift).toFixed(3)),
        end: Number(Math.max(0, w.end + shift).toFixed(3)),
      }));

      return {
        ...b,
        start: Number(newStart.toFixed(3)),
        end: Number(newEnd.toFixed(3)),
        words,
      };
    });

    if (onUpdateBlocks) {
      onUpdateBlocks(updatedBlocks);
    } else {
      updatedBlocks.forEach(onUpdateBlock);
    }
  };

  // Duplicate Selected Blocks
  const handleDuplicateSelected = () => {
    if (selectedBlockIds.length === 0 || !onAddBlock) return;
    const selected = blocks.filter(b => selectedBlockIds.includes(b.id));
    selected.forEach(b => {
      const newStart = Math.min(safeDuration - 0.5, b.end + 0.1);
      onAddBlock(newStart);
    });
  };

  // Snap selected blocks to playhead
  const handleSnapSelectedToPlayhead = () => {
    if (selectedBlockIds.length === 0) return;
    const firstSelected = blocks.find(b => selectedBlockIds.includes(b.id));
    if (!firstSelected) return;

    const shift = displayTime - firstSelected.start;
    handleNudgeSelected(shift);
  };

  // Magnet Snap Helper
  const applyMagnetSnap = (targetTime: number, activeBlockId: string): { snappedTime: number; isSnapped: boolean } => {
    if (!magnetEnabled) return { snappedTime: targetTime, isSnapped: false };

    const snapThreshold = 0.12; // 120ms
    let bestTime = targetTime;
    let minDist = snapThreshold;
    let isSnapped = false;

    // 1. Snap to playhead
    const distToPlayhead = Math.abs(targetTime - displayTime);
    if (distToPlayhead < minDist) {
      minDist = distToPlayhead;
      bestTime = displayTime;
      isSnapped = true;
    }

    // 2. Snap to other blocks
    for (const b of blocks) {
      if (b.id === activeBlockId) continue;

      const distStart = Math.abs(targetTime - b.start);
      if (distStart < minDist) {
        minDist = distStart;
        bestTime = b.start;
        isSnapped = true;
      }

      const distEnd = Math.abs(targetTime - b.end);
      if (distEnd < minDist) {
        minDist = distEnd;
        bestTime = b.end;
        isSnapped = true;
      }
    }

    if (isSnapped && timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const xPx = (bestTime / safeDuration) * rect.width;
      setSnapGuideX(xPx);
    } else {
      setSnapGuideX(null);
    }

    return { snappedTime: bestTime, isSnapped };
  };

  // Mouse & Touch Drag Handlers for Single OR Multi-Block Move
  const handleStartDrag = (
    clientX: number,
    block: SubtitleBlock,
    mode: 'move' | 'resize-left' | 'resize-right',
    e: React.SyntheticEvent
  ) => {
    e.stopPropagation();
    if (!timelineRef.current) return;

    const isMultiKey = (e as React.MouseEvent).shiftKey || (e as React.MouseEvent).ctrlKey || (e as React.MouseEvent).metaKey;

    let groupIds = selectedBlockIds;
    if (!selectedBlockIds.includes(block.id)) {
      if (isMultiKey) {
        groupIds = [...selectedBlockIds, block.id];
        setSelectedBlockIds(groupIds);
      } else {
        groupIds = [block.id];
        setSelectedBlockIds([block.id]);
      }
    }

    const rect = timelineRef.current.getBoundingClientRect();

    const movingGroup = mode === 'move'
      ? blocks.filter(b => groupIds.includes(b.id))
      : [block];

    const initialBlocks: BlockDragInitialState[] = movingGroup.map(b => ({
      id: b.id,
      initialStart: b.start || 0,
      initialEnd: b.end || 0,
      initialWords: b.words.map(w => ({ id: w.id, start: w.start, end: w.end })),
    }));

    setDragState({
      activeBlockId: block.id,
      mode,
      startX: clientX,
      initialBlocks,
      timelineWidthPx: Math.max(1, rect.width),
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const processMove = (clientX: number) => {
      if (!dragState || !timelineRef.current) return;
      const deltaX = clientX - dragState.startX;
      let deltaTime = (deltaX / dragState.timelineWidthPx) * safeDuration;

      if (dragState.mode === 'move') {
        const leadInitB = dragState.initialBlocks.find(b => b.id === dragState.activeBlockId) || dragState.initialBlocks[0];
        const rawTargetStart = leadInitB.initialStart + deltaTime;

        const { snappedTime, isSnapped } = applyMagnetSnap(rawTargetStart, dragState.activeBlockId);
        if (isSnapped) {
          deltaTime = snappedTime - leadInitB.initialStart;
        } else {
          setSnapGuideX(null);
        }

        let minShift = -Infinity;
        let maxShift = Infinity;

        for (const initB of dragState.initialBlocks) {
          minShift = Math.max(minShift, -initB.initialStart);
          maxShift = Math.min(maxShift, safeDuration - initB.initialEnd);
        }

        const clampedDelta = Math.max(minShift, Math.min(maxShift, deltaTime));

        const updatedList: SubtitleBlock[] = dragState.initialBlocks.map(initB => {
          const targetBlock = blocks.find(b => b.id === initB.id);
          if (!targetBlock) return null;

          const newStart = initB.initialStart + clampedDelta;
          const newEnd = initB.initialEnd + clampedDelta;

          const updatedWords = targetBlock.words.map((w, idx) => {
            const orig = initB.initialWords[idx] || { start: w.start, end: w.end };
            return {
              ...w,
              start: Number(Math.max(0, orig.start + clampedDelta).toFixed(3)),
              end: Number(Math.max(0, orig.end + clampedDelta).toFixed(3)),
            };
          });

          return {
            ...targetBlock,
            start: Number(newStart.toFixed(3)),
            end: Number(newEnd.toFixed(3)),
            words: updatedWords,
          };
        }).filter((b): b is SubtitleBlock => b !== null);

        if (onUpdateBlocks) {
          onUpdateBlocks(updatedList, { isContinuous: true });
        } else {
          updatedList.forEach(b => onUpdateBlock(b, { isContinuous: true }));
        }
      } else {
        const initB = dragState.initialBlocks[0];
        const targetBlock = blocks.find(b => b.id === dragState.activeBlockId);
        if (!targetBlock || !initB) return;

        const oldDuration = Math.max(0.05, initB.initialEnd - initB.initialStart);

        if (dragState.mode === 'resize-left') {
          let rawStart = initB.initialStart + deltaTime;
          const { snappedTime } = applyMagnetSnap(rawStart, dragState.activeBlockId);
          let newStart = Math.max(0, Math.min(initB.initialEnd - 0.1, snappedTime));
          const newEnd = initB.initialEnd;

          const newDuration = newEnd - newStart;
          const ratio = newDuration / oldDuration;

          const updatedWords = targetBlock.words.map((w, idx) => {
            const orig = initB.initialWords[idx] || { start: w.start, end: w.end };
            const relStart = orig.start - initB.initialStart;
            const relEnd = orig.end - initB.initialStart;
            return {
              ...w,
              start: Number(Math.max(0, newStart + relStart * ratio).toFixed(3)),
              end: Number(Math.max(0, newStart + relEnd * ratio).toFixed(3)),
            };
          });

          onUpdateBlock({
            ...targetBlock,
            start: Number(newStart.toFixed(3)),
            end: Number(newEnd.toFixed(3)),
            words: updatedWords,
          }, { isContinuous: true });
        } else if (dragState.mode === 'resize-right') {
          const newStart = initB.initialStart;
          let rawEnd = initB.initialEnd + deltaTime;
          const { snappedTime } = applyMagnetSnap(rawEnd, dragState.activeBlockId);
          let newEnd = Math.max(initB.initialStart + 0.1, Math.min(safeDuration, snappedTime));

          const newDuration = newEnd - newStart;
          const ratio = newDuration / oldDuration;

          const updatedWords = targetBlock.words.map((w, idx) => {
            const orig = initB.initialWords[idx] || { start: w.start, end: w.end };
            const relStart = orig.start - initB.initialStart;
            const relEnd = orig.end - initB.initialStart;
            return {
              ...w,
              start: Number(Math.max(0, newStart + relStart * ratio).toFixed(3)),
              end: Number(Math.max(0, newStart + relEnd * ratio).toFixed(3)),
            };
          });

          onUpdateBlock({
            ...targetBlock,
            start: Number(newStart.toFixed(3)),
            end: Number(newEnd.toFixed(3)),
            words: updatedWords,
          }, { isContinuous: true });
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => processMove(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) processMove(e.touches[0].clientX);
    };
    const handleDragEnd = () => {
      setDragState(null);
      setSnapGuideX(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleDragEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [dragState, blocks, safeDuration, onUpdateBlock, onUpdateBlocks, magnetEnabled, displayTime]);

  // Marquee (Box Selection) Drag Handlers
  const handleContainerPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragState || !timelineRef.current) return;
    const targetTag = (e.target as HTMLElement).tagName.toLowerCase();
    if (targetTag === 'button' || targetTag === 'svg' || targetTag === 'path') return;

    const rect = timelineRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    // Check if clicked in top waveform area -> Seek video
    if (startY <= 64) {
      setIsScrubbing(true);
      const clickRatio = Math.max(0, Math.min(1, startX / rect.width));
      executeSeek(clickRatio * safeDuration);
      return;
    }

    // Otherwise start Marquee Box Select
    const isMultiKey = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!isMultiKey) {
      setSelectedBlockIds([]);
    }

    setMarqueeState({
      startX,
      currentX: startX,
      startY,
      currentY: startY,
    });
  };

  useEffect(() => {
    if (isScrubbing) {
      const handlePointerMove = (e: MouseEvent) => {
        if (!timelineRef.current) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickRatio = Math.max(0, Math.min(1, clickX / rect.width));
        executeSeek(clickRatio * safeDuration);
      };
      const handlePointerUp = () => setIsScrubbing(false);

      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);
      return () => {
        window.removeEventListener('mousemove', handlePointerMove);
        window.removeEventListener('mouseup', handlePointerUp);
      };
    }
  }, [isScrubbing, safeDuration, executeSeek]);

  useEffect(() => {
    if (!marqueeState || !timelineRef.current) return;

    const handleMarqueeMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const currentX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const currentY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

      setMarqueeState(prev => prev ? { ...prev, currentX, currentY } : null);

      // Compute intersected blocks
      const left = Math.min(marqueeState.startX, currentX);
      const right = Math.max(marqueeState.startX, currentX);
      const width = rect.width;

      const newlySelectedIds = blocks.filter(b => {
        const bLeft = (b.start / safeDuration) * width;
        const bRight = (b.end / safeDuration) * width;
        return bLeft <= right && bRight >= left;
      }).map(b => b.id);

      setSelectedBlockIds(newlySelectedIds);
    };

    const handleMarqueeEnd = () => {
      setMarqueeState(null);
    };

    window.addEventListener('mousemove', handleMarqueeMove);
    window.addEventListener('mouseup', handleMarqueeEnd);
    return () => {
      window.removeEventListener('mousemove', handleMarqueeMove);
      window.removeEventListener('mouseup', handleMarqueeEnd);
    };
  }, [marqueeState, blocks, safeDuration]);

  const selectedCount = selectedBlockIds.length;

  // Format Time Helper MM:SS.ms
  const formatTimecode = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(2);
    return `${m.toString().padStart(2, '0')}:${s.padStart(5, '0')}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-2xl select-none relative">
      {/* Timeline Controls Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
        {/* Left Toolbar Cluster */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Play / Pause Quick Button & Timecode Badge */}
          {onTogglePlay && (
            <button
              onClick={onTogglePlay}
              className="p-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow-md active:scale-95 flex items-center space-x-1"
              title="Play / Pause Video (Space)"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-slate-950" /> : <Play className="w-3.5 h-3.5 fill-slate-950" />}
            </button>
          )}

          <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-amber-400 font-bold shadow-inner flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5 text-amber-400 mr-1" />
            <span>{formatTimecode(displayTime)}</span>
            <span className="text-slate-600 font-normal">/</span>
            <span className="text-slate-400 font-normal">{formatTimecode(safeDuration)}</span>
          </div>

          {/* Undo / Redo History Controls */}
          {(onUndo || onRedo) && (
            <div className="flex items-center space-x-1 pl-2 border-l border-slate-800">
              {onUndo && (
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center space-x-1 ${
                    canUndo
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 active:scale-95 shadow-sm'
                      : 'bg-slate-900 text-slate-600 border border-slate-800/60 cursor-not-allowed opacity-50'
                  }`}
                  title="Undo subtitle edit (Ctrl+Z / Cmd+Z)"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Undo</span>
                </button>
              )}
              {onRedo && (
                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center space-x-1 ${
                    canRedo
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 active:scale-95 shadow-sm'
                      : 'bg-slate-900 text-slate-600 border border-slate-800/60 cursor-not-allowed opacity-50'
                  }`}
                  title="Redo subtitle edit (Ctrl+Y / Cmd+Y)"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                  <span>Redo</span>
                </button>
              )}
            </div>
          )}

          {/* Selection Controls & Count Badge */}
          <div className="flex items-center space-x-1 pl-2 border-l border-slate-800">
            <button
              onClick={selectedCount === blocks.length ? handleDeselectAll : handleSelectAll}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center space-x-1 transition-colors"
              title="Select / Deselect All (Cmd+A)"
            >
              {selectedCount === blocks.length && blocks.length > 0 ? (
                <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Square className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{selectedCount === blocks.length && blocks.length > 0 ? 'Deselect All' : 'Select All'}</span>
            </button>

            {selectedCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-mono font-bold flex items-center space-x-1">
                <Layers className="w-3 h-3" />
                <span>{selectedCount} Selected</span>
              </span>
            )}
          </div>

          {/* Action Buttons: Add Block, Merge Selected, Delete Selected */}
          <div className="flex items-center space-x-1 pl-2 border-l border-slate-800">
            {onAddBlock && (
              <button
                onClick={() => onAddBlock(displayTime)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 text-[11px] font-bold flex items-center space-x-1 transition-all"
                title="Add new subtitle block at playhead position"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Caption</span>
              </button>
            )}

            {selectedCount >= 2 && onMergeBlocks && (
              <button
                onClick={handleMergeSelected}
                className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold flex items-center space-x-1 transition-all"
                title="Merge selected blocks into a single block"
              >
                <Combine className="w-3.5 h-3.5" />
                <span>Merge ({selectedCount})</span>
              </button>
            )}

            {selectedCount > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white text-[11px] font-bold flex items-center space-x-1 transition-all"
                title="Delete selected blocks (Delete/Backspace)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>

          {/* Auto-Snap Sync Trigger */}
          {onRefineAudioSync && (
            <button
              onClick={onRefineAudioSync}
              className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-extrabold text-[10px] uppercase tracking-wider shadow-md flex items-center space-x-1 transition-all active:scale-95"
              title="Automatically snap subtitle blocks & words to exact audio speech energy peaks"
            >
              <Zap className="w-3 h-3 fill-slate-950 text-slate-950" />
              <span>Auto-Snap Sync</span>
            </button>
          )}
        </div>

        {/* Right Toolbar Cluster: Waveform Style, Magnet, Word Pills, Keyboard, Zoom */}
        <div className="flex items-center space-x-2">
          {/* Magnet Snap Toggle */}
          <button
            onClick={() => setMagnetEnabled(!magnetEnabled)}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center space-x-1 border transition-all ${
              magnetEnabled
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Magnet Snap to Playhead & Neighbor Blocks"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Magnet</span>
          </button>

          {/* Waveform View Style Selector */}
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => setWaveformStyle('peaks')}
              className={`p-1 rounded-md text-[10px] font-bold transition-colors ${
                waveformStyle === 'peaks' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Peak Energy Waveform"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setWaveformStyle('spectrum')}
              className={`p-1 rounded-md text-[10px] font-bold transition-colors ${
                waveformStyle === 'spectrum' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Mirrored Spectrum Waveform"
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Word Pills Toggle */}
          <button
            onClick={() => setShowWordPills(!showWordPills)}
            className={`p-1.5 rounded-lg border text-[11px] font-bold transition-all ${
              showWordPills
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Micro Word Pills View"
          >
            <Type className="w-3.5 h-3.5" />
          </button>

          {/* Keyboard Shortcuts Dialog Trigger */}
          <button
            onClick={() => setShowShortcutsModal(true)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
            title="Keyboard Shortcuts Helper"
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>

          {/* Zoom Slider Controls */}
          <div className="flex items-center space-x-1 pl-1 border-l border-slate-800">
            <button
              onClick={() => setZoomLevel(Math.max(1, zoomLevel - 0.5))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono font-bold text-amber-400 px-1">{zoomLevel}x</span>
            <button
              onClick={() => setZoomLevel(Math.min(4, zoomLevel + 0.5))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Selected Block Nudge Bar */}
      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between bg-slate-950 px-3 py-1.5 rounded-xl border border-amber-500/40 shadow-inner text-xs">
          <div className="flex items-center space-x-2">
            <MoveHorizontal className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-amber-300">Nudge {selectedCount} Selected Block(s):</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => handleNudgeSelected(-0.5)}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono font-bold text-slate-200"
              title="Shift left -0.5s (Shift + Left Arrow)"
            >
              -0.5s
            </button>
            <button
              onClick={() => handleNudgeSelected(-0.1)}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono font-bold text-slate-200 flex items-center"
              title="Shift left -0.1s (Left Arrow)"
            >
              <ChevronLeft className="w-3 h-3" />
              <span>-0.1s</span>
            </button>
            <button
              onClick={handleSnapSelectedToPlayhead}
              className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-extrabold flex items-center space-x-1 shadow"
              title="Snap selected blocks to current playhead"
            >
              <Target className="w-3 h-3" />
              <span>Snap to Playhead</span>
            </button>
            <button
              onClick={() => handleNudgeSelected(0.1)}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono font-bold text-slate-200 flex items-center"
              title="Shift right +0.1s (Right Arrow)"
            >
              <span>+0.1s</span>
              <ChevronRight className="w-3 h-3" />
            </button>
            <button
              onClick={() => handleNudgeSelected(0.5)}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono font-bold text-slate-200"
              title="Shift right +0.5s (Shift + Right Arrow)"
            >
              +0.5s
            </button>
          </div>
        </div>
      )}

      {/* Helper Banner Notice */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
        <span className="flex items-center space-x-1.5">
          <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
          <span><strong>Drag empty timeline space</strong> to Marquee Box-Select multiple blocks. <strong>Shift/Ctrl + Click</strong> to toggle individual selections.</span>
        </span>

        {dragState && (
          <span className="font-mono text-amber-300 font-extrabold bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40">
            Moving {dragState.initialBlocks.length} Block(s)...
          </span>
        )}
      </div>

      {/* Main Interactive Waveform Timeline Scroll Canvas Container */}
      <div
        ref={canvasContainerRef}
        className="overflow-x-auto custom-scrollbar bg-slate-950 rounded-xl p-3 border border-slate-800/80 relative"
      >
        <div
          ref={timelineRef}
          onMouseDown={handleContainerPointerDown}
          className="relative min-h-[145px] cursor-pointer select-none"
          style={{ width: `${100 * zoomLevel}%` }}
        >
          {/* Marquee Selection Rubberband Rectangle Overlay */}
          {marqueeState && (
            <div
              className="absolute bg-amber-500/15 border-2 border-dashed border-amber-400 rounded-md z-40 pointer-events-none"
              style={{
                left: `${Math.min(marqueeState.startX, marqueeState.currentX)}px`,
                top: `${Math.min(marqueeState.startY, marqueeState.currentY)}px`,
                width: `${Math.abs(marqueeState.currentX - marqueeState.startX)}px`,
                height: `${Math.abs(marqueeState.currentY - marqueeState.startY)}px`,
              }}
            />
          )}

          {/* Magnet Alignment Guide Line */}
          {snapGuideX !== null && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-40 pointer-events-none shadow-[0_0_8px_rgba(34,211,238,0.8)]"
              style={{ left: `${snapGuideX}px` }}
            />
          )}

          {/* Trim Start Darkened Region */}
          {trimStartPct > 0 && (
            <div
              className="absolute left-0 top-0 bottom-0 bg-slate-950/80 backdrop-blur-[1px] border-r-2 border-amber-500/80 z-20 pointer-events-none"
              style={{ width: `${trimStartPct}%` }}
            >
              <span className="absolute top-1 left-1 text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-slate-900/90 px-1 py-0.5 rounded">
                Trim In
              </span>
            </div>
          )}

          {/* Trim End Darkened Region */}
          {trimEndPct < 100 && (
            <div
              className="absolute right-0 top-0 bottom-0 bg-slate-950/80 backdrop-blur-[1px] border-l-2 border-amber-500/80 z-20 pointer-events-none"
              style={{ width: `${100 - trimEndPct}%` }}
            >
              <span className="absolute top-1 right-1 text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-slate-900/90 px-1 py-0.5 rounded">
                Trim Out
              </span>
            </div>
          )}

          {/* High-Precision Waveform & Time Ruler Canvas */}
          <div className="absolute inset-x-0 top-0 h-16 flex items-center justify-center opacity-90 pointer-events-none">
            <canvas ref={waveformCanvasRef} className="w-full h-full block" />
          </div>

          {/* Smart Crop Motion Track Keyframes Line Overlay */}
          {(transform?.keyframes || []).length > 0 && (
            <div className="absolute inset-x-0 top-16 h-6 border-t border-b border-amber-500/30 bg-slate-900/60 flex items-center z-20 pointer-events-auto">
              <div className="absolute left-1 flex items-center space-x-1 text-[9px] font-bold uppercase text-amber-400 bg-slate-950 px-1.5 py-0.5 rounded border border-amber-500/30 z-30 pointer-events-none">
                <Target className="w-3 h-3 text-amber-400" />
                <span>Crop Motion Track ({transform?.keyframes?.length})</span>
              </div>

              {(transform?.keyframes || []).map(kf => {
                const leftPct = Math.max(0, Math.min(100, (kf.timestamp / safeDuration) * 100));
                const isNearPlayhead = Math.abs(displayTime - kf.timestamp) < 0.25;

                return (
                  <div
                    key={kf.id}
                    onClick={e => {
                      e.stopPropagation();
                      onSeek(kf.timestamp);
                    }}
                    className={`absolute top-1/2 -translate-y-1/2 -ml-2 cursor-pointer transition-all group z-30 ${
                      isNearPlayhead ? 'scale-125 z-40' : 'hover:scale-110'
                    }`}
                    style={{ left: `${leftPct}%` }}
                    title={`Crop Keyframe @ ${kf.timestamp.toFixed(2)}s | Pan X: ${kf.panX}% | Scale: ${kf.scale}x`}
                  >
                    {/* Diamond Marker Icon */}
                    <div
                      className={`w-3.5 h-3.5 rotate-45 border flex items-center justify-center shadow-lg transition-all ${
                        isNearPlayhead
                          ? 'bg-amber-400 border-white text-slate-950 shadow-amber-400/80 ring-2 ring-amber-300'
                          : 'bg-amber-500/90 border-amber-300 text-slate-950 hover:bg-amber-400'
                      }`}
                    >
                      <div className="w-1 h-1 bg-slate-950 rounded-full" />
                    </div>

                    {/* Tooltip on Hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:flex flex-col items-center pointer-events-none z-50">
                      <div className="bg-slate-950 border border-amber-500/60 text-amber-300 px-2 py-1 rounded-md text-[10px] font-mono whitespace-nowrap shadow-2xl">
                        <span className="font-extrabold text-white block">⏱️ {kf.timestamp.toFixed(2)}s</span>
                        <span>Pan X: {kf.panX}% | Scale: {kf.scale}x</span>
                      </div>
                      <div className="w-1.5 h-1.5 bg-slate-950 border-r border-b border-amber-500/60 rotate-45 -mt-1" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Subtitle Blocks Track Area */}
          <div className="relative pt-16 pb-2 min-h-[100px]">
            {blocks.map(block => {
              const leftPct = Math.max(0, ((block.start || 0) / safeDuration) * 100);
              const durationSec = Math.max(0.1, (block.end || 0) - (block.start || 0));
              const widthPct = (durationSec / safeDuration) * 100;
              const isActive = displayTime >= block.start && displayTime <= block.end;
              const isSelected = selectedBlockIds.includes(block.id);
              const isDraggingThis = dragState?.initialBlocks.some(b => b.id === block.id);

              return (
                <div
                  key={block.id}
                  className={`absolute top-18 h-16 rounded-xl px-2 py-1.5 border transition-all flex flex-col justify-between shadow-xl group z-10 hover:z-30 ${
                    isDraggingThis
                      ? 'bg-amber-500/60 border-amber-300 text-amber-950 ring-4 ring-amber-400/80 scale-[1.02] cursor-grabbing z-40'
                      : isSelected
                      ? 'bg-amber-500/40 border-amber-300 text-amber-100 ring-2 ring-amber-400 cursor-grab shadow-amber-500/20'
                      : isActive
                      ? 'bg-amber-500/25 border-amber-400/80 text-amber-200 ring-1 ring-amber-400/50 cursor-grab'
                      : 'bg-slate-800/90 border-slate-700/80 text-slate-300 hover:border-amber-500/60 cursor-grab'
                  }`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    minWidth: `${Math.max(28, Math.min(70, 28 * zoomLevel))}px`,
                  }}
                  onMouseDown={e => handleStartDrag(e.clientX, block, 'move', e)}
                  onTouchStart={e => {
                    if (e.touches.length > 0) {
                      handleStartDrag(e.touches[0].clientX, block, 'move', e);
                    }
                  }}
                  onClick={e => handleSelectBlock(block.id, e)}
                  onMouseEnter={() => setHoveredBlockId(block.id)}
                  onMouseLeave={() => setHoveredBlockId(null)}
                >
                  {/* Left Trim Handle */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-3.5 sm:w-3 hover:w-4 bg-amber-400/90 hover:bg-amber-300 rounded-l-xl cursor-col-resize flex items-center justify-center opacity-80 group-hover:opacity-100 transition-all z-20 touch-none active:bg-amber-300"
                    onMouseDown={e => handleStartDrag(e.clientX, block, 'resize-left', e)}
                    onTouchStart={e => {
                      if (e.touches.length > 0) {
                        handleStartDrag(e.touches[0].clientX, block, 'resize-left', e);
                      }
                    }}
                    title="Drag to trim start time"
                  >
                    <GripVertical className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />
                  </div>

                  {/* Top Block Row: Checkbox, Text & Actions */}
                  <div className="flex items-center justify-between w-full truncate pr-3 pl-2">
                    <div className="flex items-center space-x-1 truncate mr-1">
                      {isSelected && <CheckSquare className="w-3 h-3 text-amber-300 shrink-0" />}
                      <span className="truncate text-[11px] font-bold font-mono">
                        {block.words.map(w => w.text).join(' ')}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0 z-10" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onSplitBlock(block.id, Math.max(1, Math.floor(block.words.length / 2)));
                        }}
                        className="p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-amber-300 transition-colors"
                        title="Split Subtitle Block"
                      >
                        <Scissors className="w-3 h-3" />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onDeleteBlock(block.id);
                        }}
                        className="p-0.5 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                        title="Delete Subtitle Block"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Word Pills Micro Track inside Block */}
                  {showWordPills && block.words.length > 0 && (
                    <div className="flex items-center space-x-0.5 overflow-hidden w-full px-2 py-0.5 my-0.5 bg-slate-950/60 rounded-md">
                      {block.words.map(word => {
                        const isWordActive = displayTime >= word.start && displayTime <= word.end;
                        return (
                          <span
                            key={word.id}
                            className={`px-1 py-0.2 text-[9px] font-mono rounded truncate transition-colors ${
                              isWordActive
                                ? 'bg-amber-400 text-slate-950 font-bold'
                                : 'bg-slate-800/80 text-slate-300'
                            }`}
                            title={`Word: "${word.text}" (${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s)`}
                          >
                            {word.text}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Bottom Block Row: Timestamp bounds */}
                  <div className="text-[9px] text-amber-300/80 font-mono pl-2">
                    {(block.start || 0).toFixed(2)}s - {(block.end || 0).toFixed(2)}s ({((block.end || 0) - (block.start || 0)).toFixed(2)}s)
                  </div>

                  {/* Right Trim Handle */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-3.5 sm:w-3 hover:w-4 bg-amber-400/90 hover:bg-amber-300 rounded-r-xl cursor-col-resize flex items-center justify-center opacity-80 group-hover:opacity-100 transition-all z-20 touch-none active:bg-amber-300"
                    onMouseDown={e => handleStartDrag(e.clientX, block, 'resize-right', e)}
                    onTouchStart={e => {
                      if (e.touches.length > 0) {
                        handleStartDrag(e.touches[0].clientX, block, 'resize-right', e);
                      }
                    }}
                    title="Drag to trim end time"
                  >
                    <GripVertical className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />
                  </div>

                  {/* Hover Micro Popover Card */}
                  {hoveredBlockId === block.id && !dragState && !marqueeState && (
                    <div className="absolute left-1/2 -top-12 -translate-x-1/2 bg-slate-900 border border-amber-500/50 rounded-lg p-1.5 shadow-xl text-[10px] font-mono text-slate-200 z-50 pointer-events-none whitespace-nowrap flex items-center space-x-2">
                      <span className="text-amber-400 font-bold">{block.words.length} Words</span>
                      <span>•</span>
                      <span>{(block.end - block.start).toFixed(2)}s duration</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Red Playhead Line & Scrub Handle */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-30 pointer-events-none shadow-[0_0_10px_rgba(244,63,94,0.8)]"
            style={{ left: `${progressPercent}%` }}
          >
            <div className="w-3.5 h-3.5 bg-rose-500 rounded-full -ml-1.5 -mt-1 shadow-md border-2 border-slate-950 flex items-center justify-center">
              <div className="w-1 h-1 bg-white rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-amber-400 font-bold">
                <Keyboard className="w-5 h-5" />
                <h3 className="text-base text-white">Timeline Keyboard Shortcuts</h3>
              </div>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-slate-300">Play / Pause Video</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded text-amber-300 border border-slate-700 font-bold">Space</kbd>
              </div>

              <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-slate-300">Select All Subtitle Blocks</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded text-amber-300 border border-slate-700 font-bold">Cmd / Ctrl + A</kbd>
              </div>

              <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-slate-300">Delete Selected Blocks</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded text-amber-300 border border-slate-700 font-bold">Delete / Backspace</kbd>
              </div>

              <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-slate-300">Nudge Selected (-0.1s / +0.1s)</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded text-amber-300 border border-slate-700 font-bold">← / →</kbd>
              </div>

              <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-slate-300">Nudge Selected (-0.5s / +0.5s)</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded text-amber-300 border border-slate-700 font-bold">Shift + ← / →</kbd>
              </div>

              <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                <span className="text-slate-300">Cancel / Deselect All</span>
                <kbd className="px-2 py-0.5 bg-slate-800 rounded text-amber-300 border border-slate-700 font-bold">Esc</kbd>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-slate-400 flex items-center space-x-1.5">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span>You can also click and drag a marquee selection box over empty timeline space to select blocks in bulk.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
