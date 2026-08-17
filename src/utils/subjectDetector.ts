// Utility to analyze video frame pixels and compute Smart Focal Center & Auto-Crop Pan coordinates

export interface SubjectFocalResult {
  focalXPercent: number; // -50% to +50% relative to center
  focalYPercent: number; // -50% to +50% relative to center
  recommendedPanX: number; // Recommended transform.panX (-50 to +50)
  recommendedPanY: number; // Recommended transform.panY (-50 to +50)
  recommendedScale: number; // Recommended zoom scale
  detectedType: 'face_speaker' | 'gameplay_action' | 'centered_subject';
  confidence: number; // 0 to 1
  description: string;
}

export function detectSubjectFocalPoint(
  videoElement: HTMLVideoElement | null
): SubjectFocalResult {
  if (!videoElement || videoElement.readyState < 2) {
    return {
      focalXPercent: 0,
      focalYPercent: 0,
      recommendedPanX: 0,
      recommendedPanY: 0,
      recommendedScale: 1.2,
      detectedType: 'centered_subject',
      confidence: 0.5,
      description: 'Default Center Focus',
    };
  }

  try {
    const canvas = document.createElement('canvas');
    const vw = videoElement.videoWidth || 640;
    const vh = videoElement.videoHeight || 360;

    // Scale down for fast pixel analysis
    const sampleWidth = 160;
    const sampleHeight = 90;
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    ctx.drawImage(videoElement, 0, 0, sampleWidth, sampleHeight);
    const imgData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = imgData.data;

    let totalWeight = 0;
    let weightedXSum = 0;
    let weightedYSum = 0;
    let skinPixelCount = 0;
    let skinXSum = 0;
    let skinYSum = 0;

    // Scan pixels for interest: luminance contrast & skin-tone clusters (face/speaker)
    for (let y = 0; y < sampleHeight; y++) {
      for (let x = 0; x < sampleWidth; x++) {
        const idx = (y * sampleWidth + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Skin tone detection heuristic (normalized RGB space)
        const isSkin =
          r > 95 &&
          g > 40 &&
          b > 20 &&
          r > g &&
          r > b &&
          Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
          Math.abs(r - g) > 15;

        if (isSkin) {
          skinPixelCount++;
          skinXSum += x;
          skinYSum += y;
        }

        // Detail / Contrast energy (gradient approximation)
        let edgeEnergy = 0;
        if (x < sampleWidth - 1 && y < sampleHeight - 1) {
          const rightIdx = idx + 4;
          const rR = data[rightIdx];
          const diffR = Math.abs(r - rR);
          edgeEnergy = diffR;
        }

        const weight = edgeEnergy + (isSkin ? 120 : 0);
        totalWeight += weight;
        weightedXSum += x * weight;
        weightedYSum += y * weight;
      }
    }

    let focalXNorm = 0.5; // 0.0 to 1.0 across width
    let focalYNorm = 0.5; // 0.0 to 1.0 across height
    let detectedType: SubjectFocalResult['detectedType'] = 'centered_subject';
    let description = 'Centered Subject Focus';
    let confidence = 0.7;

    if (skinPixelCount > 80) {
      // High skin density detected -> Face / Speaker detected
      focalXNorm = skinXSum / skinPixelCount / sampleWidth;
      focalYNorm = skinYSum / skinPixelCount / sampleHeight;
      detectedType = 'face_speaker';
      confidence = 0.88;
      description = `Face & Speaker Detected at ${Math.round(focalXNorm * 100)}% Width`;
    } else if (totalWeight > 0) {
      // High detail / contrast area detected
      focalXNorm = weightedXSum / totalWeight / sampleWidth;
      focalYNorm = weightedYSum / totalWeight / sampleHeight;
      detectedType = 'gameplay_action';
      confidence = 0.75;
      description = `Action Focal Region at ${Math.round(focalXNorm * 100)}% Width`;
    }

    // Convert normalized (0..1) to Pan offset percentage (-50% to +50%)
    // If subject is at 25% (left side), we need to shift right (+panX)
    // If subject is at 75% (right side), we need to shift left (-panX)
    const panX = Math.round((0.5 - focalXNorm) * 100);
    const panY = Math.round((0.5 - focalYNorm) * 100);

    return {
      focalXPercent: Math.round((focalXNorm - 0.5) * 100),
      focalYPercent: Math.round((focalYNorm - 0.5) * 100),
      recommendedPanX: Math.max(-45, Math.min(45, panX * 1.2)),
      recommendedPanY: Math.max(-30, Math.min(30, panY)),
      recommendedScale: 1.25,
      detectedType,
      confidence,
      description,
    };
  } catch (err) {
    console.warn('Smart subject detection warning:', err);
    return {
      focalXPercent: 0,
      focalYPercent: 0,
      recommendedPanX: 0,
      recommendedPanY: 0,
      recommendedScale: 1.2,
      detectedType: 'centered_subject',
      confidence: 0.5,
      description: 'Default Center Focus',
    };
  }
}
