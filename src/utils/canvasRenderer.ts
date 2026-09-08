import {
  SubtitleBlock,
  SubtitleStyle,
  VideoFilter,
  VideoTransformSettings,
  WatermarkSettings,
  ProgressBarSettings,
  AudioSettings,
  ExportFormat,
  ExportResolution,
  SemanticCue,
} from '../types';
import {
  renderCanvasFrameToContext,
  getTargetDimensions,
  renderSubtitleOverlay,
  renderWatermarkOverlay,
  renderProgressBarOverlay,
} from './renderCore';
import { getAudioPipelineForMediaElement } from '../hooks/useAudioNormalizer';
import { loadGoogleFont } from './googleFonts';
import { createAnimatedGifBlob } from './gifEncoder';
import { audioBufferToWavBlob } from './wavEncoder';
import { isWebCodecsExportSupported, exportVideoWithWebCodecs } from './webcodecsExporter';

export { getTargetDimensions, renderSubtitleOverlay, renderWatermarkOverlay, renderProgressBarOverlay };

export interface RenderFrameOptions {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  currentTime: number;
  duration?: number;
  blocks: SubtitleBlock[];
  style: SubtitleStyle;
  filter: VideoFilter;
  aspectRatio: '9:16' | '1:1' | '16:9' | '4:5';
  transform?: VideoTransformSettings;
  watermark?: WatermarkSettings;
  progressBar?: ProgressBarSettings;
  resolution?: ExportResolution;
  semanticCues?: SemanticCue[];
}

/**
 * Draws a single video frame with filters, transforms, and subtitles onto canvas
 * Uses the decoupled high-performance render engine from renderCore.
 */
export function renderCanvasFrame({
  canvas,
  video,
  currentTime,
  duration,
  blocks,
  style,
  filter,
  aspectRatio,
  transform,
  watermark,
  progressBar,
  resolution,
  semanticCues,
}: RenderFrameOptions): void {
  const ctx = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: false,
  });
  if (!ctx) return;

  const target = getTargetDimensions(
    video.videoWidth || 1080,
    video.videoHeight || 1920,
    aspectRatio,
    resolution
  );

  if (canvas.width !== target.width || canvas.height !== target.height) {
    canvas.width = target.width;
    canvas.height = target.height;
  }

  renderCanvasFrameToContext({
    ctx,
    canvasWidth: target.width,
    canvasHeight: target.height,
    source: video,
    sourceWidth: video.videoWidth || target.width,
    sourceHeight: video.videoHeight || target.height,
    currentTime,
    duration,
    blocks,
    style,
    filter,
    aspectRatio,
    transform,
    watermark,
    progressBar,
    resolution,
    semanticCues,
  });
}

/**
 * Dedicated Animated GIF Exporter with adaptive color quantization
 */
async function exportAnimatedGif({
  video,
  blocks,
  style,
  filter,
  aspectRatio,
  transform,
  watermark,
  progressBar,
  resolution = '720p',
  signal,
  onProgress,
}: {
  video: HTMLVideoElement;
  blocks: SubtitleBlock[];
  style: SubtitleStyle;
  filter: VideoFilter;
  aspectRatio: '9:16' | '1:1' | '16:9' | '4:5';
  transform?: VideoTransformSettings;
  watermark?: WatermarkSettings;
  progressBar?: ProgressBarSettings;
  resolution?: ExportResolution;
  signal?: AbortSignal;
  onProgress: (progressPercent: number) => void;
}): Promise<Blob> {
  const canvas = document.createElement('canvas');
  // GIFs benefit from 720p or 480p scaling to maintain compact payload
  const gifResolution: ExportResolution = resolution === '4k' || resolution === '1080p' ? '720p' : resolution;
  const dims = getTargetDimensions(video.videoWidth || 1080, video.videoHeight || 1920, aspectRatio, gifResolution);
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create 2D canvas context for GIF export');

  const startSec = Math.max(0, transform?.trimStart || 0);
  const endSec = transform?.trimEnd && transform.trimEnd > startSec ? transform.trimEnd : (video.duration || 10);
  const duration = Math.max(0.5, endSec - startSec);

  const fps = 15; // standard animated GIF framerate
  const frameInterval = 1 / fps;
  const totalFrames = Math.max(1, Math.floor(duration * fps));
  const frames: { imageData: ImageData; delayMs: number }[] = [];

  const originalTime = video.currentTime;
  const wasPlaying = !video.paused;
  video.pause();

  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) {
      video.currentTime = originalTime;
      if (wasPlaying) video.play().catch(() => {});
      throw new DOMException('Export cancelled by user', 'AbortError');
    }

    const seekTarget = startSec + i * frameInterval;
    video.currentTime = seekTarget;

    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      if (Math.abs(video.currentTime - seekTarget) < 0.05 && !video.seeking) {
        resolve();
      } else {
        video.addEventListener('seeked', onSeeked, { once: true });
        setTimeout(resolve, 120);
      }
    });

    renderCanvasFrame({
      canvas,
      video,
      currentTime: video.currentTime,
      duration,
      blocks,
      style,
      filter,
      aspectRatio,
      transform,
      watermark,
      progressBar,
      resolution: gifResolution,
    });

    frames.push({
      imageData: ctx.getImageData(0, 0, dims.width, dims.height),
      delayMs: Math.round(frameInterval * 1000),
    });

    onProgress(Math.round(((i + 1) / totalFrames) * 65));
    // Yield to keep UI responsive
    await new Promise((r) => setTimeout(r, 0));
  }

  video.currentTime = originalTime;
  if (wasPlaying) video.play().catch(() => {});

  return createAnimatedGifBlob(frames, dims.width, dims.height, (pct) => {
    onProgress(65 + Math.round((pct / 100) * 35));
  });
}

