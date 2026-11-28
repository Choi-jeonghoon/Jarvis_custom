import { useEffect, useRef } from 'react';
import { useAppStore } from '../../lib/store';
import { useTtsStore } from '../../lib/tts';
import { checkMicrophone } from '../../lib/micCheck';
import { splitCaptions } from '../../lib/captions';
import {
  installAudioUnlock,
  speakCaptions,
  isAudioUnlocked,
  speakText,
  stopSpeaking,
  useVoiceStore,
  type VoicePhase,
} from '../../lib/voice';
import { OPEN_VOICE_EVENT } from '../CommandCenter/data';
import { useModalStore } from '../../lib/ui-modals';

/**
 * Hands-free voice conversation on the current screen — no modal.
 *
 *   "헬로 자비스"  →  JARVIS (영국 남성 음성): "Welcome back, sir. What can I do for you?"
 *   질문          →  답변이 Live Conversation 패널에 글로 표시되고, 동시에 음성으로 읽힘
 *   후속 질문     →  답변 후 잠시 호출어 없이 바로 이어서 질문 가능
 *   침묵          →  다시 "헬로 자비스" 대기
 *
 * Saying "헬로 자비스, 내일 날씨 알려줘" in one breath skips the greeting.
 */

const GREETING_EN = 'Welcome back, sir. What can I do for you?';
const GREETING_KO = '네, 어서오세요. 무엇을 도와드릴까요?';
/** How long to wait for a question after the greeting. */
const QUESTION_TIMEOUT_MS = 9000;
/** How long to keep listening for a follow-up after an answer. */
const FOLLOW_UP_TIMEOUT_MS = 7000;

const WAKE_PATTERNS = ['헬로자비스', '헬로우자비스', '할로자비스', 'hellojarvis', 'hello자비스', '헤이자비스', 'heyjarvis'];
const WAKE_PREFIX_RE = /^.*?(?:헬로우?|할로|헤이|hello|hey)\s*(?:자비스|jarvis)[\s,.:!?，。！？]*/i;
const STOP_PATTERNS = ['대기모드', '자비스종료', '그만해', '됐어', '고마워'];

type Mode = 'wake' | 'question' | 'busy';

const normalize = (text: string) => text.toLowerCase().replace(/[\s.,!?。，！？~]/g, '');

interface Props {
  /** Send a chat message on the current screen; resolves with the reply text. */
  sendMessage: (text: string) => Promise<string | undefined>;
}

