export type AspectRatio = '9:16' | '1:1' | '16:9' | '4:5';

export type PlatformPreset = 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'facebook_reels' | 'custom';

export type AnimationType =
  | 'pop'
  | 'bounce'
  | 'bounce_pulse'
  | 'rubber_band'
  | 'spin_in'
  | 'zoom_in'
  | 'blur_in'
  | 'float_drift'
  | 'heartbeat'
  | 'color_cycle'
  | 'karaoke'
  | 'bento_box'
  | 'neon_glow'
  | 'typewriter'
  | 'slide_up'
  | 'glitch'
  | 'shake'
  | 'wave'
  | 'flip'
  | 'fade_in'
  | 'flash'
  | 'minimal';

export type TextTransform = 'uppercase' | 'capitalize' | 'lowercase' | 'none';

export interface SubtitleWord {
  id: string;
  text: string;
  start: number; // in seconds
  end: number;   // in seconds
  colorOverride?: string;
  emoji?: string;
  isEmphasized?: boolean;
  sentiment?: 'positive' | 'negative' | 'excited' | 'dramatic' | 'neutral' | 'curious';
}

export interface SubtitleBlock {
  id: string;
  start: number;
  end: number;
  words: SubtitleWord[];
  mood?: 'hype' | 'happy' | 'dramatic' | 'shock' | 'inspirational' | 'warning' | 'curious' | 'neutral';
  suggestedEmoji?: string;
}

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number; // in px on canvas relative to 1080p height
  activeWordColor: string;
  inactiveWordColor: string;
  useBackgroundPill: boolean;
  backgroundColor: string;
  backgroundOpacity: number; // 0 to 1
  activeWordBgColor?: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetY: number;
  animationType: AnimationType;
  maxWordsPerLine: number;
  maxLinesPerBlock: number;
  textTransform: TextTransform;
  positionYPercent: number; // 0 to 100% from top
  positionXPercent: number; // 0 to 100% from left
  emojiEnabled: boolean;
  autoEmojiKeywords: boolean;
  activeScaleFactor: number; // e.g. 1.15 for pop
}

export interface VideoFilter {
  brightness: number; // 0 to 200, default 100
  contrast: number;   // 0 to 200, default 100
  saturation: number; // 0 to 200, default 100
  blur: number;       // 0 to 10px, default 0
  sepia: number;      // 0 to 100, default 0
  hueRotate: number;  // 0 to 360 deg, default 0
}

export type FramingMode = 'cover' | 'fit_blur' | 'dual_stack';

export interface CropKeyframe {
  id: string;
  timestamp: number; // in seconds
  panX: number;      // -50% to +50%
  panY: number;      // -50% to +50%
  scale: number;     // 1.0 to 2.5
  label?: string;    // e.g. "Speaker Left", "Action Center"
}

export interface VideoTransformSettings {
  scale: number;        // 1.0 (100%) to 2.5 (250%)
  panX: number;         // -50% to +50%
  panY: number;         // -50% to +50%
  playbackRate: number; // 0.5, 0.75, 1.0, 1.25, 1.5, 2.0
  trimStart: number;    // in seconds
  trimEnd: number;      // in seconds
  framingMode?: FramingMode; // 'cover' (full crop) | 'fit_blur' (blurred background) | 'dual_stack' (gaming facecam+gameplay)
  secondaryPanX?: number;    // -50% to +50% for facecam stack
  secondaryPanY?: number;    // -50% to +50% for facecam stack
  secondaryScale?: number;   // 1.0 to 3.0 for facecam stack
  stackRatio?: number;       // e.g. 0.42 for top 42% height
  keyframes?: CropKeyframe[];// Timeline crop center keyframes
}

export interface WatermarkSettings {
  enabled: boolean;
  text: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';
  opacity: number; // 0.1 to 1.0
  fontSize: number; // in px on 1080p
  fontFamily?: string; // CSS font-family string
  textColor?: string;
  positionXPercent?: number; // 0 to 100%
  positionYPercent?: number; // 0 to 100%
  showShadow?: boolean;      // Drop shadow toggle for brand handle text / box
  shadowColor?: string;     // Color for drop shadow
  shadowBlur?: number;      // Blur radius
  shadowOffsetY?: number;   // Y offset for drop shadow
  showBackgroundPill?: boolean; // Dark pill background toggle
}

export interface AudioSettings {
  videoVolume: number;   // 0 to 100
  bgmVolume: number;     // 0 to 100
  bgmUrl?: string;
  bgmFileName?: string;
  autoNormalize?: boolean; // Enable LUFS auto-normalization via Web Audio API gain node
  targetLufs?: number;    // Target LUFS value (default -14 LUFS)
  measuredLufs?: number;  // Measured integrated LUFS of input track
  normalizeGainDb?: number; // Gain adjustment in dB (e.g. +6.5 dB)
}

export interface PresetTheme {
  id: string;
  name: string;
  platform: PlatformPreset;
  style: Partial<SubtitleStyle>;
  description: string;
}

export type ExportResolution = '4k' | '1080p' | '720p' | '480p';

export type ExportFormat =
  | 'mp4'
  | 'webm'
  | 'mov'
  | 'mkv'
  | 'avi'
  | 'ts'
  | 'gif'
  | 'wav'
  | 'mp3';

export interface ExportSettings {
  format: ExportFormat;
  resolution: ExportResolution;
  fps: 24 | 30 | 60;
  quality: 'high' | 'medium' | 'low';
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  videoName?: string;
  videoDuration?: number;
  aspectRatio: AspectRatio;
  platformPreset: PlatformPreset;
  selectedPresetId: string;
  style: SubtitleStyle;
  filter: VideoFilter;
  transform: VideoTransformSettings;
  watermark: WatermarkSettings;
  audioSettings: AudioSettings;
  blocks: SubtitleBlock[];
  thumbnail?: string;
}
