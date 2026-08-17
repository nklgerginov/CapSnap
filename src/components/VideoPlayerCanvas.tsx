import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Eye,
  EyeOff,
  Sliders,
  Upload,
  Volume2,
  VolumeX,
  FastForward,
  Rewind,
  Crop,
  Move,
  Minus,
  Plus,
  Type,
  AtSign,
} from 'lucide-react';
import { AspectRatio, SubtitleBlock, SubtitleStyle, VideoFilter, PlatformPreset, VideoTransformSettings, WatermarkSettings } from '../types';
import { renderCanvasFrame, getTargetDimensions } from '../utils/canvasRenderer';
import { SafeZoneOverlay } from './SafeZoneOverlay';
import { detectSubjectFocalPoint } from '../utils/subjectDetector';

type ResizeHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null;

interface VideoPlayerCanvasProps {
  videoFile: File | null;
  videoUrl: string | null;
  onVideoUpload: (file: File) => void;
  blocks: SubtitleBlock[];
  style: SubtitleStyle;
  filter: VideoFilter;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  platformPreset: PlatformPreset;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onStyleChange: (style: Partial<SubtitleStyle>) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  transform?: VideoTransformSettings;
  watermark?: WatermarkSettings;
  onTransformChange?: (updated: Partial<VideoTransformSettings>) => void;
  onChangeWatermark?: (updated: Partial<WatermarkSettings>) => void;
}

