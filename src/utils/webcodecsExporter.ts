import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget } from 'webm-muxer';
import {
  SubtitleBlock,
  SubtitleStyle,
  VideoFilter,
  AspectRatio,
  VideoTransformSettings,
  WatermarkSettings,
  ProgressBarSettings,
  AudioSettings,
  ExportResolution,
  ExportFormat,
} from '../types';
import { renderCanvasFrameToContext, getTargetDimensions } from './renderCore';
import { loadGoogleFont } from './googleFonts';
import { getGpuHardwareDiagnostics, GpuHardwareDiagnostics } from './webglPipeline';

export interface WebCodecsExportOptions {
  video: HTMLVideoElement;
  videoFile?: File | null;
  audioBuffer?: AudioBuffer | null;
  blocks: SubtitleBlock[];
  style: SubtitleStyle;
  filter: VideoFilter;
  aspectRatio: AspectRatio;
  transform?: VideoTransformSettings;
  watermark?: WatermarkSettings;
  progressBar?: ProgressBarSettings;
  audioSettings?: AudioSettings;
  fps?: number;
  format?: ExportFormat;
  resolution?: ExportResolution;
  hardwarePreference?: 'prefer-hardware' | 'no-preference' | 'prefer-software';
  signal?: AbortSignal;
  onProgress: (progressPercent: number) => void;
}

export interface HardwareEncoderInfo {
  supported: boolean;
  isHardwareAccelerated: boolean;
  codec: string;
  mode: 'prefer-hardware' | 'no-preference' | 'prefer-software';
  gpuDiagnostics: GpuHardwareDiagnostics;
}

/**
 * Test if the browser runtime supports WebCodecs VideoEncoder & VideoFrame APIs
 */
export function isWebCodecsExportSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.VideoEncoder === 'function' &&
    typeof window.VideoFrame === 'function' &&
    typeof window.VideoEncoder.isConfigSupported === 'function'
  );
}

/**
 * Probes browser WebCodecs for GPU hardware-accelerated encoding capabilities
 */
export async function detectHardwareEncoderSupport(format: ExportFormat = 'mp4'): Promise<HardwareEncoderInfo> {
  const gpuDiag = getGpuHardwareDiagnostics();

  if (!isWebCodecsExportSupported()) {
    return {
      supported: false,
      isHardwareAccelerated: false,
      codec: '',
      mode: 'no-preference',
      gpuDiagnostics: gpuDiag,
    };
  }

  const isMp4Family = format === 'mp4' || format === 'mov';
  const candidates = isMp4Family
    ? [
        'avc1.640033', // High Profile Level 5.1 (4K / 60fps hardware encoding)
        'avc1.64002a', // High Profile Level 4.2 (1080p hardware encoding)
        'avc1.4d002a', // Main Profile Level 4.2
        'avc1.42001f', // Baseline Profile Level 3.1
        'av01.0.08M.08', // AV1 Main Profile
      ]
    : [
        'vp09.00.41.08', // VP9 Profile 0 Level 4.1 (4K hardware acceleration)
        'vp09.00.10.08', // VP9 Profile 0 Level 1.0
        'av01.0.08M.08', // AV1
        'vp8',
      ];

  // 1. Test dedicated GPU Hardware Acceleration first
  for (const codec of candidates) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec,
        width: 1920,
        height: 1080,
        bitrate: 14000000,
        framerate: 60,
        hardwareAcceleration: 'prefer-hardware',
      });
      if (res.supported) {
        return {
          supported: true,
          isHardwareAccelerated: res.config?.hardwareAcceleration !== 'prefer-software',
          codec,
          mode: 'prefer-hardware',
          gpuDiagnostics: gpuDiag,
        };
      }
    } catch {
      // Continue probing next codec profile
    }
  }

  // 2. Fallback to general support probe
  for (const codec of candidates) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec,
        width: 1920,
        height: 1080,
        bitrate: 10000000,
        framerate: 30,
        hardwareAcceleration: 'no-preference',
      });
      if (res.supported) {
        return {
          supported: true,
          isHardwareAccelerated: res.config?.hardwareAcceleration === 'prefer-hardware',
          codec,
          mode: 'no-preference',
          gpuDiagnostics: gpuDiag,
        };
      }
    } catch {
      // Continue probing
    }
  }

  return {
    supported: false,
    isHardwareAccelerated: false,
    codec: '',
    mode: 'prefer-software',
    gpuDiagnostics: gpuDiag,
  };
}

