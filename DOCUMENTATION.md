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
13. [AI Transcription System](#ai-transcription-system)
14. [Video Processing Pipeline](#video-processing-pipeline)
15. [Performance Considerations](#performance-considerations)
16. [Security Considerations](#security-considerations)
17. [Troubleshooting](#troubleshooting)
18. [Contributing](#contributing)
19. [License](#license)

---

## Overview

CapSnap (NovaCap Studio) is a comprehensive web-based video editing application specializing in AI-powered subtitle generation and styling for social media content.

### Key Value Propositions
- AI-Powered Transcription using Google Gemini AI
- Kinetic Subtitles with animations and highlighting
- Multi-Platform Support for TikTok, Instagram, YouTube
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

CapSnap has a well-organized structure:
- src/ - Main application source
  - App.tsx - Main component
  - components/ - React components (12 files)
  - hooks/ - Custom hooks (5 files)
  - utils/ - Utility functions (16 files)
  - types.ts - TypeScript definitions
- server.ts - Express server
- Configuration files

---

## Technical Architecture

### Frontend
- React 19, TypeScript
- Vite 6, Tailwind CSS v4
- Lucide React icons
- Motion animations

### Backend
- Express.js server
- Google GenAI SDK
- Web Audio API
- Canvas API

### Architecture Pattern
- Component-based with smart/dumb component separation
- Custom hooks for reusable logic
- Utility layer for pure functions
- Server layer for API endpoints

---

## Core Features

### Video Processing
- Upload MP4, WebM, MOV files
- Extract audio track
- Generate waveform visualization
- Automatic duration detection

### AI Transcription
- Google Gemini AI integration
- Multi-language support
- Speaker identification
- Sentiment analysis
- Mood detection
- Word-level timestamps
- Emoji suggestions

### Styling
- Google Fonts integration
- Custom colors and animations
- Smart highlighting
- 20 plus animation effects

### Editing
- Timeline-based editing
- Drag-and-drop
- Undo/redo
- Word-level adjustments

### Export
- MP4 with burned-in subtitles
- GIF export
- SRT/WebVTT export
- Multiple quality settings

---

## Component Architecture

### Main Components
- App.tsx - State management
- VideoPlayerCanvas.tsx - Video rendering
- StylePanel.tsx - Styling controls
- TimelineEditor.tsx - Timeline editing
- SubtitleManager.tsx - Subtitle management

---

## Hooks System

- useSubtitleHistory - Undo/redo
- useAutoSaveSubtitles - Auto-save
- useProStatus - Subscription management
- useAiUsage - AI usage tracking
- useAudioNormalizer - Audio normalization

---

## Utility Functions

### Audio Processing
- decodeAudioFromFile
- extractWaveformFromAudioBuffer
- alignWordsWithAudioEnergy
- refineSubtitleSyncWithAudioEnergy

### AI & Transcription
- transcribeVideoAudioWithAI
- transcribeAudioOffline
- generateSubtitleBlocksFromTranscript

### Styling & Rendering
- applySmartAutoCaptionHighlights
- canvas rendering utilities
- Google Fonts integration

### Storage
- saveProject, getAllProjects
- projectStorage with IndexedDB
- Auto-save to localStorage

---

## API Endpoints

### GET /api/health
Returns { status: ok }

### POST /api/transcribe
AI-powered transcription
- Request: audioBase64, mimeType, wordsPerBlock, language
- Response: Array of subtitle blocks
- Uses: gemini-flash-latest, gemini-2.5-flash, gemini-3.7-flash

---

## Data Types

- AspectRatio: 9:16, 1:1, 16:9, 4:5
- PlatformPreset: tiktok, youtube_shorts, instagram_reels, facebook_reels
- AnimationType: 20 plus options
- SubtitleWord: id, text, start, end, colorOverride, emoji, isEmphasized, sentiment
- SubtitleBlock: id, start, end, words, mood, suggestedEmoji
- SubtitleStyle: font, color, animation settings
- VideoFilter: brightness, contrast, saturation, etc.
- Project: Complete project state

---

## Setup & Installation

### Prerequisites
- Node.js 18 plus
- npm 9 plus or yarn 1.22 plus
- Modern browser
- Google Gemini API Key

### Installation
1. git clone https://github.com/nklgerginov/CapSnap.git
2. cd CapSnap
3. npm install
4. cp .env.example .env
5. Add GEMINI_API_KEY to .env
6. npm run dev
7. Open http://localhost:3000

---

## Configuration

### Environment Variables
- GEMINI_API_KEY (required)
- NODE_ENV (default: development)
- PORT (default: 3000)

---

## Usage Guide

### Quick Start
1. Upload video (MP4, WebM, MOV)
2. AI auto-transcribes
3. Edit in timeline
4. Style with presets
5. Add effects
6. Export as MP4/GIF

### Keyboard Shortcuts
- Ctrl+S: Save
- Ctrl+Z: Undo
- Ctrl+Y: Redo
- Space: Play/Pause
- Arrows: Seek/Volume

### Platform Presets
- TikTok: 9:16, 15-60s
- Instagram: 9:16, 15-90s
- YouTube Shorts: 9:16, 15-60s
- Facebook: 9:16, 15-90s

---

## AI Transcription System

Uses Google Gemini AI with:
- Multi-language support
- Word-level timestamps
- Sentiment analysis
- Mood detection
- Emoji suggestions
- Automatic retry on errors
- Fallback to offline transcription

---

## Video Processing Pipeline

1. Upload: Video file to video element
2. Audio Extraction: Video to audio buffer to waveform
3. Transcription: Audio to AI to subtitle blocks
4. Alignment: Blocks plus audio to aligned blocks
5. Rendering: Video plus subtitles to canvas
6. Export: Canvas frames to video file

---

## Performance Considerations

- Lazy loading components
- Memoization with React.memo
- Debounced auto-save
- Web Workers for heavy processing
- Canvas optimization

---

## Security Considerations

- API key protection
- Input validation
- CORS configuration
- Data privacy (IndexedDB, localStorage)
- HTTPS recommended

---

## Troubleshooting

### Common Issues
- AI not working: Check GEMINI_API_KEY
- Video not loading: Check format/size
- Audio not playing: Check permissions
- Export failing: Check disk space
- Performance: Close tabs, reduce resolution

### Debug Mode
Set DEBUG=true in .env

### Error Codes
- 400: Bad Request
- 401: Unauthorized
- 429: Rate Limited
- 500: Server Error
- 503: Service Unavailable

---

## Contributing

1. Fork repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Commit changes
6. Push to branch
7. Create Pull Request

### Guidelines
- Use TypeScript
- Follow React best practices
- Keep components small
- Use hooks
- Add JSDoc comments
- Test on multiple browsers

---

## License

Proprietary Software - All rights reserved

---

Last updated: August 22, 2026
Version: 1.0.0