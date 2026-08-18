import { useEffect, useRef, useState, useCallback, RefObject } from 'react';
import { AudioSettings } from '../types';
import { calculateNormalizationGain, LoudnessAnalysisResult } from '../utils/audioNormalizer';

export interface AudioPipelineNodes {
  audioCtx: AudioContext;
  sourceNode: MediaElementAudioSourceNode;
  gainNode: GainNode;
  highpassNode: BiquadFilterNode;
  presenceNode: BiquadFilterNode;
  airShelfNode: BiquadFilterNode;
  bassBoostNode: BiquadFilterNode;
  compressorNode: DynamicsCompressorNode;
}

// Global WeakMap to guarantee createMediaElementSource is only invoked once per HTMLMediaElement instance
const mediaElementNodesMap = new WeakMap<HTMLMediaElement, AudioPipelineNodes>();

/**
 * Safely retrieve or create the Web Audio API processing nodes for an HTMLMediaElement.
 * Guarantees createMediaElementSource is only called once per media element instance.
 */
export function getAudioPipelineForMediaElement(video: HTMLMediaElement): AudioPipelineNodes | null {
  if (mediaElementNodesMap.has(video)) {
    return mediaElementNodesMap.get(video)!;
  }
  try {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtxClass();
    const sourceNode = audioCtx.createMediaElementSource(video);
    const gainNode = audioCtx.createGain();

    // 1. High-pass filter for rumble removal (< 85 Hz)
    const highpassNode = audioCtx.createBiquadFilter();
    highpassNode.type = 'highpass';
    highpassNode.frequency.value = 10; // neutral default
    highpassNode.Q.value = 0.707;

    // 2. Vocal Presence Boost (3.4 kHz) - Speech intelligibility and crispness
    const presenceNode = audioCtx.createBiquadFilter();
    presenceNode.type = 'peaking';
    presenceNode.frequency.value = 3400;
    presenceNode.Q.value = 1.1;
    presenceNode.gain.value = 0; // neutral default

    // 3. Air Shelf (9.5 kHz) - High-end shimmer and clarity
    const airShelfNode = audioCtx.createBiquadFilter();
    airShelfNode.type = 'highshelf';
    airShelfNode.frequency.value = 9500;
    airShelfNode.gain.value = 0; // neutral default

    // 4. Bass Boost / Warmth (130 Hz) - Vocal body and chest resonance
    const bassBoostNode = audioCtx.createBiquadFilter();
    bassBoostNode.type = 'peaking';
    bassBoostNode.frequency.value = 130;
    bassBoostNode.Q.value = 1.0;
    bassBoostNode.gain.value = 0; // neutral default

    // 5. Dynamics Compressor / Studio Vocal Leveler
    const compressorNode = audioCtx.createDynamicsCompressor();
    compressorNode.threshold.value = -24.0;
    compressorNode.knee.value = 4.0;
    compressorNode.ratio.value = 3.5;
    compressorNode.attack.value = 0.005;
    compressorNode.release.value = 0.08;

    // Connect node chain
    sourceNode.connect(gainNode);
    gainNode.connect(highpassNode);
    highpassNode.connect(presenceNode);
    presenceNode.connect(airShelfNode);
    airShelfNode.connect(bassBoostNode);
    bassBoostNode.connect(compressorNode);
    compressorNode.connect(audioCtx.destination);

    const nodes: AudioPipelineNodes = {
      audioCtx,
      sourceNode,
      gainNode,
      highpassNode,
      presenceNode,
      airShelfNode,
      bassBoostNode,
      compressorNode,
    };

    mediaElementNodesMap.set(video, nodes);
    return nodes;
  } catch (e) {
    console.warn('Web Audio API pipeline initialization warning:', e);
    return null;
  }
}

export function useAudioNormalizer(
  videoRef: RefObject<HTMLVideoElement | null>,
  audioBuffer: AudioBuffer | null,
  audioSettings: AudioSettings,
  onChangeAudioSettings?: (updated: Partial<AudioSettings>) => void
) {
  const [loudnessResult, setLoudnessResult] = useState<LoudnessAnalysisResult | null>(null);
  const pipelineRef = useRef<AudioPipelineNodes | null>(null);

  // 1. Calculate LUFS loudness and gain normalization when audioBuffer or targetLufs changes
  useEffect(() => {
    if (!audioBuffer) {
      setLoudnessResult(null);
      return;
    }

    const target = audioSettings.targetLufs ?? -14;
    const result = calculateNormalizationGain(audioBuffer, target);
    setLoudnessResult(result);

    // Sync computed values to audioSettings state if changed
    if (
      onChangeAudioSettings &&
      (audioSettings.measuredLufs !== result.measuredLufs ||
        audioSettings.normalizeGainDb !== result.gainDb)
    ) {
      onChangeAudioSettings({
        measuredLufs: result.measuredLufs,
        normalizeGainDb: result.gainDb,
      });
    }
  }, [audioBuffer, audioSettings.targetLufs]);

  // 2. Initialize or retrieve Web Audio API nodes attached to HTMLMediaElement
  const ensureAudioPipeline = useCallback(() => {
    const video = videoRef.current;
    if (!video) return null;
    const pipeline = getAudioPipelineForMediaElement(video);
    if (pipeline) pipelineRef.current = pipeline;
    return pipeline;
  }, [videoRef]);

  // 3. Update Gain, Voice Clarity & Bass Boost EQ in real-time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const pipeline = ensureAudioPipeline();
    if (!pipeline) return;

    const { audioCtx, gainNode, highpassNode, presenceNode, airShelfNode, bassBoostNode } = pipeline;

    // Resume AudioContext if suspended
    if (audioCtx.state === 'suspended') {
      const resumeCtx = () => {
        audioCtx.resume().catch(() => {});
        video.removeEventListener('play', resumeCtx);
      };
      video.addEventListener('play', resumeCtx, { once: true });
    }

    const baseVol = (audioSettings.videoVolume ?? 100) / 100;
    const isAutoNormalize = audioSettings.autoNormalize ?? false;
    const normLinearGain = loudnessResult?.linearGain ?? 1.0;

    const effectiveGain = isAutoNormalize ? baseVol * normLinearGain : baseVol;

    // Apply smooth gain transition over 50ms to prevent audio clicks/pops
    const now = audioCtx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, effectiveGain), now + 0.05);

    // Voice Clarity EQ adjustments (Vocal presence + Air shelf + Rumble filter)
    if (audioSettings.voiceClarity) {
      highpassNode.frequency.setTargetAtTime(85, now, 0.04);
      presenceNode.gain.setTargetAtTime(8.5, now, 0.04); // Noticeable +8.5dB speech intelligibility
      airShelfNode.gain.setTargetAtTime(5.5, now, 0.04);  // +5.5dB high frequency vocal crispness
    } else {
      highpassNode.frequency.setTargetAtTime(10, now, 0.04);
      presenceNode.gain.setTargetAtTime(0, now, 0.04);
      airShelfNode.gain.setTargetAtTime(0, now, 0.04);
    }

    // Bass Boost / Warmth adjustments (+7.5dB chest resonance)
    if (audioSettings.bassBoost) {
      bassBoostNode.gain.setTargetAtTime(7.5, now, 0.04);
    } else {
      bassBoostNode.gain.setTargetAtTime(0, now, 0.04);
    }
  }, [
    videoRef,
    ensureAudioPipeline,
    audioSettings.videoVolume,
    audioSettings.autoNormalize,
    audioSettings.voiceClarity,
    audioSettings.bassBoost,
    loudnessResult,
  ]);

  return {
    loudnessResult,
    ensureAudioPipeline,
  };
}
