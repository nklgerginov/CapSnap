# CapSnap (NovaCap Studio) - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [Technical Architecture](#technical-architecture)
4. [Core Features](#core-features)
5. [Component Architecture](#component-architecture)
6. [Hooks System](#hooks-system)
7. [Utility Functions](#utility-functions)
8. [API Endpoints](#api-endpoints)
9. [Data Types](#data-types)
10. [Setup & Installation](#setup--installation)
11. [Configuration](#configuration)
12. [Usage Guide](#usage-guide)

---

## Overview

CapSnap (NovaCap Studio) is a comprehensive web-based video editing application specializing in AI-powered subtitle generation and styling for social media content.

### Key Value Propositions
- AI-Powered Transcription using Google Gemini AI
- Kinetic Subtitles with animations and highlighting
- Multi-Platform Support (TikTok, Instagram, YouTube)
- Real-time Preview with video playback
- Advanced Styling with custom fonts and colors
- Audio Waveform Analysis for precise timing
- Project Management with auto-save
- Offline Capabilities as fallback

### Target Users
- Social media content creators
- Video editors and producers
- Marketing teams
- Educators and trainers
- Podcasters

---

## Project Structure

CapSnap/
- src/
  - App.tsx (Main application)
  - main.tsx (Entry point)
  - index.css (Global styles)
  - components/ (React components)
    - Header.tsx
    - VideoPlayerCanvas.tsx
    - StylePanel.tsx
    - TimelineEditor.tsx
    - SubtitleManager.tsx
    - VideoExportModal.tsx
    - ProjectManagerModal.tsx
    - ClearCanvasModal.tsx
    - KeyboardShortcutsModal.tsx
    - UpgradeModal.tsx
    - GoogleFontPicker.tsx
  - hooks/ (Custom hooks)
    - useSubtitleHistory.ts
    - useAutoSaveSubtitles.ts
    - useProStatus.ts
    - useAiUsage.ts
    - useAudioNormalizer.ts
  - utils/ (Utility functions)
    - audioAnalyzer.ts
    - aiTranscriber.ts
    - speechTranscriber.ts
    - srtParser.ts
    - smartHighlighter.ts
    - presetThemes.ts
    - googleFonts.ts
    - canvasRenderer.ts
    - projectStorage.ts
    - sampleVideoGenerator.ts
    - emojiMap.ts
    - gifEncoder.ts
    - wavEncoder.ts
    - sfxSynthesizer.ts
    - subjectDetector.ts
    - cropKeyframes.ts
  - types.ts (TypeScript types)
- server.ts (Express server)
- package.json
- tsconfig.json
- vite.config.ts
- index.html
- .env.example
- metadata.json

---

## Technical Architecture

### Frontend Stack
- React 19 with TypeScript
- Vite 6 (build tool)
- Tailwind CSS v4 (styling)
- Lucide React (icons)
- Motion (animations)

### Backend Stack
- Express.js (server)
- Google GenAI SDK (AI integration)
- Web Audio API (audio processing)
- Canvas API (video rendering)

### Architecture Pattern
- Component-based architecture
- Smart vs Dumb components
- Custom Hooks for reusable logic
- Utility Layer for pure functions
- Server Layer for API endpoints

### Data Flow
User Interaction -> React Components -> State Updates -> Utility Functions -> API Calls -> Server -> AI Processing -> Response -> State Updates -> UI Render
