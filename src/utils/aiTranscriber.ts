import { SubtitleBlock } from '../types';
import { transcribeAudioOffline } from './speechTranscriber';
import { applySmartAutoCaptionHighlights, detectBlockMoodAndEmoji } from './smartHighlighter';
import { getEmojiForWord } from './emojiMap';

/**
 * Converts an AudioBuffer to a WAV Base64 string for Gemini audio processing
 */
export function audioBufferToWavBase64(buffer: AudioBuffer, targetSampleRate: number = 16000): string {
  const numChannels = 1; // mono for compact payload
  const channelData = buffer.getChannelData(0);
  
  // Downsample if necessary
  const ratio = buffer.sampleRate / targetSampleRate;
  const newLength = Math.floor(channelData.length / ratio);
  const downsampled = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    const originalIndex = Math.floor(i * ratio);
    downsampled[i] = channelData[originalIndex] || 0;
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

  // Convert Uint8Array to base64
  const bytes = new Uint8Array(wavBuffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
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
  onStatusChange?: (status: string) => void
): Promise<SubtitleBlock[]> {
  try {
    if (onStatusChange) onStatusChange('Extracting audio track from video...');
    const wavBase64 = audioBufferToWavBase64(audioBuffer);

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
      return applySmartAutoCaptionHighlights({
        blocks: processed,
        highlightColor: '#FFE600',
        forceAtLeastOnePerBlock: true,
      });
    }

    throw new Error('No AI transcription blocks returned');
  } catch (error: any) {
    console.warn('Gemini AI transcription fallback to offline audio analyzer:', error);
    if (onStatusChange) {
      const msg = error?.message?.includes('high demand') || error?.message?.includes('503')
        ? 'AI service busy — using built-in sentiment analyzer & audio sync...'
        : 'Using built-in sentiment analyzer & audio speech sync...';
      onStatusChange(msg);
    }
    
    const offlineBlocks = await transcribeAudioOffline(audioBuffer, wordsPerBlock);
    
    // Enrich offline blocks with sentiment analysis and mood emoji suggestions
    const sentimentEnriched = offlineBlocks.map(block => {
      const fullText = block.words.map(w => w.text).join(' ');
      const detected = detectBlockMoodAndEmoji(fullText);
      return {
        ...block,
        mood: detected.mood,
        suggestedEmoji: detected.emoji,
      };
    });

    return applySmartAutoCaptionHighlights({
      blocks: sentimentEnriched,
      highlightColor: '#FFE600',
      forceAtLeastOnePerBlock: true,
    });
  }
}
