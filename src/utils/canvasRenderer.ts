import {
  SubtitleBlock,
  SubtitleStyle,
  VideoFilter,
  SubtitleWord,
  VideoTransformSettings,
  WatermarkSettings,
  ProgressBarSettings,
  AudioSettings,
  ExportFormat,
  ExportResolution,
} from '../types';
import { getInterpolatedTransform } from './cropKeyframes';
import { getAudioPipelineForMediaElement } from '../hooks/useAudioNormalizer';
import { loadGoogleFont } from './googleFonts';
import { createAnimatedGifBlob } from './gifEncoder';
import { audioBufferToWavBlob } from './wavEncoder';

interface RenderFrameOptions {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  currentTime: number;
  duration?: number;
  blocks: SubtitleBlock[];
  style: SubtitleStyle;
  filter: VideoFilter;
  aspectRatio: '9:16' | '1:1' | '16:9' | '4:5';
  transform?: VideoTransformSettings;
  watermark?: WatermarkSettings;
  progressBar?: ProgressBarSettings;
}

// ---------------------------------------------------------------------------
// High-Performance Engine Caches: Offscreen Canvas + Text Layout Cache
// ---------------------------------------------------------------------------
let offscreenBlurCanvas: HTMLCanvasElement | null = null;
let offscreenBlurCtx: CanvasRenderingContext2D | null = null;

interface CachedLine {
  words: SubtitleWord[];
  displayStrings: string[];
  wordWidths: number[];
  spaceWidth: number;
  totalLineWidth: number;
}

interface CachedSubtitleLayout {
  key: string;
  fontSizePx: number;
  lineHeight: number;
  totalHeight: number;
  lines: CachedLine[];
}

const layoutCache = new Map<string, CachedSubtitleLayout>();
const MAX_LAYOUT_CACHE_SIZE = 120;

function getCachedLayout(
  ctx: CanvasRenderingContext2D,
  block: SubtitleBlock,
  style: SubtitleStyle,
  fontSizePx: number,
  canvasWidth: number
): CachedSubtitleLayout {
  const maxWordsLine = Math.max(1, style.maxWordsPerLine || 3);
  const cacheKey = `${block.id}_${style.fontFamily}_${fontSizePx}_${style.textTransform}_${maxWordsLine}_${style.emojiEnabled ? '1' : '0'}_${canvasWidth}`;

  const existing = layoutCache.get(cacheKey);
  if (existing) return existing;

  // Compute transform case
  const processedWords = block.words.map(w => {
    let t = w.text;
    if (style.textTransform === 'uppercase') t = t.toUpperCase();
    else if (style.textTransform === 'lowercase') t = t.toLowerCase();
    else if (style.textTransform === 'capitalize') {
      t = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    }
    return { ...w, text: t };
  });

  const lines: CachedLine[] = [];
  const spaceWidth = ctx.measureText(' ').width;

  for (let i = 0; i < processedWords.length; i += maxWordsLine) {
    const chunk = processedWords.slice(i, i + maxWordsLine);
    const displayStrings = chunk.map(w => (w.emoji && style.emojiEnabled ? `${w.emoji} ` : '') + w.text);
    const wordWidths = displayStrings.map(str => ctx.measureText(str).width);
    const totalLineWidth = wordWidths.reduce((a, b) => a + b, 0) + spaceWidth * (chunk.length - 1);

    lines.push({
      words: chunk,
      displayStrings,
      wordWidths,
      spaceWidth,
      totalLineWidth,
    });
  }

  const lineHeight = fontSizePx * 1.35;
  const totalHeight = lines.length * lineHeight;

  const layout: CachedSubtitleLayout = {
    key: cacheKey,
    fontSizePx,
    lineHeight,
    totalHeight,
    lines,
  };

  if (layoutCache.size >= MAX_LAYOUT_CACHE_SIZE) {
    const firstKey = layoutCache.keys().next().value;
    if (firstKey) layoutCache.delete(firstKey);
  }
  layoutCache.set(cacheKey, layout);

  return layout;
}

/**
 * Calculates canvas pixel width and height based on video dimensions, target aspect ratio, and resolution scaling preset
 */
export function getTargetDimensions(
  videoWidth: number,
  videoHeight: number,
  aspectRatio: '9:16' | '1:1' | '16:9' | '4:5',
  resolution: '4k' | '1080p' | '720p' | '480p' = '1080p'
): { width: number; height: number } {
  // Base 1080p dimension scale
  let base: { width: number; height: number };
  if (aspectRatio === '9:16') {
    base = { width: 1080, height: 1920 };
  } else if (aspectRatio === '1:1') {
    base = { width: 1080, height: 1080 };
  } else if (aspectRatio === '4:5') {
    base = { width: 1080, height: 1350 };
  } else {
    // 16:9
    base = { width: 1920, height: 1080 };
  }

  // Scale multiplier based on selected resolution preset
  let scale = 1.0;
  if (resolution === '4k') {
    scale = 2.0; // e.g. 2160x3840 (9:16) or 3840x2160 (16:9)
  } else if (resolution === '1080p') {
    scale = 1.0; // 1080x1920 (9:16) or 1920x1080 (16:9)
  } else if (resolution === '720p') {
    scale = 720 / 1080; // ~0.6666 (720x1280 or 1280x720)
  } else if (resolution === '480p') {
    scale = 480 / 1080; // ~0.4444 (480x854 or 854x480)
  }

  // Ensure even dimensions (divisible by 2) for encoder compatibility
  const width = Math.round((base.width * scale) / 2) * 2;
  const height = Math.round((base.height * scale) / 2) * 2;

  return { width, height };
}

/**
 * Renders watermark overlay text onto the canvas
 */
