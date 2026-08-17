import React, { useState } from 'react';
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
  videoDuration: number;
  audioBuffer: AudioBuffer | null;
  onAutoAlign: (transcriptText: string) => void;
  onRefineAudioSync?: () => void;
  onSeek: (time: number) => void;
  currentTime: number;
  onAiTranscribe?: () => void;
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
  blocks = [],
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

  // Auto-Regrouping state parameters
  const [regroupMaxChars, setRegroupMaxChars] = useState(25);
  const [regroupMaxWords, setRegroupMaxWords] = useState(3);
  const [regroupPauseSec, setRegroupPauseSec] = useState(0.4);

  // Smart Auto-Caption Highlight State
  const [selectedHighlightColor, setSelectedHighlightColor] = useState('#FFE600');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = React.useRef<any>(null);
  const [dictationError, setDictationError] = useState<string | null>(null);

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

      recognition.onstart = () => {
        setIsRecording(true);
        setDictationError(null);
      };

      recognition.onerror = (event: any) => {
        setIsRecording(false);
        setDictationError(`Mic notice: ${event.error || 'Stopped'}`);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setTranscriptInput(prev => (prev ? `${prev} ${finalTranscript.trim()}` : finalTranscript.trim()));
        }
      };

      recognition.start();
    } catch {
      setIsRecording(false);
      setDictationError('Could not start microphone dictation.');
    }
  };

  const handleSaveWordEdit = (blockId: string, wordId: string) => {
    const updated = blocks.map(b => {
      if (b.id !== blockId) return b;
      return {
        ...b,
        words: b.words.map(w => {
          if (w.id !== wordId) return w;
          const autoEmoji = getEmojiForWord(editingWordText);
          return { ...w, text: editingWordText, emoji: autoEmoji };
        }),
      };
    });
    onUpdateBlocks(updated);
    setEditingWordId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[92vh] sm:max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-3 sm:px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <h2 className="text-xs sm:text-sm font-bold text-white">Subtitle Manager</h2>
                <span className="text-[10px] text-amber-400 font-mono font-bold bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20">
                  {blocks.length} Blocks
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            {(onUndo || onRedo) && (
              <div className="flex items-center space-x-1 pr-1.5 border-r border-slate-800">
                {onUndo && (
                  <button
                    onClick={onUndo}
                    disabled={!canUndo}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
                    title="Undo (Ctrl+Z)"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {onRedo && (
                  <button
                    onClick={onRedo}
                    disabled={!canRedo}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
                    title="Redo (Ctrl+Y)"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Tabs: Edit Words / Script Generator / Tools & Export */}
        <div className="flex bg-slate-950/80 px-3 sm:px-4 pt-2 border-b border-slate-800/80 gap-1 sm:gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('editor')}
            className={`pb-2 px-2.5 sm:px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'editor'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Word Timeline ({blocks.length})
          </button>
          <button
            onClick={() => setActiveTab('generator')}
            className={`pb-2 px-2.5 sm:px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'generator'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            AI & Script Generator
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className={`pb-2 px-2.5 sm:px-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'tools'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Regroup & Export
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
                  <button
                    onClick={handleApplySmartHighlights}
                    disabled={blocks.length === 0}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] rounded-lg transition-all shadow active:scale-95 disabled:opacity-40"
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
                <div className="text-center py-12 text-slate-400 text-xs bg-slate-950/40 rounded-xl border border-slate-800/80 space-y-3">
                  <p>No subtitle blocks available yet.</p>
                  <button
                    onClick={() => setActiveTab('generator')}
                    className="px-4 py-1.5 bg-amber-500 text-slate-950 font-bold rounded-lg text-xs shadow hover:bg-amber-400 transition-colors"
                  >
                    Generate with AI or Script
                  </button>
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
                        {block.words.map(word => {
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
                                  ? {
                                      backgroundColor: `${word.colorOverride}25`,
                                      color: word.colorOverride,
                                      borderColor: `${word.colorOverride}60`,
                                    }
                                  : {}
                              }
                            >
                              <button
                                onClick={() => handleToggleWordHighlight(block.id, word.id)}
                                className="cursor-pointer hover:opacity-80"
                                title="Click to toggle highlight color"
                              >
                                {word.emoji && <span className="mr-1">{word.emoji}</span>}
                                <span>{word.text}</span>
                              </button>

                              <button
                                onClick={() => {
                                  setEditingWordId(word.id);
                                  setEditingWordText(word.text);
                                }}
                                className="opacity-0 group-hover/word:opacity-100 p-0.5 hover:text-amber-400 transition-opacity"
                                title="Edit text"
                              >
                                <Edit2 className="w-2.5 h-2.5" />
                              </button>
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
              {/* AI Transcriber Card */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-amber-500/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300 flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Gemini AI Speech & Sentiment Transcription</span>
                  </span>
                  {onRefineAudioSync && (
                    <button
                      onClick={onRefineAudioSync}
                      disabled={!audioBuffer || blocks.length === 0}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 text-[10px] font-bold rounded-lg disabled:opacity-40"
                    >
                      <Zap className="w-3 h-3 inline mr-1 fill-amber-400" />
                      Auto-Snap Sync
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 leading-snug">
                  Extracts speech from the video track and automatically maps word timings directly to audio volume cadences.
                </p>

                {onAiTranscribe && (
                  <button
                    onClick={onAiTranscribe}
                    disabled={isTranscribing || !audioBuffer}
                    className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-all shadow flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isTranscribing ? 'animate-spin' : ''}`} />
                    <span>{isTranscribing ? 'Transcribing Video Audio...' : '⚡ Transcribe Video Audio'}</span>
                  </button>
                )}

                {transcribeStatus && (
                  <div className="text-[11px] font-semibold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5">
                    <Sparkles className="w-3 h-3 animate-spin text-amber-400 shrink-0" />
                    <span>{transcribeStatus}</span>
                  </div>
                )}
              </div>

              {/* Paste Script Card */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Paste Custom Script (Offline Alignment)</span>
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
                  placeholder="Paste your script text here. AutoCap Studio will align every word with video audio energy 100% offline!"
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

          {/* TAB 3: TOOLS, REGROUP & EXPORT */}
          {activeTab === 'tools' && (
            <div className="space-y-4">
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
