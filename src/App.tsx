import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Video,
  Palette,
  Sliders,
  FileText,
  Play,
  Pause,
  Download,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Wand2,
} from 'lucide-react';
import { Header } from './components/Header';
import { VideoPlayerCanvas } from './components/VideoPlayerCanvas';
import { StylePanel } from './components/StylePanel';
import { TimelineEditor } from './components/TimelineEditor';
import { SubtitleManager } from './components/SubtitleManager';
import { VideoExportModal } from './components/VideoExportModal';
import { ProjectManagerModal } from './components/ProjectManagerModal';
import { ClearCanvasModal } from './components/ClearCanvasModal';

import {
  SubtitleBlock,
  SubtitleStyle,
  VideoFilter,
  AspectRatio,
  PlatformPreset,
  VideoTransformSettings,
  WatermarkSettings,
  AudioSettings,
  Project,
} from './types';
import { PRESET_THEMES } from './utils/presetThemes';
import {
  decodeAudioFromFile,
  extractWaveformFromAudioBuffer,
  alignWordsWithAudioEnergy,
  refineSubtitleSyncWithAudioEnergy,
} from './utils/audioAnalyzer';
import { transcribeAudioOffline } from './utils/speechTranscriber';
import { transcribeVideoAudioWithAI } from './utils/aiTranscriber';
import { generateSubtitleBlocksFromTranscript } from './utils/srtParser';
import { getEmojiForWord } from './utils/emojiMap';
import { applySmartAutoCaptionHighlights, clearSubtitleHighlights } from './utils/smartHighlighter';
import { loadGoogleFont, preloadPopularGoogleFonts } from './utils/googleFonts';
import { useSubtitleHistory } from './hooks/useSubtitleHistory';
import { useAutoSaveSubtitles, getAutoSavedBlocks } from './hooks/useAutoSaveSubtitles';
import { useAudioNormalizer } from './hooks/useAudioNormalizer';
import {
  getAllProjects,
  saveProject,
  getProjectVideoBlob,
  createDefaultProject,
} from './utils/projectStorage';

export default function App() {
  const videoRef = u
seRef<HTMLVideoElement | null>(null);

  // Active Project State
  const [currentProject, setCurrentProject] = useState<Project>(() => createDefaultProject());
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectToastMsg, setProjectToastMsg] = useState<string | null>(null);

  // Core Video State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Audio Waveform State
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [waveform, setWaveform] = useState<number[]>([]);

  // Formatting & Platform State
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [platformPreset, setPlatformPreset] = useState<PlatformPreset>('tiktok');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('hormozi_viral');

  // Styling & Video Filters State
  const [style, setStyle] = useState<SubtitleStyle>(PRESET_THEMES[0].style as SubtitleStyle);
  const [filter, setFilter] = useState<VideoFilter>({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
    sepia: 0,
    hueRotate: 0,
  });

  // Video Transform, Watermark, & Audio State
  const [transform, setTransform] = useState<VideoTransformSettings>({
    scale: 1.0,
    panX: 0,
    panY: 0,
    playbackRate: 1.0,
    trimStart: 0,
    trimEnd: 0,
  });

  const [watermark, setWatermark] = useState<WatermarkSettings>({
    enabled: false,
    text: '@mybrand',
    position: 'top-right',
    opacity: 0.85,
    fontSize: 26,
    fontFamily: '"Plus Jakarta Sans", Montserrat, sans-serif',
  });

  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    videoVolume: 100,
    bgmVolume: 50,
    autoNormalize: true,
    targetLufs: -14,
  });

  // Connect Web Audio A