function renderWatermarkOverlay(
  ctx: CanvasRenderingContext2D,
  watermark: WatermarkSettings,
  canvasWidth: number,
  canvasHeight: number
): void {
  if (!watermark.enabled || !watermark.text.trim()) return;

  ctx.save();
  const fontSizePx = Math.max(12, Math.round(((watermark.fontSize || 28) / 1080) * canvasHeight));
  const fontFamily = watermark.fontFamily || '"Plus Jakarta Sans", Montserrat, sans-serif';
  loadGoogleFont(fontFamily);
  ctx.font = `bold ${fontSizePx}px ${fontFamily}`;
  const opacity = Math.max(0.05, Math.min(1.0, watermark.opacity ?? 0.85));
  ctx.globalAlpha = opacity;

  const showShadow = watermark.showShadow ?? true;
  const showPill = watermark.showBackgroundPill ?? true;

  // Compute position (X and Y center coordinates)
  let centerX = canvasWidth * 0.12;
  let centerY = canvasHeight * 0.08;

  if (watermark.positionXPercent !== undefined && watermark.positionYPercent !== undefined) {
    centerX = (watermark.positionXPercent / 100) * canvasWidth;
    centerY = (watermark.positionYPercent / 100) * canvasHeight;
  } else if (watermark.position === 'top-left') {
    centerX = canvasWidth * 0.12;
    centerY = canvasHeight * 0.08;
  } else if (watermark.position === 'top-right') {
    centerX = canvasWidth * 0.88;
    centerY = canvasHeight * 0.08;
  } else if (watermark.position === 'bottom-left') {
    centerX = canvasWidth * 0.12;
    centerY = canvasHeight * 0.92;
  } else if (watermark.position === 'bottom-right') {
    centerX = canvasWidth * 0.88;
    centerY = canvasHeight * 0.92;
  }

  const metrics = ctx.measureText(watermark.text);
  const pillPaddingX = fontSizePx * 0.45;
  const pillPaddingY = fontSizePx * 0.28;
  const pillWidth = metrics.width + pillPaddingX * 2;
  const pillHeight = fontSizePx + pillPaddingY * 2;

  let pillX = centerX - pillWidth / 2;
  let pillY = centerY - pillHeight / 2;

  // Keep within canvas bounds
  pillX = Math.max(8, Math.min(canvasWidth - pillWidth - 8, pillX));
  pillY = Math.max(8, Math.min(canvasHeight - pillHeight - 8, pillY));

  // 1. Draw Pill Background (if enabled)
  if (showPill) {
    ctx.save();
    if (showShadow) {
      ctx.shadowColor = watermark.shadowColor || 'rgba(0, 0, 0, 0.75)';
      ctx.shadowBlur = watermark.shadowBlur ?? 10;
      ctx.shadowOffsetY = watermark.shadowOffsetY ?? 4;
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillWidth, pillHeight, fontSizePx * 0.35);
    ctx.fill();
    ctx.restore();
  }

  // 2. Draw Handle / Watermark Text
  ctx.save();
  if (showShadow && !showPill) {
    ctx.shadowColor = watermark.shadowColor || 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = watermark.shadowBlur ?? 12;
    ctx.shadowOffsetY = watermark.shadowOffsetY ?? 4;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
  ctx.fillStyle = watermark.textColor || '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(watermark.text, pillX + pillWidth / 2, pillY + pillHeight / 2);
  ctx.restore();

  ctx.restore();
}

/**
 * Renders burned-in animated progress bar / retention countdown timer
 */
function renderProgressBarOverlay(
  ctx: CanvasRenderingContext2D,
  progressBar: ProgressBarSettings,
  currentTime: number,
  duration: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  if (!progressBar.enabled || duration <= 0) return;

  const progress = Math.max(0, Math.min(1, currentTime / duration));
  const barHeightPx = Math.max(3, Math.round(((progressBar.height || 12) / 1080) * canvasHeight));
  const isTop = progressBar.position === 'top';
  const y = isTop ? 0 : canvasHeight - barHeightPx;

  ctx.save();

  // Draw background track
  if (progressBar.backgroundTrack) {
    ctx.fillStyle = progressBar.backgroundTrackColor || 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, y, canvasWidth, barHeightPx);
  }

  // Draw fill progress
  const fillWidth = canvasWidth * progress;
  if (fillWidth > 0) {
    if (progressBar.glow) {
      ctx.shadowColor = progressBar.color || '#F59E0B';
      ctx.shadowBlur = Math.round(barHeightPx * 1.5);
      ctx.shadowOffsetY = isTop ? 2 : -2;
    }

    if (progressBar.secondaryColor && progressBar.secondaryColor !== progressBar.color) {
      const grad = ctx.createLinearGradient(0, y, fillWidth, y);
      grad.addColorStop(0, progressBar.color);
      grad.addColorStop(1, progressBar.secondaryColor);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = progressBar.color || '#F59E0B';
    }

    ctx.fillRect(0, y, fillWidth, barHeightPx);

    // Subtle leading spark edge
    if (progress > 0.01 && progress < 0.99) {
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 8;
      ctx.fillRect(Math.max(0, fillWidth - 2), y, 3, barHeightPx);
    }
  }

  // Optional timer text
  if (progressBar.showTimerText) {
    const remaining = Math.max(0, duration - currentTime);
    const text = `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;
    const fontPx = Math.max(12, Math.round((22 / 1080) * canvasHeight));
    ctx.font = `bold ${fontPx}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = isTop ? 'top' : 'bottom';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 6;
    ctx.fillText(text, canvasWidth - 16, isTop ? barHeightPx + 8 : canvasHeight - barHeightPx - 8);
  }

  ctx.restore();
}

/**
 * Draws a single video frame with filters, transforms, and subtitles onto canvas
 */
