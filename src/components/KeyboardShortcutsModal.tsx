import React from 'react';
import { Keyboard, X, Sparkles, Command } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutCategory {
  category: string;
  items: { key: string; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutCategory[] = [
  {
    category: 'Playback & Navigation',
    items: [
      { key: 'Space', description: 'Play / Pause video' },
      { key: '← / →', description: 'Step frame / seek ±0.1s' },
      { key: 'Shift + ← / →', description: 'Jump ±0.5s' },
      { key: 'J / K / L', description: 'Rewind / Pause / Forward' },
      { key: '0', description: 'Restart video from 0:00' },
    ],
  },
  {
    category: 'Timeline & Subtitle Editing',
    items: [
      { key: 'S', description: 'Split subtitle block at current playhead' },
      { key: 'H', description: 'Toggle viral highlight color on active word' },
      { key: 'M', description: 'Cycle speaker diarization tag' },
      { key: 'Delete / ⌫', description: 'Delete selected subtitle block(s)' },
      { key: 'Ctrl / ⌘ + A', description: 'Select all subtitle blocks' },
      { key: 'Esc', description: 'Deselect all blocks / close dialogs' },
    ],
  },
  {
    category: 'History & Canvas Control',
    items: [
      { key: 'Ctrl / ⌘ + Z', description: 'Undo last subtitle change' },
      { key: 'Ctrl / ⌘ + Y', description: 'Redo change (or ⌘+Shift+Z)' },
      { key: 'Drag Canvas', description: 'Reposition caption or watermark on video' },
      { key: 'Corner Handles', description: 'Scale font size & box width directly' },
    ],
  },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Keyboard className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                <span>Keyboard Shortcuts & Gestures</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                  Pro Hotkeys
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Speed up editing captions, scrubbing timeline, and formatting
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content list */}
        <div className="p-4 overflow-y-auto space-y-4 custom-scrollbar text-xs">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.category} className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-400/90 flex items-center space-x-1.5">
                <Sparkles className="w-3 h-3" />
                <span>{group.category}</span>
              </h4>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl divide-y divide-slate-800/60 overflow-hidden">
                {group.items.map(item => (
                  <div
                    key={item.key}
                    className="p-2.5 flex items-center justify-between hover:bg-slate-900/60 transition-colors"
                  >
                    <span className="text-slate-300 font-medium">{item.description}</span>
                    <kbd className="px-2 py-1 bg-slate-900 border border-slate-700 text-amber-300 font-mono font-bold rounded-lg text-[11px] shadow-sm ml-2 shrink-0">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-[11px] text-slate-400">
          <span>Tip: Tap any word in the editor to quickly audition timing</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition-all shadow active:scale-95"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
