import { SubtitleBlock, SubtitleWord } from '../types';

/**
 * Extracts a normalized, high-precision waveform array from an AudioBuffer
 * Uses combined Peak & RMS amplitude with transient preservation for crisp visual speech peaks.
 */
export async function extractWaveformFromAudioBuffer(
  audioBuffer: AudioBuffer,
  samplesCount: number = 600
): Promise<number[]> {
  const rawData = audioBuffer.getChannelData(0); // Left channel
  const totalSamples = rawData.length;
  if (totalSamples === 0) return [];

  const actualSamplesCount = Math.max(100, Math.min(2000, samplesCount));
  const blockSize = Math.floor(totalSamples / actualSamplesCount);
  const waveform: number[] = [];

  for (let i = 0; i < actualSamplesCount; i++) {
    const start = i * blockSize;
    const end = Math.min(totalSamples, start + blockSize);
    let sumSq = 0;
    let peak = 0;
    let count = 0;

    for (let j = start; j < end; j++) {
      const val = Math.abs(rawData[j] || 0);
      sumSq += val * val;
      if (val > peak) peak = val;
      count++;
    }

    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    // Combine Peak (60%) and RMS (40%) to clearly distinguish speech spikes from background noise
    const amplitude = rms * 0.4 + peak * 0.6;
    waveform.push(amplitude);
  }

  // Normalize between 0 and 1 with power curve scaling for high dynamic contrast
  const max = Math.max(...waveform, 0.001);
  return waveform.map(val => {
    const norm = Math.min(1, Math.max(0, val / max));
    // Apply gamma curve (0.85) to enhance subtle speech dynamics without clipping
    return Number(Math.pow(norm, 0.85).toFixed(3));
  });
}

/**
 * Decodes audio from a File blob offline using Web Audio AudioContext
 */
export async function decodeAudioFromFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return await audioContext.decodeAudioData(arrayBuffer);
}

/**
 * Audio Speech Energy Profile with Ultra-High Time-Resolution (10ms frames)
 */
export interface AudioEnergyProfile {
  frameDurationSec: number;
  totalFrames: number;
  rms: Float32Array;
  speechThreshold: number;
  noiseFloor: number;
  onsets: number[]; // Timestamps in seconds where speech attacks/starts
  offsets: number[]; // Timestamps in seconds where speech ends/decays
  speechIntervals: { start: number; end: number; peak: number }[];
}

export function computeAudioEnergyProfile(audioBuffer: AudioBuffer): AudioEnergyProfile {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const frameDurationSec = 0.01; // 10ms resolution (100 FPS) for pinpoint accuracy
  const frameSamples = Math.max(1, Math.floor(sampleRate * frameDurationSec));
  const totalFrames = Math.floor(channelData.length / frameSamples);
  const rms = new Float32Array(totalFrames);

  for (let f = 0; f < totalFrames; f++) {
    let sum = 0;
    const offset = f * frameSamples;
    for (let s = 0; s < frameSamples; s++) {
      const val = channelData[offset + s] || 0;
      sum += val * val;
    }
    rms[f] = Math.sqrt(sum / frameSamples);
  }

  // Moving average smoothing (3-frame window)
  const smoothedRms = new Float32Array(totalFrames);
  for (let f = 0; f < totalFrames; f++) {
    const p = rms[Math.max(0, f - 1)];
    const c = rms[f];
    const n = rms[Math.min(totalFrames - 1, f + 1)];
    smoothedRms[f] = (p + c + n) / 3;
  }

  // Dynamic noise floor estimation (15th percentile)
  const sortedRms = Float32Array.from(smoothedRms).sort();
  const noiseFloor = sortedRms[Math.floor(totalFrames * 0.15)] || 0.001;

  // Calculate adaptive speech threshold
  let totalSum = 0;
  for (let f = 0; f < totalFrames; f++) totalSum += smoothedRms[f];
  const avgEnergy = totalSum / (totalFrames || 1);
  const speechThreshold = Math.max(0.003, noiseFloor + (avgEnergy - noiseFloor) * 0.3);

  // Detect speech intervals, onsets, and offsets
  const speechIntervals: { start: number; end: number; peak: number }[] = [];
  const onsets: number[] = [];
  const offsets: number[] = [];

  let inSpeech = false;
  let segStart = 0;
  let peak = 0;

  for (let f = 0; f < totalFrames; f++) {
    const timeSec = f * frameDurationSec;
    const energy = smoothedRms[f];
    const isVoice = energy >= speechThreshold;

    if (isVoice) {
      if (!inSpeech) {
        inSpeech = true;
        segStart = timeSec;
        peak = energy;
        onsets.push(Number(timeSec.toFixed(3)));
      } else {
        if (energy > peak) peak = energy;
      }
    } else if (inSpeech) {
      inSpeech = false;
      if (timeSec - segStart >= 0.08) { // minimum 80ms speech segment
        speechIntervals.push({ start: segStart, end: timeSec, peak });
        offsets.push(Number(timeSec.toFixed(3)));
      }
    }
  }

  if (inSpeech) {
    speechIntervals.push({ start: segStart, end: audioBuffer.duration, peak });
    offsets.push(Number(audioBuffer.duration.toFixed(3)));
  }

  return {
    frameDurationSec,
    totalFrames,
    rms: smoothedRms,
    speechThreshold,
    noiseFloor,
    onsets,
    offsets,
    speechIntervals,
  };
}

