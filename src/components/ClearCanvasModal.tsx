import React from 'react';
import { RotateCcw, AlertTriangle, X, Trash2, Video, Sparkles, Layers } from 'lucide-react';

interface ClearCanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmClearAll: () => void;
  onConfirmClearSubtitlesOnly: () => void;
  hasVideo: boolean;
  subtitleCount: number;
}

export const ClearCanvasModal: React.FC<ClearCanvasModalProps> = ({
  isOpen,
  onClose,
  onConfirmClearAll,
  onConfirmClearSubtitlesOnly,
  hasVideo,
  subtitleCount,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl overflow-hidden text-slate-100 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Reset & Clear Canvas</h2>
              <p className="text-[11px] text-slate-400">Choose what you want to reset</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Warning Notice */}
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start space-x-2.5 text-amber-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div className="leading-relaxed">
            This action will clear your current timeline and canvas elements so you can start completely fresh.
          </div>
        </div>

        {/* Options */}
        <div className="space-y-2.5 pt-1">
          {/* Option 1: Complete Project Reset (Video + Subtitles + Canvas) */}
          <button
            onClick={() => {
              onConfirmClearAll();
              onClose();
            }}
            className="w-full text-left p-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-all group flex items-center justify-between"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 group-hover:scale-105 transition-transform">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white group-hover:text-rose-300">
                  Full Project Reset (Clear All)
                </div>
                <div className="text-[11px] text-slate-400">
                  Clears video, audio waveform, all {subtitleCount} caption blocks, filters & transforms.
                </div>
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded-md">
              Fresh Start
            </span>
          </button>

          {/* Option 2: Clear Subtitles Only (Keep Video) */}
          <button
            onClick={() => {
              onConfirmClearSubtitlesOnly();
              onClose();
            }}
            disabled={subtitleCount === 0}
            className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${
              subtitleCount === 0
                ? 'opacity-40 cursor-not-allowed bg-slate-950/40 border-slate-800'
                : 'bg-slate-950/60 hover:bg-slate-800/80 border-slate-800 hover:border-slate-700 group'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 group-hover:scale-105 transition-transform">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white group-hover:text-amber-300">
                  Clear Captions Only
                </div>
                <div className="text-[11px] text-slate-400">
                  Removes all {subtitleCount} caption blocks from timeline, keeps current video & audio track.
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-2 border-t border-slate-800/80">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
