/**
 * ITU-R BS.1770-4 Compliant Integrated Loudness (LUFS) Analysis & Auto-Normalization Engine
 */

export interface LoudnessAnalysisResult {
  measuredLufs: number;    // e.g. -22.4 LUFS
  targetLufs: number;      // e.g. -14.0 LUFS
  gainDb: number;          // e.g. +8.4 dB
  linearGain: number;      // e.g. 2.63x
  wasPeakLimited: boolean; // True if peak safeguarding adjusted gain to prevent clipping
  peakDb: number;          // Peak dBFS of original audio track
}

/**
 * Calculates ITU-R BS.1770 K-weighted Integrated Loudness (LUFS) for an AudioBuffer
 */
export function calculateIntegratedLufs(audioBuffer: AudioBuffer): { lufs: number; peakDb: number } {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;

  if (length === 0) return { lufs: -70, peakDb: -70 };

  // 1. Measure peak dBFS across channels
  let globalPeak = 0;
  const channelDataList: Float32Array[] = [];
  for (let c = 0; c < numberOfChannels; c++) {
    const data = audioBuffer.getChannelData(c);
    channelDataList.push(data);
    for (let i = 0; i < data.length; i++) {
      const absVal = Math.abs(data[i]);
      if (absVal > globalPeak) globalPeak = absVal;
    }
  }
  const peakDb = globalPeak > 0 ? 20 * Math.log10(globalPeak) : -70;

  // 2. K-Weighting Filter Coefficients (BS.1770)
  // Stage 1: High Shelf Filter (f0 = 1681.97 Hz, Gain = +3.999 dB, Q = 0.7071)
  const db = 3.99987;
  const f0 = 1681.97445;
  const Q = 0.7071752369554193;

  const K = Math.tan((Math.PI * f0) / sampleRate);
  const Vh = Math.pow(10, db / 20);
  const Vb = Math.pow(10, db / 40);

  const a0_stage1 = 1 + K / Q + K * K;
  const b0_stage1 = (Vh + Vb * (K / Q) + K * K) / a0_stage1;
  const b1_stage1 = (2 * (K * K - Vh)) / a0_stage1;
  const b2_stage1 = (Vh - Vb * (K / Q) + K * K) / a0_stage1;
  const a1_stage1 = (2 * (K * K - 1)) / a0_stage1;
  const a2_stage1 = (1 - K / Q + K * K) / a0_stage1;

  // Stage 2: High Pass Filter (f0 = 38.135 Hz, Q = 0.5)
  const f0_hp = 38.13547087602444;
  const Q_hp = 0.5;
  const K_hp = Math.tan((Math.PI * f0_hp) / sampleRate);

  const a0_stage2 = 1 + K_hp / Q_hp + K_hp * K_hp;
  const b0_stage2 = 1 / a0_stage2;
  const b1_stage2 = -2 / a0_stage2;
  const b2_stage2 = 1 / a0_stage2;
  const a1_stage2 = (2 * (K_hp * K_hp - 1)) / a0_stage2;
  const a2_stage2 = (1 - K_hp / Q_hp + K_hp * K_hp) / a0_stage2;

  // Filter all channels through Stage 1 & Stage 2
  const filteredChannels: Float32Array[] = [];

  for (let c = 0; c < numberOfChannels; c++) {
    const input = channelDataList[c];
    const filtered = new Float32Array(input.length);

    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    let x1_2 = 0, x2_2 = 0, y1_2 = 0, y2_2 = 0;

    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      // Stage 1
      const y_st1 = b0_stage1 * x + b1_stage1 * x1 + b2_stage1 * x2 - a1_stage1 * y1 - a2_stage1 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y_st1;

      // Stage 2
      const y_st2 = b0_stage2 * y_st1 + b1_stage2 * x1_2 + b2_stage2 * x2_2 - a1_stage2 * y1_2 - a2_stage2 * y2_2;
      x2_2 = x1_2;
      x1_2 = y_st1;
      y2_2 = y1_2;
      y1_2 = y_st2;

      filtered[i] = y_st2;
    }
    filteredChannels.push(filtered);
  }

  // 3. Block Energy Calculation (400ms block size with 100ms hop = 75% overlap)
  const blockSamples = Math.floor(sampleRate * 0.4);
  const hopSamples = Math.floor(sampleRate * 0.1);
  if (length < blockSamples) {
    return { lufs: -70, peakDb };
  }

  const numBlocks = Math.floor((length - blockSamples) / hopSamples) + 1;
  const blockEnergies: number[] = new Array(numBlocks);

  for (let b = 0; b < numBlocks; b++) {
    const start = b * hopSamples;
    const end = start + blockSamples;
    let sumEnergy = 0;

    for (let c = 0; c < numberOfChannels; c++) {
      const data = filteredChannels[c];
      let sumSq = 0;
      for (let i = start; i < end; i++) {
        const val = data[i];
        sumSq += val * val;
      }
      sumEnergy += sumSq / blockSamples;
    }
    blockEnergies[b] = sumEnergy;
  }

  // 4. Gating Thresholding
  // Absolute gating threshold: -70 LUFS -> energy threshold = 10^((-70 + 0.691) / 10)
  const absEnergyThreshold = Math.pow(10, (-70 + 0.691) / 10);
  const passAbsBlocks = blockEnergies.filter(e => e > absEnergyThreshold);

  if (passAbsBlocks.length === 0) {
    return { lufs: -70, peakDb };
  }

  const avgAbsEnergy = passAbsBlocks.reduce((a, b) => a + b, 0) / passAbsBlocks.length;
  const absLoudness = -0.691 + 10 * Math.log10(avgAbsEnergy);

  // Relative gating threshold: absLoudness - 10 LU
  const relLoudnessThreshold = absLoudness - 10;
  const relEnergyThreshold = Math.pow(10, (relLoudnessThreshold + 0.691) / 10);
  const passRelBlocks = blockEnergies.filter(e => e > relEnergyThreshold);

  if (passRelBlocks.length === 0) {
    return { lufs: Number(absLoudness.toFixed(1)), peakDb: Number(peakDb.toFixed(1)) };
  }

  const avgRelEnergy = passRelBlocks.reduce((a, b) => a + b, 0) / passRelBlocks.length;
  const integratedLufs = -0.691 + 10 * Math.log10(avgRelEnergy);

  return {
    lufs: Number(integratedLufs.toFixed(1)),
    peakDb: Number(peakDb.toFixed(1)),
  };
}

