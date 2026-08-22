# CapSnap (NovaCap Studio)

> AI-Powered Kinetic Subtitle Editor for Social Media Videos

[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6.svg)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF.svg)](https://vitejs.dev)

CapSnap (NovaCap Studio) is a web application that uses Google Gemini AI to automatically transcribe video audio and generate professionally styled, animated subtitles for TikTok, Instagram Reels, YouTube Shorts, and other social media platforms.

## Screenshot

![CapSnap Application Screenshot](https://via.placeholder.com/800x600/1a1a2e/ffffff?text=CapSnap+Screenshot)
*Main interface showing video editor with kinetic subtitles*

## Features

### Core Capabilities
- AI-Powered Transcription using Google Gemini
- Kinetic Subtitles with 20+ animation effects
- Multi-Platform Support (TikTok, Instagram, YouTube)
- Real-time Preview
- Advanced Styling
- Audio Waveform Analysis
- Project Management
- Offline fallback

### Editing Tools
- Timeline-based editing
- Drag-and-drop
- Word-level adjustments
- Undo/redo

### Styling
- Google Fonts integration
- Custom colors and animations
- Smart highlighting
- Emoji support

### Export
- MP4 with burned-in subtitles
- GIF export
- SRT/WebVTT export
- Multiple quality settings

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+ or yarn 1.22+
- Google Gemini API Key

### Installation
1. Clone: git clone https://github.com/nklgerginov/CapSnap.git
2. Install: npm install
3. Configure: cp .env.example .env, add GEMINI_API_KEY
4. Start: npm run dev
5. Open: http://localhost:3000

## Usage

1. Upload video (MP4, WebM, MOV)
2. AI transcribes automatically
3. Edit subtitles in timeline
4. Style with presets or custom settings
5. Add effects (filters, watermark, progress bar)
6. Export as MP4 or GIF

## Platform Presets

| Platform | Aspect Ratio | Duration |
|----------|--------------|----------|
| TikTok | 9:16 | 15-60s |
| Instagram | 9:16 | 15-90s |
| YouTube Shorts | 9:16 | 15-60s |
| Facebook | 9:16 | 15-90s |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+S | Save |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Space | Play/Pause |

## Tech Stack

- React 19, TypeScript
- Vite 6, Tailwind CSS v4
- Express.js, Google GenAI SDK
- Web Audio API, Canvas API

## Documentation

Complete documentation: [DOCUMENTATION.md](./DOCUMENTATION.md)

## License

Proprietary Software - All rights reserved

---

Made with AI
*Version 1.0.0 - August 2026*