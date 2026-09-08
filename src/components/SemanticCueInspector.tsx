import React, { useMemo } from 'react';
import { AudioLines, Film, Megaphone, Music2, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { BeatMarker, SemanticCue, SemanticCueType } from '../types';

interface SemanticCueInspectorProps {
  cues: SemanticCue[];
  beatMarkers: BeatMarker[];
  onChangeCue: (cue: SemanticCue) => void;
  onDeleteCue: (cueId: string) => void;
  onSeek: (time: number) => void;
}

const CUE_META: Record<SemanticCueType, { label: string; icon: React.ReactNode; color: string }> = {
  keyword: { label: 'Keyword', icon: <Sparkles className="w-3.5 h-3.5" />, color: 'text-amber-300' },
  cta: { label: 'CTA', icon: <Megaphone className="w-3.5 h-3.5" />, color: 'text-rose-300' },
  emoji: { label: 'Emoji', icon: <Wand2 className="w-3.5 h-3.5" />, color: 'text-yellow-300' },
  b_roll: { label: 'B-roll', icon: <Film className="w-3.5 h-3.5" />, color: 'text-cyan-300' },
  sfx: { label: 'SFX', icon: <AudioLines className="w-3.5 h-3.5" />, color: 'text-violet-300' },
};

export const SemanticCueInspector: React.FC<SemanticCueInspectorProps> = ({
  cues,
  beatMarkers,
  onChangeCue,
  onDeleteCue,
  onSeek,
}) => {
  const sortedCues = useMemo(() => [...cues].sort((a, b) => a.start - b.start), [cues]);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-xl">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Music2 className="w-4 h-4 text-amber-400" />
            Intelligence Tracks
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {sortedCues.length} editable cues · {beatMarkers.length} beat markers
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold">Synced</span>
      </div>

      {sortedCues.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-slate-500">
          Transcribe audio to generate keyword, CTA, emoji, B-roll, and SFX suggestions.
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/80">
          {sortedCues.map(cue => {
            const meta = CUE_META[cue.type];
            return (
              <div key={cue.id} className="px-3 py-2.5 flex items-start gap-2.5 hover:bg-slate-800/40">
                <button
                  onClick={() => onSeek(cue.start)}
                  className={`mt-1 ${meta.color} hover:text-white transition-colors`}
                  title={`Seek to ${cue.start.toFixed(2)}s`}
                  aria-label={`Seek to ${cue.label}`}
                >
                  {meta.icon}
                </button>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase font-bold ${meta.color}`}>{meta.label}</span>
                    <span className="text-[10px] font-mono text-slate-500">{cue.start.toFixed(2)}s</span>
                  </div>
                  <input
                    value={cue.label}
                    onChange={event => onChangeCue({ ...cue, label: event.target.value })}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-amber-500/70"
                    aria-label={`${meta.label} label`}
                  />
                  {(cue.type === 'emoji' || cue.type === 'b_roll' || cue.type === 'sfx') && (
                    <input
                      value={cue.payload || ''}
                      onChange={event => onChangeCue({ ...cue, payload: event.target.value })}
                      placeholder="Payload or production note"
                      className="w-full bg-slate-950/70 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-400 outline-none focus:border-amber-500/70"
                      aria-label={`${meta.label} payload`}
                    />
                  )}
                </div>
                <button
                  onClick={() => onDeleteCue(cue.id)}
                  className="mt-1 p-1 text-slate-600 hover:text-rose-300 transition-colors"
                  title="Remove cue"
                  aria-label={`Remove ${cue.label}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
