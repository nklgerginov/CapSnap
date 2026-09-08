# NovaCap Studio: Architecture and Audit

**Repository:** `nklgerginov/CapSnap`
**Audited:** September 2026
**Scope:** Existing application compared with the NovaCap product vision

## Executive summary

NovaCap is currently a browser-first caption editor, not yet a distributed
video SaaS platform. The existing product has a useful editing foundation:
Gemini transcription, an offline transcription path, word-level subtitle data,
rich canvas effects, timeline manipulation, local project persistence, and
browser export. A local Python service layer now adds optional Whisper
transcription and asynchronous FFmpeg rendering, but durable queues, cloud
storage, and production deployment are not yet present.

The safest evolution is incremental: preserve the responsive local editor,
define a stable subtitle/style contract, then introduce worker-backed
transcription and rendering behind the existing adapters.

## Audited capabilities

| Area | Current implementation | Status |
| --- | --- | --- |
| Editor UI | React 19, TypeScript, Vite, Tailwind, Motion/Lucide UI | Implemented |
| Cloud transcription | Express `POST /api/transcribe` calling Gemini multimodal models | Implemented |
| Offline transcription | Browser audio resampling, acoustic/VAD analysis, Whisper.cpp-style adapter and fallback | Implemented, validate accuracy before production claims |
| Word timing | `SubtitleWord` with `start`, `end`, confidence, emphasis, sentiment, color, and emoji | Implemented |
| Style system | `SubtitleStyle`, `PresetTheme`, platform presets, Google Fonts | Implemented |
| Vibe effects | Canvas renderer with pop, karaoke, glow, shake, glitch, and extensive effect presets | Implemented |
| Semantic enrichment | Gemini sentiment/mood fields plus local keyword highlighting and emoji map | Implemented |
| Timeline editing | Block/word editing, drag interactions, undo/redo | Implemented |
| Reframing | Crop keyframes and pixel-based subject focal-point detection | Partial; not MediaPipe face tracking |
| Export | Canvas, WebCodecs, worker, GIF, SRT/VTT, and audio export paths | Implemented in-browser |
| Persistence | IndexedDB with local-storage fallback | Implemented |
| Server platform | Express + Vite middleware | Implemented |
| Python/FastAPI workers | Whisper and render services under `services/` | Partial; production deployment and queueing planned |
| FFmpeg/Remotion rendering | `services/render_service` validates requests, generates ASS/FFmpeg plans, and runs async jobs | Partial; durable queue/progress planned |
| S3/CloudFront delivery | None in the repository | Planned |
| BullMQ/Celery jobs | None in the repository | Planned |

## System architecture

```text
Browser
  ├─ React editor state
  ├─ VideoPlayerCanvas + renderCore
  ├─ TimelineEditor + SubtitleManager
  ├─ Web Audio analysis and normalization
  ├─ IndexedDB project/video storage
  └─ WebCodecs / worker export
          │
          ├── Express server
          │     └── Gemini multimodal transcription (/api/transcribe)
          └── FastAPI services
                ├── Whisper word timing (/api/transcribe/whisper)
                └── FFmpeg render plans/jobs (/v1/render/*)
```

### Important boundaries

- `src/types.ts` is the shared domain contract for projects, subtitle words,
  styles, transforms, audio, and export settings.
- `src/utils/aiTranscriber.ts` owns the Gemini client adapter from the UI.
- `src/utils/whisperEngine.ts` owns local audio preparation and offline
  transcription behavior.
- `src/utils/renderCore.ts` is the rendering engine; UI components should not
  contain rendering algorithms.
- `src/utils/semanticEnrichment.ts` produces editable keyword, CTA, emoji,
  B-roll, and SFX cues without changing subtitle timing.
- `src/utils/subjectDetector.ts` provides heuristic focal analysis and
  caption-safe placement; MediaPipe face/pose tracking is the next accuracy
  upgrade.
- `src/utils/projectStorage.ts` is the persistence boundary.
- `server.ts` currently owns API validation, Gemini model fallback, JSON
  normalization, and Vite/static serving.

## Core data contracts

### Subtitle word

```ts
interface SubtitleWord {
  id: string;
  text: string;
  start: number;
  end: number;
  confidence?: number;
  colorOverride?: string;
  emoji?: string;
  isEmphasized?: boolean;
  sentiment?: "positive" | "negative" | "excited" |
    "dramatic" | "neutral" | "curious";
}
```

### Subtitle block

Blocks group words for layout and can carry a mood, suggested emoji, and
speaker metadata. This is already sufficient for pop-in highlighting, keyword
color changes, karaoke fills, and later server-side rendering.

### Style theme

`SubtitleStyle` currently covers font family/size, active and inactive colors,
background pills, stroke/shadow/glow, animation, line limits, text transform,
position, emoji behavior, speaker badges, particle effects, and animation
speed. `PresetTheme` adds a stable id, platform, and human-readable
description.

The Phase 1 schema should keep these existing names and add explicit
capabilities only when required by a renderer. Do not create a second,
incompatible style format.

