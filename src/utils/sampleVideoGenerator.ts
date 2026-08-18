/**
 * Generates an instant high-quality sample video with synced audio
 * directly in browser memory using HTML5 Canvas & MediaRecorder.
 * Provides instant 1-click onboarding on both Mobile and Desktop.
 */

import { SubtitleBlock } from '../types';

export async function generateDemoVideo(): Promise<{
  file: File;
  sampleBlocks: SubtitleBlock[];
}> {
  const width = 540;
  const height = 960;
  const fps = 30;
  const durationSec = 7.5;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Web Audio context for synthesized voice tones & upbeat melody
  const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const dest = audioCtx.createMediaStreamDestination();

  // Create simple synthesized background beat & chord progression
  const now = audioCtx.currentTime;
  const chordNotes = [261.63, 329.63, 392.0, 440.0, 523.25]; // C4, E4, G4, A4, C5
  
  for (let t = 0; t < durationSec; t += 0.5) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // Kick / Click sound on beat
    osc.type = t % 1.0 === 0 ? 'sine' : 'triangle';
    const note = chordNotes[Math.floor((t * 2) % chordNotes.length)];
    osc.frequency.setValueAtTime(t % 1.0 === 0 ? 120 : note, now + t);
    if (t % 1.0 === 0) {
      osc.frequency.exponentialRampToValueAtTime(35, now + t + 0.15);
    }
    
    gain.gain.setValueAtTime(0.2, now + t);
    gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.35);
    
    osc.connect(gain);
    gain.connect(dest);
    
    osc.start(now + t);
    osc.stop(now + t + 0.4);
  }

  // Combine canvas stream and audio destination stream
  const canvasStream = canvas.captureStream(fps);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  // Determine supported mimeType
  let mimeType = 'video/webm;codecs=vp9,opus';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
  }

  const mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 2500000,
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const recordingPromise = new Promise<Blob>(resolve => {
    mediaRecorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
  });

  mediaRecorder.start();

  // Render animated frames to canvas
  const totalFrames = Math.round(durationSec * fps);
  let frame = 0;

  const renderFrame = () => {
    const timeSec = frame / fps;
    const progress = timeSec / durationSec;

    // Dark sleek gradient background
    const grad = ctx.createLinearGradient(0, 0, width, height);
    const hue1 = (timeSec * 25 + 220) % 360;
    const hue2 = (timeSec * 25 + 280) % 360;
    grad.addColorStop(0, `hsl(${hue1}, 45%, 8%)`);
    grad.addColorStop(0.5, `hsl(${hue2}, 35%, 12%)`);
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Decorative floating animated geometric spheres
    for (let i = 0; i < 6; i++) {
      const angle = timeSec * 1.2 + (i * Math.PI) / 3;
      const radius = 120 + Math.sin(timeSec * 2 + i) * 30;
      const cx = width / 2 + Math.cos(angle) * radius;
      const cy = height / 2 + Math.sin(angle * 1.5) * (radius * 1.4);
      
      const radial = ctx.createRadialGradient(cx, cy, 5, cx, cy, 80);
      radial.addColorStop(0, `rgba(245, 158, 11, ${0.25 + 0.1 * Math.sin(timeSec * 3 + i)})`);
      radial.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = radial;
      ctx.beginPath();
      ctx.arc(cx, cy, 80, 0, Math.PI * 2);
      ctx.fill();
    }

    // Audio Visualizer Ring in Center
    ctx.save();
    ctx.translate(width / 2, height / 2 - 80);
    const bars = 36;
    for (let b = 0; b < bars; b++) {
      const barAngle = (b / bars) * Math.PI * 2;
      const barHeight = 20 + Math.abs(Math.sin(timeSec * 6 + b * 0.5)) * 45;
      const x1 = Math.cos(barAngle) * 90;
      const y1 = Math.sin(barAngle) * 90;
      const x2 = Math.cos(barAngle) * (90 + barHeight);
      const y2 = Math.sin(barAngle) * (90 + barHeight);

      ctx.strokeStyle = `hsl(${(b * 10 + timeSec * 50) % 360}, 85%, 65%)`;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Center icon badge
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, 0, 75, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✨', 0, -5);

    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('DEMO REEL', 0, 35);
    ctx.restore();

    // Top Header Banner
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.roundRect(width / 2 - 140, 60, 280, 42, 21);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡ AUTOCAP STUDIO PREVIEW', width / 2, 81);

    // Frame Counter & Timecode
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${timeSec.toFixed(2)}s / ${durationSec.toFixed(2)}s`, width / 2, height - 80);

    // Bottom progress bar
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(40, height - 50, width - 80, 6);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(40, height - 50, (width - 80) * progress, 6);

    frame++;
    if (frame < totalFrames) {
      setTimeout(renderFrame, 1000 / fps);
    } else {
      mediaRecorder.stop();
      try {
        audioCtx.close();
      } catch {
        /* ignore */
      }
    }
  };

  renderFrame();

  const blob = await recordingPromise;
  const file = new File([blob], 'demo_viral_short.webm', { type: 'video/webm' });

  // Pre-aligned viral sample subtitles synced with demo video
  const sampleBlocks: SubtitleBlock[] = [
    {
      id: 'demo-1',
      start: 0.2,
      end: 2.2,
      speaker: 'Speaker 1',
      speakerColor: '#10B981',
      mood: 'hype',
      suggestedEmoji: '🔥',
      words: [
        { id: 'w1-1', text: 'Welcome', start: 0.2, end: 0.7, isEmphasized: true, colorOverride: '#FFE600' },
        { id: 'w1-2', text: 'to', start: 0.7, end: 1.0 },
        { id: 'w1-3', text: 'AutoCap', start: 1.0, end: 1.6, isEmphasized: true, colorOverride: '#38BDF8' },
        { id: 'w1-4', text: 'Studio!', start: 1.6, end: 2.2, isEmphasized: true, colorOverride: '#FFE600' },
      ],
    },
    {
      id: 'demo-2',
      start: 2.3,
      end: 4.6,
      speaker: 'Speaker 2',
      speakerColor: '#38BDF8',
      mood: 'hype',
      suggestedEmoji: '⚡',
      words: [
        { id: 'w2-1', text: 'Create', start: 2.3, end: 2.8 },
        { id: 'w2-2', text: 'viral', start: 2.8, end: 3.3, isEmphasized: true, colorOverride: '#FF2E4D' },
        { id: 'w2-3', text: 'animated', start: 3.3, end: 3.9 },
        { id: 'w2-4', text: 'captions', start: 3.9, end: 4.6, isEmphasized: true, colorOverride: '#FFE600' },
      ],
    },
    {
      id: 'demo-3',
      start: 4.7,
      end: 7.2,
      speaker: 'Speaker 1',
      speakerColor: '#10B981',
      mood: 'inspirational',
      suggestedEmoji: '🚀',
      words: [
        { id: 'w3-1', text: 'With', start: 4.7, end: 5.1 },
        { id: 'w3-2', text: 'karaoke', start: 5.1, end: 5.7, isEmphasized: true, colorOverride: '#A855F7' },
        { id: 'w3-3', text: 'pop', start: 5.7, end: 6.2, isEmphasized: true, colorOverride: '#FFE600' },
        { id: 'w3-4', text: 'and', start: 6.2, end: 6.5 },
        { id: 'w3-5', text: 'sound', start: 6.5, end: 6.9, isEmphasized: true, colorOverride: '#10B981' },
        { id: 'w3-6', text: 'effects!', start: 6.9, end: 7.2, isEmphasized: true, colorOverride: '#FFE600' },
      ],
    },
  ];

  return { file, sampleBlocks };
}
