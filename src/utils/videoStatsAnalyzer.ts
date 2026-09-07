import { SourceVideoStats } from '../types';

/**
 * Format bytes into human readable string (KB, MB, GB)
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = (seconds % 60).toFixed(1);
  const secInt = Math.floor(seconds % 60);
  const secPad = String(secInt).padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${secPad}`;
  }
  return `${mins}:${secPad} (${secs}s)`;
}

/**
 * Fast ISO Base Media File Format (MP4 / MOV / M4V) Atom Parser to extract precise framerate & codec
 */
async function parseMp4FrameRate(file: File): Promise<{ fps: number; codec?: string } | null> {
  try {
    // Read first 512KB to find moov and tracks (usually at start or near start)
    // If not in first 512KB, read last 512KB (moov at end)
    let buffer = await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer();
    let result = parseMp4Buffer(new DataView(buffer));
    
    if (!result && file.size > 512 * 1024) {
      const tailOffset = Math.max(0, file.size - 512 * 1024);
      const tailBuffer = await file.slice(tailOffset, file.size).arrayBuffer();
      result = parseMp4Buffer(new DataView(tailBuffer));
    }
    
    return result;
  } catch (err) {
    console.debug('MP4 metadata parsing notice:', err);
    return null;
  }
}

function parseMp4Buffer(view: DataView): { fps: number; codec?: string } | null {
  let offset = 0;
  const len = view.byteLength;

  let currentTimescale = 0;
  let sampleDelta = 0;
  let codec: string | undefined;

  while (offset + 8 <= len) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );

    if (size === 0) break;
    const boxSize = size === 1 && offset + 16 <= len ? Number(view.getBigUint64(offset + 8)) : size;
    if (boxSize < 8) break;

    if (type === 'moov' || type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl') {
      // Step into container box
      offset += 8;
      continue;
    }

    if (type === 'mdhd') {
      // Media Header box
      if (offset + 24 <= len) {
        const version = view.getUint8(offset + 8);
        const timescaleOffset = version === 1 ? offset + 8 + 4 + 16 : offset + 8 + 4 + 8;
        if (timescaleOffset + 4 <= len) {
          currentTimescale = view.getUint32(timescaleOffset);
        }
      }
    }

    if (type === 'stts') {
      // Time-to-Sample box: gives exact frame duration
      if (offset + 16 <= len) {
        const entryCount = view.getUint32(offset + 12);
        if (entryCount > 0 && offset + 24 <= len) {
          sampleDelta = view.getUint32(offset + 20);
        }
      }
    }

    if (type === 'stsd') {
      // Sample Description: check codec
      if (offset + 16 <= len) {
        const entryCount = view.getUint32(offset + 12);
        if (entryCount > 0 && offset + 20 <= len) {
          const formatCode = String.fromCharCode(
            view.getUint8(offset + 16),
            view.getUint8(offset + 17),
            view.getUint8(offset + 18),
            view.getUint8(offset + 19)
          );
          if (formatCode === 'avc1') codec = 'H.264 / AVC';
          else if (formatCode === 'hvc1' || formatCode === 'hev1') codec = 'H.265 / HEVC';
          else if (formatCode === 'vp09') codec = 'VP9';
          else if (formatCode === 'av01') codec = 'AV1';
          else if (formatCode.startsWith('ap')) codec = 'Apple ProRes';
        }
      }
    }

    if (currentTimescale > 0 && sampleDelta > 0) {
      const rawFps = currentTimescale / sampleDelta;
      if (rawFps >= 1 && rawFps <= 240) {
        return { fps: sanitizeFps(rawFps), codec };
      }
    }

    offset += boxSize;
  }

  if (currentTimescale > 0 && sampleDelta > 0) {
    const rawFps = currentTimescale / sampleDelta;
    if (rawFps >= 1 && rawFps <= 240) {
      return { fps: sanitizeFps(rawFps), codec };
    }
  }

  return null;
}

/**
 * Fast WebM / EBML Parser to extract DefaultDuration (nanoseconds per frame)
 */
