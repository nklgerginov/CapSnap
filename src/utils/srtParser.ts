import { SubtitleBlock, SubtitleWord } from '../types';

/**
 * Converts seconds (e.g. 12.345) to SRT timestamp format "00:00:12,345"
 */
export function formatSRTTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.round((seconds % 1) * 1000);

  const hh = String(hrs).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const mmm = String(millis).padStart(3, '0');

  return `${hh}:${mm}:${ss},${mmm}`;
}

/**
 * Converts seconds to VTT timestamp format "00:00:12.345"
 */
export function formatVTTTimestamp(seconds: number): string {
  return formatSRTTimestamp(seconds).replace(',', '.');
}

/**
 * Parses SRT timestamp "00:00:12,345" to seconds float
 */
export function parseSRTTimestamp(timestamp: string): number {
  const parts = timestamp.trim().replace('.', ',').split(',');
  const time = parts[0].split(':');
  const millis = parts[1] ? parseInt(parts[1], 10) : 0;

  const hours = parseInt(time[0] || '0', 10);
  const minutes = parseInt(time[1] || '0', 10);
  const seconds = parseInt(time[2] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/**
 * Parse an SRT or VTT file content string into SubtitleBlock array with word-level breakdown
 */
export function parseSubtitleFileContent(content: string): SubtitleBlock[] {
  const lines = content.replace(/\r/g, '').split('\n');
  const blocks: SubtitleBlock[] = [];

  let currentBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === 'WEBVTT' || line === '') {
      if (currentBlockLines.length > 0) {
        const parsed = parseBlockLines(currentBlockLines, blocks.length);
        if (parsed) blocks.push(parsed);
        currentBlockLines = [];
      }
    } else {
      currentBlockLines.push(line);
    }
  }

  if (currentBlockLines.length > 0) {
    const parsed = parseBlockLines(currentBlockLines, blocks.length);
    if (parsed) blocks.push(parsed);
  }

  return blocks;
}

function parseBlockLines(lines: string[], index: number): SubtitleBlock | null {
  // Find line with time arrow "-->"
  let timeLineIndex = lines.findIndex(l => l.includes('-->'));
  if (timeLineIndex === -1) return null;

  const timeParts = lines[timeLineIndex].split('-->');
  if (timeParts.length < 2) return null;

  const startSec = parseSRTTimestamp(timeParts[0]);
  const endSec = parseSRTTimestamp(timeParts[1]);

  const textLines = lines.slice(timeLineIndex + 1).filter(l => l.trim().length > 0);
  const fullText = textLines.join(' ');
  if (!fullText) return null;

  const wordsText = fullText.split(/\s+/).filter(w => w.length > 0);
  if (wordsText.length === 0) return null;

  const duration = Math.max(0.1, endSec - startSec);
  const wordDuration = duration / wordsText.length;

  const words: SubtitleWord[] = wordsText.map((w, wIdx) => ({
    id: `w-${index}-${wIdx}-${Math.random().toString(36).substring(2, 7)}`,
    text: w,
    start: Number((startSec + wIdx * wordDuration).toFixed(3)),
    end: Number((startSec + (wIdx + 1) * wordDuration).toFixed(3)),
  }));

  return {
    id: `b-${index}-${Math.random().toString(36).substring(2, 7)}`,
    start: startSec,
    end: endSec,
    words,
  };
}

/**
 * Export SubtitleBlocks into SRT string
 */
export function exportToSRT(blocks: SubtitleBlock[]): string {
  let output = '';
  blocks.forEach((block, idx) => {
    output += `${idx + 1}\n`;
    output += `${formatSRTTimestamp(block.start)} --> ${formatSRTTimestamp(block.end)}\n`;
    const text = block.words.map(w => w.text).join(' ');
    output += `${text}\n\n`;
  });
  return output.trim();
}

/**
 * Export SubtitleBlocks into VTT string
 */
export function exportToVTT(blocks: SubtitleBlock[]): string {
  let output = 'WEBVTT\n\n';
  blocks.forEach((block, idx) => {
    output += `${idx + 1}\n`;
    output += `${formatVTTTimestamp(block.start)} --> ${formatVTTTimestamp(block.end)}\n`;
    const text = block.words.map(w => w.text).join(' ');
    output += `${text}\n\n`;
  });
  return output.trim();
}

