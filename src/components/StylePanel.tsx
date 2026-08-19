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
  Lock,
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
  isPro?: boolean;
  onRequestUpgrade?: (reason: string) => void;
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
  isPro = false,
  onRequestUpgrade,
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'style' | 'motion' | 'video'>('presets');
  const [presetCategory, setPresetCategory] = useState<'all' | 'favorites' | 'viral' | 'gaming' | 'neon' | 'minimal'>('all');
  const [localSelectedPresetId, setLocalSelectedPresetId] = useState<string>('hormozi_viral');
  const [selectedHighlightColor, setSelectedHighlightColor] = useState('#FFE600');
  const [showWatermarkFontPicker, setShowWatermarkFontPicker] = useState(false);

  // Shared paywall gate: these caption/audio/branding features are all
  // Pro-only. Keep this list in sync with the copy in UpgradeModal.tsx.
  const requireProOrPrompt = (reason: string): boolean => {
    if (isPro) return true;
    onRequestUpgrade?.(reason);
    return false;
  };

  const ProBadge: React.FC = () => (
    <span className="inline-flex items-center space-x-0.5 bg-amber-500/15 text-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded-md border border-amber-500/30 ml-1.5">
      <Lock className="w-2.5 h-2.5" />
      <span>PRO</span>
    </span>
  );

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

  const ANIMATIONS: { label: string; value: AnimationType; desc: string; icon: string }[] = [
    { label: 'Pop Spring', value: 'pop', desc: 'Snappy spring zoom overshoot & settle', icon: '💥' },
    { label: 'Bounce Jump', value: 'bounce', desc: 'Vertical kinetic jump with squash & stretch', icon: '🦘' },
    { label: 'Pulse Bounce', value: 'bounce_pulse', desc: 'Classic scale-based sine pulse bounce', icon: '💓' },
    { label: 'Rubber Band', value: 'rubber_band', desc: 'Jelly elastic stretch & rebound', icon: '🪀' },
    { label: 'Impact Zoom', value: 'zoom_in', desc: 'Punch-in drop zoom from large to fit', icon: '🔍' },
    { label: 'Spin Drop', value: 'spin_in', desc: '360 kinetic rotation drop & snap', icon: '💫' },
    { label: 'Bloom Blur', value: 'blur_in', desc: 'Glow blur bloom resolving to sharp focus', icon: '🔮' },
    { label: 'Float Drift', value: 'float_drift', desc: 'Continuous organic floating tilt', icon: '🍃' },
    { label: 'Heartbeat', value: 'heartbeat', desc: 'Double rhythmic throb pulse', icon: '❤️' },
    { label: 'Spectrum Wave', value: 'color_cycle', desc: 'Dynamic rainbow hue spectrum cycling', icon: '🌈' },
    { label: 'Karaoke Wipe', value: 'karaoke', desc: 'Smooth left-to-right color fill sweep', icon: '🎤' },
    { label: 'Bento Box', value: 'bento_box', desc: 'Vibrant highlight pill tag with contrast', icon: '🏷️' },
    { label: 'Neon Bloom', value: 'neon_glow', desc: 'Pulsing multi-layer cyber glow aura', icon: '⚡' },
    { label: 'Typewriter', value: 'typewriter', desc: 'Character-by-character live speech reveal', icon: '⌨️' },
    { label: 'Kinetic Slide', value: 'slide_up', desc: 'Smooth upward float & spring rise', icon: '🚀' },
    { label: 'Cyber Glitch', value: 'glitch', desc: 'RGB chromatic aberration jitter', icon: '👾' },
    { label: 'Impact Shake', value: 'shake', desc: 'High-energy tremor for punchlines', icon: '📳' },
    { label: 'Harmonic Wave', value: 'wave', desc: 'Continuous floating sine wave motion', icon: '🌊' },
    { label: '3D Flip In', value: 'flip', desc: '3D card flip rotation on word entry', icon: '🔄' },
    { label: 'Cinematic Fade', value: 'fade_in', desc: 'Soft opacity transition per word', icon: '🎬' },
    { label: 'Voltage Flash', value: 'flash', desc: 'Rapid white strobe flash on speech attack', icon: '⚡' },
    { label: 'Minimalist', value: 'minimal', desc: 'Clean micro-scale & underline highlight', icon: '✨' },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col h-full overflow-hidden shadow-xl">
      {/* 4 Crisp Consolidated Tabs */}
      <div className="grid grid-cols-4 bg-slate-950/80 p-1 rounded-xl border border-slate-800 mb-3 gap-1">
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

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-slate-200 custom-scrollbar">
        {/* TAB 1: PRESET GALLERY */}
        {activeTab === 'presets' && (
          <div className="space-y-3">
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
                { id: 'neon', label: '⚡ Neon' },
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
              /* 2-Column Visual Preset Cards (Pinned favorites sorted to top) */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_THEMES.filter(theme => {
                  if (presetCategory === 'favorites') return favoritePresetIds.includes(theme.id);
                  if (presetCategory === 'viral') return ['hormozi_viral', 'beast_red_punch', 'toktik_viral_red', 'volcano_orange_pop'].includes(theme.id);
                  if (presetCategory === 'gaming') return ['gamer_hype_neon', 'gamer_clutch_gold', 'bento_box_gold'].includes(theme.id);
                  if (presetCategory === 'neon') return ['synthwave_cyber_purple', 'shorts_electric_green', 'reels_cyan_gradient', 'karaoke_pink_fire'].includes(theme.id);
                  if (presetCategory === 'minimal') return ['minimal_clean_white', 'dark_stealth_amber', 'golden_luxe_aura'].includes(theme.id);
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
                    {!isPro && <ProBadge />}
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
                    onClick={() => {
                      if (!requireProOrPrompt('Auto-Highlight Key Phrases is a CapSnap Pro feature.')) return;
                      onSmartHighlight(selectedHighlightColor);
                    }}
                    className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] rounded-lg shadow transition-all active:scale-95 flex items-center space-x-1"
                  >
                    {!isPro && <Lock className="w-2.5 h-2.5" />}
                    <span>Highlight</span>
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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Animation Style</label>
                <span className="text-[10px] text-amber-400 font-mono font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  {ANIMATIONS.find(a => a.value === style.animationType)?.label || 'Pop Spring'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-0.5 custom-scrollbar">
                {ANIMATIONS.map(anim => (
                  <button
                    key={anim.value}
                    onClick={() => onChangeStyle({ animationType: anim.value })}
                    className={`p-2 rounded-xl text-left border transition-all flex items-center justify-between ${
                      style.animationType === anim.value
                        ? 'bg-amber-500/10 border-amber-500/60 text-amber-300'
                        : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-start space-x-1.5 min-w-0">
                      <span className="text-sm shrink-0 leading-tight">{anim.icon}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold leading-tight truncate">{anim.label}</div>
                        <div className="text-[9px] text-slate-400 line-clamp-1">{anim.desc}</div>
                      </div>
                    </div>
                    {style.animationType === anim.value && <Check className="w-3 h-3 text-amber-400 shrink-0 ml-1" />}
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

            {/* Auto Emoji Badges Toggle */}
            <div className={`flex items-center justify-between bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 ${!isPro ? 'opacity-90' : ''}`}>
              <div className="flex items-center space-x-2">
                <Smile className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-200 flex items-center">
                    <span>Auto Emoji Badges</span>
                    {!isPro && <ProBadge />}
                  </div>
                  <div className="text-[10px] text-slate-400">Insert emojis for keywords (🔥, 💰, 🚀)</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isPro && style.emojiEnabled}
                onChange={e => {
                  if (!requireProOrPrompt('Auto Emoji Badges is a CapSnap Pro feature.')) return;
                  onChangeStyle({ emojiEnabled: e.target.checked, autoEmojiKeywords: e.target.checked });
                }}
                className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Speaker Diarization Name Badges Toggle */}
            <div className={`flex items-center justify-between bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 ${!isPro ? 'opacity-90' : ''}`}>
              <div className="flex items-center space-x-2">
                <Mic className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-200 flex items-center">
                    <span>Speaker Name Badges</span>
                    {!isPro && <ProBadge />}
                  </div>
                  <div className="text-[10px] text-slate-400">Display [HOST], [GUEST], [SPEAKER] pills above captions</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isPro && (style.showSpeakerBadge ?? true)}
                onChange={e => {
                  if (!requireProOrPrompt('Speaker Name Badges is a CapSnap Pro feature.')) return;
                  onChangeStyle({ showSpeakerBadge: e.target.checked });
                }}
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
                  {!isPro && <ProBadge />}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPro && (audioSettings?.voiceClarity ?? false)}
                    onChange={e => {
                      if (!requireProOrPrompt('Voice Clarity is a CapSnap Pro feature.')) return;
                      onChangeAudioSettings?.({ voiceClarity: e.target.checked });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-3.5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-amber-500" />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <label className="flex items-center space-x-2 bg-slate-900/90 p-2 rounded-lg border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPro && (audioSettings?.voiceClarity ?? false)}
                    onChange={e => {
                      if (!requireProOrPrompt('Voice Clarity is a CapSnap Pro feature.')) return;
                      onChangeAudioSettings?.({ voiceClarity: e.target.checked });
                    }}
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
                  {!isPro && <ProBadge />}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPro && (audioSettings?.sfxEnabled ?? false)}
                    onChange={e => {
                      if (!requireProOrPrompt('Highlight Sound Effects is a CapSnap Pro feature.')) return;
                      onChangeAudioSettings?.({ sfxEnabled: e.target.checked });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-3.5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-amber-500" />
                </label>
              </div>

              {isPro && audioSettings?.sfxEnabled && (
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
                  {!isPro && <ProBadge />}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPro && (watermark?.enabled || false)}
                    onChange={e => {
                      if (!requireProOrPrompt('Custom channel watermarks are a CapSnap Pro feature. Free exports always include a "Made with CapSnap" watermark.')) return;
                      onChangeWatermark?.({ enabled: e.target.checked });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-3.5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-amber-500" />
                </label>
              </div>

              {isPro && watermark?.enabled && (
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
                  <span className="text-xs font-bold text-slate-300 flex items-center">
                    <span>Retention Progress Bar</span>
                    {!isPro && <ProBadge />}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPro && (progressBar?.enabled ?? false)}
                    onChange={e => {
                      if (!requireProOrPrompt('The Retention Progress Bar is a CapSnap Pro feature.')) return;
                      onChangeProgressBar?.({ enabled: e.target.checked });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {isPro && progressBar?.enabled && (
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