async function parseWebmFrameRate(file: File): Promise<{ fps: number; codec?: string } | null> {
  try {
    const buffer = await file.slice(0, Math.min(file.size, 256 * 1024)).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // Check WebM signature: 1A 45 DF A3
    if (bytes[0] !== 0x1A || bytes[1] !== 0x45 || bytes[2] !== 0xDF || bytes[3] !== 0xA3) {
      return null;
    }

    // Search for DefaultDuration element ID: 0x23 0xE3 0x83
    for (let i = 0; i < bytes.length - 8; i++) {
      if (bytes[i] === 0x23 && bytes[i + 1] === 0xE3 && bytes[i + 2] === 0x83) {
        // Next byte is length (typically 0x84 or 0x88)
        const len = bytes[i + 3] & 0x07;
        let val = 0;
        for (let j = 0; j < len; j++) {
          val = (val << 8) | bytes[i + 4 + j];
        }
        if (val > 0) {
          const fps = 1_000_000_000 / val;
          if (fps >= 1 && fps <= 240) {
            return { fps: sanitizeFps(fps), codec: 'VP9 / WebM' };
          }
        }
      }
    }
  } catch (err) {
    console.debug('WebM metadata parsing notice:', err);
  }
  return null;
}

/**
 * Probes HTMLVideoElement via requestVideoFrameCallback if available
 */