/**
 * Split a continuous text transcript into timed word chunks based on total duration or speech pace
 */
export function generateSubtitleBlocksFromTranscript(
  transcript: string,
  totalDuration: number,
  wordsPerBlock: number = 3
): SubtitleBlock[] {
  const cleanWords = transcript.trim().split(/\s+/).filter(w => w.length > 0);
  if (cleanWords.length === 0) return [];

  const duration = Math.max(1, totalDuration || 10);
  const totalChars = cleanWords.reduce((sum, w) => sum + Math.max(1, w.length), 0);
  
  const subtitleWords: SubtitleWord[] = [];
  let currentStart = 0.1;

  for (let i = 0; i < cleanWords.length; i++) {
    const wordText = cleanWords[i];
    const charCount = Math.max(1, wordText.length);
    const charFraction = charCount / (totalChars || 1);
    
    // Proportional word duration based on character length
    const wordDuration = Math.max(0.1, (duration - 0.2) * charFraction);
    const startSec = currentStart;
    const endSec = Math.min(duration, startSec + wordDuration);

    subtitleWords.push({
      id: `gen-w-${i}-${Math.random().toString(36).substring(2, 7)}`,
      text: wordText,
      start: Number(startSec.toFixed(3)),
      end: Number(endSec.toFixed(3)),
    });

    currentStart = endSec + 0.01;
    if (currentStart >= duration) break;
  }

  // Ensure strict non-overlapping timestamps
  for (let i = 0; i < subtitleWords.length; i++) {
    if (i > 0 && subtitleWords[i].start < subtitleWords[i - 1].end) {
      subtitleWords[i].start = Number((subtitleWords[i - 1].end + 0.01).toFixed(3));
    }
    if (subtitleWords[i].end <= subtitleWords[i].start) {
      subtitleWords[i].end = Number((subtitleWords[i].start + 0.1).toFixed(3));
    }
    if (subtitleWords[i].end > duration) {
      subtitleWords[i].end = Number(duration.toFixed(3));
      if (subtitleWords[i].start >= subtitleWords[i].end) {
        subtitleWords[i].start = Number(Math.max(0, subtitleWords[i].end - 0.08).toFixed(3));
      }
    }
  }

  const blocks: SubtitleBlock[] = [];
  const chunkSize = Math.max(1, wordsPerBlock);

  for (let i = 0; i < subtitleWords.length; i += chunkSize) {
    const chunk = subtitleWords.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;

    blocks.push({
      id: `gen-b-${i / chunkSize}-${Math.random().toString(36).substring(2, 7)}`,
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      words: chunk,
    });
  }

  return blocks;
}

/**
 * Automatically merges short or adjacent subtitle blocks to prevent on-screen flicker
 */
export function autoMergeShortBlocks({
  blocks,
  minDurationSec = 0.5,
  maxGapSec = 0.25,
  maxWordsPerMergedBlock = 8,
}: {
  blocks: SubtitleBlock[];
  minDurationSec?: number;
  maxGapSec?: number;
  maxWordsPerMergedBlock?: number;
}): SubtitleBlock[] {
  if (!blocks || blocks.length <= 1) return blocks;

  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const result: SubtitleBlock[] = [];

  let current = {
    ...sorted[0],
    words: [...sorted[0].words],
  };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    const currentDuration = current.end - current.start;
    const nextDuration = next.end - next.start;
    const gap = next.start - current.end;

    const isCurrentShort = currentDuration < minDurationSec;
    const isNextShort = nextDuration < minDurationSec;
    const isAdjacentGap = gap <= maxGapSec;

    const combinedWordCount = current.words.length + next.words.length;

    if ((isCurrentShort || isNextShort || isAdjacentGap) && combinedWordCount <= maxWordsPerMergedBlock) {
      const mergedWords = [...current.words, ...next.words].sort((a, b) => a.start - b.start);
      current = {
        id: current.id,
        start: Number(Math.min(current.start, next.start).toFixed(3)),
        end: Number(Math.max(current.end, next.end).toFixed(3)),
        words: mergedWords,
      };
    } else {
      result.push(current);
      current = {
        ...next,
        words: [...next.words],
      };
    }
  }
  result.push(current);

  return result;
}

