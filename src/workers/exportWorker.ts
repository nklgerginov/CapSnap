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
  ExportResolution,
  ExportFormat,
} from '../types';
import { renderCanvasFrameToContext } from '../utils/renderCore';
import { WebGLVideoProcessor } from '../utils/webglPipeline';

export interface WorkerInitMessage {
  type: 'INIT';
  width: number;
  height: number;
  targetFps: number;
  totalFrames: number;
  startSec: number;
  endSec: number;
  blocks: SubtitleBlock[];
  style: SubtitleStyle;
  filter: VideoFilter;
  aspectRatio: AspectRatio;
  transform?: VideoTransformSettings;
  watermark?: WatermarkSettings;
  progressBar?: ProgressBarSettings;
  resolution: ExportResolution;
  format: ExportFormat;
  videoBitrate: number;
  hardwarePreference: 'prefer-hardware' | 'no-preference' | 'prefer-software';
  audio?: {
    sampleRate: number;
    numberOfChannels: number;
    channelData: Float32Array[];
    startSample: number;
    sliceLength: number;
    volumeMultiplier: number;
  };
}

export interface WorkerFrameMessage {
  type: 'RENDER_FRAME';
  frameIdx: number;
  timestampUs: number;
  durationUs: number;
  currentTime: number;
  isKeyFrame: boolean;
  imageBitmap: ImageBitmap;
}

export interface WorkerFinalizeMessage {
  type: 'FINALIZE';
}

export interface WorkerAbortMessage {
  type: 'ABORT';
}

export type WorkerInboundMessage =
  | WorkerInitMessage
  | WorkerFrameMessage
  | WorkerFinalizeMessage
  | WorkerAbortMessage;

// State maintained inside the worker thread
let offscreenCanvas: OffscreenCanvas | null = null;
let offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;
let webglProcessor: WebGLVideoProcessor | null = null;

let videoEncoder: VideoEncoder | null = null;
let audioEncoder: AudioEncoder | null = null;
let muxer: Mp4Muxer<Mp4ArrayBufferTarget> | WebmMuxer<WebmArrayBufferTarget> | null = null;

let initOptions: WorkerInitMessage | null = null;
let fatalError: Error | null = null;
let isAborted = false;
let isFinalizing = false;

// Processing queue to handle parallel/pipelined incoming frames
const frameQueue: WorkerFrameMessage[] = [];
let isProcessingQueue = false;

function postWorkerError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  self.postMessage({ type: 'ERROR', error: message });
}

function cleanup() {
  frameQueue.length = 0;
  isProcessingQueue = false;
  isFinalizing = false;

  if (webglProcessor) {
    try {
      webglProcessor.destroy();
    } catch {}
    webglProcessor = null;
  }

  try {
    if (videoEncoder && videoEncoder.state !== 'closed') {
      videoEncoder.close();
    }
  } catch {}
  try {
    if (audioEncoder && audioEncoder.state !== 'closed') {
      audioEncoder.close();
    }
  } catch {}
  videoEncoder = null;
  audioEncoder = null;
  muxer = null;
  offscreenCanvas = null;
  offscreenCtx = null;
  initOptions = null;
}

