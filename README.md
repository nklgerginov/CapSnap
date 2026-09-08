# NovaCap Studio

> High-impact, browser-first captions for short-form video.

NovaCap Studio (the CapSnap repository) is a React and TypeScript editor for
creating burned-in social video captions. It combines Gemini-assisted
transcription, a local Whisper.cpp-style fallback, word-level timing edits,
kinetic canvas rendering, audio analysis, and client-side export.

## Current status

This repository is **Phase 0 / editor foundation**. The production-grade
Python/FastAPI worker service, FFmpeg render farm, cloud object storage, and
MediaPipe face tracking described in the product vision are planned but are
not part of the current application. See
[DOCUMENTATION.md](./DOCUMENTATION.md) for the audited architecture and Phase
1 implementation plan.

## What works today

- Upload MP4, WebM, and MOV video and preview it in a responsive editor.
- Generate captions with Gemini through the Express API, or use the
  browser-side offline transcription path.
- Edit subtitle blocks and individual word boundaries on an interactive
  timeline with undo/redo and auto-save.
- Apply platform presets, custom Google Fonts, word highlighting, emoji
  suggestions, speaker labels, safe-zone overlays, filters, watermarks, and
  progress bars.
- Render kinetic caption effects on Canvas, including pop, karaoke, glow,
  glitch, shake, and many visual effect presets.
- Export MP4/WebM/GIF/SRT/VTT/WAV/MP3 through browser APIs and workers when
  supported by the browser.
- Save projects and source video blobs locally with IndexedDB.

## Quick start

### Prerequisites

- Node.js 18+
- npm 9+ (or an equivalent package manager)
- A Gemini API key for cloud transcription
- A browser with Canvas, Web Audio, IndexedDB, and preferably WebCodecs

### Install and run

```bash
npm install
copy .env.example .env
# Set GEMINI_API_KEY in .env
npm run dev
```

Open <http://localhost:3000>.

Useful commands:

```bash
npm run lint   # TypeScript validation
npm run build  # Vite client build and bundled server build
npm start      # Run the production bundle
```

## Product direction

The target experience is a premium creator studio with four style families:
**Gaming** (neon, jitter, impact scaling), **Podcasts** (legible pop-in and
keyword color), **Ads** (high-contrast CTA layouts), and **Lyrics**
(karaoke-fill and rhythm-aware motion). The next implementation step is to
formalize a shared style-theme schema and move heavy transcription/rendering
into isolated workers without regressing the fast local editor experience.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Application orchestration and project state |
| `src/components/` | Preview, style panel, timeline, captions, and export UI |
| `src/utils/whisperEngine.ts` | Local audio preparation, model selection, and offline path |
| `src/utils/aiTranscriber.ts` | Gemini request/response adapter |
| `src/utils/renderCore.ts` | Canvas subtitle and visual-effect renderer |
| `src/utils/webcodecsExporter.ts` | Browser export and hardware encoder path |
| `src/utils/projectStorage.ts` | IndexedDB project persistence |
| `server.ts` | Express development server and `/api/transcribe` |

## Documentation

- [Audited architecture and roadmap](./DOCUMENTATION.md)

## License

Proprietary Software - All rights reserved.
