# NovaCap render service

`render_plan.py` is the first server-rendering slice. It converts the shared
subtitle JSON contract into an ASS subtitle file and prints an FFmpeg command
that burns the captions into the source video.

```powershell
python services\render_service\render_plan.py `
  subtitles.json captions.ass input.mp4 output.mp4
```

The module is intentionally dependency-free. It does not invoke FFmpeg yet;
the future export worker can execute the returned argument list after adding
job authentication, cancellation, progress reporting, and object storage.
