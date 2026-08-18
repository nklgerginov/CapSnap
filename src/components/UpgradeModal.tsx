import React from 'react';
import { Crown, X, CheckCircle2, Sparkles, Lock } from 'lucide-react';
import { STRIPE_PAYMENT_LINK } from '../hooks/useProStatus';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional: which locked feature triggered this modal, shown as context. */
  reason?: string;
}

const PRO_FEATURES = [
  'No "Made with CapSnap" watermark on exports',
  '1080p & 4K Ultra export resolution',
  'All export containers: MOV, MKV, AVI, TS + WAV lossless audio',
  'Unlimited AI transcriptions',
];

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, reason }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl overflow-hidden text-slate-100 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Upgrade to CapSnap Pro</h2>
              <p className="text-[11px] text-slate-400">Unlock the full export pipeline</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Reason context (why the paywall fired) */}
        {reason && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start space-x-2.5 text-amber-300 text-xs">
            <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div className="leading-relaxed">{reason}</div>
          </div>
        )}

        {/* Feature list */}
        <div className="space-y-2 pt-1">
          {PRO_FEATURES.map(feature => (
            <div key={feature} className="flex items-start space-x-2.5 text-xs text-slate-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>{feature}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <a
          href={STRIPE_PAYMENT_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold rounded-xl text-xs shadow-lg shadow-amber-500/25 flex items-center justify-center space-x-2 transition-all active:scale-95"
        >
          <Sparkles className="w-4 h-4" />
          <span>Unlock CapSnap Pro</span>
        </a>
        <p className="text-[10px] text-slate-500 text-center leading-relaxed">
          You'll be redirected to Stripe to complete payment, then brought back here with Pro
          unlocked automatically.
        </p>

        {/* Footer */}
        <div className="flex items-center justify-end pt-2 border-t border-slate-800/80">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
};
