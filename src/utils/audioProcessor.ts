/**
 * Studio Voice Clarity & Audio EQ Enhancer
 * Implements vocal presence boosting, rumble filtering, and multi-band dynamics.
 */

export interface VoiceEnhancementOptions {
  voiceClarity?: boolean;
  bassBoost?: boolean;
  sampleRate?: number;
}

/**
 * Applies voice clarity EQ filters and dynamic compression to an AudioBuffer
 */
export async function applyVoiceClarityFilters(
  inputBuffer: AudioBuffer,
  options: VoiceEnhancementOptions = {}
): Promise<AudioBuffer> {
  const { voiceClarity = true, bassBoost = false, sampleRate = inputBuffer.sampleRate } = options;

  if (!voiceClarity && !bassBoost) {
    return inputBuffer;
  }

  try {
    const offlineCtx = new OfflineAudioContext(
      inputBuffer.numberOfChannels,
      inputBuffer.length,
      sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = inputBuffer;

    let lastNode: AudioNode = source;

    if (voiceClarity) {
      // 1. Highpass filter to eliminate sub-bass rumble and mic handling noise (< 85 Hz)
      const highpass = offlineCtx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(85, 0);
      highpass.Q.setValueAtTime(0.707, 0);
      lastNode.connect(highpass);
      lastNode = highpass;

      // 2. Vocal presence peak booster at 3.5 kHz (+3.8 dB, Q=1.2)
      const presenceEq = offlineCtx.createBiquadFilter();
      presenceEq.type = 'peaking';
      presenceEq.frequency.setValueAtTime(3500, 0);
      presenceEq.Q.setValueAtTime(1.2, 0);
      presenceEq.gain.setValueAtTime(3.8, 0);
      lastNode.connect(presenceEq);
      lastNode = presenceEq;

      // 3. Air band shelf booster at 10 kHz (+2.0 dB) for crisp studio highs
      const airShelf = offlineCtx.createBiquadFilter();
      airShelf.type = 'highshelf';
      airShelf.frequency.setValueAtTime(10000, 0);
      airShelf.gain.setValueAtTime(2.0, 0);
      lastNode.connect(airShelf);
      lastNode = airShelf;
    }

    if (bassBoost) {
      // Warmth low shelf at 120 Hz (+3.0 dB)
      const lowShelf = offlineCtx.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.setValueAtTime(120, 0);
      lowShelf.gain.setValueAtTime(3.2, 0);
      lastNode.connect(lowShelf);
      lastNode = lowShelf;
    }

    // 4. Studio vocal dynamics compressor to level out speech dynamics
    const compressor = offlineCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, 0);
    compressor.knee.setValueAtTime(6, 0);
    compressor.ratio.setValueAtTime(3.0, 0);
    compressor.attack.setValueAtTime(0.005, 0);
    compressor.release.setValueAtTime(0.08, 0);
    lastNode.connect(compressor);
    lastNode = compressor;

    lastNode.connect(offlineCtx.destination);

    source.start(0);
    return await offlineCtx.startRendering();
  } catch (e) {
    console.warn('Voice clarity filter processing failed, returning raw buffer:', e);
    return inputBuffer;
  }
}
