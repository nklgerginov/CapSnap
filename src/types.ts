export type AspectRatio = '9:16' | '1:1' | '16:9' | '4:5';

export type PlatformPreset = 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'facebook_reels' | 'custom';

export type AnimationType =
  | 'polaroid_instant_camera_flash'
  | 'police_siren_strobe_cop'
  | 'burning_newspaper_headline'
  | 'underwater_aquarium_bubble_reef'
  | 'blueprint_architect_cad_grid'
  | 'neon_gas_tube_flicker'
  | 'western_wanted_poster_wood'
  | 'radar_sonar_submarine_ping'
  | 'graffiti_spraycan_drip_splat'
  | 'magic_alchemy_tarot_sigil'
  | 'casino_jackpot_gold_rush'
  | 'audio_visualizer_eq_bars'
  | 'retro_arcade_8bit_gameover'
  | 'toxic_nuclear_biohazard_tape'
  | 'dimensional_space_rift_tear'
  | 'manga_screentone_comic_punch'
  | 'matrix_falling_code_cascade'
  | 'laser_sniper_target_lock'
  | 'magical_girl_prism_wand'
  | 'glitch_skull_cyber_reaper'
  | 'pop'
  | 'explosive_burst'
  | 'meteor_impact'
  | 'thunder_god_lightning'
  | 'firework_grand_finale'
  | 'super_saiyan_aura'
  | 'plasma_arc_reactor'
  | 'matrix_cyber_glitch_portal'
  | 'demon_slayer_water_wheel'
  | 'galaxy_nebula_supercluster'
  | 'neon_cyber_shuriken'
  | 'lightning_chain_tesla'
  | 'cherry_blossom_samurai_slash'
  | 'liquid_mercury_chrome'
  | 'astral_constellation_zodiac'
  | 'lava_magma_eruption'
  | 'hologram_matrix_teleport'
  | 'vortex_black_flame_amaterasu'
  | 'supernova_cosmic_shockwave'
  | 'golden_kintsugi_fracture'
  | 'hyper_synth_laser_highway'
  | 'cyber_glitch_overload_rgb'
  | 'emerald_aurora_borealis_flow'
  | 'shonen_energy_spirit_bomb'
  | 'diamond_hyper_disco_prism'
  | 'phoenix_wings_solar_ascension'
  | 'black_hole_singularity'
  | 'god_rays_divine'
  | 'cyberpunk_hud_matrix'
  | 'ice_blizzard_frost'
  | 'neon_graffiti_drip'
  | 'dragon_breath_inferno'
  | 'golden_trophy_shimmer'
  | 'speed_demon_drift'
  | 'comic_action_blast_bubble'
  | 'quantum_entanglement_strings'
  | 'glitch_vhs_tape'
  | 'solar_flare_corona'
  | 'synthwave_retro_grid'
  | 'golden_fire_phoenix'
  | 'crystal_prismatic_rainbow'
  | 'kinetic_speed_lines_impact'
  | 'magic_runic_circle'
  | 'cyber_katana_slash'
  | 'quantum_portal'
  | 'matrix_digital_rain'
  | 'diamond_shatter'
  | 'pop_art_dot_matrix'
  | 'radioactive_toxic'
  | 'hyper_drive_warp'
  | 'graffiti_spray'
  | 'neon_wireframe_3d'
  | 'electric_plasma'
  | 'confetti_party'
  | 'laser_beam'
  | 'golden_cash'
  | 'liquid_lava'
  | 'kaleidoscope_vortex'
  | 'rgb_split_glitch'
  | 'speed_blur_streak'
  | 'heart_explosion'
  | 'frost_freeze'
  | 'target_hud'
  | 'washi_tape'
  | 'fire_embers'
  | 'crown_halo'
  | 'supernova_implode'
  | 'glassmorphism_3d'
  | 'marker_highlight'
  | 'luxury_shimmer'
  | 'fire_blaze'
  | 'hologram_scan'
  | 'stomp_impact'
  | 'jelly_wiggle'
  | 'starburst_glow'
  | 'drop_cascade'
  | 'flicker_neon'
  | 'comic_burst'
  | 'aurora_flow'
  | 'brush_underline'
  | '3d_tilt_punch'
  | 'cinematic_rise'
  | 'letter_expand'
  | 'arcade_pixel'
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
  confidence?: number; // 0 to 1 when provided by the transcription provider
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
  speaker?: string; // e.g. "Speaker 1", "Speaker 2", "Host", "Guest"
  speakerColor?: string; // Optional custom accent color for this speaker
}

export type SemanticCueType = 'keyword' | 'cta' | 'emoji' | 'b_roll' | 'sfx';

export interface SemanticCue {
  id: string;
  type: SemanticCueType;
  start: number;
  end: number;
  label: string;
  confidence: number;
  payload?: string;
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
  showSpeakerBadge?: boolean; // Show speaker name badge tag above subtitle
  animationSpeedMultiplier?: number; // 0.5 to 2.5, default 1.0
  glowIntensity?: number; // 0.0 to 2.5, default 1.0
  particleFxEnabled?: boolean; // default true
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

export interface ProgressBarSettings {
  enabled: boolean;
  position: 'top' | 'bottom';
  height: number; // 4 to 28 px
  color: string;
  secondaryColor?: string;
  glow: boolean;
  backgroundTrack: boolean;
  backgroundTrackColor?: string;
  showTimerText?: boolean;
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
  sfxEnabled?: boolean;   // Trigger smart sound effects on highlighted words
  sfxVolume?: number;     // 0 to 100 (default 70)
  sfxPreset?: 'pop' | 'whoosh' | 'ding' | 'boom' | 'click' | 'cash' | 'laser' | 'glitch';
  sfxOnEmphasizedOnly?: boolean; // Trigger on emphasized keywords only vs all words
  voiceClarity?: boolean; // High-pass rumble filter + presence booster (3.5kHz)
  bassBoost?: boolean;    // Warmth sub-low shelf (120Hz)
}

export interface PresetTheme {
  id: string;
  name: string;
  platform: PlatformPreset;
  style: Partial<SubtitleStyle>;
  description: string;
}

export interface SourceVideoStats {
  width: number;
  height: number;
  aspectRatioLabel: string;
  aspectRatioFormatted: string;
  fps: number;
  fpsFormatted: string;
  duration: number;
  durationFormatted: string;
  fileSize?: number;
  fileSizeFormatted?: string;
  bitrateKbps?: number;
  bitrateFormatted?: string;
  fileName?: string;
  mimeType?: string;
  codec?: string;
  audioChannels?: number;
  audioSampleRate?: number;
  audioFormatted?: string;
  orientation: 'landscape' | 'portrait' | 'square' | 'custom';
  isHighFramerate?: boolean;
}

export type ExportResolution = '4k' | '1080p' | '720p' | '480p' | 'source';

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
  fps: number;
  useSourceFps?: boolean;
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
  progressBar?: ProgressBarSettings;
  audioSettings: AudioSettings;
  blocks: SubtitleBlock[];
  semanticCues?: SemanticCue[];
  thumbnail?: string;
}