/**
 * Asynchronously waits for video seeking to settle at the exact timestamp with frame readiness guarantee
 */
async function seekVideoToTime(video: HTMLVideoElement, targetTime: number): Promise<void> {
  if (Math.abs(video.currentTime - targetTime) < 0.001 && !video.seeking && video.readyState >= 2) {
    return;
  }

  return new Promise<void>((resolve) => {
    let isSettled = false;
    let rvfcHandle: number | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('canplay', onSeeked);
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      if (rvfcHandle !== null && 'cancelVideoFrameCallback' in video) {
        try {
          (video as unknown as { cancelVideoFrameCallback: (id: number) => void }).cancelVideoFrameCallback(rvfcHandle);
        } catch {
          // ignore
        }
      }
    };

    const finish = () => {
      if (!isSettled) {
        isSettled = true;
        cleanup();
        resolve();
      }
    };

    const onSeeked = () => {
      if ('requestVideoFrameCallback' in video) {
        try {
          rvfcHandle = (video as unknown as {
            requestVideoFrameCallback: (cb: (now: number, metadata: unknown) => void) => number;
          }).requestVideoFrameCallback(() => {
            finish();
          });
          setTimeout(finish, 120);
          return;
        } catch {
          // fall through
        }
      }

      requestAnimationFrame(() => {
        finish();
      });
    };

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('canplay', onSeeked, { once: true });

    try {
      video.currentTime = targetTime;
    } catch {
      finish();
      return;
    }

    safetyTimer = setTimeout(() => {
      finish();
    }, 2500);
  });
}

/**
 * Attempts to retrieve or decode an AudioBuffer for the current video source
 */
async function resolveAudioBuffer(
  providedBuffer?: AudioBuffer | null,
  videoFile?: File | null,
  videoSrc?: string
): Promise<AudioBuffer | null> {
  if (providedBuffer) {
    return providedBuffer;
  }

  const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtxClass) return null;

  try {
    let arrayBuffer: ArrayBuffer | null = null;

    if (videoFile) {
      arrayBuffer = await videoFile.arrayBuffer();
    } else if (videoSrc && !videoSrc.startsWith('blob:') && !videoSrc.startsWith('data:')) {
      const res = await fetch(videoSrc);
      arrayBuffer = await res.arrayBuffer();
    }

    if (arrayBuffer) {
      const ctx = new AudioCtxClass();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      await ctx.close().catch(() => {});
      return decoded;
    }
  } catch (err) {
    console.debug('AudioBuffer decoding skipped in WebCodecs exporter:', err);
  }

  return null;
}

/**
 * Builds a deterministic Set of frame indices requiring IDR keyframes.
 */
function buildKeyframeIndicesSet(
  totalFrames: number,
  targetFps: number,
  startSec: number,
  endSec: number,
  blocks: SubtitleBlock[]
): Set<number> {
  const keyframes = new Set<number>();
  keyframes.add(0);

  // Periodic GOP interval (1.5s)
  const gopInterval = Math.max(15, Math.min(90, Math.round(targetFps * 1.5)));
  for (let i = 0; i < totalFrames; i += gopInterval) {
    keyframes.add(i);
  }

  // Content-aware keyframes on subtitle block transitions to eliminate text smearing
  for (const block of blocks) {
    if (block.start >= startSec && block.start <= endSec) {
      const startIdx = Math.round((block.start - startSec) * targetFps);
      if (startIdx >= 0 && startIdx < totalFrames) {
        keyframes.add(startIdx);
      }
    }
    if (block.end >= startSec && block.end <= endSec) {
      const endIdx = Math.round((block.end - startSec) * targetFps);
      if (endIdx >= 0 && endIdx < totalFrames) {
        keyframes.add(endIdx);
      }
    }
    for (const word of block.words) {
      if (word.start >= startSec && word.start <= endSec) {
        const wordIdx = Math.round((word.start - startSec) * targetFps);
        if (wordIdx >= 0 && wordIdx < totalFrames) {
          keyframes.add(wordIdx);
        }
      }
    }
  }

  return keyframes;
}