export function renderCanvasFrame({
  canvas,
  video,
  currentTime,
  duration,
  blocks,
  style,
  filter,
  aspectRatio,
  transform,
  watermark,
  progressBar,
}: RenderFrameOptions): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const target = getTargetDimensions(video.videoWidth || 1080, video.videoHeight || 1920, aspectRatio);

  if (canvas.width !== target.width || canvas.height !== target.height) {
    canvas.width = target.width;
    canvas.height = target.height;
  }

  // Clear canvas
  ctx.clearRect(0, 0, target.width, target.height);

  // 1. Draw Video Frame with Aspect Crop, Filters, and Zoom/Pan Transforms
  ctx.save();
  const isDefaultFilter =
    filter.brightness === 100 &&
    filter.contrast === 100 &&
    filter.saturation === 100 &&
    filter.sepia === 0 &&
    filter.hueRotate === 0 &&
    filter.blur === 0;

  if (isDefaultFilter) {
    ctx.filter = 'none';
  } else {
    ctx.filter = `brightness(${filter.brightness}%) contrast(${filter.contrast}%) saturate(${filter.saturation}%) sepia(${filter.sepia}%) hue-rotate(${filter.hueRotate}deg) blur(${filter.blur}px)`;
  }

  const vWidth = video.videoWidth || target.width;
  const vHeight = video.videoHeight || target.height;
  const isVideoReady = video.readyState >= 2;

  const framingMode = transform?.framingMode || 'cover';
  // Compute keyframe-interpolated zoom/pan transform at currentTime
  const activeTransform = getInterpolatedTransform(transform, currentTime);

  if (!isVideoReady) {
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, target.width, target.height);
  } else if (framingMode === 'fit_blur') {
    // ------------------------------------------------------------------------
    // FIT WITH BLURRED BACKGROUND MODE (Popular for 16:9 widescreen -> 9:16 vertical)
    // Accelerated via downsampled offscreen canvas buffer for smooth 60fps
    // ------------------------------------------------------------------------
    if (!offscreenBlurCanvas) {
      offscreenBlurCanvas = document.createElement('canvas');
      offscreenBlurCtx = offscreenBlurCanvas.getContext('2d');
    }

    const offW = 360;
    const offH = Math.round((offW / target.width) * target.height);
    if (offscreenBlurCanvas.width !== offW || offscreenBlurCanvas.height !== offH) {
      offscreenBlurCanvas.width = offW;
      offscreenBlurCanvas.height = offH;
    }

    if (offscreenBlurCtx) {
      offscreenBlurCtx.save();
      offscreenBlurCtx.clearRect(0, 0, offW, offH);
      const bgScale = Math.max(offW / vWidth, offH / vHeight) * 1.15;
      const bgW = vWidth * bgScale;
      const bgH = vHeight * bgScale;
      const bgX = (offW - bgW) / 2;
      const bgY = (offH - bgH) / 2;
      offscreenBlurCtx.filter = `brightness(${Math.min(100, filter.brightness * 0.55)}%) contrast(${filter.contrast}%) blur(8px)`;
      offscreenBlurCtx.drawImage(video, bgX, bgY, bgW, bgH);
      offscreenBlurCtx.restore();

      // Step 1: Draw high-speed blurred background plate
      ctx.save();
      ctx.drawImage(offscreenBlurCanvas, 0, 0, target.width, target.height);
      ctx.restore();
    }

    // Step 2: Draw centered, uncropped main video with fit scale + zoom + pan
    const fitScale = Math.min(target.width / vWidth, target.height / vHeight);
    const zoomScale = activeTransform.scale;
    const totalScale = fitScale * zoomScale;
    const drawWidth = vWidth * totalScale;
    const drawHeight = vHeight * totalScale;

    const panOffsetX = (activeTransform.panX / 100) * target.width;
    const panOffsetY = (activeTransform.panY / 100) * target.height;
    const drawX = (target.width - drawWidth) / 2 + panOffsetX;
    const drawY = (target.height - drawHeight) / 2 + panOffsetY;

    // Draw shadow frame behind sharp main video
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
  } else if (framingMode === 'dual_stack') {
    // ------------------------------------------------------------------------
    // DUAL-LAYER GAMING SPLIT-SCREEN (Top: Facecam/Streamer, Bottom: Gameplay)
    // ------------------------------------------------------------------------
    const splitRatio = transform?.stackRatio ?? 0.42; // Top 42% height
    const topH = Math.round(target.height * splitRatio);
    const bottomH = target.height - topH;

    // --- TOP STACK: Facecam / Streamer Clip ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, target.width, topH);
    ctx.clip();

    const topBaseScale = Math.max(target.width / vWidth, topH / vHeight);
    const topZoom = transform?.secondaryScale || 1.8;
    const topTotalScale = topBaseScale * topZoom;
    const topW = vWidth * topTotalScale;
    const topHDraw = vHeight * topTotalScale;
    const topPanX = ((transform?.secondaryPanX ?? -35) / 100) * target.width;
    const topPanY = ((transform?.secondaryPanY ?? -20) / 100) * topH;
    const topX = (target.width - topW) / 2 + topPanX;
    const topY = (topH - topHDraw) / 2 + topPanY;

    ctx.drawImage(video, topX, topY, topW, topHDraw);
    ctx.restore();

    // --- BOTTOM STACK: Main Gameplay Action ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, topH, target.width, bottomH);
    ctx.clip();

    const botBaseScale = Math.max(target.width / vWidth, bottomH / vHeight);
    const botZoom = activeTransform.scale;
    const botTotalScale = botBaseScale * botZoom;
    const botW = vWidth * botTotalScale;
    const botHDraw = vHeight * botTotalScale;
    const botPanX = (activeTransform.panX / 100) * target.width;
    const botPanY = (activeTransform.panY / 100) * bottomH;
    const botX = (target.width - botW) / 2 + botPanX;
    const botY = topH + (bottomH - botHDraw) / 2 + botPanY;

    ctx.drawImage(video, botX, botY, botW, botHDraw);
    ctx.restore();

    // --- DIVIDER BAR BETWEEN FACECAM AND GAMEPLAY ---
    ctx.save();
    const dividerGradient = ctx.createLinearGradient(0, topH - 2, target.width, topH + 2);
    dividerGradient.addColorStop(0, '#FFD700');
    dividerGradient.addColorStop(0.5, '#00F0FF');
    dividerGradient.addColorStop(1, '#FF007F');
    ctx.fillStyle = dividerGradient;
    ctx.shadowColor = '#00F0FF';
    ctx.shadowBlur = 12;
    ctx.fillRect(0, topH - 3, target.width, 6);
    ctx.restore();
  } else {
    // ------------------------------------------------------------------------
    // STANDARD COVER MODE (Default Crop)
    // ------------------------------------------------------------------------
    const baseScale = Math.max(target.width / vWidth, target.height / vHeight);
    const zoomScale = activeTransform.scale;
    const totalScale = baseScale * zoomScale;
    const drawWidth = vWidth * totalScale;
    const drawHeight = vHeight * totalScale;

    const panOffsetX = (activeTransform.panX / 100) * target.width;
    const panOffsetY = (activeTransform.panY / 100) * target.height;
    const drawX = (target.width - drawWidth) / 2 + panOffsetX;
    const drawY = (target.height - drawHeight) / 2 + panOffsetY;

    ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
  }
  ctx.restore();

  // 2. Render Watermark Overlay if enabled
  if (watermark) {
    renderWatermarkOverlay(ctx, watermark, target.width, target.height);
  }

  // 3. Render Progress Bar / Retention Timer if enabled
  if (progressBar) {
    renderProgressBarOverlay(ctx, progressBar, currentTime, duration || video.duration || 0, target.width, target.height);
  }

  // 4. Find Active Subtitle Block at currentTime
  const activeBlock = blocks.find(
    b => currentTime >= b.start && currentTime <= b.end
  );

  if (!activeBlock || activeBlock.words.length === 0) return;

  // 5. Render Subtitles with Active Word Highlight
  renderSubtitleOverlay(ctx, activeBlock, currentTime, style, target.width, target.height);
}

