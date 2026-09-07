import React, { useState, useEffect } from 'react';
import {
  Download,
  Film,
  CheckCircle2,
  Sparkles,
  X,
  Loader2,
  Monitor,
  Gauge,
  Music,
  Image as ImageIcon,
  Info,
  Layers,
  Zap,
  Volume2,
  HardDrive,
  Clock,
  Check,
} from 'lucide-react';
import {
  SubtitleBlock,
  SubtitleStyle,
  VideoFilter,
  AspectRatio,
  VideoTransformSettings,
  WatermarkSettings,
  ProgressBarSettings,
  AudioSettings,
  ExportResolution,
  ExportFormat,
  SourceVideoStats,
} from '../types';
import { exportVideoOffline, getTargetDimensions } from '../utils/canvasRenderer';
import { analyzeVideoSource } from '../utils/videoStatsAnalyzer';
import { detectHardwareEncoderSupport, HardwareEncoderInfo, isWebCodecsExportSupported } from '../utils/webcodecsExporter';

interface VideoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoFile?: File | null;
  audioBuffer?: AudioBuffer | null;
  duration?: number;
  blocks: SubtitleBlock[];
  style: SubtitleStyle;
  filter: VideoFilter;
  aspectRatio: AspectRatio;
  transform?: VideoTransformSettings;
  watermark?: WatermarkSettings;
  progressBar?: ProgressBarSettings;
  audioSettings?: AudioSettings;
}

const FORMAT_OPTIONS: {
  id: ExportFormat;
  label: string;
  badge: string;
  category: 'video' | 'animation' | 'audio';
  description: string;
}[] = [
  { id: 'mp4', label: 'MP4', badge: 'Recommended', category: 'video', description: 'Universal H.264 video for TikTok, Reels & Shorts' },
  { id: 'webm', label: 'WebM', badge: 'High Efficiency', category: 'video', description: 'VP9/Opus format with ultra-crisp web compression' },
  { id: 'mov', label: 'MOV', badge: 'Apple / ProRes', category: 'video', description: 'QuickTime container for Final Cut & Premiere Pro' },
  { id: 'mkv', label: 'MKV', badge: 'Matroska', category: 'video', description: 'Lossless & high-bitrate container for archiving' },
  { id: 'avi', label: 'AVI', badge: 'Standard', category: 'video', description: 'Audio Video Interleaved format for legacy systems' },
  { id: 'ts', label: 'TS', badge: 'MPEG Stream', category: 'video', description: 'MPEG-2 transport stream for HLS & broadcast' },
  { id: 'gif', label: 'GIF', badge: 'Animated Loop', category: 'animation', description: 'High-color animated GIF for Discord, memes & social' },
  { id: 'wav', label: 'WAV', badge: 'Lossless Master', category: 'audio', description: '16-bit uncompressed audio with gain & limiter' },
  { id: 'mp3', label: 'MP3', badge: 'Voice Extract', category: 'audio', description: 'Normalized voiceover audio track' },
];