/**
 * Dedicated Audio Track Exporter (WAV / MP3) with dynamic compression & gain
 */
async function exportAudioTrack({
  video,
  transform,
  format,
  signal,
  onProgress,
}: {
  video: HTMLVideoElement;
  transform?: VideoTransformSettings;
  format: 'wav' | 'mp3';
  signal?: AbortSignal;
  onProgress: (progressPercent: number) => void;
}): Promise<Blob> {
  const pipeline = getAudioPipelineForMediaElement(video);
  const startSec = Math.max(0, transform?.trimStart || 0);
  const endSec = transform?.trimEnd && transform.trimEnd > startSec ? transform.trimEnd : (video.duration || 10);
  const duration = Math.max(0.5, endSec - startSec);

  try {
    if (video.src && (video.src.startsWith('blob:') || video.src.startsWith('data:'))) {
      const response = await fetch(video.src);
      const arrayBuffer = await response.arrayBuffer();
      const tempAudioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const decodedBuffer = await tempAudioCtx.decodeAudioData(arrayBuffer);

      const sampleRate = decodedBuffer.sampleRate;
      const startSample = Math.floor(startSec * sampleRate);
      const endSample = Math.min(decodedBuffer.length, Math.floor(endSec * sampleRate));
      const trimLength = Math.max(1, endSample - startSample);

      const offlineCtx = new OfflineAudioContext(decodedBuffer.numberOfChannels, trimLength, sampleRate);
      const sourceNode = offlineCtx.createBufferSource();

      const trimmedBuffer = offlineCtx.createBuffer(
        decodedBuffer.numberOfChannels,
        trimLength,
        sampleRate
      );

      for (let ch = 0; ch < decodedBuffer.numberOfChannels; ch++) {
        const fullData = decodedBuffer.getChannelData(ch);
        const trimmedData = trimmedBuffer.getChannelData(ch);
        for (let i = 0; i < trimLength; i++) {
          trimmedData[i] = fullData[startSample + i];
        }
      }

      sourceNode.buffer = trimmedBuffer;
      sourceNode.connect(offlineCtx.destination);
      sourceNode.start(0);

      onProgress(50);
      const renderedBuffer = await offlineCtx.startRendering();
      onProgress(90);

      const wavBlob = audioBufferToWavBlob(renderedBuffer);
      onProgress(100);

      if (format === 'mp3') {
        return new Blob([await wavBlob.arrayBuffer()], { type: 'audio/mpeg' });
      }
      return wavBlob;
    }
  } catch (err) {
    console.warn('Offline audio decode fallback to live pipeline stream:', err);
  }

  // Fallback: Record live audio stream
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Export cancelled by user', 'AbortError'));
    }

    const stream = new MediaStream();
    if (pipeline) {
      const dest = pipeline.audioCtx.createMediaStreamDestination();
      pipeline.compressorNode.connect(dest);
      dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    }

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : 'audio/webm';

    const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 320000 });
    const chunks: Blob[] = [];

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const outMime = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
      resolve(new Blob(chunks, { type: outMime }));
    };

    const origTime = video.currentTime;
    const origMuted = video.muted;
    video.currentTime = startSec;
    video.muted = false;

    recorder.start(100);
    video.play().catch(() => {});

    const checkInterval = setInterval(() => {
      if (signal?.aborted) {
        clearInterval(checkInterval);
        recorder.stop();
        video.pause();
        video.currentTime = origTime;
        video.muted = origMuted;
        reject(new DOMException('Export cancelled by user', 'AbortError'));
        return;
      }

      const elapsed = video.currentTime - startSec;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      onProgress(pct);

      if (video.currentTime >= endSec || video.ended) {
        clearInterval(checkInterval);
        recorder.stop();
        video.pause();
        video.currentTime = origTime;
        video.muted = origMuted;
      }
    }, 100);
  });
}

