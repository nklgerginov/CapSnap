import React from 'react';
import { Download, Sparkles, FileText, FolderKanban, Save, RotateCcw, Keyboard, PlaySquare } from 'lucide-react';
import { PlatformPreset } from '../types';

interface HeaderProps {
  platformPreset: PlatformPreset;
  onSelectPlatform: (preset: PlatformPreset) => void;
  onOpenExportModal: () => void;
  onOpenSubtitleModal: () => void;
  onOpenProjectModal: () => void;
  onOpenClearModal: () => void;
  onOpenShortcutsModal?: () => void;
  onLoadDemo?: () => void;
  isGeneratingDemo?: boolean;
  currentProjectName?: string;
  hasVideo: boolean;
  hasSubtitles: boolean;
  lastSavedAt?: Date | null;
  isSaved?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  platformPreset,
  onSelectPlatform,
  onOpenExportModal,
  onOpenSubtitleModal,
  onOpenProjectModal,
  onOpenClearModal,
  onOpenShortcutsModal,
  onLoadDemo,
  isGeneratingDemo = false,
  currentProjectName,
  hasVideo,
  hasSubtitles,
  lastSavedAt,
  isSaved = true,
}) => {
  return (
    <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800/90 px-3 sm:px-4 py-2 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black text-sm shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="text-base font-bold text-white tracking-tight">
              NovaCap<span className="text-amber-400"> Studio</span>
            </span>
          </div>

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

          {hasSubtitles && (
            <span
              className={`hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
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
        </div>

        {/* Zone 2: Platform Links */}
        <div className="hidden lg:flex items-center bg-slate-950/70 p-0.5 rounded-xl border border-slate-800 overflow-x-auto">
          {[
            { id: 'tiktok', label: 'TikTok (9:16)' },
            { id: 'youtube_shorts', label: 'YT Shorts' },
            { id: 'instagram_reels', label: 'IG Reels' },
            { id: 'facebook_reels', label: 'FB Reels' },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => onSelectPlatform(p.id as PlatformPreset)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                platformPreset === p.id
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          {/* Quick Demo Video Button (Shown when no video loaded yet) */}
          {!hasVideo && onLoadDemo && (
            <button
              onClick={onLoadDemo}
              disabled={isGeneratingDemo}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 transition-all shadow-sm active:scale-95 min-h-[36px]"
              title="Load instant interactive demo short with captions"
            >
              <PlaySquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{isGeneratingDemo ? 'Loading...' : 'Try Demo'}</span>
            </button>
          )}

          {/* Keyboard Hotkeys Guide */}
          {onOpenShortcutsModal && (
            <button
              onClick={onOpenShortcutsModal}
              className="hidden md:flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all shadow-sm active:scale-95 min-h-[36px]"
              title="Keyboard Shortcuts & Gestures (Hotkeys)"
            >
              <Keyboard className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden lg:inline">Hotkeys</span>
            </button>
          )}

          <button
            onClick={onOpenProjectModal}
            className="flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all shadow-sm active:scale-95 min-h-[36px]"
            title="Open Projects & Drafts"
          >
            <FolderKanban className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Projects</span>
          </button>

          <button
            onClick={onOpenClearModal}
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/90 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 transition-all shadow-sm active:scale-95 min-h-[36px]"
            title="Clear canvas and restart project"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Reset</span>
          </button>

          <button
            onClick={onOpenSubtitleModal}
            className="flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all shadow-sm active:scale-95 min-h-[36px]"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Captions</span>
            <span className="sm:hidden">Script</span>
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
        </div>
      </div>
    </header>
  );
};

