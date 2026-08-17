import React from 'react';
import { PlatformPreset } from '../types';

interface SafeZoneOverlayProps {
  platform: PlatformPreset;
  visible: boolean;
}

export const SafeZoneOverlay: React.FC<SafeZoneOverlayProps> = ({ platform, visible }) => {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-4 border-2 border-dashed border-amber-400/40 rounded-lg">
      {/* Top Bar Safe Zone */}
      <div className="flex justify-between items-center text-[10px] font-mono uppercase text-amber-300/80 bg-slate-950/60 px-2 py-1 rounded backdrop-blur-sm self-center">
        <span>{platform.replace('_', ' ')} Top Safe Zone Header</span>
      </div>

      {/* Side Action Buttons Placeholder for 9:16 vertical shorts */}
      <div className="flex justify-between items-center w-full px-2">
        <div className="text-[9px] text-slate-400 bg-slate-900/80 px-2 py-1 rounded">
          Safe Margins
        </div>
        <div className="flex flex-col space-y-3 items-center">
          <div className="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-600/50 flex items-center justify-center text-[9px] text-slate-300">
            Like
          </div>
          <div className="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-600/50 flex items-center justify-center text-[9px] text-slate-300">
            Comm
          </div>
          <div className="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-600/50 flex items-center justify-center text-[9px] text-slate-300">
            Share
          </div>
        </div>
      </div>

      {/* Bottom Safe Zone Overlay */}
      <div className="bg-rose-500/10 border-t border-rose-500/30 p-2 text-[10px] font-mono text-rose-300 text-center rounded-b backdrop-blur-xs">
        ⚠️ Recommended Caption Area: Keep Subtitles Above This Line
      </div>
    </div>
  );
};
