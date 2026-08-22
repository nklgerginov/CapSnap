---

## Core Features

### Video Upload & Processing
- Upload video files (MP4, WebM, etc.)
- Extract audio track for transcription
- Generate audio waveform visualization
- Automatic duration detection

### AI-Powered Transcription
- Google Gemini AI integration
- Multi-language support
- Speaker identification
- Sentiment analysis (positive, negative, excited, dramatic, neutral, curious)
- Mood detection (hype, happy, dramatic, shock, inspirational, warning, curious, neutral)
- Word-level timestamps
- Emoji suggestions

### Subtitle Styling
- Custom fonts (Google Fonts integration)
- Font size, color, and weight
- Background colors and opacity
- Stroke effects
- Text transformations (uppercase, capitalize, lowercase, none)
- 20+ animation effects (pop, bounce, fade, glitch, etc.)

### Kinetic Highlights
- Smart word highlighting based on sentiment
- Color overrides for emphasized words
- Emoji integration
- Animation timing synchronized with audio

### Platform Optimization
- Aspect ratio presets (9:16, 1:1, 16:9, 4:5)
- Platform-specific formatting (TikTok, Instagram, YouTube, Facebook)
- Safe zone overlays
- Export presets

### Advanced Editing
- Timeline-based subtitle editing
- Word-level timing adjustments
- Block merging and splitting
- Undo/redo functionality
- Keyboard shortcuts

### Audio Enhancement
- Volume normalization
- LUFS targeting (default -14)
- Audio waveform visualization
- Word-to-audio alignment

### Visual Effects
- Video filters (brightness, contrast, saturation, blur, sepia, hue rotation)
- Watermark overlay with custom positioning
- Progress bar overlay
- Safe zone indicators

### Project Management
- Save/load projects to IndexedDB
- Auto-save functionality to localStorage
- Project thumbnails
- Recent projects list

### Export Capabilities
- Video export with burned-in subtitles (MP4)
- Multiple quality settings (low, medium, high, ultra)
- GIF export for social media
- SRT and WebVTT subtitle file export

---

## Component Architecture

### App.tsx (Main Component)
Manages all application state:
- Video file and URL state
- Current project state
- Subtitle blocks with history
- Style, filter, transform, watermark, progress bar, audio settings
- UI modals and toast messages

Key Functions:
- handleVideoUpload() - Process uploaded video files
- handleAiTranscribe() - Re-run AI transcription
- handleSaveCurrentProject() - Save project state
- handleClearAll() - Reset the canvas
- handleLoadDemo() - Load a demo video

### VideoPlayerCanvas.tsx
Renders video with overlay elements:
- Video element with controls
- Canvas overlay for subtitles
- Safe zone indicators
- Watermark overlay
- Progress bar overlay
- Real-time subtitle rendering

### StylePanel.tsx
Styling controls for subtitles:
- Font selection (Google Fonts)
- Font size and color
- Background styling
- Animation effects
- Text transformations
- Style presets

### TimelineEditor.tsx
Timeline-based subtitle editing:
- Visual timeline with blocks
- Drag-and-drop editing
- Block resizing
- Word-level editing
- Waveform visualization
- Zoom and scroll

### SubtitleManager.tsx
Manages subtitle blocks:
- Block list display
- Block editing
- Word-level editing
- Sentiment and mood indicators
- Emoji selection

---

## Hooks System

### useSubtitleHistory.ts
Provides undo/redo functionality for subtitle blocks:
- Maintains history stack
- Supports unlimited undo/redo
- Preserves block state
- Optimized for performance

### useAutoSaveSubtitles.ts
Auto-saves subtitle blocks to localStorage:
- Debounced saving (1.2 second delay)
- Prevents data loss
- Restores on page load

### useProStatus.ts
Manages Pro subscription status:
- Checks subscription state
- Handles free tier limits
- Manages upgrade prompts

### useAiUsage.ts
Tracks AI usage for free tier limits:
- Counts AI transcription uses
- Enforces free tier limits (3 uses per browser)
- Pro users have unlimited access

### useAudioNormalizer.ts
Handles audio normalization:
- Web Audio API integration
- LUFS targeting
- Volume adjustment
- Real-time analysis

---

## Utility Functions

### Audio Processing
- decodeAudioFromFile(): Decode audio from video file
- extractWaveformFromAudioBuffer(): Generate waveform data
- alignWordsWithAudioEnergy(): Align words with audio peaks
- refineSubtitleSyncWithAudioEnergy(): Improve subtitle timing

### AI Transcription
- transcribeVideoAudioWithAI(): AI-powered transcription
- Google Gemini integration
- Multi-language support
- Sentiment analysis
- Mood detection

