# NovaCap render service

`render_plan.py` is the first server-rendering slice. It converts the shared
subtitle JSON contract into an ASS subtitle file and prints an FFmpeg command
that burns the captions into the source video.

Run the plan API from the repository root:

```powershell
uvicorn services.render_service.main:app --reload --port 8090
```

`POST /v1/render/plan` returns the generated ASS document and an argument-safe
FFmpeg command. The default `veryfast` x264 preset, CRF 18, and automatic
threading reduce export latency while preserving the configured quality target.

```powershell
python services\render_service\render_plan.py `
  subtitles.json captions.ass input.mp4 output.mp4
```

The module does not invoke FFmpeg yet; the future export worker can execute the
returned argument list after adding job authentication, cancellation, progress
reporting, and object storage.