/**
 * Calculates normalization gain adjustment to reach target LUFS without clipping
 */
export function calculateNormalizationGain(
  audioBuffer: AudioBuffer | null,
  targetLufs: number = -14
): LoudnessAnalysisResult {
  if (!audioBuffer) {
    return {
      measuredLufs: -14,
      targetLufs,
      gainDb: 0,
      linearGain: 1.0,
      wasPeakLimited: false,
      peakDb: -6,
    };
  }

  const { lufs: measuredLufs, peakDb } = calculateIntegratedLufs(audioBuffer);

  // If track is essentially silent or corrupt
  if (measuredLufs <= -65) {
    return {
      measuredLufs,
      targetLufs,
      gainDb: 0,
      linearGain: 1.0,
      wasPeakLimited: false,
      peakDb,
    };
  }

  const desiredGainDb = targetLufs - measuredLufs;
  let rawLinearGain = Math.pow(10, desiredGainDb / 20);

  // Calculate peak amplitude from peakDb
  const peakLinear = Math.pow(10, peakDb / 20);

  // Peak safeguard: Maximum allowed peak post-gain is -0.5 dBFS (0.944 linear)
  const maxAllowedPeakLinear = 0.944;
  let wasPeakLimited = false;
  let finalLinearGain = rawLinearGain;

  if (rawLinearGain * peakLinear > maxAllowedPeakLinear && peakLinear > 0) {
    finalLinearGain = maxAllowedPeakLinear / peakLinear;
    wasPeakLimited = true;
  }

  // Cap linear gain between 0.1x (-20dB) and 8.0x (+18dB)
  finalLinearGain = Math.max(0.1, Math.min(8.0, finalLinearGain));
  const finalGainDb = Number((20 * Math.log10(finalLinearGain)).toFixed(1));

  return {
    measuredLufs,
    targetLufs,
    gainDb: finalGainDb,
    linearGain: Number(finalLinearGain.toFixed(3)),
    wasPeakLimited,
    peakDb,
  };
}