PI Gain Node Auto-Normalizer hook
  const { loudnessResult } = useAudioNormalizer(
    videoRef,
    audioBuffer,
    audioSettings,
    updated => setAudioSettings(prev => ({ ...prev, ...updated }))
  );

  // Subtitle Blocks State with History Stack (Undo/Redo)
  const {
    blocks,
    setBlocks,
    resetBlocks,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useSubtitleHistory(currentProject?.blocks || getAutoSavedBlocks() || []);

  // Auto-save blocks to localStorage whenever they change
  const { lastSavedAt, isSaved } = useAutoSaveSubtitles(blocks);

  // Modals & UI States
  const [isSubtitleModalOpen, setIsSubtitleModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState<string | null>(null);

  // Mobile Experience State (< lg screens)
  const [mobileTab, setMobileTab] = useState<'preview' | 'style' | 'timeline' | 'captions'>('preview');
  const [mobileShowStickyPreview, setMobileShowStickyPreview] = useState<boolean>(true);
  // Free AI uses tracking
  const [freeAiUses, setFreeAiUses] = useState<number>(() => {
    return parseInt(localStorage.getItem('freeAiUses') || '3');
  });

  // Load existing project or initialize on startup
  useEffect(() => {
    async function initProjects() {
      try {
        const existing = await getAllProjects();
        if (existing.length > 0) {
          handleSelectProject(existing[0]);
        } else {
          const fresh = createDefaultProject();
          await saveProject(fresh);
          setCurrentProject(fresh);
        }
      } catch (err) {
        console.warn('Init projects error:', err);
      }
    }
    initProjects();
  }, []);

  // Preload & dynamically load active Google Font
  useEffect(() => {
    preloadPopularGoogleFonts();
  }, []);

  useEffect(() => {
    if (style.fontFamily) {
      loadGoogleFont(style.fontFamily);
    }
  }, [style.fontFamily]);

  // Sync video duration with trimEnd
  useEffect(() => {
    if 
(duration > 0) {
      setTransform(prev => ({
        ...prev,
        trimEnd: prev.trimEnd === 0 ? duration : Math.min(prev.trimEnd, duration),
      }));
    }
  }, [duration]);

  // Select / Switch Project Handler
  const handleSelectProject = async (project: Project) => {
    setCurrentProject(project);
    setAspectRatio(project.aspectRatio || '9:16');
    setPlatformPreset(project.platformPreset || 'tiktok');
    setSelectedPresetId(project.selectedPresetId || 'hormozi_viral');
    if (project.style) setStyle(project.style);
    if (project.filter) setFilter(project.filter);
    if (project.transform) setTransform(project.transform);
    if (project.watermark) setWatermark(project.watermark);
    if (project.audioSettings) setAudioSettings(project.audioSettings);
    if (project.blocks) resetBlocks(project.blocks);

    // Attempt to load associated video blob from IndexedDB
    try {
      const blob = await getProjectVideoBlob(project.id);
      if (blob) {
        const file = new File([blob], project.videoName || 'project_video.mp4', {
          type: blob.type || 'video/mp4',
        });
        setVideoFile(file);
        const url = URL.createObjectURL(file);
        setVideoUrl(url);

        try {
          const decoded = await decodeAudioFromFile(file);
          setAudioBuffer(decoded);
          const wf = await extractWaveformFromAudioBuffer(decoded, 800);
          setWaveform(wf);
        } catch {
          /* ignore audio decode error on restore */
        }
      } else {
        setVideoFile(null);
        setVideoUrl(null);
        setAudioBuffer(null);
        setWaveform([]);
      }
    } catch (e) {
      console.warn('Could not restore video blob:', e);
    }

    setProjectToastMsg(`Loaded project: "${project.name}"`);
    setTimeout(() => setProjectToastMsg(null), 3000);
  };

  // Save Current Project Function
  const handleSaveCurrentProject = async (customName?: string) => {
    if (!currentProject) return;
    const updated: 
Project = {
      ...currentProject,
      name: customName || currentProject.name,
      updatedAt: Date.now(),
      aspectRatio,
      platformPreset,
      selectedPresetId,
      style,
      filter,
      transform,
      watermark,
      audioSettings,
      blocks,
      videoName: videoFile?.name || currentProject.videoName,
      videoDuration: duration || currentProject.videoDuration,
    };

    await saveProject(updated, videoFile);
    setCurrentProject(updated);
    setProjectToastMsg(`Project "${updated.name}" saved!`);
    setTimeout(() => setProjectToastMsg(null), 3000);
  };

  // Auto-Sync active project state changes into background cache
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!currentProject) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const snapshot: Project = {
        ...currentProject,
        updatedAt: Date.now(),
        aspectRatio,
        platformPreset,
        selectedPresetId,
        style,
        filter,
        transform,
        watermark,
        audioSettings,
        blocks,
        videoName: videoFile?.name || currentProject.videoName,
        videoDuration: duration || currentProject.videoDuration,
      };
      saveProject(snapshot, videoFile).catch(() => {});
    }, 1200);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    blocks,
    style,
    filter,
    transform,
    watermark,
    audioSettings,
    aspectRatio,
    platformPreset,
    selectedPresetId,
    videoFile,
    duration,
  ]);

  // Global Keyboard Shortcuts (Undo: Ctrl+Z, Redo: Ctrl+Y / Shift+Z, Save: Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInput =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement 
