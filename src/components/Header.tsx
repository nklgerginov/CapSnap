import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Sparkles,
  FileText,
  FolderKanban,
  Save,
  RotateCcw,
  Keyboard,
  PlaySquare,
  Crown,
  MoreVertical,
  ChevronDown,
  Check,
} from 'lucide-react';
import { PlatformPreset } from '../types';

const PLATFORM_OPTIONS: { id: PlatformPreset; label: string; short: string }[] = [
  { id: 'tiktok', label: 'TikTok (9:16)', short: 'TikTok' },
  { id: 'youtube_shorts', label: 'YouTube Shorts', short: 'Shorts' },
  { id: 'instagram_reels', label: 'Instagram Reels', short: 'Reels' },
  { id: 'facebook_reels', label: 'Facebook Reels', short: 'FB Reels' },
];

interface HeaderProps {
  platformPreset: PlatformPreset;
  onSelectPlatform: (preset: PlatformPreset) => void;
  onOpenExportModal: () => void;
  onOpenSubtitleModal: () => void;
  onOpenProjectModal: () => void;
  onOpenClearModal: () => void;
  onOpenShortcutsModal?: () => void;
  onOpenUpgradeModal?: () => void;
  onLoadDemo?: () => void;
  isGeneratingDemo?: boolean;
  currentProjectName?: string;
  hasVideo: boolean;
  hasSubtitles: boolean;
  lastSavedAt?: Date | null;
  isSaved?: boolean;
  isPro?: boolean;
  aiUsesRemaining?: number;
}

/** Small hook: close a menu when the user clicks/taps outside its ref, or
 * presses Escape. Shared by the platform picker and the overflow menu below
 * so both behave identically. */
function useCloseOnOutsideClick(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);
  return ref;
}

