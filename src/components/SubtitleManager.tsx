import React, { useState, useMemo } from 'react';
import {
  FileText,
  Wand2,
  Download,
  Upload,
  Trash2,
  Edit2,
  Mic,
  Clock,
  Sparkles,
  X,
  Zap,
  Highlighter,
  RotateCcw,
  Undo2,
  Redo2,
  Combine,
  Scissors,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Search,
  Replace,
  Users,
  UserCheck,
  Languages,
  Loader2,
} from 'lucide-react';
import { SubtitleBlock, SubtitleWord } from '../types';
import {
  exportToSRT,
  exportToVTT,
  parseSubtitleFileContent,
  generateSubtitleBlocksFromTranscript,
  autoMergeShortBlocks,
} from '../utils/srtParser';
import { getEmojiForWord } from '../utils/emojiMap';
import { refineSubtitleSyncWithAudioEnergy } from '../utils/audioAnalyzer';
import {
  applySmartAutoCaptionHighlights,
  clearSubtitleHighlights,
  HIGHLIGHT_COLOR_PRESETS,
} from '../utils/smartHighlighter';

export const SPEAKER_PRESETS = [
  { id: 'spk1', name: 'Speaker 1', color: '#10B981', label: 'Spk 1' },
  { id: 'spk2', name: 'Speaker 2', color: '#38BDF8', label: 'Spk 2' },
  { id: 'host', name: 'Host', color: '#F59E0B', label: 'Host' },
  { id: 'guest', name: 'Guest', color: '#A855F7', label: 'Guest' },
  { id: 'narrator', name: 'Narrator', color: '#F43F5E', label: 'Narrator' },
];

export const SUPPORTED_LANGUAGES = [
  { code: 'auto', label: 'Auto-Detect (Global)' },
  { code: 'en', label: 'English (US/UK)' },
  { code: 'es', label: 'Spanish (Español)' },
  { code: 'fr', label: 'French (Français)' },
  { code: 'de', label: 'German (Deutsch)' },
  { code: 'it', label: 'Italian (Italiano)' },
  { code: 'pt', label: 'Portuguese (Português)' },
  { code: 'ja', label: 'Japanese (日本語)' },
  { code: 'zh', label: 'Chinese (中文)' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'ar', label: 'Arabic (العربية)' },
  { code: 'ru', label: 'Russian (Русский)' },
  { code: 'ko', label: 'Korean (한국어)' },
];

export function regroupSubtitleWords({
  blocks,
  maxCharsPerBlock = 25,
  maxWordsPerBlock = 3,
  pauseThresholdSec = 0.4,
}: {
  blocks: SubtitleBlock[];
  maxCharsPerBlock?: number;
  maxWordsPerBlock?: number;
  pauseThresholdSec?: number;
}): SubtitleBlock[] {
  const allWords = blocks.flatMap(b => b.words).sort((a, b) => a.start - b.start);
  if (allWords.length === 0) return [];

  const newBlocks: SubtitleBlock[] = [];
  let currentChunk: SubtitleWord[] = [];
  let currentChars = 0;

  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i];
    const prevWord = currentChunk[currentChunk.length - 1];

    const wordLen = word.text.length + (currentChunk.length > 0 ? 1 : 0);
    const charOverflow = currentChunk.length > 0 && currentChars + wordLen > maxCharsPerBlock;
    const wordOverflow = currentChunk.length >= maxWordsPerBlock;
    const pauseBreak = prevWord && word.start - prevWord.end >= pauseThresholdSec;

    if (currentChunk.length > 0 && (charOverflow || wordOverflow || pauseBreak)) {
      newBlocks.push({
        id: `regroup-${newBlocks.length}-${Math.random().toString(36).substring(2, 6)}`,
        start: currentChunk[0].start,
        end: currentChunk[currentChunk.length - 1].end,
        words: [...currentChunk],
      });
      currentChunk = [];
      currentChars = 0;
    }

    currentChunk.push(word);
    currentChars += word.text.length + 1;
  }

  if (currentChunk.length > 0) {
    newBlocks.push({
      id: `regroup-${newBlocks.length}-${Math.random().toString(36).substring(2, 6)}`,
      start: currentChunk[0].start,
      end: currentChunk[currentChunk.length - 1].end,
      words: [...currentChunk],
    });
  }

  return newBlocks;
}

