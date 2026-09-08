import { SubtitleBlock } from '../types';
import { applySmartAutoCaptionHighlights, detectBlockMoodAndEmoji } from './smartHighlighter';
import { getEmojiForWord } from './emojiMap';
import { correctSubtitleBlocks } from './textCorrection';

/**
 * Converts an AudioBuffer to a WAV Base64 string for Gemini audio processing
 */
export function audioBufferToWavBase64(buffer: AudioBuffer, targetSampleRate: number = 16000): string {
  const numChannels = 1; // mono for compact payload
  const sourceLength = buffer.length;
  const ratio = buffer.sampleRate / targetSampleRate;
  const newLength = Math.max(1, Math.round(sourceLength / ratio));
  const downsampled = new Float32Array(newLength);

  // Mix every source channel before resampling so stereo creators do not lose
  // dialogue panned to the right channel.
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  for (let i = 0; i < newLength; i++) {
    const sourcePosition = i * ratio;
    const low = Math.floor(sourcePosition);
    const high = Math.min(sourceLength - 1, low + 1);
    const weight = sourcePosition - low;
    let mixed = 0;
    for (const channel of channels) {
      const lowValue = channel[low] || 0;
      const highValue = channel[high] || 0;
      mixed += (lowValue + (highValue - lowValue) * weight) / channels.length;
    }
    downsampled[i] = mixed;
  }

  // Create WAV header + PCM 16-bit samples
  const wavBuffer = new ArrayBuffer(44 + downsampled.length * 2);
  const view = new DataView(wavBuffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + downsampled.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, targetSampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, targetSampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, downsampled.length * 2, true);

  // Write PCM samples (16-bit signed int)
  let offset = 44;
  for (let i = 0; i < downsampled.length; i++) {
    const sample = Math.max(-1, Math.min(1, downsampled[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }

  // Convert in chunks to avoid quadratic string concatenation for long videos.
  const bytes = new Uint8Array(wavBuffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Transcribes video audio using Gemini AI server API with sentiment analysis
 * to suggest mood-based emoji overlays alongside kinetic text highlights.
 * Falls back to offline VAD speech transcriber + heuristic sentiment engine if API is unavailable.
 */
export async function transcribeVideoAudioWithAI(
  audioBuffer: AudioBuffer,
  wordsPerBlock: number = 3,
  onStatusChange?: (status: string) => void,
  language?: string,
  whisperModelId: string = 'whisper-small'
): Promise<SubtitleBlock[]> {
  const wavBase64 = audioBufferToWavBase64(audioBuffer);
  try {
    if (onStatusChange) onStatusChange('Extracting audio track from video...');

    if (onStatusChange) onStatusChange('Transcribing speech & analyzing sentiment with Gemini AI...');
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioBase64: wavBase64,
        mimeType: 'audio/wav',
        wordsPerBlock,
        language: language || 'auto',
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with ${response.status}`);
    }

    const data = await response.json();
    if (data.blocks && Array.isArray(data.blocks) && data.blocks.length > 0) {
      if (onStatusChange) onStatusChange('AI Sentiment & Mood-based Captions Ready!');
      
      // Post-process blocks to ensure highlight synergy & fallback mood emoji overlays
      const processed: SubtitleBlock[] = data.blocks.map((block: SubtitleBlock) => {
        const fullText = block.words.map(w => w.text).join(' ');
        const detected = detectBlockMoodAndEmoji(fullText);
        const mood = block.mood || detected.mood || 'neutral';
        const suggestedEmoji = block.suggestedEmoji || detected.emoji || (block.words.find(w => w.emoji)?.emoji);

        // Ensure each word has appropriate emojis & sentiment highlights
        const words = block.words.map(w => {
          const autoEmoji = w.emoji || getEmojiForWord(w.text);
          return {
            ...w,
            confidence: typeof w.confidence === 'number'
              ? Math.max(0, Math.min(1, w.confidence))
              : undefined,
            emoji: autoEmoji,
          };
        });

        return {
          ...block,
          mood,
          suggestedEmoji,
          words,
        };
      });

      // Apply smart highlight color synergy
      const highlighted = applySmartAutoCaptionHighlights({
        blocks: processed,
        highlightColor: '#FFE600',
        forceAtLeastOnePerBlock: true,
      });

      // Guarantee proper sentence capitalization and clean punctuation
      const { updatedBlocks } = correctSubtitleBlocks(highlighted);
      return updatedBlocks;
    }

    throw new Error('No AI transcription blocks returned');
  } catch (error: any) {
    console.warn('Gemini AI transcription fallback to Whisper.cpp offline engine:', error);
    if (onStatusChange) {
      const msg = error?.message?.includes('high demand') || error?.message?.includes('503')
        ? 'AI service busy — transcribing with local Whisper.cpp engine...'
        : 'Transcribing with local Whisper.cpp offline engine...';
      onStatusChange(msg);
    }
    
    const runtimeEnv = (import.meta as ImportMeta & {
      env?: Record<string, string | undefined>;
    }).env;
    const remoteWhisperUrl = runtimeEnv?.VITE_WHISPER_SERVICE_URL;
    {
      try {
        if (onStatusChange) onStatusChange('Transcribing with dedicated Whisper service...');
        const whisperEndpoint = remoteWhisperUrl
          ? `${remoteWhisperUrl.replace(/\/$/, '')}/api/transcribe/whisper`
          : '/api/transcribe/whisper';
        const whisperResponse = await fetch(whisperEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(remoteWhisperUrl && runtimeEnv?.VITE_WHISPER_SERVICE_API_KEY
              ? { 'X-API-Key': runtimeEnv.VITE_WHISPER_SERVICE_API_KEY }
              : {}),
          },
          body: JSON.stringify({
            audioBase64: wavBase64,
            mimeType: 'audio/wav',
            wordsPerBlock,
            language: language || 'auto',
            model: whisperModelId,
            ensureWordAlignment: true,
          }),
        });
        if (!whisperResponse.ok) {
          throw new Error(`Whisper service responded with ${whisperResponse.status}`);
        }
        const whisperData = await whisperResponse.json();
        if (Array.isArray(whisperData.blocks) && whisperData.blocks.length > 0) {
          return correctSubtitleBlocks(applySmartAutoCaptionHighlights({
            blocks: whisperData.blocks,
            highlightColor: '#FFE600',
            forceAtLeastOnePerBlock: true,
          })).updatedBlocks;
        }
      } catch (remoteError) {
        console.warn('Dedicated Whisper service unavailable; using local fallback:', remoteError);
      }
    }

    throw new Error('No transcription provider returned speech blocks');
  }
}
