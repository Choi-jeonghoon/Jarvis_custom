import { create } from 'zustand';
import { stripThinkTags, toSpeakableText } from './message-text';

/**
 * Captions: the answer as JARVIS "says" it — one sentence at a time, shown
 * over the orb and spoken in step with it.
 */

const MAX_CAPTION = 90;

/** Break one over-long sentence near a comma or space, keeping each ≤ MAX_CAPTION. */
function breakLong(sentence: string): string[] {
  const out: string[] = [];
  let rest = sentence;
  while (rest.length > MAX_CAPTION) {
    const window = rest.slice(0, MAX_CAPTION);
    let cut = window.lastIndexOf(', ') + 1;
    if (cut < MAX_CAPTION * 0.4) cut = window.lastIndexOf(' ');
    if (cut < MAX_CAPTION * 0.4) cut = MAX_CAPTION;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Split an answer (markdown) into display/speech captions. */
export function splitCaptions(text: string): string[] {
  const body = stripThinkTags(text).replace(/```[\s\S]*?(?:```|$)/g, '\n(코드 생략)\n');
  const captions: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    if (rawLine.trim() === '(코드 생략)') {
      captions.push('(코드 생략)');
      continue;
    }
    const line = toSpeakableText(rawLine);
    if (!line) continue;
    // A markdown line on its own (heading, list item) gets a full stop so it
    // reads — and is spoken — as a complete phrase.
    const terminated = /[.!?。！？:;)]$/.test(line) ? line : `${line}.`;
    // Sentence ends: punctuation followed by a space (so "4,915.68" stays whole).
    for (const sentence of terminated.split(/(?<=[.!?。！？])\s+/)) {
      const s = sentence.trim();
      if (s) captions.push(...breakLong(s));
    }
  }
  return captions;
}

export function captionKey(captions: string[]): string {
  return captions.join('\n');
}

/** How long a caption stays up when nobody is speaking it. */
export function readingMs(caption: string): number {
  return Math.round(Math.min(9000, Math.max(2200, caption.length * 110)));
}

export type CaptionMode = 'idle' | 'auto' | 'voice' | 'manual';

interface CaptionStore {
  key: string;
  captions: string[];
  index: number;
  mode: CaptionMode;
  load: (captions: string[], mode: CaptionMode) => void;
  show: (index: number, mode?: CaptionMode) => void;
}

export const useCaptionStore = create<CaptionStore>((set) => ({
  key: '',
  captions: [],
  index: 0,
  mode: 'idle',
  load: (captions, mode) => set({ key: captionKey(captions), captions, index: 0, mode }),
  show: (index, mode) =>
    set((s) => ({
      index: Math.max(0, Math.min(index, s.captions.length - 1)),
      mode: mode ?? s.mode,
    })),
}));
