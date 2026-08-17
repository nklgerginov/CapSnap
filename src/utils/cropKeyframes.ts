import { CropKeyframe, VideoTransformSettings } from '../types';
import { detectSubjectFocalPoint } from './subjectDetector';

export function getInterpolatedTransform(
  transform: VideoTransformSettings | undefined,
  currentTime: number
): { panX: number; panY: number; scale: number } {
  const defaultPanX = transform?.panX || 0;
  const defaultPanY = transform?.panY || 0;
  const defaultScale = transform?.scale || 1.0;

  const keyframes = transform?.keyframes;
  if (!keyframes || keyframes.length === 0) {
    return { panX: defaultPanX, panY: defaultPanY, scale: defaultScale };
  }

  // Sort keyframes chronologically
  const sorted = [...keyframes].sort((a, b) => a.timestamp - b.timestamp);

  if (currentTime <= sorted[0].timestamp) {
    return {
      panX: sorted[0].panX,
      panY: sorted[0].panY,
      scale: sorted[0].scale,
    };
  }

  if (currentTime >= sorted[sorted.length - 1].timestamp) {
    const last = sorted[sorted.length - 1];
    return {
      panX: last.panX,
      panY: last.panY,
      scale: last.scale,
    };
  }

  // Find bounding keyframes k1 and k2
  let k1 = sorted[0];
  let k2 = sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length - 1; i++) {
    if (currentTime >= sorted[i].timestamp && currentTime <= sorted[i + 1].timestamp) {
      k1 = sorted[i];
      k2 = sorted[i + 1];
      break;
    }
  }

  const durationDiff = k2.timestamp - k1.timestamp;
  if (durationDiff <= 0.001) {
    return { panX: k1.panX, panY: k1.panY, scale: k1.scale };
  }

  const t = (currentTime - k1.timestamp) / durationDiff;
  // Ease-in-out cosine interpolation for organic camera movement tracking
  const easeT = 0.5 - Math.cos(t * Math.PI) / 2;

  const interpolatedPanX = Math.round(k1.panX + (k2.panX - k1.panX) * easeT);
  const interpolatedPanY = Math.round(k1.panY + (k2.panY - k1.panY) * easeT);
  const interpolatedScale = Number((k1.scale + (k2.scale - k1.scale) * easeT).toFixed(2));

  return {
    panX: interpolatedPanX,
    panY: interpolatedPanY,
    scale: interpolatedScale,
  };
}

export function addOrUpdateKeyframe(
  keyframes: CropKeyframe[] = [],
  newKeyframeData: Omit<CropKeyframe, 'id'> & { id?: string }
): CropKeyframe[] {
  const thresholdSec = 0.2; // 200ms proximity replaces keyframe
  const id = newKeyframeData.id || `kf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const existingIndex = keyframes.findIndex(
    k => Math.abs(k.timestamp - newKeyframeData.timestamp) < thresholdSec
  );

  const updatedKf: CropKeyframe = {
    id,
    timestamp: Number(newKeyframeData.timestamp.toFixed(2)),
    panX: newKeyframeData.panX,
    panY: newKeyframeData.panY,
    scale: newKeyframeData.scale,
    label: newKeyframeData.label || `Crop @ ${newKeyframeData.timestamp.toFixed(1)}s`,
  };

  let list: CropKeyframe[];
  if (existingIndex >= 0) {
    list = [...keyframes];
    list[existingIndex] = updatedKf;
  } else {
    list = [...keyframes, updatedKf];
  }

  return list.sort((a, b) => a.timestamp - b.timestamp);
}

export function removeKeyframe(keyframes: CropKeyframe[] = [], id: string): CropKeyframe[] {
  return keyframes.filter(k => k.id !== id);
}

export async function generateAutoTrackingKeyframes(
  videoElement: HTMLVideoElement | null,
  duration: number,
  onProgress?: (progressPct: number) => void
): Promise<CropKeyframe[]> {
  if (!videoElement || duration <= 0) return [];

  const keyframes: CropKeyframe[] = [];
  const intervalSec = 3.0; // Sample every 3 seconds
  const currentBackupTime = videoElement.currentTime;

  const sampleTimes: number[] = [];
  for (let t = 0; t <= duration; t += intervalSec) {
    sampleTimes.push(t);
  }
  if (sampleTimes[sampleTimes.length - 1] < duration) {
    sampleTimes.push(duration);
  }

  for (let i = 0; i < sampleTimes.length; i++) {
    const t = sampleTimes[i];
    videoElement.currentTime = t;

    // Wait for seeked frame
    await new Promise<void>(resolve => {
      const handleSeeked = () => {
        videoElement.removeEventListener('seeked', handleSeeked);
        resolve();
      };
      videoElement.addEventListener('seeked', handleSeeked, { once: true });
      // Fallback timeout
      setTimeout(resolve, 150);
    });

    const focal = detectSubjectFocalPoint(videoElement);
    keyframes.push({
      id: `auto_kf_${i}_${Date.now()}`,
      timestamp: Number(t.toFixed(2)),
      panX: focal.recommendedPanX,
      panY: focal.recommendedPanY,
      scale: Math.max(1.2, focal.recommendedScale),
      label: focal.description,
    });

    if (onProgress) {
      onProgress(Math.round(((i + 1) / sampleTimes.length) * 100));
    }
  }

  // Restore video time
  videoElement.currentTime = currentBackupTime;

  return keyframes.sort((a, b) => a.timestamp - b.timestamp);
}