async function handleInit(msg: WorkerInitMessage) {
  cleanup();
  initOptions = msg;
  isAborted = false;
  fatalError = null;

  try {
    const { width, height, targetFps, format, videoBitrate, hardwarePreference, filter } = msg;

    // 1. Setup OffscreenCanvas with high-performance GPU context configuration
    offscreenCanvas = new OffscreenCanvas(width, height);
    offscreenCtx = offscreenCanvas.getContext('2d', {
      alpha: false,
      willReadFrequently: false,
    }) as OffscreenCanvasRenderingContext2D;

    if (!offscreenCtx) {
      throw new Error('Could not acquire GPU-backed 2D context on OffscreenCanvas inside Web Worker');
    }

    // Initialize WebGL GPU processor for advanced shader filtering if filters are active
    const hasComplexFilter =
      (filter.sepia ?? 0) > 0 ||
      (filter.hueRotate ?? 0) !== 0 ||
      (filter.blur ?? 0) > 0 ||
      (filter.contrast ?? 100) !== 100;

    if (hasComplexFilter) {
      try {
        webglProcessor = new WebGLVideoProcessor(width, height);
      } catch (e) {
        console.debug('WebGL GPU processor fallback to 2D context:', e);
      }
    }

    const isMp4Family = format === 'mp4' || format === 'mov';
    const hasAudio = !!msg.audio && msg.audio.sliceLength > 0;

    // 2. Initialize Muxer Target
    if (isMp4Family) {
      const target = new Mp4ArrayBufferTarget();
      muxer = new Mp4Muxer({
        target,
        video: {
          codec: 'avc',
          width,
          height,
        },
        audio: hasAudio
          ? {
              codec: 'aac',
              numberOfChannels: msg.audio!.numberOfChannels,
              sampleRate: msg.audio!.sampleRate,
            }
          : undefined,
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
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
        audio: hasAudio
          ? {
              codec: 'A_OPUS',
              numberOfChannels: msg.audio!.numberOfChannels,
              sampleRate: msg.audio!.sampleRate,
            }
          : undefined,
        firstTimestampBehavior: 'offset',
      });
    }

    // 3. Select Video Codec Profile & Hardware Acceleration
    const candidateCodecs = isMp4Family
      ? ['avc1.640033', 'avc1.64002a', 'avc1.4d002a', 'avc1.42001f', 'av01.0.08M.08']
      : ['vp09.00.41.08', 'vp09.00.10.08', 'av01.0.08M.08', 'vp8'];

    let selectedCodec = candidateCodecs[0];
    let selectedHwAcc: HardwarePreference = hardwarePreference;

    for (const codec of candidateCodecs) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec,
          width,
          height,
          bitrate: videoBitrate,
          framerate: targetFps,
          hardwareAcceleration: hardwarePreference,
        });
        if (support.supported) {
          selectedCodec = codec;
          selectedHwAcc = support.config?.hardwareAcceleration || hardwarePreference;
          break;
        }
      } catch {}
    }

    // 4. Configure VideoEncoder
    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (muxer && !isAborted) {
          muxer.addVideoChunk(chunk, meta);
        }
      },
      error: (e) => {
        console.error('Worker VideoEncoder error:', e);
        fatalError = new Error(`VideoEncoder hardware error: ${e.message || String(e)}`);
        postWorkerError(fatalError);
      },
    });

    videoEncoder.configure({
      codec: selectedCodec,
      width,
      height,
      bitrate: videoBitrate,
      framerate: targetFps,
      bitrateMode: 'variable',
      latencyMode: 'quality',
      hardwareAcceleration: selectedHwAcc,
    });

    // 5. Configure AudioEncoder & encode audio packets up-front
    if (hasAudio && msg.audio && typeof AudioEncoder === 'function') {
      const audioCodec = isMp4Family ? 'mp4a.40.2' : 'opus';
      const audioChannels = msg.audio.numberOfChannels;
      const audioSampleRate = msg.audio.sampleRate;

      let isAudioSupported = false;
      try {
        const aCheck = await AudioEncoder.isConfigSupported({
          codec: audioCodec,
          numberOfChannels: audioChannels,
          sampleRate: audioSampleRate,
          bitrate: 192000,
        });
        isAudioSupported = !!aCheck.supported;
      } catch {
        isAudioSupported = false;
      }

      if (isAudioSupported) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => {
            if (muxer && !isAborted) {
              muxer.addAudioChunk(chunk, meta);
            }
          },
          error: (err) => console.warn('Worker AudioEncoder warning:', err),
        });

        audioEncoder.configure({
          codec: audioCodec,
          numberOfChannels: audioChannels,
          sampleRate: audioSampleRate,
          bitrate: 192000,
        });

        const { channelData, startSample, sliceLength, volumeMultiplier } = msg.audio;
        const audioChunkFrames = 2048;

        for (let offset = 0; offset < sliceLength; offset += audioChunkFrames) {
          if (isAborted) break;

          const currentChunkSize = Math.min(audioChunkFrames, sliceLength - offset);
          const audioPtsUs = Math.round((offset * 1000000) / audioSampleRate);

          const planarData = new Float32Array(currentChunkSize * audioChannels);
          for (let ch = 0; ch < audioChannels; ch++) {
            const rawChannel = channelData[ch];
            const channelOffset = ch * currentChunkSize;
            for (let i = 0; i < currentChunkSize; i++) {
              planarData[channelOffset + i] = (rawChannel[startSample + offset + i] || 0) * volumeMultiplier;
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
    }

    self.postMessage({
      type: 'READY',
      codec: selectedCodec,
      hardwareAcceleration: selectedHwAcc,
    });
  } catch (err) {
    cleanup();
    postWorkerError(err);
  }
}