interface SubtitleManagerProps {
  isOpen: boolean;
  onClose: () => void;
  blocks: SubtitleBlock[];
  onUpdateBlocks: (blocks: SubtitleBlock[]) => void;
  videoDuration?: number;
  audioBuffer: AudioBuffer | null;
  onAutoAlign: (transcript: string) => void;
  onRefineAudioSync?: (energySensitivity?: number) => void;
  onSeek: (time: number) => void;
  currentTime: number;
  onAiTranscribe?: (language: string) => Promise<void>;
  isTranscribing?: boolean;
  transcribeStatus?: string | null;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const SubtitleManager: React.FC<SubtitleManagerProps> = ({
  isOpen,
  onClose,
  blocks,
  onUpdateBlocks,
  videoDuration,
  audioBuffer,
  onAutoAlign,
  onRefineAudioSync,
  onSeek,
  onAiTranscribe,
  isTranscribing = false,
  transcribeStatus,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'generator' | 'tools'>('editor');
  const [transcriptInput, setTranscriptInput] = useState('');
  const [wordsPerBlockInput, setWordsPerBlockInput] = useState(3);
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [editingWordText, setEditingWordText] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  // Global Find & Replace State
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);

  // Auto-Regrouping state parameters
  const [regroupMaxChars, setRegroupMaxChars] = useState(25);
  const [regroupMaxWords, setRegroupMaxWords] = useState(3);
  const [regroupPauseSec, setRegroupPauseSec] = useState(0.4);

  // Smart Auto-Caption Highlight State
  const [selectedHighlightColor, setSelectedHighlightColor] = useState('#FFE600');
  const [selectedLanguage, setSelectedLanguage] = useState('auto');

  // Trigger AI Transcription
  const handleTriggerAiTranscription = async () => {
    if (onAiTranscribe) {
      await onAiTranscribe(selectedLanguage);
      setActiveTab('editor');
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = React.useRef<any>(null);
  const [dictationError, setDictationError] = useState<string | null>(null);

  // Find & Replace match count
  const matchingWordCount = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    const target = matchCase ? searchQuery : searchQuery.toLowerCase();
    let count = 0;
    for (const block of blocks) {
      for (const word of block.words) {
        const text = matchCase ? word.text : word.text.toLowerCase();
        if (text.includes(target)) count++;
      }
    }
    return count;
  }, [blocks, searchQuery, matchCase]);

  if (!isOpen) return null;

  const totalWords = blocks.reduce((acc, b) => acc + b.words.length, 0);

  const handleApplySmartHighlights = () => {
    const highlighted = applySmartAutoCaptionHighlights({
      blocks,
      highlightColor: selectedHighlightColor,
      forceAtLeastOnePerBlock: true,
    });
    onUpdateBlocks(highlighted);
  };

  const handleClearHighlights = () => {
    const cleared = clearSubtitleHighlights(blocks);
    onUpdateBlocks(cleared);
  };

  const handleToggleWordHighlight = (blockId: string, wordId: string) => {
    const updated = blocks.map(b => {
      if (b.id !== blockId) return b;
      return {
        ...b,
        words: b.words.map(w => {
          if (w.id !== wordId) return w;
          const isCurrentlyHighlighted = !!w.colorOverride;
          return {
            ...w,
            isEmphasized: !isCurrentlyHighlighted,
            colorOverride: isCurrentlyHighlighted ? undefined : selectedHighlightColor,
          };
        }),
      };
    });
    onUpdateBlocks(updated);
  };

  const handleShiftBlockTime = (block: SubtitleBlock, deltaSec: number) => {
    const durationSec = block.end - block.start;
    const newStart = Math.max(0, block.start + deltaSec);
    const newEnd = newStart + durationSec;
    const shift = newStart - block.start;

    const updatedWords = block.words.map(w => ({
      ...w,
      start: Number(Math.max(0, w.start + shift).toFixed(3)),
      end: Number(Math.max(0, w.end + shift).toFixed(3)),
    }));

    onUpdateBlocks(
      blocks.map(b =>
        b.id === block.id
          ? { ...b, start: Number(newStart.toFixed(3)), end: Number(newEnd.toFixed(3)), words: updatedWords }
          : b
      )
    );
  };

  // Find & Replace handlers
  const handleReplaceNext = () => {
    if (!searchQuery.trim()) return;
    const target = matchCase ? searchQuery : searchQuery.toLowerCase();
    let replaced = false;

    const updatedBlocks = blocks.map(block => {
      if (replaced) return block;
      const updatedWords = block.words.map(word => {
        if (replaced) return word;
        const text = matchCase ? word.text : word.text.toLowerCase();
        if (text.includes(target)) {
          replaced = true;
          const newText = matchCase
            ? word.text.replace(searchQuery, replaceQuery)
            : word.text.replace(new RegExp(searchQuery, 'i'), replaceQuery);
          onSeek(word.start);
          return { ...word, text: newText };
        }
        return word;
      });
      return { ...block, words: updatedWords };
    });

    if (replaced) {
      onUpdateBlocks(updatedBlocks);
    }
  };

  const handleReplaceAll = () => {
    if (!searchQuery.trim()) return;
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, matchCase ? 'g' : 'gi');

    const updatedBlocks = blocks.map(block => ({
      ...block,
      words: block.words.map(word => ({
        ...word,
        text: word.text.replace(regex, replaceQuery),
      })),
    }));

    onUpdateBlocks(updatedBlocks);
  };

