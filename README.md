# CapSnap (NovaCap Studio)

> **AI-Powered Kinetic Subtitle Editor for Social Media Videos**

[![React](https://img.shields.io/badge/React-19-%2361DAFB.svg?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-%233178C6.svg?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-%23646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-AI-%234285F4.svg)](https://ai.google.dev)

CapSnap (also known as NovaCap Studio) is a comprehensive web application that revolutionizes video subtitle creation. Powered by Googles Gemini AI, it automatically transcribes video audio and generates professionally styled, animated subtitles optimized for TikTok, Instagram Reels, YouTube Shorts, and other social media platforms.

## Screenshot

![CapSnap Application Screenshot](https://via.placeholder.com/800x600/1a1a2e/ffffff?text=CapSnap+Screenshot)
*Main interface showing video editor with kinetic subtitles*

## Features

### Core Capabilities
- AI-Powered Transcription using Google Gemini with multi-language support
- Kinetic Subtitles with 20 plus animation effects and smart highlighting
- Multi-Platform Support for TikTok, Instagram, YouTube, and custom formats
- Real-time Preview with synchronized video playback
- Advanced Styling with Google Fonts, custom colors, and effects
- Audio Waveform Analysis for precise subtitle timing
- Project Management with auto-save to IndexedDB and localStorage
- Offline Capabilities with Web Speech API fallback

### Editing Tools
- Timeline-based subtitle editing with drag-and-drop
- Word-level timing adjustments
- Block merging and splitting
- Undo/redo functionality
- Real-time preview with video playback

### Styling Options
- Google Fonts integration with 1000 plus fonts
- Font size, color, weight, and text transformations
- Background colors with opacity control
- Stroke effects and shadows
- 20 plus animation effects
- Smart word highlighting based on sentiment analysis
- Emoji integration for visual impact

### Audio Features
- Volume normalization with LUFS targeting
- Audio waveform visualization
- Word-to-audio energy alignment
- Background music volume control
- Auto-normalization for consistent audio levels

### Export Options
- Video export with burned-in subtitles MP4
- Multiple quality settings
- GIF export for social media sharing
- SRT and WebVTT subtitle file export

## Quick Start

### Prerequisites
- Node.js 18 or higher
- npm 9 or higher or yarn 1.22 plus
- Modern browser Chrome, Firefox, Safari, Edge recommended
- Google Gemini API Key required for AI transcription

### Installation

Clone the repository, install dependencies, copy env example to env, add GEMINI API KEY to env, start dev server, open localhost 3000