/**
 * Precision Snapping Refiner:
 * Takes existing subtitle blocks/words (from Gemini AI, SpeechRecognition, or SRT) and snaps word start/end times
 * directly to actual speech energy ONSETS and OFFSETS in the audio buffer.
 * Trims silent pauses so captions NEVER appear ahead of speech or stretch into silence.
 */
export function refineSubtitleSyncWithAudioEnergy(
  blocks: SubtitleBlock[],
  audioBuffer: AudioBuffer
): SubtitleBlock[] {
  if (!blocks || blocks.length === 0 || !audioBuffer) return blocks;

  const profile = computeAudioEnergyProfile(audioBuffer);
  const { speechIntervals, onsets, offsets } = profile;
  const maxTime = audioBuffer.duration;

  if (speechIntervals.length === 0) return blocks;

  // Helper to find nearest onset to a timestamp within a window
  const findNearestOnset = (targetTime: number, maxDistance = 0.8): number | null => {
    let best: number | null = null;
    let minDist = maxDistance;
    for (const onset of onsets) {
      const dist = Math.abs(targetTime - onset);
      if (dist < minDist) {
        minDist = dist;
        best = onset;
      }
    }
    return best;
  };

  // Helper to find nearest offset to a timestamp within a window
  const findNearestOffset = (targetTime: number, maxDistance = 0.8): number | null => {
    let best: number | null = null;
    let minDist = maxDistance;
    for (const offset of offsets) {
      const dist = Math.abs(targetTime - offset);
      if (dist < minDist) {
        minDist = dist;
        best = offset;
      }
    }
    return best;
  };

  // Process all blocks
  const updatedBlocks: SubtitleBlock[] = blocks.map((block) => {
    if (!block.words || block.words.length === 0) return block;

    const blockTargetStart = block.start;
    const blockTargetEnd = block.end;

    // Find best matching speech interval(s) overlapping or near this block
    const matchingIntervals = speechIntervals.filter((int) => {
      // Overlaps block range or is within 0.8s
      return (
        (blockTargetStart <= int.end && blockTargetEnd >= int.start) ||
        Math.abs(blockTargetStart - int.start) <= 0.8 ||
        Math.abs(blockTargetEnd - int.end) <= 0.8
      );
    });

    let effectiveStart = blockTargetStart;
    let effectiveEnd = blockTargetEnd;

    if (matchingIntervals.length > 0) {
      const firstInt = matchingIntervals[0];
      const lastInt = matchingIntervals[matchingIntervals.length - 1];

      // Snap start to nearest onset or interval start
      const nearestOnset = findNearestOnset(blockTargetStart, 1.0);
      effectiveStart = nearestOnset !== null ? nearestOnset : Math.max(firstInt.start, blockTargetStart);

      // Snap end to nearest offset or interval end
      const nearestOffset = findNearestOffset(blockTargetEnd, 1.0);
      effectiveEnd = nearestOffset !== null ? nearestOffset : Math.min(lastInt.end, blockTargetEnd);
    } else {
      // Fallback: search closest speech interval overall
      let closestInt = speechIntervals[0];
      let minDist = Infinity;
      for (const int of speechIntervals) {
        const d = Math.min(Math.abs(blockTargetStart - int.start), Math.abs(blockTargetEnd - int.end));
        if (d < minDist) {
          minDist = d;
          closestInt = int;
        }
      }
      if (minDist <= 1.2) {
        effectiveStart = closestInt.start;
        effectiveEnd = closestInt.end;
      }
    }

    if (effectiveEnd <= effectiveStart + 0.15) {
      effectiveEnd = effectiveStart + 0.3;
    }

    // Refine individual words inside the block using character-weighting
    const numWords = block.words.length;
    const totalChars = block.words.reduce((sum, w) => sum + Math.max(1, (w.text || '').replace(/[^\w]/g, '').length), 0);
    const activeSpan = Math.max(0.2, effectiveEnd - effectiveStart);

    let wordCursor = effectiveStart;

    const refinedWords: SubtitleWord[] = block.words.map((word, wIdx) => {
      const charCount = Math.max(1, (word.text || '').replace(/[^\w]/g, '').length);
      const charRatio = charCount / (totalChars || 1);

      // Calculate proportional word duration
      const wordDur = Math.max(0.1, activeSpan * charRatio);

      // Check for word-level onset snap
      let wStart = wordCursor;
      if (wIdx === 0) {
        wStart = effectiveStart;
      } else {
        const wordOnset = findNearestOnset(wStart, 0.25);
        if (wordOnset !== null && wordOnset >= effectiveStart && wordOnset < effectiveEnd) {
          wStart = wordOnset;
        }
      }

      let wEnd = wStart + wordDur;
      if (wIdx === numWords - 1) {
        wEnd = effectiveEnd;
      }

      // Hard clamp inside block bounds
      wStart = Math.max(effectiveStart, Math.min(effectiveEnd - 0.05, wStart));
      wEnd = Math.max(wStart + 0.08, Math.min(effectiveEnd, wEnd));

      wordCursor = wEnd + 0.01;

      return {
        ...word,
        start: Number(wStart.toFixed(3)),
        end: Number(wEnd.toFixed(3)),
      };
    });

    // Fix word overlaps and zero-durations inside block with strict forward progress
    for (let i = 0; i < refinedWords.length; i++) {
      if (i > 0 && refinedWords[i].start < refinedWords[i - 1].end) {
        refinedWords[i].start = Number((refinedWords[i - 1].end + 0.01).toFixed(3));
      }
      if (refinedWords[i].end <= refinedWords[i].start) {
        refinedWords[i].end = Number((refinedWords[i].start + 0.1).toFixed(3));
      }
      if (refinedWords[i].end > maxTime) {
        refinedWords[i].end = Number(maxTime.toFixed(3));
        if (refinedWords[i].start >= refinedWords[i].end) {
          refinedWords[i].start = Number(Math.max(0, refinedWords[i].end - 0.08).toFixed(3));
        }
      }
    }

    const bStart = refinedWords[0].start;
    const bEnd = refinedWords[refinedWords.length - 1].end;

    return {
      ...block,
      start: bStart,
      end: bEnd,
      words: refinedWords,
    };
  });

  // Repair cross-block boundaries cleanly without overlap
  for (let b = 1; b < updatedBlocks.length; b++) {
    const prevBlock = updatedBlocks[b - 1];
    const currBlock = updatedBlocks[b];

    if (prevBlock.end > currBlock.start) {
      if (currBlock.start > prevBlock.start + 0.15) {
        prevBlock.end = Number((currBlock.start - 0.02).toFixed(3));
        if (prevBlock.words.length > 0) {
          prevBlock.words[prevBlock.words.length - 1].end = prevBlock.end;
        }
      } else {
        currBlock.start = Number((prevBlock.end + 0.02).toFixed(3));
        if (currBlock.words.length > 0) {
          currBlock.words[0].start = currBlock.start;
        }
      }
    }
  }

  return updatedBlocks;
}

