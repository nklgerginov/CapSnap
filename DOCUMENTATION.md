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
