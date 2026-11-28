import { Component, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronLeft, ChevronRight, Eye, EyeOff, ScrollText } from 'lucide-react';
import { GoldOrb3D, type OrbStatus } from './GoldOrb3D';
import { useAppStore } from '../../lib/store';
import { stripThinkTags } from '../../lib/message-text';
import { captionKey, readingMs, splitCaptions, useCaptionStore } from '../../lib/captions';
import './JarvisStage.css';

/** WebGL can fail (old GPU, disabled acceleration); keep the page usable. */
class OrbBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <div className="gold-orb gold-orb-fallback" /> : this.props.children;
  }
}

interface Props {
  status: OrbStatus;
  /** Latest user question, if any. */
  question: string;
  /** Latest answer (streams in live). */
  answer: string;
  thinking: boolean;
  /** What the microphone hears right now, while listening. */
  heard: string;
  onOpenHistory: () => void;
}

/**
 * The orb plus the latest answer, shown one of two ways (the user picks):
 *
 *   panel shown   the full formatted answer in a panel over the orb, with an
 *                 adjustable background opacity (0 % = text floats freely)
 *   panel hidden  the answer as JARVIS "says" it, one sentence at a time,
 *                 floating over the orb and following the voice
 */
export function JarvisStage({ status, question, answer, thinking, heard, onOpenHistory }: Props) {
  const showPanel = useAppStore((s) => s.settings.answerPanel);
  const opacity = useAppStore((s) => s.settings.answerPanelOpacity);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const cleanAnswer = useMemo(() => stripThinkTags(answer), [answer]);
  const captions = useMemo(() => splitCaptions(answer), [answer]);
  const key = captionKey(captions);

  const store = useCaptionStore();
  const loaded = store.key === key;

  // A finished answer that the voice loop isn't driving: load it for reading.
  useEffect(() => {
    if (thinking || !captions.length) return;
    if (useCaptionStore.getState().key !== key) useCaptionStore.getState().load(captions, 'auto');
  }, [thinking, key, captions]);

  // Reading-speed caption advance (caption view, auto mode only).
  useEffect(() => {
    if (showPanel || thinking || !loaded || store.mode !== 'auto') return;
    const current = store.captions[store.index];
    if (!current) return;
    const last = store.index >= store.captions.length - 1;
    const id = window.setTimeout(
      () => (last ? store.show(store.index, 'idle') : store.show(store.index + 1)),
      readingMs(current),
    );
    return () => window.clearTimeout(id);
  }, [showPanel, thinking, loaded, store.mode, store.index, store.captions, store]);

  // Panel: follow the newest words while streaming, then go back to the top.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (el && thinking) el.scrollTop = el.scrollHeight;
  }, [cleanAnswer, thinking]);
  useEffect(() => {
    const el = panelRef.current;
    if (el && !thinking) el.scrollTop = 0;
  }, [thinking, showPanel]);

  // Caption view: what to show.
  let current = '';
  let previous = '';
  let index = 0;
  let total = 0;
  if (thinking) {
    current = captions[captions.length - 1] ?? '';
    previous = captions[captions.length - 2] ?? '';
    index = Math.max(0, captions.length - 1);
  } else if (loaded) {
    index = store.index;
    total = store.captions.length;
    current = store.captions[index] ?? '';
    previous = store.captions[index - 1] ?? '';
  }
  const canStep = !thinking && loaded && store.mode !== 'voice' && total > 1;

  const hasAnswer = Boolean(cleanAnswer);
  const prompt = heard || question;
  const pct = Math.round(opacity * 100);

  const hint = thinking ? '생각하는 중…' : !question ? '“헬로 자비스”라고 부르거나 아래에 입력하세요' : '';

  return (
    <section className="jarvis-stage" data-state={status} aria-busy={thinking}>
      <div className="jarvis-stage-orb">
        <OrbBoundary>
          <GoldOrb3D status={status} />
        </OrbBoundary>
      </div>

      <div className="jarvis-stage-layer">
        <p className={`jarvis-stage-question ${heard ? 'is-live' : ''}`} aria-live="polite">
          {prompt}
        </p>

        <div className="jarvis-stage-bottom">
          {showPanel && hasAnswer ? (
            <div
              ref={panelRef}
              className={`jarvis-answer-panel ${opacity < 0.35 ? 'is-clear' : ''}`}
              style={{ '--panel-alpha': opacity } as CSSProperties}
              aria-live="polite"
              tabIndex={0}
            >
              <div className="jarvis-answer-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanAnswer}</ReactMarkdown>
              </div>
            </div>
          ) : !showPanel && current ? (
            <div className="jarvis-caption" aria-live="polite">
              {previous && <p className="jarvis-caption-prev" key={`p${index}`}>{previous}</p>}
              <p className={`jarvis-caption-now ${thinking ? 'is-writing' : ''}`} key={`c${index}`}>
                {current}
              </p>
            </div>
          ) : (
            hint && <p className="jarvis-stage-hint">{hint}</p>
          )}

          {hasAnswer && (
            <div className="jarvis-answer-controls">
              {showPanel ? (
                <>
                  <button
                    type="button"
                    className="jarvis-control-btn"
                    onClick={() => updateSettings({ answerPanel: false })}
                  >
                    <EyeOff size={16} aria-hidden="true" />
                    대화창 숨기기
                  </button>
                  <label className="jarvis-opacity">
                    <span>배경</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={pct}
                      onChange={(e) => updateSettings({ answerPanelOpacity: Number(e.target.value) / 100 })}
                      aria-label="대화창 배경 불투명도"
                      aria-valuetext={`${pct}%`}
                    />
                    <output>{pct}%</output>
                  </label>
                </>
              ) : (
                <>
                  {canStep && (
                    <button
                      type="button"
                      className="jarvis-caption-step"
                      onClick={() => store.show(index - 1, 'manual')}
                      disabled={index === 0}
                      aria-label="이전 문장"
                    >
                      <ChevronLeft size={18} />
                    </button>
                  )}
                  {total > 1 && (
                    <span className="jarvis-caption-count" aria-label={`${total}문장 중 ${index + 1}번째`}>
                      {index + 1} / {total}
                    </span>
                  )}
                  {canStep && (
                    <button
                      type="button"
                      className="jarvis-caption-step"
                      onClick={() => store.show(index + 1, 'manual')}
                      disabled={index >= total - 1}
                      aria-label="다음 문장"
                    >
                      <ChevronRight size={18} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="jarvis-control-btn"
                    onClick={() => updateSettings({ answerPanel: true })}
                  >
                    <Eye size={16} aria-hidden="true" />
                    대화창 보기
                  </button>
                </>
              )}
              <button type="button" className="jarvis-control-btn" onClick={onOpenHistory}>
                <ScrollText size={16} aria-hidden="true" />
                전체 대화
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
