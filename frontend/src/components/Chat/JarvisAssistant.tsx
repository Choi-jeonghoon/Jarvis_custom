
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, AudioLines } from 'lucide-react';
import { useSpeech } from '../../hooks/useSpeech';
import { useTtsStore } from '../../lib/tts';
import { generateId } from '../../lib/store';
import { checkMicrophone } from '../../lib/micCheck';
import './JarvisAssistant.css';

type Phase =
  | 'standby'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'error';

interface Props {
  autoStart?: boolean;
  initialQuery?: string;
  onClose: () => void;
  sendMessage: (text: string) => Promise<string | undefined>;
}

const PHASE_LABEL: Record<Phase, string> = {
  standby: 'READY',
  listening: 'LISTENING',
  transcribing: 'RECOGNIZING SPEECH',
  thinking: 'PROCESSING',
  speaking: 'SPEAKING',
  error: 'SYSTEM ERROR',
};

export function JarvisAssistant({
  autoStart = false,
  initialQuery = '',
  onClose,
  sendMessage,
}: Props) {
  const [phase, setPhase] = useState<Phase>('standby');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [micUnavailable, setMicUnavailable] = useState(false);

  const activeRef = useRef(false);
  const browserRecognitionRef = useRef<any>(null);
  const browserRestartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingVoiceRef = useRef(false);
  const processedInitialQueryRef = useRef(false);
  const sendRef = useRef(sendMessage);
  const startListeningRef = useRef<() => Promise<void>>(async () => {});
  const handleVoiceTextRef = useRef<(text: string) => void>(() => {});
  const startedAutomaticallyRef = useRef(false);

  const {
    state: speechState,
    error: speechError,
    available,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useSpeech();

  useEffect(() => {
    sendRef.current = sendMessage;
  }, [sendMessage]);

  const waitForTts = useCallback(async () => {
    const store = useTtsStore;

    if (store.getState().state === 'idle') return;

    await new Promise<void>((resolve) => {
      let finished = false;
      let unsubscribe = () => {};

      const finish = () => {
        if (finished) return;
        finished = true;
        unsubscribe();
        window.clearTimeout(timeout);
        resolve();
      };

      unsubscribe = store.subscribe((state) => {
        if (state.state === 'idle') finish();
      });

      const timeout = window.setTimeout(finish, 120000);
    });
  }, []);

  const speakAnswer = useCallback(async (text: string) => {
    const id = generateId();
    await useTtsStore.getState().speak(id, text);
    await waitForTts();

    if (!useTtsStore.getState().error && 'speechSynthesis' in window) return;
    if (!('speechSynthesis' in window)) return;

    await new Promise<void>((resolve) => {
      let timeout: number;
      const finish = () => {
        window.clearTimeout(timeout);
        resolve();
      };

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
      timeout = window.setTimeout(finish, 60000);
    });
  }, [waitForTts]);

  const handleVoiceText = useCallback(async (text: string) => {
    if (!activeRef.current || processingVoiceRef.current) return;
    processingVoiceRef.current = true;
    setTranscript(text);
    setResponse('');
    setPhase('thinking');
    try {
      browserRecognitionRef.current?.stop();
    } catch {}

    try {
      const reply = await sendRef.current(text);
      if (!activeRef.current) return;

      if (!reply?.trim()) {
        await startListeningRef.current();
        return;
      }

      setResponse(reply);
      setPhase('speaking');
      await speakAnswer(reply);

      if (activeRef.current) {
        await startListeningRef.current();
      }
    } catch (err) {
      if (!activeRef.current) return;
      setPhase('error');
      setResponse(err instanceof Error ? err.message : '음성 대화 중 오류가 발생했습니다.');
      window.setTimeout(() => {
        if (activeRef.current) void startListeningRef.current();
      }, 1500);
    }
  }, [speakAnswer]);

  handleVoiceTextRef.current = (text) => {
    void handleVoiceText(text);
  };

  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    processingVoiceRef.current = false;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    setPhase('listening');

    if (SpeechRecognition) {
      try {
        // 이전 인스턴스의 핸들러를 끊고 중단한다. (끊지 않으면 이전 인스턴스가
        // 'aborted' 오류를 내며 새 세션을 오류 상태로 만든다.)
        const previous = browserRecognitionRef.current;
        if (previous) {
          previous.onresult = null;
          previous.onerror = null;
          previous.onend = null;
          try { previous.abort(); } catch {}
        }
        if (browserRestartRef.current) {
          window.clearTimeout(browserRestartRef.current);
          browserRestartRef.current = null;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'ko-KR';
        recognition.continuous = true;
        recognition.interimResults = true;
        browserRecognitionRef.current = recognition;

        recognition.onresult = (event: any) => {
          let finalText = '';
          let interimText = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const text = event.results[i][0].transcript;
            if (event.results[i].isFinal) finalText += text;
            else interimText += text;
          }

          if (interimText) setTranscript(interimText.trim());

          if (finalText.trim() && !processingVoiceRef.current) {
            const text = finalText.trim();
            handleVoiceTextRef.current(text);
          }
        };

        recognition.onerror = (event: any) => {
          if (!activeRef.current || browserRecognitionRef.current !== recognition) return;
          // no-speech / aborted 는 재시작 과정에서 생기는 정상 이벤트 → onend에서 자동 재시작
          if (event.error === 'no-speech' || event.error === 'aborted') return;

          const fatal: Record<string, string> = {
            'not-allowed': '마이크 권한이 차단되었습니다. 브라우저 또는 앱 설정에서 마이크를 허용해 주세요.',
            'service-not-allowed': '마이크 권한이 차단되었습니다. 브라우저 또는 앱 설정에서 마이크를 허용해 주세요.',
            'audio-capture': '마이크를 찾을 수 없습니다. 클램쉘 모드라면 외부 마이크(AirPods·EarPods·USB 마이크)를 연결해 주세요. 텍스트 입력은 계속 사용할 수 있습니다.',
            network: '음성 인식 서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.',
          };

          activeRef.current = false; // 오류 상태에서 무한 재시작 방지
          setPhase('error');
          setResponse(fatal[event.error] ?? `음성 인식 오류: ${event.error}`);
          if (event.error === 'audio-capture') setMicUnavailable(true);
        };
        recognition.onend = () => {
          if (browserRecognitionRef.current !== recognition) return;
          if (!activeRef.current || processingVoiceRef.current) return;

          browserRestartRef.current = setTimeout(() => {
            if (activeRef.current) {
              try { browserRecognitionRef.current?.start(); } catch {}
            }
          }, 350);
        };

        recognition.start();
        return;
      } catch {
        setPhase('error');
        setResponse('브라우저 음성 인식을 시작할 수 없습니다. 마이크 권한을 확인하세요.');
        return;
      }
    }

    if (!available) {
      setPhase('error');
      setResponse('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    try {
      await startRecording({
        onSilence: () => {
          void handleSilenceRef.current();
        },
      });
    } catch {
      setPhase('error');
      setResponse('마이크를 시작할 수 없습니다. 마이크 권한을 확인하세요.');
    }
  }, [available, startRecording]);

  const startListeningRefCallback = startListening;

  const handleSilenceRef = useRef<() => Promise<void>>(async () => {});

  const handleSilence = useCallback(async () => {
    if (!activeRef.current) return;

    setPhase('transcribing');

    try {
      const text = (await stopRecording()).trim();

      if (!activeRef.current) return;

      if (!text) {
        await startListeningRef.current();
        return;
      }

      setTranscript(text);

      const normalized = text.replace(/\s/g, '').toLowerCase();

      if (
        normalized.includes('자비스대기모드') ||
        normalized.includes('대기모드로') ||
        normalized.includes('자비스종료')
      ) {
        deactivate();
        setResponse('음성 대기를 종료했습니다. 텍스트 입력은 계속 사용할 수 있습니다.');
        return;
      }

      setPhase('thinking');
      processingVoiceRef.current = true;

      const reply = await sendRef.current(text);

      if (!activeRef.current) return;

      if (!reply?.trim()) {
        await startListeningRef.current();
        return;
      }

      setResponse(reply);
      setPhase('speaking');

      await speakAnswer(reply);

      if (activeRef.current) {
        await startListeningRef.current();
      }
    } catch (err) {
      if (!activeRef.current) return;

      setPhase('error');
      setResponse(
        err instanceof Error ? err.message : 'Voice conversation failed',
      );

      window.setTimeout(() => {
        if (activeRef.current) {
          void startListeningRef.current();
        }
      }, 1800);
    }
  }, [stopRecording, speakAnswer]);

  handleSilenceRef.current = handleSilence;
  startListeningRef.current = startListeningRefCallback;

  const activate = useCallback(async () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition && !available) {
      setPhase('error');
      setResponse('이 브라우저와 기기에서 음성 인식을 사용할 수 없습니다.');
      return;
    }

    setTranscript('');
    setResponse('마이크 상태를 확인하는 중…');
    const mic = await checkMicrophone();
    if (!mic.ok) {
      setMicUnavailable(mic.reason === 'no-device' || mic.reason === 'silent');
      setPhase('error');
      setResponse(mic.message);
      return;
    }

    setMicUnavailable(false);
    activeRef.current = true;
    setResponse('');
    await startListeningRef.current();
  }, [available]);

  const deactivate = useCallback(() => {
    activeRef.current = false;
    if (browserRestartRef.current) {
      window.clearTimeout(browserRestartRef.current);
      browserRestartRef.current = null;
    }
    const recognition = browserRecognitionRef.current;
    browserRecognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch {}
    }
    processingVoiceRef.current = false;
    cancelRecording();
    useTtsStore.getState().stop();
    setPhase('standby');
  }, [cancelRecording]);

  const close = useCallback(() => {
    deactivate();
    onClose();
  }, [deactivate, onClose]);

  // HUD가 열리면 음성 대기를 자동으로 시작한다.
  useEffect(() => {
    if (autoStart && !startedAutomaticallyRef.current) {
      startedAutomaticallyRef.current = true;

      if (initialQuery.trim()) {
        activeRef.current = true;
        setTranscript(initialQuery.trim());
        handleVoiceTextRef.current(initialQuery.trim());
      } else {
        void activate();
      }
    }
  }, [autoStart, initialQuery, available, activate]);

  useEffect(() => {
    if (speechError && !browserRecognitionRef.current) {
      setResponse(speechError);
      setPhase('error');
    }
  }, [speechError]);

  const status = speechState === 'transcribing'
    ? 'transcribing'
    : phase;

  return (
    <div className="jarvis-overlay">
      <div className="jarvis-hud">
        <header className="jarvis-header">
          <div className="jarvis-brand">
            <AudioLines size={20} />
            <span>J.A.R.V.I.S.</span>
            <small>PERSONAL AI SYSTEM</small>
          </div>

          <button
            type="button"
            className="jarvis-close"
            onClick={close}
            aria-label="Close Jarvis"
          >
            <X size={22} />
          </button>
        </header>

        <main className="jarvis-main">
          <div className={`jarvis-reactor phase-${status}`}>
            <div className="jarvis-ring jarvis-ring-outer" />
            <div className="jarvis-ring jarvis-ring-middle" />
            <div className="jarvis-ring jarvis-ring-inner" />
            <div className="jarvis-core">
              <AudioLines size={42} strokeWidth={1.2} />
            </div>
            <div className="jarvis-orbit-dot" />
          </div>

          <div className="jarvis-status">
            <span className="jarvis-status-dot" />
            {PHASE_LABEL[status]}
          </div>

          <p className="jarvis-status-description">
            {status === 'standby' && '안녕하세요. 무엇을 도와드릴까요?'}
            {status === 'listening' && '음성 인식 중 · 질문을 말씀해 주세요'}
            {status === 'transcribing' && '음성을 텍스트로 변환하고 있습니다'}
            {status === 'thinking' && '로컬 AI가 답변을 생성하고 있습니다'}
            {status === 'speaking' && '답변을 전달하고 있습니다'}
            {status === 'error' && (micUnavailable
              ? '사용 가능한 마이크가 없습니다 · 텍스트 입력은 계속 가능합니다'
              : '음성 기능을 확인해 주세요. 텍스트 입력은 가능합니다.')}
          </p>

          <section className="jarvis-hud-readouts" aria-live="polite">
            <div className="jarvis-readout jarvis-voice-readout">
              <div className="jarvis-readout-heading">
                <span>VOICE INPUT</span>
                {status === 'listening' && <i className="jarvis-listening-indicator" />}
              </div>
              <p className={transcript ? '' : 'jarvis-readout-placeholder'}>
                {transcript || (status === 'listening'
                  ? '듣고 있습니다. 음성이 인식되면 여기에 표시됩니다.'
                  : micUnavailable
                    ? '마이크 없음 · 외부 마이크를 연결하면 음성 입력을 사용할 수 있습니다'
                    : '음성 입력 대기 중')}
              </p>
            </div>

            <div className="jarvis-readout jarvis-result-readout">
              <div className="jarvis-readout-heading">
                <span>J.A.R.V.I.S · LIVE RESPONSE</span>
                {status === 'thinking' && <i className="jarvis-processing-indicator" />}
              </div>
              <p className={response ? '' : 'jarvis-readout-placeholder'}>
                {response || (status === 'thinking'
                  ? '요청을 분석하고 있습니다…'
                  : '응답이 생성되면 이 패널에 정보가 표시됩니다.')}
              </p>
            </div>
          </section>

          <p className="jarvis-hint">
            {micUnavailable
              ? '외부 마이크 연결 후 다시 시도'
              : '“헬로 자비스” 또는 박수 두 번으로 호출 · 호출 후 질문하세요'}
          </p>
          {status === 'error' && (
            <button type="button" className="jarvis-retry" onClick={() => void activate()}>
              다시 시도
            </button>
          )}
        </main>

        <footer className="jarvis-footer">
          <span>LOCAL AI</span>
          <span>OPENJARVIS</span>
          <span>VOICE INTERFACE</span>
        </footer>
      </div>
    </div>
  );
}