  // Speaker Diarization handlers
  const handleToggleBlockSpeaker = (blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const currentSpeaker = block.speaker;
    const currentIndex = SPEAKER_PRESETS.findIndex(s => s.name === currentSpeaker);
    const nextPreset = currentIndex === -1 ? SPEAKER_PRESETS[0] : SPEAKER_PRESETS[(currentIndex + 1) % (SPEAKER_PRESETS.length + 1)];

    onUpdateBlocks(
      blocks.map(b =>
        b.id === blockId
          ? {
              ...b,
              speaker: nextPreset?.name,
              speakerColor: nextPreset?.color,
            }
          : b
      )
    );
  };

  const handleSetBlockSpeakerPreset = (blockId: string, speakerName?: string, speakerColor?: string) => {
    onUpdateBlocks(
      blocks.map(b =>
        b.id === blockId
          ? {
              ...b,
              speaker: speakerName,
              speakerColor: speakerColor,
            }
          : b
      )
    );
  };

  const handleAutoDiarizeAlternating = () => {
    const updated = blocks.map((b, idx) => {
      const isEven = idx % 2 === 0;
      return {
        ...b,
        speaker: isEven ? 'Speaker 1' : 'Speaker 2',
        speakerColor: isEven ? '#10B981' : '#38BDF8',
      };
    });
    onUpdateBlocks(updated);
  };

  const handleBatchSetSpeaker = (speakerName: string, speakerColor: string) => {
    const updated = blocks.map(b => ({
      ...b,
      speaker: speakerName,
      speakerColor: speakerColor,
    }));
    onUpdateBlocks(updated);
  };

  const handleClearAllSpeakers = () => {
    const updated = blocks.map(b => ({
      ...b,
      speaker: undefined,
      speakerColor: undefined,
    }));
    onUpdateBlocks(updated);
  };

  const handleAutoRegroup = () => {
    const regrouped = regroupSubtitleWords({
      blocks,
      maxCharsPerBlock: regroupMaxChars,
      maxWordsPerBlock: regroupMaxWords,
      pauseThresholdSec: regroupPauseSec,
    });
    onUpdateBlocks(regrouped);
  };

