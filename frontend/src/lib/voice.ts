import { create } from 'zustand';
import { useTtsStore } from './tts';
import { toSpeakableText } from './message-text';
import { generateId } from './store';
import { synthesizeSpeech } from './api';

/**
 * Voice conversation state shared by the input dock (which runs the loop) and
 * the sidebar / command center (which only display it).
 */
export type VoicePhase =
  | 'off'        // 음성 입력이 꺼져 있음
  | 'starting'   // 마이크 확인 중
  | 'wake'       // "헬로 자비스" 대기
  | 'greeting'   // "어서오세요" 말하는 중
  | 'listening'  // 질문 듣는 중
  | 'thinking'   // 답변 생성 중
  | 'speaking'   // 답변 읽는 중
  | 'unavailable';

interface VoiceStore {
  phase: VoicePhase;
  status: string;
  /** Interim transcript of what the user is saying right now. */
  heard: string;
  set: (patch: Partial<Pick<VoiceStore, 'phase' | 'status' | 'heard'>>) => void;
}

export const useVoiceStore = create<VoiceStore>((set) => ({
  phase: 'off',
  status: '',
  heard: '',
  set: (patch) => set(patch),
}));

// ── Browser voice selection ───────────────────────────────────────────────

/**
 * Male Korean system voices, best first. macOS ships Reed/Eddy/Rocko/Grandpa
 * for ko-KR; Chrome and Safari on macOS expose them to speechSynthesis.
 */
const PREFERRED_MALE_KO = ['Reed', 'Eddy', 'Rocko', 'Grandpa', 'Minsu', 'InJoon'];

/** Settings value meaning "pick the best male Korean voice automatically". */
export const AUTO_VOICE = '';

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  // Chrome fills the list asynchronously on first access.
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    window.setTimeout(done, 1500);
  });
}

export async function listKoreanVoices(): Promise<SpeechSynthesisVoice[]> {
  return (await loadVoices()).filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('ko'));
}

export async function pickVoice(preferredName: string): Promise<SpeechSynthesisVoice | null> {
  const ko = await listKoreanVoices();
  if (preferredName) {
    const exact = ko.find((v) => v.name === preferredName);
    if (exact) return exact;
  }
  for (const name of PREFERRED_MALE_KO) {
    const v = ko.find((voice) => voice.name.startsWith(name));
    if (v) return v;
  }
  return ko[0] ?? null;
}

// ── Speaking ──────────────────────────────────────────────────────────────

/** British English browser voice for the English greeting (macOS: Daniel). */
async function pickEnglishVoice(): Promise<SpeechSynthesisVoice | null> {
  const gb = (await loadVoices()).filter((v) => v.lang.replace('_', '-') === 'en-GB');
  return gb.find((v) => v.name.startsWith('Daniel')) ?? gb[0] ?? null;
}

export interface SpeakOptions {
  /** Server TTS voice for this utterance only (e.g. "en-GB-RyanNeural"). */
  serverVoiceId?: string;
  /** Language of the text; picks the browser fallback voice. Default ko-KR. */
  lang?: 'ko-KR' | 'en-GB';
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

function speakWithBrowser(text: string, voiceName: string, lang: string): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  const voicePromise = lang === 'en-GB' ? pickEnglishVoice() : pickVoice(voiceName);
  return voicePromise.then(
    (voice) =>
      new Promise<void>((resolve) => {
        const synth = window.speechSynthesis;
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        if (voice) u.voice = voice;
        u.pitch = 0.95;
        currentUtterance = u; // keep a reference: Chrome GCs it mid-sentence otherwise
        let timer = 0;
        const finish = () => {
          window.clearTimeout(timer);
          if (currentUtterance === u) currentUtterance = null;
          resolve();
        };
        u.onend = finish;
        u.onerror = finish;
        // Upper bound so a lost `end` event can never wedge the voice loop.
        timer = window.setTimeout(finish, Math.max(8000, text.length * 220));
        synth.speak(u);
      }),
  );
}

