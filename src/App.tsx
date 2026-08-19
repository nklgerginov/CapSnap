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
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { UpgradeModal } from './components/UpgradeModal';
import { generateDemoVideo } from './utils/sampleVideoGenerator';

import {
  SubtitleBlock,
  SubtitleStyle,
  VideoFilter,
  AspectRatio,
  PlatformPreset,
  VideoTransformSettings,
  WatermarkSettings,
  ProgressBarSettings,
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
import { useProStatus } from './hooks/useProStatus';
import { useAiUsage } from './hooks/useAiUsage';
import {
  getAllProjects,
  saveProject,
  getProjectVideoBlob,
  createDefaultProject,
} from './utils/projectStorage';

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

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

  const [progressBar, setProgressBar] = useState<ProgressBarSettings>({
    enabled: false,
    position: 'bottom',
    height: 12,
    color: '#F59E0B',
    secondaryColor: '#EF4444',
    glow: true,
    backgroundTrack: true,
    showTimerText: false,
  });

  const [audioSettings, setAudioSettings] = useState<AudioSettings>({
    videoVolume: 100,
    bgmVolume: 50,
    autoNormalize: true,
    targetLufs: -14,
  });

  // Connect Web Audio API Gain Node Auto-Normalizer hook
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
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<string | undefined>(undefined);
  const { isPro } = useProStatus();
  const { usesRemaining, hasUsesRemaining, consumeUse } = useAiUsage();

  const handleRequestUpgrade = useCallback((reason: string) => {
    setUpgradeReason(reason);
    setIsUpgradeModalOpen(true);
  }, []);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState<string | null>(null);

  const handleLoadDemo = async () => {
    try {
      setIsGeneratingDemo(true);
      setProjectToastMsg('⚡ Generating demo reel with synchronized audio & captions...');
      const { file, sampleBlocks } = await generateDemoVideo();
      await handleVideoUpload(file);
      resetBlocks(sampleBlocks);
      setProjectToastMsg('🎉 Demo reel loaded! Press Play or audition styles.');
      setTimeout(() => setProjectToastMsg(null), 4000);
    } catch (e) {
      console.error('Error generating demo video:', e);
      setProjectToastMsg('Failed to generate demo reel. Please try uploading a video.');
      setTimeout(() => setProjectToastMsg(null), 4000);
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  // Mobile Experience State (< lg screens)
  const [mobileTab, setMobileTab] = useState<'preview' | 'style' | 'timeline' | 'captions'>('preview');
  const [mobileShowStickyPreview, setMobileShowStickyPreview] = useState<boolean>(true);

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
    if (duration > 0) {
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
    if (project.progressBar) setProgressBar(project.progressBar);
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
    const updated: Project = {
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
      progressBar,
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
        progressBar,
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
    progressBar,
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
        activeElement instanceof HTMLTextAreaElement ||
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
        // Free tier gets FREE_AI_USE_LIMIT Gemini AI transcriptions per
        // browser; Pro users are unlimited. Once exhausted, fall back to
        // the offline transcriber instead of calling the paid API.
        const canUseAi = isPro || consumeUse();

        if (canUseAi) {
          aiBlocks = await transcribeVideoAudioWithAI(
            decodedBuffer,
            style.maxWordsPerLine || 3,
            status => setTranscribeStatus(status)
          );
        } else {
          setTranscribeStatus('Free AI transcriptions used up — using offline speech detection...');
        }

        if (aiBlocks.length > 0) {
          aiBlocks = refineSubtitleSyncWithAudioEnergy(aiBlocks, decodedBuffer);
        } else {
          aiBlocks = await transcribeAudioOffline(decodedBuffer, style.maxWordsPerLine || 3);
        }

        if (!canUseAi) {
          setProjectToastMsg("You've used all 3 free AI transcriptions. Upgrade to CapSnap Pro for unlimited AI transcription.");
          setTimeout(() => setProjectToastMsg(null), 5000);
        }
      } else {
        const targetDuration = duration || 10;
        const defaultText = 'Welcome to AutoCap Studio! Create viral video shorts with animated kinetic subtitles.';
        aiBlocks = generateSubtitleBlocksFromTranscript(defaultText, targetDuration, style.maxWordsPerLine || 3);
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
  const handleAiTranscribe = async (language?: string) => {
    try {
      setIsTranscribing(true);
      setTranscribeStatus('Extracting audio track & transcribing with Gemini AI...');

      let targetBuffer = audioBuffer;

      // If audioBuffer is missing, extract it dynamically from video file or video element
      if (!targetBuffer && videoFile) {
        try {
          targetBuffer = await decodeAudioFromFile(videoFile);
          setAudioBuffer(targetBuffer);
          const wf = await extractWaveformFromAudioBuffer(targetBuffer, 800);
          setWaveform(wf);
        } catch (e) {
          console.warn('Could not decode audio from file:', e);
        }
      } else if (!targetBuffer && videoRef.current?.src) {
        try {
          const res = await fetch(videoRef.current.src);
          const arrayBuffer = await res.arrayBuffer();
          const tempAudioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          targetBuffer = await tempAudioCtx.decodeAudioData(arrayBuffer);
          setAudioBuffer(targetBuffer);
          const wf = await extractWaveformFromAudioBuffer(targetBuffer, 800);
          setWaveform(wf);
        } catch (e) {
          console.warn('Could not decode audio from video src:', e);
        }
      }

      let aiBlocks: SubtitleBlock[] = [];

      if (targetBuffer) {
        // Same free-tier gate as the initial upload transcription — this is
        // an explicit user action, so when denied we also surface the
        // upgrade modal directly instead of only a toast.
        const canUseAi = isPro || consumeUse();

        if (canUseAi) {
          aiBlocks = await transcribeVideoAudioWithAI(
            targetBuffer,
            style.maxWordsPerLine || 3,
            status => setTranscribeStatus(status),
            language
          );
        } else {
          setTranscribeStatus('Free AI transcriptions used up — using offline speech detection...');
        }

        if (aiBlocks.length > 0) {
          aiBlocks = refineSubtitleSyncWithAudioEnergy(aiBlocks, targetBuffer);
        } else {
          aiBlocks = await transcribeAudioOffline(targetBuffer, style.maxWordsPerLine || 3);
        }

        if (!canUseAi) {
          handleRequestUpgrade("You've used all 3 free AI transcriptions. Upgrade to CapSnap Pro for unlimited AI transcription.");
        }
      } else {
        const targetDuration = duration || 10;
        const defaultText = "Welcome to AutoCap Studio! Create viral video shorts with animated kinetic subtitles.";
        aiBlocks = generateSubtitleBlocksFromTranscript(defaultText, targetDuration, style.maxWordsPerLine || 3);
      }

      const highlightedBlocks = applySmartAutoCaptionHighlights({ blocks: aiBlocks });
      resetBlocks(highlightedBlocks);
      setProjectToastMsg(`Generated ${highlightedBlocks.length} AI subtitle blocks!`);
      setTimeout(() => setProjectToastMsg(null), 3500);
    } catch (err) {
      console.error('Manual AI Transcription error:', err);
      if (audioBuffer) {
        const offlineBlocks = await transcribeAudioOffline(audioBuffer, style.maxWordsPerLine || 3);
        const highlightedBlocks = applySmartAutoCaptionHighlights({ blocks: offlineBlocks });
        resetBlocks(highlightedBlocks);
        setProjectToastMsg(`Created ${highlightedBlocks.length} offline speech blocks.`);
        setTimeout(() => setProjectToastMsg(null), 3500);
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
    if (!videoRef.current) return;
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
  const handleSmartHighlight = (highlightColor: string = '#FFE600') => {
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
    const safeEnd = Math.min(duration || 10, Number((safeStart + durationSec).toFixed(3)));
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
        onOpenShortcutsModal={() => setIsShortcutsModalOpen(true)}
        onOpenUpgradeModal={() => handleRequestUpgrade('Unlock the full CapSnap export pipeline.')}
        onLoadDemo={handleLoadDemo}
        isGeneratingDemo={isGeneratingDemo}
        currentProjectName={currentProject?.name}
        hasVideo={!!videoUrl}
        hasSubtitles={blocks.length > 0}
        lastSavedAt={lastSavedAt}
        isSaved={isSaved}
        isPro={isPro}
        aiUsesRemaining={isPro ? undefined : usesRemaining}
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
            progressBar={progressBar}
            audioSettings={audioSettings}
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
            progressBar={progressBar}
            onChangeProgressBar={updated => setProgressBar(prev => ({ ...prev, ...updated }))}
            audioSettings={audioSettings}
            onChangeAudioSettings={updated => setAudioSettings(prev => ({ ...prev, ...updated }))}
            duration={duration}
            currentTime={currentTime}
            onSmartHighlight={handleSmartHighlight}
            onClearHighlights={handleClearHighlights}
            videoRef={videoRef}
            onSeek={handleSeek}
            isPro={isPro}
            onRequestUpgrade={handleRequestUpgrade}
          />
        </div>

        {/* Bottom Full Row: Waveform & Subtitle Timeline Scrubber */}
        <div
          className={`lg:col-span-12 ${
            mobileTab === 'timeline' ? 'block' : 'hidden lg:block'
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
                  {isPlaying ? <Pause className="w-4 h-4 fill-slate-950" /> : <Play className="w-4 h-4 fill-slate-950 ml-0.5" />}
                </button>
                <div className="text-xs">
                  <div className="text-slate-200 font-mono font-bold">
                    {formatDurationSec(currentTime)} / {formatDurationSec(duration)}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">Timeline Sync Active</div>
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

          <TimelineEditor
            blocks={blocks}
            currentTime={currentTime}
            duration={duration}
            waveform={waveform}
            audioBuffer={audioBuffer}
            onSeek={handleSeek}
            transform={transform}
            onChangeTransform={updated => setTransform(prev => ({ ...prev, ...updated }))}
            onUpdateBlock={handleUpdateBlock}
            onUpdateBlocks={handleUpdateBlocks}
            onDeleteBlock={handleDeleteBlock}
            onDeleteBlocks={handleDeleteBlocks}
            onSplitBlock={handleSplitBlock}
            onAddBlock={handleAddBlock}
            onMergeBlocks={handleMergeBlocks}
            onRefineAudioSync={handleRefineAudioSync}
            videoRef={videoRef}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
          />
        </div>
      </main>

      {/* Mobile Floating Thumb Dock (< lg screens) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 border-t border-slate-800/90 px-3 py-2 pb-safe backdrop-blur-xl shadow-2xl flex items-center justify-between gap-2">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setMobileTab('preview')}
            className={`p-2 rounded-xl flex flex-col items-center justify-center min-w-[48px] transition-all ${
              mobileTab === 'preview'
                ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Video className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Video</span>
          </button>

          <button
            onClick={() => setMobileTab('style')}
            className={`p-2 rounded-xl flex flex-col items-center justify-center min-w-[48px] transition-all ${
              mobileTab === 'style'
                ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Styles</span>
          </button>

          <button
            onClick={() => setMobileTab('timeline')}
            className={`p-2 rounded-xl flex flex-col items-center justify-center min-w-[48px] transition-all ${
              mobileTab === 'timeline'
                ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Timeline</span>
          </button>

          <button
            onClick={() => {
              setMobileTab('captions');
              setIsSubtitleModalOpen(true);
            }}
            className={`p-2 rounded-xl flex flex-col items-center justify-center min-w-[48px] transition-all ${
              mobileTab === 'captions'
                ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <FileText className="w-4 h-4" />
              {blocks.length > 0 && (
                <span className="absolute -top-1 -right-2 bg-amber-500 text-slate-950 text-[9px] font-black rounded-full px-1 leading-none">
                  {blocks.length}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5">Captions</span>
          </button>
        </div>

        {/* Action Controls: Undo/Redo & Play / Export */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`p-2 rounded-xl border transition-all ${
              canUndo
                ? 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 active:scale-95'
                : 'bg-slate-900/50 text-slate-600 border-slate-800/60 cursor-not-allowed opacity-50'
            }`}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          {videoUrl && (
            <button
              onClick={handleTogglePlay}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 active:scale-95 shadow-sm"
              title={isPlaying ? 'Pause' : 'Play'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-amber-400" /> : <Play className="w-4 h-4 fill-amber-400 ml-0.5" />}
            </button>
          )}

          <button
            onClick={() => setIsExportModalOpen(true)}
            disabled={!videoUrl}
            className={`px-3 py-2 rounded-xl text-xs font-black transition-all shadow-md flex items-center space-x-1 active:scale-95 ${
              videoUrl
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                : 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-800'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Subtitle & Script Manager Modal */}
      <SubtitleManager
        isOpen={isSubtitleModalOpen}
        onClose={() => setIsSubtitleModalOpen(false)}
        blocks={blocks}
        onUpdateBlocks={setBlocks}
        videoDuration={duration}
        audioBuffer={audioBuffer}
        onAutoAlign={handleAutoAlign}
        onRefineAudioSync={handleRefineAudioSync}
        onSeek={handleSeek}
        currentTime={currentTime}
        onAiTranscribe={handleAiTranscribe}
        isTranscribing={isTranscribing}
        transcribeStatus={transcribeStatus}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
      />

      {/* Burned-in Video Export Modal */}
      <VideoExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        videoRef={videoRef}
        blocks={blocks}
        style={style}
        filter={filter}
        aspectRatio={aspectRatio}
        transform={transform}
        watermark={watermark}
        progressBar={progressBar}
        audioSettings={audioSettings}
        isPro={isPro}
        onRequestUpgrade={handleRequestUpgrade}
      />

      {/* Upgrade to Pro Modal */}
      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        reason={upgradeReason}
      />

      {/* Project Manager Modal (Make, Save, Edit, Delete, Duplicate, Export/Import) */}
      <ProjectManagerModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        currentProject={currentProject}
        onSelectProject={handleSelectProject}
        onSaveCurrentProject={handleSaveCurrentProject}
      />

      {/* Clear Canvas / Reset Project Modal */}
      <ClearCanvasModal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        onConfirmClearAll={handleClearAll}
        onConfirmClearSubtitlesOnly={handleClearSubtitlesOnly}
        hasVideo={!!videoUrl}
        subtitleCount={blocks.length}
      />

      {/* Keyboard Shortcuts & Gestures Help Modal */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </div>
  );
}

function formatDurationSec(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

