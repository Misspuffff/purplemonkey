/**
 * useRecorder
 *
 * Records the canvas (video + every visual layer) together with the master
 * audio bus, and downloads the clip when recording stops.
 *
 * Picks the first container the browser supports: WebM (Chrome/Firefox) or
 * MP4 (Safari).
 */

import { useCallback, useRef } from 'react';
import { getRecordingStream } from '../audio-engine/masterBus.js';
import { useAppStore } from '../store/instrumentStore.js';

const MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

export function useRecorder(canvasRef) {
  const recorderRef = useRef(null);
  const setRecording = useAppStore((s) => s.setRecording);

  const start = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || recorderRef.current || typeof MediaRecorder === 'undefined') return;

    const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    const stream = new MediaStream([
      ...canvas.captureStream(30).getVideoTracks(),
      ...getRecordingStream().getAudioTracks(),
    ]);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    const chunks = [];

    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const type = recorder.mimeType || 'video/webm';
      const blob = new Blob(chunks, { type });
      const scene = useAppStore.getState().scene.name.toLowerCase().replace(/\s+/g, '-');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `AIr-${scene}-${stamp}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      stream.getVideoTracks().forEach((t) => t.stop());
    };

    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
  }, [canvasRef, setRecording]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }, [setRecording]);

  const toggle = useCallback(() => {
    if (recorderRef.current) stop();
    else start();
  }, [start, stop]);

  return { toggle, stop };
}
