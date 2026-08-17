import { useEffect, useRef, useState, useCallback, RefObject } from 'react';
import { AudioSettings } from '../types';
import { calculateNormalizationGain, LoudnessAnalysisResult } from '../utils/audioNormalizer';

export interface AudioPipelineNodes {
  audioCtx: AudioContext;
  sourceNode: MediaElementAudioSourceNode;
  gainNode: GainNode;
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
    const compressorNode = audioCtx.createDynamicsCompressor();

    // Brickwall limiter
    compressorNode.threshold.value = -1.0;
    compressorNode.knee.value = 0.0;
    compressorNode.ratio.value = 20.0;
    compressorNode.attack.value = 0.003;
    compressorNode.release.value = 0.1;

    sourceNode.connect(gainNode);
    gainNode.connect(compressorNode);
    compressorNode.connect(audioCtx.destination);

    const nodes: AudioPipelineNodes = {
      audioCtx,
      sourceNode,
      gainNode,
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

    if (mediaElementNodesMap.has(video)) {
      const existing = mediaElementNodesMap.get(video)!;
      pipelineRef.current = existing;
      return existing;
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      const sourceNode = audioCtx.createMediaElementSource(video);
      const gainNode = audioCtx.createGain();
      const compressorNode = audioCtx.createDynamicsCompressor();

      // Configure gentle brickwall safety limiter (-1 dBFS threshold)
      compressorNode.threshold.value = -1.0;
      compressorNode.knee.value = 0.0;
      compressorNode.ratio.value = 20.0;
      compressorNode.attack.value = 0.003;
      compressorNode.release.value = 0.1;

      // Connect source -> gain -> compressor -> destination
      sourceNode.connect(gainNode);
      gainNode.connect(compressorNode);
      compressorNode.connect(audioCtx.destination);

      const nodes: AudioPipelineNodes = {
        audioCtx,
        sourceNode,
        gainNode,
        compressorNode,
      };

      mediaElementNodesMap.set(video, nodes);
      pipelineRef.current = nodes;
      return nodes;
    } catch (e) {
      console.warn('Web Audio API normalization pipeline initialization warning:', e);
      return null;
    }
  }, [videoRef]);

  // 3. Update Gain Node volume in real-time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const pipeline = ensureAudioPipeline();
    if (!pipeline) return;

    const { audioCtx, gainNode } = pipeline;

    // Resume AudioContext if suspended
    if (audioCtx.state === 'suspended') {
      const resumeCtx = () => {
        audioCtx.resume();
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
  }, [
    videoRef,
    ensureAudioPipeline,
    audioSettings.videoVolume,
    audioSettings.autoNormalize,
    loudnessResult,
  ]);

  return {
    loudnessResult,
    ensureAudioPipeline,
  };
}