function waitForServerTts(): Promise<void> {
  const store = useTtsStore;
  if (store.getState().state === 'idle') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(done, 180000);
    const unsub = store.subscribe((s) => {
      if (s.state === 'idle') done();
    });
    function done() {
      window.clearTimeout(timer);
      unsub();
      resolve();
    }
  });
}

/**
 * Speak `text` and resolve when playback ends. Uses the server TTS backend
 * (e.g. ElevenLabs) when one is configured, otherwise the browser's male
 * Korean voice.
 */
export async function speakText(
  text: string,
  voiceName: string,
  opts: SpeakOptions = {},
): Promise<void> {
  const speakable = toSpeakableText(text);
  if (!speakable) return;

  const tts = useTtsStore.getState();
  await tts.ensureHealth();
  if (useTtsStore.getState().available) {
    await tts.speak(generateId(), speakable, { voiceId: opts.serverVoiceId });
    await waitForServerTts();
    if (!useTtsStore.getState().error) return;
    // Server synthesis failed: fall through to the browser voice.
  }
  await speakWithBrowser(speakable, voiceName, opts.lang ?? 'ko-KR');
}

export function stopSpeaking(): void {
  useTtsStore.getState().stop();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  currentUtterance = null;
  cancelSequence();
}

// ── Sentence-by-sentence speech (captions) ───────────────────────────────

let seqToken = 0;
let seqAudio: HTMLAudioElement | null = null;
let seqAborts: AbortController[] = [];

function cancelSequence() {
  seqToken += 1;
  seqAborts.forEach((a) => a.abort());
  seqAborts = [];
  if (seqAudio) {
    seqAudio.onended = null;
    seqAudio.onerror = null;
    seqAudio.pause();
    seqAudio = null;
  }
}

function fetchAudio(text: string): Promise<Blob | null> {
  const ac = new AbortController();
  seqAborts.push(ac);
  return synthesizeSpeech(text, { signal: ac.signal }).catch(() => null);
}

function playBlob(blob: Blob, token: number): Promise<void> {
  return new Promise((resolve) => {
    if (token !== seqToken) return resolve();
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    seqAudio = el;
    const done = () => {
      URL.revokeObjectURL(url);
      if (seqAudio === el) seqAudio = null;
      resolve();
    };
    el.onended = done;
    el.onerror = done;
    el.play().catch(done);
  });
}

/**
 * Speak `captions` one after another, calling `onCaption(i)` as each starts,
 * so the screen can show exactly the sentence being heard. The next
 * sentence's audio is fetched while the current one plays, so there is no gap
 * — and the first sentence starts as soon as it alone is synthesized.
 */
export async function speakCaptions(
  captions: string[],
  voiceName: string,
  onCaption: (index: number) => void,
): Promise<void> {
  cancelSequence();
  const token = seqToken;
  if (!captions.length) return;

  const tts = useTtsStore.getState();
  await tts.ensureHealth();
  if (token !== seqToken) return;
  const server = useTtsStore.getState().available === true;

  let next = server ? fetchAudio(captions[0]) : null;
  for (let i = 0; i < captions.length; i++) {
    if (token !== seqToken) return;
    const current = next;
    next = server && i + 1 < captions.length ? fetchAudio(captions[i + 1]) : null;
    const blob = current ? await current : null;
    if (token !== seqToken) return;
    onCaption(i);
    if (blob) await playBlob(blob, token);
    else await speakWithBrowser(captions[i], voiceName, 'ko-KR');
  }
}

// ── Autoplay unlock ───────────────────────────────────────────────────────

let unlocked = false;

/**
 * Browsers only let a page play sound after the user has interacted with it.
 * The wake word arrives without a click, so prime audio on the first
 * interaction of any kind; after that the greeting can play on its own.
 */
export function installAudioUnlock(): () => void {
  if (unlocked) return () => {};
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        void ctx.resume().finally(() => void ctx.close());
      }
    } catch {
      /* best effort */
    }
    remove();
  };
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  const remove = () => events.forEach((e) => window.removeEventListener(e, unlock, true));
  events.forEach((e) => window.addEventListener(e, unlock, true));
  return remove;
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}