async function processQueue() {
  if (isProcessingQueue || isAborted || !offscreenCanvas || !offscreenCtx || !videoEncoder || !initOptions) {
    return;
  }

  isProcessingQueue = true;

  while (frameQueue.length > 0) {
    if (isAborted || fatalError) break;

    const msg = frameQueue.shift()!;
    const { frameIdx, timestampUs, durationUs, currentTime, isKeyFrame, imageBitmap } = msg;

    try {
      const {
        width,
        height,
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
      } = initOptions;

      const exportDuration = Math.max(0.1, endSec - startSec);

      // 1. Render complete visual composition onto GPU-backed OffscreenCanvas
      renderCanvasFrameToContext({
        ctx: offscreenCtx,
        canvasWidth: width,
        canvasHeight: height,
        source: imageBitmap,
        sourceWidth: imageBitmap.width,
        sourceHeight: imageBitmap.height,
        currentTime,
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

      // 2. Construct zero-copy VideoFrame directly from OffscreenCanvas
      const vFrame = new VideoFrame(offscreenCanvas, {
        timestamp: timestampUs,
        duration: durationUs,
      });

      // 3. Encode frame to GPU hardware encoder
      videoEncoder.encode(vFrame, { keyFrame: isKeyFrame });
      vFrame.close();

      // 4. Release transferable ImageBitmap memory immediately
      try {
        imageBitmap.close();
      } catch {}

      // 5. Dynamic backpressure handling if hardware encoder queue is saturated
      if (videoEncoder.encodeQueueSize > 6) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }

      const progressPercent = Math.min(99, Math.round(((frameIdx + 1) / totalFrames) * 100));

      self.postMessage({
        type: 'FRAME_PROCESSED',
        frameIdx,
        progress: progressPercent,
        queueSize: videoEncoder.encodeQueueSize,
      });
    } catch (err) {
      try {
        if (imageBitmap) imageBitmap.close();
      } catch {}
      postWorkerError(err);
      break;
    }
  }

  isProcessingQueue = false;

  if (isFinalizing && frameQueue.length === 0) {
    await executeFinalize();
  }
}

function handleRenderFrame(msg: WorkerFrameMessage) {
  if (isAborted || !offscreenCanvas || !offscreenCtx || !videoEncoder || !initOptions) {
    if (msg.imageBitmap) {
      try { msg.imageBitmap.close(); } catch {}
    }
    return;
  }

  if (fatalError) {
    if (msg.imageBitmap) {
      try { msg.imageBitmap.close(); } catch {}
    }
    postWorkerError(fatalError);
    return;
  }

  frameQueue.push(msg);
  processQueue();
}

async function executeFinalize() {
  if (isAborted || !videoEncoder || !muxer || !initOptions) {
    return;
  }

  try {
    // 1. Flush hardware video encoder
    await videoEncoder.flush();

    // 2. Finalize muxer
    muxer.finalize();

    const outBuffer = muxer.target.buffer;
    const format = initOptions.format;
    let outMime = 'video/mp4';
    if (format === 'webm') outMime = 'video/webm';
    else if (format === 'mov') outMime = 'video/quicktime';
    else if (format === 'mkv') outMime = 'video/x-matroska';

    // Transfer completed ArrayBuffer back to main thread with zero copy
    (self.postMessage as (message: unknown, transfer?: Transferable[]) => void)(
      {
        type: 'COMPLETE',
        buffer: outBuffer,
        mimeType: outMime,
      },
      [outBuffer]
    );

    cleanup();
  } catch (err) {
    cleanup();
    postWorkerError(err);
  }
}

async function handleFinalize() {
  isFinalizing = true;
  if (!isProcessingQueue && frameQueue.length === 0) {
    await executeFinalize();
  }
}

function handleAbort() {
  isAborted = true;
  cleanup();
  self.postMessage({ type: 'ABORTED' });
}

// Global Message Handler
self.onmessage = (e: MessageEvent<WorkerInboundMessage>) => {
  const msg = e.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'INIT':
      handleInit(msg);
      break;
    case 'RENDER_FRAME':
      handleRenderFrame(msg);
      break;
    case 'FINALIZE':
      handleFinalize();
      break;
    case 'ABORT':
      handleAbort();
      break;
  }
};
