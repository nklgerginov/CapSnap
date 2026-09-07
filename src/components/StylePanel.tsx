import React, { useState } from 'react';
import {
  Sparkles,
  Type,
  Move,
  Video,
  Check,
  Smile,
  Zap,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Crop,
  Clock,
  Plus,
  Trash2,
  Target,
  Volume2,
  Volume1,
  Mic,
  Radio,
  Music,
  Activity,
  Scissors,
  AtSign,
  Gauge,
  Star,
  Pin,
  Search,
  Flame,
} from 'lucide-react';
import {
  SubtitleStyle,
  VideoFilter,
  AnimationType,
  TextTransform,
  PlatformPreset,
  VideoTransformSettings,
  WatermarkSettings,
  ProgressBarSettings,
  AudioSettings,
} from '../types';
import { PRESET_THEMES } from '../utils/presetThemes';
import { HIGHLIGHT_COLOR_PRESETS } from '../utils/smartHighlighter';
import { GoogleFontPicker } from './GoogleFontPicker';
import { detectSubjectFocalPoint, SubjectFocalResult } from '../utils/subjectDetector';
import { addOrUpdateKeyframe, removeKeyframe, generateAutoTrackingKeyframes } from '../utils/cropKeyframes';
import { playSfx, SfxType } from '../utils/sfxSynthesizer';

interface StylePanelProps {
  style: SubtitleStyle;
  onChangeStyle: (updated: Partial<SubtitleStyle>) => void;
  filter: VideoFilter;
  onChangeFilter: (updated: Partial<VideoFilter>) => void;
  onApplyPreset: (presetId: string) => void;
  selectedPresetId?: string;
  platformPreset: PlatformPreset;
  transform?: VideoTransformSettings;
  onChangeTransform?: (updated: Partial<VideoTransformSettings>) => void;
  watermark?: WatermarkSettings;
  onChangeWatermark?: (updated: Partial<WatermarkSettings>) => void;
  progressBar?: ProgressBarSettings;
  onChangeProgressBar?: (updated: Partial<ProgressBarSettings>) => void;
  audioSettings?: AudioSettings;
  onChangeAudioSettings?: (updated: Partial<AudioSettings>) => void;
  duration?: number;
  currentTime?: number;
  onSmartHighlight?: (highlightColor?: string) => void;
  onClearHighlights?: () => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onSeek?: (time: number) => void;
  onForceSync?: () => void;
}

const FAVORITES_STORAGE_KEY = 'autocap_favorite_preset_ids';
const DEFAULT_FAVORITE_PRESET_IDS = ['hormozi_viral', 'toktik_viral_red', 'beast_red_punch'];

