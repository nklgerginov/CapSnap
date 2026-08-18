/**
 * Studio-Grade Web Audio Synthesizer for Highlight Sound Effects (SFX)
 * Zero external assets required — synthesized in real-time at 48kHz.
 */

export type SfxType =
  | 'pop'
  | 'whoosh'
  | 'ding'
  | 'boom'
  | 'click'
  | 'cash'
  | 'laser'
  | 'glitch';

let sharedAudioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioCtx = new AudioCtxClass();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function unlockAudioContext(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

/**
 * Plays a synthesized sound effect in real-time with zero latency
 */
export function playSfx(type: SfxType, volume = 0.75): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    const clampedVol = Math.max(0.05, Math.min(1.0, volume));
    masterGain.gain.setValueAtTime(clampedVol, now);
    masterGain.connect(ctx.destination);

    switch (type) {
      case 'pop': {
        // Fast punchy pitch-dropped sine wave (920Hz -> 90Hz) with snappy envelope
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(920, now);
        osc.frequency.exponentialRampToValueAtTime(85, now + 0.075);

        gain.gain.setValueAtTime(1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + 0.09);
        break;
      }

      case 'whoosh': {
        // Swept filtered noise
        const dur = 0.18;
        const bufferSize = Math.floor(ctx.sampleRate * dur);
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.setValueAtTime(3.5, now);
        filter.frequency.setValueAtTime(350, now);
        filter.frequency.exponentialRampToValueAtTime(3400, now + dur * 0.45);
        filter.frequency.exponentialRampToValueAtTime(400, now + dur);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(1.0, now + dur * 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        whiteNoise.start(now);
        whiteNoise.stop(now + dur);
        break;
      }

      case 'ding': {
        // Harmonically rich crystal bell chime (1760Hz root with 3520Hz upper chime)
        const dur = 0.45;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        const gain2 = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(1760, now); // A6
        gain1.gain.setValueAtTime(0.85, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(3520, now); // A7
        gain2.gain.setValueAtTime(0.4, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.6);

        osc1.connect(gain1);
        osc2.connect(gain2);
        gain1.connect(masterGain);
        gain2.connect(masterGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + dur);
        osc2.stop(now + dur);
        break;
      }

      case 'boom': {
        // Heavy cinematic sub-bass drop with punch transient
        const dur = 0.38;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(38, now + dur * 0.7);

        gain.gain.setValueAtTime(1.0, now);
        gain.gain.linearRampToValueAtTime(0.85, now + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        // Click transient for initial punch
        const clickOsc = ctx.createOscillator();
        const clickGain = ctx.createGain();
        clickOsc.type = 'triangle';
        clickOsc.frequency.setValueAtTime(800, now);
        clickOsc.frequency.exponentialRampToValueAtTime(80, now + 0.025);
        clickGain.gain.setValueAtTime(0.7, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        osc.connect(gain);
        gain.connect(masterGain);
        clickOsc.connect(clickGain);
        clickGain.connect(masterGain);

        osc.start(now);
        clickOsc.start(now);
        osc.stop(now + dur);
        clickOsc.stop(now + 0.035);
        break;
      }

      case 'click': {
        // High-end camera shutter snap click
        const dur = 0.04;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(3200, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + dur);

        gain.gain.setValueAtTime(0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + dur);
        break;
      }

      case 'cash': {
        // Dual metallic chime register ("cha-ching")
        const dur = 0.35;
        const now2 = now + 0.08;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        const gain2 = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(1174, now); // D6
        gain1.gain.setValueAtTime(0.7, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1760, now2); // A6
        gain2.gain.setValueAtTime(0.9, now2);
        gain2.gain.exponentialRampToValueAtTime(0.001, now2 + dur);

        osc1.connect(gain1);
        gain1.connect(masterGain);
        osc2.connect(gain2);
        gain2.connect(masterGain);

        osc1.start(now);
        osc1.stop(now + 0.18);
        osc2.start(now2);
        osc2.stop(now2 + dur);
        break;
      }

      case 'laser': {
        // Sci-fi descending chirp
        const dur = 0.12;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(2400, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + dur);

        gain.gain.setValueAtTime(0.65, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + dur);
        break;
      }

      case 'glitch': {
        // Rapid 3-frequency micro-jitter
        const dur = 0.09;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1600, now);
        osc.frequency.setValueAtTime(450, now + 0.025);
        osc.frequency.setValueAtTime(2800, now + 0.055);

        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + dur);
        break;
      }
    }
  } catch (e) {
    console.warn('SFX playback error:', e);
  }
}

/**
 * Synthesizes an AudioBuffer containing all scheduled SFX events for offline video export mixing
 */
export async function renderSfxTrackToAudioBuffer(
  events: Array<{ time: number; type: SfxType; volume?: number }>,
  totalDuration: number,
  sampleRate = 48000
): Promise<AudioBuffer | null> {
  if (events.length === 0 || totalDuration <= 0) return null;

  try {
    const totalSamples = Math.ceil(totalDuration * sampleRate);
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

    for (const evt of events) {
      const now = Math.max(0, Math.min(totalDuration - 0.05, evt.time));
      const volume = evt.volume ?? 0.65;
      const masterGain = offlineCtx.createGain();
      masterGain.gain.setValueAtTime(volume, now);
      masterGain.connect(offlineCtx.destination);

      switch (evt.type) {
        case 'pop': {
          const osc = offlineCtx.createOscillator();
          const gain = offlineCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(110, now + 0.07);
          gain.gain.setValueAtTime(1.0, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.09);
          break;
        }

        case 'whoosh': {
          const dur = 0.18;
          const bufferSize = Math.floor(sampleRate * dur);
          const noiseBuffer = offlineCtx.createBuffer(1, bufferSize, sampleRate);
          const output = noiseBuffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
          }
          const whiteNoise = offlineCtx.createBufferSource();
          whiteNoise.buffer = noiseBuffer;
          const filter = offlineCtx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.Q.setValueAtTime(3.5, now);
          filter.frequency.setValueAtTime(300, now);
          filter.frequency.exponentialRampToValueAtTime(3200, now + dur * 0.45);
          filter.frequency.exponentialRampToValueAtTime(450, now + dur);
          const gain = offlineCtx.createGain();
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(1.0, now + dur * 0.4);
          gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
          whiteNoise.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);
          whiteNoise.start(now);
          whiteNoise.stop(now + dur);
          break;
        }

        case 'ding': {
          const dur = 0.45;
          const osc1 = offlineCtx.createOscillator();
          const osc2 = offlineCtx.createOscillator();
          const gain1 = offlineCtx.createGain();
          const gain2 = offlineCtx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(1760, now);
          gain1.gain.setValueAtTime(0.8, now);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + dur);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(3520, now);
          gain2.gain.setValueAtTime(0.35, now);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.6);
          osc1.connect(gain1);
          osc2.connect(gain2);
          gain1.connect(masterGain);
          gain2.connect(masterGain);
          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + dur);
          osc2.stop(now + dur);
          break;
        }

        case 'boom': {
          const dur = 0.38;
          const osc = offlineCtx.createOscillator();
          const gain = offlineCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(150, now);
          osc.frequency.exponentialRampToValueAtTime(42, now + dur * 0.7);
          gain.gain.setValueAtTime(1.0, now);
          gain.gain.linearRampToValueAtTime(0.85, now + 0.06);
          gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

          const clickOsc = offlineCtx.createOscillator();
          const clickGain = offlineCtx.createGain();
          clickOsc.type = 'triangle';
          clickOsc.frequency.setValueAtTime(800, now);
          clickOsc.frequency.exponentialRampToValueAtTime(80, now + 0.025);
          clickGain.gain.setValueAtTime(0.7, now);
          clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

          osc.connect(gain);
          gain.connect(masterGain);
          clickOsc.connect(clickGain);
          clickGain.connect(masterGain);
          osc.start(now);
          clickOsc.start(now);
          osc.stop(now + dur);
          clickOsc.stop(now + 0.035);
          break;
        }

        case 'click': {
          const dur = 0.04;
          const osc = offlineCtx.createOscillator();
          const gain = offlineCtx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(3200, now);
          osc.frequency.exponentialRampToValueAtTime(600, now + dur);
          gain.gain.setValueAtTime(0.9, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + dur);
          break;
        }

        case 'cash': {
          const dur = 0.35;
          const now2 = now + 0.08;
          const osc1 = offlineCtx.createOscillator();
          const osc2 = offlineCtx.createOscillator();
          const gain1 = offlineCtx.createGain();
          const gain2 = offlineCtx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(1174, now);
          gain1.gain.setValueAtTime(0.7, now);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1760, now2);
          gain2.gain.setValueAtTime(0.9, now2);
          gain2.gain.exponentialRampToValueAtTime(0.001, now2 + dur);
          osc1.connect(gain1);
          gain1.connect(masterGain);
          osc2.connect(gain2);
          gain2.connect(masterGain);
          osc1.start(now);
          osc1.stop(now + 0.18);
          osc2.start(now2);
          osc2.stop(now2 + dur);
          break;
        }

        case 'laser': {
          const dur = 0.12;
          const osc = offlineCtx.createOscillator();
          const gain = offlineCtx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(2400, now);
          osc.frequency.exponentialRampToValueAtTime(300, now + dur);
          gain.gain.setValueAtTime(0.65, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + dur);
          break;
        }

        case 'glitch': {
          const dur = 0.09;
          const osc = offlineCtx.createOscillator();
          const gain = offlineCtx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(1600, now);
          osc.frequency.setValueAtTime(450, now + 0.025);
          osc.frequency.setValueAtTime(2800, now + 0.055);
          gain.gain.setValueAtTime(0.6, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + dur);
          break;
        }
      }
    }

    return await offlineCtx.startRendering();
  } catch (e) {
    console.warn('SFX offline render failed:', e);
    return null;
  }
}