  const handleAutoMergeShortBlocks = () => {
    const merged = autoMergeShortBlocks({
      blocks,
      minDurationSec: 0.5,
      maxGapSec: 0.25,
      maxWordsPerMergedBlock: 8,
    });
    onUpdateBlocks(merged);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      const content = evt.target?.result as string;
      if (content) {
        let parsed = parseSubtitleFileContent(content);
        if (parsed.length > 0) {
          if (audioBuffer) {
            parsed = refineSubtitleSyncWithAudioEnergy(parsed, audioBuffer);
          }
          onUpdateBlocks(parsed);
        }
      }
    };
    reader.readAsText(file);
  };

  const triggerDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateScript = () => {
    if (!transcriptInput.trim()) return;
    onAutoAlign(transcriptInput);
    setTranscriptInput('');
    setActiveTab('editor');
  };

  const handleDeleteBlock = (blockId: string) => {
    onUpdateBlocks(blocks.filter(b => b.id !== blockId));
  };

  const handleToggleSpeechRecognition = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (isRecording) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      setIsRecording(false);
      return;
    }

    setDictationError(null);

    if (!SpeechRecognition) {
      const simulatedSample = 'Welcome to AutoCap Studio! Create viral video captions with animated highlights.';
      setTranscriptInput(prev => (prev ? `${prev} ${simulatedSample}` : simulatedSample));
      setDictationError('Dictation sample added to transcript!');
      setTimeout(() => setDictationError(null), 3500);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setTranscriptInput(currentTranscript);
      };

      recognition.onerror = () => {
        setDictationError('Dictation ended or microphone blocked.');
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.start();
      setIsRecording(true);
    } catch {
      setDictationError('Failed to access microphone.');
      setIsRecording(false);
    }
  };

  const handleSaveWordEdit = (blockId: string, wordId: string) => {
    const updated = blocks.map(b => {
      if (b.id !== blockId) return b;
      return {
        ...b,
        words: b.words.map(w => (w.id === wordId ? { ...w, text: editingWordText } : w)),
      };
    });
    onUpdateBlocks(updated);
    setEditingWordId(null);
  };

  const handleSplitWordToNewBlock = (blockId: string, wordIndex: number) => {
    const targetBlock = blocks.find(b => b.id === blockId);
    if (!targetBlock || wordIndex <= 0) return;

    const wordsFirstPart = targetBlock.words.slice(0, wordIndex);
    const wordsSecondPart = targetBlock.words.slice(wordIndex);

    const firstBlock: SubtitleBlock = {
      ...targetBlock,
      end: wordsFirstPart[wordsFirstPart.length - 1].end,
      words: wordsFirstPart,
    };

    const secondBlock: SubtitleBlock = {
      id: `split-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      start: wordsSecondPart[0].start,
      end: targetBlock.end,
      words: wordsSecondPart,
      speaker: targetBlock.speaker,
      speakerColor: targetBlock.speakerColor,
    };

    const blockIndex = blocks.findIndex(b => b.id === blockId);
    const updatedBlocks = [
      ...blocks.slice(0, blockIndex),
      firstBlock,
      secondBlock,
      ...blocks.slice(blockIndex + 1),
    ];

    onUpdateBlocks(updatedBlocks);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <FileText className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">Subtitle Manager & AI Captions</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                  {blocks.length} blocks ({totalWords} words)
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Word-level timing, multi-speaker diarization, smart find & replace, and batch tools
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            {/* Undo / Redo */}
            {onUndo && (
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
            )}
            {onRedo && (
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Find & Replace Toggle */}
            <button
              onClick={() => setIsFindReplaceOpen(prev => !prev)}
              className={`p-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 border transition-all ${
                isFindReplaceOpen
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow'
                  : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
              }`}
              title="Find and Replace text"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Find & Replace</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Find & Replace Bar (Collapsible) */}
        {isFindReplaceOpen && (
          <div className="bg-slate-950 p-3 border-b border-slate-800 space-y-2 animate-slide-down">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Find word..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-16 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-medium"
                />
                {searchQuery && (
                  <span className="absolute right-2.5 top-2 text-[10px] font-bold text-amber-400 font-mono">
                    {matchingWordCount} {matchingWordCount === 1 ? 'match' : 'matches'}
                  </span>
                )}
              </div>

              <div className="relative flex-1 min-w-[180px]">
                <Replace className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Replace with..."
                  value={replaceQuery}
                  onChange={e => setReplaceQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-medium"
                />
              </div>

              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  onClick={() => setMatchCase(prev => !prev)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                    matchCase
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                  title="Match case sensitive"
                >
                  Aa
                </button>

                <button
                  onClick={handleReplaceNext}
                  disabled={!searchQuery.trim() || matchingWordCount === 0}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-lg border border-slate-700 disabled:opacity-40"
                >
                  Replace Next
                </button>

                <button
                  onClick={handleReplaceAll}
                  disabled={!searchQuery.trim() || matchingWordCount === 0}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow disabled:opacity-40"
                >
                  Replace All ({matchingWordCount})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center px-4 pt-3 border-b border-slate-800 bg-slate-950/20 space-x-2">
          <button
            onClick={() => setActiveTab('editor')}
            className={`pb-2 px-2.5 sm:px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'editor'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Word Timeline Editor
          </button>
          <button
            onClick={() => setActiveTab('generator')}
            className={`pb-2 px-2.5 sm:px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap flex items-center space-x-1.5 ${
              activeTab === 'generator'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>AI & Script Generator</span>
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className={`pb-2 px-2.5 sm:px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'tools'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Multi-Speaker & Export
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
          {/* TAB 1: WORD TIMELINE EDITOR */}
          {activeTab === 'editor' && (
            <div className="space-y-3">
              {/* Highlight Toolbar Bar */}
              <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[11px] font-semibold text-slate-300">Highlight Palette:</span>
                  <div className="flex items-center space-x-1">
                    {HIGHLIGHT_COLOR_PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        onClick={() => setSelectedHighlightColor(preset.hex)}
                        className={`w-5 h-5 rounded-full transition-transform border ${
                          selectedHighlightColor === preset.hex
                            ? 'scale-125 border-white ring-1 ring-amber-400'
                            : 'border-transparent opacity-80'
                        }`}
                        style={{ backgroundColor: preset.hex }}
                        title={preset.name}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-1.5">
                  {onAiTranscribe && (
                    <button
                      onClick={handleTriggerAiTranscription}
                      disabled={isTranscribing}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] rounded-lg transition-all shadow active:scale-95 disabled:opacity-50 flex items-center space-x-1"
                      title="Transcribe speech with Gemini AI"
                    >
                      {isTranscribing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3 fill-slate-950" />
                      )}
                      <span>{isTranscribing ? 'Transcribing...' : 'AI Transcribe'}</span>
                    </button>
                  )}
                  <button
                    onClick={handleApplySmartHighlights}
                    disabled={blocks.length === 0}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold text-[11px] rounded-lg transition-all border border-slate-700 active:scale-95 disabled:opacity-40"
                  >
                    Auto-Highlight
                  </button>
                  <button
                    onClick={handleClearHighlights}
                    disabled={blocks.length === 0}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded-lg transition-colors border border-slate-700 disabled:opacity-40"
                    title="Clear highlight colors from words"
                  >
                    Clear Highlights
                  </button>
                  <button
                    onClick={() => onUpdateBlocks([])}
                    disabled={blocks.length === 0}
                    className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] font-semibold rounded-lg transition-colors border border-rose-500/30 disabled:opacity-40"
                    title="Delete all captions from timeline"
                  >
                    Delete All
                  </button>
                </div>
              </div>

              {/* Subtitle Blocks List */}
              {blocks.length === 0 ? (
                <div className="text-center py-10 px-4 bg-slate-950/60 rounded-2xl border border-slate-800 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-inner">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-white">No Subtitles on Timeline</h4>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Subtitles were cleared or not yet generated. AutoCap can extract audio speech and generate word-level animated subtitles with Gemini AI in seconds.
                    </p>
                  </div>

                  {/* AI Quick Transcribe Action Panel */}
                  <div className="max-w-md mx-auto bg-slate-900/90 border border-amber-500/30 rounded-xl p-3.5 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-1.5 text-xs text-slate-300 font-semibold">
                        <Languages className="w-3.5 h-3.5 text-amber-400" />
                        <span>Spoken Language:</span>
                      </div>
                      <select
                        value={selectedLanguage}
                        onChange={e => setSelectedLanguage(e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-xs font-bold text-amber-300 rounded-lg px-2.5 py-1 focus:outline-none focus:border-amber-500"
                      >
                        {SUPPORTED_LANGUAGES.map(lang => (
                          <option key={lang.code} value={lang.code}>
                            {lang.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {transcribeStatus && (
                      <div className="text-[11px] text-amber-300 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 flex items-center justify-center space-x-2 font-medium">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                        <span>{transcribeStatus}</span>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                      <button
                        onClick={handleTriggerAiTranscription}
                        disabled={isTranscribing}
                        className="w-full sm:flex-1 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50"
                      >
                        {isTranscribing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4 fill-slate-950" />
                        )}
                        <span>{isTranscribing ? 'Transcribing with AI...' : '✨ Generate with Gemini AI'}</span>
                      </button>

                      <button
                        onClick={() => setActiveTab('generator')}
                        className="w-full sm:w-auto py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs border border-slate-700 transition-colors whitespace-nowrap"
                      >
                        Paste Script & Align
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                  {blocks.map(block => (
                    <div
                      key={block.id}
                      className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/90 hover:border-slate-700 transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => onSeek(block.start)}
                            className="font-mono text-amber-400 font-bold flex items-center hover:underline bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20"
                            title="Jump playhead here"
                          >
                            <Clock className="w-3 h-3 mr-1" />
                            {block.start.toFixed(2)}s - {block.end.toFixed(2)}s
                          </button>
                          <span className="text-[10px] text-slate-500 font-mono">
                            ({(block.end - block.start).toFixed(2)}s)
                          </span>

                          {/* Speaker Tag Chip */}
                          <button
                            onClick={() => handleToggleBlockSpeaker(block.id)}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all"
                            style={{
                              backgroundColor: block.speakerColor ? `${block.speakerColor}22` : 'rgba(30, 41, 59, 0.6)',
                              borderColor: block.speakerColor || '#475569',
                              color: block.speakerColor || '#94A3B8',
                            }}
                            title="Click to cycle speaker (Speaker 1, Speaker 2, Host, Guest, Narrator)"
                          >
                            <Mic className="w-2.5 h-2.5" />
                            <span>{block.speaker || 'No Speaker'}</span>
                          </button>

                          {/* Mood & Sentiment Overlay Badge */}
                          {block.mood && block.mood !== 'neutral' && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-300 capitalize">
                              <span>{block.suggestedEmoji || '✨'}</span>
                              <span>{block.mood}</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleShiftBlockTime(block, -0.1)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                            title="Shift -0.1s"
                          >
                            <ChevronLeft className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleShiftBlockTime(block, 0.1)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                            title="Shift +0.1s"
                          >
                            <ChevronRight className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteBlock(block.id)}
                            className="p-1 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors ml-1"
                            title="Delete Block"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Interactive Word Chips */}
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {block.words.map((word, wordIdx) => {
                          const isEditing = editingWordId === word.id;
                          const hasHighlight = !!word.colorOverride;

                          if (isEditing) {
                            return (
                              <div key={word.id} className="flex items-center space-x-1 bg-slate-800 p-0.5 rounded-lg">
                                <input
                                  type="text"
                                  autoFocus
                                  value={editingWordText}
                                  onChange={e => setEditingWordText(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveWordEdit(block.id, word.id);
                                    if (e.key === 'Escape') setEditingWordId(null);
                                  }}
                                  className="bg-slate-900 border border-amber-500 text-white text-xs px-2 py-0.5 rounded focus:outline-none w-24 font-bold"
                                />
                                <button
                                  onClick={() => handleSaveWordEdit(block.id, word.id)}
                                  className="p-1 bg-amber-500 text-slate-950 rounded hover:bg-amber-400"
                                >
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </button>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={word.id}
                              className={`group/word inline-flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-bold transition-all border ${
                                hasHighlight
                                  ? 'border-transparent shadow-sm'
                                  : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700'
                              }`}
                              style={
                                hasHighlight
                                  ? { backgroundColor: word.colorOverride, color: '#000000' }
                                  : {}
                              }
                            >
                              <span
                                onClick={() => handleToggleWordHighlight(block.id, word.id)}
                                className="cursor-pointer select-none"
                                title="Click to toggle highlight color"
                              >
                                {word.text}
                              </span>

                              <div className="opacity-0 group-hover/word:opacity-100 flex items-center space-x-0.5 transition-opacity ml-1">
                                <button
                                  onClick={() => {
                                    setEditingWordId(word.id);
                                    setEditingWordText(word.text);
                                  }}
                                  className="p-0.5 hover:text-amber-400 text-slate-400"
                                  title="Edit text"
                                >
                                  <Edit2 className="w-2.5 h-2.5" />
                                </button>

                                {wordIdx > 0 && (
                                  <button
                                    onClick={() => handleSplitWordToNewBlock(block.id, wordIdx)}
                                    className="p-0.5 hover:text-amber-400 text-slate-400"
                                    title="Split into new block at this word"
                                  >
                                    <Scissors className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: AI & SCRIPT GENERATOR */}
          {activeTab === 'generator' && (
            <div className="space-y-4">
              {/* Card 1: AI Speech Transcription Engine (Primary) */}
              <div className="bg-slate-950/90 p-4 rounded-2xl border border-amber-500/30 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-white">Gemini AI Auto-Transcription</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
                          Multilingual AI
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Extracts speech audio, syncs word-level timestamps & auto-applies kinetic highlight colors
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-1.5 text-xs text-slate-300 font-semibold">
                      <Languages className="w-3.5 h-3.5 text-amber-400" />
                      <span>Audio Spoken Language:</span>
                    </div>

                    <select
                      value={selectedLanguage}
                      onChange={e => setSelectedLanguage(e.target.value)}
                      className="bg-slate-950 border border-slate-700 text-xs font-bold text-amber-300 rounded-lg px-2.5 py-1 focus:outline-none focus:border-amber-500"
                    >
                      {SUPPORTED_LANGUAGES.map(lang => (
                        <option key={lang.code} value={lang.code}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {transcribeStatus && (
                    <div className="text-[11px] text-amber-300 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 flex items-center justify-center space-x-2 font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      <span>{transcribeStatus}</span>
                    </div>
                  )}

                  <button
                    onClick={handleTriggerAiTranscription}
                    disabled={isTranscribing}
                    className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-50"
                  >
                    {isTranscribing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 fill-slate-950" />
                    )}
                    <span>{isTranscribing ? 'Transcribing Speech with Gemini AI...' : '✨ Generate Subtitles with AI'}</span>
                  </button>
                </div>
              </div>

              {/* Card 2: Paste Script & Dictation */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Paste Custom Script (Smart Alignment)</span>
                  </span>

                  <button
                    onClick={handleToggleSpeechRecognition}
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      isRecording ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    <Mic className="w-3 h-3" />
                    <span>{isRecording ? 'Listening...' : 'Dictate'}</span>
                  </button>
                </div>

                {dictationError && (
                  <div className="text-[10px] text-amber-400 bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                    {dictationError}
                  </div>
                )}

                <textarea
                  rows={3}
                  value={transcriptInput}
                  onChange={e => setTranscriptInput(e.target.value)}
                  placeholder="Paste your script text here. AutoCap Studio will automatically align each word to audio speech cadence."
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none font-medium"
                />

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                    <span>Words/Line:</span>
                    <select
                      value={wordsPerBlockInput}
                      onChange={e => setWordsPerBlockInput(parseInt(e.target.value, 10))}
                      className="bg-slate-900 border border-slate-700 text-xs font-bold text-amber-300 rounded px-1.5 py-0.5"
                    >
                      <option value={1}>1 Word</option>
                      <option value={2}>2 Words</option>
                      <option value={3}>3 Words</option>
                      <option value={4}>4 Words</option>
                    </select>
                  </div>

                  <button
                    onClick={handleGenerateScript}
                    disabled={!transcriptInput.trim()}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all shadow disabled:opacity-40"
                  >
                    Align & Create
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MULTI-SPEAKER & EXPORT TOOLS */}
          {activeTab === 'tools' && (
            <div className="space-y-4">
              {/* Speaker Diarization Tools */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    <span>Multi-Speaker Diarization & Color Coding</span>
                  </span>
                  <button
                    onClick={handleClearAllSpeakers}
                    className="text-[10px] text-slate-400 hover:text-slate-200 underline font-semibold"
                  >
                    Clear All
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleAutoDiarizeAlternating}
                    disabled={blocks.length < 2}
                    className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-left transition-all disabled:opacity-40"
                  >
                    <div className="text-[11px] font-bold text-slate-200 flex items-center space-x-1">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Auto-Alternate (A/B)</span>
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5">
                      Assigns Speaker 1 & Speaker 2 alternately
                    </div>
                  </button>

                  <div className="p-2 bg-slate-900 border border-slate-700 rounded-xl space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Batch Tag All Blocks
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {SPEAKER_PRESETS.map(preset => (
                        <button
                          key={preset.id}
                          onClick={() => handleBatchSetSpeaker(preset.name, preset.color)}
                          className="px-2 py-0.5 rounded text-[10px] font-bold border transition-all hover:scale-105"
                          style={{
                            backgroundColor: `${preset.color}22`,
                            borderColor: preset.color,
                            color: preset.color,
                          }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Regrouping Settings Card */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>Auto-Regroup Word Spacing</span>
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={handleAutoMergeShortBlocks}
                      disabled={blocks.length <= 1}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 text-[10px] font-bold rounded-lg border border-slate-700 disabled:opacity-40"
                    >
                      Merge Short
                    </button>
                    <button
                      onClick={handleAutoRegroup}
                      disabled={blocks.length === 0}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-bold rounded-lg shadow disabled:opacity-40"
                    >
                      Regroup
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1 bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Max Chars/Block</span>
                      <span className="font-mono text-amber-400">{regroupMaxChars}</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={50}
                      value={regroupMaxChars}
                      onChange={e => setRegroupMaxChars(parseInt(e.target.value, 10))}
                      className="w-full h-1 bg-slate-800 rounded appearance-none accent-amber-500"
                    />
                  </div>

                  <div className="space-y-1 bg-slate-900 p-2 rounded-lg border border-slate-800">
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Pause Break</span>
                      <span className="font-mono text-amber-400">{regroupPauseSec}s</span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={1.0}
                      step={0.1}
                      value={regroupPauseSec}
                      onChange={e => setRegroupPauseSec(parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-800 rounded appearance-none accent-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Import & Export Files */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Import & Export Subtitle Files</span>
                </span>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => triggerDownload(exportToSRT(blocks), 'subtitles.srt')}
                    disabled={blocks.length === 0}
                    className="py-2 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold rounded-lg text-xs flex items-center justify-center space-x-1 disabled:opacity-40"
                  >
                    <Download className="w-3 h-3 text-amber-400" />
                    <span>SRT</span>
                  </button>

                  <button
                    onClick={() => triggerDownload(exportToVTT(blocks), 'subtitles.vtt')}
                    disabled={blocks.length === 0}
                    className="py-2 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold rounded-lg text-xs flex items-center justify-center space-x-1 disabled:opacity-40"
                  >
                    <Download className="w-3 h-3 text-amber-400" />
                    <span>VTT</span>
                  </button>

                  <label className="cursor-pointer py-2 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold rounded-lg text-xs flex items-center justify-center space-x-1 text-center">
                    <Upload className="w-3 h-3 text-amber-400" />
                    <span>Import</span>
                    <input type="file" accept=".srt,.vtt,.json" onChange={handleImportFile} className="hidden" />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