export const StylePanel: React.FC<StylePanelProps> = ({
  style,
  onChangeStyle,
  filter,
  onChangeFilter,
  onApplyPreset,
  selectedPresetId: selectedPresetIdProp,
  transform,
  onChangeTransform,
  watermark,
  onChangeWatermark,
  progressBar,
  onChangeProgressBar,
  audioSettings,
  onChangeAudioSettings,
  duration = 10,
  currentTime = 0,
  onSmartHighlight,
  onClearHighlights,
  videoRef,
  onSeek,
  onForceSync,
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'style' | 'motion' | 'video'>('presets');
  const [presetCategory, setPresetCategory] = useState<'all' | 'favorites' | 'viral' | 'gaming' | 'cyber' | 'cinematic' | 'creative' | 'minimal'>('all');
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const [presetPlatformFilter, setPresetPlatformFilter] = useState<'all' | 'tiktok' | 'youtube_shorts' | 'instagram_reels'>('all');
  const [localSelectedPresetId, setLocalSelectedPresetId] = useState<string>('hormozi_viral');
  const [selectedHighlightColor, setSelectedHighlightColor] = useState('#FFE600');
  const [showWatermarkFontPicker, setShowWatermarkFontPicker] = useState(false);
  const [hasSyncedRecently, setHasSyncedRecently] = useState(false);
  const [animCategory, setAnimCategory] = useState<'all' | 'viral' | 'cinematic' | 'cyber' | 'creative'>('all');
  const [animSearch, setAnimSearch] = useState('');

  const handleTriggerSync = () => {
    onForceSync?.();
    setHasSyncedRecently(true);
    setTimeout(() => setHasSyncedRecently(false), 2000);
  };

  // Favorite / Pinned Presets State (Persisted in localStorage)
  const [favoritePresetIds, setFavoritePresetIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load favorite presets from localStorage:', e);
    }
    return DEFAULT_FAVORITE_PRESET_IDS;
  });

  const toggleFavoritePreset = (presetId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setFavoritePresetIds(prev => {
      const isFav = prev.includes(presetId);
      const updated = isFav ? prev.filter(id => id !== presetId) : [...prev, presetId];
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to save favorite presets:', err);
      }
      return updated;
    });
  };

  const handlePinPopularPresets = () => {
    const popular = ['hormozi_viral', 'toktik_viral_red', 'beast_red_punch', 'gamer_hype_neon'];
    setFavoritePresetIds(popular);
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(popular));
    } catch (err) {
      console.warn('Failed to save favorite presets:', err);
    }
  };

  const activePresetId = selectedPresetIdProp ?? localSelectedPresetId;

  const [isAnalyzingCrop, setIsAnalyzingCrop] = useState(false);
  const [cropScanResult, setCropScanResult] = useState<SubjectFocalResult | null>(null);
  const [isAutoTracking, setIsAutoTracking] = useState(false);
  const [autoTrackingProgress, setAutoTrackingProgress] = useState(0);

  const handleRunSmartCrop = () => {
    setIsAnalyzingCrop(true);
    setTimeout(() => {
      const result = detectSubjectFocalPoint(videoRef?.current || null);
      setCropScanResult(result);
      setIsAnalyzingCrop(false);

      if (onChangeTransform) {
        onChangeTransform({
          panX: result.recommendedPanX,
          panY: result.recommendedPanY,
          scale: Math.max(1.2, result.recommendedScale),
          framingMode: 'cover',
        });
      }
    }, 350);
  };

  const handleAddKeyframeAtCurrentTime = () => {
    if (!onChangeTransform) return;
    const currentPanX = transform?.panX || 0;
    const currentPanY = transform?.panY || 0;
    const currentScale = transform?.scale || 1.2;

    const newKeyframes = addOrUpdateKeyframe(transform?.keyframes || [], {
      timestamp: currentTime,
      panX: currentPanX,
      panY: currentPanY,
      scale: currentScale,
      label: `Center @ ${currentTime.toFixed(1)}s`,
    });

    onChangeTransform({ keyframes: newKeyframes });
  };

  const handleAutoKeyframeAtCurrentTime = () => {
    const focal = detectSubjectFocalPoint(videoRef?.current || null);
    if (!onChangeTransform) return;

    const newKeyframes = addOrUpdateKeyframe(transform?.keyframes || [], {
      timestamp: currentTime,
      panX: focal.recommendedPanX,
      panY: focal.recommendedPanY,
      scale: Math.max(1.2, focal.recommendedScale),
      label: focal.description,
    });

    onChangeTransform({ keyframes: newKeyframes });
  };

  const handleRemoveKeyframe = (kfId: string) => {
    if (!onChangeTransform) return;
    const updated = removeKeyframe(transform?.keyframes || [], kfId);
    onChangeTransform({ keyframes: updated });
  };

  const handleClearAllKeyframes = () => {
    if (!onChangeTransform) return;
    onChangeTransform({ keyframes: [] });
  };

  const handleRunAutoTrackingSequence = async () => {
    if (!videoRef?.current || !onChangeTransform) return;
    setIsAutoTracking(true);
    setAutoTrackingProgress(0);

    try {
      const generated = await generateAutoTrackingKeyframes(
        videoRef.current,
        duration,
        progress => setAutoTrackingProgress(progress)
      );
      onChangeTransform({ keyframes: generated, framingMode: 'cover' });
    } catch (e) {
      console.warn('Auto tracking sequence error:', e);
    } finally {
      setIsAutoTracking(false);
    }
  };

  const ANIMATIONS: {
    label: string;
    value: AnimationType;
    desc: string;
    icon: string;
    category: 'viral' | 'cinematic' | 'cyber' | 'creative';
    badge?: 'PRO' | 'HOT' | 'NEW';
  }[] = [
    // --- Viral & High Impact ---
    { label: 'Police Siren Strobe', value: 'police_siren_strobe_cop', desc: 'Alternating red and blue flashing emergency lightbars with high-speed strobe flares & shake', icon: '🚨', category: 'viral', badge: 'PRO' },
    { label: 'Graffiti Aerosol Drip', value: 'graffiti_spraycan_drip_splat', desc: 'Urban aerosol spray paint mist cloud with heavy dripping runs & realistic paint splatter dots', icon: '🎨', category: 'viral', badge: 'PRO' },
    { label: 'Vegas 777 Jackpot', value: 'casino_jackpot_gold_rush', desc: 'Vegas marquee bulbs, 777 header banner, and raining $ stamped bouncing 3D gold coins', icon: '🎰', category: 'viral', badge: 'PRO' },
    { label: 'Manga Action Punch', value: 'manga_screentone_comic_punch', desc: 'High-contrast manga screentone speedlines, comic explosion burst & red action Kanji ドンッ!!', icon: '🗯️', category: 'viral', badge: 'PRO' },
    { label: 'Supernova Blast', value: 'supernova_cosmic_shockwave', desc: 'Thermonuclear stellar core detonation with relativistic circular shockwaves & 4-point starburst spikes', icon: '💥', category: 'viral', badge: 'PRO' },
    { label: 'Spirit Bomb Ki', value: 'shonen_energy_spirit_bomb', desc: 'Hovering cyan Spirit Bomb Ki sphere with inward spiraling energy vortex trails & ionic shockwaves', icon: '🌀', category: 'viral', badge: 'PRO' },
    { label: 'Cursed Black Flame', value: 'vortex_black_flame_amaterasu', desc: 'Mythic swirling jet-black dark matter flames edged with violet-magenta plasma spikes & soul wisps', icon: '🖤', category: 'viral', badge: 'PRO' },
    { label: 'Arc Reactor Core', value: 'plasma_arc_reactor', desc: 'Concentric magnetic containment coils, counter-rotating reactor rings & blinding unibeam flare', icon: '⚡', category: 'viral', badge: 'PRO' },
    { label: 'Cyber Ninja Shuriken', value: 'neon_cyber_shuriken', desc: 'Dual spinning 4-blade neon laser shurikens slicing with supersonic kinetic speed trails', icon: '🥷', category: 'viral', badge: 'PRO' },
    { label: 'Anime Water Wheel', value: 'demon_slayer_water_wheel', desc: 'Japanese woodblock Ukiyo-e wave curves curling around text with water droplet splashes', icon: '🌊', category: 'viral', badge: 'PRO' },
    { label: 'Volcano Magma Burst', value: 'lava_magma_eruption', desc: 'Glowing molten magma trench fissure with exploding obsidian rock shards & fiery sparks', icon: '🌋', category: 'viral', badge: 'PRO' },
    { label: 'Tesla Coil Plasma', value: 'lightning_chain_tesla', desc: 'Dual Tesla coil spheres generating continuous branching high-voltage violet plasma arcs', icon: '⚡', category: 'viral', badge: 'PRO' },
    { label: 'Cosmic Black Hole', value: 'black_hole_singularity', desc: 'Gravitational event horizon with rotating plasma accretion disk & photon ring', icon: '🌌', category: 'viral', badge: 'PRO' },
    { label: 'Speed Demon Drift', value: 'speed_demon_drift', desc: 'Flaming tire skid trails, dual cyan turbo jet fire bursts & drift tilt', icon: '🏎️', category: 'viral', badge: 'PRO' },
    { label: '3D Comic Blast', value: 'comic_action_blast_bubble', desc: 'Explosive 3D pop-art yellow starburst badge with halftone impact dots', icon: '💥', category: 'viral', badge: 'NEW' },
    { label: 'Thor Lightning', value: 'thunder_god_lightning', desc: 'High-voltage lightning bolts striking down with branching electric forks', icon: '⚡', category: 'viral', badge: 'PRO' },
    { label: 'Fireworks Finale', value: 'firework_grand_finale', desc: 'Pyrotechnic aerial fireworks bursting into multicolored glittering star trails', icon: '🎆', category: 'viral', badge: 'PRO' },
    { label: 'Super Saiyan Ki', value: 'super_saiyan_aura', desc: 'Billowing anime Ki plasma flame plumes rising with electric sparks', icon: '🔥', category: 'viral', badge: 'HOT' },
    { label: 'Manga Speed Frame', value: 'kinetic_speed_lines_impact', desc: 'Shonen anime impact frame with radiating black/white action speed lines', icon: '💥', category: 'viral', badge: 'NEW' },
    { label: 'Meteor Impact', value: 'meteor_impact', desc: 'Devastating fiery asteroid slam with ground cracks & molten rock sparks', icon: '☄️', category: 'viral', badge: 'PRO' },
    { label: 'Explosive Burst', value: 'explosive_burst', desc: 'MrBeast shockwave pulse & spark particle rays', icon: '💥', category: 'viral', badge: 'PRO' },
    { label: 'Supernova Implode', value: 'supernova_implode', desc: 'Micro suction implosion into massive kinetic explosion', icon: '🌌', category: 'viral', badge: 'HOT' },
    { label: 'Comic POW', value: 'comic_burst', desc: 'Pop-art starburst badge & high-impact snap', icon: '🗯️', category: 'viral', badge: 'NEW' },
    { label: 'Pop Art Dots', value: 'pop_art_dot_matrix', desc: 'Roy Lichtenstein halftone dot matrix & action rays', icon: '🎨', category: 'viral', badge: 'NEW' },
    { label: 'Confetti Party', value: 'confetti_party', desc: '3D tumbling celebration confetti & joyful bounce', icon: '🎉', category: 'viral', badge: 'HOT' },
    { label: 'Pop Spring', value: 'pop', desc: 'Snappy spring zoom overshoot & settlement', icon: '🚀', category: 'viral' },
    { label: 'Hard Stomp', value: 'stomp_impact', desc: 'Heavy slam with ground tremor & echo ghost', icon: '🔨', category: 'viral', badge: 'NEW' },
    { label: 'Anime Speed Trail', value: 'speed_blur_streak', desc: 'High-velocity action speed lines & inertia snap', icon: '🏎️', category: 'viral', badge: 'NEW' },
    { label: 'Bounce Jump', value: 'bounce', desc: 'Vertical kinetic jump with squash & stretch', icon: '🦘', category: 'viral' },
    { label: 'Pulse Bounce', value: 'bounce_pulse', desc: 'Classic scale-based sine pulse bounce', icon: '💓', category: 'viral' },
    { label: 'Rubber Band', value: 'rubber_band', desc: 'Jelly elastic stretch & rebound', icon: '🪀', category: 'viral' },
    { label: 'Impact Zoom', value: 'zoom_in', desc: 'Punch-in drop zoom from large to fit', icon: '🔍', category: 'viral' },
    { label: 'Impact Shake', value: 'shake', desc: 'High-energy tremor for punchlines & hooks', icon: '📳', category: 'viral' },
    { label: 'Voltage Flash', value: 'flash', desc: 'Rapid white strobe flash on speech attack', icon: '⚡', category: 'viral' },

    // --- Cinematic, Clean & Luxury ---
    { label: 'Polaroid Instant Flash', value: 'polaroid_instant_camera_flash', desc: 'White Polaroid instant photo frame with rainbow strip & entrance camera flash burst', icon: '📸', category: 'cinematic', badge: 'PRO' },
    { label: 'Burning News Headline', value: 'burning_newspaper_headline', desc: 'Aged Daily Chronicle newspaper header banner with burning bottom edge flames & embers', icon: '📰', category: 'cinematic', badge: 'PRO' },
    { label: 'Wild West Wanted Poster', value: 'western_wanted_poster_wood', desc: 'Rustic weathered wood reward poster with filigree border & lead bullet hole impacts', icon: '🤠', category: 'cinematic', badge: 'PRO' },
    { label: 'Space Rift Tear', value: 'dimensional_space_rift_tear', desc: 'Jagged dark matter reality fracture exposing purple hyperspace void & cosmic lightning', icon: '🌌', category: 'cinematic', badge: 'PRO' },
    { label: 'Kintsugi Gold Seams', value: 'golden_kintsugi_fracture', desc: 'Japanese Kintsugi 24K molten gold crack repair with sweeping specular shine & gold foil flakes', icon: '🏺', category: 'cinematic', badge: 'PRO' },
    { label: 'Emerald Aurora Sky', value: 'emerald_aurora_borealis_flow', desc: 'Serpentine flowing emerald northern light ribbons undulating smoothly with arctic stardust', icon: '🌌', category: 'cinematic', badge: 'PRO' },
    { label: 'Hyper Laser Prism', value: 'diamond_hyper_disco_prism', desc: 'Multi-beam spectrum rainbow laser caustics with rotating 3D crystal gem facet stars', icon: '💎', category: 'cinematic', badge: 'PRO' },
    { label: 'Andromeda Nebula', value: 'galaxy_nebula_supercluster', desc: 'Multi-layer glowing cosmic gas nebula clouds with orbiting ringed exoplanet & stellar clusters', icon: '🪐', category: 'cinematic', badge: 'PRO' },
    { label: 'Sakura Samurai Slash', value: 'cherry_blossom_samurai_slash', desc: 'Clean razor katana slash gleam cutting through center with fluttering cherry blossom petals', icon: '🌸', category: 'cinematic', badge: 'PRO' },
    { label: 'Liquid Mercury Morph', value: 'liquid_mercury_chrome', desc: 'Specular liquid metallic reflection waves morphing across text with dripping mercury globules', icon: '🪞', category: 'cinematic', badge: 'PRO' },
    { label: 'Zodiac Constellation', value: 'astral_constellation_zodiac', desc: 'Luminous star nodes connected by pulsing laser filament lines & sacred geometric astral rings', icon: '✨', category: 'cinematic', badge: 'PRO' },
    { label: 'Celestial God Rays', value: 'god_rays_divine', desc: 'Volumetric heavenly light shafts streaming down through text with golden dust motes', icon: '✨', category: 'cinematic', badge: 'PRO' },
    { label: '24K Gold Trophy', value: 'golden_trophy_shimmer', desc: 'Ultra-luxurious 24K liquid gold chrome gradient with sweeping specular light sheen', icon: '🏆', category: 'cinematic', badge: 'PRO' },
    { label: 'Prismatic Diamond', value: 'crystal_prismatic_rainbow', desc: 'Dynamic spectrum caustics & diamond facet refractive sparkles', icon: '💎', category: 'cinematic', badge: 'PRO' },
    { label: 'Solar Eclipse', value: 'solar_flare_corona', desc: 'Astronomical solar corona flare with coronal mass plasma loops', icon: '☀️', category: 'cinematic', badge: 'PRO' },
    { label: 'Hyper-Drive Warp', value: 'hyper_drive_warp', desc: 'Light-speed hyperspace star streaks radiating outwards', icon: '🚀', category: 'cinematic', badge: 'PRO' },
    { label: 'Diamond Shatter', value: 'diamond_shatter', desc: 'Faceted 3D prismatic crystal reflection with flying glass shards', icon: '💎', category: 'cinematic', badge: 'HOT' },
    { label: 'Marker Highlight', value: 'marker_highlight', desc: 'Ali Abdaal / Vox translucent highlighter sweep', icon: '🖍️', category: 'cinematic', badge: 'HOT' },
    { label: 'VIP Crown Halo', value: 'crown_halo', desc: 'Floating golden royal crown & luxury specular sheen', icon: '👑', category: 'cinematic', badge: 'PRO' },
    { label: 'Golden Cash', value: 'golden_cash', desc: '24k specular gold sheen with floating rotating coins', icon: '💰', category: 'cinematic', badge: 'PRO' },
    { label: 'Luxe Glint', value: 'luxury_shimmer', desc: 'Iman Gadzhi metallic specular shimmer sheen', icon: '✨', category: 'cinematic', badge: 'HOT' },
    { label: 'Washi Tape', value: 'washi_tape', desc: 'Realistic torn paper washi tape sticker & dark ink', icon: '🏷️', category: 'cinematic', badge: 'NEW' },
    { label: '3D Glass Bubble', value: 'glassmorphism_3d', desc: 'Glossy embossed 3D candy pill bubble with specular light', icon: '🫧', category: 'cinematic', badge: 'NEW' },
    { label: 'Cinematic Rise', value: 'cinematic_rise', desc: 'Apple/CapCut ultra-smooth cubic float & focus', icon: '🎬', category: 'cinematic', badge: 'NEW' },
    { label: '3D Tilt Punch', value: '3d_tilt_punch', desc: 'Alex Hormozi 3D perspective skew & forward pop', icon: '📐', category: 'cinematic', badge: 'NEW' },
    { label: 'Letter Expand', value: 'letter_expand', desc: 'Dynamic tracking kerning expand & lock', icon: '🔤', category: 'cinematic', badge: 'NEW' },
    { label: 'Kinetic Slide', value: 'slide_up', desc: 'Smooth upward float & spring rise', icon: '⬆️', category: 'cinematic' },
    { label: 'Cinematic Fade', value: 'fade_in', desc: 'Soft opacity transition per word', icon: '🌫️', category: 'cinematic' },
    { label: 'Bloom Blur', value: 'blur_in', desc: 'Glow blur bloom resolving to sharp focus', icon: '🔮', category: 'cinematic' },
    { label: 'Float Drift', value: 'float_drift', desc: 'Continuous organic floating tilt', icon: '🍃', category: 'cinematic' },
    { label: 'Minimalist', value: 'minimal', desc: 'Clean micro-scale & underline highlight bar', icon: '➖', category: 'cinematic' },

    // --- Cyber, Neon & Gaming ---
    { label: 'Submarine Sonar Radar', value: 'radar_sonar_submarine_ping', desc: 'Military submarine radar with rotating phosphor sweep beam, distance rings & blip pings', icon: '📡', category: 'cyber', badge: 'PRO' },
    { label: 'CAD Blueprint Grid', value: 'blueprint_architect_cad_grid', desc: 'Technical Prussian blue CAD drafting blueprint with coordinate grid & dimension markers', icon: '📐', category: 'cyber', badge: 'PRO' },
    { label: 'Neon Gas Tube Sign', value: 'neon_gas_tube_flicker', desc: 'Luminous bent glass neon tube lettering on wall brackets with realistic voltage flicker', icon: '💡', category: 'cyber', badge: 'PRO' },
    { label: 'Audio EQ Spectrum', value: 'audio_visualizer_eq_bars', desc: 'Dynamic 16-band audio spectrum equalizer bars with peak hold caps & frequency glow', icon: '🔊', category: 'cyber', badge: 'PRO' },
    { label: 'Sniper Target Lock', value: 'laser_sniper_target_lock', desc: 'Military sniper scope reticle with rotating compass ticks & red laser locked telemetry', icon: '🎯', category: 'cyber', badge: 'PRO' },
    { label: 'Matrix Green Cascade', value: 'matrix_falling_code_cascade', desc: '9 cascading vertical Japanese Katakana & binary code streams with glowing white leader characters', icon: '💻', category: 'cyber', badge: 'PRO' },
    { label: 'Cyber Hologram Skull', value: 'glitch_skull_cyber_reaper', desc: 'Holographic glowing crimson cyber skull with laser eye sockets & telemetry death counter', icon: '💀', category: 'cyber', badge: 'PRO' },
    { label: '8-Bit Arcade KO', value: 'retro_arcade_8bit_gameover', desc: '8-bit CRT arcade border, stepped pixel corners, floating +1000 PTS score & spinning pixel coin', icon: '👾', category: 'cyber', badge: 'PRO' },
    { label: 'Hologram Teleport', value: 'hologram_matrix_teleport', desc: 'Sci-Fi laser plane scanbeam, floating hexadecimal matrix telemetry & corner HUD reticle brackets', icon: '🌐', category: 'cyber', badge: 'PRO' },
    { label: 'Synthwave Highway', value: 'hyper_synth_laser_highway', desc: '3D perspective receding neon road grid with outrun wireframe sun horizon & laser speed trails', icon: '🏎️', category: 'cyber', badge: 'PRO' },
    { label: 'Neuro Glitch Overload', value: 'cyber_glitch_overload_rgb', desc: 'Dynamic chromatic RGB split shift with horizontal pixel circuit slices & jitter twitch displacement', icon: '⚡', category: 'cyber', badge: 'PRO' },
    { label: 'Cyber Hex Portal', value: 'matrix_cyber_glitch_portal', desc: 'Hexagonal honeycomb energy shield grid with active data nodes & chromatic glitch slices', icon: '🌐', category: 'cyber', badge: 'PRO' },
    { label: 'Cyber Mecha HUD', value: 'cyberpunk_hud_matrix', desc: 'Sci-fi military brackets, rotating compass dial & telemetry target acquisition', icon: '🤖', category: 'cyber', badge: 'PRO' },
    { label: 'Quantum Strings', value: 'quantum_entanglement_strings', desc: 'Intersecting 3-axis orbital electron rings with quantum probability waves', icon: '⚛️', category: 'cyber', badge: 'PRO' },
    { label: 'VHS Tape Glitch', value: 'glitch_vhs_tape', desc: 'Retro 80s analog VHS tracking scanlines & RGB chromatic shift', icon: '📼', category: 'cyber', badge: 'PRO' },
    { label: 'Synthwave Grid', value: 'synthwave_retro_grid', desc: '3D perspective wireframe horizon grid & retro striped neon sun', icon: '🌆', category: 'cyber', badge: 'PRO' },
    { label: 'Cyber Katana Slash', value: 'cyber_katana_slash', desc: 'Dual intersecting anime energy blade slashes with hot white core', icon: '⚔️', category: 'cyber', badge: 'PRO' },
    { label: 'Quantum Portal', value: 'quantum_portal', desc: 'Swirling deep space cosmic wormhole disk with spinning gravitational spiral', icon: '🌌', category: 'cyber', badge: 'PRO' },
    { label: 'Matrix Code Rain', value: 'matrix_digital_rain', desc: 'Cascading vertical Matrix code stream columns with neon green terminals', icon: '🟢', category: 'cyber', badge: 'HOT' },
    { label: '3D Neon Wireframe', value: 'neon_wireframe_3d', desc: 'Rotating 3D cyber wireframe perspective cage with glowing vertices', icon: '🧊', category: 'cyber', badge: 'NEW' },
    { label: 'Plasma Arc', value: 'electric_plasma', desc: 'High voltage electric jitter & branching lightning arcs', icon: '⚡', category: 'cyber', badge: 'PRO' },
    { label: 'Laser Slice', value: 'laser_beam', desc: 'High-energy horizontal laser sweep & hotspot flare', icon: '🔦', category: 'cyber', badge: 'NEW' },
    { label: 'Tactical HUD', value: 'target_hud', desc: 'Sci-Fi targeting reticle brackets & lock-on snap', icon: '🎯', category: 'cyber', badge: 'PRO' },
    { label: 'RGB Split Glitch', value: 'rgb_split_glitch', desc: 'Multi-channel chromatic aberration displacement & bars', icon: '📺', category: 'cyber', badge: 'HOT' },
    { label: 'Neon Vortex', value: 'kaleidoscope_vortex', desc: 'Concentric hypnotic pulsing rings & cosmic gradient', icon: '🌀', category: 'cyber', badge: 'NEW' },
    { label: 'Flicker Neon', value: 'flicker_neon', desc: 'Authentic gas tube electrode strike & bloom', icon: '💡', category: 'cyber', badge: 'NEW' },
    { label: 'Matrix Hologram', value: 'hologram_scan', desc: 'Sci-fi laser scanline wipe with cyan glow', icon: '🛸', category: 'cyber', badge: 'NEW' },
    { label: '8-Bit Arcade', value: 'arcade_pixel', desc: 'Retro pixel jump & nostalgic arcade colors', icon: '🕹️', category: 'cyber', badge: 'NEW' },
    { label: 'Neon Bloom', value: 'neon_glow', desc: 'Pulsing multi-layer cyber glow aura', icon: '⚡', category: 'cyber' },
    { label: 'Cyber Glitch', value: 'glitch', desc: 'RGB chromatic aberration slice jitter', icon: '👾', category: 'cyber' },
    { label: 'Spectrum Wave', value: 'color_cycle', desc: 'Dynamic rainbow hue spectrum cycling', icon: '🌈', category: 'cyber' },

    // --- Creative & Dynamic FX ---
    { label: 'Deep Sea Aquarium Reef', value: 'underwater_aquarium_bubble_reef', desc: 'Deep azure ocean backdrop with rising translucent air bubbles & swaying seaweed fronds', icon: '🫧', category: 'creative', badge: 'PRO' },
    { label: 'Mystic Tarot Sigil', value: 'magic_alchemy_tarot_sigil', desc: 'Golden alchemical sigil circle with spinning pentagram & orbiting ancient Norse runes', icon: '🔮', category: 'creative', badge: 'PRO' },
    { label: 'Nuclear Biohazard Tape', value: 'toxic_nuclear_biohazard_tape', desc: 'Animated diagonal caution hazard stripes, rotating radioactive trefoil & toxic ooze droplets', icon: '☣️', category: 'creative', badge: 'PRO' },
    { label: 'Magical Girl Star Wand', value: 'magical_girl_prism_wand', desc: 'Spinning golden-pink crystal star wand crest, rainbow ribbon arcs & orbiting starlight glints', icon: '💖', category: 'creative', badge: 'PRO' },
    { label: 'Phoenix Solar Wings', value: 'phoenix_wings_solar_ascension', desc: 'Majestic flaming golden phoenix wings stretching outward, shedding drifting burning feathers & solar halo', icon: '🔥', category: 'creative', badge: 'PRO' },
    { label: 'Dragon Flame Vortex', value: 'dragon_breath_inferno', desc: 'Scorching dual-stream dragon plasma vortex wrapping around text', icon: '🐉', category: 'creative', badge: 'PRO' },
    { label: 'Sub-Zero Cryo Blizzard', value: 'ice_blizzard_frost', desc: 'Sharp cryo ice crystal stalagmites bursting outward with glacial blue frost mist', icon: '❄️', category: 'creative', badge: 'PRO' },
    { label: 'Toxic Acid Graffiti', value: 'neon_graffiti_drip', desc: 'High-energy radioactive paint blast with realistic dripping paint runs', icon: '🧪', category: 'creative', badge: 'PRO' },
    { label: 'Phoenix Flame Wings', value: 'golden_fire_phoenix', desc: 'Radiant sweeping fire wing silhouettes extending outward with buoyant embers', icon: '🦅', category: 'creative', badge: 'PRO' },
    { label: 'Mystic Arcane Rune', value: 'magic_runic_circle', desc: 'Doctor Strange glowing spinning geometric spell mandala rings', icon: '🔮', category: 'creative', badge: 'PRO' },
    { label: 'Radioactive Slime', value: 'radioactive_toxic', desc: 'Radioactive neon green hazard pulse ring with rising biohazard slime bubbles', icon: '☣️', category: 'creative', badge: 'PRO' },
    { label: 'Graffiti Spray', value: 'graffiti_spray', desc: 'Aerosol spray paint mist cloud backdrop with realistic dripping paint runs', icon: '🎨', category: 'creative', badge: 'NEW' },
    { label: 'Molten Lava', value: 'liquid_lava', desc: 'Organic rising lava wave fill & buoyant floating magma orbs', icon: '🌋', category: 'creative', badge: 'HOT' },
    { label: 'Fire Embers', value: 'fire_embers', desc: 'Combustion flame gradient with buoyant floating sparks', icon: '🔥', category: 'creative', badge: 'PRO' },
    { label: 'Heart Pop FX', value: 'heart_explosion', desc: 'Rhythmic heartbeat bounce with floating heart particles', icon: '💖', category: 'creative', badge: 'NEW' },
    { label: 'Sub-Zero Freeze', value: 'frost_freeze', desc: 'Icy crystalline cyan gradient with freezing snowflake mist', icon: '❄️', category: 'creative', badge: 'NEW' },
    { label: 'Volcano Blaze', value: 'fire_blaze', desc: 'Fiery flame gradient & heat ember shimmer', icon: '🔥', category: 'creative', badge: 'HOT' },
    { label: 'Aurora Borealis', value: 'aurora_flow', desc: 'Flowing cosmic Northern Lights multi-gradient', icon: '🌌', category: 'creative', badge: 'NEW' },
    { label: 'Starburst Twinkle', value: 'starburst_glow', desc: 'Radiant 4-point diamond star sparkles', icon: '⭐', category: 'creative', badge: 'NEW' },
    { label: 'Jelly Wobble', value: 'jelly_wiggle', desc: 'Squishy organic jello squash & harmonic wobble', icon: '🍮', category: 'creative', badge: 'NEW' },
    { label: 'Brush Stroke', value: 'brush_underline', desc: 'Artistic hand-painted dynamic brush underline', icon: '🖌️', category: 'creative', badge: 'NEW' },
    { label: 'Gravity Drop', value: 'drop_cascade', desc: 'Physical gravity drop & baseline cushion', icon: '💧', category: 'creative', badge: 'NEW' },
    { label: 'Spin Drop', value: 'spin_in', desc: '360 kinetic rotation drop & snap', icon: '💫', category: 'creative' },
    { label: 'Karaoke Wipe', value: 'karaoke', desc: 'Smooth left-to-right color fill sweep', icon: '🎤', category: 'creative' },
    { label: 'Bento Box', value: 'bento_box', desc: 'Vibrant highlight pill tag with contrast', icon: '🏷️', category: 'creative' },
    { label: 'Typewriter', value: 'typewriter', desc: 'Character-by-character live speech reveal', icon: '⌨️', category: 'creative' },
    { label: 'Heartbeat', value: 'heartbeat', desc: 'Double rhythmic throb pulse', icon: '❤️', category: 'creative' },
    { label: 'Harmonic Wave', value: 'wave', desc: 'Continuous floating sine wave motion', icon: '🌊', category: 'creative' },
    { label: '3D Flip In', value: 'flip', desc: '3D card flip rotation on word entry', icon: '🔄', category: 'creative' },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col h-full overflow-hidden shadow-xl">
      {/* 4 Crisp Consolidated Tabs & Sync Button */}
      <div className="flex items-center gap-1.5 mb-3">
        <div className="grid grid-cols-4 bg-slate-950/80 p-1 rounded-xl border border-slate-800 flex-1 gap-1">
          <button
            onClick={() => setActiveTab('presets')}
            className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1 transition-all ${
              activeTab === 'presets'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Presets</span>
          </button>
          <button
            onClick={() => setActiveTab('style')}
            className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1 transition-all ${
              activeTab === 'style'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Style</span>
          </button>
          <button
            onClick={() => setActiveTab('motion')}
            className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1 transition-all ${
              activeTab === 'motion'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Move className="w-3.5 h-3.5" />
            <span>Motion</span>
          </button>
          <button
            onClick={() => setActiveTab('video')}
            className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1 transition-all ${
              activeTab === 'video'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Video</span>
          </button>
        </div>

        <button
          onClick={handleTriggerSync}
          className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all flex items-center space-x-1 shrink-0 active:scale-95 ${
            hasSyncedRecently
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-slate-950/80 hover:bg-slate-800 text-amber-400 border-amber-500/30'
          }`}
          title="Force refresh & synchronize all styles to preview canvas"
        >
          <Zap className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{hasSyncedRecently ? 'Synced' : 'Sync'}</span>
        </button>
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-slate-200 custom-scrollbar">
        {/* TAB 1: PRESET GALLERY */}
        {activeTab === 'presets' && (
          <div className="space-y-2.5">
            {/* Search & Platform Quick Filter Bar */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search preset styles (e.g., MrBeast, Katana, Neon, Gold)..."
                  value={presetSearchQuery}
                  onChange={e => setPresetSearchQuery(e.target.value)}
                  className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/40"
                />
                {presetSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setPresetSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Platform Selector Tabs */}
              <div className="grid grid-cols-4 gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800/80 text-[10px] font-bold">
                {[
                  { id: 'all', label: 'All Formats' },
                  { id: 'tiktok', label: '📱 TikTok' },
                  { id: 'youtube_shorts', label: '🔴 Shorts' },
                  { id: 'instagram_reels', label: '📸 Reels' },
                ].map(plat => (
                  <button
                    key={plat.id}
                    type="button"
                    onClick={() => setPresetPlatformFilter(plat.id as any)}
                    className={`py-1 px-1 rounded-lg text-center truncate transition-all ${
                      presetPlatformFilter === plat.id
                        ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    {plat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center space-x-1 overflow-x-auto pb-0.5 custom-scrollbar">
              {[
                { id: 'all', label: 'All' },
                {
                  id: 'favorites',
                  label: `⭐ Favorites${favoritePresetIds.length > 0 ? ` (${favoritePresetIds.length})` : ''}`,
                },
                { id: 'viral', label: '🔥 Viral' },
                { id: 'gaming', label: '🎮 Gaming' },
                { id: 'cyber', label: '⚡ Cyber/Neon' },
                { id: 'cinematic', label: '🎬 Cinematic' },
                { id: 'creative', label: '🎨 Creative' },
                { id: 'minimal', label: '✨ Minimal' },
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setPresetCategory(cat.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all flex items-center space-x-1 ${
                    presetCategory === cat.id
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
                  }`}
                >
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Empty Favorites State */}
            {presetCategory === 'favorites' && favoritePresetIds.length === 0 ? (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-6 text-center space-y-3 my-2">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                  <Star className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-200">No Pinned Favorites Yet</h4>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    Click the star icon on any preset theme to pin it to the top of your list for fast access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePinPopularPresets}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-extrabold shadow transition-all active:scale-95 inline-flex items-center space-x-1.5"
                >
                  <Star className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Pin 4 Trending Themes</span>
                </button>
              </div>
            ) : (
              /* Dedicated Smooth Scrollable Presets Grid */
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
                  <span>
                    Showing {PRESET_THEMES.filter(theme => {
                      if (presetPlatformFilter !== 'all' && theme.platform !== presetPlatformFilter) return false;
                      if (presetSearchQuery) {
                        const q = presetSearchQuery.toLowerCase();
                        const matchName = theme.name.toLowerCase().includes(q);
                        const matchDesc = theme.description.toLowerCase().includes(q);
                        const matchAnim = (theme.style.animationType || '').toLowerCase().includes(q);
                        if (!matchName && !matchDesc && !matchAnim) return false;
                      }
                      if (presetCategory === 'favorites') return favoritePresetIds.includes(theme.id);
                      if (presetCategory === 'viral') {
                        return ['hormozi_viral', 'beast_red_punch', 'toktik_viral_red', 'volcano_orange_pop', 'meteor_strike_beast', 'pop_art_comic_pow', 'thunder_god_strike', 'firework_celebration_finale', 'super_saiyan_ki_power', 'shonen_manga_speed_frame', 'black_hole_event_horizon', 'speed_demon_hyper_drift', 'pop_comic_pow_action', 'iron_arc_reactor_core', 'cyber_ninja_shuriken_storm', 'anime_water_wheel_dragon', 'volcano_magma_obsidian_burst', 'tesla_coil_lightning_discharge', 'celestial_supernova_detonation', 'shonen_spirit_bomb_ki_sphere', 'cursed_black_flame_amaterasu'].includes(theme.id) || ['pop', 'explosive_burst', 'stomp_impact', 'supernova_implode', 'meteor_impact', 'comic_burst', 'thunder_god_lightning', 'firework_grand_finale', 'super_saiyan_aura', 'kinetic_speed_lines_impact', 'black_hole_singularity', 'speed_demon_drift', 'comic_action_blast_bubble', 'plasma_arc_reactor', 'neon_cyber_shuriken', 'demon_slayer_water_wheel', 'lava_magma_eruption', 'lightning_chain_tesla', 'supernova_cosmic_shockwave', 'shonen_energy_spirit_bomb', 'vortex_black_flame_amaterasu'].includes(theme.style.animationType || '');
                      }
                      if (presetCategory === 'gaming') {
                        return ['gamer_hype_neon', 'gamer_clutch_gold', 'bento_box_gold', 'cyber_katana_neon', 'matrix_rain_hacker', 'shonen_manga_speed_frame', 'super_saiyan_ki_power', 'cyberpunk_mecha_targeting_hud', 'speed_demon_hyper_drift', 'cyber_ninja_shuriken_storm', 'iron_arc_reactor_core', 'cyber_hex_matrix_portal', 'shonen_spirit_bomb_ki_sphere', 'cyber_neuro_glitch_overload', 'synthwave_laser_highway_outrun'].includes(theme.id) || ['cyber_katana_slash', 'matrix_digital_rain', 'arcade_pixel', 'target_hud', 'super_saiyan_aura', 'kinetic_speed_lines_impact', 'cyberpunk_hud_matrix', 'speed_demon_drift', 'neon_cyber_shuriken', 'plasma_arc_reactor', 'matrix_cyber_glitch_portal', 'shonen_energy_spirit_bomb', 'cyber_glitch_overload_rgb', 'hyper_synth_laser_highway'].includes(theme.style.animationType || '');
                      }
                      if (presetCategory === 'cyber') {
                        return ['synthwave_cyber_purple', 'shorts_electric_green', 'reels_cyan_gradient', 'karaoke_pink_fire', 'cyber_katana_neon', 'quantum_portal_wormhole', 'matrix_rain_hacker', 'neon_wireframe_3d_cube', 'vhs_glitch_retro_80s', 'synthwave_outrun_grid', 'cyberpunk_mecha_targeting_hud', 'quantum_entanglement_orbit', 'black_hole_event_horizon', 'cyber_hex_matrix_portal', 'iron_arc_reactor_core', 'tesla_coil_lightning_discharge', 'cyber_ninja_shuriken_storm', 'sci_fi_hologram_matrix_teleport', 'synthwave_laser_highway_outrun', 'cyber_neuro_glitch_overload'].includes(theme.id) || ['electric_plasma', 'laser_beam', 'quantum_portal', 'rgb_split_glitch', 'neon_wireframe_3d', 'hologram_scan', 'glitch_vhs_tape', 'synthwave_retro_grid', 'cyberpunk_hud_matrix', 'quantum_entanglement_strings', 'black_hole_singularity', 'matrix_cyber_glitch_portal', 'plasma_arc_reactor', 'lightning_chain_tesla', 'neon_cyber_shuriken', 'hologram_matrix_teleport', 'hyper_synth_laser_highway', 'cyber_glitch_overload_rgb'].includes(theme.style.animationType || '');
                      }
                      if (presetCategory === 'cinematic') {
                        return ['golden_luxe_aura', 'vip_crown_luxury', 'diamond_crystal_luxe', 'hyper_drive_interstellar', 'crystal_prism_caustics', 'solar_eclipse_corona', 'divine_celestial_god_rays', 'royal_24k_gold_trophy', 'andromeda_galaxy_nebula', 'sakura_samurai_katana_slash', 'liquid_mercury_metal_morph', 'zodiac_astral_constellation', 'japanese_kintsugi_gold_fracture', 'nordic_emerald_aurora_sky', 'diamond_hyper_laser_disco_prism'].includes(theme.id) || ['diamond_shatter', 'crown_halo', 'golden_cash', 'hyper_drive_warp', 'cinematic_rise', 'luxury_shimmer', 'crystal_prismatic_rainbow', 'solar_flare_corona', 'god_rays_divine', 'golden_trophy_shimmer', 'galaxy_nebula_supercluster', 'cherry_blossom_samurai_slash', 'liquid_mercury_chrome', 'astral_constellation_zodiac', 'golden_kintsugi_fracture', 'emerald_aurora_borealis_flow', 'diamond_hyper_disco_prism'].includes(theme.style.animationType || '');
                      }
                      if (presetCategory === 'creative') {
                        return ['radioactive_biohazard', 'graffiti_street_artist', 'pop_art_comic_pow', 'phoenix_fire_rebirth', 'mystic_runic_sorcerer', 'subzero_cryo_blizzard', 'toxic_acid_neon_graffiti', 'dragon_fire_inferno_vortex', 'anime_water_wheel_dragon', 'volcano_magma_obsidian_burst', 'zodiac_astral_constellation', 'sakura_samurai_katana_slash', 'phoenix_wings_solar_ascension_god', 'cursed_black_flame_amaterasu', 'nordic_emerald_aurora_sky'].includes(theme.id) || ['radioactive_toxic', 'graffiti_spray', 'liquid_lava', 'fire_embers', 'frost_freeze', 'aurora_flow', 'heart_explosion', 'golden_fire_phoenix', 'magic_runic_circle', 'ice_blizzard_frost', 'neon_graffiti_drip', 'dragon_breath_inferno', 'demon_slayer_water_wheel', 'lava_magma_eruption', 'astral_constellation_zodiac', 'cherry_blossom_samurai_slash', 'phoenix_wings_solar_ascension', 'vortex_black_flame_amaterasu', 'emerald_aurora_borealis_flow'].includes(theme.style.animationType || '');
                      }
                      if (presetCategory === 'minimal') {
                        return ['minimal_clean_white', 'dark_stealth_amber'].includes(theme.id) || ['minimal', 'fade_in', 'letter_expand', 'marker_highlight'].includes(theme.style.animationType || '');
                      }
                      return true;
                    }).length} preset styles
                  </span>
                  <span className="text-amber-400 font-medium">Scrollable Gallery ↕</span>
                </div>

                <div className="overflow-y-auto max-h-[500px] sm:max-h-[calc(100vh-320px)] min-h-[360px] pr-1.5 custom-scrollbar">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-4">
                    {PRESET_THEMES.filter(theme => {
                      if (presetPlatformFilter !== 'all' && theme.platform !== presetPlatformFilter) return false;
                      if (presetSearchQuery) {
                        const q = presetSearchQuery.toLowerCase();
                        const matchName = theme.name.toLowerCase().includes(q);
                        const matchDesc = theme.description.toLowerCase().includes(q);
                        const matchAnim = (theme.style.animationType || '').toLowerCase().includes(q);
                        if (!matchName && !matchDesc && !matchAnim) return false;
                      }
                      if (presetCategory === 'favorites') return favoritePresetIds.includes(theme.id);
                      if (presetCategory === 'viral') {
                        return ['hormozi_viral', 'beast_red_punch', 'toktik_viral_red', 'volcano_orange_pop', 'meteor_strike_beast', 'pop_art_comic_pow', 'thunder_god_strike', 'firework_celebration_finale', 'super_saiyan_ki_power', 'shonen_manga_speed_frame', 'black_hole_event_horizon', 'speed_demon_hyper_drift', 'pop_comic_pow_action', 'iron_arc_reactor_core', 'cyber_ninja_shuriken_storm', 'anime_water_wheel_dragon', 'volcano_magma_obsidian_burst', 'tesla_coil_lightning_discharge', 'celestial_supernova_detonation', 'shonen_spirit_bomb_ki_sphere', 'cursed_black_flame_amaterasu'].includes(theme.id) || ['pop', 'explosive_burst', 'stomp_impact', 'supernova_implode', 'meteor_impact', 'comic_burst', 'thunder_god_lightning', 'firework_grand_finale', 'super_saiyan_aura', 'kinetic_speed_lines_impact', 'black_hole_singularity', 'speed_demon_drift', 'comic_action_blast_bubble', 'plasma_arc_reactor', 'neon_cyber_shuriken', 'demon_slayer_water_wheel', 'lava_magma_eruption', 'lightning_chain_tesla', 'supernova_cosmic_shockwave', 'shonen_energy_spirit_bomb', 'vortex_black_flame_amaterasu'].includes(theme.style.animationType || '');
                      }
                      if (presetCategory === 'gaming') {
                        return ['gamer_hype_neon', 'gamer_clutch_gold', 'bento_box_gold', 'cyber_katana_neon', 'matrix_rain_hacker', 'shonen_manga_speed_frame', 'super_saiyan_ki_power', 'cyberpunk_mecha_targeting_hud', 'speed_demon_hyper_drift', 'cyber_ninja_shuriken_storm', 'iron_arc_reactor_core', 'cyber_hex_matrix_portal', 'shonen_spirit_bomb_ki_sphere', 'cyber_neuro_glitch_overload', 'synthwave_laser_highway_outrun'].includes(theme.id) || ['cyber_katana_slash', 'matrix_digital_rain', 'arcade_pixel', 'target_hud', 'super_saiyan_aura', 'kinetic_speed_lines_impact', 'cyberpunk_hud_matrix', 'speed_demon_drift', 'neon_cyber_shuriken', 'plasma_arc_reactor', 'matrix_cyber_glitch_portal', 'shonen_energy_spirit_bomb', 'cyber_glitch_overload_rgb', 'hyper_synth_laser_highway'].includes(theme.style.animationType || '');
                      }
                      if (presetCategory === 'cyber') {
                        return ['synthwave_cyber_purple', 'shorts_electric_green', 'reels_cyan_gradient', 'karaoke_pink_fire', 'cyber_katana_neon', 'quantum_portal_wormhole', 'matrix_rain_hacker', 'neon_wireframe_3d_cube', 'vhs_glitch_retro_80s', 'synthwave_outrun_grid', 'cyberpunk_mecha_targeting_hud', 'quantum_entanglement_orbit', 'black_hole_event_horizon', 'cyber_hex_matrix_portal', 'iron_arc_reactor_core', 'tesla_coil_lightning_discharge', 'cyber_ninja_shuriken_storm', 'sci_fi_hologram_matrix_teleport', 'synthwave_laser_highway_outrun', 'cyber_neuro_glitch_overload'].includes(theme.id) || ['electric_plasma', 'laser_beam', 'quantum_portal', 'rgb_split_glitch', 'neon_wireframe_3d', 'hologram_scan', 'glitch_vhs_tape', 'synthwave_retro_grid', 'cyberpunk_hud_matrix', 'quantum_entanglement_strings', 'black_hole_singularity', 'matrix_cyber_glitch_portal', 'plasma_arc_reactor', 'lightning_chain_tesla', 'neon_cyber_shuriken', 'hologram_matrix_teleport', 'hyper_synth_laser_highway', 'cyber_glitch_overload_rgb'].includes(theme.style.animationType || '');
                      }
                      if (presetCategory === 'cinematic') {
                        return ['golden_luxe_aura', 'vip_crown_luxury', 'diamond_crystal_luxe', 'hyper_drive_interstellar', 'crystal_prism_caustics', 'solar_eclipse_corona', 'divine_celestial_god_rays', 'royal_24k_gold_trophy', 'andromeda_galaxy_nebula', 'sakura_samurai_katana_slash', 'liquid_mercury_metal_morph', 'zodiac_astral_constellation', 'japanese_kintsugi_gold_fracture', 'nordic_emerald_aurora_sky', 'diamond_hyper_laser_disco_prism'].includes(theme.id) || ['diamond_shatter', 'crown_halo', 'golden_cash', 'hyper_drive_warp', 'cinematic_rise', 'luxury_shimmer', 'crystal_prismatic_rainbow', 'solar_flare_corona', 'god_rays_divine', 'golden_trophy_shimmer', 'galaxy_nebula_supercluster', 'cherry_blossom_samurai_slash', 'liquid_mercury_chrome', 'astral_constellation_zodiac', 'golden_kintsugi_fracture', 'emerald_aurora_borealis_flow', 'diamond_hyper_disco_prism'].includes(theme.style.animationType || '');
                      }
                      if (presetCategory === 'creative') {
                        return ['radioactive_biohazard', 'graffiti_street_artist', 'pop_art_comic_pow', 'phoenix_fire_rebirth', 'mystic_runic_sorcerer', 'subzero_cryo_blizzard', 'toxic_acid_neon_graffiti', 'dragon_fire_inferno_vortex', 'anime_water_wheel_dragon', 'volcano_magma_obsidian_burst', 'zodiac_astral_constellation', 'sakura_samurai_katana_slash', 'phoenix_wings_solar_ascension_god', 'cursed_black_flame_amaterasu', 'nordic_emerald_aurora_sky'].includes(theme.id) || ['radioactive_toxic', 'graffiti_spray', 'liquid_lava', 'fire_embers', 'frost_freeze', 'aurora_flow', 'heart_explosion', 'golden_fire_phoenix', 'magic_runic_circle', 'ice_blizzard_frost', 'neon_graffiti_drip', 'dragon_breath_inferno', 'demon_slayer_water_wheel', 'lava_magma_eruption', 'astral_constellation_zodiac', 'cherry_blossom_samurai_slash', 'phoenix_wings_solar_ascension', 'vortex_black_flame_amaterasu', 'emerald_aurora_borealis_flow'].includes(theme.style.animationType || '');
                      }
                      if (presetCategory === 'minimal') {
                        return ['minimal_clean_white', 'dark_stealth_amber'].includes(theme.id) || ['minimal', 'fade_in', 'letter_expand', 'marker_highlight'].includes(theme.style.animationType || '');
                      }
                      return true;
                    })
                      .sort((a, b) => {
                        const aFav = favoritePresetIds.includes(a.id);
                        const bFav = favoritePresetIds.includes(b.id);
                        if (aFav && !bFav) return -1;
                        if (!aFav && bFav) return 1;
                        return 0;
                      })
                      .map(theme => {
                        const isSelected = activePresetId === theme.id;
                        const isFavorited = favoritePresetIds.includes(theme.id);
                        const activeColor = theme.style.activeWordColor || '#FFE600';
                        const inactiveColor = theme.style.inactiveWordColor || '#FFFFFF';

                        return (
                          <div
                            key={theme.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setLocalSelectedPresetId(theme.id);
                              onApplyPreset(theme.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setLocalSelectedPresetId(theme.id);
                                onApplyPreset(theme.id);
                              }
                            }}
                            className={`p-2.5 rounded-xl text-left transition-all flex flex-col justify-between space-y-2 border relative group cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                              isSelected
                                ? 'bg-amber-500/10 border-amber-500 shadow-md ring-1 ring-amber-500/30'
                                : isFavorited
                                ? 'bg-slate-950/90 border-amber-500/30 hover:border-amber-500/60 shadow-sm'
                                : 'bg-slate-950/60 hover:bg-slate-800/60 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center space-x-1.5 min-w-0 pr-1">
                                <span className={`text-xs font-bold truncate ${isSelected ? 'text-amber-300' : 'text-white'}`}>
                                  {theme.name}
                                </span>
                                {isFavorited && (
                                  <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1 py-0.2 rounded shrink-0">
                                    Pinned
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center space-x-1 shrink-0">
                                {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 stroke-[3]" />}
                                <button
                                  type="button"
                                  onClick={e => toggleFavoritePreset(theme.id, e)}
                                  className={`p-1 rounded-md transition-all ${
                                    isFavorited
                                      ? 'text-amber-400 hover:bg-amber-400/20 scale-105'
                                      : 'text-slate-500 hover:text-amber-400 hover:bg-slate-800 opacity-60 group-hover:opacity-100'
                                  }`}
                                  title={isFavorited ? 'Unpin favorite preset' : 'Pin to top (Favorite)'}
                                  aria-label={isFavorited ? 'Unpin favorite preset' : 'Pin to top (Favorite)'}
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      isFavorited ? 'fill-amber-400 text-amber-400' : 'text-current'
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>

                            {/* Preview Box */}
                            <div className="w-full bg-slate-950 rounded-lg p-1.5 border border-slate-800/80 flex items-center justify-center space-x-1 min-h-[34px]">
                              <span
                                className="text-xs font-black uppercase px-1 rounded"
                                style={{
                                  color: activeColor,
                                  backgroundColor: theme.style.activeWordBgColor || 'transparent',
                                  textShadow: theme.style.shadowColor ? `0 0 6px ${theme.style.shadowColor}` : 'none',
                                }}
                              >
                                CAPTION
                              </span>
                              <span className="text-xs font-semibold opacity-75" style={{ color: inactiveColor }}>
                                style
                              </span>
                            </div>

                            <p className="text-[10px] text-slate-400 leading-tight line-clamp-1">
                              {theme.description}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: STYLE & TYPOGRAPHY */}
        {activeTab === 'style' && (
          <div className="space-y-3.5">
            {/* Smart Auto-Caption Highlight Banner */}
            {onSmartHighlight && (
              <div className="bg-gradient-to-r from-amber-500/10 via-slate-950 to-amber-500/5 p-3 rounded-xl border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300 flex items-center space-x-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Auto-Highlight Key Phrases</span>
                  </span>
                  {onClearHighlights && (
                    <button
                      onClick={onClearHighlights}
                      className="text-[10px] text-slate-400 hover:text-slate-200 underline font-semibold"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center space-x-1">
                    {HIGHLIGHT_COLOR_PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => setSelectedHighlightColor(preset.hex)}
                        className={`w-5 h-5 rounded-full transition-transform border ${
                          selectedHighlightColor === preset.hex ? 'scale-125 border-white ring-1 ring-amber-400' : 'border-transparent opacity-80'
                        }`}
                        style={{ backgroundColor: preset.hex }}
                        title={preset.name}
                      />
                    ))}
                  </div>

                  <button
                    onClick={() => onSmartHighlight(selectedHighlightColor)}
                    className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] rounded-lg shadow transition-all active:scale-95"
                  >
                    Highlight
                  </button>
                </div>
              </div>
            )}

            {/* Google Font Picker */}
            <GoogleFontPicker
              currentFontFamily={style.fontFamily}
              onSelectFont={fontFamily => onChangeStyle({ fontFamily })}
            />

            {/* Colors: Active & Inactive */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Active Word Color</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={style.activeWordColor}
                    onChange={e => onChangeStyle({ activeWordColor: e.target.value })}
                    className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent"
                  />
                  <span className="text-xs font-mono font-bold uppercase">{style.activeWordColor}</span>
                </div>
              </div>

              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Inactive Word Color</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={style.inactiveWordColor}
                    onChange={e => onChangeStyle({ inactiveWordColor: e.target.value })}
                    className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent"
                  />
                  <span className="text-xs font-mono font-bold uppercase">{style.inactiveWordColor}</span>
                </div>
              </div>
            </div>

            {/* Font Size & Words Per Line */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-300">Font Size</span>
                  <span className="text-amber-400 font-mono font-bold">{style.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={24}
                  max={84}
                  value={style.fontSize}
                  onChange={e => onChangeStyle({ fontSize: parseInt(e.target.value, 10) })}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-300">Words Per Line</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map(num => (
                    <button
                      key={num}
                      onClick={() => onChangeStyle({ maxWordsPerLine: num })}
                      className={`py-1 rounded-lg text-xs font-bold transition-colors ${
                        style.maxWordsPerLine === num
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {num} {num === 1 ? 'Word' : 'Words'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Text Casing & Background Pill */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Text Casing</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['uppercase', 'capitalize', 'none'] as TextTransform[]).map(t => (
                    <button
                      key={t}
                      onClick={() => onChangeStyle({ textTransform: t })}
                      className={`py-1 rounded-md text-[10px] font-bold capitalize transition-colors ${
                        style.textTransform === t
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {t === 'none' ? 'Normal' : t === 'uppercase' ? 'UP' : 'Cap'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 space-y-1 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-400">Background Pill</label>
                  <input
                    type="checkbox"
                    checked={style.useBackgroundPill}
                    onChange={e => onChangeStyle({ useBackgroundPill: e.target.checked })}
                    className="w-3.5 h-3.5 rounded accent-amber-500 cursor-pointer"
                  />
                </div>
                {style.useBackgroundPill && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-400">Color</span>
                    <input
                      type="color"
                      value={style.backgroundColor || '#000000'}
                      onChange={e => onChangeStyle({ backgroundColor: e.target.value })}
                      className="w-5 h-5 rounded border-0 cursor-pointer bg-transparent"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: MOTION & POSITION */}
        {activeTab === 'motion' && (
          <div className="space-y-3.5">
            {/* Highlight Animation Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Animation Style</label>
                <div className="flex items-center space-x-1">
                  <span className="text-[10px] text-amber-400 font-mono font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    {ANIMATIONS.find(a => a.value === style.animationType)?.label || 'Pop Spring'}
                  </span>
                </div>
              </div>

              {/* Search & Category Filter Header */}
              <div className="space-y-1.5">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search 35+ animations..."
                    value={animSearch}
                    onChange={e => setAnimSearch(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-8 pr-7 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
                  />
                  {animSearch && (
                    <button
                      onClick={() => setAnimSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs px-1"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Category Pills */}
                <div className="grid grid-cols-5 gap-1 bg-slate-950/60 p-1 rounded-lg border border-slate-800/80">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'viral', label: '🔥 Viral' },
                    { id: 'cinematic', label: '✨ Luxe' },
                    { id: 'cyber', label: '⚡ Cyber' },
                    { id: 'creative', label: '🎨 FX' },
                  ].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setAnimCategory(cat.id as any)}
                      className={`py-1 px-1 rounded-md text-[10px] font-bold transition-all truncate text-center ${
                        animCategory === cat.id
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Animation Cards Grid */}
              <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-0.5 custom-scrollbar">
                {ANIMATIONS.filter(anim => {
                  if (animCategory !== 'all' && anim.category !== animCategory) return false;
                  if (animSearch.trim()) {
                    const q = animSearch.toLowerCase();
                    return anim.label.toLowerCase().includes(q) || anim.desc.toLowerCase().includes(q);
                  }
                  return true;
                }).map(anim => (
                  <button
                    key={anim.value}
                    onClick={() => onChangeStyle({ animationType: anim.value })}
                    className={`p-2 rounded-xl text-left border transition-all flex items-center justify-between group ${
                      style.animationType === anim.value
                        ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 ring-1 ring-amber-500/30'
                        : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start space-x-1.5 min-w-0 flex-1">
                      <span className="text-base shrink-0 leading-tight group-hover:scale-110 transition-transform">
                        {anim.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1">
                          <span className="text-xs font-bold leading-tight truncate">{anim.label}</span>
                          {anim.badge && (
                            <span
                              className={`text-[8px] font-black px-1 py-0.2 rounded border shrink-0 ${
                                anim.badge === 'PRO'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : anim.badge === 'HOT'
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              }`}
                            >
                              {anim.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] text-slate-400 line-clamp-1">{anim.desc}</div>
                      </div>
                    </div>
                    {style.animationType === anim.value && (
                      <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-1" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Word Scale Boost Slider */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-slate-300">
                <span>Active Word Scale Boost</span>
                <span className="font-mono text-amber-400 font-bold">
                  {((style.activeScaleFactor || 1.2) * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={1.05}
                max={1.5}
                step={0.02}
                value={style.activeScaleFactor || 1.2}
                onChange={e => onChangeStyle({ activeScaleFactor: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-[9px] text-slate-500">
                <span>Subtle (105%)</span>
                <span>Default (120%)</span>
                <span>Max Pop (150%)</span>
              </div>
            </div>

            {/* Animation Speed & Kinetic Dynamics */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-slate-300">
                <span>Animation Speed Multiplier</span>
                <span className="font-mono text-amber-400 font-bold">
                  {(style.animationSpeedMultiplier ?? 1.0).toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.5}
                step={0.1}
                value={style.animationSpeedMultiplier ?? 1.0}
                onChange={e => onChangeStyle({ animationSpeedMultiplier: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-[9px] text-slate-500">
                <span>Slow (0.5x)</span>
                <span>Normal (1.0x)</span>
                <span>Snappy (2.5x)</span>
              </div>
            </div>

            {/* Glow & Aura Intensity */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-slate-300">
                <span>Neon Glow & Aura Intensity</span>
                <span className="font-mono text-amber-400 font-bold">
                  {((style.glowIntensity ?? 1.0) * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0.0}
                max={2.5}
                step={0.1}
                value={style.glowIntensity ?? 1.0}
                onChange={e => onChangeStyle({ glowIntensity: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-[9px] text-slate-500">
                <span>Off (0%)</span>
                <span>Balanced (100%)</span>
                <span>Hyper Glow (250%)</span>
              </div>
            </div>

            {/* Particle & Sparkle FX Toggle */}
            <div className="flex items-center justify-between bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Kinetic Particles & Overlays</div>
                  <div className="text-[10px] text-slate-400">Sparkles, confetti, coins, embers, and lightning arcs</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={style.particleFxEnabled ?? true}
                onChange={e => onChangeStyle({ particleFxEnabled: e.target.checked })}
                className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Auto Emoji Badges Toggle */}
            <div className="flex items-center justify-between bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center space-x-2">
                <Smile className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Auto Emoji Badges</div>
                  <div className="text-[10px] text-slate-400">Insert emojis for keywords (🔥, 💰, 🚀)</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={style.emojiEnabled}
                onChange={e => onChangeStyle({ emojiEnabled: e.target.checked, autoEmojiKeywords: e.target.checked })}
                className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Speaker Diarization Name Badges Toggle */}
            <div className="flex items-center justify-between bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center space-x-2">
                <Mic className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Speaker Name Badges</div>
                  <div className="text-[10px] text-slate-400">Display [HOST], [GUEST], [SPEAKER] pills above captions</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={style.showSpeakerBadge ?? true}
                onChange={e => onChangeStyle({ showSpeakerBadge: e.target.checked })}
                className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Quick 9-Point Alignment Grid */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span>Caption Alignment Grid</span>
                <span className="text-[10px] text-amber-400 font-mono font-bold">
                  X:{style.positionXPercent ?? 50}% Y:{style.positionYPercent ?? 75}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'Top-L', x: 20, y: 20 },
                  { label: 'Top-C', x: 50, y: 20 },
                  { label: 'Top-R', x: 80, y: 20 },
                  { label: 'Mid-L', x: 20, y: 50 },
                  { label: 'Center', x: 50, y: 50 },
                  { label: 'Mid-R', x: 80, y: 50 },
                  { label: 'Bot-L', x: 20, y: 75 },
                  { label: 'Bot-C', x: 50, y: 75 },
                  { label: 'Bot-R', x: 80, y: 75 },
                ].map(pt => {
                  const isActive =
                    Math.abs((style.positionXPercent ?? 50) - pt.x) < 10 &&
                    Math.abs((style.positionYPercent ?? 75) - pt.y) < 10;
                  return (
                    <button
                      key={pt.label}
                      onClick={() => onChangeStyle({ positionXPercent: pt.x, positionYPercent: pt.y })}
                      className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {pt.label}
                    </button>
                  );
                })}
              </div>

              {/* Fine Sliders */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                    <span>Horizontal (X)</span>
                    <span className="font-mono text-amber-400">{style.positionXPercent ?? 50}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={95}
                    value={style.positionXPercent ?? 50}
                    onChange={e => onChangeStyle({ positionXPercent: parseInt(e.target.value, 10) })}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                    <span>Vertical (Y)</span>
                    <span className="font-mono text-amber-400">{style.positionYPercent ?? 75}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={95}
                    value={style.positionYPercent ?? 75}
                    onChange={e => onChangeStyle({ positionYPercent: parseInt(e.target.value, 10) })}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: VIDEO & AUDIO TOOLS */}
        {activeTab === 'video' && (
          <div className="space-y-3.5">
            {/* 1. Framing Mode */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                  <Crop className="w-3.5 h-3.5 text-amber-400" />
                  <span>Video Framing Mode</span>
                </span>
                <span className="text-[10px] text-amber-400 font-mono font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  16:9 → 9:16
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'Fill Crop', value: 'cover', icon: '📐' },
                  { label: 'Fit + Blur', value: 'fit_blur', icon: '✨' },
                  { label: 'Dual Stack', value: 'dual_stack', icon: '⚔️' },
                ].map(mode => {
                  const isActive = (transform?.framingMode || 'cover') === mode.value;
                  return (
                    <button
                      key={mode.value}
                      onClick={() =>
                        onChangeTransform?.({
                          framingMode: mode.value as VideoTransformSettings['framingMode'],
                        })
                      }
                      className={`p-2 rounded-xl text-center transition-all border ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="text-sm block">{mode.icon}</span>
                      <span className="text-[10px] font-bold block mt-0.5">{mode.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* AI Auto-Crop Action */}
              <button
                onClick={handleRunSmartCrop}
                disabled={isAnalyzingCrop}
                className="w-full py-1.5 px-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-[11px] transition-all shadow flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                <Crop className={`w-3.5 h-3.5 ${isAnalyzingCrop ? 'animate-spin' : ''}`} />
                <span>{isAnalyzingCrop ? 'Scanning Frame...' : '🎯 Auto-Detect & Center Subject'}</span>
              </button>

              {cropScanResult && (
                <div className="text-[10px] bg-slate-900 p-1.5 rounded-lg border border-slate-800 text-slate-300 flex items-center justify-between">
                  <span className="truncate">{cropScanResult.description}</span>
                  <span className="text-emerald-400 font-bold shrink-0 ml-1">Centered ✓</span>
                </div>
              )}
            </div>

            {/* 2. Audio Normalizer (LUFS) */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Audio Auto-Normalizer</span>
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={audioSettings?.autoNormalize ?? true}
                    onChange={e => onChangeAudioSettings?.({ autoNormalize: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-3.5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-amber-500" />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-1">
                {[
                  { label: 'TikTok (-14)', lufs: -14 },
                  { label: 'Podcast (-16)', lufs: -16 },
                  { label: 'Viral (-12)', lufs: -12 },
                ].map(tgt => (
                  <button
                    key={tgt.lufs}
                    onClick={() => onChangeAudioSettings?.({ targetLufs: tgt.lufs })}
                    className={`py-1 rounded-lg text-[10px] font-bold border transition-all text-center ${
                      (audioSettings?.targetLufs ?? -14) === tgt.lufs
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {tgt.label}
                  </button>
                ))}
              </div>

              {/* Master Volume */}
              <div className="space-y-1 pt-1 border-t border-slate-800/80">
                <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                  <span>Master Volume</span>
                  <span className="font-mono text-amber-400">{audioSettings?.videoVolume ?? 100}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={audioSettings?.videoVolume ?? 100}
                  onChange={e => onChangeAudioSettings?.({ videoVolume: parseInt(e.target.value, 10) })}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
            </div>

            {/* 3. Voice Clarity & Audio EQ Enhancer */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                  <Mic className="w-3.5 h-3.5 text-amber-400" />
                  <span>Voice Clarity & EQ Booster</span>
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={audioSettings?.voiceClarity ?? false}
                    onChange={e => onChangeAudioSettings?.({ voiceClarity: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-3.5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-amber-500" />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <label className="flex items-center space-x-2 bg-slate-900/90 p-2 rounded-lg border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={audioSettings?.voiceClarity ?? false}
                    onChange={e => onChangeAudioSettings?.({ voiceClarity: e.target.checked })}
                    className="rounded border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <div>
                    <div className="font-semibold text-slate-200">Vocal Presence</div>
                    <div className="text-[9px] text-slate-400">Boosts 3.5kHz clarity</div>
                  </div>
                </label>

                <label className="flex items-center space-x-2 bg-slate-900/90 p-2 rounded-lg border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={audioSettings?.bassBoost ?? false}
                    onChange={e => onChangeAudioSettings?.({ bassBoost: e.target.checked })}
                    className="rounded border-slate-700 text-amber-500 focus:ring-0"
                  />
                  <div>
                    <div className="font-semibold text-slate-200">Bass Warmth</div>
                    <div className="text-[9px] text-slate-400">120Hz chest punch</div>
                  </div>
                </label>
              </div>
            </div>

            {/* 4. Smart Sound Effects (SFX) on Highlight Trigger Words */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                  <Radio className="w-3.5 h-3.5 text-amber-400" />
                  <span>Highlight Sound Effects (SFX)</span>
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={audioSettings?.sfxEnabled ?? false}
                    onChange={e => onChangeAudioSettings?.({ sfxEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-3.5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-amber-500" />
                </label>
              </div>

              {audioSettings?.sfxEnabled && (
                <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
                  {/* SFX Preset Selector */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <span>Sound Preset</span>
                      <button
                        onClick={() => {
                          const preset = audioSettings?.sfxPreset || 'pop';
                          const vol = (audioSettings?.sfxVolume ?? 70) / 100;
                          playSfx(preset, vol);
                        }}
                        className="text-amber-400 hover:text-amber-300 flex items-center space-x-1 text-[10px] font-semibold"
                      >
                        <Volume1 className="w-3 h-3" />
                        <span>Audition</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          { label: 'Pop', value: 'pop', icon: '🫧' },
                          { label: 'Whoosh', value: 'whoosh', icon: '💨' },
                          { label: 'Bell Ding', value: 'ding', icon: '🔔' },
                          { label: 'Sub Boom', value: 'boom', icon: '💥' },
                          { label: 'Click', value: 'click', icon: '📸' },
                          { label: 'Cash', value: 'cash', icon: '💰' },
                          { label: 'Laser', value: 'laser', icon: '⚡' },
                          { label: 'Glitch', value: 'glitch', icon: '👾' },
                        ] as const
                      ).map(s => {
                        const isSelected = (audioSettings?.sfxPreset || 'pop') === s.value;
                        return (
                          <button
                            key={s.value}
                            onClick={() => {
                              onChangeAudioSettings?.({ sfxPreset: s.value as SfxType });
                              const vol = (audioSettings?.sfxVolume ?? 70) / 100;
                              playSfx(s.value as SfxType, vol);
                            }}
                            className={`py-1 px-1 rounded-lg text-[10px] font-bold border transition-all text-center ${
                              isSelected
                                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <span className="mr-0.5">{s.icon}</span>
                            <span>{s.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* SFX Volume */}
                  <div className="space-y-1 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-300">
                      <span>SFX Volume</span>
                      <span className="font-mono text-amber-400">{audioSettings?.sfxVolume ?? 70}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={audioSettings?.sfxVolume ?? 70}
                      onChange={e => onChangeAudioSettings?.({ sfxVolume: parseInt(e.target.value, 10) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>

                  {/* Trigger Filter */}
                  <label className="flex items-center space-x-2 bg-slate-900/80 p-2 rounded-lg border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={audioSettings?.sfxOnEmphasizedOnly ?? true}
                      onChange={e => onChangeAudioSettings?.({ sfxOnEmphasizedOnly: e.target.checked })}
                      className="rounded border-slate-700 text-amber-500 focus:ring-0"
                    />
                    <span className="text-[11px] font-medium text-slate-300">
                      Play on Emphasized / Highlight Words Only
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* 3. Watermark Overlay */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                  <AtSign className="w-3.5 h-3.5 text-amber-400" />
                  <span>Channel Watermark & Handle</span>
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={watermark?.enabled || false}
                    onChange={e => onChangeWatermark?.({ enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-3.5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-amber-500" />
                </label>
              </div>

              {watermark?.enabled && (
                <div className="space-y-2.5 pt-1">
                  <input
                    type="text"
                    value={watermark.text}
                    onChange={e => onChangeWatermark?.({ text: e.target.value })}
                    placeholder="@yourhandle"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                  />

                  {/* Watermark Position */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Position</label>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { label: 'Top-L', value: 'top-left', x: 12, y: 8 },
                        { label: 'Top-R', value: 'top-right', x: 88, y: 8 },
                        { label: 'Bot-L', value: 'bottom-left', x: 12, y: 92 },
                        { label: 'Bot-R', value: 'bottom-right', x: 88, y: 92 },
                      ].map(pos => (
                        <button
                          key={pos.value}
                          onClick={() =>
                            onChangeWatermark?.({
                              position: pos.value as WatermarkSettings['position'],
                              positionXPercent: pos.x,
                              positionYPercent: pos.y,
                            })
                          }
                          className={`py-1 rounded-md text-[10px] font-bold border transition-all ${
                            watermark.position === pos.value
                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Watermark Opacity Slider */}
                  <div className="space-y-1 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-300">
                      <span>Watermark Opacity</span>
                      <span className="font-mono text-amber-400 font-bold">
                        {Math.round((watermark.opacity ?? 0.85) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      value={watermark.opacity ?? 0.85}
                      onChange={e => onChangeWatermark?.({ opacity: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500">
                      <span>Subtle (10%)</span>
                      <span>Balanced (85%)</span>
                      <span>Solid (100%)</span>
                    </div>
                  </div>

                  {/* Watermark Font Size Slider */}
                  <div className="space-y-1 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-300">
                      <span>Watermark Font Size</span>
                      <span className="font-mono text-amber-400 font-bold">{watermark.fontSize || 28}px</span>
                    </div>
                    <input
                      type="range"
                      min={16}
                      max={56}
                      step={2}
                      value={watermark.fontSize || 28}
                      onChange={e => onChangeWatermark?.({ fontSize: parseInt(e.target.value, 10) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>

                  {/* Watermark Font Selection */}
                  <div className="space-y-1.5 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                        <Type className="w-3 h-3 text-amber-400" />
                        <span>Watermark Font</span>
                      </label>
                      <button
                        onClick={() => setShowWatermarkFontPicker(!showWatermarkFontPicker)}
                        className="text-[10px] font-bold text-amber-400 hover:text-amber-300 underline"
                      >
                        {showWatermarkFontPicker ? 'Close Browser' : 'Browse All Fonts'}
                      </button>
                    </div>

                    {/* Quick Popular Font Pills */}
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { label: 'Jakarta', family: '"Plus Jakarta Sans", sans-serif' },
                        { label: 'Montserrat', family: 'Montserrat, sans-serif' },
                        { label: 'Outfit', family: 'Outfit, sans-serif' },
                        { label: 'Bebas', family: '"Bebas Neue", Impact, sans-serif' },
                        { label: 'Space', family: '"Space Grotesk", sans-serif' },
                        { label: 'Syne', family: 'Syne, sans-serif' },
                      ].map(f => {
                        const isCurrent = (watermark.fontFamily || '').includes(f.label);
                        return (
                          <button
                            key={f.label}
                            onClick={() => onChangeWatermark?.({ fontFamily: f.family })}
                            className={`py-1 px-1.5 rounded text-[10px] font-bold border transition-all truncate text-center ${
                              isCurrent
                                ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            {f.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Expandable Google Font Picker for Watermark */}
                    {showWatermarkFontPicker && (
                      <div className="pt-2 border-t border-slate-800 mt-2">
                        <GoogleFontPicker
                          currentFontFamily={watermark.fontFamily || '"Plus Jakarta Sans", Montserrat, sans-serif'}
                          onSelectFont={family => onChangeWatermark?.({ fontFamily: family })}
                          title="Watermark Google Font"
                          compact={true}
                        />
                      </div>
                    )}
                  </div>

                  {/* Pill Background & Drop Shadow Toggles */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="flex items-center space-x-2 bg-slate-900/90 p-2 rounded-lg border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={watermark.showBackgroundPill ?? true}
                        onChange={e => onChangeWatermark?.({ showBackgroundPill: e.target.checked })}
                        className="rounded border-slate-700 text-amber-500 focus:ring-0"
                      />
                      <span className="text-[11px] font-medium text-slate-300">Pill Background</span>
                    </label>

                    <label className="flex items-center space-x-2 bg-slate-900/90 p-2 rounded-lg border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={watermark.showShadow ?? true}
                        onChange={e => onChangeWatermark?.({ showShadow: e.target.checked })}
                        className="rounded border-slate-700 text-amber-500 focus:ring-0"
                      />
                      <span className="text-[11px] font-medium text-slate-300">Drop Shadow</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Viral Retention Progress Bar */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-bold text-slate-300">Retention Progress Bar</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={progressBar?.enabled ?? false}
                    onChange={e => onChangeProgressBar?.({ enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {progressBar?.enabled && (
                <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
                  {/* Position Toggle */}
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                    <span>Position</span>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => onChangeProgressBar?.({ position: 'top' })}
                        className={`py-0.5 px-2.5 rounded text-[10px] font-bold border transition-all ${
                          progressBar.position === 'top'
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        Top
                      </button>
                      <button
                        onClick={() => onChangeProgressBar?.({ position: 'bottom' })}
                        className={`py-0.5 px-2.5 rounded text-[10px] font-bold border transition-all ${
                          progressBar.position !== 'top'
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        Bottom
                      </button>
                    </div>
                  </div>

                  {/* Height Slider */}
                  <div className="space-y-1 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-300">
                      <span>Bar Height</span>
                      <span className="font-mono text-amber-400 font-bold">{progressBar.height || 12}px</span>
                    </div>
                    <input
                      type="range"
                      min={4}
                      max={28}
                      step={2}
                      value={progressBar.height || 12}
                      onChange={e => onChangeProgressBar?.({ height: parseInt(e.target.value, 10) })}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>

                  {/* Color Gradient Presets */}
                  <div className="space-y-1.5 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Color Style</span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { label: 'Gold Amber', color: '#F59E0B', secondaryColor: '#EF4444' },
                        { label: 'Cyber Cyan', color: '#06B6D4', secondaryColor: '#3B82F6' },
                        { label: 'Neon Lime', color: '#10B981', secondaryColor: '#84CC16' },
                        { label: 'Pink Glow', color: '#EC4899', secondaryColor: '#8B5CF6' },
                      ].map(p => {
                        const isMatch = progressBar.color === p.color;
                        return (
                          <button
                            key={p.label}
                            onClick={() => onChangeProgressBar?.({ color: p.color, secondaryColor: p.secondaryColor })}
                            className={`py-1 px-1 rounded text-[9px] font-bold border transition-all text-center truncate ${
                              isMatch
                                ? 'border-amber-400 text-white font-extrabold shadow-sm'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                            style={{
                              background: `linear-gradient(90deg, ${p.color}, ${p.secondaryColor})`,
                              color: '#000000',
                            }}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Glow & Timer Options */}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center space-x-2 bg-slate-900/90 p-2 rounded-lg border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={progressBar.glow ?? true}
                        onChange={e => onChangeProgressBar?.({ glow: e.target.checked })}
                        className="rounded border-slate-700 text-amber-500 focus:ring-0"
                      />
                      <span className="text-[11px] font-medium text-slate-300">Neon Glow</span>
                    </label>

                    <label className="flex items-center space-x-2 bg-slate-900/90 p-2 rounded-lg border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={progressBar.showTimerText ?? false}
                        onChange={e => onChangeProgressBar?.({ showTimerText: e.target.checked })}
                        className="rounded border-slate-700 text-amber-500 focus:ring-0"
                      />
                      <span className="text-[11px] font-medium text-slate-300">Timer Overlay</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* 5. Color Grading Filters */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                  <span>Color Grading</span>
                </span>
                <button
                  onClick={() => onChangeFilter({ brightness: 100, contrast: 100, saturation: 100, sepia: 0, hueRotate: 0, blur: 0 })}
                  className="text-[10px] text-slate-400 hover:text-slate-200 underline font-semibold"
                >
                  Reset
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Bright</span>
                    <span className="font-mono text-amber-400">{filter.brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={150}
                    value={filter.brightness}
                    onChange={e => onChangeFilter({ brightness: parseInt(e.target.value, 10) })}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Contrast</span>
                    <span className="font-mono text-amber-400">{filter.contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={160}
                    value={filter.contrast}
                    onChange={e => onChangeFilter({ contrast: parseInt(e.target.value, 10) })}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Sat</span>
                    <span className="font-mono text-amber-400">{filter.saturation}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={180}
                    value={filter.saturation}
                    onChange={e => onChangeFilter({ saturation: parseInt(e.target.value, 10) })}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* 5. Speed Multiplier */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                <Gauge className="w-3.5 h-3.5 text-amber-400" />
                <span>Video Speed Multiplier</span>
              </span>
              <div className="grid grid-cols-5 gap-1">
                {[0.75, 1.0, 1.25, 1.5, 2.0].map(spd => (
                  <button
                    key={spd}
                    onClick={() => onChangeTransform?.({ playbackRate: spd })}
                    className={`py-1 rounded-md text-[10px] font-bold border transition-all ${
                      (transform?.playbackRate || 1.0) === spd
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