||
        (activeElement as HTMLElement)?.isContentEditable;

      // Save: Ctrl+S / Cmd+S
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveCurrentProject();
        return;
      }

      // Undo: Ctrl+Z or Cmd+Z (without Shift)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (!isInput) {
          e.preventDefault();
          undo();
        }
      }

      // Redo: Ctrl+Y, Cmd+Y, Ctrl+Shift+Z, Cmd+Shift+Z
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey)
      ) {
        if (!isInput) {
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, handleSaveCurrentProject]);

  // Clear / Reset Canvas Handlers
  const handleClearAll = () => {
    // 1. Clear video & audio
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoFile(null);
    setVideoUrl(null);
    setAudioBuffer(null);
    setWaveform([]);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);

    // 2. Clear subtitle blocks
    resetBlocks([]);

    // 3. Reset filters & transforms
    setFilter({
      brightness: 100,
      contrast: 100,
      saturation: 100,
      blur: 0,
      sepia: 0,
      hueRotate: 0,
    });
    setTransform({
      scale: 1.0,
      panX: 0,
      panY: 0,
      playbackRate: 1.0,
      trimStart: 0,
      trimEnd: 0,
      framingMode: 'cover',
    });
    setWatermark({
      enabled: false,
      text: '@mybrand',
      position: 'top-right',
      opacity: 0.8,
      fontSize: 24,
      positionXPercent: 88,
      positionYPercent: 8,
    });

    // 4. Update project state
    if (currentProject) {
      setCurrentProject(prev => ({
        ...prev,

        videoName: undefined,
        videoDuration: undefined,
        blocks: [],
        updatedAt: Date.now(),
      }));
    }

    setProjectToastMsg('Canvas reset: cleared video, timeline & subtitles.');
    setTimeout(() => setProjectToastMsg(null), 3000);
  };

  const handleClearSubtitlesOnly = () => {
    resetBlocks([]);
    setProjectToastMsg('Cleared all captions from timeline.');
    setTimeout(() => setProjectToastMsg(null), 3000);
  };

  // Video File Upload Handler
  const handleVideoUpload = async (file: File) => {
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);

    // Update project video name
    if (currentProject) {
      setCurrentProject(prev => ({
        ...prev,
        videoName: file.name,
      }));
    }

    let decodedBuffer: AudioBuffer | null = null;

    try {
      // GATING: Check free AI uses
      if (freeAiUses <= 0) {
        const shouldUpgrade = confirm(
          'You have used your 3 free AI transcriptions. Upgrade to Pro for unlimited access?'
        );
        if (shouldUpgrade) {
          window.location.href = 'https://buy.stripe.com/test_3cI14hf2mdjG87W81c5J600';
        }
        return;
      }

      // Decrement free uses
      const newCount = freeAiUses - 1;
      setFreeAiUses(newCount);
      localStorage.setItem('freeAiUses', newCount.toString());
      setIsTranscribing(true);
      setTranscribeStatus('Extracting audio track from video...');

      try {
        decodedBuffer = await decodeAudioFromFile(file);
        setAudioBuffer(decodedBuffer);
        const wf = await extractWaveformFromAudioBuffer(decodedBuffer, 800);
        setWaveform(wf);
      } catch (audioErr) {
        console.warn('Audio decoding fallback:', audioErr);
      }

      let aiBlocks: SubtitleBlock[] = [];

      if (decodedBuffer) {
        aiBlocks = await transcribeVideoAudioWithAI(
          decodedBuffer,
          style.maxWordsPerLine || 3,
          status => setTranscribeStatus(status)
        );

        if (aiBlocks.length > 0) {
          aiBlocks = refineSubtitleSyncWithAudioEnergy(aiBlocks, decodedBuffer);
        } else {
          aiBlocks = await transcribeAudioOffline(decodedBuffer, style.maxWordsPerLine || 3);
        }
      } else {
        const targetDuration = duration || 10;
        const defaultText = 'Welcome to AutoCap Studio! Create viral video shorts with animated kinetic subtitles.';
        aiBlocks = generateSubtitleBlocksFromTranscript(defaultText, targetDuratio
n, style.maxWordsPerLine || 3);
      }

      const highlightedBlocks = applySmartAutoCaptionHighlights({ blocks: aiBlocks });
      resetBlocks(highlightedBlocks);
    } catch (err) {
      console.warn('Video subtitle generation fallback error:', err);
      const targetDuration = duration || 10;
      const defaultText = 'Welcome to AutoCap Studio! Create viral video shorts with animated kinetic subtitles.';
      const backupBlocks = generateSubtitleBlocksFromTranscript(defaultText, targetDuration, style.maxWordsPerLine || 3);
      const highlightedBlocks = applySmartAutoCaptionHighlights({ blocks: backupBlocks });
      resetBlocks(highlightedBlocks);
    } finally {
      setIsTranscribing(false);
      setTimeout(() => setTranscribeStatus(null), 4000);
    }
  };


  // Re-run AI Transcription manually
  const handleAiTranscribe = async () => {
    try {
      // GATING: Check free AI uses
      if (freeAiUses <= 0) {
        const shouldUpgrade = confirm(
          'You have used your 3 free AI transcriptions. Upgrade to Pro for unlimited access?'
        );
        if (shouldUpgrade) {
          window.location.href = 'https://buy.stripe.com/test_3cI14hf2mdjG87W81c5J600';
        }
        return;
      }

      // Decrement free uses
      const newCount = freeAiUses - 1;
      setFreeAiUses(newCount);
      localStorage.setItem('freeAiUses', newCount.toString());
      setIsTranscribing(true);
      setTranscribeStatus('Transcribing video speech with Gemini AI...');

      let aiBlocks: SubtitleBlock[] = [];

      if (audioBuffer) {
        aiBlocks = await transcribeVideoAudioWithAI(
          audioBuffer,
          style.maxWordsPerLine || 3,
          status => setTranscribeStatus(status)
        );

        if (aiBlocks.length > 0) {
          aiBlocks = refineSubtitleSyncWithAudioEnergy(aiBlocks, audioBuffer);
        } else {
          aiBlocks = await transcribeAudioOffline(audioBuffer, style.maxWordsPerLine || 3);
        }
      } else {
        const targetDuration = duration || 10;
        const defaultText = "Welcome to AutoCap Studio! Create viral video shorts with animated kinetic subtitles.";
        aiBlocks = generateSubtitleBlocksFromTranscript(defaultText, targetDuration, style.maxWordsPerLine || 3);
      }

      const highlightedBlocks = applySmartAutoCaptionHighlights({ blocks: aiBlocks });
      resetBlocks(highlightedBlocks);
    } catch (err) {
      console.error('Manual AI Transcription error:', err);
      if (audioBuffer) {
        con
st offlineBlocks = await transcribeAudioOffline(audioBuffer, style.maxWordsPerLine || 3);
        const highlightedBlocks = applySmartAutoCaptionHighlights({ blocks: offlineBlocks });
        resetBlocks(highlightedBlocks);
      }
    } finally {
      setIsTranscribing(false);
      setTimeout(() => setTranscribeStatus(null), 4000);
    }
  };

  // Precision Auto-Sync Button Handler (Snaps existing blocks directly to audio energy peaks)
  const handleRefineAudioSync = () => {
    if (!audioBuffer || blocks.length === 0) return;
    const refined = refineSubtitleSyncWithAudioEnergy(blocks, audioBuffer);
    setBlocks(refined);
  };

  // Video Timeupdate listener with 100ms throttling during playback
  const lastTimeUpdateRef = useRef<number>(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const now = video.currentTime;
      // When playing, throttle React state updates to 100ms to eliminate UI lag while canvas renders at 60fps
      if (video.paused || Math.abs(now - lastTimeUpdateRef.current) >= 0.1) {
        lastTimeUpdateRef.current = now;
        setCurrentTime(now);
      }
    };
    const handleLoadedMetadata = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      setCurrentTime(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [videoUrl]);

  // Toggle Play / Pause
  const handleTogglePlay = () => {
    if (
!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  // Seek time
  const handleSeek = (timeSec: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = timeSec;
    setCurrentTime(timeSec);
  };

  // Apply Platform Preset
  const handleSelectPlatform = (preset: PlatformPreset) => {
    setPlatformPreset(preset);
    const matchedTheme = PRESET_THEMES.find(t => t.platform === preset) || PRESET_THEMES[0];
    setStyle(prev => ({ ...prev, ...matchedTheme.style }));
    setSelectedPresetId(matchedTheme.id);

    if (preset === 'youtube_shorts' || preset === 'tiktok' || preset === 'instagram_reels' || preset === 'facebook_reels') {
      setAspectRatio('9:16');
    }
  };

  // Apply Specific Preset Theme
  const handleApplyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const matched = PRESET_THEMES.find(t => t.id === presetId);
    if (matched) {
      setStyle(prev => ({ ...prev, ...matched.style }));
    }
  };

  // Auto-Align Script to Audio Cadence
  const handleAutoAlign = (transcriptText: string) => {
    const targetDuration = duration || 10;
    const rawBlocks = generateSubtitleBlocksFromTranscript(transcriptText, targetDuration, style.maxWordsPerLine || 3);

    // Apply auto emojis to words
    const enrichedBlocks = rawBlocks.map(b => ({
      ...b,
      words: b.words.map(w => ({
        ...w,
        emoji: getEmojiForWord(w.text),
      })),
    }));

    let resultBlocks: SubtitleBlock[] = enrichedBlocks;

    if (audioBuffer) {
      const allWords = enrichedBlocks.flatMap(b => b.words);
      resultBlocks = alignWordsWithAudioEnergy(allWords, audioBuffer, style.maxWordsPerLine || 3);
    }

    // Apply Smart Auto-Caption Key Phrase Highlighting
    const highlighted = applySmartAutoCaptionHighlights({ blocks: resultBlocks });
    resetBlocks(highlighted);
  };

  // Smart Auto-Caption Highlighting Actions
  const
 handleSmartHighlight = (highlightColor: string = '#FFE600') => {
    const highlighted = applySmartAutoCaptionHighlights({
      blocks,
      highlightColor,
      forceAtLeastOnePerBlock: true,
    });
    setBlocks(highlighted);
  };

  const handleClearHighlights = () => {
    const cleared = clearSubtitleHighlights(blocks);
    setBlocks(cleared);
  };

  // Timeline Block Actions
  const handleUpdateBlock = (updated: SubtitleBlock, options?: { isContinuous?: boolean }) => {
    setBlocks(prev => prev.map(b => (b.id === updated.id ? updated : b)), options);
  };

  const handleUpdateBlocks = (updatedList: SubtitleBlock[], options?: { isContinuous?: boolean }) => {
    const map = new Map(updatedList.map(b => [b.id, b]));
    setBlocks(prev => prev.map(b => map.get(b.id) || b), options);
  };

  const handleDeleteBlock = (blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
  };

  const handleDeleteBlocks = (blockIds: string[]) => {
    const toDelete = new Set(blockIds);
    setBlocks(prev => prev.filter(b => !toDelete.has(b.id)));
  };

  const handleSplitBlock = (blockId: string, wordIndex: number) => {
    const target = blocks.find(b => b.id === blockId);
    if (!target || target.words.length <= 1) return;

    const w1 = target.words.slice(0, wordIndex);
    const w2 = target.words.slice(wordIndex);

    if (w1.length === 0 || w2.length === 0) return;

    const b1: SubtitleBlock = {
      id: `${target.id}-1`,
      start: target.start,
      end: w1[w1.length - 1].end,
      words: w1,
    };

    const b2: SubtitleBlock = {
      id: `${target.id}-2`,
      start: w2[0].start,
      end: target.end,
      words: w2,
    };

    setBlocks(prev => prev.flatMap(b => (b.id === blockId ? [b1, b2] : [b])));
  };

  const handleAddBlock = (startTime: number) => {
    const durationSec = 2.0;
    const safeStart = Math.max(0, Number(startTime.toFixed(3)));
    const safeEnd = Math.min(duration || 10, Number((safeStart + durationSe
c).toFixed(3)));
    const newBlock: SubtitleBlock = {
      id: `block-${Date.now()}`,
      start: safeStart,
      end: safeEnd,
      words: [
        {
          id: `w-${Date.now()}-1`,
          text: 'New',
          start: safeStart,
          end: Number((safeStart + 0.8).toFixed(3)),
        },
        {
          id: `w-${Date.now()}-2`,
          text: 'Caption',
          start: Number((safeStart + 0.85).toFixed(3)),
          end: safeEnd,
        },
      ],
    };
    setBlocks(prev => {
      const next = [...prev, newBlock];
      return next.sort((a, b) => a.start - b.start);
    });
  };

  const handleMergeBlocks = (blockIds: string[]) => {
    if (blockIds.length < 2) return;
    const targetBlocks = blocks.filter(b => blockIds.includes(b.id)).sort((a, b) => a.start - b.start);
    if (targetBlocks.length < 2) return;

    const firstBlock = targetBlocks[0];
    const lastBlock = targetBlocks[targetBlocks.length - 1];
    const mergedWords = targetBlocks.flatMap(b => b.words).sort((a, b) => a.start - b.start);

    const mergedBlock: SubtitleBlock = {
      id: `merged-${Date.now()}`,
      start: firstBlock.start,
      end: lastBlock.end,
      words: mergedWords,
    };

    const deleteSet = new Set(blockIds);
    setBlocks(prev => {
      const filtered = prev.filter(b => !deleteSet.has(b.id));
      const next = [...filtered, mergedBlock];
      return next.sort((a, b) => a.start - b.start);
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* App Header */}
      <Header
        platformPreset={platformPreset}
        onSelectPlatform={handleSelectPlatform}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenSubtitleModal={() => setIsSubtitleModalOpen(true)}
        onOpenProjectModal={() => setIsProjectModalOpen(true)}
        onOpenClearModal={() => setIsClearModalOpen(true)}
        currentProjec
tName={currentProject?.name}
        hasVideo={!!videoUrl}
        hasSubtitles={blocks.length > 0}
        lastSavedAt={lastSavedAt}
        isSaved={isSaved}
      />

      {/* Project Toast Notification */}
      {projectToastMsg && (
        <div className="bg-amber-500/20 border-b border-amber-500/30 text-amber-300 text-xs py-1.5 px-4 flex items-center justify-center space-x-2 font-semibold shadow-inner transition-all">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>{projectToastMsg}</span>
        </div>
      )}

      {/* Transcribe Status Toast / Notification Banner */}
      {transcribeStatus && (
        <div className="bg-amber-500/20 border-b border-amber-500/30 text-amber-300 text-xs py-2 px-4 flex items-center justify-center space-x-2 font-semibold shadow-inner">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>{transcribeStatus}</span>
        </div>
      )}

      {/* Mobile Navigation Tabs Header (< lg screens) */}
      <div className="lg:hidden bg-slate-900/95 border-b border-slate-800/80 px-3 py-2 sticky top-[53px] z-30 backdrop-blur-md">
        <div className="flex items-center justify-between gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setMobileTab('preview')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              mobileTab === 'preview'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Preview</span>
          </button>

          <button
            onClick={() => setMobileTab('style')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              mobileTab === 'style
'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Styles</span>
          </button>

          <button
            onClick={() => setMobileTab('timeline')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              mobileTab === 'timeline'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Timeline</span>
          </button>

          <button
            onClick={() => {
              setMobileTab('captions');
              setIsSubtitleModalOpen(true);
            }}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
              mobileTab === 'captions'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Captions</span>
            {blocks.length > 0 && (
              <span
                className={`text-[10px] px-1 rounded-full ${
                  mobileTab === 'captions'
                    ? 'bg-slate-950 text-amber-300'
                    : 'bg-slate-800 text-amber-400'
                }`}
              >
                {blocks.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Studio Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 pb-24 lg:pb-6">
        {/* Left Column: Canvas Preview Player (7 cols) */}
        <div
          className={`lg:col-span-7 flex flex-col space-y-4 ${
         
   mobileTab === 'preview' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <VideoPlayerCanvas
            videoFile={videoFile}
            videoUrl={videoUrl}
            onVideoUpload={handleVideoUpload}
            blocks={blocks}
            style={style}
            filter={filter}
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
            platformPreset={platformPreset}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onSeek={handleSeek}
            onStyleChange={updated => setStyle(prev => ({ ...prev, ...updated }))}
            videoRef={videoRef}
            transform={transform}
            watermark={watermark}
            onTransformChange={updated => setTransform(prev => ({ ...prev, ...updated }))}
            onChangeWatermark={updated => setWatermark(prev => ({ ...prev, ...updated }))}
          />
        </div>

        {/* Right Column: Style Customization Dashboard (5 cols) */}
        <div
          className={`lg:col-span-5 flex flex-col min-h-[500px] ${
            mobileTab === 'style' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Mobile Quick Preview Bar when on Style tab */}
          {videoUrl && (
            <div className="lg:hidden mb-3 bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between shadow-sm">
              <div className="flex items-center space-x-2.5">
                <button
                  onClick={handleTogglePlay}
                  className="w-8 h-8 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow font-bold"
                  aria-label={isPlaying ? 'Pause video' : 'Play video'}
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-slate-950" /> : <Play className="w-4 h-4 fill-slate-950 ml-0.5" />}
                </button>
      
          <div className="text-xs">
                  <div className="text-slate-200 font-mono font-bold">
                    {formatDurationSec(currentTime)} / {formatDurationSec(duration)}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">Live Caption Preview</div>
                </div>
              </div>
              <button
                onClick={() => setMobileTab('preview')}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold rounded-lg border border-slate-700 flex items-center space-x-1"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Open Canvas</span>
              </button>
            </div>
          )}

          <StylePanel
            style={style}
            onChangeStyle={updated => setStyle(prev => ({ ...prev, ...updated }))}
            filter={filter}
            onChangeFilter={updated => setFilter(prev => ({ ...prev, ...updated }))}
            onApplyPreset={handleApplyPreset}
            selectedPresetId={selectedPresetId}
            platformPreset={platformPreset}
            transform={transform}
            onChangeTransform={updated => setTransform(prev => ({ ...prev, ...updated }))}
            watermark={watermark}
            onChangeWatermark={updated => setWatermark(prev => ({ ...prev, ...updated }))}
            audioSettings={audioSettings}
            onChangeAudioSettings={updated => setAudioSettings(prev => ({ ...prev, ...updated }))}
            duration={duration}
            currentTime={currentTime}
            onSmartHighlight={handleSmartHighlight}
            onClearHighlights={handleClearHighlights}
            videoRef={videoRef}
            onSeek={handleSeek}
          />
        </div>

        {/* Bottom Full Row: Waveform & Subtitle Timeline Scrubber */}
        <div
          className={`lg:col-span-12 ${
            mobileTab === 'timeline' ? 'block' : 'hidden lg:
block'
          }`}
        >
          {/* Mobile Quick Preview Bar when on Timeline tab */}
          {videoUrl && (
            <div className="lg:hidden mb-3 bg-slate-900 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between shadow-sm">
              <div className="flex items-center space-x-2.5">
                <button
                  onClick={handleTogglePlay}
                  className="w-8 h-8 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow font-bold"
                  aria-label={isPlaying ? 'Pause video' : 'Play video'}
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-slate-950" /> : <Play className="w-4 h-4 fill-slate-950 ml-0

... [Content truncated]