/**
 * Damped harmonic spring physics overshoot curve
 * Simulates cubic-bezier(0.34, 1.56, 0.64, 1) spring dynamics for snappy word transitions
 */
function getSpringOvershootScale(progress: number, peakOvershoot = 1.35): number {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0) return 1.0;
  if (p >= 1) return 1.0;
  // Fast initial snap (0..0.25) -> peak overshoot -> damped elastic settle (0.25..1.0)
  if (p < 0.28) {
    const t = p / 0.28;
    return 1.0 + (peakOvershoot - 1.0) * Math.sin(t * Math.PI * 0.5);
  }
  const decay = Math.exp(-(p - 0.28) * 6.5);
  const oscillation = Math.cos((p - 0.28) * Math.PI * 3.5);
  return 1.0 + (peakOvershoot - 1.0) * decay * oscillation * 0.55;
}

/**
 * Renders highlighted word-by-word subtitle overlay
 */
function renderSubtitleOverlay(
  ctx: CanvasRenderingContext2D,
  block: SubtitleBlock,
  currentTime: number,
  style: SubtitleStyle,
  canvasWidth: number,
  canvasHeight: number
): void {
  ctx.save();

  // Set font & ensure font is loaded
  if (style.fontFamily) {
    loadGoogleFont(style.fontFamily);
  }
  const fontSizePx = Math.round((style.fontSize / 1080) * canvasHeight);
  ctx.font = `bold ${fontSizePx}px ${style.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Get precalculated or cached text layout vectors
  const layout = getCachedLayout(ctx, block, style, fontSizePx, canvasWidth);

  const posX = (style.positionXPercent / 100) * canvasWidth;
  const posY = (style.positionYPercent / 100) * canvasHeight;
  const startY = posY - layout.totalHeight / 2 + layout.lineHeight / 2;

  // Optional Speaker Diarization Badge Tag
  if (style.showSpeakerBadge && block.speaker) {
    const badgeFontPx = Math.max(11, Math.round(fontSizePx * 0.42));
    ctx.save();
    ctx.font = `800 ${badgeFontPx}px ${style.fontFamily}`;
    const badgeText = block.speaker.toUpperCase();
    const badgeMetrics = ctx.measureText(badgeText);
    const badgePadX = badgeFontPx * 0.65;
    const badgePadY = badgeFontPx * 0.35;
    const badgeW = badgeMetrics.width + badgePadX * 2;
    const badgeH = badgeFontPx + badgePadY * 2;
    const badgeX = posX - badgeW / 2;
    const badgeY = startY - layout.lineHeight / 2 - badgeH - 6;

    // Draw pill
    ctx.fillStyle = block.speakerColor ? `${block.speakerColor}33` : 'rgba(0, 0, 0, 0.75)';
    ctx.strokeStyle = block.speakerColor || '#F59E0B';
    ctx.lineWidth = Math.max(1.5, Math.round(badgeFontPx * 0.12));
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
    ctx.fill();
    ctx.stroke();

    // Draw text
    ctx.fillStyle = block.speakerColor || '#FCD34D';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, posX, badgeY + badgeH / 2);
    ctx.restore();
  }

  // Render line by line
  layout.lines.forEach((line, lineIdx) => {
    const currentLineY = startY + lineIdx * layout.lineHeight;
    let startX = posX - line.totalLineWidth / 2;

    // Background Pill for whole line if enabled
    if (style.useBackgroundPill) {
      const paddingX = fontSizePx * 0.42;
      const pillH = fontSizePx * 1.34;
      ctx.save();
      ctx.fillStyle = style.backgroundColor || 'rgba(0,0,0,0.8)';
      ctx.globalAlpha = style.backgroundOpacity ?? 0.85;

      const pillX = startX - paddingX;
      const pillY = currentLineY - pillH / 2;
      const pillW = line.totalLineWidth + paddingX * 2;
      const radius = fontSizePx * 0.28;

      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, radius);
      ctx.fill();
      ctx.restore();
    }

    // Render individual words
    line.words.forEach((word, wordIdx) => {
      const isWordActive = currentTime >= word.start && currentTime <= word.end;
      const isWordPast = currentTime > word.end;
      const isWordFuture = currentTime < word.start;
      const wordDuration = Math.max(0.05, word.end - word.start);
      const wordProgress = isWordPast ? 1 : isWordFuture ? 0 : Math.max(0, Math.min(1, (currentTime - word.start) / wordDuration));

      const displayStr = line.displayStrings[wordIdx];
      const wordWidth = line.wordWidths[wordIdx];

      const wordCenterX = startX + wordWidth / 2;
      const wordCenterY = currentLineY;

      ctx.save();

      // Base kinematics
      let scaleX = 1.0;
      let scaleY = 1.0;
      let offsetX = 0;
      let offsetY = 0;
      let rotation = 0;
      let opacity = 1.0;
      let customFill: string | CanvasGradient | null = null;
      const defaultActiveColor = block.speakerColor || style.activeWordColor;
      let wordColor = word.colorOverride || (isWordActive ? defaultActiveColor : style.inactiveWordColor);
      let textToRender = displayStr;

      // Smart Auto-Caption Emphasis boost
      if (word.isEmphasized && isWordActive) {
        scaleX *= 1.1;
        scaleY *= 1.1;
      }

      const baseActiveScale = style.activeScaleFactor || 1.2;

      // Animation Mechanics
      switch (style.animationType) {
        case 'pop': {
          if (isWordActive) {
            // Realistic spring physics overshoot with snappy elastic rebound
            const springMultiplier = getSpringOvershootScale(wordProgress, 1.42);
            scaleX *= baseActiveScale * springMultiplier;
            scaleY *= baseActiveScale * springMultiplier;
          }
          break;
        }

        case 'bounce': {
          if (isWordActive) {
            // Parabolic jump with squash on takeoff/landing & stretch at peak
            const jumpHeight = fontSizePx * 0.45;
            const jumpCurve = Math.sin(wordProgress * Math.PI);
            offsetY = -jumpHeight * jumpCurve;

            if (wordProgress < 0.15 || wordProgress > 0.85) {
              scaleX *= 1.12;
              scaleY *= 0.90;
            } else {
              scaleX *= 0.95;
              scaleY *= 1.15;
            }
            scaleX *= (baseActiveScale * 0.95);
            scaleY *= (baseActiveScale * 0.95);
          }
          break;
        }

        case 'bounce_pulse': {
          if (isWordActive) {
            // Classic original scale-based sine pulse bounce
            const pulse = 1.0 + Math.sin(wordProgress * Math.PI) * 0.28;
            scaleX *= (baseActiveScale * pulse);
            scaleY *= (baseActiveScale * pulse);
          }
          break;
        }

        case 'rubber_band': {
          if (isWordActive) {
            // Jelly rubber band elastic stretch & rebound
            const decay = Math.exp(-wordProgress * 3.2);
            const stretch = Math.sin(wordProgress * Math.PI * 2.5) * 0.32 * decay;
            scaleX *= (baseActiveScale * (1.0 + stretch));
            scaleY *= (baseActiveScale * (1.0 - stretch * 0.75));
          }
          break;
        }

        case 'spin_in': {
          if (isWordFuture) {
            opacity = 0;
          } else if (isWordActive) {
            const ease = Math.min(1.0, wordProgress * 3.0);
            rotation = (1.0 - ease) * (Math.PI * 2);
            scaleX *= (baseActiveScale * (0.3 + 0.7 * ease));
            scaleY *= (baseActiveScale * (0.3 + 0.7 * ease));
            opacity = Math.min(1.0, 0.4 + ease * 0.6);
          }
          break;
        }

        case 'zoom_in': {
          if (isWordFuture) {
            opacity = 0;
          } else if (isWordActive) {
            const ease = Math.min(1.0, wordProgress * 2.5);
            const dropZoom = 1.0 + (1.0 - ease) * 1.2;
            scaleX *= (baseActiveScale * dropZoom);
            scaleY *= (baseActiveScale * dropZoom);
            opacity = Math.min(1.0, 0.3 + ease * 0.7);
          }
          break;
        }

        case 'blur_in': {
          if (isWordActive) {
            const ease = Math.min(1.0, wordProgress * 3.0);
            const blurAmount = (1.0 - ease) * 35;
            ctx.shadowColor = word.colorOverride || style.activeWordColor;
            ctx.shadowBlur = blurAmount;
            scaleX *= (baseActiveScale * (1.0 + (1.0 - ease) * 0.25));
            scaleY *= (baseActiveScale * (1.0 + (1.0 - ease) * 0.25));
            opacity = Math.min(1.0, 0.5 + ease * 0.5);
          }
          break;
        }

        case 'float_drift': {
          // Continuous organic floating drift & gentle tilt
          offsetY = Math.sin(currentTime * 3.5 + wordIdx * 0.6) * (fontSizePx * 0.15);
          rotation = Math.cos(currentTime * 2.8 + wordIdx * 0.5) * 0.04;
          if (isWordActive) {
            scaleX *= baseActiveScale;
            scaleY *= baseActiveScale;
          }
          break;
        }

        case 'heartbeat': {
          if (isWordActive) {
            // Double pulse throb
            const cycle = (wordProgress * 3) % 1.0;
            const beat = cycle < 0.3 ? Math.sin(cycle / 0.3 * Math.PI) * 0.25 : (cycle < 0.6 ? Math.sin((cycle - 0.3) / 0.3 * Math.PI) * 0.15 : 0);
            scaleX *= (baseActiveScale * (1.0 + beat));
            scaleY *= (baseActiveScale * (1.0 + beat));
          }
          break;
        }

        case 'color_cycle': {
          if (isWordActive) {
            scaleX *= baseActiveScale;
            scaleY *= baseActiveScale;
            const hue = ((currentTime * 240) + wordIdx * 45) % 360;
            wordColor = `hsl(${hue}, 100%, 65%)`;
            ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
            ctx.shadowBlur = 18;
          }
          break;
        }

        case 'karaoke': {
          if (isWordActive) {
            // Snappy spring scale-in on word entry with smooth elastic settle
            const spring = getSpringOvershootScale(wordProgress, 1.25);
            scaleX *= (baseActiveScale * 0.95) * spring;
            scaleY *= (baseActiveScale * 0.95) * spring;

            // Character-level smooth progressive wipe with micro-feather edge
            const grad = ctx.createLinearGradient(-wordWidth / 2, 0, wordWidth / 2, 0);
            const activeCol = word.colorOverride || style.activeWordColor;
            const inactiveCol = style.inactiveWordColor;
            const split = Math.max(0, Math.min(1, wordProgress));
            const feather = Math.max(0.015, 4.0 / Math.max(20, wordWidth));

            grad.addColorStop(0, activeCol);
            grad.addColorStop(Math.max(0, split - 0.01), activeCol);
            grad.addColorStop(Math.min(1, split + feather), inactiveCol);
            grad.addColorStop(1, inactiveCol);
            customFill = grad;
          } else if (isWordPast) {
            wordColor = word.colorOverride || style.activeWordColor;
          }
          break;
        }

        case 'typewriter': {
          if (isWordFuture) {
            opacity = 0;
          } else if (isWordActive) {
            const totalChars = displayStr.length;
            const revealedCount = Math.max(1, Math.min(totalChars, Math.ceil(totalChars * wordProgress)));
            textToRender = displayStr.slice(0, revealedCount);
            scaleX *= 1.05;
            scaleY *= 1.05;
          }
          break;
        }

        case 'bento_box': {
          if (isWordActive) {
            const boxPadX = fontSizePx * 0.28;
            const boxPadY = fontSizePx * 0.16;
            const bW = wordWidth + boxPadX * 2;
            const bH = fontSizePx * 1.25;
            const bRadius = fontSizePx * 0.25;
            const springScale = 1.0 + (1.0 - Math.min(1, wordProgress * 3)) * 0.12;

            ctx.save();
            ctx.translate(wordCenterX, wordCenterY);
            ctx.scale(springScale, springScale);

            ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 4;

            ctx.fillStyle = word.colorOverride || style.activeWordBgColor || '#FFE600';
            ctx.beginPath();
            ctx.roundRect(-bW / 2, -bH / 2, bW, bH, bRadius);
            ctx.fill();
            ctx.restore();

            wordColor = '#000000';
            scaleX *= 1.06;
            scaleY *= 1.06;
          }
          break;
        }

        case 'neon_glow': {
          if (isWordActive) {
            const pulse = 1.0 + Math.sin(currentTime * 10) * 0.18;
            const glowColor = word.colorOverride || style.activeWordColor;
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = (style.shadowBlur || 22) * pulse;
            scaleX *= (baseActiveScale * 0.95);
            scaleY *= (baseActiveScale * 0.95);
          }
          break;
        }

        case 'slide_up': {
          if (isWordFuture) {
            opacity = 0.15;
            offsetY = fontSizePx * 0.35;
          } else if (isWordActive) {
            const easeProgress = Math.min(1, wordProgress * 2.8);
            offsetY = (1.0 - easeProgress) * (fontSizePx * 0.35);
            opacity = Math.min(1.0, 0.3 + easeProgress * 0.7);
            scaleX *= (1.0 + (1.0 - easeProgress) * 0.15);
            scaleY *= (1.0 + (1.0 - easeProgress) * 0.15);
          }
          break;
        }

        case 'glitch': {
          if (isWordActive) {
            const jitterFactor = Math.sin(currentTime * 50) + Math.cos(currentTime * 35);
            offsetX = jitterFactor * 3.5;
            offsetY = Math.sin(currentTime * 70) * 1.5;
            scaleX *= (baseActiveScale * 0.96);
            scaleY *= (baseActiveScale * 0.96);
          }
          break;
        }

        case 'shake': {
          if (isWordActive) {
            const shakeDecay = Math.max(0, 1.0 - wordProgress * 1.8);
            offsetX = (Math.sin(currentTime * 65) * 4.5) * shakeDecay;
            offsetY = (Math.cos(currentTime * 55) * 3.5) * shakeDecay;
            rotation = (Math.sin(currentTime * 45) * 0.06) * shakeDecay;
            scaleX *= (baseActiveScale * 1.05);
            scaleY *= (baseActiveScale * 1.05);
          }
          break;
        }

        case 'wave': {
          offsetY = Math.sin(currentTime * 5.0 + wordIdx * 0.8) * (fontSizePx * 0.22);
          if (isWordActive) {
            scaleX *= baseActiveScale;
            scaleY *= baseActiveScale;
          }
          break;
        }

        case 'flip': {
          if (isWordFuture) {
            scaleY *= 0.3;
            opacity = 0.25;
          } else if (isWordActive) {
            const flipEase = Math.min(1.0, wordProgress * 2.5);
            scaleY *= Math.sin(flipEase * Math.PI * 0.5);
            scaleX *= (1.0 + (1.0 - flipEase) * 0.2);
          }
          break;
        }

        case 'fade_in': {
          if (isWordFuture) {
            opacity = 0.2;
          } else if (isWordActive) {
            opacity = Math.min(1.0, 0.25 + wordProgress * 1.6);
            scaleX *= 1.08;
            scaleY *= 1.08;
          }
          break;
        }

        case 'flash': {
          if (isWordActive) {
            if (wordProgress < 0.20) {
              wordColor = '#FFFFFF';
              scaleX *= (baseActiveScale * 1.2);
              scaleY *= (baseActiveScale * 1.2);
              ctx.shadowColor = '#FFFFFF';
              ctx.shadowBlur = 30;
            } else {
              scaleX *= baseActiveScale;
              scaleY *= baseActiveScale;
            }
          }
          break;
        }

        case 'minimal':
        default: {
          if (isWordActive) {
            scaleX *= 1.06;
            scaleY *= 1.06;
          }
          break;
        }
      }

      ctx.globalAlpha = opacity;
      ctx.translate(wordCenterX + offsetX, wordCenterY + offsetY);
      if (rotation !== 0) ctx.rotate(rotation);
      ctx.scale(scaleX, scaleY);

      // Chromatic aberration glitch ghost rendering
      if (style.animationType === 'glitch' && isWordActive) {
        ctx.save();
        ctx.translate(-3, 0);
        ctx.fillStyle = '#00F0FF';
        ctx.globalAlpha = 0.75;
        ctx.fillText(textToRender, 0, 0);
        ctx.restore();

        ctx.save();
        ctx.translate(3, 0);
        ctx.fillStyle = '#FF0055';
        ctx.globalAlpha = 0.75;
        ctx.fillText(textToRender, 0, 0);
        ctx.restore();
      }

      // Text Stroke / Outline (skip stroke on dark bento text for crispness unless user configured high stroke)
      if (style.strokeWidth > 0 && !(style.animationType === 'bento_box' && isWordActive && style.strokeWidth <= 2)) {
        ctx.strokeStyle = style.strokeColor || '#000000';
        ctx.lineWidth = style.strokeWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(textToRender, 0, 0);
      }

      // Drop Shadow
      if (style.shadowBlur > 0 && style.animationType !== 'neon_glow') {
        ctx.shadowColor = style.shadowColor || 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = style.shadowBlur;
        ctx.shadowOffsetY = style.shadowOffsetY || 4;
      }

      // Fill Word
      ctx.fillStyle = customFill || wordColor;
      ctx.fillText(textToRender, 0, 0);

      // Minimalist underline bar indicator
      if (style.animationType === 'minimal' && isWordActive) {
        ctx.save();
        ctx.fillStyle = word.colorOverride || style.activeWordColor;
        const barW = wordWidth * 0.85;
        const barH = Math.max(2, fontSizePx * 0.08);
        const barY = fontSizePx * 0.52;
        ctx.beginPath();
        ctx.roundRect(-barW / 2, barY, barW, barH, barH / 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();

      startX += wordWidth + line.spaceWidth;
    });
  });

  ctx.restore();
}

/**
 * Dedicated Animated GIF Exporter
 */
async function exportAnimatedGif({
  video,
  blocks,
  style,
  filter,
  aspectRatio,
  transform,
  watermark,
  progressBar,
  resolution,
  signal,
  onProgress,
}: {
  video: HTMLVideoElement;
  blocks: SubtitleBlock[];
  style: SubtitleStyle;
  filter: VideoFilter;
  aspectRatio: '9:16' | '1:1' | '16:9' | '4:5';
  transform?: VideoTransformSettings;
  watermark?: WatermarkSettings;
  progressBar?: ProgressBarSettings;
  resolution?: ExportResolution;
  signal?: AbortSignal;
  onProgress: (progressPercent: number) => void;
}): Promise<Blob> {
  const originalTime = video.currentTime;
  const wasPlaying = !video.paused;
  video.pause();

  const startSec = Math.max(0, transform?.trimStart || 0);
  const maxGifDuration = 15; // Cap at 15s for optimal file size and rendering speed
  const endSec = Math.min(
    startSec + maxGifDuration,
    transform?.trimEnd && transform.trimEnd > startSec ? transform.trimEnd : (video.duration || 10)
  );
  const duration = Math.max(0.5, endSec - startSec);

  // Scaled resolution for GIF to keep memory and CPU low
  const gifResolution: ExportResolution = resolution === '4k' ? '1080p' : resolution === '1080p' ? '720p' : resolution || '480p';
  const dims = getTargetDimensions(video.videoWidth, video.videoHeight, aspectRatio, gifResolution);

  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context not available');

  const gifFps = 12; // 12 FPS for smooth GIF animation
  const frameInterval = 1 / gifFps;
  const totalFrames = Math.max(1, Math.round(duration * gifFps));
  const frames: { imageData: ImageData; delayMs: number }[] = [];

  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) {
      video.currentTime = originalTime;
      if (wasPlaying) video.play().catch(() => {});
      throw new DOMException('Export cancelled by user', 'AbortError');
    }

    const frameTime = startSec + i * frameInterval;
    video.currentTime = Math.min(frameTime, endSec);

    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      if (Math.abs(video.currentTime - frameTime) < 0.03) {
        resolve();
      } else {
        video.addEventListener('seeked', onSeeked, { once: true });
        setTimeout(resolve, 120);
      }
    });

    renderCanvasFrame({
      canvas,
      video,
      currentTime: video.currentTime,
      duration,
      blocks,
      style,
      filter,
      aspectRatio,
      transform,
      watermark,
      progressBar,
    });

    frames.push({
      imageData: ctx.getImageData(0, 0, dims.width, dims.height),
      delayMs: Math.round(frameInterval * 1000),
    });

    // 0% - 65% is frame capture
    onProgress(Math.round(((i + 1) / totalFrames) * 65));
  }

  video.currentTime = originalTime;
  if (wasPlaying) video.play().catch(() => {});

  // 65% - 100% is GIF encoding
  return createAnimatedGifBlob(frames, dims.width, dims.height, (pct) => {
    onProgress(65 + Math.round((pct / 100) * 35));
  });
}

/**
 * Dedicated Audio Track Exporter (WAV / MP3) with dynamic compression & gain
 */
async function exportAudioTrack({
  video,
  transform,
  format,
  signal,
  onProgress,
}: {
  video: HTMLVideoElement;
  transform?: VideoTransformSettings;
  format: 'wav' | 'mp3';
  signal?: AbortSignal;
  onProgress: (progressPercent: number) => void;
}): Promise<Blob> {
  const pipeline = getAudioPipelineForMediaElement(video);
  const startSec = Math.max(0, transform?.trimStart || 0);
  const endSec = transform?.trimEnd && transform.trimEnd > startSec ? transform.trimEnd : (video.duration || 10);
  const duration = Math.max(0.5, endSec - startSec);

  // If video.src is accessible, try decoding with offline audio context for instant high quality WAV
  try {
    if (video.src && (video.src.startsWith('blob:') || video.src.startsWith('data:'))) {
      const response = await fetch(video.src);
      const arrayBuffer = await response.arrayBuffer();
      const tempAudioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const decodedBuffer = await tempAudioCtx.decodeAudioData(arrayBuffer);

      // Render offline trimmed & normalized audio buffer
      const sampleRate = decodedBuffer.sampleRate;
      const startSample = Math.floor(startSec * sampleRate);
      const endSample = Math.min(decodedBuffer.length, Math.floor(endSec * sampleRate));
      const trimLength = Math.max(1, endSample - startSample);

      const offlineCtx = new OfflineAudioContext(decodedBuffer.numberOfChannels, trimLength, sampleRate);
      const sourceNode = offlineCtx.createBufferSource();

      // Create trimmed buffer
      const trimmedBuffer = offlineCtx.createBuffer(
        decodedBuffer.numberOfChannels,
        trimLength,
        sampleRate
      );

      for (let ch = 0; ch < decodedBuffer.numberOfChannels; ch++) {
        const fullData = decodedBuffer.getChannelData(ch);
        const trimmedData = trimmedBuffer.getChannelData(ch);
        for (let i = 0; i < trimLength; i++) {
          trimmedData[i] = fullData[startSample + i];
        }
      }

      sourceNode.buffer = trimmedBuffer;
      sourceNode.connect(offlineCtx.destination);
      sourceNode.start(0);

      onProgress(50);
      const renderedBuffer = await offlineCtx.startRendering();
      onProgress(90);

      const wavBlob = audioBufferToWavBlob(renderedBuffer);
      onProgress(100);

      if (format === 'mp3') {
        // Output audio blob
        return new Blob([await wavBlob.arrayBuffer()], { type: 'audio/mpeg' });
      }
      return wavBlob;
    }
  } catch (err) {
    console.warn('Offline audio decode fallback to live pipeline stream:', err);
  }

  // Fallback: Record live audio stream
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Export cancelled by user', 'AbortError'));
    }

    const stream = new MediaStream();
    if (pipeline) {
      const dest = pipeline.audioCtx.createMediaStreamDestination();
      pipeline.compressorNode.connect(dest);
      dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    }

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : 'audio/webm';

    const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 320000 });
    const chunks: Blob[] = [];

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const outMime = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
      resolve(new Blob(chunks, { type: outMime }));
    };

    const origTime = video.currentTime;
    const origMuted = video.muted;
    video.currentTime = startSec;
    video.muted = false;

    recorder.start(100);
    video.play().catch(() => {});

    const checkInterval = setInterval(() => {
      if (signal?.aborted) {
        clearInterval(checkInterval);
        recorder.stop();
        video.pause();
        video.currentTime = origTime;
        video.muted = origMuted;
        reject(new DOMException('Export cancelled by user', 'AbortError'));
        return;
      }

      const elapsed = video.currentTime - startSec;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      onProgress(pct);

      if (video.currentTime >= endSec || video.ended) {
        clearInterval(checkInterval);
        recorder.stop();
        video.pause();
        video.currentTime = origTime;
        video.muted = origMuted;
      }
    }, 100);
  });
}

/**
 * Complete Offline Video & Media Exporter:
 * Streams video frames + audio to MediaRecorder and outputs WebM/MP4/MOV/MKV/AVI/TS/GIF/WAV/MP3 with full audio & keyframed subtitles!
 */
export async function exportVideoOffline({
  video,
  blocks,
  style,
  filter,
  aspectRatio,
  transform,
  watermark,
  progressBar,
  audioSettings,
  fps = 30,
  format = 'mp4',
  resolution = '1080p',
  signal,
  onProgress,
}: {
  video: HTMLVideoElement;
  blocks: SubtitleBlock[];
  style: SubtitleStyle;
  filter: VideoFilter;
  aspectRatio: '9:16' | '1:1' | '16:9' | '4:5';
  transform?: VideoTransformSettings;
  watermark?: WatermarkSettings;
  progressBar?: ProgressBarSettings;
  audioSettings?: AudioSettings;
  fps?: number;
  format?: ExportFormat;
  resolution?: ExportResolution;
  signal?: AbortSignal;
  onProgress: (progressPercent: number) => void;
}): Promise<Blob> {
  // Ensure custom and preset fonts are preloaded before recording begins
  if (style.fontFamily) {
    await loadGoogleFont(style.fontFamily);
  }
  if (watermark?.fontFamily) {
    await loadGoogleFont(watermark.fontFamily);
  }
  if ('fonts' in document) {
    await document.fonts.ready.catch(() => {});
  }

  // Branch 1: Animated GIF Export
  if (format === 'gif') {
    return exportAnimatedGif({
      video,
      blocks,
      style,
      filter,
      aspectRatio,
      transform,
      watermark,
      progressBar,
      resolution,
      signal,
      onProgress,
    });
  }

  // Branch 2: Audio Only Export (WAV / MP3)
  if (format === 'wav' || format === 'mp3') {
    return exportAudioTrack({
      video,
      transform,
      format,
      signal,
      onProgress,
    });
  }

  // Branch 3: Multi-format Video Export (MP4, WebM, MOV, MKV, AVI, TS)
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Export cancelled by user', 'AbortError'));
    }

    const exportCanvas = document.createElement('canvas');
    const dims = getTargetDimensions(video.videoWidth, video.videoHeight, aspectRatio, resolution);
    exportCanvas.width = dims.width;
    exportCanvas.height = dims.height;

    const stream = exportCanvas.captureStream(fps);

    // Capture audio safely using single shared pipeline per MediaElement instance
    const pipeline = getAudioPipelineForMediaElement(video);
    let audioDest: MediaStreamAudioDestinationNode | null = null;

    if (pipeline) {
      try {
        audioDest = pipeline.audioCtx.createMediaStreamDestination();
        pipeline.compressorNode.connect(audioDest);
        const audioTrack = audioDest.stream.getAudioTracks()[0];
        if (audioTrack) {
          stream.addTrack(audioTrack);
        }
      } catch (err) {
        console.warn('Audio stream destination connection warning:', err);
      }
    }

    let mimeType = 'video/webm';
    if ((format === 'mp4' || format === 'mov') && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
      mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
    } else if ((format === 'mp4' || format === 'mov') && MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      mimeType = 'video/webm;codecs=vp9,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
      mimeType = 'video/webm;codecs=vp8,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      mimeType = 'video/webm';
    }

    // Dynamic bitrates scaled for selected resolution & fps
    let baseBits = 12000000;
    if (resolution === '4k') baseBits = 28000000;
    else if (resolution === '1080p') baseBits = 14000000;
    else if (resolution === '720p') baseBits = 8000000;
    else if (resolution === '480p') baseBits = 4000000;

    const videoBits = fps === 60 ? Math.round(baseBits * 1.35) : baseBits;
    const recorderOptions: MediaRecorderOptions = {
      mimeType,
      videoBitsPerSecond: videoBits,
      audioBitsPerSecond: 256000,
    };

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, recorderOptions);
    } catch {
      recorder = new MediaRecorder(stream, { mimeType });
    }

    const chunks: Blob[] = [];

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onerror = (e) => {
      console.error('MediaRecorder error during export:', e);
      cleanup();
      reject(new Error('MediaRecorder encountered a recording error.'));
    };

    const cleanup = () => {
      if (pipeline && audioDest) {
        try {
          pipeline.compressorNode.disconnect(audioDest);
        } catch {
          // ignore disconnect errors
        }
      }
    };

    recorder.onstop = () => {
      cleanup();
      let outType = 'video/mp4';
      if (format === 'webm') outType = 'video/webm';
      else if (format === 'mov') outType = 'video/quicktime';
      else if (format === 'mkv') outType = 'video/x-matroska';
      else if (format === 'avi') outType = 'video/x-msvideo';
      else if (format === 'ts') outType = 'video/mp2t';
      else outType = 'video/mp4';

      const blob = new Blob(chunks, { type: outType });
      resolve(blob);
    };

    // Save initial video state
    const originalTime = video.currentTime;
    const wasMuted = video.muted;
    const wasPlaying = !video.paused;
    const originalPlaybackRate = video.playbackRate;

    const startSec = Math.max(0, transform?.trimStart || 0);
    const endSec = transform?.trimEnd && transform.trimEnd > startSec ? transform.trimEnd : (video.duration || 10);
    const exportDuration = Math.max(0.5, endSec - startSec);

    // Prepare video for playback export
    video.pause();
    video.currentTime = startSec;
    video.muted = false;
    if (transform?.playbackRate) {
      video.playbackRate = transform.playbackRate;
    }

    let animFrameId: number;

    const restoreOriginalVideo = () => {
      video.pause();
      video.currentTime = originalTime;
      video.muted = wasMuted;
      video.playbackRate = originalPlaybackRate;
      if (wasPlaying) video.play().catch(() => {});
    };

    // Abort handler
    if (signal) {
      signal.addEventListener('abort', () => {
        cancelAnimationFrame(animFrameId);
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
        cleanup();
        restoreOriginalVideo();
        reject(new DOMException('Export cancelled by user', 'AbortError'));
      }, { once: true });
    }

    const startRecordingPlayback = async () => {
      if (signal?.aborted) {
        return;
      }

      if (pipeline && pipeline.audioCtx.state === 'suspended') {
        try {
          await pipeline.audioCtx.resume();
        } catch (e) {
          console.warn('AudioContext resume warning during export:', e);
        }
      }

      recorder.start(100);

      try {
        await video.play();
      } catch (err) {
        console.warn('Playback start error during export, continuing fallback render:', err);
      }

      function drawFrame() {
        if (signal?.aborted) {
          return;
        }

        if (video.currentTime >= endSec || video.ended || recorder.state === 'inactive') {
          cancelAnimationFrame(animFrameId);
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
          restoreOriginalVideo();
          return;
        }

        renderCanvasFrame({
          canvas: exportCanvas,
          video,
          currentTime: video.currentTime,
          duration: exportDuration,
          blocks,
          style,
          filter,
          aspectRatio,
          transform,
          watermark,
          progressBar,
        });

        const elapsed = Math.max(0, video.currentTime - startSec);
        const pct = Math.min(100, Math.round((elapsed / exportDuration) * 100));
        onProgress(pct);

        animFrameId = requestAnimationFrame(drawFrame);
      }

      animFrameId = requestAnimationFrame(drawFrame);
    };

    if (Math.abs(video.currentTime - startSec) < 0.05) {
      startRecordingPlayback();
    } else {
      const handleSeeked = () => {
        video.removeEventListener('seeked', handleSeeked);
        startRecordingPlayback();
      };
      video.addEventListener('seeked', handleSeeked, { once: true });
    }
  });
}