export const Header: React.FC<HeaderProps> = ({
  platformPreset,
  onSelectPlatform,
  onOpenExportModal,
  onOpenSubtitleModal,
  onOpenProjectModal,
  onOpenClearModal,
  onOpenShortcutsModal,
  onOpenUpgradeModal,
  onLoadDemo,
  isGeneratingDemo = false,
  currentProjectName,
  hasVideo,
  hasSubtitles,
  lastSavedAt,
  isSaved = true,
  isPro = false,
  aiUsesRemaining,
}) => {
  const [isPlatformMenuOpen, setIsPlatformMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const platformMenuRef = useCloseOnOutsideClick(() => setIsPlatformMenuOpen(false));
  const moreMenuRef = useCloseOnOutsideClick(() => setIsMoreMenuOpen(false));

  const activePlatform = PLATFORM_OPTIONS.find(p => p.id === platformPreset) ?? PLATFORM_OPTIONS[0];

  return (
    <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800/90 px-3 sm:px-4 py-2 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Zone 1: Brand */}
        <div className="flex items-center space-x-2 min-w-0">
          <div className="flex items-center space-x-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black text-sm shadow-md shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="hidden sm:inline text-base font-bold text-white tracking-tight whitespace-nowrap">
              NovaCap<span className="text-amber-400"> Studio</span>
            </span>
          </div>

          {/* Save status — compact dot on mobile, label from sm up */}
          {hasSubtitles && (
            <span
              className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 transition-all ${
                isSaved
                  ? 'bg-slate-800 text-slate-400 border border-slate-700/60'
                  : 'bg-amber-500/10 text-amber-300 border border-amber-500/20 animate-pulse'
              }`}
              title={
                lastSavedAt
                  ? `Auto-saved locally at ${lastSavedAt.toLocaleTimeString()}`
                  : 'Auto-saved locally'
              }
            >
              <Save className="w-2.5 h-2.5 mr-1" />
              {isSaved ? 'Saved' : 'Saving...'}
            </span>
          )}

          {currentProjectName && (
            <button
              onClick={onOpenProjectModal}
              className="hidden xl:inline-flex items-center max-w-[140px] px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 hover:border-amber-500/50 truncate transition-colors"
              title={`Active Project: ${currentProjectName} (Click to manage)`}
            >
              <FolderKanban className="w-2.5 h-2.5 mr-1 text-amber-400 shrink-0" />
              <span className="truncate">{currentProjectName}</span>
            </button>
          )}
        </div>

        {/* Zone 2: Platform picker — a single compact dropdown at every
            width, so this is always reachable on mobile (unlike the old
            segmented control, which only ever showed up on large screens). */}
        <div className="relative shrink-0" ref={platformMenuRef}>
          <button
            onClick={() => setIsPlatformMenuOpen(v => !v)}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-950/70 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-all active:scale-95 min-h-[36px]"
            aria-haspopup="listbox"
            aria-expanded={isPlatformMenuOpen}
            title="Choose target platform & aspect ratio"
          >
            <span>{activePlatform.short}</span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isPlatformMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {isPlatformMenuOpen && (
            <div
              role="listbox"
              className="absolute left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 top-full mt-1.5 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50 py-1"
            >
              {PLATFORM_OPTIONS.map(p => (
                <button
                  key={p.id}
                  role="option"
                  aria-selected={p.id === platformPreset}
                  onClick={() => {
                    onSelectPlatform(p.id);
                    setIsPlatformMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-left transition-colors ${
                    p.id === platformPreset
                      ? 'bg-amber-500/10 text-amber-300'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>{p.label}</span>
                  {p.id === platformPreset && <Check className="w-3.5 h-3.5 text-amber-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Zone 3: Primary Actions — kept intentionally short. Everything
            secondary lives in the "More" menu instead of being hidden past
            a breakpoint, so mobile keeps every feature, just one tap deeper. */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          {/* Pro Status / Upgrade CTA — revenue-critical, always visible */}
          {isPro ? (
            <span
              className="flex items-center space-x-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40"
              title="CapSnap Pro is active on this device"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Pro</span>
            </span>
          ) : (
            onOpenUpgradeModal && (
              <button
                onClick={onOpenUpgradeModal}
                className="flex items-center space-x-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 transition-all shadow-sm active:scale-95 min-h-[36px]"
                title={
                  typeof aiUsesRemaining === 'number'
                    ? `${aiUsesRemaining} free AI transcription${aiUsesRemaining === 1 ? '' : 's'} left. Upgrade for unlimited AI, 4K exports & more.`
                    : 'Remove watermark, unlock 4K & all export formats, unlimited AI transcription'
                }
              >
                <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="hidden md:inline">Upgrade</span>
                {typeof aiUsesRemaining === 'number' && (
                  <span className="hidden lg:inline text-amber-400/70 font-normal">
                    · {aiUsesRemaining} AI left
                  </span>
                )}
              </button>
            )
          )}

          <button
            onClick={onOpenSubtitleModal}
            className="flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all shadow-sm active:scale-95 min-h-[36px]"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Captions</span>
            {hasSubtitles && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>

          <button
            onClick={onOpenExportModal}
            disabled={!hasVideo}
            className={`flex items-center space-x-1 sm:space-x-1.5 px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md min-h-[36px] ${
              hasVideo
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 active:scale-95'
                : 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-800'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          {/* Overflow menu: Projects, Try Demo, Hotkeys, Reset */}
          <div className="relative shrink-0" ref={moreMenuRef}>
            <button
              onClick={() => setIsMoreMenuOpen(v => !v)}
              className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all active:scale-95 border ${
                isMoreMenuOpen
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-slate-800/90 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
              aria-haspopup="menu"
              aria-expanded={isMoreMenuOpen}
              title="More actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isMoreMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50 py-1"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    onOpenProjectModal();
                    setIsMoreMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors text-left"
                >
                  <FolderKanban className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Projects & Drafts</span>
                </button>

                {onLoadDemo && !hasVideo && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      onLoadDemo();
                      setIsMoreMenuOpen(false);
                    }}
                    disabled={isGeneratingDemo}
                    className="w-full flex items-center space-x-2.5 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors text-left disabled:opacity-50"
                  >
                    <PlaySquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{isGeneratingDemo ? 'Loading demo...' : 'Try Demo'}</span>
                  </button>
                )}

                {onOpenShortcutsModal && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      onOpenShortcutsModal();
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition-colors text-left"
                  >
                    <Keyboard className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Keyboard Shortcuts</span>
                  </button>
                )}

                <div className="my-1 border-t border-slate-800" />

                <button
                  role="menuitem"
                  onClick={() => {
                    onOpenClearModal();
                    setIsMoreMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-rose-500/10 hover:text-rose-300 transition-colors text-left"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>Clear & Restart</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
