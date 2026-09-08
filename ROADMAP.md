# NovaCap Roadmap

**Last updated:** September 8, 2026
**Current phase:** Phase 2 local editor release candidate

This document is the working tracker for the NovaCap product roadmap. Status
labels are deliberately conservative: a feature is not marked complete until
its implementation, integration, tests, and operational behavior are covered.

## Status legend

- **Done** - implemented, integrated, and validated in this repository.
- **In progress** - implementation exists but production requirements remain.
- **Planned** - defined but not implemented.
- **Blocked** - requires an external decision, service, credential, or
  infrastructure change.

## Phase 0: Editor foundation - Done

| Area | Deliverable | Status |
| --- | --- | --- |
| Editor | React/Vite creator studio with preview, style panel, captions, and timeline | Done |
| Timing | Word-level subtitle blocks with drag editing, undo/redo, and audio alignment | Done |
| Local AI | Browser-side Whisper-style offline fallback and acoustic/VAD processing | Done |
| Cloud AI | Gemini multimodal transcription through the Express API | Done |
| Semantic styling | Keyword highlighting, sentiment/mood fields, emojis, speaker metadata | Done |
| Rendering preview | Canvas kinetic captions and effect presets | Done |
| Local export | WebCodecs/worker, GIF, SRT/VTT, and audio export paths | Done |
| Persistence | IndexedDB projects with local-storage fallback | Done |

## Phase 1: Production caption pipeline

### 1.1 Transcription service

| Deliverable | Status | Acceptance criteria |
| --- | --- | --- |
| FastAPI Whisper service scaffold | Done | Health endpoint and transcription endpoint respond with the shared block/word contract |
| Optional `faster-whisper` backend | Done | Uses model word timestamps when installed; deterministic fallback remains available |
| Word confidence contract | Done | Confidence is validated from 0 to 1 and is preserved in frontend subtitle data |
| Dedicated service frontend adapter | Done | `VITE_WHISPER_SERVICE_URL` is attempted after Gemini failure and before local fallback, with selected model and optional API key |
| Real audio fixture tests | In progress | Valid WAV fixture path and contract coverage exist; model-backed WAV fixture remains CI-dependent |
| WhisperX alignment backend | Planned | Alignment improves word timing without changing the public response schema |
| Auth, quotas, and rate limits | In progress | Optional API-key rejection is implemented; durable quotas/rate limits belong with the cloud gateway |

The transcription path now performs stereo-safe 16 kHz preparation, strict
payload validation, VAD padding, beam-search decoding, and monotonic word
timestamp normalization. Accuracy benchmarking across accents, languages, and
music/noise conditions remains a release gate.

### 1.2 Versioned style themes

| Deliverable | Status | Acceptance criteria |
| --- | --- | --- |
| JSON Schema v1 | Done | Font, size, primary/highlight colors, animation, and emoji settings validate |
| TypeScript style adapter | Done | Existing `SubtitleStyle` can serialize to and load from schema v1 |
| Gaming, Podcast, Ads, and Lyrics themes | Done | Canonical v1 theme documents cover each style family and use the shared schema |
| Theme import/export UI | Planned | Users can export/import validated themes without breaking existing projects |
| Schema compatibility policy | Planned | Unknown future fields are ignored and unsupported schema versions fail clearly |

### 1.3 Server render pipeline

| Deliverable | Status | Acceptance criteria |
| --- | --- | --- |
| ASS render-plan generator | Done | Word timing, pop-in, and karaoke events produce deterministic ASS |
| FFmpeg command builder | Done | Returns argument-safe commands with validated preset and CRF |
| Render-plan FastAPI endpoint | Done | `POST /v1/render/plan` validates input and returns ASS plus command |
| FFmpeg execution worker | Done | FastAPI jobs execute FFmpeg asynchronously and report completion/failure; real smoke render verified |
| Progress and cancellation | Done | Jobs expose state/cancellation and consume FFmpeg machine-readable progress when duration is supplied |
| Render regression fixtures | Planned | Golden outputs cover pop, karaoke, emoji, multiline, and silence gaps |
| Parallel chunk rendering | Planned | Long videos render in bounded chunks and preserve audio/timing at joins |

