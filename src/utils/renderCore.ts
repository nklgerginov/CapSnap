import {
  SubtitleBlock,
  SubtitleStyle,
  VideoFilter,
  SubtitleWord,
  VideoTransformSettings,
  WatermarkSettings,
  ProgressBarSettings,
  AspectRatio,
  ExportResolution,
} from '../types';
import { getInterpolatedTransform } from './cropKeyframes';
import { loadGoogleFont } from './googleFonts';

export type AnyCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type AnyImageSource = HTMLVideoElement | ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

export interface RenderToContextOptions {
  ctx: AnyCanvasContext;
  canvasWidth: number;
  canvasHeight: number;
  source: AnyImageSource;
  sourceWidth: number;
  sourceHeight: number;
  currentTime: number;
  duration?: number;
  blocks: SubtitleBlock[];
  style: SubtitleStyle;
  filter: VideoFilter;
  aspectRatio: AspectRatio;
  transform?: VideoTransformSettings;
  watermark?: WatermarkSettings;
  progressBar?: ProgressBarSettings;
  resolution?: ExportResolution;
}

// ---------------------------------------------------------------------------
// High-Performance Engine Caches: Offscreen Blur Buffer + Text Layout Cache
// ---------------------------------------------------------------------------
let offscreenBlurBuffer: OffscreenCanvas | HTMLCanvasElement | null = null;
let offscreenBlurCtx: AnyCanvasContext | null = null;

export interface CachedLine {
  words: SubtitleWord[];
  displayStrings: string[];
  wordWidths: number[];
  spaceWidth: number;
  totalLineWidth: number;
}

export interface CachedSubtitleLayout {
  key: string;
  fontSizePx: number;
  lineHeight: number;
  totalHeight: number;
  lines: CachedLine[];
}

const layoutCache = new Map<string, CachedSubtitleLayout>();
const MAX_LAYOUT_CACHE_SIZE = 150;

export function clearLayoutCache(): void {
  layoutCache.clear();
}