export function VoiceConversation({ sendMessage }: Props) {
  const speechEnabled = useAppStore((s) => s.settings.speechEnabled);
  const sendRef = useRef(sendMessage);
  useEffect(() => {
    sendRef.current = sendMessage;
  }, [sendMessage]);

  // The manual trigger (sidebar mic, "Start Voice Chat") is handled inside the
  // main effect; this ref lets it reach the running loop.
  const manualTriggerRef = useRef<() => void>(() => {});

  useEffect(() => installAudioUnlock(), []);

  // Sidebar mic / quick command: turn voice on if needed, then greet + listen.
  useEffect(() => {
    const onRequest = () => {
      // Asked from inside the dashboard modal: show the orb.
      useModalStore.getState().setDashboardOpen(false);
      const { settings, updateSettings } = useAppStore.getState();
      if (!settings.speechEnabled) {
        updateSettings({ speechEnabled: true });
        // The loop starts on the next render; greet once it is waiting.
        pendingManualRef.current = true;
        return;
      }
      manualTriggerRef.current();
    };
    window.addEventListener(OPEN_VOICE_EVENT, onRequest);
    return () => window.removeEventListener(OPEN_VOICE_EVENT, onRequest);
  }, []);
  const pendingManualRef = useRef(false);

  useEffect(() => {
    const store = useVoiceStore.getState();
    const report = (phase: VoicePhase, status: string) => store.set({ phase, status });

    if (!speechEnabled) {
      report('off', '설정에서 음성 입력을 켜면 "헬로 자비스"로 호출할 수 있습니다');
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    let alive = true;
    let mode: Mode = 'busy';
    // Which mic the browser gave us, shown in the status so a wrong default
    // device is obvious. Chrome's speech recognition uses this same default.
    let micLabel = '';
    let micWarning = '';
    let recognition: any = null;
    let restartTimer = 0;
    let silenceTimer = 0;
    // Clap detection
    let clapStream: MediaStream | null = null;
    let clapContext: AudioContext | null = null;
    let clapFrame = 0;

    const clearTimers = () => {
      window.clearTimeout(restartTimer);
      window.clearTimeout(silenceTimer);
    };

    const stopRecognition = () => {
      window.clearTimeout(restartTimer);
      const r = recognition;
      recognition = null;
      if (!r) return;
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      try { r.abort(); } catch { /* already stopped */ }
    };

    const startRecognition = () => {
      if (!alive || !SpeechRecognition) return;
      stopRecognition();
      const r = new SpeechRecognition();
      r.lang = 'ko-KR';
      r.continuous = true;
      r.interimResults = true;
      recognition = r;

      r.onresult = (event: any) => {
        let finalText = '';
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText += t;
          else interimText += t;
        }
        onSpeech(finalText.trim(), interimText.trim());
      };

      r.onerror = (event: any) => {
        if (recognition !== r) return;
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          // The speech service gives no detail, so name both places to check.
          fail('마이크 권한이 막혀 있어요 · 주소창 왼쪽 아이콘과 시스템 설정 → 개인정보 보호 및 보안 → 마이크를 확인해 주세요');
        } else if (event.error === 'audio-capture') {
          fail(`마이크 소리를 받을 수 없어요${micLabel ? ` (${micLabel})` : ''} · 연결을 확인해 주세요`);
        } else if (event.error === 'network') {
          store.set({ status: '음성 인식 서버 연결 실패 · 다시 시도 중…' });
        }
      };

      // Chrome ends continuous recognition every so often; keep it alive.
      r.onend = () => {
        if (recognition !== r || !alive || mode === 'busy') return;
        restartTimer = window.setTimeout(() => {
          if (recognition === r && alive && mode !== 'busy') {
            try { r.start(); } catch { startRecognition(); }
          }
        }, 300);
      };

      try { r.start(); } catch { /* started twice — harmless */ }
    };

    const fail = (message: string) => {
      alive = false;
      clearTimers();
      stopRecognition();
      report('unavailable', message);
    };

    const backToWake = () => {
      if (!alive) return;
      clearTimers();
      mode = 'wake';
      store.set({ heard: '' });
      report(
        'wake',
        micWarning || `"헬로 자비스" 라고 불러 주세요${micLabel ? ` · ${micLabel}` : ''}`,
      );
      startRecognition();
    };

    const listenForQuestion = (timeoutMs: number, status: string) => {
      if (!alive) return;
      clearTimers();
      mode = 'question';
      store.set({ heard: '' });
      report('listening', status);
      startRecognition();
      silenceTimer = window.setTimeout(backToWake, timeoutMs);
    };

    const say = async (
      phase: VoicePhase,
      status: string,
      text: string,
      opts?: Parameters<typeof speakText>[2],
    ) => {
      report(phase, status);
      await speakText(text, useAppStore.getState().settings.voiceName, opts);
    };

    const greet = async () => {
      if (!alive || mode === 'busy') return;
      mode = 'busy';
      stopSpeaking(); // "헬로 자비스" interrupts a reply being read aloud
      clearTimers();
      stopRecognition(); // never let JARVIS hear itself
      if (!isAudioUnlocked()) {
        store.set({ status: '화면을 한 번 클릭하면 음성 응답이 켜집니다' });
      }
      const { greetingVoice } = useAppStore.getState().settings;
      if (greetingVoice === 'ko') {
        await say('greeting', '어서오세요', GREETING_KO);
      } else {
        await say('greeting', 'Welcome back, sir', GREETING_EN, {
          serverVoiceId: greetingVoice || 'en-GB-RyanNeural',
          lang: 'en-GB',
        });
      }
      listenForQuestion(QUESTION_TIMEOUT_MS, '듣고 있습니다 · 질문을 말씀해 주세요');
    };

    const answer = async (question: string) => {
      if (!alive) return;
      mode = 'busy';
      stopSpeaking();
      clearTimers();
      stopRecognition();
      store.set({ heard: question });

      if (STOP_PATTERNS.some((p) => normalize(question).includes(p))) {
        await say('speaking', '대기 모드', '네, 필요하시면 다시 불러 주세요.');
        backToWake();
        return;
      }

      if (useAppStore.getState().streamState.isStreaming) {
        await say('speaking', '이전 답변 생성 중', '잠시만요, 이전 답변을 아직 만들고 있습니다.');
        backToWake();
        return;
      }

      report('thinking', `"${question}" · 답변 생성 중…`);
      let reply: string | undefined;
      try {
        reply = await sendRef.current(question);
      } catch {
        reply = undefined;
      }
      if (!alive) return;

      if (!reply?.trim()) {
        await say('speaking', '응답 실패', '죄송합니다. 지금은 답변을 드릴 수 없습니다.');
        backToWake();
        return;
      }

      // The reply is already on screen; keep the chat's own autoplay from
      // reading it a second time.
      const { messages } = useAppStore.getState();
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') useTtsStore.getState().markAutoSpoken(last.id);

      // Speak sentence by sentence so the first one starts right away.
      report('speaking', '답변을 읽고 있습니다');
      await speakCaptions(splitCaptions(reply), useAppStore.getState().settings.voiceName);
      if (!alive) return;
      listenForQuestion(FOLLOW_UP_TIMEOUT_MS, '이어서 질문하실 수 있습니다');
    };

    const onSpeech = (finalText: string, interimText: string) => {
      if (!alive) return;

      if (mode === 'wake') {
        const text = finalText || interimText;
        const n = normalize(text);
        if (!WAKE_PATTERNS.some((p) => n.includes(p))) return;
        // Wait for the final result so a trailing question is captured whole.
        if (!finalText) return;
        const query = finalText.replace(WAKE_PREFIX_RE, '').trim();
        if (query.length >= 2) void answer(query);
        else void greet();
        return;
      }

      if (mode === 'question') {
        if (interimText) {
          store.set({ heard: interimText });
          // Still talking — push the silence deadline back.
          window.clearTimeout(silenceTimer);
          silenceTimer = window.setTimeout(backToWake, QUESTION_TIMEOUT_MS);
        }
        if (finalText) {
          // Saying the wake word again mid-conversation shouldn't be sent as a question.
          const query = finalText.replace(WAKE_PREFIX_RE, '').trim();
          if (query.length >= 2) void answer(query);
          else void greet();
        }
      }
    };

    // ── Double-clap wake ────────────────────────────────────────────────
    const startClapDetection = async () => {
      try {
        clapStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!alive) return;
        clapContext = new AudioContext();
        const analyser = clapContext.createAnalyser();
        analyser.fftSize = 1024;
        clapContext.createMediaStreamSource(clapStream).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        const spectrum = new Uint8Array(analyser.frequencyBinCount);
        const sampleRate = clapContext.sampleRate;
        let previousVolume = 0;
        let firstClap = 0;
        let lastClap = 0;

        const tick = () => {
          if (!alive) return;
          clapFrame = requestAnimationFrame(tick);
          if (mode !== 'wake') return;

          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const s of samples) {
            const v = (s - 128) / 128;
            sum += v * v;
          }
          const volume = Math.sqrt(sum / samples.length);

          analyser.getByteFrequencyData(spectrum);
          let high = 0;
          let total = 0;
          for (let i = 0; i < spectrum.length; i++) {
            const e = spectrum[i] * spectrum[i];
            total += e;
            if ((i * sampleRate) / analyser.fftSize >= 1800) high += e;
          }
          const isClap = volume > 0.12 && previousVolume < 0.055 && total > 0 && high / total > 0.38;
          previousVolume = volume;
          if (!isClap) return;

          const now = Date.now();
          if (now - lastClap < 280) return;
          lastClap = now;
          if (firstClap && now - firstClap >= 250 && now - firstClap <= 850) {
            firstClap = 0;
            void greet();
          } else {
            firstClap = now;
          }
        };
        tick();
      } catch {
        // Clap wake is a bonus; the wake word still works without it.
      }
    };

    // ── Boot ────────────────────────────────────────────────────────────
    (async () => {
      if (!SpeechRecognition) {
        report('unavailable', '이 브라우저는 음성 인식을 지원하지 않습니다 · Chrome을 사용해 주세요');
        return;
      }
      report('starting', '마이크 확인 중…');
      const mic = await checkMicrophone();
      if (!alive) return;
      if (!mic.ok) {
        fail(
          mic.reason === 'system-denied'
            ? 'macOS가 마이크를 막고 있어요 · 시스템 설정 → 개인정보 보호 및 보안 → 마이크에서 브라우저를 켜 주세요'
            : mic.reason === 'denied'
            ? '마이크 권한이 막혀 있어요 · 주소창 왼쪽 아이콘에서 마이크를 허용해 주세요'
            : mic.reason === 'no-device'
              ? '연결된 마이크를 찾지 못했어요 · 마이크를 연결해 주세요'
              : mic.reason === 'unsupported'
                ? '이 주소에서는 마이크를 쓸 수 없어요 · localhost 또는 https로 접속해 주세요'
                : '마이크를 시작하지 못했어요 · 새로고침해 주세요',
        );
        return;
      }
      micLabel = mic.deviceLabel.replace(/\s*\(.*\)\s*$/, '');
      // A quiet digital mic is fine. A quiet *built-in* mic usually means the
      // lid is closed (it's switched off) and another mic should be picked.
      if (mic.silent && /macbook|built-?in|내장/i.test(mic.deviceLabel)) {
        micWarning = `${micLabel}에서 소리가 안 들려요 · 덮개를 닫았다면 크롬 마이크 설정에서 다른 마이크를 고르세요`;
      }
      void startClapDetection();
      backToWake();
      if (pendingManualRef.current) {
        pendingManualRef.current = false;
        void greet();
      }
    })();

    manualTriggerRef.current = () => {
      if (!alive) return;
      if (mode === 'busy') return;
      void greet();
    };

    return () => {
      alive = false;
      manualTriggerRef.current = () => {};
      clearTimers();
      stopRecognition();
      stopSpeaking();
      cancelAnimationFrame(clapFrame);
      clapStream?.getTracks().forEach((t) => t.stop());
      void clapContext?.close();
      useVoiceStore.getState().set({ phase: 'off', heard: '' });
    };
  }, [speechEnabled]);

  return null;
}
