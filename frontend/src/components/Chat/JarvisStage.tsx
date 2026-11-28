import { Component, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Eye, EyeOff, ScrollText } from 'lucide-react';
import { GoldOrb3D, type OrbStatus } from './GoldOrb3D';
import { useAppStore } from '../../lib/store';
import { stripThinkTags } from '../../lib/message-text';
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
 * The orb plus the latest exchange. The answer panel is either shown (full
 * formatted answer, adjustable background opacity) or hidden — hidden means
 * no conversation text at all, only the orb and a "대화창 보기" button.
 */
export function JarvisStage({ status, question, answer, thinking, heard, onOpenHistory }: Props) {
  const showPanel = useAppStore((s) => s.settings.answerPanel);
  const opacity = useAppStore((s) => s.settings.answerPanelOpacity);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const cleanAnswer = useMemo(() => stripThinkTags(answer), [answer]);

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

  const hasAnswer = Boolean(cleanAnswer);
  const pct = Math.round(opacity * 100);

  // With the panel hidden the question is hidden too; what the mic hears
  // right now stays visible so a voice question can still be checked.
  const prompt = heard || (showPanel ? question : '');
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
                  <button type="button" className="jarvis-control-btn" onClick={onOpenHistory}>
                    <ScrollText size={16} aria-hidden="true" />
                    전체 대화
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="jarvis-control-btn"
                  onClick={() => updateSettings({ answerPanel: true })}
                >
                  <Eye size={16} aria-hidden="true" />
                  대화창 보기
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