/**
 * Smart Offline Cadence Aligner:
 * For raw text / un-timed words, distributes words proportionally across audio energy speech intervals.
 */
export function alignWordsWithAudioEnergy(
  words: SubtitleWord[],
  audioBuffer: AudioBuffer,
  wordsPerBlock: number = 3
): SubtitleBlock[] {
  if (words.length === 0 || !audioBuffer) return [];

  const profile = computeAudioEnergyProfile(audioBuffer);
  const { speechIntervals } = profile;
  const totalDuration = audioBuffer.duration;

  // Fallback to full duration if no speech intervals detected
  const validIntervals = speechIntervals.length > 0
    ? speechIntervals
    : [{ start: 0.1, end: Math.max(0.8, totalDuration - 0.1), peak: 1 }];

  // Compute total character weight of all words
  const totalCharWeight = words.reduce((sum, w) => sum + Math.max(2, (w.text || '').length), 0);
  const totalSpeechDuration = validIntervals.reduce((sum, int) => sum + Math.max(0.1, int.end - int.start), 0);

  const alignedWords: SubtitleWord[] = [];
  
  // Calculate proportional allocation for each interval based on duration
  let wordIdx = 0;
  for (let intIdx = 0; intIdx < validIntervals.length; intIdx++) {
    const int = validIntervals[intIdx];
    const intDuration = Math.max(0.1, int.end - int.start);
    const intRatio = intDuration / (totalSpeechDuration || 1);

    let intWordCount = Math.round(words.length * intRatio);
    if (intIdx === validIntervals.length - 1) {
      intWordCount = words.length - wordIdx;
    }
    intWordCount = Math.max(1, Math.min(words.length - wordIdx, intWordCount));

    const chunkWords = words.slice(wordIdx, wordIdx + intWordCount);
    if (chunkWords.length === 0) break;

    const chunkTotalChars = chunkWords.reduce((sum, w) => sum + Math.max(2, (w.text || '').length), 0);
    let timeCursor = int.start;

    for (let w = 0; w < chunkWords.length; w++) {
      const wordObj = chunkWords[w];
      const charWeight = Math.max(2, (wordObj.text || '').length);
      const charFraction = charWeight / (chunkTotalChars || 1);

      const wordDuration = Math.max(0.1, intDuration * charFraction * 0.95);
      const startSec = timeCursor;
      const endSec = Math.min(totalDuration, startSec + wordDuration);

      alignedWords.push({
        ...wordObj,
        start: Number(startSec.toFixed(3)),
        end: Number(endSec.toFixed(3)),
      });

      timeCursor = endSec + 0.015;
      if (timeCursor >= totalDuration) break;
    }

    wordIdx += chunkWords.length;
    if (wordIdx >= words.length) break;
  }

  // Ensure strict non-overlapping order for all words
  for (let i = 0; i < alignedWords.length; i++) {
    if (i > 0 && alignedWords[i].start < alignedWords[i - 1].end) {
      alignedWords[i].start = Number((alignedWords[i - 1].end + 0.01).toFixed(3));
    }
    if (alignedWords[i].end <= alignedWords[i].start) {
      alignedWords[i].end = Number((alignedWords[i].start + 0.12).toFixed(3));
    }
    if (alignedWords[i].end > totalDuration) {
      alignedWords[i].end = Number(totalDuration.toFixed(3));
      if (alignedWords[i].start >= alignedWords[i].end) {
        alignedWords[i].start = Number(Math.max(0, alignedWords[i].end - 0.1).toFixed(3));
      }
    }
  }

  // Chunk into SubtitleBlocks
  const blocks: SubtitleBlock[] = [];
  const chunkSize = Math.max(1, wordsPerBlock);

  for (let i = 0; i < alignedWords.length; i += chunkSize) {
    const chunk = alignedWords.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    blocks.push({
      id: `align-b-${i / chunkSize}-${Math.random().toString(36).substring(2, 7)}`,
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      words: chunk,
    });
  }

  return blocks;
}