export const VideoExportModal: React.FC<VideoExportModalProps> = ({
  isOpen,
  onClose,
  videoRef,
  videoFile,
  audioBuffer,
  duration,
  blocks,
  style,
  filter,
  aspectRatio,
  transform,
  watermark,
  progressBar,
  audioSettings,
}) => {
  const [resolution, setResolution] = useState<ExportResolution>('1080p');
  const [fps, setFps] = useState<number>(30);
  const [useSourceFps, setUseSourceFps] = useState<boolean>(false);
  const [customFpsInput, setCustomFpsInput] = useState<string>('30');
  const [isCustomFpsOpen, setIsCustomFpsOpen] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp4');
  const [formatCategory, setFormatCategory] = useState<'video' | 'animation' | 'audio'>('video');
  const [hardwarePreference, setHardwarePreference] = useState<'prefer-hardware' | 'prefer-software'>('prefer-hardware');
  const [hwInfo, setHwInfo] = useState<HardwareEncoderInfo | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const [sourceStats, setSourceStats] = useState<SourceVideoStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Probe WebCodecs GPU Hardware Acceleration support
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    detectHardwareEncoderSupport(exportFormat).then(info => {
      if (isMounted) {
        setHwInfo(info);
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [isOpen, exportFormat]);

  // Extract source video metadata whenever modal opens or video changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingStats(true);

    analyzeVideoSource({
      video: videoRef.current,
      file: videoFile,
      audioBuffer,
      fallbackDuration: duration,
    }).then(stats => {
      if (isMounted) {
        setSourceStats(stats);
        setIsLoadingStats(false);
      }
    }).catch(err => {
      console.warn('Could not analyze source video stats:', err);
      if (isMounted) {
        setIsLoadingStats(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, videoRef, videoFile, audioBuffer, duration]);

  // Clean up object URL when closing or unmounting
  useEffect(() => {
    return () => {
      if (exportedVideoUrl) {
        URL.revokeObjectURL(exportedVideoUrl);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [exportedVideoUrl]);

  if (!isOpen) return null;

  const targetDims = getTargetDimensions(
    videoRef.current?.videoWidth || sourceStats?.width || 1920,
    videoRef.current?.videoHeight || sourceStats?.height || 1080,
    aspectRatio,
    resolution
  );

  const handleCancelExport = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsExporting(false);
    setExportProgress(0);
  };

  const handleClose = () => {
    if (isExporting) {
      handleCancelExport();
    }
    onClose();
  };

  const handleSelectSourceFps = () => {
    if (sourceStats) {
      setFps(sourceStats.fps);
      setUseSourceFps(true);
      setIsCustomFpsOpen(false);
    }
  };

  const handleSelectStandardFps = (standardFps: number) => {
    setFps(standardFps);
    setUseSourceFps(sourceStats?.fps === standardFps);
    setIsCustomFpsOpen(false);
  };

  const handleStartExport = async () => {
    if (!videoRef.current) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsExporting(true);
    setExportProgress(0);
    if (exportedVideoUrl) {
      URL.revokeObjectURL(exportedVideoUrl);
      setExportedVideoUrl(null);
    }

    try {
      const blob = await exportVideoOffline({
        video: videoRef.current,
        videoFile,
        audioBuffer,
        blocks,
        style,
        filter,
        aspectRatio,
        transform,
        watermark,
        progressBar,
        audioSettings,
        fps,
        format: exportFormat,
        resolution,
        hardwarePreference,
        signal: controller.signal,
        onProgress: pct => setExportProgress(pct),
      });

      if (!controller.signal.aborted) {
        const url = URL.createObjectURL(blob);
        setExportedVideoUrl(url);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.log('Export was cancelled by user');
      } else {
        console.error('Export error:', err);
        alert('Media export error. Ensure video playback is ready.');
      }
    } finally {
      setIsExporting(false);
      abortControllerRef.current = null;
    }
  };

  const activeFormatInfo = FORMAT_OPTIONS.find(f => f.id === exportFormat) || FORMAT_OPTIONS[0];
  const isMatchingSourceFps = sourceStats && Math.abs(fps - sourceStats.fps) < 0.25;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 text-slate-100 relative max-h-[92vh] overflow-y-auto custom-scrollbar">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          aria-label="Close export modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3">
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Film className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Export Burned-In Media</h2>
            <p className="text-xs text-slate-400">Export high-definition video, kinetic animations, or audio masters</p>
          </div>
        </div>

        {/* Configuration Options */}
        {!isExporting && !exportedVideoUrl && (
          <div className="space-y-4 pt-1">
            {/* ORIGINAL VIDEO STATISTICS PANEL */}
            <div className="p-3.5 bg-slate-950/90 rounded-xl border border-slate-800 space-y-2.5 shadow-inner">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-200">
                  <Info className="w-3.5 h-3.5 text-amber-400" />
                  <span>Original Video Statistics</span>
                </div>
                {sourceStats && (
                  <button
                    type="button"
                    onClick={handleSelectSourceFps}
                    className={`text-[11px] px-2.5 py-0.5 rounded-lg font-bold transition-all flex items-center space-x-1.5 ${
                      isMatchingSourceFps
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                    }`}
                    title="Click to automatically apply the source video framerate to the export"
                  >
                    <Zap className="w-3 h-3" />
                    <span>{isMatchingSourceFps ? 'Exporting Source FPS' : 'Use Source FPS'}</span>
                  </button>
                )}
              </div>

              {isLoadingStats ? (
                <div className="flex items-center justify-center py-4 space-x-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Analyzing original video streams & framerate...</span>
                </div>
              ) : sourceStats ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {/* Resolution & Aspect Ratio */}
                  <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800/80 space-y-0.5">
                    <div className="text-[10px] text-slate-400 font-medium flex items-center space-x-1">
                      <Monitor className="w-3 h-3 text-cyan-400" />
                      <span>Resolution</span>
                    </div>
                    <div className="font-mono font-bold text-slate-100 truncate text-[11px]">
                      {sourceStats.width} × {sourceStats.height}
                    </div>
                    <div className="text-[9px] text-slate-400 truncate">
                      {sourceStats.aspectRatioLabel}
                    </div>
                  </div>

                  {/* Native Framerate */}
                  <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800/80 space-y-0.5">
                    <div className="text-[10px] text-slate-400 font-medium flex items-center space-x-1">
                      <Gauge className="w-3 h-3 text-amber-400" />
                      <span>Source Framerate</span>
                    </div>
                    <div className="font-mono font-bold text-amber-400 text-[11px] flex items-center space-x-1">
                      <span>{sourceStats.fpsFormatted}</span>
                      {sourceStats.isHighFramerate && (
                        <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded font-sans">
                          HFR
                        </span>
                      )}
                    </div>
                    <div className="text-[9px] text-slate-400 truncate">
                      {sourceStats.fps === 30 || sourceStats.fps === 60 || sourceStats.fps === 24
                        ? 'Standard Broadcast'
                        : `${sourceStats.fps} frames/sec`}
                    </div>
                  </div>

                  {/* Duration & Timeline */}
                  <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800/80 space-y-0.5">
                    <div className="text-[10px] text-slate-400 font-medium flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-emerald-400" />
                      <span>Duration</span>
                    </div>
                    <div className="font-mono font-bold text-slate-100 text-[11px]">
                      {sourceStats.durationFormatted}
                    </div>
                    <div className="text-[9px] text-slate-400 truncate">
                      {transform?.trimEnd && transform.trimEnd > 0
                        ? `Trim: ${(transform.trimEnd - (transform.trimStart || 0)).toFixed(1)}s`
                        : 'Full clip length'}
                    </div>
                  </div>

                  {/* File Size & Bitrate */}
                  <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800/80 space-y-0.5">
                    <div className="text-[10px] text-slate-400 font-medium flex items-center space-x-1">
                      <HardDrive className="w-3 h-3 text-indigo-400" />
                      <span>File Size & Bitrate</span>
                    </div>
                    <div className="font-mono font-bold text-slate-100 text-[11px] truncate">
                      {sourceStats.fileSizeFormatted || 'Memory Stream'}
                    </div>
                    <div className="text-[9px] text-slate-400 truncate">
                      {sourceStats.bitrateFormatted ? `~${sourceStats.bitrateFormatted}` : 'Variable Bitrate'}
                    </div>
                  </div>

                  {/* Codec & Container */}
                  <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800/80 space-y-0.5">
                    <div className="text-[10px] text-slate-400 font-medium flex items-center space-x-1">
                      <Layers className="w-3 h-3 text-purple-400" />
                      <span>Codec & Format</span>
                    </div>
                    <div className="font-mono font-bold text-slate-100 text-[11px] truncate">
                      {sourceStats.codec || 'H.264 / AAC'}
                    </div>
                    <div className="text-[9px] text-slate-400 truncate">
                      {sourceStats.fileName}
                    </div>
                  </div>

                  {/* Audio Specifications */}
                  <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800/80 space-y-0.5">
                    <div className="text-[10px] text-slate-400 font-medium flex items-center space-x-1">
                      <Volume2 className="w-3 h-3 text-rose-400" />
                      <span>Audio Spec</span>
                    </div>
                    <div className="font-mono font-bold text-slate-100 text-[11px] truncate">
                      {sourceStats.audioFormatted || '48.0 kHz Stereo'}
                    </div>
                    <div className="text-[9px] text-slate-400 truncate">
                      {audioSettings?.autoNormalize ? 'Auto LUFS active' : 'Direct Audio'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400">
                  Ready to render timeline from current video canvas.
                </div>
              )}
            </div>

            {/* Format Category Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Select Export Format</label>
              <div className="flex items-center p-1 bg-slate-950/80 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setFormatCategory('video');
                    if (exportFormat === 'gif' || exportFormat === 'wav' || exportFormat === 'mp3') {
                      setExportFormat('mp4');
                    }
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
                    formatCategory === 'video'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Video Containers</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormatCategory('animation');
                    setExportFormat('gif');
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
                    formatCategory === 'animation'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Animated GIF</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormatCategory('audio');
                    if (exportFormat !== 'wav' && exportFormat !== 'mp3') {
                      setExportFormat('wav');
                    }
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
                    formatCategory === 'audio'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Music className="w-3.5 h-3.5" />
                  <span>Audio Master</span>
                </button>
              </div>

              {/* Format Cards Grid */}
              <div className="grid grid-cols-3 gap-2">
                {FORMAT_OPTIONS.filter(f => f.category === formatCategory).map(f => {
                  const isSelected = exportFormat === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setExportFormat(f.id)}
                      className={`p-2.5 rounded-xl text-left transition-all relative border ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500 text-amber-300 ring-1 ring-amber-500/50'
                          : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-white">{f.label}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-mono ${
                          isSelected ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-700 text-slate-400'
                        }`}>
                          {f.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-tight">
                        {f.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Video-Only Options: Resolution & FPS */}
            {formatCategory !== 'audio' && (
              <>
                {/* Output Resolution Selection */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                      <Monitor className="w-3.5 h-3.5 text-amber-400" />
                      <span>Output Resolution</span>
                    </label>
                    <span className="text-[11px] font-mono text-amber-400 font-bold">
                      {targetDims.width} × {targetDims.height}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[
                      {
                        id: 'source',
                        label: 'Source',
                        desc: sourceStats ? `${sourceStats.width}p` : 'Native',
                      },
                      { id: '4k', label: '4K Ultra', desc: '2160p' },
                      { id: '1080p', label: '1080p HD', desc: 'Full HD' },
                      { id: '720p', label: '720p', desc: 'Fast' },
                      { id: '480p', label: '480p', desc: 'Draft' },
                    ].map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setResolution(r.id as ExportResolution)}
                        className={`py-2 px-1 rounded-xl text-center transition-all ${
                          resolution === r.id
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-md ring-2 ring-amber-400/30'
                            : 'bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700/60'
                        }`}
                      >
                        <div className="text-xs font-bold leading-tight truncate">{r.label}</div>
                        <div className="text-[10px] opacity-75 truncate">{r.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Frame Rate (FPS) Selector with Source Video Framerate Option */}
                {exportFormat !== 'gif' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                        <Gauge className="w-3.5 h-3.5 text-amber-400" />
                        <span>Export Frame Rate (FPS)</span>
                      </label>
                      <span className="text-[11px] font-mono text-amber-400 font-bold flex items-center space-x-1">
                        <span>{fps} FPS</span>
                        {isMatchingSourceFps && (
                          <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-sans font-semibold">
                            Source Match
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {/* Option 1: Source Video Framerate */}
                      <button
                        type="button"
                        onClick={handleSelectSourceFps}
                        className={`py-2 px-1.5 rounded-xl text-center transition-all relative border ${
                          useSourceFps || isMatchingSourceFps
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-md ring-2 ring-amber-400/30 border-amber-400'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700/60'
                        }`}
                      >
                        <div className="text-xs font-bold leading-tight flex items-center justify-center space-x-1">
                          <Zap className="w-3 h-3 shrink-0" />
                          <span className="truncate">Source</span>
                        </div>
                        <div className="text-[10px] opacity-80 truncate">
                          {sourceStats?.fpsFormatted || '30 FPS'}
                        </div>
                      </button>

                      {/* Option 2: 24 FPS (Cinematic) */}
                      <button
                        type="button"
                        onClick={() => handleSelectStandardFps(24)}
                        className={`py-2 px-1.5 rounded-xl text-center transition-all border ${
                          fps === 24 && !useSourceFps && (!sourceStats || sourceStats.fps !== 24)
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-md ring-2 ring-amber-400/30 border-amber-400'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700/60'
                        }`}
                      >
                        <div className="text-xs font-bold leading-tight">24 FPS</div>
                        <div className="text-[10px] opacity-75">Cinematic</div>
                      </button>

                      {/* Option 3: 30 FPS (Standard) */}
                      <button
                        type="button"
                        onClick={() => handleSelectStandardFps(30)}
                        className={`py-2 px-1.5 rounded-xl text-center transition-all border ${
                          fps === 30 && !useSourceFps && (!sourceStats || sourceStats.fps !== 30)
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-md ring-2 ring-amber-400/30 border-amber-400'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700/60'
                        }`}
                      >
                        <div className="text-xs font-bold leading-tight">30 FPS</div>
                        <div className="text-[10px] opacity-75">Standard</div>
                      </button>

                      {/* Option 4: 60 FPS (Ultra Smooth) */}
                      <button
                        type="button"
                        onClick={() => handleSelectStandardFps(60)}
                        className={`py-2 px-1.5 rounded-xl text-center transition-all border ${
                          fps === 60 && !useSourceFps && (!sourceStats || sourceStats.fps !== 60)
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-md ring-2 ring-amber-400/30 border-amber-400'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700/60'
                        }`}
                      >
                        <div className="text-xs font-bold leading-tight">60 FPS</div>
                        <div className="text-[10px] opacity-75">Ultra Smooth</div>
                      </button>
                    </div>

                    {/* Custom FPS Input Toggle */}
                    <div className="flex items-center justify-between pt-0.5">
                      <button
                        type="button"
                        onClick={() => setIsCustomFpsOpen(!isCustomFpsOpen)}
                        className="text-[11px] text-slate-400 hover:text-amber-400 transition-colors underline"
                      >
                        {isCustomFpsOpen ? 'Hide custom FPS input' : 'Specify custom frame rate (e.g. 25, 50, 120)...'}
                      </button>

                      {isCustomFpsOpen && (
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="number"
                            min="1"
                            max="120"
                            step="1"
                            value={customFpsInput}
                            onChange={e => setCustomFpsInput(e.target.value)}
                            className="w-16 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white text-center focus:border-amber-500 focus:outline-none"
                            placeholder="FPS"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const val = parseFloat(customFpsInput);
                              if (val >= 1 && val <= 120) {
                                setFps(val);
                                setUseSourceFps(false);
                              }
                            }}
                            className="px-2 py-1 bg-amber-500 text-slate-950 text-xs font-bold rounded-lg hover:bg-amber-400 transition-colors"
                          >
                            Set
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* WebCodecs GPU Hardware Acceleration Card */}
                {isWebCodecsExportSupported() && (formatCategory === 'video' || exportFormat === 'mp4' || exportFormat === 'webm' || exportFormat === 'mov' || exportFormat === 'mkv') && (
                  <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
                          <Zap className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                            <span>WebGL & GPU Hardware Acceleration</span>
                            {hwInfo?.isHardwareAccelerated !== false && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-semibold border border-emerald-500/30">
                                ⚡ ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            GPU fragment shaders for filters & transforms + WebCodecs hardware encoder (zero CPU blocking)
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* GPU Device & Pipeline Details */}
                    {hwInfo?.gpuDiagnostics && (
                      <div className="px-2.5 py-1.5 bg-slate-900/90 rounded-lg border border-slate-800 text-[10px] flex items-center justify-between text-slate-300">
                        <div className="flex items-center space-x-1.5 truncate max-w-[70%]">
                          <Monitor className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span className="text-slate-400 truncate">Device:</span>
                          <span className="font-mono text-slate-200 font-semibold truncate">
                            {hwInfo.gpuDiagnostics.gpuRenderer || 'WebGL Accelerated GPU'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1 shrink-0">
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[9px] font-mono">
                            {hwInfo.gpuDiagnostics.webgl2Supported ? 'WebGL 2.0' : 'WebGL'}
                          </span>
                          {hwInfo.codec && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[9px] font-mono">
                              {hwInfo.codec.split('.')[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setHardwarePreference('prefer-hardware')}
                        className={`py-2 px-2 rounded-xl text-left transition-all border flex flex-col justify-between ${
                          hardwarePreference === 'prefer-hardware'
                            ? 'bg-amber-500/15 border-amber-500/50 text-white ring-1 ring-amber-400/20 shadow-sm'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-bold text-amber-300 flex items-center space-x-1">
                            <Zap className="w-3 h-3 text-amber-400" />
                            <span>GPU Hardware</span>
                          </span>
                          {hardwarePreference === 'prefer-hardware' && (
                            <Check className="w-3 h-3 text-amber-400" />
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 leading-tight">
                          Dedicated GPU silicon (NVENC / VideoToolbox / QuickSync)
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setHardwarePreference('prefer-software')}
                        className={`py-2 px-2 rounded-xl text-left transition-all border flex flex-col justify-between ${
                          hardwarePreference === 'prefer-software'
                            ? 'bg-amber-500/15 border-amber-500/50 text-white ring-1 ring-amber-400/20 shadow-sm'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-bold text-slate-300">Software / CPU</span>
                          {hardwarePreference === 'prefer-software' && (
                            <Check className="w-3 h-3 text-amber-400" />
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 leading-tight">
                          Fallback software encoder for constrained environments
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Summary Box */}
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between font-semibold">
                <span className="text-slate-400">Export Format:</span>
                <span className="text-amber-400 font-mono font-bold">{exportFormat.toUpperCase()} ({activeFormatInfo.label})</span>
              </div>
              {formatCategory !== 'audio' && (
                <>
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-400">Aspect Ratio:</span>
                    <span className="text-slate-200 font-mono font-bold">{aspectRatio}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-400">Render Resolution:</span>
                    <span className="text-emerald-400 font-mono font-bold">
                      {targetDims.width} × {targetDims.height} ({resolution.toUpperCase()})
                    </span>
                  </div>
                  {exportFormat !== 'gif' && (
                    <div className="flex justify-between font-semibold">
                      <span className="text-slate-400">Target Framerate:</span>
                      <span className="text-amber-300 font-mono font-bold flex items-center space-x-1">
                        <span>{fps} FPS</span>
                        {isMatchingSourceFps ? (
                          <span className="text-[10px] text-emerald-400 font-sans font-bold flex items-center space-x-0.5">
                            <Check className="w-3 h-3 inline" />
                            <span>(Matches Source)</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-sans font-normal">
                            (Source is {sourceStats?.fpsFormatted || '30 FPS'})
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {exportFormat !== 'gif' && (
                    <div className="flex justify-between font-semibold">
                      <span className="text-slate-400">Encoding Acceleration:</span>
                      <span className="text-amber-300 font-mono font-bold flex items-center space-x-1">
                        <Zap className="w-3 h-3 text-amber-400 inline" />
                        <span>{hardwarePreference === 'prefer-hardware' ? 'WebCodecs GPU Accelerated' : 'CPU Software'}</span>
                      </span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between font-semibold">
                <span className="text-slate-400">Audio Processing:</span>
                <span className="text-slate-300 font-mono font-bold">
                  {audioSettings?.autoNormalize ? 'LUFS Normalized (-14 LUFS)' : 'Direct Audio Pass-through'}
                </span>
              </div>
            </div>

            <button
              onClick={handleStartExport}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold rounded-xl text-xs shadow-lg shadow-amber-500/25 flex items-center justify-center space-x-2 transition-all active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                Start {exportFormat.toUpperCase()} Export ({formatCategory === 'audio' ? 'Audio Master' : `${resolution.toUpperCase()} • ${exportFormat === 'gif' ? '12 FPS' : `${fps} FPS`}`})
              </span>
            </button>
          </div>
        )}

        {/* Export Progress View */}
        {isExporting && (
          <div className="py-6 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="relative flex items-center justify-center">
              <Loader2 className="w-12 h-12 text-amber-500 animate-spin" />
              <span className="absolute text-xs font-bold font-mono text-amber-300">{exportProgress}%</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                {exportFormat === 'gif'
                  ? 'Generating Animated GIF Frames...'
                  : exportFormat === 'wav' || exportFormat === 'mp3'
                  ? 'Rendering Audio Master Track...'
                  : `Rendering Frame by Frame at ${fps} FPS...`}
              </h4>
              <p className="text-xs text-slate-400">
                {exportFormat === 'gif'
                  ? 'Quantizing palette and encoding LZW GIF loop.'
                  : `Rendering video frames with burned-in animated kinetic captions (${fps} FPS).`}
              </p>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-orange-500 h-full transition-all duration-200"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
            <button
              onClick={handleCancelExport}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
            >
              Cancel Render
            </button>
          </div>
        )}

        {/* Render Complete View */}
        {exportedVideoUrl && (
          <div className="py-4 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">
                {exportFormat.toUpperCase()} Ready for Download!
              </h4>
              <p className="text-xs text-slate-400">
                {exportFormat === 'gif'
                  ? 'Animated GIF loop rendered and encoded successfully.'
                  : exportFormat === 'wav' || exportFormat === 'mp3'
                  ? 'Master audio track exported with dynamic normalization.'
                  : `Burned-in highlighted video exported successfully at ${fps} FPS (${resolution.toUpperCase()}).`}
              </p>
            </div>

            <a
              href={exportedVideoUrl}
              download={`autocap_${exportFormat === 'gif' ? 'animation' : exportFormat === 'wav' || exportFormat === 'mp3' ? 'audio' : 'video'}_${fps}fps_${Date.now()}.${exportFormat}`}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Download {exportFormat.toUpperCase()} File ({fps} FPS)</span>
            </a>

            <button
              type="button"
              onClick={() => {
                if (exportedVideoUrl) {
                  URL.revokeObjectURL(exportedVideoUrl);
                  setExportedVideoUrl(null);
                }
              }}
              className="text-xs text-slate-400 hover:text-slate-200 underline pt-1"
            >
              Export another format or resolution
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
