import React, { useState, useEffect } from 'react';
import { Search, Type, Check, Plus } from 'lucide-react';
import { POPULAR_GOOGLE_FONTS, loadGoogleFont, GoogleFontOption } from '../utils/googleFonts';

interface GoogleFontPickerProps {
  currentFontFamily: string;
  onSelectFont: (fontFamily: string) => void;
  title?: string;
  compact?: boolean;
}

export const GoogleFontPicker: React.FC<GoogleFontPickerProps> = ({
  currentFontFamily,
  onSelectFont,
  title = 'Google Font Selector',
  compact = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [customFontInput, setCustomFontInput] = useState('');
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  // Preload current font and top fonts
  useEffect(() => {
    if (currentFontFamily) {
      const clean = currentFontFamily.replace(/["']/g, '').split(',')[0].trim();
      loadGoogleFont(clean);
    }
  }, [currentFontFamily]);

  const categories = ['All', 'Viral Heavy', 'Modern Sans', 'Display', 'Handwriting', 'Serif'];

  const filteredFonts = POPULAR_GOOGLE_FONTS.filter(font => {
    const matchesCategory = selectedCategory === 'All' || font.category === selectedCategory;
    const matchesSearch = font.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleSelect = (font: GoogleFontOption) => {
    loadGoogleFont(font.name);
    onSelectFont(font.family);
  };

  const handleAddCustomFont = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFontInput.trim()) return;
    const fontName = customFontInput.trim();
    loadGoogleFont(fontName);
    onSelectFont(`"${fontName}", sans-serif`);
    setCustomFontInput('');
    setIsAddingCustom(false);
  };

  // Determine active font name for clean display
  const activeCleanName = currentFontFamily.replace(/["']/g, '').split(',')[0].trim();

  return (
    <div className={`space-y-2 bg-slate-950/80 ${compact ? 'p-2.5' : 'p-3'} rounded-xl border border-slate-800`}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
          <Type className="w-3.5 h-3.5 text-amber-400" />
          <span>{title}</span>
        </label>
        <span className="text-[10px] font-mono text-slate-400">
          Active: <strong className="text-white">{activeCleanName}</strong>
        </span>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center space-x-1 overflow-x-auto custom-scrollbar pb-1">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Search Input & Custom Font Button */}
      <div className="flex items-center space-x-1.5">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={`Search ${POPULAR_GOOGLE_FONTS.length}+ Google Fonts...`}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <button
          onClick={() => setIsAddingCustom(!isAddingCustom)}
          className={`p-1.5 rounded-lg border text-xs font-bold transition-all flex items-center space-x-1 ${
            isAddingCustom
              ? 'bg-amber-500 text-slate-950 border-amber-400'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
          }`}
          title="Type any Google Font name"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Custom</span>
        </button>
      </div>

      {/* Custom Font Input Form */}
      {isAddingCustom && (
        <form onSubmit={handleAddCustomFont} className="flex items-center space-x-1.5 pt-1">
          <input
            type="text"
            value={customFontInput}
            onChange={e => setCustomFontInput(e.target.value)}
            placeholder="Type any Google Font (e.g. Orbitron, Russo One, Bangers)..."
            className="flex-1 bg-slate-900 border border-amber-500/50 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
            autoFocus
          />
          <button
            type="submit"
            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-lg shadow"
          >
            Apply
          </button>
        </form>
      )}

      {/* Font Options Grid / Scroll list */}
      <div className={`grid grid-cols-2 gap-1.5 ${compact ? 'max-h-36' : 'max-h-52'} overflow-y-auto custom-scrollbar pt-1`}>
        {filteredFonts.map(font => {
          const isSelected = activeCleanName.toLowerCase() === font.name.toLowerCase();

          return (
            <button
              key={font.name}
              onClick={() => handleSelect(font)}
              onMouseEnter={() => loadGoogleFont(font.name)}
              className={`p-2 rounded-xl text-left border transition-all flex flex-col justify-between ${
                isSelected
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300 ring-1 ring-amber-400/50 shadow-sm'
                  : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate max-w-[100px]">
                  {font.name}
                </span>
                {isSelected && <Check className="w-3 h-3 text-amber-400 shrink-0" />}
              </div>

              <div
                className="text-sm truncate font-semibold"
                style={{ fontFamily: font.family }}
              >
                PREVIEW
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
