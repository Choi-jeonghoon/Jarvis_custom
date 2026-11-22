import { useEffect, useRef } from 'react';
import { checkMicrophone } from '../../lib/micCheck';

interface Props {
  enabled: boolean;
  resetKey?: number;
  onStatus?: (status: string) => void;
  onWake: (initialQuery?: string) => Promise<void> | void;
}

export function WakeAssistant({ enabled, resetKey = 0, onStatus, onWake }: Props) {
  const activeRef = useRef(false);
  const onWakeRef = useRef(onWake);
  const onStatusRef = useRef(onStatus);

  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    const reportStatus = (message: string) => onStatusRef.current?.(message);

    if (!enabled) {
      activeRef.current = false;
      reportStatus(enabled ? '호출어 대기 꺼짐' : '설정에서 음성 입력을 켜 주세요');
      return;
    }

    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let animation = 0;
    let recognition: any = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    let firstClap = 0;
    let lastClap = 0;
    let previousVolume = 0;
    let activated = false;

    activeRef.current = true;
    reportStatus('마이크 연결 중…');

    const activate = (initialQuery?: string) => {
      if (activated || !activeRef.current) return;
      activated = true;
      activeRef.current = false;

      if (animation) cancelAnimationFrame(animation);
      if (restartTimer) clearTimeout(restartTimer);

      try { recognition?.stop(); } catch {}
      stream?.getTracks().forEach(track => track.stop());
      void audioContext?.close();

      reportStatus('JARVIS 활성화 · 질문을 기다립니다');
      void onWakeRef.current(initialQuery);
    };

    const start = async () => {
      try {
        // 클램쉘 모드 등으로 마이크가 무음/없음이면 대기 루프를 돌리지 않는다.
        const mic = await checkMicrophone();
        if (!activeRef.current) return;
        if (!mic.ok) {
          activeRef.current = false;
          reportStatus(
            mic.reason === 'denied'
              ? '마이크 권한 차단됨 · 텍스트 입력을 사용하세요'
              : mic.reason === 'no-device' || mic.reason === 'silent'
                ? '마이크 없음(클램쉘 모드?) · 외부 마이크 연결 또는 텍스트 입력'
                : '마이크 연결 실패 · 텍스트 입력을 사용하세요',
          );
          return;
        }

        stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // EarPods 마이크가 확인되면 해당 장치를 우선 사용
        const devices = await navigator.mediaDevices.enumerateDevices();
        const earpods = devices.find(
          d => d.kind === 'audioinput' && d.label.toLowerCase().includes('earpods')
        );

        if (earpods && stream.getAudioTracks()[0]?.getSettings().deviceId !== earpods.deviceId) {
          stream.getTracks().forEach(track => track.stop());
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: earpods.deviceId } }
          });
        }

        if (!activeRef.current || !stream) return;

        audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        audioContext.createMediaStreamSource(stream).connect(analyser);

        const samples = new Uint8Array(analyser.fftSize);
        const spectrum = new Uint8Array(analyser.frequencyBinCount);

        const detectClaps = () => {
          if (!activeRef.current || !analyser) return;

          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) {
            const value = (sample - 128) / 128;
            sum += value * value;
          }

          const volume = Math.sqrt(sum / samples.length);
          const now = Date.now();
          analyser.getByteFrequencyData(spectrum);

          let highFrequencyEnergy = 0;
          let totalEnergy = 0;
          const sampleRate = audioContext?.sampleRate ?? 44100;
          for (let i = 0; i < spectrum.length; i++) {
            const energy = spectrum[i] * spectrum[i];
            totalEnergy += energy;
            if ((i * sampleRate) / analyser.fftSize >= 1800) {
              highFrequencyEnergy += energy;
            }
          }

          const highFrequencyRatio =
            totalEnergy > 0 ? highFrequencyEnergy / totalEnergy : 0;
          const clapTransient =
            volume > 0.12 &&
            previousVolume < 0.055 &&
            highFrequencyRatio > 0.38;
          previousVolume = volume;

          if (clapTransient && now - lastClap > 280) {
            lastClap = now;

            if (firstClap && now - firstClap >= 250 && now - firstClap <= 850) {
              reportStatus('박수 두 번 감지');
              activate();
              return;
            }

            firstClap = now;
            reportStatus('첫 번째 박수 감지 · 한 번 더 박수치세요');

            window.setTimeout(() => {
              if (activeRef.current && Date.now() - firstClap > 1000) {
                firstClap = 0;
                reportStatus('헬로 자비스 또는 박수 두 번 대기 중');
              }
            }, 1050);
          }

          animation = requestAnimationFrame(detectClaps);
        };

        detectClaps();

        // Chrome Web Speech API를 이용한 호출어 감지
        const SpeechRecognition =
          (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition;

        if (SpeechRecognition) {
          recognition = new SpeechRecognition();
          recognition.lang = 'ko-KR';
          recognition.continuous = true;
          recognition.interimResults = true;

          recognition.onresult = (event: any) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
              if (!event.results[i].isFinal) continue;

              const rawText = event.results[i][0].transcript.trim();
              const normalizedText = rawText
                .toLowerCase()
                .replace(/[\s.,!?。，！？]/g, '');

              if (!normalizedText.startsWith('헬로자비스') &&
                  !normalizedText.startsWith('hellojarvis')) continue;

              reportStatus('호출어 감지 · 질문을 처리합니다');
              const initialQuery = rawText.replace(
                /^(?:헬로\s*자비스|hello\s*jarvis)[\s,.:!?，。！？]*/i,
                '',
              ).trim();
              activate(initialQuery || undefined);
              return;
            }
          };

          recognition.onerror = () => {};
          recognition.onend = () => {
            if (activeRef.current && !activated) {
              restartTimer = setTimeout(() => {
                try { recognition?.start(); } catch {}
              }, 500);
            }
          };

          try { recognition.start(); } catch {}
        }

        reportStatus(
          SpeechRecognition
            ? '박수 두 번 또는 헬로 자비스를 기다리는 중'
            : '박수 두 번을 기다리는 중 (호출어 인식 미지원)'
        );
      } catch (error) {
        console.error('WakeAssistant:', error);
        reportStatus('마이크 연결 실패 · 브라우저 권한을 확인하세요');
        activeRef.current = false;
        stream?.getTracks().forEach(track => track.stop());
      }
    };

    void start();

    return () => {
      activeRef.current = false;
      if (animation) cancelAnimationFrame(animation);
      if (restartTimer) clearTimeout(restartTimer);
      try { recognition?.stop(); } catch {}
      stream?.getTracks().forEach(track => track.stop());
      void audioContext?.close();
    };
  }, [enabled, resetKey]);

  return null;
}
