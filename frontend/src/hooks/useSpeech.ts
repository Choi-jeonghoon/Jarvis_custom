import { useState, useCallback, useRef, useEffect } from 'react';
import { transcribeAudio, fetchSpeechHealth } from '../lib/api';

export type SpeechState = 'idle' | 'recording' | 'transcribing';

interface RecordingOptions {
  onSilence?: () => void;
}

export function useSpeech() {
  const [state, setState] = useState<SpeechState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const onSilenceRef = useRef<(() => void) | undefined>(undefined);
  const silenceTriggeredRef = useRef(false);

  useEffect(() => {
    fetchSpeechHealth()
      .then((health) => setAvailable(health.available))
      .catch(() => setAvailable(false));
  }, []);

  const cleanupAudio = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async (
    options: RecordingOptions = {},
  ): Promise<void> => {
    setError(null);
    silenceTriggeredRef.current = false;
    onSilenceRef.current = options.onSilence;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not supported in this browser');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setState('recording');

      // Voice activity detection using RMS.
      // Speech must be detected first; then 1.3 seconds of silence ends recording.
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const samples = new Uint8Array(analyser.fftSize);
      let speechStarted = false;
      let lastVoiceAt = 0;
      const startedAt = Date.now();

      const detect = () => {
        if (recorder.state !== 'recording') return;

        analyser.getByteTimeDomainData(samples);

        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const value = (samples[i] - 128) / 128;
          sum += value * value;
        }

        const rms = Math.sqrt(sum / samples.length);
        const now = Date.now();

        if (rms > 0.025) {
          speechStarted = true;
          lastVoiceAt = now;
        }

        const silenceDetected =
          speechStarted && now - lastVoiceAt >= 1300;

        // Safety limit: don't leave the microphone recording indefinitely.
        const maximumDurationReached = now - startedAt >= 20000;

        if (
          !silenceTriggeredRef.current &&
          (silenceDetected || maximumDurationReached)
        ) {
          silenceTriggeredRef.current = true;
          onSilenceRef.current?.();
          return;
        }

        rafRef.current = requestAnimationFrame(detect);
      };

      rafRef.current = requestAnimationFrame(detect);
    } catch (err) {
      cleanupAudio();
      setError(
        err instanceof Error
          ? `Microphone error: ${err.message}`
          : 'Microphone access denied',
      );
      setState('idle');
    }
  }, [cleanupAudio]);

  const stopRecording = useCallback(async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorderRef.current;

      if (!recorder || recorder.state !== 'recording') {
        reject(new Error('Not recording'));
        return;
      }

      recorder.onstop = async () => {
        setState('transcribing');

        cleanupAudio();
        mediaRecorderRef.current = null;

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });

        chunksRef.current = [];

        try {
          const result = await transcribeAudio(blob);
          setState('idle');
          resolve(result.text);
        } catch (err) {
          setState('idle');
          const message =
            err instanceof Error ? err.message : 'Transcription failed';
          setError(message);
          reject(err);
        }
      };

      recorder.stop();
    });
  }, [cleanupAudio]);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state === 'recording') {
      recorder.onstop = null;
      recorder.stop();
    }

    mediaRecorderRef.current = null;
    chunksRef.current = [];
    cleanupAudio();
    setState('idle');
  }, [cleanupAudio]);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === 'recording') {
        recorder.onstop = null;
        recorder.stop();
      }
      cleanupAudio();
    };
  }, [cleanupAudio]);

  return {
    state,
    error,
    available,
    startRecording,
    stopRecording,
    cancelRecording,
    isRecording: state === 'recording',
    isTranscribing: state === 'transcribing',
  };
}
