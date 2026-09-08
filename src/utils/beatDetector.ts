import { BeatMarker } from '../types';

/**
 * Lightweight onset detector for lyric timing. It intentionally returns
 * conservative markers from energy spikes and never changes speech timing.
 */
export function detectBeatMarkers(audioBuffer: AudioBuffer): BeatMarker[] {
  const samples = audioBuffer.getChannelData(0);
  const frameSize = Math.max(1, Math.floor(audioBuffer.sampleRate * 0.02));
  const energies: number[] = [];
  for (let offset = 0; offset < samples.length; offset += frameSize) {
    const end = Math.min(samples.length, offset + frameSize);
    let sum = 0;
    for (let i = offset; i < end; i += 1) sum += Math.abs(samples[i] || 0);
    energies.push(sum / Math.max(1, end - offset));
  }

  const markers: BeatMarker[] = [];
  for (let index = 2; index < energies.length - 2; index += 1) {
    const energy = energies[index];
    const localAverage = (energies[index - 2] + energies[index - 1] + energies[index + 1] + energies[index + 2]) / 4;
    if (energy > Math.max(0.02, localAverage * 1.45)) {
      const time = Number(((index * frameSize) / audioBuffer.sampleRate).toFixed(3));
      if (!markers.length || time - markers[markers.length - 1].time >= 0.12) {
        markers.push({ time, strength: Number(Math.min(1, energy / Math.max(0.001, localAverage)).toFixed(3)) });
      }
    }
  }
  return markers;
}