async function probeVideoElementFps(video: HTMLVideoElement): Promise<number | null> {
  if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) {
    return null;
  }

  return new Promise<number | null>(resolve => {
    let count = 0;
    const timestamps: number[] = [];
    let timeoutId: NodeJS.Timeout;

    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      timestamps.push(metadata.presentationTime || metadata.expectedDisplayTime);
      count++;
      if (count >= 6) {
        clearTimeout(timeoutId);
        // Calculate average delta between consecutive frames
        const deltas: number[] = [];
        for (let i = 1; i < timestamps.length; i++) {
          const diff = timestamps[i] - timestamps[i - 1];
          if (diff > 0.005 && diff < 0.2) {
            deltas.push(diff);
          }
        }
        if (deltas.length > 0) {
          const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
          const calculatedFps = 1 / avgDelta;
          resolve(sanitizeFps(calculatedFps));
        } else {
          resolve(null);
        }
      } else {
        (video as any).requestVideoFrameCallback(onFrame);
      }
    };

    timeoutId = setTimeout(() => {
      resolve(null);
    }, 400);

    try {
      (video as any).requestVideoFrameCallback(onFrame);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Snaps floating framerate calculations to standard industry standards (e.g. 29.97 -> 29.97 or 30)
 */
export function sanitizeFps(rawFps: number): number {
  if (isNaN(rawFps) || rawFps <= 0) return 30;

  // Check proximity to standard frame rates (within 0.35)
  if (Math.abs(rawFps - 23.976) < 0.25 || Math.abs(rawFps - 24) < 0.25) return 24;
  if (Math.abs(rawFps - 25) < 0.25) return 25;
  if (Math.abs(rawFps - 29.97) < 0.35 || Math.abs(rawFps - 30) < 0.35) return 30;
  if (Math.abs(rawFps - 50) < 0.35) return 50;
  if (Math.abs(rawFps - 59.94) < 0.5 || Math.abs(rawFps - 60) < 0.5) return 60;
  if (Math.abs(rawFps - 120) < 1.0) return 120;

  return Math.round(rawFps * 100) / 100;
}

/**
 * Format FPS into a clean user-facing string
 */
export function formatFps(fps: number): string {
  if (fps === 23.976 || fps === 23.98) return '24 FPS (23.98)';
  if (fps === 29.97) return '30 FPS (29.97)';
  if (fps === 59.94) return '60 FPS (59.94)';
  if (Number.isInteger(fps)) return `${fps} FPS`;
  return `${fps.toFixed(2)} FPS`;
}

/**
 * Full Analysis Engine: Inspects Video element, Video File, and Audio Buffer
 */
export async function analyzeVideoSource({
  video,
  file,
  audioBuffer,
  fallbackDuration,
}: {
  video?: HTMLVideoElement | null;
  file?: File | null;
  audioBuffer?: AudioBuffer | null;
  fallbackDuration?: number;
}): Promise<SourceVideoStats> {
  const width = video?.videoWidth || 1920;
  const height = video?.videoHeight || 1080;
  const duration = (video?.duration && !isNaN(video.duration) && video.duration > 0)
    ? video.duration
    : fallbackDuration || 10;

  // Aspect ratio calculations
  const ratio = width / height;
  let aspectRatioLabel = '16:9 Widescreen';
  let orientation: 'landscape' | 'portrait' | 'square' | 'custom' = 'landscape';

  if (Math.abs(ratio - 9 / 16) < 0.06) {
    aspectRatioLabel = '9:16 Vertical (Shorts/Reels/TikTok)';
    orientation = 'portrait';
  } else if (Math.abs(ratio - 16 / 9) < 0.06) {
    aspectRatioLabel = '16:9 Landscape (YouTube/Desktop)';
    orientation = 'landscape';
  } else if (Math.abs(ratio - 1) < 0.06) {
    aspectRatioLabel = '1:1 Square (Instagram Post)';
    orientation = 'square';
  } else if (Math.abs(ratio - 4 / 5) < 0.06) {
    aspectRatioLabel = '4:5 Vertical (Instagram Feed)';
    orientation = 'portrait';
  } else if (ratio < 0.9) {
    aspectRatioLabel = `Custom Vertical (${ratio.toFixed(2)}:1)`;
    orientation = 'portrait';
  } else if (ratio > 1.1) {
    aspectRatioLabel = `Custom Landscape (${ratio.toFixed(2)}:1)`;
    orientation = 'landscape';
  } else {
    aspectRatioLabel = `Custom Ratio (${ratio.toFixed(2)}:1)`;
    orientation = 'custom';
  }

  const aspectRatioFormatted = `${width} × ${height} (${ratio.toFixed(2)}:1)`;

  // Frame rate extraction (file binary headers -> video frame probe -> standard heuristic)
  let detectedFps = 30;
  let detectedCodec: string | undefined;

  if (file) {
    const isMp4 = file.type.includes('mp4') || file.name.endsWith('.mp4') || file.name.endsWith('.mov') || file.type.includes('quicktime');
    const isWebm = file.type.includes('webm') || file.name.endsWith('.webm') || file.name.endsWith('.mkv');

    if (isMp4) {
      const mp4Result = await parseMp4FrameRate(file);
      if (mp4Result && mp4Result.fps) {
        detectedFps = mp4Result.fps;
        detectedCodec = mp4Result.codec;
      }
    } else if (isWebm) {
      const webmResult = await parseWebmFrameRate(file);
      if (webmResult && webmResult.fps) {
        detectedFps = webmResult.fps;
        detectedCodec = webmResult.codec;
      }
    }
  }

  if (detectedFps === 30 && video) {
    const probeFps = await probeVideoElementFps(video);
    if (probeFps && probeFps >= 10 && probeFps <= 120) {
      detectedFps = probeFps;
    }
  }

  // Bitrate and File Size
  const fileSize = file?.size;
  const fileSizeFormatted = fileSize ? formatBytes(fileSize) : undefined;
  let bitrateKbps: number | undefined;
  let bitrateFormatted: string | undefined;

  if (fileSize && duration > 0) {
    const totalBits = fileSize * 8;
    const bps = totalBits / duration;
    bitrateKbps = Math.round(bps / 1000);
    if (bps >= 1_000_000) {
      bitrateFormatted = `${(bps / 1_000_000).toFixed(1)} Mbps`;
    } else {
      bitrateFormatted = `${Math.round(bps / 1000)} kbps`;
    }
  }

  // Audio Specifications
  let audioChannels = audioBuffer?.numberOfChannels;
  let audioSampleRate = audioBuffer?.sampleRate;
  let audioFormatted: string | undefined;

  if (audioSampleRate) {
    const rateKhz = (audioSampleRate / 1000).toFixed(1);
    const chLabel = audioChannels === 1 ? 'Mono (1 ch)' : audioChannels === 2 ? 'Stereo (2 ch)' : `${audioChannels} Channels`;
    audioFormatted = `${rateKhz} kHz • ${chLabel}`;
  } else {
    audioFormatted = 'Embedded AAC / Stereo';
  }

  return {
    width,
    height,
    aspectRatioLabel,
    aspectRatioFormatted,
    fps: detectedFps,
    fpsFormatted: formatFps(detectedFps),
    duration,
    durationFormatted: formatDuration(duration),
    fileSize,
    fileSizeFormatted,
    bitrateKbps,
    bitrateFormatted,
    fileName: file?.name || 'project_video.mp4',
    mimeType: file?.type || 'video/mp4',
    codec: detectedCodec || (file?.name.endsWith('.webm') ? 'VP9 / Opus' : 'H.264 / AAC'),
    audioChannels,
    audioSampleRate,
    audioFormatted,
    orientation,
    isHighFramerate: detectedFps >= 50,
  };
}