export function getCachedLayout(
  ctx: AnyCanvasContext,
  block: SubtitleBlock,
  style: SubtitleStyle,
  fontSizePx: number,
  canvasWidth: number
): CachedSubtitleLayout {
  const maxWordsLine = Math.max(1, style.maxWordsPerLine || 3);
  const wordsFingerprint = block.words
    .map(w => `${w.id}:${w.text}:${w.start}:${w.end}:${w.colorOverride || ''}:${w.isEmphasized ? 1 : 0}:${w.emoji || ''}`)
    .join('|');
  const cacheKey = `${block.id}_${wordsFingerprint}_${style.fontFamily}_${fontSizePx}_${style.textTransform}_${maxWordsLine}_${style.emojiEnabled ? '1' : '0'}_${canvasWidth}`;

  const existing = layoutCache.get(cacheKey);
  if (existing) return existing;

  const processedWords = block.words.map(w => {
    let t = w.text;
    if (style.textTransform === 'uppercase') t = t.toUpperCase();
    else if (style.textTransform === 'lowercase') t = t.toLowerCase();
    else if (style.textTransform === 'capitalize') {
      t = t.charAt(0).toUpperCase() + t.slice(1);
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
  resolution: '4k' | '1080p' | '720p' | '480p' | 'source' = '1080p'
): { width: number; height: number } {
  if (resolution === 'source' && videoWidth > 0 && videoHeight > 0) {
    const srcRatio = videoWidth / videoHeight;
    let targetRatio = 16 / 9;
    if (aspectRatio === '9:16') targetRatio = 9 / 16;
    else if (aspectRatio === '1:1') targetRatio = 1;
    else if (aspectRatio === '4:5') targetRatio = 4 / 5;

    // If matching aspect ratio, use direct native dimensions
    if (Math.abs(srcRatio - targetRatio) < 0.02) {
      return {
        width: Math.round(videoWidth / 2) * 2,
        height: Math.round(videoHeight / 2) * 2,
      };
    }

    // Fit within bounding box keeping target ratio
    const maxDim = Math.max(videoWidth, videoHeight);
    let w: number;
    let h: number;
    if (targetRatio < 1) {
      // vertical
      h = maxDim;
      w = Math.round(h * targetRatio);
    } else {
      // horizontal
      w = maxDim;
      h = Math.round(w / targetRatio);
    }
    return {
      width: Math.round(w / 2) * 2,
      height: Math.round(h / 2) * 2,
    };
  }

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
    scale = 2.0;
  } else if (resolution === '1080p') {
    scale = 1.0;
  } else if (resolution === '720p') {
    scale = 720 / 1080;
  } else if (resolution === '480p') {
    scale = 480 / 1080;
  }

  // Ensure even dimensions (divisible by 2) for encoder compatibility
  const width = Math.round((base.width * scale) / 2) * 2;
  const height = Math.round((base.height * scale) / 2) * 2;

  return { width, height };
}

/**
  * Renders watermark overlay text onto the canvas
  */
export function renderWatermarkOverlay(
  ctx: AnyCanvasContext,
  watermark: WatermarkSettings,
  canvasWidth: number,
  canvasHeight: number
): void {
  if (!watermark.enabled || !watermark.text.trim()) return;

  ctx.save();
  const fontSizePx = Math.max(12, Math.round(((watermark.fontSize || 28) / 1080) * canvasHeight));
  const fontFamily = watermark.fontFamily || '"Plus Jakarta Sans", Montserrat, sans-serif';
  if (typeof document !== 'undefined') {
    loadGoogleFont(fontFamily);
  }
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
export function renderProgressBarOverlay(
  ctx: AnyCanvasContext,
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
  * Damped harmonic spring physics overshoot curve
  */
export function getSpringOvershootScale(progress: number, peakOvershoot = 1.35): number {
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0) return 1.0;
  if (p >= 1) return 1.0;
  if (p < 0.28) {
    const t = p / 0.28;
    return 1.0 + (peakOvershoot - 1.0) * Math.sin(t * Math.PI * 0.5);
  }
  const decay = Math.exp(-(p - 0.28) * 6.5);
  const oscillation = Math.cos((p - 0.28) * Math.PI * 3.5);
  return 1.0 + (peakOvershoot - 1.0) * decay * oscillation * 0.55;
}

/**
 * Helper to draw glowing 4-point diamond star sparkle
 */
function drawDiamondSparkle(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  size: number,
  color: string,
  rotation = 0
): void {
  if (size <= 0.5) return;
  ctx.save();
  ctx.translate(cx, cy);
  if (rotation !== 0) ctx.rotate(rotation);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(0, 0, size, 0);
  ctx.quadraticCurveTo(0, 0, 0, size);
  ctx.quadraticCurveTo(0, 0, -size, 0);
  ctx.quadraticCurveTo(0, 0, 0, -size);
  ctx.closePath();
  ctx.fill();

  // Micro core glow
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1, size * 0.28), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Helper to draw comic book starburst POW polygon badge
 */
function drawComicBurstPolygon(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  h: number,
  fillColor: string,
  strokeColor: string,
  strokeW: number
): void {
  const points = 14;
  const outerRx = (w / 2) * 1.38;
  const outerRy = (h / 2) * 1.48;
  const innerRx = outerRx * 0.68;
  const innerRy = outerRy * 0.68;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const isOuter = i % 2 === 0;
    const rx = isOuter ? outerRx : innerRx;
    const ry = isOuter ? outerRy : innerRy;
    const px = Math.cos(angle) * rx;
    const py = Math.sin(angle) * ry;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  ctx.fillStyle = fillColor;
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fill();

  if (strokeW > 0) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeW;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Helper to draw branching electric lightning bolts
 */
function drawLightningArc(
  ctx: AnyCanvasContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  seed: number
): void {
  const steps = 6;
  const points: { x: number; y: number }[] = [{ x: x1, y: y1 }];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const perpX = -dy / (dist || 1);
  const perpY = dx / (dist || 1);

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const jitter = Math.sin(seed * 19.3 + i * 4.7) * (dist * 0.22);
    points.push({
      x: x1 + dx * t + perpX * jitter,
      y: y1 + dy * t + perpY * jitter,
    });
  }
  points.push({ x: x2, y: y2 });

  ctx.save();
  // Outer glow pass
  ctx.strokeStyle = color;
  ctx.lineWidth = width * 2.2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();

  // White electric core
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(1, width * 0.6);
  ctx.shadowBlur = 4;
  ctx.stroke();
  ctx.restore();
}

/**
 * Helper to draw tactical sci-fi crosshair brackets
 */
function drawTacticalCrosshairs(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  h: number,
  color: string,
  progress: number
): void {
  ctx.save();
  const easeP = Math.min(1.0, progress * 2.5);
  const armL = Math.max(8, h * 0.35);
  const padX = (w / 2) * (1.25 - 0.15 * easeP);
  const padY = (h / 2) * (1.35 - 0.15 * easeP);

  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, Math.round(h * 0.06));
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.lineCap = 'square';

  // 4 Corner brackets [ ]
  // Top-Left
  ctx.beginPath();
  ctx.moveTo(cx - padX, cy - padY + armL);
  ctx.lineTo(cx - padX, cy - padY);
  ctx.lineTo(cx - padX + armL, cy - padY);
  ctx.stroke();

  // Top-Right
  ctx.beginPath();
  ctx.moveTo(cx + padX - armL, cy - padY);
  ctx.lineTo(cx + padX, cy - padY);
  ctx.lineTo(cx + padX, cy - padY + armL);
  ctx.stroke();

  // Bottom-Left
  ctx.beginPath();
  ctx.moveTo(cx - padX, cy + padY - armL);
  ctx.lineTo(cx - padX, cy + padY);
  ctx.lineTo(cx - padX + armL, cy + padY);
  ctx.stroke();

  // Bottom-Right
  ctx.beginPath();
  ctx.moveTo(cx + padX - armL, cy + padY);
  ctx.lineTo(cx + padX, cy + padY);
  ctx.lineTo(cx + padX, cy + padY - armL);
  ctx.stroke();

  // Center Red Targeting Dot
  ctx.fillStyle = '#EF4444';
  ctx.beginPath();
  ctx.arc(cx, cy - padY - 6, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Helper to draw realistic torn washi tape sticker strip
 */
function drawWashiTapeBadge(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  h: number,
  fillColor: string,
  tiltAngle = -0.03
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tiltAngle);

  const halfW = (w / 2) * 1.18;
  const halfH = (h / 2) * 1.25;

  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = fillColor;

  // Draw jagged torn paper edges
  ctx.beginPath();
  ctx.moveTo(-halfW, -halfH);
  // Top straight edge
  ctx.lineTo(halfW, -halfH);
  // Right jagged edge
  ctx.lineTo(halfW + 4, -halfH + halfH * 0.5);
  ctx.lineTo(halfW - 2, 0);
  ctx.lineTo(halfW + 5, halfH * 0.5);
  ctx.lineTo(halfW, halfH);
  // Bottom straight edge
  ctx.lineTo(-halfW, halfH);
  // Left jagged edge
  ctx.lineTo(-halfW - 3, halfH * 0.5);
  ctx.lineTo(-halfW + 2, 0);
  ctx.lineTo(-halfW - 5, -halfH * 0.5);
  ctx.closePath();
  ctx.fill();

  // Translucent washi texture line
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.stroke();
  ctx.restore();
}

/**
 * Helper to draw floating 3D Golden VIP Crown
 */
function drawFloatingCrown(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  size: number,
  color: string,
  time: number
): void {
  ctx.save();
  const bob = Math.sin(time * 6) * (size * 0.12);
  ctx.translate(cx, cy + bob);

  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
  ctx.shadowBlur = 12;

  const w = size * 1.2;
  const h = size * 0.65;

  ctx.beginPath();
  ctx.moveTo(-w / 2, h / 2);
  ctx.lineTo(-w / 2, -h * 0.3);
  ctx.lineTo(-w * 0.25, 0);
  ctx.lineTo(0, -h * 0.7); // Middle tall peak
  ctx.lineTo(w * 0.25, 0);
  ctx.lineTo(w / 2, -h * 0.3);
  ctx.lineTo(w / 2, h / 2);
  ctx.closePath();
  ctx.fill();

  // Crown jewels
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(-w / 2, -h * 0.3, size * 0.08, 0, Math.PI * 2);
  ctx.arc(0, -h * 0.7, size * 0.1, 0, Math.PI * 2);
  ctx.arc(w / 2, -h * 0.3, size * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Helper to draw 3D Glossy Candy Pill
 */
function drawGlossy3DBubble(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  h: number,
  color: string,
  radius: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const halfW = w / 2;
  const halfH = h / 2;

  // Base Pill Fill
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-halfW, -halfH, w, h, radius);
  ctx.fill();

  // Top Specular Glass Curve Highlight
  ctx.shadowColor = 'transparent';
  const topGrad = ctx.createLinearGradient(0, -halfH, 0, 0);
  topGrad.addColorStop(0, 'rgba(255,255,255,0.75)');
  topGrad.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  topGrad.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = topGrad;
  ctx.beginPath();
  ctx.roundRect(-halfW + 3, -halfH + 3, w - 6, halfH * 0.88, [radius * 0.8, radius * 0.8, 2, 2]);
  ctx.fill();

  // Crisp rim highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-halfW, -halfH, w, h, radius);
  ctx.stroke();
  ctx.restore();
}

/**
 * Helper to draw Meteor Impact Crater, Ground Cracks & Molten Debris
 */
function drawMeteorImpactCrater(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  // Expanding seismic ground fracture lines
  const crackCount = 7;
  ctx.strokeStyle = '#FF4500';
  ctx.shadowColor = '#FF0000';
  ctx.shadowBlur = 16 * glowMul;
  ctx.lineWidth = Math.max(1.5, fontSizePx * 0.06);

  const expand = Math.min(1.0, progress * 2.0);
  for (let i = 0; i < crackCount; i++) {
    const angle = (i * (Math.PI * 2)) / crackCount + 0.2;
    const len = (w * 0.55 + fontSizePx * 0.4) * expand;
    ctx.beginPath();
    ctx.moveTo(0, fontSizePx * 0.2);
    const midX = Math.cos(angle) * (len * 0.5) + (Math.sin(i * 3.5) * 8);
    const midY = fontSizePx * 0.2 + Math.sin(angle) * (len * 0.5);
    const endX = Math.cos(angle) * len;
    const endY = fontSizePx * 0.2 + Math.sin(angle) * len;
    ctx.lineTo(midX, midY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  // Molten fiery rock fragment particles
  const rockCount = 10;
  for (let r = 0; r < rockCount; r++) {
    const rProg = (progress * 1.6 + r * 0.1) % 1.0;
    const rAngle = (r * (Math.PI * 2)) / rockCount + Math.sin(r * 4);
    const rDist = (w * 0.4) + rProg * (fontSizePx * 1.5);
    const rx = Math.cos(rAngle) * rDist;
    const ry = fontSizePx * 0.1 - Math.sin(rProg * Math.PI) * (fontSizePx * 0.9) + (rProg * rProg * fontSizePx * 0.4);
    const rSize = Math.max(1.5, fontSizePx * 0.1 * (1.0 - rProg * 0.6));

    ctx.fillStyle = r % 2 === 0 ? '#FFE600' : '#FF3300';
    ctx.shadowColor = '#FF6600';
    ctx.shadowBlur = 10;
    ctx.globalAlpha = Math.max(0, 1.0 - rProg * 0.7);
    ctx.beginPath();
    ctx.arc(rx, ry, rSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Helper to draw Cyber Katana Slashes with Glowing Trails and Flare Burst
 */
function drawCyberKatanaSlashes(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  color: string,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const slashLen = Math.max(w * 1.4, fontSizePx * 2.2);
  const slashEase = Math.min(1.0, progress * 2.8);

  // Slash 1: Diagonal Top-Left to Bottom-Right
  const x1Start = -slashLen * 0.5;
  const y1Start = -fontSizePx * 0.7;
  const x1End = x1Start + slashLen * slashEase;
  const y1End = y1Start + (fontSizePx * 1.4) * slashEase;

  // Slash 2: Diagonal Top-Right to Bottom-Left
  const x2Start = slashLen * 0.5;
  const y2Start = -fontSizePx * 0.7;
  const x2End = x2Start - slashLen * slashEase;
  const y2End = y2Start + (fontSizePx * 1.4) * slashEase;

  // Outer Neon Blade Glow
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 22 * glowMul;
  ctx.lineWidth = Math.max(3.5, fontSizePx * 0.14);
  ctx.beginPath();
  ctx.moveTo(x1Start, y1Start);
  ctx.lineTo(x1End, y1End);
  ctx.moveTo(x2Start, y2Start);
  ctx.lineTo(x2End, y2End);
  ctx.stroke();

  // White Hot Blade Core
  ctx.strokeStyle = '#FFFFFF';
  ctx.shadowBlur = 8;
  ctx.lineWidth = Math.max(1.5, fontSizePx * 0.05);
  ctx.beginPath();
  ctx.moveTo(x1Start, y1Start);
  ctx.lineTo(x1End, y1End);
  ctx.moveTo(x2Start, y2Start);
  ctx.lineTo(x2End, y2End);
  ctx.stroke();

  // Sparks at slash intersections
  if (slashEase > 0.4) {
    drawDiamondSparkle(ctx, 0, 0, fontSizePx * 0.45, '#FFFFFF', progress * 10);
    drawDiamondSparkle(ctx, x1End, y1End, fontSizePx * 0.3, color, progress * 8);
    drawDiamondSparkle(ctx, x2End, y2End, fontSizePx * 0.3, color, progress * 8);
  }

  ctx.restore();
}

/**
 * Helper to draw Swirling Quantum Portal Wormhole
 */
function drawQuantumPortal(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  radius: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const arms = 4;
  for (let a = 0; a < arms; a++) {
    const baseAngle = (a * (Math.PI * 2)) / arms + time * 3.5;
    ctx.save();
    ctx.rotate(baseAngle);

    const grad = ctx.createLinearGradient(0, 0, radius, 0);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.3, '#A855F7');
    grad.addColorStop(0.7, '#3B82F6');
    grad.addColorStop(1, 'transparent');

    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(2, radius * 0.12);
    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 18 * glowMul;

    ctx.beginPath();
    ctx.moveTo(radius * 0.15, 0);
    ctx.bezierCurveTo(radius * 0.4, radius * 0.25, radius * 0.7, -radius * 0.2, radius, 0);
    ctx.stroke();
    ctx.restore();
  }

  // Inner vortex core
  ctx.fillStyle = '#1E1B4B';
  ctx.strokeStyle = '#E879F9';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#E879F9';
  ctx.shadowBlur = 16 * glowMul;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/**
 * Helper to draw Matrix Digital Code Stream Rain
 */
function drawMatrixStreamRain(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  h: number,
  time: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const cols = 8;
  const colSpacing = (w * 1.2) / cols;
  const startX = -w * 0.6;
  const matrixChars = ['0', '1', '7', 'Z', 'X', '9', 'K', 'V', '∆', '¥', 'Ω'];

  ctx.font = `900 ${Math.max(9, Math.round(h * 0.32))}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let c = 0; c < cols; c++) {
    const colX = startX + c * colSpacing;
    const streamProg = ((time * 4.0 + c * 0.35) % 1.0);
    const streamY = -h * 0.7 + streamProg * (h * 1.4);

    for (let row = 0; row < 4; row++) {
      const charY = streamY - row * (h * 0.28);
      if (charY < -h * 0.8 || charY > h * 0.8) continue;

      const charIdx = Math.abs(Math.floor(time * 12 + c * 7 + row)) % matrixChars.length;
      const char = matrixChars[charIdx];

      if (row === 0) {
        // Bright lead drop
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#00FF66';
        ctx.shadowBlur = 12;
        ctx.globalAlpha = 1.0;
      } else {
        // Trailing green code
        ctx.fillStyle = '#00FF66';
        ctx.shadowBlur = 4;
        ctx.globalAlpha = Math.max(0, 1.0 - row * 0.28);
      }

      ctx.fillText(char, colX, charY);
    }
  }

  ctx.restore();
}

/**
 * Helper to draw Faceted Diamond Crystal Shards
 */
function drawDiamondCrystalShatter(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const shardCount = 8;
  const colors = ['#E0F7FA', '#80DEEA', '#B388FF', '#FFFFFF', '#84FFFF'];

  for (let i = 0; i < shardCount; i++) {
    const sProg = (progress * 1.5 + i * 0.12) % 1.0;
    const angle = (i * (Math.PI * 2)) / shardCount + 0.3;
    const dist = (w * 0.45) + sProg * (fontSizePx * 1.2);
    const sx = Math.cos(angle) * dist;
    const sy = Math.sin(angle) * (dist * 0.85);
    const size = fontSizePx * 0.22 * (1.0 - sProg * 0.5);
    const rot = progress * 6 + i;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rot);

    // Prismatic 3D Crystal Shard Triangle
    ctx.fillStyle = colors[i % colors.length];
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = 10 * glowMul;
    ctx.globalAlpha = Math.max(0, 1.0 - sProg * 0.8);

    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.6, size * 0.7);
    ctx.lineTo(-size * 0.6, size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  drawDiamondSparkle(ctx, -w * 0.5, -fontSizePx * 0.4, fontSizePx * 0.35, '#FFFFFF', progress * 8);
  drawDiamondSparkle(ctx, w * 0.5, fontSizePx * 0.3, fontSizePx * 0.3, '#80DEEA', -progress * 7);

  ctx.restore();
}

/**
 * Helper to draw Roy Lichtenstein Pop-Art Halftone Dots and Comic Rays
 */
function drawPopArtHalftoneBurst(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  fillColor: string,
  time: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const burstW = w * 1.25;
  const burstH = fontSizePx * 1.4;

  // Comic Action Ray Lines
  const rayCount = 12;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(2, fontSizePx * 0.07);
  for (let r = 0; r < rayCount; r++) {
    const angle = (r * (Math.PI * 2)) / rayCount;
    const innerD = (burstW * 0.48);
    const outerD = innerD + (fontSizePx * 0.35) + (Math.sin(time * 8 + r) * 6);
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * innerD, Math.sin(angle) * (innerD * 0.65));
    ctx.lineTo(Math.cos(angle) * outerD, Math.sin(angle) * (outerD * 0.65));
    ctx.stroke();
  }

  // Base Pop-Art Oval Background
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(3, fontSizePx * 0.1);
  ctx.beginPath();
  ctx.ellipse(0, 0, burstW * 0.5, burstH * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Halftone Dot Matrix Pattern Overlay
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, burstW * 0.48, burstH * 0.48, 0, 0, Math.PI * 2);
  ctx.clip();

  const dotSpacing = Math.max(6, fontSizePx * 0.16);
  const dotR = Math.max(1.2, dotSpacing * 0.22);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  for (let x = -burstW * 0.5; x <= burstW * 0.5; x += dotSpacing) {
    for (let y = -burstH * 0.5; y <= burstH * 0.5; y += dotSpacing) {
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.restore();
}

/**
 * Helper to draw Radioactive Toxic Sludge & Biohazard Bubbles
 */
function drawRadioactiveToxicMist(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  // Toxic Hazard Glow Ring
  const pulse = 1.0 + Math.sin(time * 14) * 0.12;
  const radius = (Math.max(w, fontSizePx) * 0.55) * pulse;

  ctx.strokeStyle = '#39FF14';
  ctx.lineWidth = Math.max(2, fontSizePx * 0.08);
  ctx.shadowColor = '#39FF14';
  ctx.shadowBlur = 22 * glowMul;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Rising Biohazard Toxic Bubbles
  for (let b = 0; b < 6; b++) {
    const bProg = ((time * 2.2 + b * 0.18) % 1.0);
    const bx = -w * 0.4 + (b / 5) * (w * 0.8) + Math.sin(time * 8 + b) * 5;
    const by = -fontSizePx * 0.2 - bProg * (fontSizePx * 1.1);
    const bSize = Math.max(2, fontSizePx * 0.12 * (1.0 - bProg * 0.5));

    ctx.fillStyle = '#39FF14';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.globalAlpha = Math.max(0, 1.0 - bProg * 0.8);
    ctx.beginPath();
    ctx.arc(bx, by, bSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Helper to draw Hyper-Drive Radial Light Warp Beams
 */
function drawHyperDriveWarpLines(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const starCount = 18;
  const colors = ['#FFFFFF', '#38BDF8', '#818CF8', '#E0F2FE'];

  for (let i = 0; i < starCount; i++) {
    const sAngle = (i * (Math.PI * 2)) / starCount + Math.sin(i * 5) * 0.3;
    const sProg = ((progress * 2.5 + i * 0.06) % 1.0);
    const innerDist = (w * 0.2) + sProg * (fontSizePx * 0.8);
    const streakLen = (fontSizePx * 0.5) + (sProg * fontSizePx * 1.8);
    const outerDist = innerDist + streakLen;

    const x1 = Math.cos(sAngle) * innerDist;
    const y1 = Math.sin(sAngle) * (innerDist * 0.7);
    const x2 = Math.cos(sAngle) * outerDist;
    const y2 = Math.sin(sAngle) * (outerDist * 0.7);

    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = Math.max(1.5, fontSizePx * 0.06 * (1.0 - sProg * 0.4));
    ctx.shadowColor = '#38BDF8';
    ctx.shadowBlur = 14 * glowMul;
    ctx.globalAlpha = Math.max(0, 1.0 - sProg * 0.8);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Helper to draw Urban Graffiti Spray Aerosol Splatter & Drips
 */
function drawGraffitiSprayBackground(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  sprayColor: string
): void {
  ctx.save();
  ctx.translate(cx, cy);

  // Soft aerosol spray cloud
  const sprayGrad = ctx.createRadialGradient(0, 0, fontSizePx * 0.2, 0, 0, w * 0.7);
  sprayGrad.addColorStop(0, sprayColor);
  sprayGrad.addColorStop(0.5, `${sprayColor}88`);
  sprayGrad.addColorStop(1, 'transparent');

  ctx.fillStyle = sprayGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.65, fontSizePx * 0.75, 0, 0, Math.PI * 2);
  ctx.fill();

  // Droplet paint splatters
  ctx.fillStyle = sprayColor;
  const splatCount = 14;
  for (let s = 0; s < splatCount; s++) {
    const sAngle = (s * (Math.PI * 2)) / splatCount + Math.sin(s * 7);
    const sDist = (w * 0.35) + Math.abs(Math.sin(s * 3.7)) * (fontSizePx * 0.7);
    const sx = Math.cos(sAngle) * sDist;
    const sy = Math.sin(sAngle) * (sDist * 0.65);
    const sSize = Math.max(1, (s % 3 + 1) * (fontSizePx * 0.04));

    ctx.beginPath();
    ctx.arc(sx, sy, sSize, 0, Math.PI * 2);
    ctx.fill();
  }

  // Paint drip runs downwards
  ctx.fillStyle = sprayColor;
  for (let d = 0; d < 3; d++) {
    const dx = -w * 0.3 + d * (w * 0.3);
    const dy = fontSizePx * 0.4;
    const dripLen = fontSizePx * (0.35 + (d % 2) * 0.3);
    ctx.beginPath();
    ctx.roundRect(dx, dy, Math.max(2, fontSizePx * 0.06), dripLen, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dx + Math.max(1, fontSizePx * 0.03), dy + dripLen, Math.max(2, fontSizePx * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Helper to draw 3D Isometric Neon Wireframe Bounding Box
 */
function drawNeonWireframeCube(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  wireColor: string,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const halfW = (w / 2) * 1.18;
  const halfH = (fontSizePx / 2) * 1.18;
  const depthX = Math.cos(time * 3) * (fontSizePx * 0.25);
  const depthY = -Math.abs(Math.sin(time * 3)) * (fontSizePx * 0.25);

  ctx.strokeStyle = wireColor;
  ctx.lineWidth = Math.max(1.5, fontSizePx * 0.06);
  ctx.shadowColor = wireColor;
  ctx.shadowBlur = 16 * glowMul;

  // Front face rectangle
  ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);

  // Back face rectangle
  ctx.strokeRect(-halfW + depthX, -halfH + depthY, halfW * 2, halfH * 2);

  // Connecting 3D isometric edge lines
  ctx.beginPath();
  ctx.moveTo(-halfW, -halfH);
  ctx.lineTo(-halfW + depthX, -halfH + depthY);

  ctx.moveTo(halfW, -halfH);
  ctx.lineTo(halfW + depthX, -halfH + depthY);

  ctx.moveTo(halfW, halfH);
  ctx.lineTo(halfW + depthX, halfH + depthY);

  ctx.moveTo(-halfW, halfH);
  ctx.lineTo(-halfW + depthX, halfH + depthY);
  ctx.stroke();

  // Glowing vertex corner beads
  ctx.fillStyle = '#FFFFFF';
  [-halfW, halfW].forEach(x => {
    [-halfH, halfH].forEach(y => {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  ctx.restore();
}

/**
 * Helper to draw Thunder God Descending Lightning Bolts and Electric Forks
 */
function drawThunderGodLightningBolts(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  color: string,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const boltCount = 3;
  const boltProgress = Math.min(1.0, progress * 3.0);

  for (let b = 0; b < boltCount; b++) {
    const startX = (b - 1) * (w * 0.4) + Math.sin(b * 12 + progress * 20) * 10;
    const startY = -fontSizePx * 2.2;
    const targetX = (b - 1) * (w * 0.28);
    const targetY = -fontSizePx * 0.1;

    ctx.save();
    // Jagged lightning path generator
    const segs = 7;
    let currX = startX;
    let currY = startY;

    ctx.beginPath();
    ctx.moveTo(currX, currY);

    for (let s = 1; s <= segs; s++) {
      const segProg = s / segs;
      if (segProg > boltProgress) break;

      const nX = startX + (targetX - startX) * segProg + (Math.sin(s * 7.7 + b * 5) * (fontSizePx * 0.22));
      const nY = startY + (targetY - startY) * segProg;
      ctx.lineTo(nX, nY);
      currX = nX;
      currY = nY;

      // Secondary branching fork
      if (s === 3 || s === 5) {
        ctx.moveTo(currX, currY);
        const forkAngle = (b % 2 === 0 ? 0.6 : -0.6);
        const forkX = currX + Math.cos(forkAngle) * (fontSizePx * 0.35);
        const forkY = currY + Math.sin(forkAngle) * (fontSizePx * 0.35);
        ctx.lineTo(forkX, forkY);
        ctx.moveTo(currX, currY);
      }
    }

    // Outer Lightning Aura
    ctx.strokeStyle = color || '#38BDF8';
    ctx.shadowColor = color || '#38BDF8';
    ctx.shadowBlur = 24 * glowMul;
    ctx.lineWidth = Math.max(3, fontSizePx * 0.12);
    ctx.stroke();

    // Hot White Core
    ctx.strokeStyle = '#FFFFFF';
    ctx.shadowBlur = 8;
    ctx.lineWidth = Math.max(1.2, fontSizePx * 0.04);
    ctx.stroke();

    ctx.restore();
  }

  // Impact Flash Glow
  if (boltProgress > 0.4) {
    const flashRadius = (w * 0.5) * (boltProgress);
    const flashGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, flashRadius);
    flashGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    flashGrad.addColorStop(0.4, `${color || '#38BDF8'}66`);
    flashGrad.addColorStop(1, 'transparent');

    ctx.fillStyle = flashGrad;
    ctx.beginPath();
    ctx.arc(0, 0, flashRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Helper to draw Grand Fireworks Finale with Glittering Star Pellets
 */
function drawFireworkGrandFinale(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const starCount = 20;
  const colors = ['#FF0055', '#FFE600', '#00F0FF', '#39FF14', '#FF7700', '#C084FC'];
  const burstProg = Math.min(1.0, progress * 1.5);
  const maxRadius = Math.max(w * 0.8, fontSizePx * 1.8);

  for (let s = 0; s < starCount; s++) {
    const angle = (s * (Math.PI * 2)) / starCount + (s % 3) * 0.1;
    const speed = 0.6 + (s % 5) * 0.1;
    const dist = burstProg * maxRadius * speed;
    const gravity = Math.pow(burstProg, 2) * (fontSizePx * 0.45);

    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist * 0.7 + gravity;

    const starSize = Math.max(2, fontSizePx * 0.14 * (1.0 - burstProg * 0.7));
    const col = colors[s % colors.length];

    ctx.save();
    ctx.fillStyle = col;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.shadowColor = col;
    ctx.shadowBlur = 14 * glowMul;
    ctx.globalAlpha = Math.max(0, 1.0 - burstProg * 0.85);

    // Sparkle diamond star
    ctx.beginPath();
    ctx.arc(x, y, starSize, 0, Math.PI * 2);
    ctx.fill();

    // Trailing streamer line
    ctx.beginPath();
    ctx.moveTo(x * 0.7, y * 0.7);
    ctx.lineTo(x, y);
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, starSize * 0.5);
    ctx.stroke();

    ctx.restore();
  }

  // Central Flash
  if (burstProg < 0.3) {
    const flashSize = fontSizePx * 0.6 * (1.0 - burstProg / 0.3);
    drawDiamondSparkle(ctx, 0, 0, flashSize, '#FFFFFF', progress * 10);
  }

  ctx.restore();
}

/**
 * Helper to draw Anime Super Saiyan Ki Flame Energy Aura
 */
function drawSuperSaiyanEnergyAura(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const flamePlumes = 9;
  const flameW = w * 1.35;
  const startX = -flameW * 0.5;
  const stepX = flameW / (flamePlumes - 1);

  // Upward Billowing Energy Plumes
  for (let p = 0; p < flamePlumes; p++) {
    const px = startX + p * stepX;
    const pFreq = time * 12 + p * 1.4;
    const flameHeight = fontSizePx * (0.8 + Math.sin(pFreq) * 0.4);
    const swayX = Math.cos(pFreq * 0.8) * (fontSizePx * 0.15);

    const plumeGrad = ctx.createLinearGradient(px, fontSizePx * 0.3, px + swayX, -flameHeight);
    plumeGrad.addColorStop(0, 'rgba(255, 230, 0, 0.85)');
    plumeGrad.addColorStop(0.5, 'rgba(255, 110, 0, 0.6)');
    plumeGrad.addColorStop(1, 'transparent');

    ctx.fillStyle = plumeGrad;
    ctx.shadowColor = '#FFE600';
    ctx.shadowBlur = 20 * glowMul;

    ctx.beginPath();
    ctx.moveTo(px - stepX * 0.6, fontSizePx * 0.3);
    ctx.quadraticCurveTo(px, -flameHeight * 0.5, px + swayX, -flameHeight);
    ctx.quadraticCurveTo(px + stepX * 0.4, -flameHeight * 0.5, px + stepX * 0.6, fontSizePx * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  // Rising Electric Sparks
  for (let sp = 0; sp < 8; sp++) {
    const sProg = ((time * 3.5 + sp * 0.22) % 1.0);
    const sx = -w * 0.45 + (sp / 7) * (w * 0.9) + Math.sin(time * 15 + sp) * 8;
    const sy = fontSizePx * 0.2 - sProg * (fontSizePx * 1.5);
    const sSize = Math.max(1.5, fontSizePx * 0.08 * (1.0 - sProg * 0.6));

    ctx.fillStyle = '#00F0FF';
    ctx.shadowColor = '#00F0FF';
    ctx.shadowBlur = 10;
    ctx.globalAlpha = Math.max(0, 1.0 - sProg * 0.7);
    ctx.beginPath();
    ctx.arc(sx, sy, sSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Helper to draw Retro 80s VHS Glitch Tape Distortion & Scanlines
 */
function drawVHSTapeGlitchScan(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const glitchW = w * 1.25;
  const glitchH = fontSizePx * 1.3;

  // VHS Horizontal Tracking Distortion Bar
  const trackProg = (time * 1.8) % 1.0;
  const trackY = -glitchH * 0.5 + trackProg * glitchH;
  const trackHeight = fontSizePx * 0.22;

  ctx.fillStyle = 'rgba(255, 0, 85, 0.35)';
  ctx.fillRect(-glitchW * 0.5 + (Math.sin(time * 30) * 8), trackY, glitchW, trackHeight);

  // Scanline Grid Overlay
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
  ctx.lineWidth = 1.2;
  const lineSpacing = Math.max(3, fontSizePx * 0.1);
  for (let y = -glitchH * 0.5; y <= glitchH * 0.5; y += lineSpacing) {
    ctx.beginPath();
    ctx.moveTo(-glitchW * 0.5, y);
    ctx.lineTo(glitchW * 0.5, y);
    ctx.stroke();
  }

  // Tape noise static specks
  ctx.fillStyle = '#FFFFFF';
  for (let n = 0; n < 8; n++) {
    const nx = -glitchW * 0.5 + ((time * 100 + n * 73) % glitchW);
    const ny = -glitchH * 0.5 + ((time * 80 + n * 47) % glitchH);
    ctx.fillRect(nx, ny, Math.max(2, fontSizePx * 0.08), Math.max(1, fontSizePx * 0.03));
  }

  // Retro Color Shift Glow
  ctx.shadowColor = '#00F0FF';
  ctx.shadowBlur = 12 * glowMul;

  ctx.restore();
}

/**
 * Helper to draw Solar Eclipse Corona Flare and Coronal Loops
 */
function drawSolarCoronaFlare(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const radius = Math.max(w * 0.52, fontSizePx * 0.85);

  // Blinding Solar Corona Flares
  const rayCount = 16;
  for (let r = 0; r < rayCount; r++) {
    const angle = (r * (Math.PI * 2)) / rayCount + time * 1.2;
    const rayLen = radius + (fontSizePx * 0.35) + Math.sin(time * 6 + r * 2) * (fontSizePx * 0.2);

    const grad = ctx.createLinearGradient(0, 0, Math.cos(angle) * rayLen, Math.sin(angle) * rayLen);
    grad.addColorStop(0, '#FFF500');
    grad.addColorStop(0.5, '#FF6600');
    grad.addColorStop(1, 'transparent');

    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(2, fontSizePx * 0.09);
    ctx.shadowColor = '#FF4500';
    ctx.shadowBlur = 20 * glowMul;

    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * radius * 0.7, Math.sin(angle) * radius * 0.7);
    ctx.lineTo(Math.cos(angle) * rayLen, Math.sin(angle) * rayLen);
    ctx.stroke();
  }

  // Coronal Mass Plasma Loop
  const loopAngle = time * 2.5;
  ctx.strokeStyle = '#FFE600';
  ctx.lineWidth = Math.max(2, fontSizePx * 0.07);
  ctx.shadowColor = '#FF8800';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(Math.cos(loopAngle) * radius * 0.8, Math.sin(loopAngle) * radius * 0.6, fontSizePx * 0.3, 0, Math.PI);
  ctx.stroke();

  ctx.restore();
}

/**
 * Helper to draw 3D Perspective Synthwave Horizon Grid & Striped Sun
 */
function drawSynthwaveRetroGrid(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const gridW = w * 1.5;
  const gridH = fontSizePx * 1.2;
  const horizonY = fontSizePx * 0.15;

  // Setting Striped Neon Sun Backdrop
  const sunRadius = fontSizePx * 0.75;
  const sunGrad = ctx.createLinearGradient(0, horizonY - sunRadius, 0, horizonY);
  sunGrad.addColorStop(0, '#FFE600');
  sunGrad.addColorStop(0.6, '#FF007F');
  sunGrad.addColorStop(1, '#7928CA');

  ctx.fillStyle = sunGrad;
  ctx.shadowColor = '#FF007F';
  ctx.shadowBlur = 22 * glowMul;
  ctx.beginPath();
  ctx.arc(0, horizonY, sunRadius, Math.PI, 0);
  ctx.fill();

  // Striped horizontal sun cuts
  ctx.fillStyle = 'rgba(10, 5, 25, 0.9)';
  for (let s = 1; s <= 4; s++) {
    const cutY = horizonY - (s / 5) * sunRadius;
    ctx.fillRect(-sunRadius, cutY, sunRadius * 2, Math.max(1.5, s * 1.2));
  }

  // 3D Wireframe Perspective Grid Floor
  ctx.strokeStyle = '#00F0FF';
  ctx.shadowColor = '#00F0FF';
  ctx.shadowBlur = 14 * glowMul;
  ctx.lineWidth = 1.5;

  // Horizontal Grid Lines with logarithmic spacing
  const lineCount = 5;
  for (let l = 1; l <= lineCount; l++) {
    const lineProg = ((l + (time * 2.0) % 1.0) / (lineCount + 1));
    const ly = horizonY + Math.pow(lineProg, 1.6) * (gridH * 0.65);
    const lw = gridW * (0.4 + lineProg * 0.6);
    ctx.beginPath();
    ctx.moveTo(-lw * 0.5, ly);
    ctx.lineTo(lw * 0.5, ly);
    ctx.stroke();
  }

  // Perspective Vanishing Lines radiating to center horizon
  const perspCount = 7;
  for (let p = 0; p < perspCount; p++) {
    const bottomX = -gridW * 0.5 + (p / (perspCount - 1)) * gridW;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(bottomX, horizonY + gridH * 0.65);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Helper to draw Flaming Phoenix Wing Silhouettes and Rising Embers
 */
function drawPhoenixFireWings(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const wingSpan = Math.max(w * 0.85, fontSizePx * 1.5);
  const flap = Math.sin(time * 8) * (fontSizePx * 0.15);

  [-1, 1].forEach(side => {
    ctx.save();
    ctx.scale(side, 1);

    // Sweeping Arch Wing Gradients
    const wingGrad = ctx.createLinearGradient(0, 0, wingSpan, -fontSizePx * 0.6 + flap);
    wingGrad.addColorStop(0, '#FFE600');
    wingGrad.addColorStop(0.4, '#FF4500');
    wingGrad.addColorStop(0.8, '#990000');
    wingGrad.addColorStop(1, 'transparent');

    ctx.fillStyle = wingGrad;
    ctx.strokeStyle = '#FFE600';
    ctx.lineWidth = Math.max(1.5, fontSizePx * 0.05);
    ctx.shadowColor = '#FF4500';
    ctx.shadowBlur = 22 * glowMul;

    ctx.beginPath();
    ctx.moveTo(0, fontSizePx * 0.1);
    ctx.bezierCurveTo(wingSpan * 0.4, -fontSizePx * 0.2 + flap, wingSpan * 0.7, -fontSizePx * 0.9 + flap, wingSpan, -fontSizePx * 0.6 + flap);
    ctx.bezierCurveTo(wingSpan * 0.7, -fontSizePx * 0.3 + flap, wingSpan * 0.4, fontSizePx * 0.1, 0, fontSizePx * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  });

  // Floating Golden Embers
  for (let e = 0; e < 8; e++) {
    const eProg = ((time * 2.8 + e * 0.18) % 1.0);
    const ex = (Math.sin(e * 5 + time * 3) * (w * 0.6));
    const ey = fontSizePx * 0.2 - eProg * (fontSizePx * 1.3);
    const eSize = Math.max(1.5, fontSizePx * 0.08 * (1.0 - eProg * 0.5));

    ctx.fillStyle = '#FFE600';
    ctx.shadowColor = '#FF6600';
    ctx.shadowBlur = 10;
    ctx.globalAlpha = Math.max(0, 1.0 - eProg * 0.8);
    ctx.beginPath();
    ctx.arc(ex, ey, eSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Helper to draw Prismatic Rainbow Refraction Caustics & Spectrum Sweeps
 */
function drawPrismaticRainbowCaustics(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const sweepW = w * 1.3;
  const sweepH = fontSizePx * 1.2;
  const sweepX = -sweepW * 0.5 + ((time * 2.5) % 1.0) * sweepW;

  // Iridescent Rainbow Refraction Caustic Band
  const causticGrad = ctx.createLinearGradient(sweepX - fontSizePx * 0.6, 0, sweepX + fontSizePx * 0.6, 0);
  causticGrad.addColorStop(0, 'rgba(255, 0, 0, 0)');
  causticGrad.addColorStop(0.2, 'rgba(255, 128, 0, 0.4)');
  causticGrad.addColorStop(0.4, 'rgba(255, 255, 0, 0.5)');
  causticGrad.addColorStop(0.6, 'rgba(0, 255, 128, 0.5)');
  causticGrad.addColorStop(0.8, 'rgba(0, 200, 255, 0.5)');
  causticGrad.addColorStop(1, 'rgba(200, 0, 255, 0)');

  ctx.fillStyle = causticGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, sweepW * 0.5, sweepH * 0.5, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Multi-point Diamond Twinkles
  drawDiamondSparkle(ctx, -w * 0.45, -fontSizePx * 0.35, fontSizePx * 0.35, '#FFFFFF', time * 8);
  drawDiamondSparkle(ctx, w * 0.45, fontSizePx * 0.3, fontSizePx * 0.35, '#80DEEA', -time * 7);
  drawDiamondSparkle(ctx, 0, -fontSizePx * 0.45, fontSizePx * 0.28, '#FFE600', time * 10);

  ctx.restore();
}

/**
 * Helper to draw Shonen Anime Manga Radial Impact Speed Wedges
 */
function drawAnimeActionSpeedLines(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  progress: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const wedgeCount = 24;
  const maxRadius = Math.max(w * 1.2, fontSizePx * 2.5);
  const minRadius = Math.max(w * 0.52, fontSizePx * 0.7);

  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1;

  for (let i = 0; i < wedgeCount; i++) {
    // Staggered lengths for hand-drawn anime aesthetic
    if (i % 2 === 0) continue; // Alternate gaps
    const angle = (i * (Math.PI * 2)) / wedgeCount + (Math.sin(i * 3 + progress * 10) * 0.05);
    const halfAngle = (Math.PI * 2) / (wedgeCount * 3.5);

    const innerR = minRadius + (Math.sin(i * 7 + progress * 15) * (fontSizePx * 0.15));
    const outerR = maxRadius;

    ctx.beginPath();
    ctx.moveTo(Math.cos(angle - halfAngle) * outerR, Math.sin(angle - halfAngle) * outerR);
    ctx.lineTo(Math.cos(angle + halfAngle) * outerR, Math.sin(angle + halfAngle) * outerR);
    ctx.lineTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Helper to draw Mystic Doctor Strange Arcane Runic Mandala Spell Circle
 */
function drawMysticRunicMandala(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const radius = Math.max(w * 0.55, fontSizePx * 0.85);

  ctx.strokeStyle = '#FF8C00';
  ctx.shadowColor = '#FF6600';
  ctx.shadowBlur = 20 * glowMul;
  ctx.lineWidth = Math.max(1.8, fontSizePx * 0.06);

  // Outer Rotating Runic Ring
  ctx.save();
  ctx.rotate(time * 2.0);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Runic Node Marks on Outer Ring
  const nodeCount = 12;
  for (let n = 0; n < nodeCount; n++) {
    const na = (n * (Math.PI * 2)) / nodeCount;
    ctx.fillStyle = '#FFE600';
    ctx.beginPath();
    ctx.arc(Math.cos(na) * radius, Math.sin(na) * radius, Math.max(2, fontSizePx * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Middle Counter-Rotating Sacred Geometry Triangle
  ctx.save();
  ctx.rotate(-time * 2.8);
  const innerR = radius * 0.75;
  ctx.strokeStyle = '#FFE600';
  ctx.lineWidth = Math.max(1.5, fontSizePx * 0.05);
  for (let t = 0; t < 2; t++) {
    const tOffset = (t * Math.PI) / 3;
    ctx.beginPath();
    for (let p = 0; p < 3; p++) {
      const pa = (p * (Math.PI * 2)) / 3 + tOffset;
      const px = Math.cos(pa) * innerR;
      const py = Math.sin(pa) * innerR;
      if (p === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();

  // Sparkling Mystic Dust
  for (let d = 0; d < 6; d++) {
    const da = (d * (Math.PI * 2)) / 6 + time * 3;
    const dr = radius * 0.9 + Math.sin(time * 8 + d) * 6;
    drawDiamondSparkle(ctx, Math.cos(da) * dr, Math.sin(da) * dr, fontSizePx * 0.25, '#FFFFFF', time * 10);
  }

  ctx.restore();
}

/**
 * Helper to draw Cosmic Black Hole Gravitational Singularity & Accretion Disk
 */
function drawBlackHoleSingularity(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const radius = Math.max(w * 0.6, fontSizePx * 1.0);

  // Outer Lensed Accretion Disk (spinning matter spiral)
  ctx.save();
  ctx.rotate(time * 3.5);

  const diskGrad = ctx.createRadialGradient(0, 0, radius * 0.35, 0, 0, radius);
  diskGrad.addColorStop(0, 'rgba(255, 140, 0, 0.95)');
  diskGrad.addColorStop(0.3, 'rgba(255, 50, 100, 0.8)');
  diskGrad.addColorStop(0.7, 'rgba(138, 43, 226, 0.5)');
  diskGrad.addColorStop(1, 'transparent');

  ctx.fillStyle = diskGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.45, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Spiral Matter Ingestion Streams
  for (let s = 0; s < 4; s++) {
    const startAngle = (s * Math.PI) / 2;
    ctx.beginPath();
    for (let r = radius; r >= radius * 0.35; r -= 4) {
      const theta = startAngle + (radius - r) * 0.15;
      const sx = Math.cos(theta) * r;
      const sy = Math.sin(theta) * (r * 0.45);
      if (r === radius) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = '#FFE600';
    ctx.lineWidth = Math.max(1.5, fontSizePx * 0.04);
    ctx.shadowColor = '#FF4500';
    ctx.shadowBlur = 14 * glowMul;
    ctx.stroke();
  }
  ctx.restore();

  // Ultra-Bright Photon Ring (Relativistic Beaming)
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(2, fontSizePx * 0.07);
  ctx.shadowColor = '#00F0FF';
  ctx.shadowBlur = 20 * glowMul;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.38, 0, Math.PI * 2);
  ctx.stroke();

  // Dark Event Horizon Singularity Center
  ctx.fillStyle = '#05020A';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.34, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Helper to draw Divine Celestial Volumetric God Rays & Holy Dust
 */
function drawDivineGodRays(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const rayW = w * 1.4;
  const rayTopY = -fontSizePx * 2.2;
  const rayBottomY = fontSizePx * 0.5;

  // Piercing Golden Volumetric Light Shafts
  const shaftCount = 7;
  for (let i = 0; i < shaftCount; i++) {
    const shaftX = -rayW * 0.45 + (i / (shaftCount - 1)) * rayW + Math.sin(time * 2 + i) * (fontSizePx * 0.1);
    const shaftAngle = (i - 3) * 0.12;
    const shaftBottomX = shaftX + Math.sin(shaftAngle) * (fontSizePx * 2.0);

    const grad = ctx.createLinearGradient(shaftX, rayTopY, shaftBottomX, rayBottomY);
    grad.addColorStop(0, 'rgba(255, 245, 180, 0.75)');
    grad.addColorStop(0.5, 'rgba(255, 215, 0, 0.35)');
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(shaftX - fontSizePx * 0.12, rayTopY);
    ctx.lineTo(shaftX + fontSizePx * 0.12, rayTopY);
    ctx.lineTo(shaftBottomX + fontSizePx * 0.3, rayBottomY);
    ctx.lineTo(shaftBottomX - fontSizePx * 0.3, rayBottomY);
    ctx.closePath();
    ctx.fill();
  }

  // Holy Celestial Halo
  const haloRadius = Math.max(w * 0.55, fontSizePx * 0.9);
  const haloGrad = ctx.createRadialGradient(0, -fontSizePx * 0.1, haloRadius * 0.5, 0, -fontSizePx * 0.1, haloRadius);
  haloGrad.addColorStop(0, 'rgba(255, 230, 100, 0.5)');
  haloGrad.addColorStop(0.7, 'rgba(255, 180, 0, 0.15)');
  haloGrad.addColorStop(1, 'transparent');

  ctx.fillStyle = haloGrad;
  ctx.beginPath();
  ctx.arc(0, -fontSizePx * 0.1, haloRadius, 0, Math.PI * 2);
  ctx.fill();

  // Floating Golden Dust Motes
  for (let m = 0; m < 9; m++) {
    const mProg = ((time * 1.5 + m * 0.15) % 1.0);
    const mx = (Math.sin(m * 4 + time * 2) * (w * 0.5));
    const my = fontSizePx * 0.3 - mProg * (fontSizePx * 1.8);
    const mSize = Math.max(1.5, fontSizePx * 0.08 * (1.0 - mProg * 0.4));

    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#FFE600';
    ctx.shadowBlur = 10 * glowMul;
    ctx.beginPath();
    ctx.arc(mx, my, mSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Helper to draw Cyberpunk Mecha HUD Targeting Telemetry Data
 */
function drawCyberpunkTargetingHUD(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const hudW = w * 1.25;
  const hudH = fontSizePx * 1.2;
  const lockProg = Math.min(1.0, progress * 2.5);

  ctx.strokeStyle = '#00F0FF';
  ctx.fillStyle = '#00F0FF';
  ctx.shadowColor = '#00F0FF';
  ctx.shadowBlur = 16 * glowMul;
  ctx.lineWidth = Math.max(1.8, fontSizePx * 0.05);

  const bracketSize = fontSizePx * 0.35;
  const halfW = (hudW * 0.5) * (1.3 - lockProg * 0.3);
  const halfH = (hudH * 0.5) * (1.3 - lockProg * 0.3);

  // 4 Corner Brackets
  // Top-Left
  ctx.beginPath();
  ctx.moveTo(-halfW + bracketSize, -halfH);
  ctx.lineTo(-halfW, -halfH);
  ctx.lineTo(-halfW, -halfH + bracketSize);
  ctx.stroke();

  // Top-Right
  ctx.beginPath();
  ctx.moveTo(halfW - bracketSize, -halfH);
  ctx.lineTo(halfW, -halfH);
  ctx.lineTo(halfW, -halfH + bracketSize);
  ctx.stroke();

  // Bottom-Left
  ctx.beginPath();
  ctx.moveTo(-halfW + bracketSize, halfH);
  ctx.lineTo(-halfW, halfH);
  ctx.lineTo(-halfW, halfH - bracketSize);
  ctx.stroke();

  // Bottom-Right
  ctx.beginPath();
  ctx.moveTo(halfW - bracketSize, halfH);
  ctx.lineTo(halfW, halfH);
  ctx.lineTo(halfW, halfH - bracketSize);
  ctx.stroke();

  // Rotating Circular Radar Target Compass
  ctx.save();
  ctx.rotate(time * 3.0);
  ctx.beginPath();
  ctx.setLineDash([6, 8]);
  ctx.arc(0, 0, Math.max(halfW * 0.7, fontSizePx * 0.75), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Telemetry Lock Text
  ctx.font = `900 ${Math.max(9, Math.round(fontSizePx * 0.18))}px monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(`TARGET LOCKED // 99.8%`, -halfW, -halfH - 5);
  ctx.textAlign = 'right';
  ctx.fillText(`SYS.AI`, halfW, halfH + 12);

  ctx.restore();
}

/**
 * Helper to draw Sub-Zero Glacial Cryo Ice Spikes & Freeze Fog
 */
function drawCryoIceBlizzard(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const spikeCount = 8;
  const freezeProg = Math.min(1.0, progress * 2.2);

  // Sharp Ice Crystal Stalagmites shooting outwards
  for (let i = 0; i < spikeCount; i++) {
    const angle = (i * (Math.PI * 2)) / spikeCount + (i % 2) * 0.2;
    const spikeLen = Math.max(w * 0.65, fontSizePx * 1.1) * freezeProg * (0.8 + (i % 3) * 0.2);

    const sx = Math.cos(angle) * spikeLen;
    const sy = Math.sin(angle) * spikeLen * 0.65;

    const iceGrad = ctx.createLinearGradient(0, 0, sx, sy);
    iceGrad.addColorStop(0, '#FFFFFF');
    iceGrad.addColorStop(0.4, '#80E5FF');
    iceGrad.addColorStop(0.8, '#0099FF');
    iceGrad.addColorStop(1, 'transparent');

    ctx.fillStyle = iceGrad;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.shadowColor = '#00F0FF';
    ctx.shadowBlur = 18 * glowMul;

    const perpAngle = angle + Math.PI / 2;
    const baseW = (fontSizePx * 0.25) * freezeProg;

    ctx.beginPath();
    ctx.moveTo(Math.cos(perpAngle) * baseW, Math.sin(perpAngle) * baseW);
    ctx.lineTo(sx, sy);
    ctx.lineTo(-Math.cos(perpAngle) * baseW, -Math.sin(perpAngle) * baseW);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Floating Sub-Zero Cryo Sparkles
  drawDiamondSparkle(ctx, -w * 0.4, -fontSizePx * 0.35, fontSizePx * 0.3, '#FFFFFF', time * 8);
  drawDiamondSparkle(ctx, w * 0.4, fontSizePx * 0.3, fontSizePx * 0.3, '#E0F7FA', -time * 7);

  ctx.restore();
}

/**
 * Helper to draw Toxic Acid Neon Paint Splatter & Dripping Runs
 */
function drawToxicNeonGraffitiSplatter(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const splatW = w * 1.25;
  const splatH = fontSizePx * 1.1;

  ctx.fillStyle = '#39FF14';
  ctx.shadowColor = '#39FF14';
  ctx.shadowBlur = 22 * glowMul;

  // Main backdrop organic paint splatter blobs
  const blobs = [
    { x: -splatW * 0.3, y: -splatH * 0.1, r: fontSizePx * 0.4 },
    { x: splatW * 0.25, y: -splatH * 0.2, r: fontSizePx * 0.45 },
    { x: 0, y: splatH * 0.1, r: fontSizePx * 0.5 },
    { x: -splatW * 0.45, y: splatH * 0.2, r: fontSizePx * 0.25 },
    { x: splatW * 0.45, y: -splatH * 0.05, r: fontSizePx * 0.28 },
  ];

  blobs.forEach(b => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Dynamic dripping paint runs downwards
  const drips = [
    { x: -splatW * 0.25, len: fontSizePx * 0.65 },
    { x: 0, len: fontSizePx * 0.85 },
    { x: splatW * 0.3, len: fontSizePx * 0.55 },
  ];

  drips.forEach(d => {
    ctx.beginPath();
    ctx.moveTo(d.x - fontSizePx * 0.06, 0);
    ctx.lineTo(d.x + fontSizePx * 0.06, 0);
    ctx.lineTo(d.x, d.len);
    ctx.closePath();
    ctx.fill();

    // Drip bulb at bottom
    ctx.beginPath();
    ctx.arc(d.x, d.len, fontSizePx * 0.08, 0, Math.PI * 2);
    ctx.fill();
  });

  // Acid Hot Pink Accent Flecks
  ctx.fillStyle = '#FF007F';
  ctx.shadowColor = '#FF007F';
  for (let f = 0; f < 6; f++) {
    const fx = -splatW * 0.4 + (f / 5) * (splatW * 0.8);
    const fy = Math.sin(f * 4) * (splatH * 0.4);
    ctx.beginPath();
    ctx.arc(fx, fy, Math.max(2, fontSizePx * 0.06), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Helper to draw Scorching Dragon Breath Plasma Fire Vortex
 */
function drawDragonInfernoBreath(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const vortexW = w * 1.35;

  // Dual swirling fire vortex streams
  [-1, 1].forEach(side => {
    ctx.save();
    ctx.scale(side, 1);

    const flameGrad = ctx.createLinearGradient(0, 0, vortexW * 0.6, -fontSizePx * 0.4);
    flameGrad.addColorStop(0, '#FFFFFF');
    flameGrad.addColorStop(0.3, '#FFE600');
    flameGrad.addColorStop(0.7, '#FF3300');
    flameGrad.addColorStop(1, 'transparent');

    ctx.fillStyle = flameGrad;
    ctx.strokeStyle = '#FFE600';
    ctx.lineWidth = Math.max(1.5, fontSizePx * 0.05);
    ctx.shadowColor = '#FF3300';
    ctx.shadowBlur = 24 * glowMul;

    ctx.beginPath();
    ctx.moveTo(0, fontSizePx * 0.2);
    const wave = Math.sin(time * 10 + side) * (fontSizePx * 0.2);
    ctx.bezierCurveTo(vortexW * 0.2, -fontSizePx * 0.6 + wave, vortexW * 0.45, fontSizePx * 0.4 + wave, vortexW * 0.6, -fontSizePx * 0.3);
    ctx.bezierCurveTo(vortexW * 0.45, -fontSizePx * 0.1, vortexW * 0.2, fontSizePx * 0.4, 0, fontSizePx * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  });

  // Floating Combustion Sparks
  for (let s = 0; s < 7; s++) {
    const sProg = ((time * 3.2 + s * 0.2) % 1.0);
    const sx = Math.sin(s * 5 + time * 4) * (w * 0.55);
    const sy = fontSizePx * 0.2 - sProg * (fontSizePx * 1.4);
    ctx.fillStyle = '#FFE600';
    ctx.shadowColor = '#FF4500';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1.5, fontSizePx * 0.07 * (1.0 - sProg * 0.6)), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Helper to draw 24K Royal Gold Specular Sheen & Floating Orbit Stars
 */
function drawRoyalGoldShimmerAura(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const auraW = w * 1.25;

  // Specular Reflection Sweep Bar
  const sweepX = -auraW * 0.5 + ((time * 2.0) % 1.0) * auraW;
  const sweepGrad = ctx.createLinearGradient(sweepX - fontSizePx * 0.5, 0, sweepX + fontSizePx * 0.5, 0);
  sweepGrad.addColorStop(0, 'transparent');
  sweepGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.85)');
  sweepGrad.addColorStop(1, 'transparent');

  ctx.fillStyle = sweepGrad;
  ctx.fillRect(-auraW * 0.5, -fontSizePx * 0.55, auraW, fontSizePx * 1.1);

  // Orbiting Golden 3D Star Coins
  for (let c = 0; c < 4; c++) {
    const cAngle = (c * (Math.PI / 2)) + time * 3.0;
    const cxPos = Math.cos(cAngle) * (w * 0.55);
    const cyPos = Math.sin(cAngle) * (fontSizePx * 0.45);

    drawDiamondSparkle(ctx, cxPos, cyPos, fontSizePx * 0.32, '#FFE600', time * 8 + c);
  }

  // Golden Luxe Crown Sheen
  ctx.strokeStyle = '#FFE600';
  ctx.shadowColor = '#FFA500';
  ctx.shadowBlur = 20 * glowMul;
  ctx.lineWidth = Math.max(2, fontSizePx * 0.06);

  ctx.restore();
}

/**
 * Helper to draw Speed Demon Nitro Drift & Flaming Tire Skids
 */
function drawSpeedDemonDriftSmoke(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const driftW = w * 1.3;
  const groundY = fontSizePx * 0.35;

  // Flaming Dual Tire Skid Mark Trails
  [-1, 1].forEach(side => {
    const skidY = groundY + side * (fontSizePx * 0.08);

    const skidGrad = ctx.createLinearGradient(-driftW * 0.5, 0, driftW * 0.5, 0);
    skidGrad.addColorStop(0, 'rgba(255, 69, 0, 0)');
    skidGrad.addColorStop(0.4, 'rgba(255, 140, 0, 0.8)');
    skidGrad.addColorStop(0.8, 'rgba(255, 230, 0, 0.9)');
    skidGrad.addColorStop(1, '#00F0FF');

    ctx.strokeStyle = skidGrad;
    ctx.lineWidth = Math.max(2, fontSizePx * 0.06);
    ctx.shadowColor = '#FF4500';
    ctx.shadowBlur = 16 * glowMul;

    ctx.beginPath();
    ctx.moveTo(-driftW * 0.5, skidY);
    ctx.lineTo(driftW * 0.45, skidY);
    ctx.stroke();
  });

  // Dual Nitro Cyan Flame Jet Bursts
  [-1, 1].forEach(side => {
    const jetX = side * (w * 0.48);
    const jetGrad = ctx.createRadialGradient(jetX, groundY, 0, jetX, groundY, fontSizePx * 0.5);
    jetGrad.addColorStop(0, '#FFFFFF');
    jetGrad.addColorStop(0.4, '#00F0FF');
    jetGrad.addColorStop(0.8, '#0066FF');
    jetGrad.addColorStop(1, 'transparent');

    ctx.fillStyle = jetGrad;
    ctx.beginPath();
    ctx.arc(jetX, groundY, fontSizePx * 0.4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

/**
 * Helper to draw 3D Pop-Comic Action Starburst Blast & Halftone Rays
 */
function drawComicActionBlastBubble(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  progress: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const starPoints = 14;
  const outerR = Math.max(w * 0.68, fontSizePx * 1.25);
  const innerR = Math.max(w * 0.42, fontSizePx * 0.75);

  // Offset 3D Pop Black Shadow Starburst
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  for (let i = 0; i < starPoints * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / starPoints - Math.PI / 2;
    const x = Math.cos(angle) * r + 6;
    const y = Math.sin(angle) * r + 6;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Top Blazing Yellow Starburst
  ctx.fillStyle = '#FFE600';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(3, fontSizePx * 0.08);

  ctx.beginPath();
  for (let i = 0; i < starPoints * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / starPoints - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Pop Halftone Dots Accent
  ctx.fillStyle = '#FF0055';
  for (let row = -2; row <= 2; row++) {
    for (let col = -3; col <= 3; col++) {
      if ((row + col) % 2 === 0) {
        ctx.beginPath();
        ctx.arc(col * (fontSizePx * 0.28), row * (fontSizePx * 0.22), Math.max(1.5, fontSizePx * 0.04), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

/**
 * Helper to draw Quantum Wave Entanglement & 3-Axis Particle Orbits
 */
function drawQuantumEntanglementWaves(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const radius = Math.max(w * 0.55, fontSizePx * 0.9);

  // 3 Intersecting Orbital Electron Rings on 3 axes
  const orbitColors = ['#00F0FF', '#FF007F', '#FFE600'];
  for (let o = 0; o < 3; o++) {
    ctx.save();
    ctx.rotate((o * Math.PI) / 3 + time * (1.5 + o * 0.5));

    ctx.strokeStyle = orbitColors[o];
    ctx.shadowColor = orbitColors[o];
    ctx.shadowBlur = 18 * glowMul;
    ctx.lineWidth = Math.max(1.8, fontSizePx * 0.05);

    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * 0.38, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Orbiting Electron Node
    const nodeAngle = time * (4.0 + o * 1.5);
    const nx = Math.cos(nodeAngle) * radius;
    const ny = Math.sin(nodeAngle) * (radius * 0.38);

    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#FFFFFF';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(nx, ny, Math.max(2.5, fontSizePx * 0.08), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}

/**
 * Helper to draw Iron Man Plasma Arc Reactor Core & Repulsor Flare
 */
function drawPlasmaArcReactor(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const radius = Math.max(w * 0.58, fontSizePx * 0.95);

  // Outer segmented magnetic containment ring
  ctx.save();
  ctx.rotate(time * 2.0);
  const coilCount = 8;
  for (let c = 0; c < coilCount; c++) {
    const angle = (c * (Math.PI * 2)) / coilCount;
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = Math.max(2, fontSizePx * 0.06);
    ctx.shadowColor = '#00F0FF';
    ctx.shadowBlur = 16 * glowMul;

    ctx.beginPath();
    ctx.arc(0, 0, radius, angle, angle + 0.5);
    ctx.stroke();

    // Copper magnetic coil notches
    const nx = Math.cos(angle) * (radius * 1.12);
    const ny = Math.sin(angle) * (radius * 1.12);
    ctx.fillStyle = '#FF9900';
    ctx.shadowColor = '#FF6600';
    ctx.beginPath();
    ctx.arc(nx, ny, Math.max(2, fontSizePx * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Inner counter-rotating core ring
  ctx.save();
  ctx.rotate(-time * 3.5);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(1.8, fontSizePx * 0.05);
  ctx.shadowColor = '#00F0FF';
  ctx.shadowBlur = 20 * glowMul;
  ctx.beginPath();
  ctx.setLineDash([8, 6]);
  ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Blinding Unibeam Core Flare
  const corePulse = 1.0 + Math.sin(time * 20) * 0.12;
  const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.6 * corePulse);
  coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  coreGrad.addColorStop(0.35, 'rgba(0, 240, 255, 0.7)');
  coreGrad.addColorStop(0.7, 'rgba(0, 100, 255, 0.3)');
  coreGrad.addColorStop(1, 'transparent');

  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.6 * corePulse, 0, Math.PI * 2);
  ctx.fill();

  // Radiating plasma discharge sparks
  for (let s = 0; s < 6; s++) {
    const sAngle = s * (Math.PI / 3) + time * 6;
    const sDist = radius * (0.8 + Math.sin(time * 15 + s) * 0.35);
    drawDiamondSparkle(ctx, Math.cos(sAngle) * sDist, Math.sin(sAngle) * sDist, fontSizePx * 0.25, '#00F0FF', time * 10);
  }

  ctx.restore();
}

/**
 * Helper to draw Cyber Hex Shield Portal & Dimension Glitch
 */
function drawCyberGlitchHexPortal(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const hexW = w * 1.35;
  const hexH = fontSizePx * 1.25;

  // Hexagonal cyber honeycomb grid pattern
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#00F0FF';
  ctx.shadowBlur = 10 * glowMul;

  const hexSize = Math.max(12, fontSizePx * 0.28);
  const rows = 3;
  const cols = 5;

  for (let r = -rows; r <= rows; r++) {
    for (let c = -cols; c <= cols; c++) {
      const hx = c * hexSize * 1.6 + (r % 2 === 0 ? 0 : hexSize * 0.8);
      const hy = r * hexSize * 0.9;

      if (Math.abs(hx) < hexW * 0.55 && Math.abs(hy) < hexH * 0.55) {
        ctx.beginPath();
        for (let a = 0; a < 6; a++) {
          const angle = (a * Math.PI) / 3;
          const px = hx + Math.cos(angle) * (hexSize * 0.5);
          const py = hy + Math.sin(angle) * (hexSize * 0.5);
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();

        // Pulsing active data nodes
        if ((r + c + Math.floor(time * 4)) % 5 === 0) {
          ctx.fillStyle = '#FF007F';
          ctx.beginPath();
          ctx.arc(hx, hy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // Glitch Chromatic Slice Bars
  if (Math.sin(time * 25) > 0.4) {
    const sliceY = (Math.sin(time * 30) * hexH * 0.4);
    ctx.fillStyle = 'rgba(255, 0, 128, 0.65)';
    ctx.fillRect(-hexW * 0.5, sliceY, hexW, fontSizePx * 0.08);
    ctx.fillStyle = 'rgba(0, 240, 255, 0.65)';
    ctx.fillRect(-hexW * 0.5 + 8, sliceY + 3, hexW, fontSizePx * 0.05);
  }

  ctx.restore();
}

/**
 * Helper to draw Demon Slayer Ukiyo-e Anime Water Wheel Dragon Waves
 */
function drawDemonSlayerWaterWheel(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const waveW = w * 1.35;

  // Japanese Woodblock Wave Spirals (Curling Dragon Hydro Waves)
  [-1, 1].forEach(side => {
    ctx.save();
    ctx.scale(side, 1);

    // Deep Indigo-to-Cyan Water Gradient
    const waveGrad = ctx.createLinearGradient(-waveW * 0.4, 0, waveW * 0.5, -fontSizePx * 0.5);
    waveGrad.addColorStop(0, '#001A4D');
    waveGrad.addColorStop(0.35, '#0066CC');
    waveGrad.addColorStop(0.7, '#00D4FF');
    waveGrad.addColorStop(1, '#FFFFFF');

    ctx.strokeStyle = waveGrad;
    ctx.lineWidth = Math.max(3, fontSizePx * 0.08);
    ctx.shadowColor = '#00F0FF';
    ctx.shadowBlur = 20 * glowMul;

    ctx.beginPath();
    ctx.moveTo(0, fontSizePx * 0.3);
    const waveCurl = Math.sin(time * 6 + side) * (fontSizePx * 0.15);
    ctx.bezierCurveTo(waveW * 0.25, fontSizePx * 0.4, waveW * 0.45, -fontSizePx * 0.6 + waveCurl, waveW * 0.58, -fontSizePx * 0.2);
    ctx.stroke();

    // Stylized Ukiyo-e White Crest Foam Sprays (Curling claws)
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#001A4D';
    ctx.lineWidth = 1.5;
    for (let f = 0; f < 3; f++) {
      const fx = waveW * (0.45 + f * 0.06);
      const fy = -fontSizePx * (0.2 + f * 0.1) + waveCurl;
      ctx.beginPath();
      ctx.arc(fx, fy, fontSizePx * (0.08 - f * 0.015), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  });

  // Floating Water Droplet Splash Particles
  for (let d = 0; d < 8; d++) {
    const dProg = ((time * 2.5 + d * 0.15) % 1.0);
    const dx = Math.sin(d * 5 + time * 3) * (w * 0.6);
    const dy = -fontSizePx * 0.2 + (Math.cos(d * 4 + time * 2) * fontSizePx * 0.5) - dProg * (fontSizePx * 0.4);
    const dSize = Math.max(1.8, fontSizePx * 0.06 * (1.0 - dProg * 0.5));

    ctx.fillStyle = '#E0F7FF';
    ctx.shadowColor = '#00F0FF';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(dx, dy, dSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Helper to draw Deep Space Andromeda Galaxy Nebula & Orbiting Exoplanet
 */
function drawGalaxyNebulaSupercluster(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const radius = Math.max(w * 0.65, fontSizePx * 1.1);

  // Multi-Layer Swirling Nebula Gas Clouds
  const nebulaGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  nebulaGrad.addColorStop(0, 'rgba(138, 43, 226, 0.45)');
  nebulaGrad.addColorStop(0.4, 'rgba(255, 0, 128, 0.3)');
  nebulaGrad.addColorStop(0.7, 'rgba(0, 240, 255, 0.2)');
  nebulaGrad.addColorStop(1, 'transparent');

  ctx.fillStyle = nebulaGrad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  // Orbiting Ringed Exoplanet
  const planetAngle = time * 2.2;
  const planetDistX = Math.cos(planetAngle) * (w * 0.58);
  const planetDistY = Math.sin(planetAngle) * (fontSizePx * 0.45);
  const planetRadius = fontSizePx * 0.16;

  ctx.save();
  ctx.translate(planetDistX, planetDistY);

  // Planet body
  const planetGrad = ctx.createRadialGradient(-planetRadius * 0.3, -planetRadius * 0.3, 0, 0, 0, planetRadius);
  planetGrad.addColorStop(0, '#00F0FF');
  planetGrad.addColorStop(0.7, '#8A2BE2');
  planetGrad.addColorStop(1, '#05021A');
  ctx.fillStyle = planetGrad;
  ctx.shadowColor = '#00F0FF';
  ctx.shadowBlur = 12 * glowMul;
  ctx.beginPath();
  ctx.arc(0, 0, planetRadius, 0, Math.PI * 2);
  ctx.fill();

  // Saturn-like Planetary Tilted Rings
  ctx.strokeStyle = 'rgba(255, 230, 100, 0.85)';
  ctx.lineWidth = Math.max(1.5, fontSizePx * 0.04);
  ctx.beginPath();
  ctx.ellipse(0, 0, planetRadius * 2.2, planetRadius * 0.6, -0.4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();

  // Twinkling Stardust Constellation Nodes
  for (let s = 0; s < 7; s++) {
    const sx = Math.sin(s * 7 + time * 1.5) * (w * 0.55);
    const sy = Math.cos(s * 5 + time * 2) * (fontSizePx * 0.45);
    drawDiamondSparkle(ctx, sx, sy, fontSizePx * 0.22, '#FFFDF0', time * 8 + s);
  }

  ctx.restore();
}

/**
 * Helper to draw Cyber Ninja Neon Shuriken Storm
 */
function drawCyberNinjaShurikenStorm(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  // Dual spinning 4-point neon laser shurikens on left and right
  [-1, 1].forEach(side => {
    const sx = side * (w * 0.55);
    const sy = Math.sin(time * 5 + side) * (fontSizePx * 0.15);
    const shurikenRadius = fontSizePx * 0.35;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(time * (side * 14));

    // 4 Curved Laser Blades
    ctx.fillStyle = side === 1 ? '#00F0FF' : '#FF0055';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = side === 1 ? '#00F0FF' : '#FF0055';
    ctx.shadowBlur = 18 * glowMul;

    ctx.beginPath();
    for (let b = 0; b < 4; b++) {
      const angle = (b * Math.PI) / 2;
      const tipX = Math.cos(angle) * shurikenRadius;
      const tipY = Math.sin(angle) * shurikenRadius;
      const midAngle = angle + Math.PI / 4;
      const midX = Math.cos(midAngle) * (shurikenRadius * 0.35);
      const midY = Math.sin(midAngle) * (shurikenRadius * 0.35);

      if (b === 0) ctx.moveTo(tipX, tipY);
      else ctx.lineTo(tipX, tipY);
      ctx.lineTo(midX, midY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Center Titanium Core Eye
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 0, shurikenRadius * 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  });

  // Razor Speed Slicing Motion Streaks across word
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.75)';
  ctx.lineWidth = Math.max(2, fontSizePx * 0.05);
  ctx.shadowColor = '#00F0FF';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(-w * 0.6, -fontSizePx * 0.2);
  ctx.lineTo(w * 0.6, fontSizePx * 0.2);
  ctx.stroke();

  ctx.restore();
}

/**
 * Helper to draw Tesla Coil High-Frequency Chain Discharge Plasma
 */
function drawTeslaCoilLightningChain(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const coilW = w * 1.25;

  // Left and Right Tesla Coil Emitter Spheres
  [-1, 1].forEach(side => {
    const ex = side * (coilW * 0.5);
    const ey = 0;
    const sphereR = fontSizePx * 0.22;

    const sphereGrad = ctx.createRadialGradient(ex - 2, ey - 2, 0, ex, ey, sphereR);
    sphereGrad.addColorStop(0, '#FFFFFF');
    sphereGrad.addColorStop(0.4, '#C084FC');
    sphereGrad.addColorStop(1, '#6B21A8');

    ctx.fillStyle = sphereGrad;
    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 20 * glowMul;
    ctx.beginPath();
    ctx.arc(ex, ey, sphereR, 0, Math.PI * 2);
    ctx.fill();
  });

  // Multi-Branching Continuous Jagged High-Voltage Plasma Arc Chain
  for (let a = 0; a < 3; a++) {
    const startX = -coilW * 0.48;
    const endX = coilW * 0.48;
    const steps = 10;
    const stepDx = (endX - startX) / steps;

    ctx.strokeStyle = a === 0 ? '#FFFFFF' : a === 1 ? '#00F0FF' : '#E879F9';
    ctx.lineWidth = a === 0 ? Math.max(2, fontSizePx * 0.06) : Math.max(1.2, fontSizePx * 0.035);
    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 18 * glowMul;

    ctx.beginPath();
    ctx.moveTo(startX, 0);

    for (let s = 1; s < steps; s++) {
      const sx = startX + s * stepDx;
      const jitter = (Math.sin(time * 35 + s * 7 + a * 3) * (fontSizePx * 0.35));
      ctx.lineTo(sx, jitter);
    }
    ctx.lineTo(endX, 0);
    ctx.stroke();
  }

  // Floating Ionized Air Sparks
  for (let p = 0; p < 6; p++) {
    const px = -w * 0.4 + (p / 5) * (w * 0.8) + (Math.random() - 0.5) * 8;
    const py = (Math.sin(time * 20 + p) * fontSizePx * 0.35);
    drawDiamondSparkle(ctx, px, py, fontSizePx * 0.2, '#E879F9', time * 12);
  }

  ctx.restore();
}

/**
 * Helper to draw Sakura Samurai Blade Katana Flash & Swirling Petals
 */
function drawCherryBlossomSamuraiSlash(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const slashW = w * 1.3;

  // Razor sharp Katana Flash Slash line
  const slashGrad = ctx.createLinearGradient(-slashW * 0.5, -fontSizePx * 0.4, slashW * 0.5, fontSizePx * 0.4);
  slashGrad.addColorStop(0, 'rgba(255, 182, 193, 0)');
  slashGrad.addColorStop(0.35, '#FFFFFF');
  slashGrad.addColorStop(0.5, '#FF69B4');
  slashGrad.addColorStop(0.65, '#FFFFFF');
  slashGrad.addColorStop(1, 'rgba(255, 182, 193, 0)');

  ctx.strokeStyle = slashGrad;
  ctx.lineWidth = Math.max(2.5, fontSizePx * 0.07);
  ctx.shadowColor = '#FF69B4';
  ctx.shadowBlur = 20 * glowMul;

  ctx.beginPath();
  ctx.moveTo(-slashW * 0.5, -fontSizePx * 0.35);
  ctx.lineTo(slashW * 0.5, fontSizePx * 0.35);
  ctx.stroke();

  // Floating & Spinning Sakura Petals in wind vortex
  const petalCount = 9;
  for (let p = 0; p < petalCount; p++) {
    const pProg = ((time * 1.2 + p * 0.12) % 1.0);
    const px = -w * 0.5 + pProg * (w * 1.1);
    const py = Math.sin(pProg * Math.PI * 3 + p) * (fontSizePx * 0.45);
    const pRot = time * 3 + p;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(pRot);

    ctx.fillStyle = p % 2 === 0 ? '#FFB7C5' : '#FF69B4';
    ctx.shadowColor = '#FFB7C5';
    ctx.shadowBlur = 8;

    // Organic Sakura Petal Shape
    ctx.beginPath();
    ctx.ellipse(0, 0, fontSizePx * 0.12, fontSizePx * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}

/**
 * Helper to draw T-1000 Liquid Mercury Chrome Morph Waves
 */
function drawLiquidMercuryChromeMorph(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const chromeW = w * 1.25;

  // Specular Liquid Metallic Reflection Waves
  const sweepX = -chromeW * 0.5 + ((time * 1.8) % 1.0) * chromeW;
  const sweepGrad = ctx.createLinearGradient(sweepX - fontSizePx * 0.6, -fontSizePx * 0.4, sweepX + fontSizePx * 0.6, fontSizePx * 0.4);
  sweepGrad.addColorStop(0, 'transparent');
  sweepGrad.addColorStop(0.3, 'rgba(180, 220, 255, 0.4)');
  sweepGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
  sweepGrad.addColorStop(0.7, 'rgba(180, 220, 255, 0.4)');
  sweepGrad.addColorStop(1, 'transparent');

  ctx.fillStyle = sweepGrad;
  ctx.fillRect(-chromeW * 0.5, -fontSizePx * 0.5, chromeW, fontSizePx * 1.0);

  // Dripping Liquid Mercury Metal Globules
  [-0.3, 0, 0.3].forEach((pos, idx) => {
    const dropX = pos * w;
    const dropY = fontSizePx * 0.35 + Math.sin(time * 4 + idx) * (fontSizePx * 0.15);
    const dropR = fontSizePx * (0.09 - idx * 0.015);

    const metalGrad = ctx.createRadialGradient(dropX - 2, dropY - 2, 0, dropX, dropY, dropR);
    metalGrad.addColorStop(0, '#FFFFFF');
    metalGrad.addColorStop(0.5, '#CBD5E1');
    metalGrad.addColorStop(1, '#475569');

    ctx.fillStyle = metalGrad;
    ctx.shadowColor = '#94A3B8';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(dropX, dropY, dropR, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

/**
 * Helper to draw Astral Zodiac Star Constellation Lines & Sacred Geometry
 */
function drawAstralConstellationZodiac(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const starNodes = [
    { x: -w * 0.45, y: -fontSizePx * 0.35 },
    { x: -w * 0.2, y: fontSizePx * 0.3 },
    { x: 0, y: -fontSizePx * 0.4 },
    { x: w * 0.22, y: fontSizePx * 0.25 },
    { x: w * 0.48, y: -fontSizePx * 0.3 },
  ];

  // Glowing Constellation Connecting Lines
  ctx.strokeStyle = 'rgba(167, 139, 250, 0.75)';
  ctx.lineWidth = Math.max(1.5, fontSizePx * 0.04);
  ctx.shadowColor = '#A78BFA';
  ctx.shadowBlur = 16 * glowMul;

  ctx.beginPath();
  starNodes.forEach((n, idx) => {
    if (idx === 0) ctx.moveTo(n.x, n.y);
    else ctx.lineTo(n.x, n.y);
  });
  ctx.stroke();

  // Sacred Geometry Outer Rings
  ctx.save();
  ctx.rotate(time * 1.5);
  ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.setLineDash([4, 6]);
  ctx.arc(0, 0, Math.max(w * 0.55, fontSizePx * 0.85), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Luminous Zodiac Star Nodes
  starNodes.forEach((n, idx) => {
    drawDiamondSparkle(ctx, n.x, n.y, fontSizePx * 0.25, '#FFFFFF', time * 8 + idx);
  });

  ctx.restore();
}

/**
 * Helper to draw Volcanic Magma Eruption & Flying Obsidian Shards
 */
function drawLavaMagmaVolcanoEruption(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const fissureW = w * 1.35;
  const baseY = fontSizePx * 0.35;

  // Glowing Magma Fissure Trench
  const magmaGrad = ctx.createLinearGradient(-fissureW * 0.5, 0, fissureW * 0.5, 0);
  magmaGrad.addColorStop(0, 'rgba(255, 69, 0, 0)');
  magmaGrad.addColorStop(0.3, '#FF3300');
  magmaGrad.addColorStop(0.5, '#FFE600');
  magmaGrad.addColorStop(0.7, '#FF3300');
  magmaGrad.addColorStop(1, 'rgba(255, 69, 0, 0)');

  ctx.fillStyle = magmaGrad;
  ctx.shadowColor = '#FF4500';
  ctx.shadowBlur = 24 * glowMul;
  ctx.beginPath();
  ctx.ellipse(0, baseY, fissureW * 0.5, fontSizePx * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  // Exploding flying sharp obsidian rock debris shards
  const shards = [
    { x: -w * 0.35, y: -fontSizePx * 0.45, size: fontSizePx * 0.12, rot: time * 6 },
    { x: w * 0.4, y: -fontSizePx * 0.5, size: fontSizePx * 0.14, rot: -time * 7 },
    { x: -w * 0.15, y: -fontSizePx * 0.6, size: fontSizePx * 0.1, rot: time * 9 },
    { x: w * 0.2, y: -fontSizePx * 0.55, size: fontSizePx * 0.11, rot: -time * 8 },
  ];

  shards.forEach(s => {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);

    // Black volcanic rock with glowing molten orange edge
    ctx.fillStyle = '#1A0B05';
    ctx.strokeStyle = '#FF4500';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = '#FF4500';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.moveTo(0, -s.size);
    ctx.lineTo(s.size * 0.9, 0);
    ctx.lineTo(s.size * 0.4, s.size);
    ctx.lineTo(-s.size * 0.8, s.size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  });

  // Molten Lava Splashes
  for (let m = 0; m < 7; m++) {
    const mProg = ((time * 2.8 + m * 0.18) % 1.0);
    const mx = Math.sin(m * 6 + time * 3) * (w * 0.5);
    const my = baseY - mProg * (fontSizePx * 1.1);
    ctx.fillStyle = '#FFE600';
    ctx.shadowColor = '#FF3300';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(mx, my, Math.max(1.5, fontSizePx * 0.06 * (1.0 - mProg * 0.4)), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Helper to draw Sci-Fi Holographic Matrix Teleport & Digital Grid Reconstruction
 */
function drawHologramMatrixTeleport(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const holoW = w * 1.35;
  const holoH = fontSizePx * 1.3;

  // Scanning Holographic Laser Plane Beam
  const scanProg = (time * 2.2) % 1.0;
  const scanY = -holoH * 0.5 + scanProg * holoH;

  const beamGrad = ctx.createLinearGradient(0, scanY - 6, 0, scanY + 6);
  beamGrad.addColorStop(0, 'rgba(0, 240, 255, 0)');
  beamGrad.addColorStop(0.5, 'rgba(0, 255, 200, 0.95)');
  beamGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');

  ctx.fillStyle = beamGrad;
  ctx.fillRect(-holoW * 0.5, scanY - 6, holoW, 12);

  // Hologram Vertical Scanlines
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
  ctx.lineWidth = 1;
  for (let y = -holoH * 0.5; y <= holoH * 0.5; y += 5) {
    ctx.beginPath();
    ctx.moveTo(-holoW * 0.5, y);
    ctx.lineTo(holoW * 0.5, y);
    ctx.stroke();
  }

  // Corner Hologram Viewport Reticle Brackets
  const cornerSize = Math.max(8, fontSizePx * 0.2);
  ctx.strokeStyle = '#00FFCC';
  ctx.lineWidth = Math.max(1.8, fontSizePx * 0.05);
  ctx.shadowColor = '#00F0FF';
  ctx.shadowBlur = 14 * glowMul;

  const corners = [
    { x: -holoW * 0.52, y: -holoH * 0.52, sx: 1, sy: 1 },
    { x: holoW * 0.52, y: -holoH * 0.52, sx: -1, sy: 1 },
    { x: -holoW * 0.52, y: holoH * 0.52, sx: 1, sy: -1 },
    { x: holoW * 0.52, y: holoH * 0.52, sx: -1, sy: -1 },
  ];

  corners.forEach(c => {
    ctx.beginPath();
    ctx.moveTo(c.x + c.sx * cornerSize, c.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(c.x, c.y + c.sy * cornerSize);
    ctx.stroke();
  });

  // Floating Matrix Hex Telemetry Data Bits
  const hexCodes = ['0xFA', '7C', 'A9', '11', '0x4E', '8B'];
  ctx.font = `bold ${Math.max(8, fontSizePx * 0.16)}px monospace`;
  ctx.fillStyle = 'rgba(0, 255, 200, 0.85)';
  ctx.shadowBlur = 8;
  hexCodes.forEach((code, idx) => {
    const hx = -holoW * 0.45 + (idx / (hexCodes.length - 1)) * (holoW * 0.9);
    const hy = -holoH * 0.55 + Math.sin(time * 6 + idx) * (fontSizePx * 0.1);
    ctx.fillText(code, hx, hy);
  });

  // Drifting Teleport Ion Motes
  for (let m = 0; m < 6; m++) {
    const mProg = ((time * 3 + m * 0.18) % 1.0);
    const mx = Math.sin(m * 4 + time * 2) * (holoW * 0.4);
    const my = holoH * 0.5 - mProg * holoH;
    drawDiamondSparkle(ctx, mx, my, fontSizePx * 0.18, '#00FFCC', time * 8 + m);
  }

  ctx.restore();
}

/**
 * Helper to draw Mythic Cursed Black Flame Inferno & Purple Soul Embers (Amaterasu)
 */
function drawBlackFlameAmaterasuVortex(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const flameW = w * 1.3;

  // Dark Void Gravitational Backing Aura
  const darkGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(flameW * 0.6, fontSizePx * 0.9));
  darkGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
  darkGrad.addColorStop(0.4, 'rgba(88, 28, 135, 0.7)');
  darkGrad.addColorStop(0.8, 'rgba(192, 38, 211, 0.25)');
  darkGrad.addColorStop(1, 'transparent');

  ctx.fillStyle = darkGrad;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(flameW * 0.6, fontSizePx * 0.9), 0, Math.PI * 2);
  ctx.fill();

  // Swirling Black & Violet Flame Tongues
  const tongueCount = 9;
  for (let t = 0; t < tongueCount; t++) {
    const tAngle = (t * Math.PI * 2) / tongueCount + time * 4;
    const tDist = (flameW * 0.45) + Math.sin(time * 10 + t) * (fontSizePx * 0.15);
    const tx = Math.cos(tAngle) * tDist;
    const ty = Math.sin(tAngle) * (fontSizePx * 0.45) - (fontSizePx * 0.1);

    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(tAngle + Math.PI / 2);

    // Jet-black flame core with burning purple/magenta corona
    const fGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, fontSizePx * 0.25);
    fGrad.addColorStop(0, '#000000');
    fGrad.addColorStop(0.5, '#7E22CE');
    fGrad.addColorStop(0.85, '#E879F9');
    fGrad.addColorStop(1, 'transparent');

    ctx.fillStyle = fGrad;
    ctx.shadowColor = '#C026D3';
    ctx.shadowBlur = 18 * glowMul;

    ctx.beginPath();
    ctx.moveTo(0, -fontSizePx * 0.35);
    ctx.bezierCurveTo(fontSizePx * 0.15, -fontSizePx * 0.15, fontSizePx * 0.15, fontSizePx * 0.15, 0, fontSizePx * 0.25);
    ctx.bezierCurveTo(-fontSizePx * 0.15, fontSizePx * 0.15, -fontSizePx * 0.15, -fontSizePx * 0.15, 0, -fontSizePx * 0.35);
    ctx.fill();

    ctx.restore();
  }

  // Floating Cursed Purple Soul Embers
  for (let e = 0; e < 8; e++) {
    const eProg = ((time * 2.2 + e * 0.13) % 1.0);
    const ex = Math.sin(e * 5 + time * 2) * (w * 0.5);
    const ey = fontSizePx * 0.4 - eProg * (fontSizePx * 1.2);
    const eSize = Math.max(1.8, fontSizePx * 0.07 * (1.0 - eProg * 0.5));

    ctx.fillStyle = '#F472B6';
    ctx.shadowColor = '#C026D3';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(ex, ey, eSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Helper to draw Celestial Supernova Core Detonation & Ring Shockwave
 */
function drawSupernovaCosmicShockwave(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const radius = Math.max(w * 0.65, fontSizePx * 1.1);

  // Expanding Blazing Relativistic Circular Shockwave Rings
  [0, 0.4].forEach((offset, idx) => {
    const ringProg = ((time * 2.5 + offset) % 1.0);
    const ringR = radius * (0.2 + ringProg * 0.8);
    const ringAlpha = (1.0 - ringProg) * 0.9;

    ctx.strokeStyle = idx === 0 ? `rgba(255, 240, 200, ${ringAlpha})` : `rgba(0, 240, 255, ${ringAlpha})`;
    ctx.lineWidth = Math.max(1.5, fontSizePx * 0.06 * (1.0 - ringProg * 0.5));
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 24 * glowMul;

    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Blinding Core Thermonuclear Flash
  const corePulse = 1.0 + Math.sin(time * 25) * 0.15;
  const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, fontSizePx * 0.7 * corePulse);
  coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
  coreGrad.addColorStop(0.3, 'rgba(255, 215, 0, 0.8)');
  coreGrad.addColorStop(0.65, 'rgba(255, 69, 0, 0.4)');
  coreGrad.addColorStop(1, 'transparent');

  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(0, 0, fontSizePx * 0.7 * corePulse, 0, Math.PI * 2);
  ctx.fill();

  // 4-Point Relativistic Starburst Flare Spikes
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(2, fontSizePx * 0.05);
  ctx.shadowColor = '#FFF59D';
  ctx.shadowBlur = 20;

  const spikeLen = radius * 1.1;
  ctx.beginPath();
  ctx.moveTo(-spikeLen, 0);
  ctx.lineTo(spikeLen, 0);
  ctx.moveTo(0, -spikeLen * 0.6);
  ctx.lineTo(0, spikeLen * 0.6);
  ctx.stroke();

  // Radiating Cosmic Stardust Sparkles
  for (let s = 0; s < 8; s++) {
    const sAngle = (s * Math.PI * 2) / 8 + time * 3;
    const sDist = radius * (0.6 + Math.sin(time * 12 + s) * 0.3);
    drawDiamondSparkle(ctx, Math.cos(sAngle) * sDist, Math.sin(sAngle) * sDist, fontSizePx * 0.25, '#FFFFFF', time * 10 + s);
  }

  ctx.restore();
}

/**
 * Helper to draw Japanese Kintsugi Golden Crack Repair & Shimmering Gold Seams
 */
function drawGoldenKintsugiFractures(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const kintW = w * 1.25;

  // Branching 24K Molten Gold Fracture Seams across text
  const branches = [
    [
      { x: -kintW * 0.45, y: -fontSizePx * 0.35 },
      { x: -kintW * 0.2, y: fontSizePx * 0.05 },
      { x: 0, y: -fontSizePx * 0.25 },
      { x: kintW * 0.25, y: fontSizePx * 0.2 },
      { x: kintW * 0.48, y: -fontSizePx * 0.3 },
    ],
    [
      { x: -kintW * 0.15, y: -fontSizePx * 0.4 },
      { x: -kintW * 0.05, y: -fontSizePx * 0.05 },
      { x: kintW * 0.12, y: fontSizePx * 0.35 },
    ],
  ];

  branches.forEach(branch => {
    // Glowing molten gold outline underlayer
    ctx.strokeStyle = 'rgba(255, 140, 0, 0.8)';
    ctx.lineWidth = Math.max(3.5, fontSizePx * 0.08);
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 22 * glowMul;
    ctx.beginPath();
    branch.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // Pure 24K Liquid Gold core stream
    ctx.strokeStyle = '#FFE600';
    ctx.lineWidth = Math.max(1.8, fontSizePx * 0.04);
    ctx.shadowColor = '#FFFFFF';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    branch.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
  });

  // Specular Gold Sheen Traverse Node
  const sweepProgress = ((time * 1.5) % 1.0);
  const sweepX = -kintW * 0.45 + sweepProgress * (kintW * 0.9);
  const sweepY = Math.sin(sweepProgress * Math.PI * 3) * (fontSizePx * 0.25);
  drawDiamondSparkle(ctx, sweepX, sweepY, fontSizePx * 0.32, '#FFFFFF', time * 12);

  // Floating Micro Gold Foil Leaf Flakes
  for (let f = 0; f < 6; f++) {
    const fProg = ((time * 1.8 + f * 0.16) % 1.0);
    const fx = -w * 0.45 + fProg * (w * 0.9);
    const fy = (Math.cos(f * 4 + time * 3) * (fontSizePx * 0.45));
    ctx.fillStyle = '#FFE600';
    ctx.shadowColor = '#FFA500';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(fx, fy, fontSizePx * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Helper to draw Synthwave Outrun Neon Gridwire Highway & Digital Sun Horizon
 */
function drawHyperSynthLaserHighway(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const synthW = w * 1.4;
  const horizonY = fontSizePx * 0.15;
  const bottomY = fontSizePx * 0.65;

  // Retro Wireframe Neon Sun behind Horizon
  const sunR = fontSizePx * 0.45;
  const sunGrad = ctx.createLinearGradient(0, horizonY - sunR, 0, horizonY);
  sunGrad.addColorStop(0, '#FFE600');
  sunGrad.addColorStop(0.5, '#FF007F');
  sunGrad.addColorStop(1, '#7928CA');

  ctx.fillStyle = sunGrad;
  ctx.shadowColor = '#FF007F';
  ctx.shadowBlur = 22 * glowMul;
  ctx.beginPath();
  ctx.arc(0, horizonY, sunR, Math.PI, Math.PI * 2);
  ctx.fill();

  // Horizontal Sun Scanline Slits
  ctx.fillStyle = '#05021A';
  for (let s = 1; s <= 3; s++) {
    const slitY = horizonY - sunR * (s * 0.22);
    ctx.fillRect(-sunR, slitY, sunR * 2, 2.5);
  }

  // 3D Perspective Receding Neon Road Grid
  ctx.strokeStyle = '#00F0FF';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#00F0FF';
  ctx.shadowBlur = 12 * glowMul;

  // Perspective Longitude Grid Lines
  const gridLanes = 6;
  for (let l = -gridLanes / 2; l <= gridLanes / 2; l++) {
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(l * (synthW / gridLanes), bottomY);
    ctx.stroke();
  }

  // Moving Perspective Latitude Scan Bars
  for (let h = 0; h < 4; h++) {
    const latProg = ((time * 2.0 + h * 0.25) % 1.0);
    const latY = horizonY + Math.pow(latProg, 1.8) * (bottomY - horizonY);
    const latW = synthW * (0.3 + latProg * 0.7);

    ctx.strokeStyle = `rgba(255, 0, 128, ${0.4 + latProg * 0.6})`;
    ctx.beginPath();
    ctx.moveTo(-latW * 0.5, latY);
    ctx.lineTo(latW * 0.5, latY);
    ctx.stroke();
  }

  // Neon Highway Edge Guide Lasers
  ctx.strokeStyle = '#FF007F';
  ctx.lineWidth = Math.max(2, fontSizePx * 0.05);
  ctx.shadowColor = '#FF007F';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(-synthW * 0.5, bottomY);
  ctx.lineTo(0, horizonY);
  ctx.lineTo(synthW * 0.5, bottomY);
  ctx.stroke();

  ctx.restore();
}

/**
 * Helper to draw Cyberpunk Neuro Glitch Overload & Data Deconstruction
 */
function drawCyberGlitchOverloadRGB(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const glitchW = w * 1.3;
  const glitchH = fontSizePx * 1.25;

  // Dynamic Twitch Glitch Slices
  const isJitter = Math.sin(time * 30) > 0.35;
  const jitterX = isJitter ? (Math.random() - 0.5) * 12 : 0;

  // Split Cyan Layer Offset
  ctx.fillStyle = 'rgba(0, 240, 255, 0.45)';
  ctx.fillRect(-glitchW * 0.5 + jitterX - 4, -fontSizePx * 0.35, glitchW, fontSizePx * 0.1);

  // Split Magenta Layer Offset
  ctx.fillStyle = 'rgba(255, 0, 85, 0.45)';
  ctx.fillRect(-glitchW * 0.5 - jitterX + 4, fontSizePx * 0.1, glitchW, fontSizePx * 0.12);

  // Micro Binary Circuit Slices
  ctx.strokeStyle = '#00F0FF';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#00F0FF';
  ctx.shadowBlur = 14 * glowMul;

  ctx.beginPath();
  ctx.moveTo(-glitchW * 0.52, -glitchH * 0.4);
  ctx.lineTo(-glitchW * 0.4, -glitchH * 0.4);
  ctx.lineTo(-glitchW * 0.35, -glitchH * 0.2);
  ctx.moveTo(glitchW * 0.4, glitchH * 0.4);
  ctx.lineTo(glitchW * 0.52, glitchH * 0.4);
  ctx.stroke();

  // Telemetry Error Flag Indicator
  ctx.font = `bold ${Math.max(8, fontSizePx * 0.15)}px monospace`;
  ctx.fillStyle = '#FF0055';
  ctx.shadowColor = '#FF0055';
  ctx.shadowBlur = 8;
  ctx.fillText('ERR_CORRUPT // 0x99', -glitchW * 0.45, -glitchH * 0.45);

  ctx.restore();
}

/**
 * Helper to draw Nordic Emerald Aurora Sky & Floating Stardust Ribbons
 */
function drawEmeraldAuroraBorealisFlow(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const auroraW = w * 1.45;

  // Serpentine Undulating Aurora Ribbon Waves
  const ribbons = [
    { color: '#10B981', yOffset: -fontSizePx * 0.3, speed: 2.2, amp: fontSizePx * 0.18 },
    { color: '#06B6D4', yOffset: -fontSizePx * 0.15, speed: 2.8, amp: fontSizePx * 0.14 },
    { color: '#8B5CF6', yOffset: 0, speed: 1.8, amp: fontSizePx * 0.16 },
  ];

  ribbons.forEach((ribbon, rIdx) => {
    const waveGrad = ctx.createLinearGradient(-auroraW * 0.5, 0, auroraW * 0.5, 0);
    waveGrad.addColorStop(0, 'transparent');
    waveGrad.addColorStop(0.3, ribbon.color);
    waveGrad.addColorStop(0.7, '#A7F3D0');
    waveGrad.addColorStop(1, 'transparent');

    ctx.strokeStyle = waveGrad;
    ctx.lineWidth = Math.max(3, fontSizePx * 0.08);
    ctx.shadowColor = ribbon.color;
    ctx.shadowBlur = 24 * glowMul;

    ctx.beginPath();
    const steps = 16;
    const dx = auroraW / steps;
    for (let s = 0; s <= steps; s++) {
      const sx = -auroraW * 0.5 + s * dx;
      const sy = ribbon.yOffset + Math.sin(time * ribbon.speed + s * 0.5 + rIdx) * ribbon.amp;
      if (s === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  });

  // Soft Ambient Arctic Stardust
  for (let s = 0; s < 7; s++) {
    const sx = Math.sin(s * 6 + time * 1.5) * (w * 0.55);
    const sy = Math.cos(s * 4 + time * 2) * (fontSizePx * 0.45);
    drawDiamondSparkle(ctx, sx, sy, fontSizePx * 0.22, '#E0F2FE', time * 6 + s);
  }

  ctx.restore();
}

/**
 * Helper to draw Anime Super Spirit Energy Sphere & Gathering Blue Ki Orbs (Spirit Bomb)
 */
function drawShonenEnergySpiritBomb(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  progress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const bombR = Math.max(w * 0.5, fontSizePx * 0.9);
  const orbCenterY = -fontSizePx * 0.65;

  // Massive Hovering Spirit Bomb Sphere
  const bombGrad = ctx.createRadialGradient(0, orbCenterY, 0, 0, orbCenterY, bombR);
  bombGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
  bombGrad.addColorStop(0.3, 'rgba(103, 232, 249, 0.85)');
  bombGrad.addColorStop(0.7, 'rgba(2, 132, 199, 0.4)');
  bombGrad.addColorStop(1, 'transparent');

  ctx.fillStyle = bombGrad;
  ctx.shadowColor = '#00F0FF';
  ctx.shadowBlur = 30 * glowMul;
  ctx.beginPath();
  ctx.arc(0, orbCenterY, bombR, 0, Math.PI * 2);
  ctx.fill();

  // Inward Gathering Spiral Ki Streams
  const streamCount = 8;
  for (let s = 0; s < streamCount; s++) {
    const sProg = ((time * 2.5 + s * 0.12) % 1.0);
    const sAngle = s * ((Math.PI * 2) / streamCount) + sProg * Math.PI;
    const sDist = bombR * (1.8 - sProg * 1.2);
    const sx = Math.cos(sAngle) * sDist;
    const sy = orbCenterY + Math.sin(sAngle) * sDist;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = Math.max(1.8, fontSizePx * 0.05);
    ctx.shadowColor = '#38BDF8';
    ctx.shadowBlur = 14;

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(0, orbCenterY);
    ctx.stroke();

    drawDiamondSparkle(ctx, sx, sy, fontSizePx * 0.22, '#E0F7FF', time * 12);
  }

  // Radiating Ionic Shockwave Rings
  const shockProg = (time * 3) % 1.0;
  ctx.strokeStyle = `rgba(0, 240, 255, ${1.0 - shockProg})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, orbCenterY, bombR * (0.8 + shockProg * 0.6), 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/**
 * Helper to draw Prismatic Diamond Caustics & Multi-Beam Laser Prism Shimmer
 */
function drawDiamondHyperDiscoPrism(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const prismW = w * 1.35;

  // Multi-Beam Rainbow Laser Prism Fan
  const colors = ['#FF0055', '#FF7700', '#FFE600', '#00FF9D', '#00F0FF', '#7928CA'];
  const beamCount = colors.length;

  colors.forEach((col, idx) => {
    const angle = ((idx - (beamCount - 1) / 2) * 0.3) + Math.sin(time * 4) * 0.15;
    const len = fontSizePx * 1.2;

    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, fontSizePx * 0.05);
    ctx.shadowColor = col;
    ctx.shadowBlur = 18 * glowMul;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.sin(angle) * len, Math.cos(angle) * len);
    ctx.stroke();
  });

  // Dual Rotating 3D Crystal Gem Facet Stars on left & right
  [-1, 1].forEach(side => {
    const dx = side * (prismW * 0.5);
    const dy = Math.sin(time * 6 + side) * (fontSizePx * 0.15);
    const crystalR = fontSizePx * 0.28;

    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(time * (side * 8));

    ctx.fillStyle = side === 1 ? '#00F0FF' : '#FF007F';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#FFFFFF';
    ctx.shadowBlur = 16;

    // 8-Point Diamond Facet Shape
    ctx.beginPath();
    for (let p = 0; p < 8; p++) {
      const pAngle = (p * Math.PI) / 4;
      const rad = p % 2 === 0 ? crystalR : crystalR * 0.45;
      const px = Math.cos(pAngle) * rad;
      const py = Math.sin(pAngle) * rad;
      if (p === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  });

  // Dynamic Rainbow Sheen Sweep across text
  const sweepProgress = ((time * 1.8) % 1.0);
  const sweepX = -prismW * 0.5 + sweepProgress * prismW;
  drawDiamondSparkle(ctx, sweepX, 0, fontSizePx * 0.35, '#FFFFFF', time * 12);

  ctx.restore();
}

/**
 * Helper to draw Divine Solar Phoenix Flaming Wings & Golden Feather Burst
 */
function drawPhoenixWingsSolarAscension(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const wingW = w * 1.45;

  // Radiating Divine Solar Halo
  const haloR = Math.max(w * 0.6, fontSizePx * 1.0);
  const haloGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, haloR);
  haloGrad.addColorStop(0, 'rgba(255, 230, 100, 0.4)');
  haloGrad.addColorStop(0.5, 'rgba(255, 69, 0, 0.25)');
  haloGrad.addColorStop(1, 'transparent');

  ctx.fillStyle = haloGrad;
  ctx.beginPath();
  ctx.arc(0, 0, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Majestic Symmetrical Golden Phoenix Wings
  [-1, 1].forEach(side => {
    ctx.save();
    ctx.scale(side, 1);

    const flapAngle = Math.sin(time * 8 + side) * 0.18;
    ctx.rotate(flapAngle);

    // 4 Layered Flaming Feather Pinions
    for (let f = 0; f < 4; f++) {
      const fProg = f / 4;
      const featherGrad = ctx.createLinearGradient(0, 0, wingW * 0.5, -fontSizePx * (0.3 + fProg * 0.4));
      featherGrad.addColorStop(0, '#FFFFFF');
      featherGrad.addColorStop(0.4, '#FFE600');
      featherGrad.addColorStop(0.8, '#FF4500');
      featherGrad.addColorStop(1, 'transparent');

      ctx.strokeStyle = featherGrad;
      ctx.lineWidth = Math.max(3, fontSizePx * (0.09 - f * 0.015));
      ctx.shadowColor = '#FF4500';
      ctx.shadowBlur = 24 * glowMul;

      ctx.beginPath();
      ctx.moveTo(0, fontSizePx * 0.1);
      ctx.bezierCurveTo(
        wingW * 0.25,
        -fontSizePx * (0.2 + fProg * 0.2),
        wingW * 0.45,
        -fontSizePx * (0.5 + fProg * 0.4),
        wingW * (0.55 + fProg * 0.1),
        -fontSizePx * (0.3 + fProg * 0.5)
      );
      ctx.stroke();
    }

    ctx.restore();
  });

  // Floating Golden Flaming Feathers drifting upward
  for (let f = 0; f < 7; f++) {
    const fProg = ((time * 2.0 + f * 0.14) % 1.0);
    const fx = Math.sin(f * 5 + time * 3) * (w * 0.55);
    const fy = fontSizePx * 0.4 - fProg * (fontSizePx * 1.2);
    const fSize = Math.max(1.8, fontSizePx * 0.07 * (1.0 - fProg * 0.5));

    ctx.fillStyle = '#FFE600';
    ctx.shadowColor = '#FF4500';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(fx, fy, fSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * 1. Casino 777 Jackpot Gold Rush & Slot Machine Marquee
 */
function drawCasinoJackpotGoldRush(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  wordProgress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const marqueeW = Math.max(w * 1.35, fontSizePx * 3.5);
  const marqueeH = fontSizePx * 1.55;

  // 1. Outer Golden Marquee Border
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = Math.max(2, fontSizePx * 0.06);
  ctx.fillStyle = 'rgba(20, 10, 0, 0.7)';
  ctx.shadowColor = '#FBBF24';
  ctx.shadowBlur = 16 * glowMul;
  ctx.beginPath();
  ctx.roundRect(-marqueeW / 2, -marqueeH / 2, marqueeW, marqueeH, 8);
  ctx.fill();
  ctx.stroke();

  // 2. Chasing Marquee Light Bulbs
  const numBulbs = 18;
  for (let b = 0; b < numBulbs; b++) {
    const perimeterProg = (b / numBulbs + time * 1.5) % 1.0;
    let bx = 0;
    let by = 0;
    if (perimeterProg < 0.35) {
      bx = -marqueeW / 2 + (perimeterProg / 0.35) * marqueeW;
      by = -marqueeH / 2;
    } else if (perimeterProg < 0.5) {
      bx = marqueeW / 2;
      by = -marqueeH / 2 + ((perimeterProg - 0.35) / 0.15) * marqueeH;
    } else if (perimeterProg < 0.85) {
      bx = marqueeW / 2 - ((perimeterProg - 0.5) / 0.35) * marqueeW;
      by = marqueeH / 2;
    } else {
      bx = -marqueeW / 2;
      by = marqueeH / 2 - ((perimeterProg - 0.85) / 0.15) * marqueeH;
    }

    const isLightOn = Math.floor((b + time * 12)) % 2 === 0;
    ctx.fillStyle = isLightOn ? '#FEF08A' : '#D97706';
    ctx.shadowColor = '#FBBF24';
    ctx.shadowBlur = isLightOn ? 10 : 2;
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(1.8, fontSizePx * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Top Floating Slot Header [ 7 7 7 ]
  ctx.font = `900 ${Math.round(fontSizePx * 0.28)}px Impact, sans-serif`;
  ctx.fillStyle = '#FEF08A';
  ctx.shadowColor = '#F59E0B';
  ctx.shadowBlur = 8;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★ 7 7 7 JACKPOT ★', 0, -marqueeH / 2 - fontSizePx * 0.22);

  // 4. Raining & Bouncing 3D Gold Coins with $ stamped
  const coinCount = 10;
  for (let c = 0; c < coinCount; c++) {
    const cProg = ((time * 2.2 + c * 0.1) % 1.0);
    const cxPos = Math.sin(c * 7 + time * 2) * (marqueeW * 0.6);
    const cyPos = -marqueeH * 0.8 + cProg * (marqueeH * 2.2);
    const cScaleX = Math.abs(Math.cos(time * 8 + c * 2));
    const cRadius = Math.max(3, fontSizePx * 0.12);

    ctx.save();
    ctx.translate(cxPos, cyPos);
    ctx.scale(Math.max(0.2, cScaleX), 1.0);

    ctx.fillStyle = '#FBBF24';
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#F59E0B';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, cRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (cScaleX > 0.5) {
      ctx.font = `bold ${Math.round(cRadius * 1.3)}px sans-serif`;
      ctx.fillStyle = '#78350F';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 0);
    }
    ctx.restore();
  }

  ctx.restore();
}

/**
 * 2. Real-Time Audio Equalizer Spectrum Visualizer Bars
 */
function drawAudioVisualizerEqBars(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const numBars = 16;
  const eqW = Math.max(w * 1.25, fontSizePx * 3.2);
  const barW = Math.max(3, (eqW / numBars) * 0.65);
  const barGap = (eqW - barW * numBars) / (numBars - 1);
  const maxH = fontSizePx * 0.85;

  const startX = -eqW / 2;
  const baseY = fontSizePx * 0.55;

  for (let i = 0; i < numBars; i++) {
    const x = startX + i * (barW + barGap);
    // Simulating rhythmic multi-octave frequencies
    const freq1 = Math.sin(time * 14 + i * 0.8) * 0.5 + 0.5;
    const freq2 = Math.cos(time * 22 + i * 1.4) * 0.3 + 0.3;
    const freq3 = Math.sin(time * 30 + i * 2.1) * 0.2 + 0.2;
    const barNorm = Math.min(1.0, Math.max(0.12, freq1 + freq2 + freq3));
    const h = barNorm * maxH;

    // Spectrum Color Gradient (Lime -> Cyan -> Magenta -> Yellow)
    const colGrad = ctx.createLinearGradient(0, baseY, 0, baseY - h);
    colGrad.addColorStop(0, '#10B981');
    colGrad.addColorStop(0.5, '#06B6D4');
    colGrad.addColorStop(0.85, '#F43F5E');
    colGrad.addColorStop(1, '#FBBF24');

    ctx.fillStyle = colGrad;
    ctx.shadowColor = '#06B6D4';
    ctx.shadowBlur = 8 * glowMul;
    ctx.beginPath();
    ctx.roundRect(x, baseY - h, barW, h, [2, 2, 0, 0]);
    ctx.fill();

    // Floating Peak-Hold Falloff Cap Indicator
    const capNorm = Math.min(1.0, Math.max(barNorm, (Math.sin(time * 6 + i * 0.5) * 0.5 + 0.5)));
    const capY = baseY - capNorm * maxH - 3;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#F43F5E';
    ctx.shadowBlur = 6;
    ctx.fillRect(x, capY - 2, barW, 2);
  }

  ctx.restore();
}

/**
 * 3. Retro 8-Bit Pixel Arcade KO & Score Float
 */
function drawRetroArcade8BitGameOver(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  wordProgress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const boxW = Math.max(w * 1.28, fontSizePx * 3.2);
  const boxH = fontSizePx * 1.45;
  const pSize = Math.max(3, Math.round(fontSizePx * 0.07));

  // 1. Pixelated CRT Box Outline with stepped pixel corners
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH);

  ctx.strokeStyle = '#00FF66';
  ctx.lineWidth = pSize;
  ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

  // Stepped pixel corner accents
  ctx.fillStyle = '#FFE600';
  const corners = [
    [-boxW / 2, -boxH / 2],
    [boxW / 2 - pSize * 2, -boxH / 2],
    [-boxW / 2, boxH / 2 - pSize * 2],
    [boxW / 2 - pSize * 2, boxH / 2 - pSize * 2],
  ];
  corners.forEach(([cxPos, cyPos]) => {
    ctx.fillRect(cxPos, cyPos, pSize * 2, pSize * 2);
  });

  // 2. Floating Animated 8-Bit Score Tag: +1000 PTS
  const scoreY = -boxH / 2 - fontSizePx * 0.28 - (Math.sin(time * 6) * 4);
  ctx.font = `bold ${Math.round(fontSizePx * 0.28)}px monospace`;
  ctx.fillStyle = '#FFE600';
  ctx.shadowColor = '#FF0055';
  ctx.shadowBlur = 8 * glowMul;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('1UP  +1000 PTS', 0, scoreY);

  // 3. Floating 8-Bit Rotating Pixel Coin
  const coinX = boxW / 2 + fontSizePx * 0.25;
  const coinY = -boxH * 0.2;
  const coinPhase = Math.floor(time * 8) % 4;
  const coinPixelW = coinPhase === 0 ? pSize * 3 : coinPhase === 1 ? pSize * 2 : coinPhase === 2 ? pSize : pSize * 2;
  ctx.fillStyle = '#FFE600';
  ctx.fillRect(coinX - coinPixelW / 2, coinY - pSize * 2, coinPixelW, pSize * 4);

  // 4. Pixelated Stars
  for (let s = 0; s < 4; s++) {
    const sx = Math.sin(s * 4 + time * 3) * (boxW * 0.5);
    const sy = Math.cos(s * 3 + time * 2) * (boxH * 0.6);
    ctx.fillStyle = s % 2 === 0 ? '#00FFFF' : '#FF007F';
    ctx.fillRect(sx, sy, pSize, pSize);
  }

  ctx.restore();
}

/**
 * 4. Toxic Nuclear Biohazard Caution Tape & Radioactive Slime
 */
function drawToxicNuclearBiohazardTape(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const tapeW = Math.max(w * 1.4, fontSizePx * 3.6);
  const tapeH = fontSizePx * 0.28;

  // 1. Top & Bottom Diagonal Hazard Striped Caution Ribbons
  [-fontSizePx * 0.68, fontSizePx * 0.68].forEach((tapeY, idx) => {
    ctx.save();
    ctx.translate(0, tapeY);
    ctx.rotate(idx === 0 ? -0.04 : 0.04);

    // Yellow background strip
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-tapeW / 2, -tapeH / 2, tapeW, tapeH);

    // Black diagonal stripes
    const stripeSpacing = fontSizePx * 0.25;
    const stripeShift = (time * 40) % stripeSpacing;
    ctx.fillStyle = '#000000';
    for (let x = -tapeW / 2 - stripeSpacing; x < tapeW / 2 + stripeSpacing; x += stripeSpacing) {
      ctx.beginPath();
      ctx.moveTo(x + stripeShift, -tapeH / 2);
      ctx.lineTo(x + stripeShift + stripeSpacing * 0.5, -tapeH / 2);
      ctx.lineTo(x + stripeShift, tapeH / 2);
      ctx.lineTo(x + stripeShift - stripeSpacing * 0.5, tapeH / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  });

  // 2. Rotating Radioactive Biohazard Trefoil Symbol
  ctx.save();
  ctx.translate(w * 0.58, -fontSizePx * 0.25);
  ctx.rotate(time * 3);
  const trefoilR = fontSizePx * 0.22;

  ctx.fillStyle = '#22C55E';
  ctx.shadowColor = '#22C55E';
  ctx.shadowBlur = 14 * glowMul;

  for (let blade = 0; blade < 3; blade++) {
    const ang = (blade * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * trefoilR * 0.55, Math.sin(ang) * trefoilR * 0.55, trefoilR * 0.45, ang - 0.6, ang + 0.6);
    ctx.lineTo(0, 0);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, trefoilR * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 3. Bubbling Radioactive Slime Droplets dripping down
  for (let d = 0; d < 6; d++) {
    const dProg = ((time * 1.8 + d * 0.16) % 1.0);
    const dx = -w * 0.45 + d * (w * 0.18) + Math.sin(time * 5 + d) * 4;
    const dy = fontSizePx * 0.5 + dProg * (fontSizePx * 0.7);
    const dSize = Math.max(1.5, fontSizePx * 0.08 * (1.0 - dProg * 0.4));

    ctx.fillStyle = '#4ADE80';
    ctx.shadowColor = '#22C55E';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(dx, dy, dSize, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * 5. Dimensional Space Rift Tear & Hyperspace Void
 */
function drawDimensionalSpaceRiftTear(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const riftW = Math.max(w * 1.45, fontSizePx * 3.8);

  // 1. Jagged Dark Matter Reality Tear Polygon
  ctx.save();
  ctx.shadowColor = '#A855F7';
  ctx.shadowBlur = 24 * glowMul;

  const points = 12;
  ctx.fillStyle = 'rgba(10, 0, 25, 0.95)';
  ctx.beginPath();
  ctx.moveTo(-riftW / 2, 0);
  for (let i = 1; i < points; i++) {
    const px = -riftW / 2 + (i / points) * riftW;
    const jagged = Math.sin(i * 4 + time * 5) * (fontSizePx * 0.35);
    ctx.lineTo(px, -fontSizePx * 0.3 + jagged);
  }
  ctx.lineTo(riftW / 2, 0);
  for (let i = points - 1; i >= 1; i--) {
    const px = -riftW / 2 + (i / points) * riftW;
    const jagged = Math.cos(i * 3 + time * 4) * (fontSizePx * 0.35);
    ctx.lineTo(px, fontSizePx * 0.3 + jagged);
  }
  ctx.closePath();
  ctx.fill();

  // Glowing Purple Rift Energy Border
  ctx.strokeStyle = '#C084FC';
  ctx.lineWidth = Math.max(2, fontSizePx * 0.05);
  ctx.stroke();
  ctx.restore();

  // 2. Dimensional Purple Lightning Arcs
  for (let l = 0; l < 4; l++) {
    const lx1 = -riftW * 0.4 + l * (riftW * 0.25);
    const ly1 = (l % 2 === 0 ? -1 : 1) * (fontSizePx * 0.45);
    const lx2 = lx1 + Math.sin(time * 12 + l) * 20;
    const ly2 = 0;
    drawLightningArc(ctx, lx1, ly1, lx2, ly2, '#E879F9', Math.max(1.5, fontSizePx * 0.035), time * 25 + l);
  }

  // 3. Floating Inward Cosmic Shards
  for (let s = 0; s < 8; s++) {
    const sProg = ((time * 1.5 + s * 0.12) % 1.0);
    const sAngle = s * (Math.PI / 4) + time * 2;
    const sDist = (1.0 - sProg) * (fontSizePx * 1.2);
    const sx = Math.cos(sAngle) * sDist;
    const sy = Math.sin(sAngle) * (sDist * 0.6);

    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = '#C084FC';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1, fontSizePx * 0.04), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * 6. Shonen Manga Screentone Impact & Japanese Action Sound Kanji
 */
function drawMangaScreentoneComicPunch(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  wordProgress: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const burstR = Math.max(w * 0.85, fontSizePx * 2.2);

  // 1. Comic Action Converging Speedlines
  const numRays = 24;
  ctx.fillStyle = '#000000';
  for (let r = 0; r < numRays; r++) {
    const ang = (r * Math.PI * 2) / numRays;
    const rayLen = burstR * (1.2 + Math.sin(r * 5 + time * 12) * 0.35);
    const rayWidth = 0.05;

    ctx.beginPath();
    ctx.moveTo(Math.cos(ang - rayWidth) * rayLen, Math.sin(ang - rayWidth) * rayLen);
    ctx.lineTo(Math.cos(ang + rayWidth) * rayLen, Math.sin(ang + rayWidth) * rayLen);
    ctx.lineTo(Math.cos(ang) * (burstR * 0.45), Math.sin(ang) * (burstR * 0.45));
    ctx.closePath();
    ctx.fill();
  }

  // 2. High-Contrast White Action Bubble
  const spring = getSpringOvershootScale(wordProgress, 1.4);
  ctx.save();
  ctx.scale(spring, spring);
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(3, fontSizePx * 0.08);

  const bubbleW = w * 1.25;
  const bubbleH = fontSizePx * 1.35;
  drawComicBurstPolygon(ctx, 0, 0, bubbleW, bubbleH, '#FFFFFF', '#000000', Math.max(3, fontSizePx * 0.08));
  ctx.restore();

  // 3. Japanese Onomatopoeia Kanji / Katakana Action Glyph [ ドンッ ]
  ctx.font = `900 ${Math.round(fontSizePx * 0.45)}px "Black Han Sans", Impact, sans-serif`;
  ctx.fillStyle = '#DC2626';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const kanjiX = w * 0.62;
  const kanjiY = -fontSizePx * 0.45;
  ctx.strokeText('ドンッ!!', kanjiX, kanjiY);
  ctx.fillText('ドンッ!!', kanjiX, kanjiY);

  ctx.restore();
}

/**
 * 7. Authentic Matrix Falling Green Katakana/Binary Code Cascade
 */
function drawMatrixFallingCodeCascade(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const cols = 9;
  const spreadW = Math.max(w * 1.35, fontSizePx * 3.4);
  const colSpacing = spreadW / (cols - 1);
  const colH = fontSizePx * 1.8;

  const glyphChars = ['0', '1', 'ｱ', 'ｶ', 'ｻ', 'ﾀ', 'ﾅ', 'ﾊ', 'ﾏ', 'ﾔ', 'ﾗ', 'ﾜ', '9', '7', 'X', 'Z'];

  ctx.font = `bold ${Math.round(fontSizePx * 0.22)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let c = 0; c < cols; c++) {
    const colX = -spreadW / 2 + c * colSpacing;
    const speed = 1.4 + (c % 3) * 0.6;
    const colOffset = ((time * speed + c * 0.25) % 1.0);

    const charCount = 6;
    for (let k = 0; k < charCount; k++) {
      const charNorm = (colOffset - (k * 0.12) + 1.0) % 1.0;
      const charY = -colH / 2 + charNorm * colH;

      const charIdx = Math.floor((c * 7 + k + Math.floor(time * 8)) % glyphChars.length);
      const glyph = glyphChars[charIdx];

      if (k === 0) {
        // Leading glowing white head character
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#00FF66';
        ctx.shadowBlur = 12 * glowMul;
        ctx.fillText(glyph, colX, charY);
      } else {
        // Trailing fading green characters
        const trailAlpha = Math.max(0.1, 1.0 - k * 0.18);
        ctx.fillStyle = `rgba(0, 255, 102, ${trailAlpha})`;
        ctx.shadowColor = '#00FF66';
        ctx.shadowBlur = 4;
        ctx.fillText(glyph, colX, charY);
      }
    }
  }

  ctx.restore();
}

/**
 * 8. Tactical Laser Sniper Target Lock-On & Rangefinder
 */
function drawLaserSniperTargetLock(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  wordProgress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const lockSize = Math.max(w * 0.75, fontSizePx * 1.5);
  const lockSpring = Math.max(0.85, 1.4 - wordProgress * 0.4);
  const currentSize = lockSize * lockSpring;

  // 1. Outer Rotating Compass Degree Ring
  ctx.save();
  ctx.rotate(time * 1.2);
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, currentSize * 0.85, 0, Math.PI * 2);
  ctx.stroke();

  // Compass tick marks
  for (let t = 0; t < 12; t++) {
    const ang = (t * Math.PI * 2) / 12;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * (currentSize * 0.8), Math.sin(ang) * (currentSize * 0.8));
    ctx.lineTo(Math.cos(ang) * (currentSize * 0.88), Math.sin(ang) * (currentSize * 0.88));
    ctx.stroke();
  }
  ctx.restore();

  // 2. Corner Bracket Reticles [ ]
  const bracketLen = fontSizePx * 0.32;
  const bDist = currentSize * 0.65;
  ctx.strokeStyle = '#EF4444';
  ctx.lineWidth = Math.max(2, fontSizePx * 0.06);
  ctx.shadowColor = '#EF4444';
  ctx.shadowBlur = 14 * glowMul;

  const corners = [
    [-bDist, -bDist, 1, 1],
    [bDist, -bDist, -1, 1],
    [-bDist, bDist, 1, -1],
    [bDist, bDist, -1, -1],
  ];
  corners.forEach(([bx, by, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(bx, by + dy * bracketLen);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + dx * bracketLen, by);
    ctx.stroke();
  });

  // 3. Central Red Laser Targeting Dot & Pulse
  const laserPulse = 1.0 + Math.sin(time * 20) * 0.2;
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = '#EF4444';
  ctx.shadowBlur = 16 * glowMul;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(2, fontSizePx * 0.06 * laserPulse), 0, Math.PI * 2);
  ctx.fill();

  // 4. Tactical Rangefinder Readout: [ LOCK 100% // RNG: 420M ]
  ctx.font = `bold ${Math.round(fontSizePx * 0.2)}px monospace`;
  ctx.fillStyle = '#EF4444';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TARGET: LOCKED [100%]', 0, currentSize * 0.95);

  ctx.restore();
}

/**
 * 9. Magical Girl Astral Heart Wand & Starlight Sparkle Burst
 */
function drawMagicalGirlPrismWand(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const wandY = -fontSizePx * 0.52;

  // 1. Central Spinning Golden-Pink Crystal Star Wand
  ctx.save();
  ctx.translate(0, wandY);
  ctx.rotate(time * 2);

  const starR = fontSizePx * 0.35;
  ctx.fillStyle = '#F472B6';
  ctx.strokeStyle = '#FEF08A';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#EC4899';
  ctx.shadowBlur = 16 * glowMul;

  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? starR : starR * 0.45;
    const ang = (i * Math.PI) / 4;
    if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
    else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 2. Trailing Pastel Rainbow Ribbon Arc
  ctx.save();
  for (let r = 0; r < 3; r++) {
    const rColors = ['#F472B6', '#A78BFA', '#38BDF8'];
    ctx.strokeStyle = rColors[r];
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.arc(0, 0, fontSizePx * (0.8 + r * 0.15), -Math.PI * 0.8 + time * 2, -Math.PI * 0.2 + time * 2);
    ctx.stroke();
  }
  ctx.restore();

  // 3. Orbiting Pastel Star Glints & Heart Particles
  for (let s = 0; s < 7; s++) {
    const sProg = ((time * 1.6 + s * 0.14) % 1.0);
    const sAng = s * (Math.PI / 3.5) + time * 3;
    const sDist = (w * 0.45) + Math.sin(time * 4 + s) * 12;
    const sx = Math.cos(sAng) * sDist;
    const sy = Math.sin(sAng) * (fontSizePx * 0.6);

    drawDiamondSparkle(ctx, sx, sy, Math.max(3, fontSizePx * 0.15 * (1.0 - sProg * 0.4)), s % 2 === 0 ? '#FEF08A' : '#F472B6', time * 6 + s);
  }

  ctx.restore();
}

/**
 * 10. Cyberpunk Skull Cyber Reaper Hologram & Death Counter
 */
function drawGlitchSkullCyberReaper(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  wordProgress: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const skullY = -fontSizePx * 0.58;
  const skullScale = Math.max(0.7, fontSizePx * 0.015);

  // 1. Neon Hologram Cyber Skull Icon
  ctx.save();
  ctx.translate(0, skullY);
  ctx.scale(skullScale, skullScale);

  ctx.strokeStyle = '#DC2626';
  ctx.fillStyle = 'rgba(20, 0, 5, 0.85)';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#EF4444';
  ctx.shadowBlur = 18 * glowMul;

  // Skull cranium & jaw
  ctx.beginPath();
  ctx.arc(0, -5, 18, Math.PI * 0.85, Math.PI * 2.15);
  ctx.lineTo(10, 16);
  ctx.lineTo(-10, 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Glowing red laser eye sockets
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = '#EF4444';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(-7, -4, 4, 0, Math.PI * 2);
  ctx.arc(7, -4, 4, 0, Math.PI * 2);
  ctx.fill();

  // Teeth grill lines
  ctx.strokeStyle = '#EF4444';
  ctx.lineWidth = 2;
  for (let t = -6; t <= 6; t += 4) {
    ctx.beginPath();
    ctx.moveTo(t, 8);
    ctx.lineTo(t, 16);
    ctx.stroke();
  }
  ctx.restore();

  // 2. Glitch Telemetry Text [ ERR: 0xDEAD // OVERRIDE ]
  ctx.font = `bold ${Math.round(fontSizePx * 0.2)}px monospace`;
  ctx.fillStyle = '#EF4444';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ERR: 0xDEAD_REAPER', 0, fontSizePx * 0.62);

  // 3. Jagged Digital Glitch Slices
  for (let g = 0; g < 4; g++) {
    const gy = -fontSizePx * 0.4 + g * (fontSizePx * 0.28);
    const gShift = Math.sin(time * 30 + g * 5) * 8;
    ctx.fillStyle = g % 2 === 0 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(0, 240, 255, 0.5)';
    ctx.fillRect(-w * 0.55 + gShift, gy, w * 1.1, 2);
  }

  ctx.restore();
}

/**
 * 1. Vintage Polaroid Instant Camera Frame & Flash
 */
function drawPolaroidCameraFlash(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  wordProgress: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const cardW = Math.max(w * 1.35, fontSizePx * 3.4);
  const cardH = fontSizePx * 1.65;
  const bottomBorder = fontSizePx * 0.42;

  // 1. Polaroid White Paper Card Body (Slight tilt)
  ctx.save();
  ctx.rotate(-0.03 + Math.sin(time * 3) * 0.01);

  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillRect(-cardW / 2, -cardH / 2, cardW, cardH + bottomBorder);

  // Inner Dark Photo Area
  ctx.fillStyle = '#111827';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillRect(-cardW / 2 + 8, -cardH / 2 + 8, cardW - 16, cardH - 12);

  // Rainbow Polaroid color strip at bottom
  const stripY = cardH / 2 + bottomBorder - 10;
  const stripW = cardW * 0.28;
  const stripX = cardW / 2 - stripW - 12;
  const pColors = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#3B82F6'];
  pColors.forEach((col, idx) => {
    ctx.fillStyle = col;
    ctx.fillRect(stripX + idx * (stripW / 5), stripY, stripW / 5, 4);
  });

  ctx.restore();

  // 2. Camera Flash Burst on entrance
  if (wordProgress < 0.3) {
    const flashAlpha = Math.max(0, 1.0 - (wordProgress / 0.3));
    ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha * 0.85})`;
    ctx.fillRect(-w * 1.5, -fontSizePx * 2, w * 3, fontSizePx * 4);
  }

  ctx.restore();
}

/**
 * 2. Police Emergency Red & Blue Strobe Siren Flasher
 */
function drawPoliceSirenStrobe(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const phase = Math.floor(time * 16) % 4; // 0,1: Red, 2,3: Blue
  const isRed = phase < 2;

  const sirenW = Math.max(w * 1.4, fontSizePx * 3.6);
  const sirenH = fontSizePx * 1.4;

  // 1. Red & Blue alternating ambient lighting bars
  const redAlpha = isRed ? 0.45 : 0.08;
  const blueAlpha = !isRed ? 0.45 : 0.08;

  // Left Red Beacon Flare
  const redGrad = ctx.createRadialGradient(-sirenW / 2, 0, 5, -sirenW / 2, 0, sirenW * 0.6);
  redGrad.addColorStop(0, `rgba(239, 68, 68, ${redAlpha})`);
  redGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = redGrad;
  ctx.beginPath();
  ctx.arc(-sirenW / 2, 0, sirenW * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Right Blue Beacon Flare
  const blueGrad = ctx.createRadialGradient(sirenW / 2, 0, 5, sirenW / 2, 0, sirenW * 0.6);
  blueGrad.addColorStop(0, `rgba(59, 130, 246, ${blueAlpha})`);
  blueGrad.addColorStop(1, 'rgba(59, 130, 246, 0)');
  ctx.fillStyle = blueGrad;
  ctx.beginPath();
  ctx.arc(sirenW / 2, 0, sirenW * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // 2. Emergency Lightbar on top
  const barY = -fontSizePx * 0.65;
  ctx.fillStyle = '#18181B';
  ctx.fillRect(-sirenW * 0.35, barY - 4, sirenW * 0.7, 8);

  ctx.fillStyle = isRed ? '#EF4444' : '#7F1D1D';
  ctx.shadowColor = '#EF4444';
  ctx.shadowBlur = isRed ? 18 : 2;
  ctx.fillRect(-sirenW * 0.32, barY - 6, sirenW * 0.28, 12);

  ctx.fillStyle = !isRed ? '#3B82F6' : '#1E3A8A';
  ctx.shadowColor = '#3B82F6';
  ctx.shadowBlur = !isRed ? 18 : 2;
  ctx.fillRect(sirenW * 0.04, barY - 6, sirenW * 0.28, 12);

  ctx.restore();
}

/**
 * 3. Burning Newspaper Headline & Charred Ash Ember Frame
 */
function drawBurningNewspaperHeadline(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const paperW = Math.max(w * 1.35, fontSizePx * 3.4);
  const paperH = fontSizePx * 1.45;

  // 1. Aged Parchment / Newspaper Background
  ctx.fillStyle = '#F5E6C8';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.fillRect(-paperW / 2, -paperH / 2, paperW, paperH);

  // Newspaper Header Line
  ctx.strokeStyle = '#292524';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-paperW / 2 + 10, -paperH / 2 + 12);
  ctx.lineTo(paperW / 2 - 10, -paperH / 2 + 12);
  ctx.stroke();

  ctx.font = `bold ${Math.round(fontSizePx * 0.18)}px "Times New Roman", serif`;
  ctx.fillStyle = '#292524';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('THE DAILY CHRONICLE • BREAKING NEWS', 0, -paperH / 2 + 16);

  // 2. Glowing Burning Bottom Edge with Charred Orange Fire
  for (let i = 0; i < 10; i++) {
    const fireProg = (time * 4 + i * 0.25) % 1.0;
    const fx = -paperW / 2 + i * (paperW / 9);
    const fy = paperH / 2 - Math.sin(time * 6 + i) * 6;
    const fRadius = (1.0 - fireProg) * (fontSizePx * 0.22);

    ctx.fillStyle = i % 2 === 0 ? '#EA580C' : '#FBBF24';
    ctx.shadowColor = '#EA580C';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(fx, fy - fireProg * 14, Math.max(1, fRadius), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * 4. Deep Underwater Oceanic Bubble Reef & Water Caustics
 */
function drawUnderwaterAquariumReef(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const tankW = Math.max(w * 1.35, fontSizePx * 3.4);
  const tankH = fontSizePx * 1.5;

  // 1. Deep Sea Azure Gradient Backdrop
  const aquaGrad = ctx.createLinearGradient(0, -tankH / 2, 0, tankH / 2);
  aquaGrad.addColorStop(0, 'rgba(6, 182, 212, 0.45)');
  aquaGrad.addColorStop(1, 'rgba(15, 23, 42, 0.85)');
  ctx.fillStyle = aquaGrad;
  ctx.beginPath();
  ctx.roundRect(-tankW / 2, -tankH / 2, tankW, tankH, 12);
  ctx.fill();

  // 2. Rising Translucent Air Bubbles
  for (let b = 0; b < 12; b++) {
    const bProg = ((time * 1.2 + b * 0.18) % 1.0);
    const bx = -tankW * 0.45 + (b * (tankW * 0.08)) + Math.sin(time * 4 + b) * 8;
    const by = tankH / 2 - bProg * (tankH * 1.4);
    const bRadius = Math.max(2, fontSizePx * (0.04 + (b % 4) * 0.025));

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.9)';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = '#06B6D4';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(bx, by, bRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Bubble highlight specular dot
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(bx - bRadius * 0.3, by - bRadius * 0.3, bRadius * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Gentle Swaying Seaweed Fronds on sides
  [-tankW * 0.46, tankW * 0.46].forEach((weedX, widx) => {
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(weedX, tankH / 2);
    const sway = Math.sin(time * 3 + widx) * 12;
    ctx.quadraticCurveTo(weedX + sway, 0, weedX - sway * 0.5, -tankH * 0.35);
    ctx.stroke();
  });

  ctx.restore();
}

/**
 * 5. Architectural CAD Blueprint Grid & Drafting Compass
 */
function drawBlueprintArchitectCadGrid(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const bpW = Math.max(w * 1.35, fontSizePx * 3.4);
  const bpH = fontSizePx * 1.45;
  const gridSize = 14;

  // 1. Blueprint Deep Prussian Blue Card
  ctx.fillStyle = '#0F2B5C';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.fillRect(-bpW / 2, -bpH / 2, bpW, bpH);
  ctx.strokeRect(-bpW / 2, -bpH / 2, bpW, bpH);

  // 2. Blueprint Fine Coordinate Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  for (let x = -bpW / 2; x <= bpW / 2; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, -bpH / 2);
    ctx.lineTo(x, bpH / 2);
    ctx.stroke();
  }
  for (let y = -bpH / 2; y <= bpH / 2; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(-bpW / 2, y);
    ctx.lineTo(bpW / 2, y);
    ctx.stroke();
  }

  // 3. Drafting Technical Annotations
  ctx.font = `bold ${Math.round(fontSizePx * 0.16)}px monospace`;
  ctx.fillStyle = '#93C5FD';
  ctx.textAlign = 'left';
  ctx.fillText('REV: A-01 [SCALE 1:50]', -bpW / 2 + 6, -bpH / 2 + 12);
  ctx.textAlign = 'right';
  ctx.fillText(`DIM: ${Math.round(w)}mm`, bpW / 2 - 6, bpH / 2 - 6);

  // 4. Dimension Guide Marks
  ctx.strokeStyle = '#93C5FD';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-w / 2, bpH / 2 - 8);
  ctx.lineTo(w / 2, bpH / 2 - 8);
  ctx.moveTo(-w / 2, bpH / 2 - 12);
  ctx.lineTo(-w / 2, bpH / 2 - 4);
  ctx.moveTo(w / 2, bpH / 2 - 12);
  ctx.lineTo(w / 2, bpH / 2 - 4);
  ctx.stroke();

  ctx.restore();
}

/**
 * 6. Realistic Neon Glass Gas Tube Sign & Wall Mounting Brackets
 */
function drawNeonGasTubeFlicker(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const tubeW = Math.max(w * 1.3, fontSizePx * 3.2);
  const tubeH = fontSizePx * 1.35;

  // 1. Dark Brick/Concrete Studio Backdrop
  ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
  ctx.fillRect(-tubeW / 2, -tubeH / 2, tubeW, tubeH);

  // 2. Black Metal Wall Standoff Brackets
  const standoffs = [
    [-tubeW * 0.45, -tubeH * 0.4],
    [tubeW * 0.45, -tubeH * 0.4],
    [-tubeW * 0.45, tubeH * 0.4],
    [tubeW * 0.45, tubeH * 0.4],
  ];
  standoffs.forEach(([sx, sy]) => {
    ctx.fillStyle = '#3F3F46';
    ctx.fillRect(sx - 4, sy - 4, 8, 8);
    ctx.strokeStyle = '#18181B';
    ctx.strokeRect(sx - 4, sy - 4, 8, 8);
  });

  // 3. High-Voltage Neon Transformer Wire
  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-tubeW * 0.45, -tubeH * 0.4);
  ctx.quadraticCurveTo(-tubeW * 0.55, 0, -tubeW * 0.45, tubeH * 0.4);
  ctx.stroke();

  // 4. Random Voltage Flicker Effect
  const flicker = Math.random() > 0.96 ? 0.3 : 1.0;
  ctx.fillStyle = `rgba(236, 72, 153, ${0.15 * flicker})`;
  ctx.shadowColor = '#EC4899';
  ctx.shadowBlur = 24 * flicker;
  ctx.fillRect(-tubeW / 2, -tubeH / 2, tubeW, tubeH);

  ctx.restore();
}

/**
 * 7. Wild West Wooden Wanted Poster & Bullet Hole Impacts
 */
function drawWesternWantedPoster(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const postW = Math.max(w * 1.35, fontSizePx * 3.4);
  const postH = fontSizePx * 1.65;

  // 1. Weathered Wood Grain / Parchment Poster
  ctx.fillStyle = '#E7D3A7';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.fillRect(-postW / 2, -postH / 2, postW, postH);

  // Decorative Border Inset
  ctx.strokeStyle = '#451A03';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-postW / 2 + 8, -postH / 2 + 8, postW - 16, postH - 16);

  // Top 'WANTED' Header
  ctx.font = `900 ${Math.round(fontSizePx * 0.26)}px "Playfair Display", serif`;
  ctx.fillStyle = '#451A03';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★ WANTED : REWARD $10,000 ★', 0, -postH / 2 + 20);

  // 2. Realistic Metal Bullet Hole Impacts
  const bulletHoles = [
    [-postW / 2 + 18, -postH / 2 + 20],
    [postW / 2 - 18, postH / 2 - 20],
  ];
  bulletHoles.forEach(([bx, by]) => {
    // Outer charred lead ring
    ctx.fillStyle = '#1C1917';
    ctx.beginPath();
    ctx.arc(bx, by, 5, 0, Math.PI * 2);
    ctx.fill();

    // Wood splinter cracks
    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = 1;
    for (let c = 0; c < 4; c++) {
      const ang = (c * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(ang) * 10, by + Math.sin(ang) * 10);
      ctx.stroke();
    }
  });

  ctx.restore();
}

/**
 * 8. Submarine Sonar Radar Green Sweep & Ocean Target Pings
 */
function drawRadarSonarSubmarinePing(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const radarR = Math.max(w * 0.75, fontSizePx * 1.6);

  // 1. Radar Circular CRT Screen
  ctx.fillStyle = 'rgba(0, 20, 10, 0.85)';
  ctx.strokeStyle = '#10B981';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#10B981';
  ctx.shadowBlur = 12 * glowMul;
  ctx.beginPath();
  ctx.arc(0, 0, radarR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Concentric Distance Rings
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
  ctx.lineWidth = 1;
  [0.35, 0.7].forEach((ratio) => {
    ctx.beginPath();
    ctx.arc(0, 0, radarR * ratio, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Crosshair Lines
  ctx.beginPath();
  ctx.moveTo(-radarR, 0);
  ctx.lineTo(radarR, 0);
  ctx.moveTo(0, -radarR);
  ctx.lineTo(0, radarR);
  ctx.stroke();

  // 2. Rotating Phosphor Sweep Line & Pie Wedge
  const sweepAngle = (time * 3.5) % (Math.PI * 2);
  ctx.save();
  ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, radarR, sweepAngle - 0.5, sweepAngle);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#34D399';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(sweepAngle) * radarR, Math.sin(sweepAngle) * radarR);
  ctx.stroke();
  ctx.restore();

  // 3. Pulsing Target Contact Blip
  const blipAng = 0.8;
  const blipDist = radarR * 0.6;
  const blipX = Math.cos(blipAng) * blipDist;
  const blipY = Math.sin(blipAng) * blipDist;
  const blipPulse = (Math.sin(time * 8) + 1) * 0.5;

  ctx.fillStyle = '#FEF08A';
  ctx.shadowColor = '#FEF08A';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(blipX, blipY, 3 + blipPulse * 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * 9. Street Graffiti Aerosol Spray Paint Splatter & Dripping Runs
 */
function drawGraffitiSpraycanDrip(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const sprayW = Math.max(w * 1.35, fontSizePx * 3.4);

  // 1. Aerosol Fine Mist Cloud Behind
  const sprayGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, sprayW * 0.6);
  sprayGrad.addColorStop(0, 'rgba(234, 179, 8, 0.45)');
  sprayGrad.addColorStop(1, 'rgba(234, 179, 8, 0)');
  ctx.fillStyle = sprayGrad;
  ctx.beginPath();
  ctx.arc(0, 0, sprayW * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // 2. Realistic Paint Splatter Specks
  for (let s = 0; s < 16; s++) {
    const sAng = s * 0.4 + Math.sin(s * 7);
    const sDist = (w * 0.4) + Math.cos(s * 13) * (fontSizePx * 0.6);
    const sx = Math.cos(sAng) * sDist;
    const sy = Math.sin(sAng) * (fontSizePx * 0.55);

    ctx.fillStyle = s % 2 === 0 ? '#FACC15' : '#EF4444';
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1, (s % 4) * 1.2), 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Heavy Dripping Paint Runs
  for (let d = 0; d < 5; d++) {
    const dx = -w * 0.4 + d * (w * 0.2);
    const dripLen = fontSizePx * (0.4 + (d % 3) * 0.3) + Math.sin(time * 3 + d) * 4;

    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(dx, fontSizePx * 0.45);
    ctx.lineTo(dx, fontSizePx * 0.45 + dripLen);
    ctx.stroke();

    // Drip bulb droplet at tip
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.arc(dx, fontSizePx * 0.45 + dripLen, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * 10. Mystic Alchemy Tarot Golden Sigil Circle & Orbiting Runes
 */
function drawMagicAlchemyTarotSigil(
  ctx: AnyCanvasContext,
  cx: number,
  cy: number,
  w: number,
  fontSizePx: number,
  time: number,
  glowMul: number
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const sigilR = Math.max(w * 0.8, fontSizePx * 1.7);

  // 1. Concentric Gold Alchemical Circles
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#FBBF24';
  ctx.shadowBlur = 16 * glowMul;

  ctx.beginPath();
  ctx.arc(0, 0, sigilR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, sigilR * 0.78, 0, Math.PI * 2);
  ctx.stroke();

  // 2. Interlocking Rotating Sacred Geometry Pentagram
  ctx.save();
  ctx.rotate(time * 0.8);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let p = 0; p < 5; p++) {
    const ang = (p * Math.PI * 4) / 5;
    const px = Math.cos(ang) * (sigilR * 0.75);
    const py = Math.sin(ang) * (sigilR * 0.75);
    if (p === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // 3. Orbiting Mystical Runes along outer ring
  const runeGlyphs = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ'];
  ctx.font = `bold ${Math.round(fontSizePx * 0.22)}px serif`;
  ctx.fillStyle = '#FEF08A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let r = 0; r < runeGlyphs.length; r++) {
    const rAng = (r * Math.PI * 2) / runeGlyphs.length - time * 0.5;
    const rx = Math.cos(rAng) * (sigilR * 0.89);
    const ry = Math.sin(rAng) * (sigilR * 0.89);
    ctx.fillText(runeGlyphs[r], rx, ry);
  }

  ctx.restore();
}

export function renderSubtitleOverlay(
  ctx: AnyCanvasContext,
  block: SubtitleBlock,
  currentTime: number,
  style: SubtitleStyle,
  canvasWidth: number,
  canvasHeight: number
): void {
  ctx.save();

  // Set font & ensure font is loaded
  if (style.fontFamily && typeof document !== 'undefined') {
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
      const speedMul = style.animationSpeedMultiplier ?? 1.0;
      const effectiveDuration = wordDuration / Math.max(0.2, speedMul);
      const wordProgress = isWordPast ? 1 : isWordFuture ? 0 : Math.max(0, Math.min(1, (currentTime - word.start) / effectiveDuration));

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
      const glowMul = style.glowIntensity ?? 1.0;
      const enableFx = style.particleFxEnabled !== false;

      // -------------------------------------------------------------
      // PRE-RENDER BACKGROUND DECORATIONS (Drawn Behind Text)
      // -------------------------------------------------------------
      if (isWordActive) {
        if (style.animationType === 'marker_highlight') {
          // Ali Abdaal / Vox Style Highlighter Pen Sweep
          ctx.save();
          const markerH = fontSizePx * 0.88;
          const markerMaxW = wordWidth * 1.14;
          const sweepW = markerMaxW * Math.min(1.0, wordProgress * 1.35);
          const markerY = wordCenterY + fontSizePx * 0.08;
          const markerX = wordCenterX - markerMaxW / 2;
          const markerAngle = -0.02; // subtle realistic hand tilt

          ctx.translate(wordCenterX, markerY);
          ctx.rotate(markerAngle);
          ctx.translate(-wordCenterX, -markerY);

          ctx.fillStyle = word.colorOverride || style.activeWordBgColor || style.activeWordColor || '#FFE600';
          ctx.globalAlpha = 0.52; // translucent highlighter feel
          ctx.beginPath();
          ctx.roundRect(markerX, markerY - markerH / 2, sweepW, markerH, [4, 8, 4, 8]);
          ctx.fill();
          ctx.restore();
        } else if (style.animationType === 'washi_tape') {
          // Realistic torn washi tape paper sticker badge
          const tapeW = wordWidth * 1.12;
          const tapeH = fontSizePx * 1.35;
          const tapeFill = word.colorOverride || style.activeWordBgColor || '#FFFBEB';
          drawWashiTapeBadge(ctx, wordCenterX, wordCenterY, tapeW, tapeH, tapeFill, -0.025);
        } else if (style.animationType === 'glassmorphism_3d') {
          // 3D Glossy Candy Pill Bubble
          const pillW = wordWidth * 1.18;
          const pillH = fontSizePx * 1.38;
          const pillCol = word.colorOverride || style.activeWordBgColor || '#1E1B4B';
          drawGlossy3DBubble(ctx, wordCenterX, wordCenterY, pillW, pillH, pillCol, fontSizePx * 0.35);
        } else if (style.animationType === 'target_hud') {
          // Tactical Sci-Fi Crosshair Brackets
          const hudCol = word.colorOverride || style.activeWordColor || '#00FF66';
          drawTacticalCrosshairs(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, hudCol, wordProgress);
        } else if (style.animationType === 'comic_burst') {
          // Comic Book Starburst / POW Badge
          const burstSpring = getSpringOvershootScale(wordProgress, 1.35);
          const burstW = wordWidth * burstSpring;
          const burstH = fontSizePx * 1.45 * burstSpring;
          const burstFill = word.colorOverride || style.activeWordBgColor || '#FFE600';
          drawComicBurstPolygon(
            ctx,
            wordCenterX,
            wordCenterY,
            burstW,
            burstH,
            burstFill,
            '#000000',
            Math.max(2.5, Math.round(fontSizePx * 0.06))
          );
        } else if (style.animationType === 'electric_plasma' && enableFx) {
          // Branching high-voltage lightning arcs around text box
          const boxHalfW = (wordWidth / 2) * 1.15;
          const boxHalfH = (fontSizePx / 2) * 1.1;
          const plasmaColor = word.colorOverride || style.activeWordColor || '#00F0FF';
          const arcW = Math.max(1.5, Math.round(fontSizePx * 0.05));
          const tSeed = currentTime * 20;

          drawLightningArc(ctx, wordCenterX - boxHalfW, wordCenterY - boxHalfH, wordCenterX + boxHalfW, wordCenterY - boxHalfH, plasmaColor, arcW, tSeed);
          drawLightningArc(ctx, wordCenterX + boxHalfW, wordCenterY - boxHalfH, wordCenterX + boxHalfW, wordCenterY + boxHalfH, plasmaColor, arcW, tSeed + 1);
          drawLightningArc(ctx, wordCenterX + boxHalfW, wordCenterY + boxHalfH, wordCenterX - boxHalfW, wordCenterY + boxHalfH, plasmaColor, arcW, tSeed + 2);
          drawLightningArc(ctx, wordCenterX - boxHalfW, wordCenterY + boxHalfH, wordCenterX - boxHalfW, wordCenterY - boxHalfH, plasmaColor, arcW, tSeed + 3);
        } else if (style.animationType === 'kaleidoscope_vortex') {
          // Concentric pulsing neon shockwave rings
          ctx.save();
          const ringColor = word.colorOverride || style.activeWordColor || '#EC4899';
          for (let r = 1; r <= 3; r++) {
            const rProg = (wordProgress * 1.5 + r * 0.3) % 1.0;
            const radius = (Math.max(wordWidth, fontSizePx) * 0.5) + rProg * (fontSizePx * 1.1);
            ctx.strokeStyle = ringColor;
            ctx.lineWidth = Math.max(1, (1.0 - rProg) * 3.5);
            ctx.globalAlpha = (1.0 - rProg) * 0.6;
            ctx.shadowColor = ringColor;
            ctx.shadowBlur = 12 * glowMul;
            ctx.beginPath();
            ctx.arc(wordCenterX, wordCenterY, radius, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        } else if (style.animationType === 'laser_beam') {
          // Blinding horizontal laser beam slice line
          ctx.save();
          const beamY = wordCenterY + fontSizePx * 0.15;
          const beamW = wordWidth * 1.6;
          const beamX = wordCenterX - beamW / 2;
          const headX = beamX + beamW * Math.min(1.0, wordProgress * 1.4);

          ctx.strokeStyle = word.colorOverride || style.activeWordColor || '#EF4444';
          ctx.lineWidth = Math.max(3, fontSizePx * 0.12);
          ctx.shadowColor = '#EF4444';
          ctx.shadowBlur = 18 * glowMul;
          ctx.beginPath();
          ctx.moveTo(beamX, beamY);
          ctx.lineTo(headX, beamY);
          ctx.stroke();

          // Laser head hotspot glint
          drawDiamondSparkle(ctx, headX, beamY, fontSizePx * 0.35, '#FFFFFF', currentTime * 5);
          ctx.restore();
        } else if (style.animationType === 'explosive_burst' || style.animationType === 'supernova_implode') {
          // Shockwave Pulse Ring
          if (wordProgress < 0.65) {
            const shockProgress = wordProgress / 0.65;
            const shockEase = 1.0 - Math.pow(1.0 - shockProgress, 3);
            const shockRadius = (Math.max(wordWidth, fontSizePx) * 0.65) + shockEase * (fontSizePx * 1.25);
            const shockAlpha = (1.0 - shockEase) * 0.85;

            ctx.save();
            ctx.strokeStyle = word.colorOverride || style.activeWordColor || '#FFD700';
            ctx.lineWidth = Math.max(2, (1.0 - shockEase) * 6);
            ctx.globalAlpha = shockAlpha;
            ctx.beginPath();
            ctx.arc(wordCenterX, wordCenterY, shockRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        } else if (style.animationType === 'meteor_impact' && enableFx) {
          // Ground tremor crater fracture & fiery rock debris
          drawMeteorImpactCrater(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, wordProgress, glowMul);
        } else if (style.animationType === 'cyber_katana_slash') {
          // High-energy intersecting laser blade slashes
          const bladeCol = word.colorOverride || style.activeWordColor || '#00F0FF';
          drawCyberKatanaSlashes(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, bladeCol, wordProgress, glowMul);
        } else if (style.animationType === 'quantum_portal' && enableFx) {
          // Swirling cosmic wormhole accretion disk
          const portalRadius = Math.max(wordWidth, fontSizePx) * 0.68;
          drawQuantumPortal(ctx, wordCenterX, wordCenterY, portalRadius, currentTime, glowMul);
        } else if (style.animationType === 'matrix_digital_rain' && enableFx) {
          // Cascading digital matrix code columns
          drawMatrixStreamRain(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx * 1.5, currentTime);
        } else if (style.animationType === 'pop_art_dot_matrix') {
          // Pop-art comic halftone dot matrix and action rays
          const dotFill = word.colorOverride || style.activeWordBgColor || '#FFE600';
          drawPopArtHalftoneBurst(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, dotFill, currentTime);
        } else if (style.animationType === 'radioactive_toxic' && enableFx) {
          // Toxic radiation pulse ring and fizzing biohazard bubbles
          drawRadioactiveToxicMist(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'hyper_drive_warp' && enableFx) {
          // Radial hyperspace star warp streaks
          drawHyperDriveWarpLines(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, wordProgress, glowMul);
        } else if (style.animationType === 'graffiti_spray') {
          // Aerosol spray cloud mist and drip splatters
          const sprayCol = word.colorOverride || style.activeWordBgColor || style.activeWordColor || '#EC4899';
          drawGraffitiSprayBackground(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, sprayCol);
        } else if (style.animationType === 'neon_wireframe_3d') {
          // Rotating isometric 3D glowing wireframe cage
          const wireCol = word.colorOverride || style.activeWordColor || '#38BDF8';
          drawNeonWireframeCube(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, wireCol, currentTime, glowMul);
        } else if (style.animationType === 'thunder_god_lightning' && enableFx) {
          // Descending Thor thunder lightning strikes & ground arcs
          const boltCol = word.colorOverride || style.activeWordColor || '#38BDF8';
          drawThunderGodLightningBolts(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, boltCol, wordProgress, glowMul);
        } else if (style.animationType === 'firework_grand_finale' && enableFx) {
          // Grand pyrotechnic fireworks bursting finale
          drawFireworkGrandFinale(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, wordProgress, glowMul);
        } else if (style.animationType === 'super_saiyan_aura' && enableFx) {
          // Anime Super Saiyan Ki plasma flame energy aura
          drawSuperSaiyanEnergyAura(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'glitch_vhs_tape' && enableFx) {
          // Retro 80s VHS tracking glitch scanlines
          drawVHSTapeGlitchScan(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'solar_flare_corona' && enableFx) {
          // Solar eclipse corona flare & plasma loops
          drawSolarCoronaFlare(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'synthwave_retro_grid' && enableFx) {
          // 3D perspective Synthwave wireframe horizon grid & striped sun
          drawSynthwaveRetroGrid(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'golden_fire_phoenix' && enableFx) {
          // Radiant flaming phoenix wings & floating embers
          drawPhoenixFireWings(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress, glowMul);
        } else if (style.animationType === 'crystal_prismatic_rainbow' && enableFx) {
          // Prismatic diamond rainbow refraction caustics
          drawPrismaticRainbowCaustics(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'kinetic_speed_lines_impact' && enableFx) {
          // Shonen anime manga radial speed lines impact frame
          drawAnimeActionSpeedLines(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, wordProgress);
        } else if (style.animationType === 'magic_runic_circle' && enableFx) {
          // Mystic Doctor Strange arcane runic mandala spell circles
          drawMysticRunicMandala(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'black_hole_singularity' && enableFx) {
          // Cosmic Black Hole Gravitational Singularity & Accretion Disk
          drawBlackHoleSingularity(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'god_rays_divine' && enableFx) {
          // Divine Celestial Volumetric God Rays & Holy Dust
          drawDivineGodRays(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'cyberpunk_hud_matrix' && enableFx) {
          // Cyberpunk Mecha HUD Targeting Telemetry Data
          drawCyberpunkTargetingHUD(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress, glowMul);
        } else if (style.animationType === 'ice_blizzard_frost' && enableFx) {
          // Sub-Zero Glacial Cryo Ice Spikes & Freeze Fog
          drawCryoIceBlizzard(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress, glowMul);
        } else if (style.animationType === 'neon_graffiti_drip' && enableFx) {
          // Toxic Acid Neon Paint Splatter & Dripping Runs
          drawToxicNeonGraffitiSplatter(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'dragon_breath_inferno' && enableFx) {
          // Scorching Dragon Breath Plasma Fire Vortex
          drawDragonInfernoBreath(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'golden_trophy_shimmer' && enableFx) {
          // 24K Royal Gold Specular Sheen & Floating Orbit Stars
          drawRoyalGoldShimmerAura(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'speed_demon_drift' && enableFx) {
          // Speed Demon Nitro Drift & Flaming Tire Skids
          drawSpeedDemonDriftSmoke(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'comic_action_blast_bubble' && enableFx) {
          // 3D Pop-Comic Action Starburst Blast & Halftone Rays
          drawComicActionBlastBubble(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, wordProgress);
        } else if (style.animationType === 'quantum_entanglement_strings' && enableFx) {
          // Quantum Wave Entanglement & 3-Axis Particle Orbits
          drawQuantumEntanglementWaves(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'plasma_arc_reactor' && enableFx) {
          // Iron Man Plasma Arc Reactor Core & Repulsor Flare
          drawPlasmaArcReactor(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'matrix_cyber_glitch_portal' && enableFx) {
          // Cyber Hex Shield Portal & Dimension Glitch
          drawCyberGlitchHexPortal(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress, glowMul);
        } else if (style.animationType === 'demon_slayer_water_wheel' && enableFx) {
          // Demon Slayer Ukiyo-e Anime Water Wheel Dragon Waves
          drawDemonSlayerWaterWheel(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'galaxy_nebula_supercluster' && enableFx) {
          // Deep Space Andromeda Galaxy Nebula & Orbiting Exoplanet
          drawGalaxyNebulaSupercluster(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'neon_cyber_shuriken' && enableFx) {
          // Cyber Ninja Neon Shuriken Storm
          drawCyberNinjaShurikenStorm(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress, glowMul);
        } else if (style.animationType === 'lightning_chain_tesla' && enableFx) {
          // Tesla Coil High-Frequency Chain Discharge Plasma
          drawTeslaCoilLightningChain(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'cherry_blossom_samurai_slash' && enableFx) {
          // Sakura Samurai Blade Katana Flash & Swirling Petals
          drawCherryBlossomSamuraiSlash(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress, glowMul);
        } else if (style.animationType === 'liquid_mercury_chrome' && enableFx) {
          // T-1000 Liquid Mercury Chrome Morph Waves
          drawLiquidMercuryChromeMorph(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'astral_constellation_zodiac' && enableFx) {
          // Astral Zodiac Star Constellation Lines & Sacred Geometry
          drawAstralConstellationZodiac(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'lava_magma_eruption' && enableFx) {
          // Volcanic Magma Eruption & Flying Obsidian Shards
          drawLavaMagmaVolcanoEruption(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'hologram_matrix_teleport' && enableFx) {
          // Sci-Fi Hologram Matrix Teleport & Digital Grid Reconstruction
          drawHologramMatrixTeleport(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'vortex_black_flame_amaterasu' && enableFx) {
          // Mythic Cursed Black Flame Inferno & Purple Soul Embers
          drawBlackFlameAmaterasuVortex(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'supernova_cosmic_shockwave' && enableFx) {
          // Celestial Supernova Core Detonation & Ring Shockwave
          drawSupernovaCosmicShockwave(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress, glowMul);
        } else if (style.animationType === 'golden_kintsugi_fracture' && enableFx) {
          // Japanese Kintsugi Golden Crack Repair & Shimmering Gold Seams
          drawGoldenKintsugiFractures(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'hyper_synth_laser_highway' && enableFx) {
          // Synthwave Outrun Neon Gridwire Highway & Digital Sun Horizon
          drawHyperSynthLaserHighway(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'cyber_glitch_overload_rgb' && enableFx) {
          // Cyberpunk Neuro Glitch Overload & Data Deconstruction
          drawCyberGlitchOverloadRGB(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress, glowMul);
        } else if (style.animationType === 'emerald_aurora_borealis_flow' && enableFx) {
          // Nordic Emerald Aurora Sky & Floating Stardust Ribbons
          drawEmeraldAuroraBorealisFlow(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'shonen_energy_spirit_bomb' && enableFx) {
          // Anime Super Spirit Energy Sphere & Gathering Blue Ki Orbs
          drawShonenEnergySpiritBomb(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress, glowMul);
        } else if (style.animationType === 'diamond_hyper_disco_prism' && enableFx) {
          // Prismatic Diamond Caustics & Multi-Beam Laser Prism Shimmer
          drawDiamondHyperDiscoPrism(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'phoenix_wings_solar_ascension' && enableFx) {
          // Divine Solar Phoenix Flaming Wings & Golden Feather Burst
          drawPhoenixWingsSolarAscension(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'casino_jackpot_gold_rush' && enableFx) {
          // Casino 777 Jackpot Gold Rush & Slot Machine Marquee
          drawCasinoJackpotGoldRush(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress, glowMul);
        } else if (style.animationType === 'audio_visualizer_eq_bars' && enableFx) {
          // Real-Time Audio Equalizer Spectrum Visualizer Bars
          drawAudioVisualizerEqBars(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'retro_arcade_8bit_gameover' && enableFx) {
          // Retro 8-Bit Pixel Arcade KO & Score Float
          drawRetroArcade8BitGameOver(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress, glowMul);
        } else if (style.animationType === 'toxic_nuclear_biohazard_tape' && enableFx) {
          // Toxic Nuclear Biohazard Caution Tape & Radioactive Slime
          drawToxicNuclearBiohazardTape(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'dimensional_space_rift_tear' && enableFx) {
          // Dimensional Space Rift Tear & Hyperspace Void
          drawDimensionalSpaceRiftTear(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'manga_screentone_comic_punch' && enableFx) {
          // Shonen Manga Screentone Impact & Japanese Action Sound Kanji
          drawMangaScreentoneComicPunch(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress);
        } else if (style.animationType === 'matrix_falling_code_cascade' && enableFx) {
          // Authentic Matrix Falling Green Katakana/Binary Code Cascade
          drawMatrixFallingCodeCascade(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'laser_sniper_target_lock' && enableFx) {
          // Tactical Laser Sniper Target Lock-On & Rangefinder
          drawLaserSniperTargetLock(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress, glowMul);
        } else if (style.animationType === 'magical_girl_prism_wand' && enableFx) {
          // Magical Girl Astral Heart Wand & Starlight Sparkle Burst
          drawMagicalGirlPrismWand(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'glitch_skull_cyber_reaper' && enableFx) {
          // Cyberpunk Skull Cyber Reaper Hologram & Death Counter
          drawGlitchSkullCyberReaper(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress, glowMul);
        } else if (style.animationType === 'polaroid_instant_camera_flash' && enableFx) {
          // Vintage Polaroid Instant Camera Frame & Flash
          drawPolaroidCameraFlash(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, wordProgress);
        } else if (style.animationType === 'police_siren_strobe_cop' && enableFx) {
          // Police Emergency Red & Blue Strobe Siren Flasher
          drawPoliceSirenStrobe(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime);
        } else if (style.animationType === 'burning_newspaper_headline' && enableFx) {
          // Burning Newspaper Headline & Charred Ash Ember Frame
          drawBurningNewspaperHeadline(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime);
        } else if (style.animationType === 'underwater_aquarium_bubble_reef' && enableFx) {
          // Deep Underwater Oceanic Bubble Reef & Water Caustics
          drawUnderwaterAquariumReef(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime);
        } else if (style.animationType === 'blueprint_architect_cad_grid' && enableFx) {
          // Architectural CAD Blueprint Grid & Drafting Compass
          drawBlueprintArchitectCadGrid(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime);
        } else if (style.animationType === 'neon_gas_tube_flicker' && enableFx) {
          // Realistic Neon Glass Gas Tube Sign & Wall Mounting Brackets
          drawNeonGasTubeFlicker(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime);
        } else if (style.animationType === 'western_wanted_poster_wood' && enableFx) {
          // Wild West Wooden Wanted Poster & Bullet Hole Impacts
          drawWesternWantedPoster(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime);
        } else if (style.animationType === 'radar_sonar_submarine_ping' && enableFx) {
          // Submarine Sonar Radar Green Sweep & Ocean Target Pings
          drawRadarSonarSubmarinePing(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        } else if (style.animationType === 'graffiti_spraycan_drip_splat' && enableFx) {
          // Street Graffiti Aerosol Spray Paint Splatter & Dripping Runs
          drawGraffitiSpraycanDrip(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime);
        } else if (style.animationType === 'magic_alchemy_tarot_sigil' && enableFx) {
          // Mystic Alchemy Tarot Golden Sigil Circle & Orbiting Runes
          drawMagicAlchemyTarotSigil(ctx, wordCenterX, wordCenterY, wordWidth, fontSizePx, currentTime, glowMul);
        }
      }

      // -------------------------------------------------------------
      // ANIMATION MECHANICS (Transforms, Timing & Shader Curves)
      // -------------------------------------------------------------
      switch (style.animationType) {
        // --- 1. Pop & Spring Variations ---
        case 'pop': {
          if (isWordActive) {
            const springMultiplier = getSpringOvershootScale(wordProgress, 1.42);
            scaleX *= baseActiveScale * springMultiplier;
            scaleY *= baseActiveScale * springMultiplier;
          }
          break;
        }

        // --- Plasma Arc Reactor Unibeam ---
        case 'plasma_arc_reactor': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.45);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const arcGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            arcGrad.addColorStop(0, '#FFFFFF');
            arcGrad.addColorStop(0.35, '#00F0FF');
            arcGrad.addColorStop(0.75, '#0066FF');
            arcGrad.addColorStop(1, '#002266');
            customFill = arcGrad;

            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 26 * glowMul;
          }
          break;
        }

        // --- Cyber Hex Shield Portal Glitch ---
        case 'matrix_cyber_glitch_portal': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.38);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            // Micro-glitch jitter displacement
            if (Math.sin(currentTime * 35) > 0.6) {
              offsetX += (Math.random() - 0.5) * 6;
              offsetY += (Math.random() - 0.5) * 4;
            }

            const hexGrad = ctx.createLinearGradient(-wordWidth / 2, 0, wordWidth / 2, 0);
            hexGrad.addColorStop(0, '#00F0FF');
            hexGrad.addColorStop(0.5, '#FFFFFF');
            hexGrad.addColorStop(1, '#FF007F');
            customFill = hexGrad;

            ctx.shadowColor = '#FF007F';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        // --- Demon Slayer Ukiyo-e Anime Water Wheel ---
        case 'demon_slayer_water_wheel': {
          if (isWordActive) {
            const waveBob = Math.sin(currentTime * 12) * (fontSizePx * 0.04);
            offsetY += waveBob;
            const spring = getSpringOvershootScale(wordProgress, 1.38);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const waterGrad = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            waterGrad.addColorStop(0, '#FFFFFF');
            waterGrad.addColorStop(0.35, '#67E8F9');
            waterGrad.addColorStop(0.7, '#0284C7');
            waterGrad.addColorStop(1, '#002266');
            customFill = waterGrad;

            ctx.shadowColor = '#38BDF8';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        // --- Deep Space Andromeda Galaxy Nebula ---
        case 'galaxy_nebula_supercluster': {
          if (isWordActive) {
            const cosPulse = 1.0 + Math.sin(currentTime * 14) * 0.06;
            scaleX *= baseActiveScale * cosPulse * 1.05;
            scaleY *= baseActiveScale * cosPulse * 1.05;

            const nebGrad = ctx.createLinearGradient(-wordWidth / 2, -fontSizePx * 0.4, wordWidth / 2, fontSizePx * 0.4);
            nebGrad.addColorStop(0, '#FFFFFF');
            nebGrad.addColorStop(0.3, '#E879F9');
            nebGrad.addColorStop(0.65, '#A855F7');
            nebGrad.addColorStop(1, '#3B82F6');
            customFill = nebGrad;

            ctx.shadowColor = '#C084FC';
            ctx.shadowBlur = 25 * glowMul;
          }
          break;
        }

        // --- Cyber Ninja Neon Shuriken Storm ---
        case 'neon_cyber_shuriken': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.48);
            scaleX *= baseActiveScale * spring * 1.06;
            scaleY *= baseActiveScale * spring;

            const ninjaGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            ninjaGrad.addColorStop(0, '#FFFFFF');
            ninjaGrad.addColorStop(0.4, '#00F0FF');
            ninjaGrad.addColorStop(1, '#FF0055');
            customFill = ninjaGrad;

            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        // --- Tesla Coil High-Frequency Chain Discharge ---
        case 'lightning_chain_tesla': {
          if (isWordActive) {
            const zapJitter = (Math.random() - 0.5) * 4;
            offsetY += zapJitter;
            const spring = getSpringOvershootScale(wordProgress, 1.42);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const teslaGrad = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            teslaGrad.addColorStop(0, '#FFFFFF');
            teslaGrad.addColorStop(0.35, '#E879F9');
            teslaGrad.addColorStop(0.7, '#A855F7');
            teslaGrad.addColorStop(1, '#6B21A8');
            customFill = teslaGrad;

            ctx.shadowColor = '#C084FC';
            ctx.shadowBlur = 25 * glowMul;
          }
          break;
        }

        // --- Sakura Samurai Katana Flash ---
        case 'cherry_blossom_samurai_slash': {
          if (isWordActive) {
            ctx.rotate(-0.04);
            const spring = getSpringOvershootScale(wordProgress, 1.36);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const sakuraGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            sakuraGrad.addColorStop(0, '#FFFFFF');
            sakuraGrad.addColorStop(0.4, '#FBCFE8');
            sakuraGrad.addColorStop(0.75, '#F472B6');
            sakuraGrad.addColorStop(1, '#DB2777');
            customFill = sakuraGrad;

            ctx.shadowColor = '#F472B6';
            ctx.shadowBlur = 20 * glowMul;
          }
          break;
        }

        // --- Liquid Mercury Chrome Morph ---
        case 'liquid_mercury_chrome': {
          if (isWordActive) {
            const morphWave = Math.sin(currentTime * 10) * 0.05;
            scaleX *= baseActiveScale * (1.0 + morphWave);
            scaleY *= baseActiveScale * (1.0 - morphWave);

            const chromeGrad = ctx.createLinearGradient(-wordWidth / 2, 0, wordWidth / 2, 0);
            chromeGrad.addColorStop(0, '#FFFFFF');
            chromeGrad.addColorStop(0.25, '#E2E8F0');
            chromeGrad.addColorStop(0.5, '#64748B');
            chromeGrad.addColorStop(0.75, '#E2E8F0');
            chromeGrad.addColorStop(1, '#FFFFFF');
            customFill = chromeGrad;

            ctx.shadowColor = '#E2E8F0';
            ctx.shadowBlur = 20 * glowMul;
          }
          break;
        }

        // --- Astral Zodiac Star Constellation ---
        case 'astral_constellation_zodiac': {
          if (isWordActive) {
            const astralFloat = Math.sin(currentTime * 8) * (fontSizePx * 0.04);
            offsetY -= astralFloat;
            const spring = getSpringOvershootScale(wordProgress, 1.34);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const zodiacGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            zodiacGrad.addColorStop(0, '#FFFFFF');
            zodiacGrad.addColorStop(0.35, '#FDE047');
            zodiacGrad.addColorStop(0.7, '#DDD6FE');
            zodiacGrad.addColorStop(1, '#8B5CF6');
            customFill = zodiacGrad;

            ctx.shadowColor = '#DDD6FE';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        // --- Volcanic Magma Eruption ---
        case 'lava_magma_eruption': {
          if (isWordActive) {
            const heatJitter = (Math.sin(currentTime * 40) * (fontSizePx * 0.03));
            offsetY += heatJitter;
            const spring = getSpringOvershootScale(wordProgress, 1.46);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const magmaFill = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            magmaFill.addColorStop(0, '#FFFFFF');
            magmaFill.addColorStop(0.3, '#FDE047');
            magmaFill.addColorStop(0.65, '#EA580C');
            magmaFill.addColorStop(1, '#7F1D1D');
            customFill = magmaFill;

            ctx.shadowColor = '#FF4500';
            ctx.shadowBlur = 26 * glowMul;
          }
          break;
        }

        // --- Hologram Matrix Teleport ---
        case 'hologram_matrix_teleport': {
          if (isWordActive) {
            const holoFlicker = 1.0 + (Math.sin(currentTime * 35) > 0.6 ? 0.05 : 0);
            const spring = getSpringOvershootScale(wordProgress, 1.4);
            scaleX *= baseActiveScale * spring * holoFlicker;
            scaleY *= baseActiveScale * spring * holoFlicker;

            const holoFill = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            holoFill.addColorStop(0, '#FFFFFF');
            holoFill.addColorStop(0.3, '#E0FDF4');
            holoFill.addColorStop(0.65, '#00FFCC');
            holoFill.addColorStop(1, '#00A8FF');
            customFill = holoFill;

            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        // --- Black Flame Amaterasu Vortex ---
        case 'vortex_black_flame_amaterasu': {
          if (isWordActive) {
            const flamePulse = 1.0 + Math.sin(currentTime * 20) * 0.06;
            const spring = getSpringOvershootScale(wordProgress, 1.44);
            scaleX *= baseActiveScale * spring * flamePulse;
            scaleY *= baseActiveScale * spring * flamePulse;

            const flameFill = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            flameFill.addColorStop(0, '#FFFFFF');
            flameFill.addColorStop(0.25, '#F472B6');
            flameFill.addColorStop(0.6, '#A855F7');
            flameFill.addColorStop(0.9, '#3B0764');
            flameFill.addColorStop(1, '#000000');
            customFill = flameFill;

            ctx.shadowColor = '#C026D3';
            ctx.shadowBlur = 26 * glowMul;
          }
          break;
        }

        // --- Supernova Cosmic Shockwave ---
        case 'supernova_cosmic_shockwave': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.48);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const novaFill = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            novaFill.addColorStop(0, '#FFFFFF');
            novaFill.addColorStop(0.3, '#FEF08A');
            novaFill.addColorStop(0.7, '#F59E0B');
            novaFill.addColorStop(1, '#EF4444');
            customFill = novaFill;

            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 28 * glowMul;
          }
          break;
        }

        // --- Golden Kintsugi Fracture ---
        case 'golden_kintsugi_fracture': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.38);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const goldFill = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            goldFill.addColorStop(0, '#FFFFFF');
            goldFill.addColorStop(0.3, '#FEF9C3');
            goldFill.addColorStop(0.65, '#FBBF24');
            goldFill.addColorStop(1, '#D97706');
            customFill = goldFill;

            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        // --- Hyper Synth Laser Highway ---
        case 'hyper_synth_laser_highway': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.44);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const synthFill = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            synthFill.addColorStop(0, '#FFFFFF');
            synthFill.addColorStop(0.3, '#FF007F');
            synthFill.addColorStop(0.7, '#7928CA');
            synthFill.addColorStop(1, '#00F0FF');
            customFill = synthFill;

            ctx.shadowColor = '#FF007F';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        // --- Cyber Glitch Overload RGB ---
        case 'cyber_glitch_overload_rgb': {
          if (isWordActive) {
            const isJitter = Math.sin(currentTime * 32) > 0.4;
            if (isJitter) {
              offsetX += (Math.random() - 0.5) * 6;
            }
            const spring = getSpringOvershootScale(wordProgress, 1.4);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const glitchFill = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            glitchFill.addColorStop(0, '#FFFFFF');
            glitchFill.addColorStop(0.45, '#00F0FF');
            glitchFill.addColorStop(0.55, '#FF0055');
            glitchFill.addColorStop(1, '#00FF9D');
            customFill = glitchFill;

            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        // --- Emerald Aurora Borealis Flow ---
        case 'emerald_aurora_borealis_flow': {
          if (isWordActive) {
            const waveLift = Math.sin(currentTime * 3) * (fontSizePx * 0.05);
            offsetY -= waveLift;
            const spring = getSpringOvershootScale(wordProgress, 1.36);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const auroraFill = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            auroraFill.addColorStop(0, '#FFFFFF');
            auroraFill.addColorStop(0.35, '#A7F3D0');
            auroraFill.addColorStop(0.7, '#10B981');
            auroraFill.addColorStop(1, '#06B6D4');
            customFill = auroraFill;

            ctx.shadowColor = '#10B981';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        // --- Shonen Energy Spirit Bomb ---
        case 'shonen_energy_spirit_bomb': {
          if (isWordActive) {
            const kiPulse = 1.0 + Math.sin(currentTime * 24) * 0.07;
            const spring = getSpringOvershootScale(wordProgress, 1.46);
            scaleX *= baseActiveScale * spring * kiPulse;
            scaleY *= baseActiveScale * spring * kiPulse;

            const kiFill = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            kiFill.addColorStop(0, '#FFFFFF');
            kiFill.addColorStop(0.35, '#BAE6FD');
            kiFill.addColorStop(0.7, '#38BDF8');
            kiFill.addColorStop(1, '#0284C7');
            customFill = kiFill;

            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 28 * glowMul;
          }
          break;
        }

        // --- Diamond Hyper Disco Prism ---
        case 'diamond_hyper_disco_prism': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.42);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const prismFill = ctx.createLinearGradient(-wordWidth * 0.4, 0, wordWidth * 0.4, 0);
            prismFill.addColorStop(0, '#FF007F');
            prismFill.addColorStop(0.25, '#FFE600');
            prismFill.addColorStop(0.5, '#00FF9D');
            prismFill.addColorStop(0.75, '#00F0FF');
            prismFill.addColorStop(1, '#7928CA');
            customFill = prismFill;

            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        // --- Phoenix Wings Solar Ascension ---
        case 'phoenix_wings_solar_ascension': {
          if (isWordActive) {
            const ascensionLift = Math.sin(Math.min(1.0, wordProgress * 2.0) * Math.PI * 0.5) * (fontSizePx * 0.1);
            offsetY -= ascensionLift;
            const spring = getSpringOvershootScale(wordProgress, 1.45);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const phoenixFill = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            phoenixFill.addColorStop(0, '#FFFFFF');
            phoenixFill.addColorStop(0.3, '#FEF08A');
            phoenixFill.addColorStop(0.65, '#F97316');
            phoenixFill.addColorStop(1, '#DC2626');
            customFill = phoenixFill;

            ctx.shadowColor = '#FF4500';
            ctx.shadowBlur = 28 * glowMul;
          }
          break;
        }

        // --- Casino 777 Jackpot Gold Rush ---
        case 'casino_jackpot_gold_rush': {
          if (isWordActive) {
            const coinBounce = Math.abs(Math.sin(currentTime * 12)) * (fontSizePx * 0.08);
            offsetY -= coinBounce;
            const spring = getSpringOvershootScale(wordProgress, 1.48);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const casinoGold = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            casinoGold.addColorStop(0, '#FFFFFF');
            casinoGold.addColorStop(0.25, '#FEF08A');
            casinoGold.addColorStop(0.65, '#F59E0B');
            casinoGold.addColorStop(1, '#B45309');
            customFill = casinoGold;

            ctx.shadowColor = '#F59E0B';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        // --- Audio Visualizer EQ Bars ---
        case 'audio_visualizer_eq_bars': {
          if (isWordActive) {
            const beatPulse = 1.0 + Math.sin(currentTime * 20) * 0.08;
            scaleX *= baseActiveScale * beatPulse;
            scaleY *= baseActiveScale * beatPulse;

            const eqGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            eqGrad.addColorStop(0, '#FFFFFF');
            eqGrad.addColorStop(0.35, '#34D399');
            eqGrad.addColorStop(0.7, '#06B6D4');
            eqGrad.addColorStop(1, '#6366F1');
            customFill = eqGrad;

            ctx.shadowColor = '#06B6D4';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        // --- Retro 8-Bit Pixel Arcade KO ---
        case 'retro_arcade_8bit_gameover': {
          if (isWordActive) {
            // Chunky stepped pixel jump
            const pixelHop = Math.floor(Math.sin(currentTime * 10) * 4) * 2;
            offsetY += pixelHop;
            const spring = getSpringOvershootScale(wordProgress, 1.35);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const pixelGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            pixelGrad.addColorStop(0, '#FFE600');
            pixelGrad.addColorStop(0.5, '#00FF66');
            pixelGrad.addColorStop(1, '#00F0FF');
            customFill = pixelGrad;

            ctx.shadowColor = '#00FF66';
            ctx.shadowBlur = 18 * glowMul;
          }
          break;
        }

        // --- Toxic Nuclear Biohazard Tape ---
        case 'toxic_nuclear_biohazard_tape': {
          if (isWordActive) {
            const toxicTremor = Math.sin(currentTime * 28) * 1.5;
            offsetX += toxicTremor;
            const spring = getSpringOvershootScale(wordProgress, 1.4);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const toxicGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            toxicGrad.addColorStop(0, '#FFFFFF');
            toxicGrad.addColorStop(0.3, '#86EFAC');
            toxicGrad.addColorStop(0.7, '#22C55E');
            toxicGrad.addColorStop(1, '#14532D');
            customFill = toxicGrad;

            ctx.shadowColor = '#22C55E';
            ctx.shadowBlur = 26 * glowMul;
          }
          break;
        }

        // --- Dimensional Space Rift Tear ---
        case 'dimensional_space_rift_tear': {
          if (isWordActive) {
            const voidPull = Math.sin(currentTime * 16) * 0.05;
            rotation = Math.sin(currentTime * 8) * 0.04;
            const spring = getSpringOvershootScale(wordProgress, 1.45);
            scaleX *= baseActiveScale * spring * (1.0 + voidPull);
            scaleY *= baseActiveScale * spring * (1.0 - voidPull);

            const riftGrad = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            riftGrad.addColorStop(0, '#FFFFFF');
            riftGrad.addColorStop(0.3, '#E879F9');
            riftGrad.addColorStop(0.7, '#A855F7');
            riftGrad.addColorStop(1, '#4C1D95');
            customFill = riftGrad;

            ctx.shadowColor = '#C084FC';
            ctx.shadowBlur = 28 * glowMul;
          }
          break;
        }

        // --- Shonen Manga Screentone Impact ---
        case 'manga_screentone_comic_punch': {
          if (isWordActive) {
            const punchSpring = getSpringOvershootScale(wordProgress, 1.55);
            scaleX *= baseActiveScale * punchSpring;
            scaleY *= baseActiveScale * punchSpring;
            rotation = -0.05 + Math.sin(wordProgress * Math.PI) * 0.08;

            const mangaGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            mangaGrad.addColorStop(0, '#FFFFFF');
            mangaGrad.addColorStop(0.4, '#FCA5A5');
            mangaGrad.addColorStop(1, '#DC2626');
            customFill = mangaGrad;

            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 16;
          }
          break;
        }

        // --- Authentic Matrix Falling Green Code Cascade ---
        case 'matrix_falling_code_cascade': {
          if (isWordActive) {
            const matrixGlitch = (Math.random() > 0.94 ? (Math.random() - 0.5) * 4 : 0);
            offsetX += matrixGlitch;
            const spring = getSpringOvershootScale(wordProgress, 1.36);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const matrixGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            matrixGrad.addColorStop(0, '#FFFFFF');
            matrixGrad.addColorStop(0.35, '#86EFAC');
            matrixGrad.addColorStop(0.8, '#00FF66');
            matrixGrad.addColorStop(1, '#052E16');
            customFill = matrixGrad;

            ctx.shadowColor = '#00FF66';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        // --- Tactical Laser Sniper Target Lock-On ---
        case 'laser_sniper_target_lock': {
          if (isWordActive) {
            const scopeSnap = Math.min(1.0, wordProgress * 1.5);
            const spring = getSpringOvershootScale(scopeSnap, 1.38);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const sniperGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            sniperGrad.addColorStop(0, '#FFFFFF');
            sniperGrad.addColorStop(0.4, '#FCA5A5');
            sniperGrad.addColorStop(1, '#EF4444');
            customFill = sniperGrad;

            ctx.shadowColor = '#EF4444';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        // --- Magical Girl Astral Heart Wand ---
        case 'magical_girl_prism_wand': {
          if (isWordActive) {
            const fairySway = Math.sin(currentTime * 4) * (fontSizePx * 0.06);
            offsetY -= fairySway;
            const spring = getSpringOvershootScale(wordProgress, 1.4);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const wandGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            wandGrad.addColorStop(0, '#FFFFFF');
            wandGrad.addColorStop(0.35, '#FCE7F3');
            wandGrad.addColorStop(0.7, '#F472B6');
            wandGrad.addColorStop(1, '#DB2777');
            customFill = wandGrad;

            ctx.shadowColor = '#F472B6';
            ctx.shadowBlur = 26 * glowMul;
          }
          break;
        }

        // --- Cyberpunk Skull Cyber Reaper Hologram ---
        case 'glitch_skull_cyber_reaper': {
          if (isWordActive) {
            const twitch = Math.sin(currentTime * 32) * (Math.random() > 0.85 ? 3 : 0);
            offsetX += twitch;
            const spring = getSpringOvershootScale(wordProgress, 1.44);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const reaperGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            reaperGrad.addColorStop(0, '#FFFFFF');
            reaperGrad.addColorStop(0.3, '#F87171');
            reaperGrad.addColorStop(0.75, '#DC2626');
            reaperGrad.addColorStop(1, '#18181B');
            customFill = reaperGrad;

            ctx.shadowColor = '#DC2626';
            ctx.shadowBlur = 28 * glowMul;
          }
          break;
        }

        // --- Polaroid Instant Camera ---
        case 'polaroid_instant_camera_flash': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.25);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;
            rotation = -0.02 + Math.sin(currentTime * 2) * 0.01;
            customFill = '#F8FAFC';
            ctx.shadowColor = '#0F172A';
            ctx.shadowBlur = 12;
          }
          break;
        }

        // --- Police Emergency Siren Strobe ---
        case 'police_siren_strobe_cop': {
          if (isWordActive) {
            const flashPhase = Math.floor(currentTime * 16) % 4 < 2;
            const strobeShake = (Math.random() - 0.5) * 2;
            offsetX += strobeShake;
            const spring = getSpringOvershootScale(wordProgress, 1.4);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            customFill = flashPhase ? '#EF4444' : '#3B82F6';
            ctx.shadowColor = flashPhase ? '#EF4444' : '#3B82F6';
            ctx.shadowBlur = 28 * glowMul;
          }
          break;
        }

        // --- Burning Newspaper Headline ---
        case 'burning_newspaper_headline': {
          if (isWordActive) {
            const heatShimmer = Math.sin(currentTime * 18) * 1.5;
            offsetY += heatShimmer;
            const spring = getSpringOvershootScale(wordProgress, 1.35);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const newsGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            newsGrad.addColorStop(0, '#1C1917');
            newsGrad.addColorStop(0.6, '#451A03');
            newsGrad.addColorStop(1, '#EA580C');
            customFill = newsGrad;

            ctx.shadowColor = '#EA580C';
            ctx.shadowBlur = 20 * glowMul;
          }
          break;
        }

        // --- Underwater Aquarium Bubble Reef ---
        case 'underwater_aquarium_bubble_reef': {
          if (isWordActive) {
            const waterFloat = Math.sin(currentTime * 4) * (fontSizePx * 0.08);
            offsetY -= waterFloat;
            const spring = getSpringOvershootScale(wordProgress, 1.32);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const aquaGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            aquaGrad.addColorStop(0, '#FFFFFF');
            aquaGrad.addColorStop(0.4, '#67E8F9');
            aquaGrad.addColorStop(0.85, '#06B6D4');
            aquaGrad.addColorStop(1, '#0284C7');
            customFill = aquaGrad;

            ctx.shadowColor = '#06B6D4';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        // --- Architectural CAD Blueprint Grid ---
        case 'blueprint_architect_cad_grid': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.28);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const bpGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            bpGrad.addColorStop(0, '#FFFFFF');
            bpGrad.addColorStop(0.5, '#BAE6FD');
            bpGrad.addColorStop(1, '#60A5FA');
            customFill = bpGrad;

            ctx.shadowColor = '#60A5FA';
            ctx.shadowBlur = 16;
          }
          break;
        }

        // --- Realistic Neon Glass Gas Tube Sign ---
        case 'neon_gas_tube_flicker': {
          if (isWordActive) {
            const tubeFlicker = Math.random() > 0.96 ? 0.4 : 1.0;
            const spring = getSpringOvershootScale(wordProgress, 1.36);
            scaleX *= baseActiveScale * spring * (0.98 + tubeFlicker * 0.02);
            scaleY *= baseActiveScale * spring * (0.98 + tubeFlicker * 0.02);

            const neonPinkGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            neonPinkGrad.addColorStop(0, '#FFFFFF');
            neonPinkGrad.addColorStop(0.3, '#FBCFE8');
            neonPinkGrad.addColorStop(0.8, '#F43F5E');
            neonPinkGrad.addColorStop(1, '#BE185D');
            customFill = neonPinkGrad;

            ctx.shadowColor = '#F43F5E';
            ctx.shadowBlur = 28 * glowMul * tubeFlicker;
          }
          break;
        }

        // --- Wild West Wanted Poster ---
        case 'western_wanted_poster_wood': {
          if (isWordActive) {
            const recoilKick = Math.sin(wordProgress * Math.PI) * 4;
            offsetY -= recoilKick;
            const spring = getSpringOvershootScale(wordProgress, 1.38);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const woodGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            woodGrad.addColorStop(0, '#292524');
            woodGrad.addColorStop(0.5, '#451A03');
            woodGrad.addColorStop(1, '#78350F');
            customFill = woodGrad;

            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 10;
          }
          break;
        }

        // --- Submarine Sonar Radar Green Ping ---
        case 'radar_sonar_submarine_ping': {
          if (isWordActive) {
            const sonarPulse = 1.0 + Math.sin(currentTime * 12) * 0.06;
            scaleX *= baseActiveScale * sonarPulse;
            scaleY *= baseActiveScale * sonarPulse;

            const sonarGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            sonarGrad.addColorStop(0, '#FFFFFF');
            sonarGrad.addColorStop(0.35, '#86EFAC');
            sonarGrad.addColorStop(0.8, '#10B981');
            sonarGrad.addColorStop(1, '#064E3B');
            customFill = sonarGrad;

            ctx.shadowColor = '#10B981';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        // --- Street Graffiti Spraycan Drip ---
        case 'graffiti_spraycan_drip_splat': {
          if (isWordActive) {
            rotation = 0.04 - (wordProgress * 0.08);
            const spring = getSpringOvershootScale(wordProgress, 1.48);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const sprayGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            sprayGrad.addColorStop(0, '#FFFFFF');
            sprayGrad.addColorStop(0.3, '#FEF08A');
            sprayGrad.addColorStop(0.7, '#FACC15');
            sprayGrad.addColorStop(1, '#CA8A04');
            customFill = sprayGrad;

            ctx.shadowColor = '#EAB308';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        // --- Mystic Alchemy Tarot Sigil ---
        case 'magic_alchemy_tarot_sigil': {
          if (isWordActive) {
            const mysticHover = Math.sin(currentTime * 5) * (fontSizePx * 0.07);
            offsetY -= mysticHover;
            const spring = getSpringOvershootScale(wordProgress, 1.42);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const sigilGrad = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            sigilGrad.addColorStop(0, '#FFFFFF');
            sigilGrad.addColorStop(0.35, '#FEF08A');
            sigilGrad.addColorStop(0.7, '#F59E0B');
            sigilGrad.addColorStop(1, '#92400E');
            customFill = sigilGrad;

            ctx.shadowColor = '#FBBF24';
            ctx.shadowBlur = 26 * glowMul;
          }
          break;
        }

        // --- Cosmic Black Hole Singularity ---
        case 'black_hole_singularity': {
          if (isWordActive) {
            const gravPulse = 1.0 + Math.sin(currentTime * 24) * 0.08;
            scaleX *= baseActiveScale * gravPulse * 1.06;
            scaleY *= baseActiveScale * (2.0 - gravPulse); // Spacetime gravitational tidal stretch

            const bhGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            bhGrad.addColorStop(0, '#FFFFFF');
            bhGrad.addColorStop(0.35, '#FFE600');
            bhGrad.addColorStop(0.7, '#FF007F');
            bhGrad.addColorStop(1, '#8A2BE2');
            customFill = bhGrad;

            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        // --- Divine Volumetric God Rays ---
        case 'god_rays_divine': {
          if (isWordActive) {
            const holyLift = Math.sin(Math.min(1.0, wordProgress * 2.2) * Math.PI * 0.5) * (fontSizePx * 0.08);
            offsetY -= holyLift;
            const spring = getSpringOvershootScale(wordProgress, 1.32);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const godGrad = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            godGrad.addColorStop(0, '#FFFFFF');
            godGrad.addColorStop(0.4, '#FFF8DC');
            godGrad.addColorStop(0.8, '#FFD700');
            godGrad.addColorStop(1, '#DAA520');
            customFill = godGrad;

            ctx.shadowColor = '#FFE600';
            ctx.shadowBlur = 25 * glowMul;
          }
          break;
        }

        // --- Cyberpunk Mecha Targeting HUD ---
        case 'cyberpunk_hud_matrix': {
          if (isWordActive) {
            const snapSpring = getSpringOvershootScale(wordProgress, 1.45);
            scaleX *= baseActiveScale * snapSpring;
            scaleY *= baseActiveScale * snapSpring;

            wordColor = '#00F0FF';
            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 20 * glowMul;
          }
          break;
        }

        // --- Sub-Zero Glacial Cryo Freeze ---
        case 'ice_blizzard_frost': {
          if (isWordActive) {
            const iceSlam = getSpringOvershootScale(wordProgress, 1.42);
            scaleX *= baseActiveScale * iceSlam;
            scaleY *= baseActiveScale * iceSlam;

            const iceGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            iceGrad.addColorStop(0, '#FFFFFF');
            iceGrad.addColorStop(0.4, '#B3F0FF');
            iceGrad.addColorStop(0.75, '#38BDF8');
            iceGrad.addColorStop(1, '#0284C7');
            customFill = iceGrad;

            ctx.shadowColor = '#38BDF8';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        // --- Toxic Acid Neon Splatter ---
        case 'neon_graffiti_drip': {
          if (isWordActive) {
            const dripSlam = getSpringOvershootScale(wordProgress, 1.48);
            scaleX *= baseActiveScale * dripSlam;
            scaleY *= baseActiveScale * dripSlam;

            const toxGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            toxGrad.addColorStop(0, '#FFFFFF');
            toxGrad.addColorStop(0.4, '#39FF14');
            toxGrad.addColorStop(1, '#00CC00');
            customFill = toxGrad;

            ctx.shadowColor = '#39FF14';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        // --- Dragon Breath Inferno ---
        case 'dragon_breath_inferno': {
          if (isWordActive) {
            const heatVibe = Math.sin(currentTime * 30) * (fontSizePx * 0.035);
            offsetY += heatVibe;
            const firePulse = 1.0 + Math.sin(currentTime * 18) * 0.08;
            scaleX *= baseActiveScale * firePulse;
            scaleY *= baseActiveScale * firePulse;

            const fireGrad = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            fireGrad.addColorStop(0, '#FFFFFF');
            fireGrad.addColorStop(0.3, '#FFE600');
            fireGrad.addColorStop(0.7, '#FF4500');
            fireGrad.addColorStop(1, '#990000');
            customFill = fireGrad;

            ctx.shadowColor = '#FF3300';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        // --- 24K Royal Gold Specular Sheen ---
        case 'golden_trophy_shimmer': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.35);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const goldGrad = ctx.createLinearGradient(-wordWidth / 2, 0, wordWidth / 2, 0);
            goldGrad.addColorStop(0, '#FFE600');
            goldGrad.addColorStop(0.3, '#FFFDF0');
            goldGrad.addColorStop(0.6, '#FFD700');
            goldGrad.addColorStop(1, '#FFA500');
            customFill = goldGrad;

            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        // --- Speed Demon Nitro Drift ---
        case 'speed_demon_drift': {
          if (isWordActive) {
            const driftAngle = -0.06; // Aggressive racing drift tilt
            ctx.rotate(driftAngle);
            const spring = getSpringOvershootScale(wordProgress, 1.38);
            scaleX *= baseActiveScale * spring * 1.08;
            scaleY *= baseActiveScale * spring;

            // Nitro speed blur jitter
            if (wordProgress < 0.4) {
              offsetX += (Math.random() - 0.5) * 6;
            }

            const turboGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            turboGrad.addColorStop(0, '#FFFFFF');
            turboGrad.addColorStop(0.4, '#FFE600');
            turboGrad.addColorStop(1, '#FF4500');
            customFill = turboGrad;

            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 20 * glowMul;
          }
          break;
        }

        // --- 3D Pop-Comic Action Starburst ---
        case 'comic_action_blast_bubble': {
          if (isWordActive) {
            const blastSpring = getSpringOvershootScale(wordProgress, 1.55);
            scaleX *= baseActiveScale * blastSpring;
            scaleY *= baseActiveScale * blastSpring;

            wordColor = '#000000';
            ctx.shadowColor = 'rgba(0,0,0,0.85)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 4;
          }
          break;
        }

        // --- Quantum Entanglement Orbital Strings ---
        case 'quantum_entanglement_strings': {
          if (isWordActive) {
            const qPulse = 1.0 + Math.sin(currentTime * 16) * 0.07;
            scaleX *= baseActiveScale * qPulse;
            scaleY *= baseActiveScale * qPulse;

            const qGrad = ctx.createLinearGradient(-wordWidth / 2, 0, wordWidth / 2, 0);
            qGrad.addColorStop(0, '#00F0FF');
            qGrad.addColorStop(0.5, '#FFFFFF');
            qGrad.addColorStop(1, '#FF007F');
            customFill = qGrad;

            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        // --- Thunder God Lightning ---
        case 'thunder_god_lightning': {
          if (isWordActive) {
            const boltSlam = getSpringOvershootScale(wordProgress, 1.5);
            scaleX *= baseActiveScale * boltSlam;
            scaleY *= baseActiveScale * boltSlam;

            // Electric discharge jitter
            if (wordProgress < 0.4) {
              offsetX += (Math.random() - 0.5) * (fontSizePx * 0.12);
              offsetY += (Math.random() - 0.5) * (fontSizePx * 0.12);
            }

            const boltCol = word.colorOverride || style.activeWordColor || '#38BDF8';
            ctx.shadowColor = boltCol;
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        // --- Grand Fireworks Finale ---
        case 'firework_grand_finale': {
          if (isWordActive) {
            const blastSpring = getSpringOvershootScale(wordProgress, 1.48);
            scaleX *= baseActiveScale * blastSpring;
            scaleY *= baseActiveScale * blastSpring;

            // Shimmering multi-color text gradient
            const fwColors = ['#FF0055', '#FFE600', '#00F0FF', '#39FF14', '#C084FC'];
            const grad = ctx.createLinearGradient(-wordWidth / 2, 0, wordWidth / 2, 0);
            grad.addColorStop(0, fwColors[0]);
            grad.addColorStop(0.35, fwColors[1]);
            grad.addColorStop(0.7, fwColors[2]);
            grad.addColorStop(1, fwColors[4]);
            customFill = grad;

            ctx.shadowColor = '#FFE600';
            ctx.shadowBlur = 18 * glowMul;
          }
          break;
        }

        // --- Anime Super Saiyan Aura ---
        case 'super_saiyan_aura': {
          if (isWordActive) {
            const kiVibe = Math.sin(currentTime * 35) * (fontSizePx * 0.04);
            offsetY += kiVibe;
            const kiPulse = 1.0 + Math.sin(currentTime * 20) * 0.08;
            scaleX *= baseActiveScale * kiPulse;
            scaleY *= baseActiveScale * kiPulse;

            // Golden Ki flame gradient
            const kiGrad = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            kiGrad.addColorStop(0, '#FFFFFF'); // white hot core
            kiGrad.addColorStop(0.35, '#FFF500'); // blazing gold
            kiGrad.addColorStop(0.8, '#FF6B00'); // ki orange
            kiGrad.addColorStop(1, '#FF003C'); // red outline
            customFill = kiGrad;

            ctx.shadowColor = '#FFE600';
            ctx.shadowBlur = 25 * glowMul;
          }
          break;
        }

        // --- Retro 80s VHS Glitch ---
        case 'glitch_vhs_tape': {
          if (isWordActive) {
            scaleX *= baseActiveScale;
            scaleY *= baseActiveScale;

            // Horizontal scanline glitch jump
            if (Math.sin(currentTime * 25) > 0.6) {
              offsetX += (Math.sin(currentTime * 60) > 0 ? 5 : -5);
            }

            const vhsGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            vhsGrad.addColorStop(0, '#00F0FF');
            vhsGrad.addColorStop(0.5, '#FFFFFF');
            vhsGrad.addColorStop(1, '#FF0055');
            customFill = vhsGrad;

            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 16 * glowMul;
          }
          break;
        }

        // --- Solar Eclipse Corona Flare ---
        case 'solar_flare_corona': {
          if (isWordActive) {
            const flarePulse = 1.0 + Math.sin(currentTime * 16) * 0.09;
            scaleX *= baseActiveScale * flarePulse;
            scaleY *= baseActiveScale * flarePulse;

            const sunGrad = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            sunGrad.addColorStop(0, '#FFFBEB');
            sunGrad.addColorStop(0.4, '#FDE047');
            sunGrad.addColorStop(0.8, '#EA580C');
            sunGrad.addColorStop(1, '#991B1B');
            customFill = sunGrad;

            ctx.shadowColor = '#FF4500';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        // --- 3D Synthwave Horizon Grid ---
        case 'synthwave_retro_grid': {
          if (isWordActive) {
            scaleX *= baseActiveScale * 1.08;
            scaleY *= baseActiveScale * 1.08;

            const synthGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            synthGrad.addColorStop(0, '#FFE600');
            synthGrad.addColorStop(0.45, '#FF007F');
            synthGrad.addColorStop(1, '#7928CA');
            customFill = synthGrad;

            ctx.shadowColor = '#FF007F';
            ctx.shadowBlur = 20 * glowMul;
          }
          break;
        }

        // --- Flaming Phoenix Wings ---
        case 'golden_fire_phoenix': {
          if (isWordActive) {
            const wingPulse = 1.0 + Math.sin(currentTime * 12) * 0.07;
            scaleX *= baseActiveScale * wingPulse;
            scaleY *= baseActiveScale * wingPulse;

            const phGrad = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            phGrad.addColorStop(0, '#FFE600');
            phGrad.addColorStop(0.5, '#FF4500');
            phGrad.addColorStop(1, '#990000');
            customFill = phGrad;

            ctx.shadowColor = '#FF4500';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        // --- Prismatic Rainbow Caustics ---
        case 'crystal_prismatic_rainbow': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.3);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const caustGrad = ctx.createLinearGradient(-wordWidth / 2, 0, wordWidth / 2, 0);
            caustGrad.addColorStop(0, '#FF0055');
            caustGrad.addColorStop(0.25, '#FFE600');
            caustGrad.addColorStop(0.5, '#00F0FF');
            caustGrad.addColorStop(0.75, '#39FF14');
            caustGrad.addColorStop(1, '#C084FC');
            customFill = caustGrad;

            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 20 * glowMul;
          }
          break;
        }

        // --- Shonen Anime Manga Impact Speed Lines ---
        case 'kinetic_speed_lines_impact': {
          if (isWordActive) {
            const slamSpring = getSpringOvershootScale(wordProgress, 1.6);
            scaleX *= baseActiveScale * slamSpring;
            scaleY *= baseActiveScale * slamSpring;

            // Intense manga action shake
            if (wordProgress < 0.3) {
              offsetX += (Math.random() - 0.5) * (fontSizePx * 0.16);
              offsetY += (Math.random() - 0.5) * (fontSizePx * 0.16);
            }

            wordColor = '#FFFFFF';
            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 12;
          }
          break;
        }

        // --- Mystic Doctor Strange Runic Mandala ---
        case 'magic_runic_circle': {
          if (isWordActive) {
            const runeSpring = getSpringOvershootScale(wordProgress, 1.38);
            scaleX *= baseActiveScale * runeSpring;
            scaleY *= baseActiveScale * runeSpring;

            const runeGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            runeGrad.addColorStop(0, '#FFFFFF');
            runeGrad.addColorStop(0.4, '#FFE600');
            runeGrad.addColorStop(1, '#FF6600');
            customFill = runeGrad;

            ctx.shadowColor = '#FF6600';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        case 'explosive_burst': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.55);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;
            ctx.shadowColor = word.colorOverride || style.activeWordColor || '#FFD700';
            ctx.shadowBlur = Math.max(12, fontSizePx * 0.4 * (1.0 - Math.min(1.0, wordProgress * 1.5) * 0.5));
          }
          break;
        }

        // --- 2. Marker & Journalistic Highlights ---
        case 'marker_highlight': {
          if (isWordActive) {
            const subtleLift = 1.0 + Math.sin(Math.min(1.0, wordProgress * 2.5) * Math.PI * 0.5) * 0.08;
            scaleX *= subtleLift;
            scaleY *= subtleLift;
            wordColor = '#FFFFFF';
            ctx.shadowColor = 'rgba(0,0,0,0.95)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 2;
          }
          break;
        }

        // --- 3. Luxury Specular Glint Shimmer ---
        case 'luxury_shimmer': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.22);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const sweepPos = -wordWidth * 1.2 + wordProgress * (wordWidth * 2.4);
            const baseCol = word.colorOverride || style.activeWordColor || '#FFD700';
            const grad = ctx.createLinearGradient(sweepPos - 25, -fontSizePx * 0.5, sweepPos + 25, fontSizePx * 0.5);
            grad.addColorStop(0, baseCol);
            grad.addColorStop(0.38, baseCol);
            grad.addColorStop(0.5, '#FFFFFF'); // high-specular glint
            grad.addColorStop(0.62, baseCol);
            grad.addColorStop(1, baseCol);
            customFill = grad;

            ctx.shadowColor = baseCol;
            ctx.shadowBlur = 18;
          }
          break;
        }

        // --- 4. Volcano Fire Blaze & Heat Shimmer ---
        case 'fire_blaze': {
          if (isWordActive) {
            const flamePulse = 1.0 + Math.sin(currentTime * 18) * 0.08;
            scaleX *= baseActiveScale * flamePulse;
            scaleY *= baseActiveScale * flamePulse;
            offsetY = Math.sin(currentTime * 24 + wordIdx) * (fontSizePx * 0.05);

            // Vertical flame gradient: bright yellow top -> orange mid -> crimson red bottom
            const flameGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            flameGrad.addColorStop(0, '#FFF500'); // blazing top
            flameGrad.addColorStop(0.45, '#FF6B00'); // fiery orange
            flameGrad.addColorStop(1, '#FF003C'); // deep red bottom
            customFill = flameGrad;

            ctx.shadowColor = '#FF4500';
            ctx.shadowBlur = 22;
          }
          break;
        }

        // --- 5. Cyber Matrix Hologram & Scanline ---
        case 'hologram_scan': {
          if (isWordFuture) {
            opacity = 0.25;
          } else if (isWordActive) {
            scaleX *= baseActiveScale;
            scaleY *= baseActiveScale;

            const holoCol = word.colorOverride || style.activeWordColor || '#00F0FF';
            const scanGrad = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            const scanPos = ((currentTime * 3.5) % 1.0);
            scanGrad.addColorStop(0, holoCol);
            scanGrad.addColorStop(Math.max(0, scanPos - 0.08), holoCol);
            scanGrad.addColorStop(scanPos, '#FFFFFF');
            scanGrad.addColorStop(Math.min(1, scanPos + 0.08), holoCol);
            scanGrad.addColorStop(1, holoCol);
            customFill = scanGrad;

            ctx.shadowColor = holoCol;
            ctx.shadowBlur = 20;
          }
          break;
        }

        // --- 6. Stomp Impact & Ground Tremor ---
        case 'stomp_impact': {
          if (isWordFuture) {
            opacity = 0;
            offsetY = -fontSizePx * 1.5;
          } else if (isWordActive) {
            if (wordProgress < 0.22) {
              const slamProgress = wordProgress / 0.22;
              offsetY = -fontSizePx * 1.5 * (1.0 - slamProgress * slamProgress);
              scaleX *= 0.85;
              scaleY *= 1.35;
              opacity = slamProgress;
            } else {
              const shakeProgress = (wordProgress - 0.22) / 0.78;
              const shakeDecay = Math.max(0, 1.0 - shakeProgress * 3.0);
              offsetX = Math.sin(currentTime * 80) * 4.5 * shakeDecay;
              offsetY = Math.cos(currentTime * 70) * 3.0 * shakeDecay;
              scaleX *= baseActiveScale * (1.0 + shakeDecay * 0.25);
              scaleY *= baseActiveScale * (1.0 - shakeDecay * 0.15);
            }
          }
          break;
        }

        // --- 7. Squishy Jelly Wiggle ---
        case 'jelly_wiggle': {
          if (isWordActive) {
            const decay = Math.exp(-wordProgress * 3.6);
            const wiggle = Math.sin(wordProgress * Math.PI * 4.5) * decay;
            scaleX *= baseActiveScale * (1.0 + wiggle * 0.35);
            scaleY *= baseActiveScale * (1.0 - wiggle * 0.3);
            rotation = Math.sin(wordProgress * Math.PI * 3.0) * 0.14 * decay;
          }
          break;
        }

        // --- 8. Starburst Twinkle & Sparkle ---
        case 'starburst_glow': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.32);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;
            ctx.shadowColor = word.colorOverride || style.activeWordColor || '#FFE600';
            ctx.shadowBlur = 18;
          }
          break;
        }

        // --- 9. Gravity Drop Cascade ---
        case 'drop_cascade': {
          if (isWordFuture) {
            opacity = 0;
            offsetY = -fontSizePx * 1.2;
          } else if (isWordActive) {
            const ease = Math.min(1.0, wordProgress * 2.8);
            if (ease < 0.7) {
              const t = ease / 0.7;
              offsetY = -fontSizePx * 1.2 * (1.0 - t * t);
              scaleY *= 1.25;
              scaleX *= 0.9;
              opacity = Math.min(1.0, t * 1.5);
            } else {
              const bounceT = (ease - 0.7) / 0.3;
              offsetY = -Math.sin(bounceT * Math.PI) * (fontSizePx * 0.2);
              scaleX *= baseActiveScale;
              scaleY *= baseActiveScale;
            }
          }
          break;
        }

        // --- 10. Flickering Neon Gas Tube ---
        case 'flicker_neon': {
          if (isWordActive) {
            const isFlickering = wordProgress < 0.28;
            if (isFlickering) {
              const strobe = Math.sin(currentTime * 45) > 0.15;
              opacity = strobe ? 1.0 : 0.25;
              scaleX *= baseActiveScale * (strobe ? 1.1 : 0.95);
              scaleY *= baseActiveScale * (strobe ? 1.1 : 0.95);
            } else {
              scaleX *= baseActiveScale;
              scaleY *= baseActiveScale;
            }
            const glowCol = word.colorOverride || style.activeWordColor || '#00F0FF';
            ctx.shadowColor = glowCol;
            ctx.shadowBlur = 24;
          }
          break;
        }

        // --- 11. Comic Book POW Burst ---
        case 'comic_burst': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.35);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;
            wordColor = '#000000';
          }
          break;
        }

        // --- 12. Aurora Borealis Cosmic Flow ---
        case 'aurora_flow': {
          if (isWordActive) {
            scaleX *= baseActiveScale;
            scaleY *= baseActiveScale;

            const auroraOffset = (currentTime * 1.8) % 1.0;
            const grad = ctx.createLinearGradient(-wordWidth / 2, 0, wordWidth / 2, 0);
            grad.addColorStop(0, '#00F0FF'); // cyan
            grad.addColorStop(0.33, '#A855F7'); // purple
            grad.addColorStop(0.66, '#10B981'); // emerald
            grad.addColorStop(1, '#F59E0B'); // amber
            customFill = grad;

            ctx.shadowColor = '#A855F7';
            ctx.shadowBlur = 18;
          }
          break;
        }

        // --- 13. Artistic Brush Underline ---
        case 'brush_underline': {
          if (isWordActive) {
            scaleX *= 1.08;
            scaleY *= 1.08;
          }
          break;
        }

        // --- 14. 3D Kinetic Tilt Punch ---
        case '3d_tilt_punch': {
          if (isWordFuture) {
            opacity = 0.15;
            rotation = -0.15;
          } else if (isWordActive) {
            const tiltEase = Math.min(1.0, wordProgress * 3.0);
            rotation = -0.15 * (1.0 - tiltEase);
            offsetY = -fontSizePx * 0.25 * (1.0 - tiltEase);
            scaleX *= baseActiveScale * (0.8 + 0.2 * tiltEase);
            scaleY *= baseActiveScale * (0.8 + 0.2 * tiltEase);
            opacity = Math.min(1.0, 0.4 + tiltEase * 0.6);
          }
          break;
        }

        // --- 15. Cinematic Smooth Rise ---
        case 'cinematic_rise': {
          if (isWordFuture) {
            opacity = 0.2;
            offsetY = fontSizePx * 0.45;
          } else if (isWordActive) {
            const riseEase = 1.0 - Math.pow(1.0 - Math.min(1.0, wordProgress * 2.2), 3);
            offsetY = (1.0 - riseEase) * (fontSizePx * 0.45);
            opacity = Math.min(1.0, 0.3 + riseEase * 0.7);
            scaleX *= (1.0 + (1.0 - riseEase) * 0.12);
            scaleY *= (1.0 + (1.0 - riseEase) * 0.12);
          }
          break;
        }

        // --- 16. Letter Tracking Expansion ---
        case 'letter_expand': {
          if (isWordActive) {
            const expandSpring = getSpringOvershootScale(wordProgress, 1.45);
            scaleX *= baseActiveScale * (1.0 + (expandSpring - 1.0) * 0.85);
            scaleY *= baseActiveScale;
          }
          break;
        }

        // --- 17. Retro 8-Bit Pixel Hop ---
        case 'arcade_pixel': {
          if (isWordActive) {
            const jumpFrames = [0, -fontSizePx * 0.25, -fontSizePx * 0.45, -fontSizePx * 0.25, 0];
            const frameIdx = Math.min(jumpFrames.length - 1, Math.floor(wordProgress * jumpFrames.length));
            offsetY = jumpFrames[frameIdx];

            const colors = ['#FFE600', '#00F0FF', '#FF007F', '#00FF66'];
            const colIdx = Math.floor((currentTime * 12) % colors.length);
            wordColor = colors[colIdx];
            scaleX *= 1.15;
            scaleY *= 1.15;
          }
          break;
        }

        // --- Standard & Legacy Enhancements ---
        case 'bounce': {
          if (isWordActive) {
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
            const pulse = 1.0 + Math.sin(wordProgress * Math.PI) * 0.28;
            scaleX *= (baseActiveScale * pulse);
            scaleY *= (baseActiveScale * pulse);
          }
          break;
        }

        case 'rubber_band': {
          if (isWordActive) {
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
            const spring = getSpringOvershootScale(wordProgress, 1.25);
            scaleX *= (baseActiveScale * 0.95) * spring;
            scaleY *= (baseActiveScale * 0.95) * spring;

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

        // --- Extra Viral & Kinetic Styles ---
        case 'electric_plasma': {
          if (isWordActive) {
            const jitterX = (Math.sin(currentTime * 65 + wordIdx) > 0.3 ? 1 : -1) * 1.5;
            const jitterY = (Math.cos(currentTime * 55 + wordIdx) > 0.3 ? 1 : -1) * 1.5;
            offsetX += jitterX;
            offsetY += jitterY;

            const spring = getSpringOvershootScale(wordProgress, 1.35);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const plasmaGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            plasmaGrad.addColorStop(0, '#FFFFFF'); // electric white core
            plasmaGrad.addColorStop(0.35, '#00F0FF'); // cyan
            plasmaGrad.addColorStop(1, '#0077FF'); // deep electric blue
            customFill = plasmaGrad;

            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        case 'confetti_party': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.48);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;
            wordColor = word.colorOverride || style.activeWordColor || '#F59E0B';
            ctx.shadowColor = 'rgba(245, 158, 11, 0.6)';
            ctx.shadowBlur = 16 * glowMul;
          }
          break;
        }

        case 'laser_beam': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.3);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const laserGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            laserGrad.addColorStop(0, '#FFFFFF');
            laserGrad.addColorStop(0.4, '#FF2E63');
            laserGrad.addColorStop(1, '#990000');
            customFill = laserGrad;

            ctx.shadowColor = '#FF2E63';
            ctx.shadowBlur = 25 * glowMul;
          }
          break;
        }

        case 'golden_cash': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.32);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const goldGrad = ctx.createLinearGradient(-wordWidth * 0.5, -fontSizePx * 0.5, wordWidth * 0.5, fontSizePx * 0.5);
            goldGrad.addColorStop(0, '#FFD700');
            goldGrad.addColorStop(0.3, '#FFF3A8');
            goldGrad.addColorStop(0.5, '#FFFFFF');
            goldGrad.addColorStop(0.7, '#FFD700');
            goldGrad.addColorStop(1, '#D4AF37');
            customFill = goldGrad;

            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        case 'liquid_lava': {
          if (isWordActive) {
            const waveY = Math.sin(currentTime * 12 + wordIdx) * (fontSizePx * 0.08);
            offsetY += waveY;
            scaleX *= baseActiveScale * (1.0 + Math.sin(currentTime * 10) * 0.05);
            scaleY *= baseActiveScale * (1.0 - Math.sin(currentTime * 10) * 0.05);

            const lavaGrad = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            lavaGrad.addColorStop(0, '#FFE600');
            lavaGrad.addColorStop(0.5, '#FF5500');
            lavaGrad.addColorStop(1, '#FF0055');
            customFill = lavaGrad;

            ctx.shadowColor = '#FF5500';
            ctx.shadowBlur = 20 * glowMul;
          }
          break;
        }

        case 'kaleidoscope_vortex': {
          if (isWordActive) {
            const pulse = 1.0 + Math.sin(currentTime * 14) * 0.12;
            scaleX *= baseActiveScale * pulse;
            scaleY *= baseActiveScale * pulse;
            rotation = Math.sin(currentTime * 8) * 0.04;

            const vortGrad = ctx.createLinearGradient(-wordWidth * 0.5, 0, wordWidth * 0.5, 0);
            vortGrad.addColorStop(0, '#EC4899');
            vortGrad.addColorStop(0.5, '#8B5CF6');
            vortGrad.addColorStop(1, '#3B82F6');
            customFill = vortGrad;

            ctx.shadowColor = '#8B5CF6';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        case 'rgb_split_glitch': {
          if (isWordActive) {
            const isGlitching = Math.sin(currentTime * 40) > 0.2;
            if (isGlitching) {
              offsetX += (Math.random() - 0.5) * 8;
              offsetY += (Math.random() - 0.5) * 4;
              scaleX *= baseActiveScale * (0.95 + Math.random() * 0.2);
              scaleY *= baseActiveScale;
            } else {
              scaleX *= baseActiveScale;
              scaleY *= baseActiveScale;
            }
            wordColor = '#FFFFFF';
          }
          break;
        }

        case 'speed_blur_streak': {
          if (isWordFuture) {
            opacity = 0;
            offsetX = -wordWidth * 1.5;
          } else if (isWordActive) {
            const ease = 1.0 - Math.pow(1.0 - Math.min(1.0, wordProgress * 2.5), 3);
            offsetX = -wordWidth * 1.5 * (1.0 - ease);
            scaleX *= baseActiveScale * (1.0 + (1.0 - ease) * 0.4);
            scaleY *= baseActiveScale;
            opacity = Math.min(1.0, 0.4 + ease * 0.6);
            ctx.shadowColor = word.colorOverride || style.activeWordColor || '#38BDF8';
            ctx.shadowBlur = 16 * glowMul;
          }
          break;
        }

        case 'heart_explosion': {
          if (isWordActive) {
            const beat = Math.sin(wordProgress * Math.PI * 3.0);
            scaleX *= baseActiveScale * (1.0 + Math.max(0, beat) * 0.22);
            scaleY *= baseActiveScale * (1.0 + Math.max(0, beat) * 0.22);
            wordColor = word.colorOverride || style.activeWordColor || '#F43F5E';
            ctx.shadowColor = '#F43F5E';
            ctx.shadowBlur = 18 * glowMul;
          }
          break;
        }

        case 'frost_freeze': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.25);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const frostGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            frostGrad.addColorStop(0, '#FFFFFF');
            frostGrad.addColorStop(0.3, '#E0F7FA');
            frostGrad.addColorStop(0.7, '#00E5FF');
            frostGrad.addColorStop(1, '#0288D1');
            customFill = frostGrad;

            ctx.shadowColor = '#00E5FF';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        case 'target_hud': {
          if (isWordActive) {
            const lockEase = Math.min(1.0, wordProgress * 3.0);
            scaleX *= baseActiveScale * (0.85 + 0.15 * lockEase);
            scaleY *= baseActiveScale * (0.85 + 0.15 * lockEase);
            wordColor = word.colorOverride || style.activeWordColor || '#00FF66';
            ctx.shadowColor = '#00FF66';
            ctx.shadowBlur = 16 * glowMul;
          }
          break;
        }

        case 'washi_tape': {
          if (isWordActive) {
            scaleX *= 1.05;
            scaleY *= 1.05;
            wordColor = '#0F172A'; // crisp dark ink on tape
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
          }
          break;
        }

        case 'fire_embers': {
          if (isWordActive) {
            const flamePulse = 1.0 + Math.sin(currentTime * 20) * 0.08;
            scaleX *= baseActiveScale * flamePulse;
            scaleY *= baseActiveScale * flamePulse;
            offsetY = Math.sin(currentTime * 25) * (fontSizePx * 0.04);

            const emberGrad = ctx.createLinearGradient(0, -fontSizePx * 0.6, 0, fontSizePx * 0.6);
            emberGrad.addColorStop(0, '#FFF500');
            emberGrad.addColorStop(0.45, '#FF6A00');
            emberGrad.addColorStop(1, '#E11D48');
            customFill = emberGrad;

            ctx.shadowColor = '#FF6A00';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        case 'crown_halo': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.25);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const crownGrad = ctx.createLinearGradient(-wordWidth * 0.5, 0, wordWidth * 0.5, 0);
            crownGrad.addColorStop(0, '#F59E0B');
            crownGrad.addColorStop(0.5, '#FDE68A');
            crownGrad.addColorStop(1, '#D97706');
            customFill = crownGrad;

            ctx.shadowColor = '#F59E0B';
            ctx.shadowBlur = 20 * glowMul;
          }
          break;
        }

        case 'supernova_implode': {
          if (isWordActive) {
            if (wordProgress < 0.2) {
              // Rapid micro implosion suction
              const impProg = wordProgress / 0.2;
              const impScale = 1.0 - (0.35 * Math.sin(impProg * Math.PI * 0.5));
              scaleX *= impScale;
              scaleY *= impScale;
              opacity = 0.7 + 0.3 * (1.0 - impProg);
            } else {
              // Immense BANG explosion overshoot
              const expProg = (wordProgress - 0.2) / 0.8;
              const spring = getSpringOvershootScale(expProg, 1.6);
              scaleX *= baseActiveScale * spring;
              scaleY *= baseActiveScale * spring;
              ctx.shadowColor = '#FFF500';
              ctx.shadowBlur = 28 * glowMul;
            }
          }
          break;
        }

        case 'glassmorphism_3d': {
          if (isWordActive) {
            scaleX *= 1.08;
            scaleY *= 1.08;
            wordColor = '#FFFFFF';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 3;
          }
          break;
        }

        case 'meteor_impact': {
          if (isWordActive) {
            if (wordProgress < 0.25) {
              // Sky descent velocity slam
              const dropProg = wordProgress / 0.25;
              offsetY = -fontSizePx * 1.2 * (1.0 - dropProg);
              scaleX *= (0.7 + 0.3 * dropProg);
              scaleY *= (1.4 - 0.4 * dropProg);
            } else {
              // Seismic crater impact squash & tremor rebound
              const impProg = (wordProgress - 0.25) / 0.75;
              const spring = getSpringOvershootScale(impProg, 1.45);
              scaleX *= baseActiveScale * spring;
              scaleY *= baseActiveScale * spring;
              offsetY = Math.sin(impProg * Math.PI * 6) * Math.max(0, 1.0 - impProg * 2) * 4;
            }

            const fieryGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            fieryGrad.addColorStop(0, '#FFF500');
            fieryGrad.addColorStop(0.4, '#FF4500');
            fieryGrad.addColorStop(1, '#990000');
            customFill = fieryGrad;

            ctx.shadowColor = '#FF4500';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        case 'cyber_katana_slash': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.38);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const katanaGrad = ctx.createLinearGradient(-wordWidth * 0.5, 0, wordWidth * 0.5, 0);
            katanaGrad.addColorStop(0, '#FFFFFF');
            katanaGrad.addColorStop(0.3, '#00F0FF');
            katanaGrad.addColorStop(0.7, '#FF0055');
            katanaGrad.addColorStop(1, '#FFFFFF');
            customFill = katanaGrad;

            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        case 'quantum_portal': {
          if (isWordActive) {
            const orbitPulse = 1.0 + Math.sin(currentTime * 10) * 0.1;
            scaleX *= baseActiveScale * orbitPulse;
            scaleY *= baseActiveScale * orbitPulse;
            rotation = Math.sin(currentTime * 6) * 0.03;

            const portalGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            portalGrad.addColorStop(0, '#F5D0FE');
            portalGrad.addColorStop(0.5, '#C084FC');
            portalGrad.addColorStop(1, '#6366F1');
            customFill = portalGrad;

            ctx.shadowColor = '#A855F7';
            ctx.shadowBlur = 26 * glowMul;
          }
          break;
        }

        case 'matrix_digital_rain': {
          if (isWordActive) {
            const jitterX = (Math.sin(currentTime * 45) > 0.4 ? 1 : 0) * 1.5;
            offsetX += jitterX;
            scaleX *= baseActiveScale;
            scaleY *= baseActiveScale;

            const matrixGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            matrixGrad.addColorStop(0, '#FFFFFF');
            matrixGrad.addColorStop(0.4, '#39FF14');
            matrixGrad.addColorStop(1, '#057A2A');
            customFill = matrixGrad;

            ctx.shadowColor = '#39FF14';
            ctx.shadowBlur = 20 * glowMul;
          }
          break;
        }

        case 'diamond_shatter': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.4);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;

            const diaGrad = ctx.createLinearGradient(-wordWidth * 0.5, -fontSizePx * 0.5, wordWidth * 0.5, fontSizePx * 0.5);
            diaGrad.addColorStop(0, '#FFFFFF');
            diaGrad.addColorStop(0.25, '#E0F7FA');
            diaGrad.addColorStop(0.5, '#80DEEA');
            diaGrad.addColorStop(0.75, '#D1C4E9');
            diaGrad.addColorStop(1, '#FFFFFF');
            customFill = diaGrad;

            ctx.shadowColor = '#80DEEA';
            ctx.shadowBlur = 22 * glowMul;
          }
          break;
        }

        case 'pop_art_dot_matrix': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.42);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;
            rotation = -0.04;
            wordColor = '#000000'; // high contrast black comic ink on halftone oval
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
          }
          break;
        }

        case 'radioactive_toxic': {
          if (isWordActive) {
            const slimePulse = 1.0 + Math.sin(currentTime * 16) * 0.08;
            scaleX *= baseActiveScale * slimePulse;
            scaleY *= baseActiveScale * (2.0 - slimePulse);
            offsetY = Math.sin(currentTime * 18) * (fontSizePx * 0.03);

            const toxicGrad = ctx.createLinearGradient(0, -fontSizePx * 0.55, 0, fontSizePx * 0.55);
            toxicGrad.addColorStop(0, '#EFFFF0');
            toxicGrad.addColorStop(0.4, '#39FF14');
            toxicGrad.addColorStop(1, '#0D5C14');
            customFill = toxicGrad;

            ctx.shadowColor = '#39FF14';
            ctx.shadowBlur = 24 * glowMul;
          }
          break;
        }

        case 'hyper_drive_warp': {
          if (isWordFuture) {
            opacity = 0;
            scaleX *= 0.1;
            scaleY *= 0.1;
          } else if (isWordActive) {
            const warpEase = 1.0 - Math.pow(1.0 - Math.min(1.0, wordProgress * 3.0), 3);
            scaleX *= baseActiveScale * (0.3 + 0.7 * warpEase);
            scaleY *= baseActiveScale * (0.3 + 0.7 * warpEase);
            opacity = Math.min(1.0, 0.3 + 0.7 * warpEase);

            const warpGrad = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
            warpGrad.addColorStop(0, '#FFFFFF');
            warpGrad.addColorStop(0.5, '#38BDF8');
            warpGrad.addColorStop(1, '#1D4ED8');
            customFill = warpGrad;

            ctx.shadowColor = '#38BDF8';
            ctx.shadowBlur = 20 * glowMul;
          }
          break;
        }

        case 'graffiti_spray': {
          if (isWordActive) {
            const spring = getSpringOvershootScale(wordProgress, 1.25);
            scaleX *= baseActiveScale * spring;
            scaleY *= baseActiveScale * spring;
            rotation = -0.03;

            const grafGrad = ctx.createLinearGradient(-wordWidth * 0.5, 0, wordWidth * 0.5, 0);
            grafGrad.addColorStop(0, '#F43F5E');
            grafGrad.addColorStop(0.5, '#FBBF24');
            grafGrad.addColorStop(1, '#A855F7');
            customFill = grafGrad;

            ctx.shadowColor = '#F43F5E';
            ctx.shadowBlur = 20 * glowMul;
          }
          break;
        }

        case 'neon_wireframe_3d': {
          if (isWordActive) {
            scaleX *= 1.1;
            scaleY *= 1.1;

            const wireGrad = ctx.createLinearGradient(-wordWidth * 0.5, 0, wordWidth * 0.5, 0);
            wireGrad.addColorStop(0, '#38BDF8');
            wireGrad.addColorStop(0.5, '#FFFFFF');
            wireGrad.addColorStop(1, '#818CF8');
            customFill = wireGrad;

            ctx.shadowColor = '#38BDF8';
            ctx.shadowBlur = 20 * glowMul;
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
      if ((style.animationType === 'glitch' || style.animationType === 'rgb_split_glitch') && isWordActive) {
        const splitDist = style.animationType === 'rgb_split_glitch' ? 5 : 3;
        ctx.save();
        ctx.translate(-splitDist, 0);
        ctx.fillStyle = '#00F0FF';
        ctx.globalAlpha = 0.8;
        ctx.fillText(textToRender, 0, 0);
        ctx.restore();

        ctx.save();
        ctx.translate(splitDist, 0);
        ctx.fillStyle = '#FF0055';
        ctx.globalAlpha = 0.8;
        ctx.fillText(textToRender, 0, 0);
        ctx.restore();
      }

      // Stomp Impact Double Landing Ghost
      if (style.animationType === 'stomp_impact' && isWordActive && wordProgress < 0.35) {
        ctx.save();
        ctx.translate(0, -fontSizePx * 0.15 * (1.0 - wordProgress / 0.35));
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = wordColor;
        ctx.fillText(textToRender, 0, 0);
        ctx.restore();
      }

      // Text Stroke / Outline
      const skipStroke =
        (style.animationType === 'bento_box' || style.animationType === 'comic_burst') &&
        isWordActive &&
        style.strokeWidth <= 2;

      if (style.strokeWidth > 0 && !skipStroke) {
        ctx.strokeStyle = style.strokeColor || '#000000';
        ctx.lineWidth = style.strokeWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(textToRender, 0, 0);
      }

      // Drop Shadow
      if (style.shadowBlur > 0 && style.animationType !== 'neon_glow' && style.animationType !== 'flicker_neon') {
        ctx.shadowColor = style.shadowColor || 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = style.shadowBlur;
        ctx.shadowOffsetY = style.shadowOffsetY || 4;
      }

      // Fill Word Text
      ctx.fillStyle = customFill || wordColor;
      ctx.fillText(textToRender, 0, 0);

      // -------------------------------------------------------------
      // POST-RENDER FOREGROUND OVERLAYS & ACCENTS
      // -------------------------------------------------------------
      if (isWordActive) {
        // Minimalist clean underline bar
        if (style.animationType === 'minimal') {
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

        // Artistic Brush Underline
        if (style.animationType === 'brush_underline') {
          ctx.save();
          const drawProgress = Math.min(1.0, wordProgress * 1.5);
          const uW = wordWidth * 1.05 * drawProgress;
          const uH = Math.max(3, fontSizePx * 0.12);
          const uY = fontSizePx * 0.52;
          const uX = -wordWidth * 0.52;

          ctx.fillStyle = word.colorOverride || style.activeWordColor || '#F59E0B';
          ctx.beginPath();
          ctx.moveTo(uX, uY);
          ctx.quadraticCurveTo(uX + uW * 0.5, uY - 2, uX + uW, uY + 1);
          ctx.quadraticCurveTo(uX + uW * 0.5, uY + uH + 1, uX, uY + uH);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // Starburst Twinkle Diamond Glints
        if (style.animationType === 'starburst_glow') {
          const starSize1 = Math.max(3, fontSizePx * 0.32 * Math.sin(Math.min(1.0, wordProgress * 2.0) * Math.PI));
          const starSize2 = Math.max(2, fontSizePx * 0.24 * Math.sin(Math.max(0, Math.min(1.0, (wordProgress - 0.2) * 2.0)) * Math.PI));
          const starColor = word.colorOverride || style.activeWordColor || '#FFF500';

          drawDiamondSparkle(ctx, -wordWidth * 0.55, -fontSizePx * 0.45, starSize1, starColor, currentTime * 3);
          drawDiamondSparkle(ctx, wordWidth * 0.55, -fontSizePx * 0.35, starSize2, starColor, -currentTime * 4);
        }

        // Explosive Burst Particle Spark Rays
        if (style.animationType === 'explosive_burst' && wordProgress < 0.6) {
          const pProgress = wordProgress / 0.6;
          const pCount = 6;
          const pDist = fontSizePx * (0.6 + pProgress * 0.9);
          const pSize = Math.max(1.5, fontSizePx * 0.12 * (1.0 - pProgress));
          const sparkColor = word.colorOverride || style.activeWordColor || '#FFD700';

          ctx.save();
          ctx.fillStyle = sparkColor;
          ctx.globalAlpha = (1.0 - pProgress);
          for (let pi = 0; pi < pCount; pi++) {
            const pAngle = (pi * (Math.PI * 2)) / pCount + 0.35;
            const px = Math.cos(pAngle) * (wordWidth * 0.55 + pDist);
            const py = Math.sin(pAngle) * (fontSizePx * 0.5 + pDist);
            ctx.beginPath();
            ctx.arc(px, py, pSize, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Confetti Party Celebration Blast
        if (style.animationType === 'confetti_party' && enableFx) {
          ctx.save();
          const confColors = ['#FFD700', '#FF1493', '#00F0FF', '#10B981', '#A855F7', '#FF6B00'];
          const confCount = 12;
          for (let ci = 0; ci < confCount; ci++) {
            const seed = ci * 3.7 + wordIdx;
            const cProg = (wordProgress * 1.8 + ci * 0.08) % 1.0;
            const cAngle = (ci * (Math.PI * 2)) / confCount + Math.sin(seed) * 0.5;
            const cDist = (fontSizePx * 0.8) + cProg * (fontSizePx * 1.8);
            const cx = Math.cos(cAngle) * (wordWidth * 0.5 + cDist);
            const cy = -fontSizePx * 0.3 + Math.sin(cAngle) * cDist + (cProg * cProg * fontSizePx * 0.8);

            // 3D spinning rectangle
            const spin = currentTime * 8 + ci;
            const cW = Math.max(2, fontSizePx * 0.15 * Math.abs(Math.cos(spin)));
            const cH = Math.max(3, fontSizePx * 0.22);

            ctx.fillStyle = confColors[ci % confColors.length];
            ctx.globalAlpha = Math.max(0, 1.0 - cProg * 0.8);
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(spin * 0.5);
            ctx.fillRect(-cW / 2, -cH / 2, cW, cH);
            ctx.restore();
          }
          ctx.restore();
        }

        // Golden Cash & Floating Coin Sparkles
        if (style.animationType === 'golden_cash' && enableFx) {
          ctx.save();
          const coinCount = 5;
          for (let i = 0; i < coinCount; i++) {
            const cProg = (currentTime * 1.5 + i * 0.2) % 1.0;
            const cx = -wordWidth * 0.5 + (i / (coinCount - 1)) * wordWidth;
            const cy = -fontSizePx * 0.5 - (cProg * fontSizePx * 0.8);
            const rotY = Math.abs(Math.cos(currentTime * 6 + i));
            const coinSize = fontSizePx * 0.22;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(rotY, 1.0);
            ctx.fillStyle = '#FFD700';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, coinSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Tiny '$' sign inside coin
            if (rotY > 0.5) {
              ctx.fillStyle = '#78350F';
              ctx.font = `900 ${Math.round(coinSize * 0.7)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('$', 0, 0);
            }
            ctx.restore();
          }
          drawDiamondSparkle(ctx, wordWidth * 0.55, -fontSizePx * 0.45, fontSizePx * 0.28, '#FFD700', currentTime * 4);
          ctx.restore();
        }

        // Volcanic Floating Ember Sparks
        if (style.animationType === 'fire_embers' && enableFx) {
          ctx.save();
          const emberCount = 8;
          for (let ei = 0; ei < emberCount; ei++) {
            const seed = ei * 4.3 + wordIdx;
            const eProg = (currentTime * 2.2 + ei * 0.12) % 1.0;
            const ex = -wordWidth * 0.45 + (ei / (emberCount - 1)) * (wordWidth * 0.9) + Math.sin(currentTime * 8 + seed) * 8;
            const ey = -fontSizePx * 0.2 - (eProg * fontSizePx * 1.2);
            const eSize = Math.max(1, fontSizePx * 0.1 * (1.0 - eProg));

            ctx.fillStyle = ei % 2 === 0 ? '#FFF500' : '#FF4500';
            ctx.shadowColor = '#FF4500';
            ctx.shadowBlur = 8;
            ctx.globalAlpha = Math.max(0, 1.0 - eProg);
            ctx.beginPath();
            ctx.arc(ex, ey, eSize, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Floating VIP Golden Crown
        if (style.animationType === 'crown_halo') {
          const crownSize = fontSizePx * 0.48;
          drawFloatingCrown(ctx, 0, -fontSizePx * 0.78, crownSize, '#F59E0B', currentTime);
          drawDiamondSparkle(ctx, crownSize * 0.6, -fontSizePx * 0.85, fontSizePx * 0.2, '#FFFFFF', currentTime * 5);
        }

        // Floating Heart Explosion Pop
        if (style.animationType === 'heart_explosion' && enableFx) {
          ctx.save();
          const heartCount = 4;
          for (let hi = 0; hi < heartCount; hi++) {
            const hProg = (currentTime * 1.6 + hi * 0.25) % 1.0;
            const hx = -wordWidth * 0.4 + (hi / (heartCount - 1)) * (wordWidth * 0.8) + Math.sin(currentTime * 6 + hi) * 6;
            const hy = -fontSizePx * 0.35 - (hProg * fontSizePx * 1.1);
            const hScale = Math.sin(hProg * Math.PI) * (fontSizePx * 0.25);

            ctx.font = `${Math.round(hScale)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.globalAlpha = Math.max(0, 1.0 - hProg * 0.7);
            ctx.fillText('❤️', hx, hy);
          }
          ctx.restore();
        }

        // Sub-Zero Ice Shards and Frost Twinkle
        if (style.animationType === 'frost_freeze' && enableFx) {
          drawDiamondSparkle(ctx, -wordWidth * 0.55, -fontSizePx * 0.45, fontSizePx * 0.32, '#00E5FF', currentTime * 3);
          drawDiamondSparkle(ctx, wordWidth * 0.55, -fontSizePx * 0.35, fontSizePx * 0.28, '#FFFFFF', -currentTime * 4);
        }

        // Floating Liquid Lava Bubbles
        if (style.animationType === 'liquid_lava' && enableFx) {
          ctx.save();
          for (let bi = 0; bi < 3; bi++) {
            const bProg = (currentTime * 1.8 + bi * 0.33) % 1.0;
            const bx = -wordWidth * 0.3 + bi * (wordWidth * 0.3) + Math.sin(currentTime * 7 + bi) * 4;
            const by = -fontSizePx * 0.25 - (bProg * fontSizePx * 0.65);
            const bSize = fontSizePx * 0.12 * (1.0 - bProg * 0.5);

            ctx.fillStyle = '#FFE600';
            ctx.shadowColor = '#FF5500';
            ctx.shadowBlur = 10;
            ctx.globalAlpha = 1.0 - bProg;
            ctx.beginPath();
            ctx.arc(bx, by, bSize, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Diamond Crystal Glass Shatter Shards
        if (style.animationType === 'diamond_shatter' && enableFx) {
          drawDiamondCrystalShatter(ctx, 0, 0, wordWidth, fontSizePx, wordProgress, glowMul);
        }
      }

      ctx.restore();

      startX += wordWidth + line.spaceWidth;
    });
  });

  ctx.restore();
}

/**
  * Core synchronous frame rendering function onto any 2D canvas context (DOM or OffscreenCanvas)
  */
export function renderCanvasFrameToContext({
  ctx,
  canvasWidth,
  canvasHeight,
  source,
  sourceWidth,
  sourceHeight,
  currentTime,
  duration,
  blocks,
  style,
  filter,
  transform,
  watermark,
  progressBar,
}: RenderToContextOptions): void {
  // Avoid rendering if video source is not yet ready to avoid flashing black/empty frames
  if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) {
    if (source.readyState < 2 && source.videoWidth === 0) {
      return;
    }
  }

  // Clear canvas
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

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

  const vWidth = sourceWidth || canvasWidth;
  const vHeight = sourceHeight || canvasHeight;

  const framingMode = transform?.framingMode || 'cover';
  const activeTransform = getInterpolatedTransform(transform, currentTime);

  if (framingMode === 'fit_blur') {
    // FIT WITH BLURRED BACKGROUND MODE
    const offW = 360;
    const offH = Math.round((offW / canvasWidth) * canvasHeight);

    if (!offscreenBlurBuffer) {
      if (typeof OffscreenCanvas !== 'undefined') {
        offscreenBlurBuffer = new OffscreenCanvas(offW, offH);
      } else if (typeof document !== 'undefined') {
        offscreenBlurBuffer = document.createElement('canvas');
        offscreenBlurBuffer.width = offW;
        offscreenBlurBuffer.height = offH;
      }
      if (offscreenBlurBuffer) {
        offscreenBlurCtx = offscreenBlurBuffer.getContext('2d', { willReadFrequently: false }) as AnyCanvasContext;
      }
    } else if (offscreenBlurBuffer.width !== offW || offscreenBlurBuffer.height !== offH) {
      offscreenBlurBuffer.width = offW;
      offscreenBlurBuffer.height = offH;
    }

    if (offscreenBlurCtx && offscreenBlurBuffer) {
      offscreenBlurCtx.save();
      offscreenBlurCtx.clearRect(0, 0, offW, offH);
      const bgScale = Math.max(offW / vWidth, offH / vHeight) * 1.15;
      const bgW = vWidth * bgScale;
      const bgH = vHeight * bgScale;
      const bgX = (offW - bgW) / 2;
      const bgY = (offH - bgH) / 2;
      offscreenBlurCtx.filter = `brightness(${Math.min(100, filter.brightness * 0.55)}%) contrast(${filter.contrast}%) blur(8px)`;
      try {
        offscreenBlurCtx.drawImage(source as CanvasImageSource, bgX, bgY, bgW, bgH);
      } catch {}
      offscreenBlurCtx.restore();

      // Draw blurred background plate
      ctx.save();
      ctx.drawImage(offscreenBlurBuffer as CanvasImageSource, 0, 0, canvasWidth, canvasHeight);
      ctx.restore();
    }

    // Step 2: Draw centered uncropped main video with fit scale + zoom + pan
    const fitScale = Math.min(canvasWidth / vWidth, canvasHeight / vHeight);
    const zoomScale = activeTransform.scale;
    const totalScale = fitScale * zoomScale;
    const drawWidth = vWidth * totalScale;
    const drawHeight = vHeight * totalScale;

    const panOffsetX = (activeTransform.panX / 100) * canvasWidth;
    const panOffsetY = (activeTransform.panY / 100) * canvasHeight;
    const drawX = (canvasWidth - drawWidth) / 2 + panOffsetX;
    const drawY = (canvasHeight - drawHeight) / 2 + panOffsetY;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    try {
      ctx.drawImage(source as CanvasImageSource, drawX, drawY, drawWidth, drawHeight);
    } catch {}
    ctx.restore();
  } else if (framingMode === 'dual_stack') {
    // DUAL-LAYER GAMING SPLIT-SCREEN
    const splitRatio = transform?.stackRatio ?? 0.42;
    const topH = Math.round(canvasHeight * splitRatio);
    const bottomH = canvasHeight - topH;

    // --- TOP STACK: Facecam / Streamer ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvasWidth, topH);
    ctx.clip();

    const topBaseScale = Math.max(canvasWidth / vWidth, topH / vHeight);
    const topZoom = transform?.secondaryScale || 1.8;
    const topTotalScale = topBaseScale * topZoom;
    const topW = vWidth * topTotalScale;
    const topHDraw = vHeight * topTotalScale;
    const topPanX = ((transform?.secondaryPanX ?? -35) / 100) * canvasWidth;
    const topPanY = ((transform?.secondaryPanY ?? -20) / 100) * topH;
    const topX = (canvasWidth - topW) / 2 + topPanX;
    const topY = (topH - topHDraw) / 2 + topPanY;

    try {
      ctx.drawImage(source as CanvasImageSource, topX, topY, topW, topHDraw);
    } catch {}
    ctx.restore();

    // --- BOTTOM STACK: Main Gameplay Action ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, topH, canvasWidth, bottomH);
    ctx.clip();

    const botBaseScale = Math.max(canvasWidth / vWidth, bottomH / vHeight);
    const botZoom = activeTransform.scale;
    const botTotalScale = botBaseScale * botZoom;
    const botW = vWidth * botTotalScale;
    const botHDraw = vHeight * botTotalScale;
    const botPanX = (activeTransform.panX / 100) * canvasWidth;
    const botPanY = (activeTransform.panY / 100) * bottomH;
    const botX = (canvasWidth - botW) / 2 + botPanX;
    const botY = topH + (bottomH - botHDraw) / 2 + botPanY;

    try {
      ctx.drawImage(source as CanvasImageSource, botX, botY, botW, botHDraw);
    } catch {}
    ctx.restore();

    // --- DIVIDER BAR ---
    ctx.save();
    const dividerGradient = ctx.createLinearGradient(0, topH - 2, canvasWidth, topH + 2);
    dividerGradient.addColorStop(0, '#FFD700');
    dividerGradient.addColorStop(0.5, '#00F0FF');
    dividerGradient.addColorStop(1, '#FF007F');
    ctx.fillStyle = dividerGradient;
    ctx.shadowColor = '#00F0FF';
    ctx.shadowBlur = 12;
    ctx.fillRect(0, topH - 3, canvasWidth, 6);
    ctx.restore();
  } else {
    // STANDARD COVER MODE
    const baseScale = Math.max(canvasWidth / vWidth, canvasHeight / vHeight);
    const zoomScale = activeTransform.scale;
    const totalScale = baseScale * zoomScale;
    const drawWidth = vWidth * totalScale;
    const drawHeight = vHeight * totalScale;

    const panOffsetX = (activeTransform.panX / 100) * canvasWidth;
    const panOffsetY = (activeTransform.panY / 100) * canvasHeight;
    const drawX = (canvasWidth - drawWidth) / 2 + panOffsetX;
    const drawY = (canvasHeight - drawHeight) / 2 + panOffsetY;

    try {
      ctx.drawImage(source as CanvasImageSource, drawX, drawY, drawWidth, drawHeight);
    } catch {}
  }
  ctx.restore();

  // 2. Render Watermark Overlay if enabled
  if (watermark) {
    renderWatermarkOverlay(ctx, watermark, canvasWidth, canvasHeight);
  }

  // 3. Render Progress Bar / Retention Timer if enabled
  if (progressBar) {
    renderProgressBarOverlay(ctx, progressBar, currentTime, duration || 0, canvasWidth, canvasHeight);
  }

  // 4. Find Active Subtitle Block at currentTime
  const activeBlock = blocks.find(
    b => currentTime >= b.start && currentTime <= b.end
  );

  if (!activeBlock || activeBlock.words.length === 0) return;

  // 5. Render Subtitles with Active Word Highlight
  renderSubtitleOverlay(ctx, activeBlock, currentTime, style, canvasWidth, canvasHeight);
}
