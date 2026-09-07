import { SubtitleBlock } from '../types';
import { transcribeWithWhisperCpp, WhisperProgressCallback } from './whisperEngine';

/**
 * Offline Audio Speech Transcriber & Subtitle Generator
 * Powered by client-side Whisper.cpp architecture (16kHz audio normalization,
 * Mel-spectrogram framing, and VAD speech segment alignment).
 */

export async function transcribeAudioOffline(
  audioBuffer: AudioBuffer,
  wordsPerBlock: number = 3,
  language: string = 'auto',
  onProgress?: WhisperProgressCallback,
  modelId: string = 'whisper-base'
): Promise<SubtitleBlock[]> {
  return transcribeWithWhisperCpp(audioBuffer, {
    wordsPerBlock,
    language,
    modelId,
    onProgress,
  });
}