export const VideoPlayerCanvas: React.FC<VideoPlayerCanvasProps> = ({
  videoFile,
  videoUrl,
  onVideoUpload,
  blocks,
  style,
  filter,
  aspectRatio,
  onAspectRatioChange,
  platformPreset,
  currentTime,
  duration,
  isPlaying,
  onTogglePlay,
  onSeek,
  onStyleChange,
  videoRef,
  transform,
  watermark,
  onTransformChange,
  onChangeWatermark,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [showSafeZone, setShowSafeZone] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isDraggingCaption, setIsDraggingCaption] = useState(false);

  // Subtitle Resize & Move handles state
  const [activeHandle, setActiveHandle] = useState<ResizeHandle>(null);
  const [isHoveringBox, setIsHoveringBox] = useState(false);
  const [dragInfo, setDragInfo] = useState<{
    handle: ResizeHandle;
    fontSize: number;
    maxWords: number;
    posX: number;
    posY: number;
  } | null>(null);

  // Watermark Resize & Move handles state
  const [activeWatermarkHandle, setActiveWatermarkHandle] = useState<ResizeHandle>(null);
  const [isHoveringWatermark, setIsHoveringWatermark] = useState(false);
  const [watermarkDragInfo, setWatermarkDragInfo] = useState<{
    fontSize: number;
    posX: number;
    posY: number;
  } | null>(null);

  // Sync Video Playback Speed with transform or select
  useEffect(() => {
    if (videoRef.current && transform?.playbackRate) {
      videoRef.current.playbackRate = transform.playbackRate;
      setPlaybackRate(transform.playbackRate);
    }
  }, [transform?.playbackRate, videoRef]);

  // Trim range playback auto-looping
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !transform) return;

    const handleTimeCheck = () => {
      if (transform.trimEnd && transform.trimEnd > 0 && video.currentTime >= transform.trimEnd) {
        video.currentTime = transform.trimStart || 0;
      }
    };

    video.addEventListener('timeupdate', handleTimeCheck);
    return () => video.removeEventListener('timeupdate', handleTimeCheck);
  }, [transform, videoRef]);

  // Drag to adjust Subtitle position X and Y directly on working area canvas
  const updateCaptionPositionFromEvent = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (!e.touches || e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;

    const percentX = Math.max(5, Math.min(95, Math.round((offsetX / rect.width) * 100)));
    const percentY = Math.max(5, Math.min(95, Math.round((offsetY / rect.height) * 100)));

    onStyleChange({
      positionXPercent: percentX,
      positionYPercent: percentY,
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDraggingCaption(true);
    updateCaptionPositionFromEvent(e);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingCaption) {
      updateCaptionPositionFromEvent(e);
    }
  };

  const handleMouseUp = () => {
    setIsDraggingCaption(false);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    setIsDraggingCaption(true);
    updateCaptionPositionFromEvent(e);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isDraggingCaption) {
      updateCaptionPositionFromEvent(e);
    }
  };

  const handleTouchEnd = () => {
    setIsDraggingCaption(false);
  };

  // Handler for Interactive Resize Handles Pointer Events
  const handleHandlePointerDown = (e: React.PointerEvent, handle: ResizeHandle) => {
    e.preventDefault();
    e.stopPropagation();

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    const startX = e.clientX;
    const startY = e.clientY;
    const startFontSize = style.fontSize || 48;
    const startMaxWords = style.maxWordsPerLine || 3;
    const startXPercent = style.positionXPercent ?? 50;
    const startYPercent = style.positionYPercent ?? 75;

    setActiveHandle(handle);
    setDragInfo({
      handle,
      fontSize: startFontSize,
      maxWords: startMaxWords,
      posX: startXPercent,
      posY: startYPercent,
    });

    const onPointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      if (handle === 'move') {
        let percentX = Math.max(5, Math.min(95, Math.round(startXPercent + (deltaX / rect.width) * 100)));
        let percentY = Math.max(5, Math.min(95, Math.round(startYPercent + (deltaY / rect.height) * 100)));

        // Snap to center X=50%
        if (Math.abs(percentX - 50) <= 2) {
          percentX = 50;
        }
        // Snap to preset Y positions (20%, 50%, 75%)
        if (Math.abs(percentY - 20) <= 2) percentY = 20;
        else if (Math.abs(percentY - 50) <= 2) percentY = 50;
        else if (Math.abs(percentY - 75) <= 2) percentY = 75;

        onStyleChange({
          positionXPercent: percentX,
          positionYPercent: percentY,
        });

        setDragInfo({
          handle,
          fontSize: startFontSize,
          maxWords: startMaxWords,
          posX: percentX,
          posY: percentY,
        });
      } else if (handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se' || handle === 'n' || handle === 's') {
        let deltaDistance = 0;
        if (handle === 'se') deltaDistance = (deltaX + deltaY) / 2;
        else if (handle === 'nw') deltaDistance = (-deltaX - deltaY) / 2;
        else if (handle === 'ne') deltaDistance = (deltaX - deltaY) / 2;
        else if (handle === 'sw') deltaDistance = (-deltaX + deltaY) / 2;
        else if (handle === 's') deltaDistance = deltaY;
        else if (handle === 'n') deltaDistance = -deltaY;

        const fontDelta = Math.round(deltaDistance * 0.4);
        const newFontSize = Math.max(16, Math.min(120, startFontSize + fontDelta));

        onStyleChange({
          fontSize: newFontSize,
        });

        setDragInfo({
          handle,
          fontSize: newFontSize,
          maxWords: startMaxWords,
          posX: startXPercent,
          posY: startYPercent,
        });
      } else if (handle === 'e' || handle === 'w') {
        const step = 28;
        const dir = handle === 'e' ? 1 : -1;
        const wordDelta = Math.floor((deltaX * dir) / step);
        const newMaxWords = Math.max(1, Math.min(8, startMaxWords + wordDelta));

        onStyleChange({
          maxWordsPerLine: newMaxWords,
        });

        setDragInfo({
          handle,
          fontSize: startFontSize,
          maxWords: newMaxWords,
          posX: startXPercent,
          posY: startYPercent,
        });
      }
    };

    const onPointerUp = () => {
      setActiveHandle(null);
      setDragInfo(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const watermarkXPercent = watermark?.positionXPercent ?? (
    watermark?.position === 'top-left' ? 12 :
    watermark?.position === 'top-right' ? 88 :
    watermark?.position === 'bottom-left' ? 12 :
    watermark?.position === 'bottom-right' ? 88 : 88
  );
  const watermarkYPercent = watermark?.positionYPercent ?? (
    watermark?.position === 'top-left' ? 8 :
    watermark?.position === 'top-right' ? 8 :
    watermark?.position === 'bottom-left' ? 92 :
    watermark?.position === 'bottom-right' ? 92 : 8
  );

  // Handler for Watermark Dragging & Resizing Pointer Events
  const handleWatermarkPointerDown = (e: React.PointerEvent, handle: ResizeHandle) => {
    e.preventDefault();
    e.stopPropagation();

    if (!canvasRef.current || !watermark) return;
    const rect = canvasRef.current.getBoundingClientRect();

    const startX = e.clientX;
    const startY = e.clientY;
    const startFontSize = watermark.fontSize || 28;
    const startXPercent = watermarkXPercent;
    const startYPercent = watermarkYPercent;

    setActiveWatermarkHandle(handle);
    setWatermarkDragInfo({
      fontSize: startFontSize,
      posX: startXPercent,
      posY: startYPercent,
    });

    const onPointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      if (handle === 'move') {
        let percentX = Math.max(5, Math.min(95, Math.round(startXPercent + (deltaX / rect.width) * 100)));
        let percentY = Math.max(5, Math.min(95, Math.round(startYPercent + (deltaY / rect.height) * 100)));

        // Snap guidelines
        if (Math.abs(percentX - 50) <= 2) percentX = 50;
        if (Math.abs(percentX - 12) <= 2) percentX = 12;
        if (Math.abs(percentX - 88) <= 2) percentX = 88;

        if (Math.abs(percentY - 8) <= 2) percentY = 8;
        if (Math.abs(percentY - 50) <= 2) percentY = 50;
        if (Math.abs(percentY - 92) <= 2) percentY = 92;

        onChangeWatermark?.({
          position: 'custom',
          positionXPercent: percentX,
          positionYPercent: percentY,
        });

        setWatermarkDragInfo({
          fontSize: startFontSize,
          posX: percentX,
          posY: percentY,
        });
      } else if (handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se' || handle === 'n' || handle === 's' || handle === 'e' || handle === 'w') {
        let deltaDistance = 0;
        if (handle === 'se') deltaDistance = (deltaX + deltaY) / 2;
        else if (handle === 'nw') deltaDistance = (-deltaX - deltaY) / 2;
        else if (handle === 'ne') deltaDistance = (deltaX - deltaY) / 2;
        else if (handle === 'sw') deltaDistance = (-deltaX + deltaY) / 2;
        else if (handle === 's' || handle === 'e') deltaDistance = Math.max(deltaX, deltaY);
        else if (handle === 'n' || handle === 'w') deltaDistance = -Math.min(deltaX, deltaY);

        const fontDelta = Math.round(deltaDistance * 0.35);
        const newFontSize = Math.max(14, Math.min(100, startFontSize + fontDelta));

        onChangeWatermark?.({
          fontSize: newFontSize,
        });

        setWatermarkDragInfo({
          fontSize: newFontSize,
          posX: startXPercent,
          posY: startYPercent,
        });
      }
    };

    const onPointerUp = () => {
      setActiveWatermarkHandle(null);
      setWatermarkDragInfo(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Render canvas loop with smooth requestAnimationFrame during playback
  useEffect(() => {
    let animId: number;

    const renderLoop = () => {
      if (canvasRef.current && videoRef.current) {
        const activeTime = isPlaying && videoRef.current ? videoRef.current.currentTime : currentTime;
        renderCanvasFrame({
          canvas: canvasRef.current,
          video: videoRef.current,
          currentTime: activeTime,
          blocks,
          style,
          filter,
          aspectRatio,
          transform,
          watermark,
        });
      }
      if (isPlaying) {
        animId = requestAnimationFrame(renderLoop);
      }
    };

    renderLoop();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, currentTime, blocks, style, filter, aspectRatio, transform, watermark, videoRef]);

  // Handle Drag & Drop file upload
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/')) {
        onVideoUpload(file);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const dims = getTargetDimensions(1080, 1920, aspectRatio);

  const activeBlock = blocks.find(
    b => currentTime >= b.start && currentTime <= b.end
  );

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
      {/* Top Controls Bar */}
      <div className="bg-slate-900/90 border-b border-slate-800 p-3 flex flex-wrap items-center justify-between gap-2">
        {/* Aspect Ratio Switcher & Framing Mode */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <Crop className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
            <button
              onClick={() => onAspectRatioChange('9:16')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                aspectRatio === '9:16' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
              }`}
            >
              9:16 Shorts
            </button>
            <button
              onClick={() => onAspectRatioChange('1:1')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                aspectRatio === '1:1' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
              }`}
            >
              1:1 Square
            </button>
            <button
              onClick={() => onAspectRatioChange('4:5')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                aspectRatio === '4:5' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
              }`}
            >
              4:5 Post
            </button>
            <button
              onClick={() => onAspectRatioChange('16:9')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                aspectRatio === '16:9' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
              }`}
            >
              16:9 Wide
            </button>
          </div>

          {/* Framing Mode Quick Switcher */}
          {onTransformChange && (
            <div className="flex items-center space-x-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
              <span className="text-[11px] font-bold text-slate-400 pl-1.5 pr-0.5">Framing:</span>
              <button
                onClick={() => onTransformChange({ framingMode: 'cover' })}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all ${
                  (transform?.framingMode || 'cover') === 'cover'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Fill & Crop: Scales video to cover vertical 9:16 screen"
              >
                📐 Fill Crop
              </button>
              <button
                onClick={() => onTransformChange({ framingMode: 'fit_blur' })}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all ${
                  transform?.framingMode === 'fit_blur'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Fit + Blur: Fits full wide video in center with blurred background (no black bars!)"
              >
                ✨ Fit + Blur
              </button>
              <button
                onClick={() =>
                  onTransformChange({
                    framingMode: 'dual_stack',
                    secondaryScale: transform?.secondaryScale || 1.9,
                    secondaryPanX: transform?.secondaryPanX ?? -35,
                    secondaryPanY: transform?.secondaryPanY ?? -20,
                  })
                }
                className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all ${
                  transform?.framingMode === 'dual_stack'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Dual Stack: Top streamer facecam + bottom gameplay"
              >
                ⚔️ Gaming Stack
              </button>
              <button
                onClick={() => {
                  const focal = detectSubjectFocalPoint(videoRef.current);
                  onTransformChange({
                    panX: focal.recommendedPanX,
                    panY: focal.recommendedPanY,
                    scale: Math.max(1.2, focal.recommendedScale),
                    framingMode: 'cover',
                  });
                }}
                className="px-2 py-0.5 rounded-lg text-[11px] font-black bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 hover:from-amber-400 hover:to-amber-500 transition-all shadow"
                title="AI Smart Crop: Automatically detects subject/speaker and centers the crop"
              >
                🎯 Smart Crop
              </button>
            </div>
          )}
        </div>

        {/* Safe Zone & Position Controls Bar */}
        <div className="flex items-center space-x-2">
          {/* Quick Position Presets */}
          <div className="hidden md:flex items-center space-x-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <Move className="w-3.5 h-3.5 text-amber-400 ml-1.5" />
            <button
              onClick={() => onStyleChange({ positionXPercent: 50, positionYPercent: 20 })}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                style.positionYPercent <= 30 ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
              title="Align Top"
            >
              Top
            </button>
            <button
              onClick={() => onStyleChange({ positionXPercent: 50, positionYPercent: 50 })}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                style.positionYPercent > 30 && style.positionYPercent < 70 ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
              title="Align Center"
            >
              Center
            </button>
            <button
              onClick={() => onStyleChange({ positionXPercent: 50, positionYPercent: 75 })}
              className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                style.positionYPercent >= 70 ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
              title="Align Bottom"
            >
              Bottom
            </button>
          </div>

          <button
            onClick={() => setShowSafeZone(!showSafeZone)}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
              showSafeZone
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Toggle Platform UI Safe Zone Overlays"
          >
            {showSafeZone ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Safe Zone</span>
          </button>

          <div className="bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 text-xs text-amber-300 font-mono font-bold flex items-center space-x-1">
            <Move className="w-3 h-3 text-amber-400" />
            <span>X:{style.positionXPercent ?? 50}% Y:{style.positionYPercent ?? 75}%</span>
          </div>
        </div>
      </div>

      {/* Main Canvas Frame Area */}
      <div
        ref={containerRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="relative flex-1 flex items-center justify-center p-4 bg-slate-950/80 overflow-hidden min-h-[380px]"
      >
        {videoUrl ? (
          <div
            className="relative shadow-2xl rounded-xl overflow-hidden group border border-slate-800 select-none"
            style={{
              aspectRatio: aspectRatio === '9:16' ? '9/16' : aspectRatio === '1:1' ? '1/1' : aspectRatio === '4:5' ? '4/5' : '16/9',
              maxHeight: '100%',
              maxWidth: '100%',
            }}
          >
            {/* Hidden Video Source */}
            <video
              ref={videoRef}
              src={videoUrl}
              className="hidden"
              playsInline
              muted={isMuted}
            />

            {/* Interactive Render Canvas */}
            <canvas
              ref={canvasRef}
              width={dims.width}
              height={dims.height}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="w-full h-full object-contain cursor-move touch-none"
              title="Click & Drag anywhere on the video to move caption position"
            />

            {/* Snap Guideline Overlay when moving */}
            {activeHandle === 'move' && (
              <>
                {/* Center Vertical Snap Line */}
                {(style.positionXPercent ?? 50) === 50 && (
                  <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-amber-400 border-r border-dashed border-amber-300 pointer-events-none z-20 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                )}
                {/* Horizontal Snap Lines */}
                {((style.positionYPercent ?? 75) === 20 || (style.positionYPercent ?? 75) === 50 || (style.positionYPercent ?? 75) === 75) && (
                  <div
                    className="absolute left-0 right-0 h-0.5 bg-amber-400 border-b border-dashed border-amber-300 pointer-events-none z-20 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                    style={{ top: `${style.positionYPercent}%` }}
                  />
                )}
              </>
            )}

            {/* Interactive Subtitle Bounding Box with 8 Resize Handles */}
            <div
              onMouseEnter={() => setIsHoveringBox(true)}
              onMouseLeave={() => setIsHoveringBox(false)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-75 select-none z-20 group/subtitle-box ${
                activeHandle || isHoveringBox
                  ? 'ring-2 ring-amber-400/90 shadow-[0_0_20px_rgba(251,191,36,0.25)] rounded-xl'
                  : 'ring-1 ring-amber-400/40 hover:ring-amber-400/80 rounded-xl'
              }`}
              style={{
                left: `${style.positionXPercent ?? 50}%`,
                top: `${style.positionYPercent ?? 75}%`,
              }}
            >
              {/* Box Center Interactive Drag Area */}
              <div
                onPointerDown={e => handleHandlePointerDown(e, 'move')}
                className="cursor-move p-3 flex flex-col items-center justify-center min-w-[150px] min-h-[44px] bg-slate-950/20 backdrop-blur-[1px] rounded-xl border border-dashed border-amber-400/50 hover:border-amber-400"
              >
                {/* Caption Sample / Real-Time Display */}
                <div className="text-center font-black tracking-wide text-amber-300 text-xs flex items-center justify-center space-x-1.5 opacity-95 drop-shadow">
                  <Move className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                  <span className="truncate max-w-[220px]">
                    {activeBlock
                      ? activeBlock.words.map(w => w.text).join(' ')
                      : 'SUBTITLE CONTAINER'}
                  </span>
                </div>

                {/* Dimension & Position Tag */}
                <div className="mt-1 text-[10px] font-mono text-amber-400/90 bg-slate-950/80 px-2 py-0.5 rounded-md border border-slate-800 flex items-center space-x-2">
                  <span>Font: {style.fontSize}px</span>
                  <span>•</span>
                  <span>{style.maxWordsPerLine} words/line</span>
                </div>
              </div>

              {/* Floating Quick Action Mini-Toolbar (Hover or Dragging) */}
              {(isHoveringBox || activeHandle) && (
                <div className="absolute -top-11 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-md border border-amber-500/40 rounded-xl p-1 shadow-2xl flex items-center space-x-1 z-30 text-white animate-in fade-in zoom-in-95 duration-100">
                  {/* Font Size decrease */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onStyleChange({ fontSize: Math.max(16, (style.fontSize || 48) - 4) });
                    }}
                    className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-amber-400 transition-colors"
                    title="Decrease Font Size (-4px)"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-mono font-bold px-1 text-amber-300">
                    {style.fontSize}px
                  </span>
                  {/* Font Size increase */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onStyleChange({ fontSize: Math.min(120, (style.fontSize || 48) + 4) });
                    }}
                    className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-amber-400 transition-colors"
                    title="Increase Font Size (+4px)"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>

                  <div className="w-px h-3.5 bg-slate-700 my-auto" />

                  {/* Words per line decrease */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onStyleChange({ maxWordsPerLine: Math.max(1, (style.maxWordsPerLine || 3) - 1) });
                    }}
                    className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-amber-400 transition-colors"
                    title="Fewer words per line (-1)"
                  >
                    <Type className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[9px] font-bold font-mono ml-0.5">-</span>
                  </button>
                  <span className="text-[10px] font-mono text-slate-300 font-bold">
                    {style.maxWordsPerLine}w
                  </span>
                  {/* Words per line increase */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onStyleChange({ maxWordsPerLine: Math.min(8, (style.maxWordsPerLine || 3) + 1) });
                    }}
                    className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-amber-400 transition-colors"
                    title="More words per line (+1)"
                  >
                    <Type className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[9px] font-bold font-mono ml-0.5">+</span>
                  </button>
                </div>
              )}

              {/* --- 8 INTERACTIVE RESIZE HANDLE DOTS --- */}
              {/* 1. NW Corner (Top-Left) */}
              <div
                onPointerDown={e => handleHandlePointerDown(e, 'nw')}
                className={`absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-amber-400 hover:bg-amber-300 border-2 border-slate-950 rounded-full shadow-lg cursor-nwse-resize z-30 transition-transform ${
                  activeHandle === 'nw' ? 'scale-150 bg-amber-300 ring-4 ring-amber-400/50' : 'hover:scale-125'
                }`}
                title="Drag corner to scale font size"
              />

              {/* 2. N Center (Top Edge) */}
              <div
                onPointerDown={e => handleHandlePointerDown(e, 'n')}
                className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-2.5 bg-amber-400 hover:bg-amber-300 border border-slate-950 rounded-full shadow-lg cursor-ns-resize z-30 transition-transform ${
                  activeHandle === 'n' ? 'scale-150 bg-amber-300 ring-4 ring-amber-400/50' : 'hover:scale-125'
                }`}
                title="Drag edge to scale font size"
              />

              {/* 3. NE Corner (Top-Right) */}
              <div
                onPointerDown={e => handleHandlePointerDown(e, 'ne')}
                className={`absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-amber-400 hover:bg-amber-300 border-2 border-slate-950 rounded-full shadow-lg cursor-nesw-resize z-30 transition-transform ${
                  activeHandle === 'ne' ? 'scale-150 bg-amber-300 ring-4 ring-amber-400/50' : 'hover:scale-125'
                }`}
                title="Drag corner to scale font size"
              />

              {/* 4. E Center (Right Edge - Width / Words) */}
              <div
                onPointerDown={e => handleHandlePointerDown(e, 'e')}
                className={`absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-4 bg-amber-400 hover:bg-amber-300 border border-slate-950 rounded-full shadow-lg cursor-ew-resize z-30 transition-transform ${
                  activeHandle === 'e' ? 'scale-150 bg-amber-300 ring-4 ring-amber-400/50' : 'hover:scale-125'
                }`}
                title="Drag right handle to change words per line (width)"
              />

              {/* 5. SE Corner (Bottom-Right) */}
              <div
                onPointerDown={e => handleHandlePointerDown(e, 'se')}
                className={`absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-amber-400 hover:bg-amber-300 border-2 border-slate-950 rounded-full shadow-lg cursor-nwse-resize z-30 transition-transform ${
                  activeHandle === 'se' ? 'scale-150 bg-amber-300 ring-4 ring-amber-400/50' : 'hover:scale-125'
                }`}
                title="Drag corner to scale font size"
              />

              {/* 6. S Center (Bottom Edge) */}
              <div
                onPointerDown={e => handleHandlePointerDown(e, 's')}
                className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-2.5 bg-amber-400 hover:bg-amber-300 border border-slate-950 rounded-full shadow-lg cursor-ns-resize z-30 transition-transform ${
                  activeHandle === 's' ? 'scale-150 bg-amber-300 ring-4 ring-amber-400/50' : 'hover:scale-125'
                }`}
                title="Drag edge to scale font size"
              />

              {/* 7. SW Corner (Bottom-Left) */}
              <div
                onPointerDown={e => handleHandlePointerDown(e, 'sw')}
                className={`absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-amber-400 hover:bg-amber-300 border-2 border-slate-950 rounded-full shadow-lg cursor-nesw-resize z-30 transition-transform ${
                  activeHandle === 'sw' ? 'scale-150 bg-amber-300 ring-4 ring-amber-400/50' : 'hover:scale-125'
                }`}
                title="Drag corner to scale font size"
              />

              {/* 8. W Center (Left Edge - Width / Words) */}
              <div
                onPointerDown={e => handleHandlePointerDown(e, 'w')}
                className={`absolute top-1/2 -left-1.5 -translate-y-1/2 w-2.5 h-4 bg-amber-400 hover:bg-amber-300 border border-slate-950 rounded-full shadow-lg cursor-ew-resize z-30 transition-transform ${
                  activeHandle === 'w' ? 'scale-150 bg-amber-300 ring-4 ring-amber-400/50' : 'hover:scale-125'
                }`}
                title="Drag left handle to change words per line (width)"
              />
            </div>

            {/* Interactive Draggable & Resizable Watermark Box Overlay */}
            {watermark?.enabled && watermark.text && (
              <div
                onMouseEnter={() => setIsHoveringWatermark(true)}
                onMouseLeave={() => setIsHoveringWatermark(false)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-75 select-none z-20 group/watermark-box ${
                  activeWatermarkHandle || isHoveringWatermark
                    ? 'ring-2 ring-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.35)] rounded-xl bg-slate-950/60'
                    : 'ring-1 ring-cyan-400/50 hover:ring-cyan-400 rounded-xl bg-slate-950/30'
                }`}
                style={{
                  left: `${watermarkXPercent}%`,
                  top: `${watermarkYPercent}%`,
                }}
              >
                {/* Center Interactive Drag Area */}
                <div
                  onPointerDown={e => handleWatermarkPointerDown(e, 'move')}
                  className="cursor-move px-3 py-1.5 flex items-center justify-center min-w-[110px] min-h-[32px] rounded-xl border border-dashed border-cyan-400/70 hover:border-cyan-300"
                >
                  <div className="text-center font-bold text-cyan-300 text-xs flex items-center justify-center space-x-1.5 drop-shadow">
                    <AtSign className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="truncate max-w-[180px] font-mono">{watermark.text}</span>
                  </div>
                </div>

                {/* Floating Quick Action Mini-Toolbar */}
                {(isHoveringWatermark || activeWatermarkHandle) && (
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-md border border-cyan-500/50 rounded-xl p-1 shadow-2xl flex items-center space-x-1 z-30 text-white whitespace-nowrap">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onChangeWatermark?.({ fontSize: Math.max(14, (watermark.fontSize || 28) - 2) });
                      }}
                      className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-cyan-400 transition-colors"
                      title="Decrease Watermark Size (-2px)"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-[10px] font-mono font-bold px-1 text-cyan-300">
                      {watermark.fontSize || 28}px
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onChangeWatermark?.({ fontSize: Math.min(100, (watermark.fontSize || 28) + 2) });
                      }}
                      className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-cyan-400 transition-colors"
                      title="Increase Watermark Size (+2px)"
                    >
                      <Plus className="w-3 h-3" />
                    </button>

                    <div className="w-px h-3 bg-slate-700 my-auto" />

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onChangeWatermark?.({ showShadow: !(watermark.showShadow ?? true) });
                      }}
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md border transition-all ${
                        (watermark.showShadow ?? true)
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                      title="Toggle Watermark Drop Shadow"
                    >
                      Shadow
                    </button>

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onChangeWatermark?.({ showBackgroundPill: !(watermark.showBackgroundPill ?? true) });
                      }}
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md border transition-all ${
                        (watermark.showBackgroundPill ?? true)
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                      title="Toggle Background Pill Badge"
                    >
                      Pill
                    </button>
                  </div>
                )}

                {/* Resize Corner Handles */}
                <div
                  onPointerDown={e => handleWatermarkPointerDown(e, 'nw')}
                  className={`absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-cyan-400 hover:bg-cyan-300 border border-slate-950 rounded-full cursor-nwse-resize z-30 transition-transform ${
                    activeWatermarkHandle === 'nw' ? 'scale-150 ring-2 ring-cyan-300' : 'hover:scale-125'
                  }`}
                  title="Drag handle to resize watermark"
                />
                <div
                  onPointerDown={e => handleWatermarkPointerDown(e, 'ne')}
                  className={`absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-cyan-400 hover:bg-cyan-300 border border-slate-950 rounded-full cursor-nesw-resize z-30 transition-transform ${
                    activeWatermarkHandle === 'ne' ? 'scale-150 ring-2 ring-cyan-300' : 'hover:scale-125'
                  }`}
                  title="Drag handle to resize watermark"
                />
                <div
                  onPointerDown={e => handleWatermarkPointerDown(e, 'se')}
                  className={`absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-cyan-400 hover:bg-cyan-300 border border-slate-950 rounded-full cursor-nwse-resize z-30 transition-transform ${
                    activeWatermarkHandle === 'se' ? 'scale-150 ring-2 ring-cyan-300' : 'hover:scale-125'
                  }`}
                  title="Drag handle to resize watermark"
                />
                <div
                  onPointerDown={e => handleWatermarkPointerDown(e, 'sw')}
                  className={`absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-cyan-400 hover:bg-cyan-300 border border-slate-950 rounded-full cursor-nesw-resize z-30 transition-transform ${
                    activeWatermarkHandle === 'sw' ? 'scale-150 ring-2 ring-cyan-300' : 'hover:scale-125'
                  }`}
                  title="Drag handle to resize watermark"
                />
              </div>
            )}

            {/* Platform Safe Zone Overlay */}
            <SafeZoneOverlay platform={platformPreset} visible={showSafeZone} />

            {/* Active Resize / Drag HUD Indicator */}
            {(activeHandle || isDraggingCaption) && dragInfo && (
              <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none z-30">
                <span className="bg-amber-500 text-slate-950 px-3.5 py-1 rounded-full text-xs font-black shadow-xl flex items-center space-x-2 border border-amber-300">
                  <Move className="w-3.5 h-3.5" />
                  <span>
                    Font: {dragInfo.fontSize}px | Words: {dragInfo.maxWords} | Pos: X:{dragInfo.posX}% Y:{dragInfo.posY}%
                  </span>
                </span>
              </div>
            )}

            {/* Active Watermark Drag HUD Indicator */}
            {activeWatermarkHandle && watermarkDragInfo && (
              <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none z-30">
                <span className="bg-cyan-500 text-slate-950 px-3.5 py-1 rounded-full text-xs font-black shadow-xl flex items-center space-x-2 border border-cyan-300">
                  <AtSign className="w-3.5 h-3.5" />
                  <span>
                    Watermark Size: {watermarkDragInfo.fontSize}px | Pos: X:{watermarkDragInfo.posX}% Y:{watermarkDragInfo.posY}%
                  </span>
                </span>
              </div>
            )}
          </div>
        ) : (
          /* Empty State / Upload Dropzone */
          <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-800 hover:border-amber-500/50 rounded-2xl transition-colors max-w-md w-full bg-slate-900/40 backdrop-blur-sm">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4 text-amber-400">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Upload Short or Reel Video</h3>
            <p className="text-xs text-slate-400 mb-6">
              Drag & drop MP4, WebM, MOV video or select file to create highlighted captions 100% offline.
            </p>
            <label className="cursor-pointer bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs shadow-lg shadow-amber-500/20 transition-all active:scale-95">
              <span>Select Video File</span>
              <input
                type="file"
                accept="video/*"
                onChange={e => e.target.files?.[0] && onVideoUpload(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>
        )}
      </div>

      {/* Video Scrubber & Playback Controls Bar */}
      {videoUrl && (
        <div className="bg-slate-900 border-t border-slate-800 p-3 space-y-2">
          {/* Timeline Scrubber */}
          <div className="flex items-center space-x-3">
            <span className="text-xs font-mono text-slate-400 w-12 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.01}
              value={currentTime}
              onChange={e => onSeek(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <span className="text-xs font-mono text-slate-400 w-12">
              {formatTime(duration)}
            </span>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {/* Skip Back 1s */}
              <button
                onClick={() => onSeek(Math.max(0, currentTime - 1))}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Rewind 1s"
              >
                <Rewind className="w-4 h-4" />
              </button>

              {/* Play / Pause */}
              <button
                onClick={onTogglePlay}
                className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow-md shadow-amber-500/20 active:scale-95"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-slate-950" /> : <Play className="w-5 h-5 fill-slate-950 ml-0.5" />}
              </button>

              {/* Skip Forward 1s */}
              <button
                onClick={() => onSeek(Math.min(duration, currentTime + 1))}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Forward 1s"
              >
                <FastForward className="w-4 h-4" />
              </button>

              {/* Reset to Start */}
              <button
                onClick={() => onSeek(0)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                title="Reset to 0:00"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Right Speed & Mute controls */}
            <div className="flex items-center space-x-2">
              {/* Playback Speed */}
              <select
                value={playbackRate}
                onChange={e => {
                  const rate = parseFloat(e.target.value);
                  setPlaybackRate(rate);
                  if (videoRef.current) videoRef.current.playbackRate = rate;
                }}
                className="bg-slate-800 border border-slate-700 text-xs text-slate-300 font-semibold rounded-lg px-2 py-1 focus:outline-none"
              >
                <option value={0.5}>0.5x</option>
                <option value={1}>1.0x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2.0x</option>
              </select>

              {/* Mute Toggle */}
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