/**
 * Web Worker + OffscreenCanvas Video Export Pipeline
 * Offloads canvas rasterization, subtitle font rendering, VideoFrame construction,
 * WebCodecs encoding, and MP4/WebM multiplexing to a separate background thread.
 * Guarantees a 100% unblocked UI thread and deterministic frame capture.
 */
export async function exportVideoWithOffscreenWorker(options: WebCodecsExportOptions): Promise<Blob> {
  const {
    video,
    videoFile,
    audioBuffer: providedAudioBuffer,
    blocks,
    style,
    filter,
    aspectRatio,
    transform,
    watermark,
    progressBar,
    audioSettings,
    fps = 30,
    format = 'mp4',
    resolution = '1080p',
    hardwarePreference = 'prefer-hardware',
    signal,
    onProgress,
  } = options;

  if (signal?.aborted) {
    throw new DOMException('Export cancelled by user', 'AbortError');
  }

  // Preload any required Google fonts on main thread so browser font cache is hot
  if (style.fontFamily) {
    await loadGoogleFont(style.fontFamily);
  }
  if (watermark?.fontFamily) {
    await loadGoogleFont(watermark.fontFamily);
  }
  if ('fonts' in document) {
    await document.fonts.ready.catch(() => {});
  }

  // Flag video element as actively exporting to lock UI listeners
  video.dataset.exporting = 'true';

  const originalTime = video.currentTime;
  const wasMuted = video.muted;
  const wasPlaying = !video.paused;

  const targetFps = Math.min(60, Math.max(15, Math.round(fps || 30)));
  const dims = getTargetDimensions(
    video.videoWidth || 1080,
    video.videoHeight || 1920,
    aspectRatio,
    resolution
  );

  const width = dims.width % 2 === 0 ? dims.width : dims.width - 1;
  const height = dims.height % 2 === 0 ? dims.height : dims.height - 1;

  const startSec = Math.max(0, transform?.trimStart || 0);
  const endSec = transform?.trimEnd && transform.trimEnd > startSec ? transform.trimEnd : (video.duration || 10);
  const exportDuration = Math.max(0.1, endSec - startSec);
  const totalFrames = Math.max(1, Math.round(exportDuration * targetFps));

  const keyframeIndices = buildKeyframeIndicesSet(totalFrames, targetFps, startSec, endSec, blocks);

  let baseBits = 14000000;
  if (resolution === '4k') baseBits = 28000000;
  else if (resolution === '1080p' || resolution === 'source') baseBits = 14000000;
  else if (resolution === '720p') baseBits = 8000000;
  else if (resolution === '480p') baseBits = 4000000;

  const fpsScale = Math.max(0.75, Math.min(2.0, targetFps / 30));
  const videoBitrate = Math.round(baseBits * fpsScale);

  // Audio track preparation
  const decodedAudio = await resolveAudioBuffer(providedAudioBuffer, videoFile, video.src);
  let audioInitData = undefined;

  if (decodedAudio && decodedAudio.numberOfChannels > 0 && decodedAudio.length > 0) {
    const audioSampleRate = decodedAudio.sampleRate;
    const channels = Math.min(2, decodedAudio.numberOfChannels);
    const startSample = Math.max(0, Math.round(startSec * audioSampleRate));
    const endSample = Math.min(decodedAudio.length, Math.round(endSec * audioSampleRate));
    const sliceLength = Math.max(0, endSample - startSample);

    let volumeMultiplier = (audioSettings?.videoVolume ?? 100) / 100;
    if (audioSettings?.autoNormalize && audioSettings.normalizeGainDb) {
      const gainLinear = Math.pow(10, audioSettings.normalizeGainDb / 20);
      volumeMultiplier *= gainLinear;
    }

    const channelData: Float32Array[] = [];
    for (let ch = 0; ch < channels; ch++) {
      const raw = decodedAudio.getChannelData(ch);
      channelData.push(raw);
    }

    audioInitData = {
      sampleRate: audioSampleRate,
      numberOfChannels: channels,
      channelData,
      startSample,
      sliceLength,
      volumeMultiplier,
    };
  }

  // Create Worker
  const worker = new Worker(new URL('../workers/exportWorker.ts', import.meta.url), {
    type: 'module',
  });

  const cleanup = () => {
    delete video.dataset.exporting;
    video.pause();
    video.currentTime = originalTime;
    video.muted = wasMuted;
    if (wasPlaying) {
      video.play().catch(() => {});
    }
  };

  return new Promise<Blob>((resolve, reject) => {
    let isTerminated = false;
    // Concurrency window: allows producer (main thread seek) and consumer (worker GPU OffscreenCanvas render)
    // to execute concurrently in parallel without stalling or memory bloat
    const maxInFlight = resolution === '4k' ? 4 : (resolution === '1080p' ? 8 : 12);
    let inFlightCount = 0;
    const gateResolvers: (() => void)[] = [];

    const notifyFrameDone = () => {
      inFlightCount = Math.max(0, inFlightCount - 1);
      if (inFlightCount < maxInFlight && gateResolvers.length > 0) {
        const next = gateResolvers.shift();
        if (next) next();
      }
    };

    const waitForGate = async () => {
      if (inFlightCount < maxInFlight) return;
      await new Promise<void>((res) => {
        gateResolvers.push(res);
      });
    };

    const flushGateResolvers = () => {
      while (gateResolvers.length > 0) {
        const res = gateResolvers.shift();
        if (res) res();
      }
    };

    const terminateWorker = () => {
      if (!isTerminated) {
        isTerminated = true;
        flushGateResolvers();
        try {
          worker.postMessage({ type: 'ABORT' });
        } catch {}
        try {
          worker.terminate();
        } catch {}
        cleanup();
      }
    };

    if (signal) {
      signal.addEventListener('abort', () => {
        terminateWorker();
        reject(new DOMException('Export cancelled by user', 'AbortError'));
      }, { once: true });
    }

    worker.onmessage = async (e: MessageEvent) => {
      const data = e.data;
      if (!data) return;

      if (data.type === 'READY') {
        try {
          video.pause();
          video.muted = true;

          for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
            if (signal?.aborted || isTerminated) {
              terminateWorker();
              reject(new DOMException('Export cancelled by user', 'AbortError'));
              return;
            }

            // Apply backpressure if worker queue is at capacity
            await waitForGate();

            if (signal?.aborted || isTerminated) return;

            const frameMediaTime = startSec + (frameIdx / targetFps);
            const ptsUs = Math.round((frameIdx * 1000000) / targetFps);
            const nextPtsUs = Math.round(((frameIdx + 1) * 1000000) / targetFps);
            const durationUs = nextPtsUs - ptsUs;

            // 1. Precise frame seek
            await seekVideoToTime(video, frameMediaTime);

            if (signal?.aborted || isTerminated) return;

            // 2. Extract zero-copy ImageBitmap directly from GPU texture memory
            const imageBitmap = await createImageBitmap(video);

            const isKeyFrame = keyframeIndices.has(frameIdx);

            inFlightCount++;

            // 3. Post to worker and transfer ImageBitmap directly into Worker OffscreenCanvas pipeline
            worker.postMessage(
              {
                type: 'RENDER_FRAME',
                frameIdx,
                timestampUs: ptsUs,
                durationUs,
                currentTime: frameMediaTime,
                isKeyFrame,
                imageBitmap,
              },
              [imageBitmap]
            );

            // Yield to main thread UI event loop every 2 frames to guarantee 100% UI responsiveness
            if (frameIdx % 2 === 0) {
              await new Promise((r) => setTimeout(r, 0));
            }
          }

          // Signal finalize once all frames are dispatched to worker pipeline
          worker.postMessage({ type: 'FINALIZE' });
        } catch (loopErr) {
          terminateWorker();
          reject(loopErr);
        }
      } else if (data.type === 'FRAME_PROCESSED') {
        if (typeof data.progress === 'number') {
          onProgress(data.progress);
        }
        notifyFrameDone();
      } else if (data.type === 'COMPLETE') {
        onProgress(100);
        const blob = new Blob([data.buffer], { type: data.mimeType || 'video/mp4' });
        terminateWorker();
        resolve(blob);
      } else if (data.type === 'ERROR') {
        terminateWorker();
        reject(new Error(data.error || 'Web Worker export failed'));
      }
    };

    worker.onerror = (err) => {
      console.error('Worker error event:', err);
      terminateWorker();
      reject(new Error(`Export Web Worker encountered an error: ${err.message || 'Unknown worker error'}`));
    };

    // Send initialization payload
    worker.postMessage({
      type: 'INIT',
      width,
      height,
      targetFps,
      totalFrames,
      startSec,
      endSec,
      blocks,
      style,
      filter,
      aspectRatio,
      transform,
      watermark,
      progressBar,
      resolution,
      format,
      videoBitrate,
      hardwarePreference,
      audio: audioInitData,
    });
  });
}