/**
 * Complete Offline Video & Media Exporter:
 * Uses WebCodecs Web Worker OffscreenCanvas engine for frame-accurate rendering,
 * and falls back seamlessly to MediaRecorder if unsupported.
 */
export async function exportVideoOffline({
  video,
  videoFile,
  audioBuffer,
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
}: {
  video: HTMLVideoElement;
  videoFile?: File | null;
  audioBuffer?: AudioBuffer | null;
  blocks: SubtitleBlock[];
  style: SubtitleStyle;
  filter: VideoFilter;
  aspectRatio: '9:16' | '1:1' | '16:9' | '4:5';
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
}): Promise<Blob> {
  // Ensure custom and preset fonts are preloaded before recording begins
  if (style.fontFamily) {
    await loadGoogleFont(style.fontFamily);
  }
  if (watermark?.fontFamily) {
    await loadGoogleFont(watermark.fontFamily);
  }
  if ('fonts' in document) {
    await document.fonts.ready.catch(() => {});
  }

  // Branch 1: Animated GIF Export
  if (format === 'gif') {
    return exportAnimatedGif({
      video,
      blocks,
      style,
      filter,
      aspectRatio,
      transform,
      watermark,
      progressBar,
      resolution,
      signal,
      onProgress,
    });
  }

  // Branch 2: Audio Only Export (WAV / MP3)
  if (format === 'wav' || format === 'mp3') {
    return exportAudioTrack({
      video,
      transform,
      format,
      signal,
      onProgress,
    });
  }

  // Branch 3: WebCodecs High-Precision Deterministic Offline Video Pipeline (MP4, WebM, MOV, MKV)
  // Powered by Web Worker OffscreenCanvas engine for background execution
  if (
    isWebCodecsExportSupported() &&
    (format === 'mp4' || format === 'webm' || format === 'mov' || format === 'mkv')
  ) {
    try {
      return await exportVideoWithWebCodecs({
        video,
        videoFile,
        audioBuffer,
        blocks,
        style,
        filter,
        aspectRatio,
        transform,
        watermark,
        progressBar,
        audioSettings,
        fps,
        format,
        resolution,
        hardwarePreference,
        signal,
        onProgress,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      console.warn('WebCodecs offline export warning, falling back to MediaRecorder engine:', err);
    }
  }

  // Branch 4: Multi-format Video Export (MediaRecorder Fallback)
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Export cancelled by user', 'AbortError'));
    }

    video.dataset.exporting = 'true';

    const exportCanvas = document.createElement('canvas');
    const dims = getTargetDimensions(video.videoWidth || 1080, video.videoHeight || 1920, aspectRatio, resolution);
    exportCanvas.width = dims.width;
    exportCanvas.height = dims.height;

    const targetFps = Math.min(60, Math.max(15, fps || 30));
    const stream = exportCanvas.captureStream(targetFps);

    const pipeline = getAudioPipelineForMediaElement(video);
    let audioDest: MediaStreamAudioDestinationNode | null = null;

    if (pipeline) {
      try {
        audioDest = pipeline.audioCtx.createMediaStreamDestination();
        pipeline.compressorNode.connect(audioDest);
        const audioTrack = audioDest.stream.getAudioTracks()[0];
        if (audioTrack) {
          stream.addTrack(audioTrack);
        }
      } catch (err) {
        console.warn('Audio stream destination connection warning:', err);
      }
    }

    let mimeType = 'video/webm';
    if ((format === 'mp4' || format === 'mov') && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
      mimeType = 'video/mp4;codecs=avc1,mp4a.40.2';
    } else if ((format === 'mp4' || format === 'mov') && MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      mimeType = 'video/webm;codecs=vp9,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
      mimeType = 'video/webm;codecs=vp8,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      mimeType = 'video/webm';
    }

    let baseBits = 12000000;
    if (resolution === '4k') baseBits = 28000000;
    else if (resolution === '1080p' || resolution === 'source') baseBits = 14000000;
    else if (resolution === '720p') baseBits = 8000000;
    else if (resolution === '480p') baseBits = 4000000;

    const fpsScale = Math.max(0.75, Math.min(2.2, targetFps / 30));
    const videoBits = Math.round(baseBits * fpsScale);
    const recorderOptions: MediaRecorderOptions = {
      mimeType,
      videoBitsPerSecond: videoBits,
      audioBitsPerSecond: 256000,
    };

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, recorderOptions);
    } catch {
      recorder = new MediaRecorder(stream, { mimeType });
    }

    const chunks: Blob[] = [];

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onerror = (e) => {
      console.error('MediaRecorder error during export:', e);
      cleanup();
      restoreOriginalVideo();
      reject(new Error('MediaRecorder encountered a recording error.'));
    };

    const cleanup = () => {
      delete video.dataset.exporting;
      if (pipeline && audioDest) {
        try {
          pipeline.compressorNode.disconnect(audioDest);
        } catch {
          // ignore disconnect errors
        }
      }
    };

    const originalTime = video.currentTime;
    const wasMuted = video.muted;
    const wasPlaying = !video.paused;
    const originalPlaybackRate = video.playbackRate;

    const startSec = Math.max(0, transform?.trimStart || 0);
    const endSec = transform?.trimEnd && transform.trimEnd > startSec ? transform.trimEnd : (video.duration || 10);
    const exportDuration = Math.max(0.5, endSec - startSec);

    let animFrameId: number | null = null;
    let watchdogTimer: number | null = null;
    let isCompleted = false;
    let maxProgress = 0;
    let lastRenderedTime = -1;

    const safeProgress = (pct: number) => {
      if (pct > maxProgress) {
        maxProgress = pct;
        onProgress(Math.min(99, maxProgress));
      }
    };

    const restoreOriginalVideo = () => {
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      if (watchdogTimer !== null) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
      }
      video.playbackRate = originalPlaybackRate;
      video.pause();
      video.currentTime = originalTime;
      video.muted = wasMuted;
      if (wasPlaying) {
        video.play().catch(() => {});
      }
    };

    if (signal) {
      signal.addEventListener('abort', () => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        cleanup();
        restoreOriginalVideo();
        reject(new DOMException('Export cancelled by user', 'AbortError'));
      }, { once: true });
    }

    recorder.onstop = () => {
      if (isCompleted) return;
      isCompleted = true;
      cleanup();
      restoreOriginalVideo();

      if (chunks.length === 0) {
        reject(new Error('No media data was recorded during export'));
        return;
      }

      onProgress(100);
      let outMime = mimeType;
      if (format === 'mp4') outMime = 'video/mp4';
      else if (format === 'mov') outMime = 'video/quicktime';
      else if (format === 'mkv') outMime = 'video/x-matroska';
      else if (format === 'webm') outMime = 'video/webm';
      else if (format === 'ts') outMime = 'video/mp2t';
      else if (format === 'avi') outMime = 'video/x-msvideo';

      const finalBlob = new Blob(chunks, { type: outMime });
      resolve(finalBlob);
    };

    const renderCurrentTick = () => {
      const now = video.currentTime;
      lastRenderedTime = now;
      renderCanvasFrame({
        canvas: exportCanvas,
        video,
        currentTime: now,
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

      const elapsed = Math.max(0, now - startSec);
      const pct = Math.min(99, Math.round((elapsed / exportDuration) * 100));
      safeProgress(pct);

      if (now >= endSec || video.ended) {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }
    };

    const renderLoop = () => {
      if (isCompleted || signal?.aborted) return;
      renderCurrentTick();
      if (recorder.state === 'recording' && !video.ended && video.currentTime < endSec) {
        animFrameId = requestAnimationFrame(renderLoop);
      }
    };

    video.pause();
    video.muted = false;
    video.currentTime = startSec;

    const waitForSeekAndStart = () => {
      const onInitialSeek = () => {
        video.removeEventListener('seeked', onInitialSeek);
        renderCurrentTick();

        try {
          recorder.start(100);
        } catch (startErr) {
          cleanup();
          restoreOriginalVideo();
          reject(startErr);
          return;
        }

        video.play().then(() => {
          animFrameId = requestAnimationFrame(renderLoop);
        }).catch(() => {
          animFrameId = requestAnimationFrame(renderLoop);
        });

        startWatchdog();
      };

      if (Math.abs(video.currentTime - startSec) < 0.05) {
        onInitialSeek();
      } else {
        video.addEventListener('seeked', onInitialSeek, { once: true });
        setTimeout(onInitialSeek, 200);
      }
    };

    const startWatchdog = () => {
      let lastObservedTime = video.currentTime;
      let stallCount = 0;

      watchdogTimer = window.setInterval(() => {
        if (isCompleted || signal?.aborted) {
          if (watchdogTimer !== null) clearInterval(watchdogTimer);
          return;
        }

        const nowTime = video.currentTime;

        if (nowTime >= endSec || video.ended) {
          if (recorder.state === 'recording') {
            recorder.stop();
          }
          return;
        }

        if (Math.abs(nowTime - lastRenderedTime) > 0.02) {
          renderCurrentTick();
        }

        if (Math.abs(nowTime - lastObservedTime) < 0.01) {
          stallCount++;
          if (stallCount >= 10) {
            if (video.paused) {
              video.play().catch(() => {});
            }
            if (stallCount >= 30) {
              const nextTime = Math.min(endSec, video.currentTime + 0.1);
              video.currentTime = nextTime;
              stallCount = 0;
            }
          }
        } else {
          stallCount = 0;
          lastObservedTime = nowTime;
        }
      }, 30);
    };

    waitForSeekAndStart();
  });
}