### Phase 1 exit note

The local Phase 1 implementation is complete: shared contracts, optional
Whisper transcription, canonical themes, validated ASS generation, and
asynchronous FFmpeg execution are integrated and tested. WhisperX alignment,
durable quotas, frame-level progress, and queue-backed long-video chunking
require deployment infrastructure or model assets and remain explicitly
tracked rather than being represented by mocks.

## Phase 2: Creator-grade intelligence

| Deliverable | Status | Acceptance criteria |
| --- | --- | --- |
| Gemini semantic enrichment job | In progress | Stable `SemanticCue` contract and deterministic keyword/CTA/emoji/B-roll/SFX adapter exist; Gemini job integration remains |
| MediaPipe face/pose tracking | In progress | Reusable subject focal analysis and one-click caption-safe placement exist; MediaPipe provider remains |
| Beat-aware lyrics timing | Done | Lightweight onset markers are generated, persisted, and visualized on the timeline without changing word timestamps |
| CTA overlays | Done | Timed CTA cues render as safe-zone-aware high-contrast cards in the shared canvas renderer and remain editable |
| B-roll and SFX cue tracks | Done | Cue types are persisted separately from captions and can be edited or removed in the Intelligence Tracks inspector |

### Phase 2 exit note

The local creator-intelligence scope is integrated: deterministic semantic cues,
editable cue metadata, beat markers, safe-zone placement, and CTA preview
rendering are persisted in projects and covered by the existing typecheck/build
validation. MediaPipe remains an optional accuracy upgrade to the current
heuristic subject detector; Gemini remains the production semantic provider
behind the stable cue contract.

## Phase 3: Cloud SaaS platform

| Deliverable | Status | Acceptance criteria |
| --- | --- | --- |
| Object storage | Planned | Uploads and outputs use private S3-compatible storage with signed URLs |
| CDN delivery | Planned | Completed exports stream through CloudFront or equivalent CDN |
| Job queue | Planned | Celery or BullMQ handles retries, concurrency, priorities, and dead letters |
| Durable project API | Planned | Projects, assets, captions, and export jobs survive device changes |
| Collaboration and recovery | Planned | Autosave, job history, and recoverable failed exports are available |
| Observability | Planned | Structured logs, metrics, tracing, and alerting cover AI and render jobs |

## Performance targets

These targets guide optimization without trading away caption quality:

- Preview interactions remain responsive while audio analysis and export work
  run off the main UI path.
- Reuse decoded audio, measured text layouts, loaded fonts, and render plans
  instead of recomputing them per frame.
- Use WebCodecs and workers when supported; use server FFmpeg for deterministic
  production exports.
- Prefer parallel chunk rendering for long videos only when keyframe and audio
  joins can be verified.
- Keep CRF and source resolution as quality controls; change encoder presets
  before lowering output quality.
- Never stretch caption timing across detected silence to reduce render time.

## Definition of roadmap completion

The initial NovaCap roadmap is complete when:

1. A validated Whisper/WhisperX or AssemblyAI provider supplies production-grade
   word timestamps and confidence.
2. One versioned style schema drives the browser preview and server renderer.
3. A queued FFmpeg worker produces deterministic burned-in exports.
4. Semantic enrichment, reframing, and CTA/B-roll metadata are editable.
5. Assets and jobs are secured, observable, retryable, and delivered through
   signed cloud URLs.

## Update protocol

When completing work:

1. Change only the relevant status in this file.
2. Add the commit or pull request reference when useful.
3. Record new dependencies or blockers explicitly.
4. Keep acceptance criteria testable; avoid marking infrastructure as done
   based only on a local mock.
