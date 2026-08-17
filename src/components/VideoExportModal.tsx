import React, { useState } from 'react';
import { Download, Film, CheckCircle2, Sparkles, X, Loader2, Monitor, Gauge, Music, Image as ImageIcon } from 'lucide-react';
import {
  SubtitleBlock,
  SubtitleStyle,
  VideoFilter,
  AspectRatio,
  VideoTransformSettings,
  WatermarkSettings,
  AudioSettings,
  ExportResolution,
  ExportFormat,
} from '../types';
import { exportVideoOffline, getTargetDimensions } from '../utils/canvasRenderer';

interface VideoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  blocks: SubtitleBlock[];
  style: SubtitleStyle;
  filter: VideoFilter;
  aspectRatio: AspectRatio;
  transform?: VideoTransformSettings;
  watermark?: WatermarkSettings;
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
  blocks,
  style,
  filter,
  aspectRatio,
  transform,
  watermark,
  audioSettings,
}) => {
  const [resolution, setResolution] = useState<ExportResolution>('1080p');
  const [fps, setFps] = useState<24 | 30 | 60>(30);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp4');
  const [formatCategory, setFormatCategory] = useState<'video' | 'animation' | 'audio'>('video');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Clean up object URL when closing or unmounting
  React.useEffect(() => {
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
    videoRef.current?.videoWidth || 1920,
    videoRef.current?.videoHeight || 1080,
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
        blocks,
        style,
        filter,
        aspectRatio,
        transform,
        watermark,
        audioSettings,
        fps,
        format: exportFormat,
        resolution,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-slate-100 relative max-h-[92vh] overflow-y-auto custom-scrollbar">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center space-x-3">
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Film className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Export Burned-In Media</h2>
            <p className="text-xs text-slate-400">Export video containers, animated GIF loops, or audio masters</p>
          </div>
        </div>

        {/* Configuration Options */}
        {!isExporting && !exportedVideoUrl && (
          <div className="space-y-4 pt-1">
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
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
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
                        <div className="text-xs font-bold leading-tight">{r.label}</div>
                        <div className="text-[10px] opacity-75">{r.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Frame Rate (FPS) Selector (Disabled for GIF) */}
                {exportFormat !== 'gif' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                      <Gauge className="w-3.5 h-3.5 text-amber-400" />
                      <span>Frame Rate (FPS)</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 24, label: '24 FPS', sub: 'Cinematic' },
                        { id: 30, label: '30 FPS', sub: 'Standard' },
                        { id: 60, label: '60 FPS', sub: 'Ultra Smooth' },
                      ].map(f => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setFps(f.id as 24 | 30 | 60)}
                          className={`py-2 rounded-xl text-center transition-all ${
                            fps === f.id
                              ? 'bg-amber-500 text-slate-950 font-bold shadow-md ring-2 ring-amber-400/30'
                              : 'bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700/60'
                          }`}
                        >
                          <div className="text-xs font-bold leading-tight">{f.label}</div>
                          <div className="text-[10px] opacity-75">{f.sub}</div>
                        </button>
                      ))}
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
                </>
              )}
              <div className="flex justify-between font-semibold">
                <span className="text-slate-400">Audio Processing:</span>
                <span className="text-slate-300 font-mono font-bold">
                  {audioSettings?.normalizationEnabled ? 'Normalized + Compression' : 'Direct Audio Pass-through'}
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
                  : 'Rendering Frame by Frame...'}
              </h4>
              <p className="text-xs text-slate-400">
                {exportFormat === 'gif'
                  ? 'Quantizing palette and encoding LZW GIF loop offline.'
                  : 'Rendering video frames with animated captions 100% offline.'}
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
                  : 'Burned-in highlighted video exported successfully.'}
              </p>
            </div>

            <a
              href={exportedVideoUrl}
              download={`autocap_${exportFormat === 'gif' ? 'animation' : exportFormat === 'wav' || exportFormat === 'mp3' ? 'audio' : 'video'}_${Date.now()}.${exportFormat}`}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2 transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Download {exportFormat.toUpperCase()} File</span>
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
              Export another format
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