## Current request flow

1. The user uploads a video and the browser creates a local object URL.
2. Audio is decoded with Web Audio API and analyzed for waveform and energy.
3. Gemini receives base64 WAV audio through `/api/transcribe`, or the local
   path prepares 16 kHz mono audio for offline processing.
4. Returned blocks are normalized with stable IDs and optional semantic fields.
5. Audio-energy alignment and smart highlighting refine the subtitle blocks.
6. Canvas preview renders the active words and effects at playback time.
7. WebCodecs/workers export the result when browser support is available;
   SRT/VTT and audio exports remain separate paths.

## Phase 1 roadmap

The local Phase 1 implementation is complete. The remaining rows below are
production-hardening or infrastructure items and are tracked separately from
the working local pipeline.

### Step 1: Transcription pipeline

Create a Python/FastAPI service with a versioned endpoint such as
`POST /v1/transcriptions`. It should:

- accept a presigned media URL or multipart audio upload;
- use Whisper v3 or AssemblyAI for word-level timestamps;
- return the existing block/word contract plus `confidence`;
- preserve silence boundaries and reject invalid or overlapping timestamps;
- expose job status for long-running media;
- keep Gemini as a semantic enrichment step, not the timing source.

The browser adapter should gain a provider interface so Gemini, local
transcription, and the FastAPI service can be selected without changing the
editor.

### Step 2: Styling schema

Formalize a versioned JSON schema around the existing `SubtitleStyle`:

```json
{
  "schema_version": 1,
  "font_family": "Plus Jakarta Sans",
  "font_size": 72,
  "primary_color": "#FFFFFF",
  "highlight_color": "#FFE600",
  "animation_type": "pop",
  "emoji_enabled": true
}
```

Add named presets for Gaming, Podcasts, Ads, and Lyrics. Validate imports
server-side and in the editor; unknown fields should be ignored for forward
compatibility.

### Step 3: Rendering pipeline

The first render service now validates normalized subtitle JSON, converts it
into ASS captions, and returns an argument-safe FFmpeg command through
`POST /v1/render/plan`. It supports word timing plus pop-in and karaoke tags
while keeping the Canvas renderer as the instant-preview path. The remaining
worker should execute this plan and add:

- split long jobs into bounded chunks where codec/keyframe constraints allow;
- process chunks through a queue (Celery initially, or BullMQ if Node owns
  orchestration);
- upload completed outputs to S3 and serve through CloudFront;
- return progress, cancellation, and signed-download metadata.

Do not expose cloud credentials to the browser.

## Vibe engine requirements

| Preset | Required behavior |
| --- | --- |
| Gaming | Jitter/shake, neon glow, impact scaling tied to audio energy, optional facecam/gameplay layout |
| Podcasts | High legibility, pop-in, safe lower-third placement, keyword colors such as money/green |
| Ads | High contrast, CTA overlay support, bottom-third safe zone, brand font and color lock |
| Lyrics | Karaoke fill, smooth transitions, beat/rhythm metadata, pulsing emphasis |

Current presets and renderer cover much of the visual behavior. CTA overlays,
beat-aware lyric timing, and reusable theme validation remain roadmap work.

## Gaps and risks

- Gemini is asked for precise timestamps, but a dedicated speech-to-text
  engine should own timing for production reliability.
- The current API accepts large base64 JSON payloads; production should use
  object storage or streaming uploads with size/type limits.
- Local project storage is device-local; collaboration, recovery, and cloud
  delivery require an authenticated backend.
- Subject detection is heuristic pixel analysis, not robust face/pose tracking.
- Browser export support varies by codec and device; server rendering is
  required for deterministic delivery.
- API keys must remain server-side and request authentication/rate limits are
  required before public deployment.

## Configuration and operations

Required environment variable:

- `GEMINI_API_KEY`: server-side Gemini API access.
- `VITE_WHISPER_SERVICE_URL`: optional URL for the dedicated FastAPI Whisper
  service. It is used only after Gemini fails and before local transcription.

Development commands:

```bash
npm install
npm run dev
npm run lint
npm run build
npm start
```

The health check is `GET /api/health`. The current transcription endpoint is
`POST /api/transcribe` with `audioBase64`, optional `mimeType`,
`wordsPerBlock`, and `language`.

## Security checklist

- Keep Gemini and future storage credentials on the server.
- Validate MIME type, decoded payload size, duration, and transcription
  parameters before processing.
- Add authentication, per-user quotas, and rate limiting to transcription and
  export jobs.
- Use signed, short-lived object URLs for uploaded and rendered media.
- Treat AI output as untrusted JSON and validate timestamps, colors, text
  length, and enum values before rendering.
- Avoid logging raw audio, API keys, or full transcript payloads.

## Definition of done for the next milestone

Phase 1 is complete when a versioned transcription provider returns validated
word-level timestamps and confidence, the four style families serialize
through one schema, and a repeatable render command can burn those captions
into a video outside the browser. The existing editor must continue to preview
and edit the same subtitle/style contracts during that migration.