/**
 * Main WebCodecs entrypoint: executes on the Web Worker OffscreenCanvas engine by default
 * with automatic fallback to in-thread WebCodecs if Web Workers or OffscreenCanvas are unavailable.
 */
export async function exportVideoWithWebCodecs(options: WebCodecsExportOptions): Promise<Blob> {
  const isWorkerSupported = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

  if (isWorkerSupported) {
    try {
      return await exportVideoWithOffscreenWorker(options);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      console.warn('Worker OffscreenCanvas export error, attempting in-thread fallback:', err);
    }
  }

  // Fallback in-thread WebCodecs execution
  return exportVideoWithInThreadWebCodecs(options);
}

/**
 * In-thread fallback implementation for environments without Web Worker OffscreenCanvas support
 */
async function exportVideoWithInThreadWebCodecs(options: WebCodecsExportOptions): Promise<Blob> {
  const {
    video,
    videoFile,
    audioBuffer: providedAudioBuffer,
    blocks,
    style,
    filter,
    aspectRatio,
    transform,
    watermark,
    progressBar,
    audioSettings,
    fps = 30,
    format = 'mp4',
    resolution = '1080p',
    hardwarePreference = 'prefer-hardware',
    signal,
    onProgress,
  } = options;

  if (signal?.aborted) {
    throw new DOMException('Export cancelled by user', 'AbortError');
  }

  video.dataset.exporting = 'true';

  const originalTime = video.currentTime;
  const wasMuted = video.muted;
  const wasPlaying = !video.paused;

  const targetFps = Math.min(60, Math.max(15, Math.round(fps || 30)));
  const dims = getTargetDimensions(
    video.videoWidth || 1080,
    video.videoHeight || 1920,
    aspectRatio,
    resolution
  );

  const width = dims.width % 2 === 0 ? dims.width : dims.width - 1;
  const height = dims.height % 2 === 0 ? dims.height : dims.height - 1;

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width;
  exportCanvas.height = height;
  const ctx = exportCanvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
    willReadFrequently: false,
  });
  if (!ctx) throw new Error('Could not create 2D canvas context');

  const startSec = Math.max(0, transform?.trimStart || 0);
  const endSec = transform?.trimEnd && transform.trimEnd > startSec ? transform.trimEnd : (video.duration || 10);
  const exportDuration = Math.max(0.1, endSec - startSec);
  const totalFrames = Math.max(1, Math.round(exportDuration * targetFps));

  const keyframeIndices = buildKeyframeIndicesSet(totalFrames, targetFps, startSec, endSec, blocks);

  let baseBits = 14000000;
  if (resolution === '4k') baseBits = 28000000;
  else if (resolution === '1080p' || resolution === 'source') baseBits = 14000000;
  else if (resolution === '720p') baseBits = 8000000;
  else if (resolution === '480p') baseBits = 4000000;

  const fpsScale = Math.max(0.75, Math.min(2.0, targetFps / 30));
  const videoBitrate = Math.round(baseBits * fpsScale);

  const decodedAudio = await resolveAudioBuffer(providedAudioBuffer, videoFile, video.src);
  const hasAudio = !!decodedAudio && decodedAudio.numberOfChannels > 0 && decodedAudio.length > 0;
  const isMp4Family = format === 'mp4' || format === 'mov';

  const candidateCodecs = isMp4Family
    ? ['avc1.640033', 'avc1.64002a', 'avc1.4d002a', 'avc1.42001f', 'av01.0.08M.08']
    : ['vp09.00.41.08', 'vp09.00.10.08', 'av01.0.08M.08', 'vp8'];

  let videoCodec = candidateCodecs[0];
  let selectedHardwareAcc: HardwarePreference = hardwarePreference;

  for (const codec of candidateCodecs) {
    try {
      const check = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: videoBitrate,
        framerate: targetFps,
        hardwareAcceleration: hardwarePreference,
      });
      if (check.supported) {
        videoCodec = codec;
        selectedHardwareAcc = check.config?.hardwareAcceleration || hardwarePreference;
        break;
      }
    } catch {}
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let muxer: any;
  let audioEncoder: AudioEncoder | null = null;
  const audioChannels = hasAudio && decodedAudio ? Math.min(2, decodedAudio.numberOfChannels) : 2;
  const audioSampleRate = hasAudio && decodedAudio ? decodedAudio.sampleRate : 48000;

  if (isMp4Family) {
    const target = new Mp4ArrayBufferTarget();
    muxer = new Mp4Muxer({
      target,
      video: {
        codec: 'avc',
        width,
        height,
      },
      audio: hasAudio ? {
        codec: 'aac',
        numberOfChannels: audioChannels,
        sampleRate: audioSampleRate,
      } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'strict',
    });
  } else {
    const target = new WebmArrayBufferTarget();
    muxer = new WebmMuxer({
      target,
      video: {
        codec: 'V_VP9',
        width,
        height,
      },
      audio: hasAudio ? {
        codec: 'A_OPUS',
        numberOfChannels: audioChannels,
        sampleRate: audioSampleRate,
      } : undefined,
      firstTimestampBehavior: 'strict',
      type: format === 'mkv' ? 'matroska' : 'webm',
    });
  }

  let encoderFatalError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      console.error('VideoEncoder internal error:', err);
      encoderFatalError = err;
    },
  });

  videoEncoder.configure({
    codec: videoCodec,
    width,
    height,
    bitrate: videoBitrate,
    framerate: targetFps,
    bitrateMode: 'variable',
    latencyMode: 'quality',
    hardwareAcceleration: selectedHardwareAcc,
  });

  if (hasAudio && decodedAudio && typeof window.AudioEncoder === 'function') {
    const audioCodec = isMp4Family ? 'mp4a.40.2' : 'opus';
    try {
      const audioCheck = await AudioEncoder.isConfigSupported({
        codec: audioCodec,
        numberOfChannels: audioChannels,
        sampleRate: audioSampleRate,
        bitrate: 192000,
      });

      if (audioCheck.supported) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => {
            muxer.addAudioChunk(chunk, meta);
          },
          error: (err) => console.warn('AudioEncoder warning:', err),
        });

        audioEncoder.configure({
          codec: audioCodec,
          numberOfChannels: audioChannels,
          sampleRate: audioSampleRate,
          bitrate: 192000,
        });

        const startSample = Math.max(0, Math.round(startSec * audioSampleRate));
        const endSample = Math.min(decodedAudio.length, Math.round(endSec * audioSampleRate));
        const audioSliceLength = Math.max(0, endSample - startSample);

        let volumeMultiplier = (audioSettings?.videoVolume ?? 100) / 100;
        if (audioSettings?.autoNormalize && audioSettings.normalizeGainDb) {
          const gainLinear = Math.pow(10, audioSettings.normalizeGainDb / 20);
          volumeMultiplier *= gainLinear;
        }
        const audioChunkFrames = 2048;

        for (let offset = 0; offset < audioSliceLength; offset += audioChunkFrames) {
          if (signal?.aborted) throw new DOMException('Export cancelled by user', 'AbortError');

          const currentChunkSize = Math.min(audioChunkFrames, audioSliceLength - offset);
          const audioPtsUs = Math.round((offset * 1000000) / audioSampleRate);

          const planarData = new Float32Array(currentChunkSize * audioChannels);
          for (let ch = 0; ch < audioChannels; ch++) {
            const rawData = decodedAudio.getChannelData(ch);
            const channelOffset = ch * currentChunkSize;
            for (let i = 0; i < currentChunkSize; i++) {
              planarData[channelOffset + i] = (rawData[startSample + offset + i] || 0) * volumeMultiplier;
            }
          }

          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: audioSampleRate,
            numberOfFrames: currentChunkSize,
            numberOfChannels: audioChannels,
            timestamp: audioPtsUs,
            data: planarData,
          });

          audioEncoder.encode(audioData);
          audioData.close();
        }

        await audioEncoder.flush();
      }
    } catch (e) {
      console.warn('AudioEncoder setup error:', e);
    }
  }

  const cleanup = () => {
    delete video.dataset.exporting;
    video.pause();
    video.currentTime = originalTime;
    video.muted = wasMuted;
    if (wasPlaying) {
      video.play().catch(() => {});
    }
  };

  try {
    video.pause();
    video.muted = true;

    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (signal?.aborted) {
        throw new DOMException('Export cancelled by user', 'AbortError');
      }
      if (encoderFatalError) {
        throw encoderFatalError;
      }

      const frameMediaTime = startSec + (frameIdx / targetFps);
      const ptsUs = Math.round((frameIdx * 1000000) / targetFps);
      const nextPtsUs = Math.round(((frameIdx + 1) * 1000000) / targetFps);
      const durationUs = nextPtsUs - ptsUs;

      await seekVideoToTime(video, frameMediaTime);

      renderCanvasFrameToContext({
        ctx,
        canvasWidth: width,
        canvasHeight: height,
        source: video,
        sourceWidth: video.videoWidth || width,
        sourceHeight: video.videoHeight || height,
        currentTime: frameMediaTime,
        duration: exportDuration,
        blocks,
        style,
        filter,
        aspectRatio,
        transform,
        watermark,
        progressBar,
        resolution,
      });

      const vFrame = new VideoFrame(exportCanvas, {
        timestamp: ptsUs,
        duration: durationUs,
      });

      const isKeyFrame = keyframeIndices.has(frameIdx);
      videoEncoder.encode(vFrame, { keyFrame: isKeyFrame });
      vFrame.close();

      if (videoEncoder.encodeQueueSize > 5) {
        await new Promise((resolve) => setTimeout(resolve, 4));
      }

      const progressPct = Math.min(99, Math.round(((frameIdx + 1) / totalFrames) * 100));
      onProgress(progressPct);
    }

    await videoEncoder.flush();
    muxer.finalize();

    cleanup();
    onProgress(100);

    const outBuffer = muxer.target.buffer;
    let outMime = 'video/mp4';
    if (format === 'webm') outMime = 'video/webm';
    else if (format === 'mov') outMime = 'video/quicktime';
    else if (format === 'mkv') outMime = 'video/x-matroska';

    return new Blob([outBuffer], { type: outMime });
  } catch (err) {
    cleanup();
    try {
      videoEncoder.close();
    } catch {}
    if (audioEncoder) {
      try {
        audioEncoder.close();
      } catch {}
    }
    throw err;
  }
}