### Offline Transcription
- transcribeAudioOffline(): Offline speech recognition fallback
- Uses Web Speech API when available

### Subtitle Processing
- generateSubtitleBlocksFromTranscript(): Parse text into subtitle blocks
- exportToSRT(): Export subtitles to SRT format
- exportToVTT(): Export subtitles to WebVTT format

### Smart Highlighting
- applySmartAutoCaptionHighlights(): Auto-highlight important words
- clearSubtitleHighlights(): Remove all highlights
- Sentiment-based highlighting

### Storage
- saveProject(): Save project to IndexedDB
- getAllProjects(): Retrieve all projects
- getProjectVideoBlob(): Get video blob for project
- deleteProject(): Remove project
- createDefaultProject(): Create new project

---

## API Endpoints

### GET /api/health
Health check endpoint. Response: { "status": "ok" }

### POST /api/transcribe
AI-powered video audio transcription.

Request Body: audioBase64 (required), mimeType, wordsPerBlock, language.

Response: Array of subtitle blocks with words, mood, and suggested emojis.

AI Models Used (priority order):
1. gemini-flash-latest
2. gemini-2.5-flash
3. gemini-3.7-flash
4. gemini-3.1-flash-lite

Features: Automatic retry on transient errors, multi-language support, sentiment analysis, mood detection, word-level timestamps.

---

## Data Types

### Core Types
- AspectRatio: 9:16, 1:1, 16:9, 4:5
- PlatformPreset: tiktok, youtube_shorts, instagram_reels, facebook_reels, custom
- AnimationType: 20+ options including pop, bounce, fade, glitch
- TextTransform: uppercase, capitalize, lowercase, none

### Subtitle Types
- SubtitleWord: id, text, start, end, colorOverride, emoji, isEmphasized, sentiment
- SubtitleBlock: id, start, end, words, mood, suggestedEmoji, speaker, speakerColor

### Style & Settings Types
- SubtitleStyle: Font, color, animation settings
- VideoFilter: Brightness, contrast, saturation, blur, sepia, hue rotation
- VideoTransformSettings: Scale, pan, playback rate, trim
- WatermarkSettings: Text, position, opacity, font
- ProgressBarSettings: Position, height, colors, glow
- AudioSettings: Volume, normalization, LUFS targeting
- Project: Complete project state with all settings

---

## Setup & Installation

### Prerequisites
- Node.js 18+
- npm 9+ or yarn 1.22+
- Modern browser (Chrome, Firefox, Safari, Edge)
- Google Gemini API Key

### Installation Steps
1. Clone repository: git clone https://github.com/nklgerginov/CapSnap.git
2. Install dependencies: npm install
3. Copy .env.example to .env
4. Add GEMINI_API_KEY to .env
5. Start dev server: npm run dev
6. Open http://localhost:3000

### Production Build
1. Build: npm run build
2. Start: npm run start

---

## Configuration

### Environment Variables
- GEMINI_API_KEY: Google Gemini API key (required)
- NODE_ENV: Environment mode (default: development)
- PORT: Server port (default: 3000)

### Getting a Gemini API Key
1. Visit Google AI Studio
2. Create project or select existing
3. Navigate to Get API Key section
4. Generate new API key
5. Add to .env file

---

## Usage Guide

### Quick Start
1. Upload Video: Click Upload or drag and drop (MP4, WebM, MOV, max 500MB)
2. AI Transcription: Automatic with Google Gemini (3 free per browser)
3. Edit Subtitles: Timeline editor with drag-and-drop
4. Style Subtitles: Presets, fonts, colors, animations
5. Add Effects: Filters, watermark, progress bar
6. Export: MP4, GIF, SRT, VTT formats

### Keyboard Shortcuts
- Ctrl+S: Save project
- Ctrl+Z: Undo
- Ctrl+Y: Redo
- Space: Play/Pause
- Arrow Keys: Seek/Volume

### Platform Presets
- TikTok: 9:16, 15-60s
- Instagram: 9:16, 15-90s
- YouTube Shorts: 9:16, 15-60s
- Facebook: 9:16, 15-90s
- Custom: Any ratio, any duration

---

## Troubleshooting

### Common Issues
- AI Transcription Not Working: Check GEMINI_API_KEY, quota, try different browser
- Video Not Loading: Check format, size, browser console
- Audio Not Playing: Check permissions, audio track, refresh
- Export Failing: Check disk space, quality, browser console
- Performance Issues: Close tabs, reduce resolution, disable animations

### Debug Mode
Set DEBUG=true in .env for detailed logging

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
- Use functional components with hooks
- Add JSDoc comments
- Test on multiple browsers
- Optimize performance

---

## License
Proprietary Software - All rights reserved

---

Last updated: August 22, 2026
Version: 1.0.0
