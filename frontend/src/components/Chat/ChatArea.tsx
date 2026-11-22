
import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  ShieldCheck,
  AudioLines,
  X,
  ChevronRight,
  CheckCircle2,
  Circle,
} from 'lucide-react';

import { MessageBubble } from './MessageBubble';
import { InputArea } from './InputArea';
import { StreamingDots } from './StreamingDots';
import { JarvisReactor3D } from './JarvisReactor3D';

import { useAppStore } from '../../lib/store';
import {
  shouldAutoplayFinishedReply,
  useTtsStore,
} from '../../lib/tts';
import { stripThinkTags } from '../../lib/message-text';
import { listConnectors } from '../../lib/connectors-api';

import './JarvisHome.css';
import './JarvisHud3D.css';

type PanelType =
  | 'system'
  | 'network'
  | 'core'
  | 'privacy'
  | 'knowledge'
  | null;

type ReactorStatus = 'idle' | 'thinking' | 'speaking';

function getGreeting(): string {
  const hour = new Date().getHours();

  if (hour < 12) return 'GOOD MORNING';
  if (hour < 18) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}

export function ChatArea() {
  const activeId = useAppStore((s) => s.activeId);
  const messages = useAppStore((s) => s.messages);
  const streamState = useAppStore((s) => s.streamState);

  const voiceOutputEnabled = useAppStore(
    (s) => s.settings.voiceOutputEnabled,
  );

  const voiceAutoplay = useAppStore(
    (s) => s.settings.voiceAutoplay,
  );

  const ttsState = useTtsStore((s) => s.state);
  const ttsAvailable = useTtsStore((s) => s.available);

  const navigate = useNavigate();

  const listRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const wasStreaming = useRef(false);
  const lastScrollTop = useRef(0);
  const streamingConversationRef = useRef<string | null>(null);

  const [hasConnectedSources, setHasConnectedSources] =
    useState<boolean | null>(null);

  const [activePanel, setActivePanel] = useState<PanelType>(null);

  const isCurrentChatStreaming =
    streamState.isStreaming &&
    streamState.conversationId === activeId;

  const currentStreamContent = isCurrentChatStreaming
    ? streamState.content
    : '';

  const hasConversation =
    messages.length > 0 || isCurrentChatStreaming;

  const reactorStatus: ReactorStatus = isCurrentChatStreaming
    ? 'thinking'
    : ttsState === 'speaking'
      ? 'speaking'
      : 'idle';

  // TTS 서버 상태 확인
  useEffect(() => {
    if (!voiceOutputEnabled) return;

    void useTtsStore.getState().ensureHealth();
  }, [voiceOutputEnabled]);

  // 응답 생성 완료 후 기존 자동 음성 재생 유지
  useEffect(() => {
    const last = messages[messages.length - 1];
    const tts = useTtsStore.getState();

    const justFinished = shouldAutoplayFinishedReply(
      streamingConversationRef.current,
      activeId,
      streamState.isStreaming,
      last,
      tts.autoSpokenId,
    );

    streamingConversationRef.current =
      isCurrentChatStreaming ? activeId : null;

    if (!justFinished) return;
    if (!voiceOutputEnabled || !voiceAutoplay) return;
    if (!last || last.role !== 'assistant' || activeId === null) return;

    const completedConversationId = activeId;
    const completedMessageId = last.id;

    void tts.ensureHealth().then(() => {
      const app = useAppStore.getState();
      const currentTts = useTtsStore.getState();
      const currentLast = app.messages[app.messages.length - 1];

      if (app.activeId !== completedConversationId) return;
      if (app.streamState.isStreaming) return;

      if (
        !app.settings.voiceOutputEnabled ||
        !app.settings.voiceAutoplay
      ) return;

      if (currentLast?.id !== completedMessageId) return;
      if (currentTts.available !== true) return;
      if (currentTts.autoSpokenId === completedMessageId) return;

      const text = stripThinkTags(currentLast.content);

      if (!text) return;

      currentTts.markAutoSpoken(completedMessageId);
      void currentTts.speak(completedMessageId, text);
    });
  }, [
    activeId,
    messages,
    streamState.isStreaming,
    isCurrentChatStreaming,
    voiceOutputEnabled,
    voiceAutoplay,
  ]);

  // 데이터 소스 상태 확인
  useEffect(() => {
    let mounted = true;

    listConnectors()
      .then((list) => {
        if (mounted) {
          setHasConnectedSources(list.some((c) => c.connected));
        }
      })
      .catch(() => {
        if (mounted) setHasConnectedSources(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // 대화 자동 스크롤
  useEffect(() => {
    if (isCurrentChatStreaming && !wasStreaming.current) {
      shouldAutoScroll.current = true;
    }

    wasStreaming.current = isCurrentChatStreaming;

    if (shouldAutoScroll.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, currentStreamContent, isCurrentChatStreaming]);

  // 모달이 열렸을 때 ESC로 닫기
  useEffect(() => {
    if (!activePanel) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActivePanel(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePanel]);

  const handleScroll = () => {
    if (!listRef.current) return;

    const {
      scrollTop,
      scrollHeight,
      clientHeight,
    } = listRef.current;

    const distance = scrollHeight - scrollTop - clientHeight;
    const scrolledUp = scrollTop < lastScrollTop.current;

    lastScrollTop.current = scrollTop;

    if (scrolledUp && distance >= 1) {
      shouldAutoScroll.current = false;
    } else if (!scrolledUp) {
      shouldAutoScroll.current = distance < 2;
    }
  };

  const panelInfo = {
    system: {
      title: 'SYSTEM STATUS',
      subtitle: 'JARVIS CORE MONITOR',
      description: '현재 애플리케이션의 시스템 상태입니다.',
    },
    network: {
      title: 'DATA NETWORK',
      subtitle: 'CONNECTED DATA SOURCES',
      description: '연결된 데이터 소스 상태를 확인합니다.',
    },
    core: {
      title: 'LOCAL CORE',
      subtitle: 'AI ENGINE',
      description: '현재 AI 처리 환경에 대한 정보입니다.',
    },
    privacy: {
      title: 'PRIVACY',
      subtitle: 'LOCAL PROCESSING',
      description: '로컬 처리 및 음성 설정 상태입니다.',
    },
    knowledge: {
      title: 'KNOWLEDGE',
      subtitle: 'MEMORY & DATA',
      description: '연결된 지식 데이터 소스 상태입니다.',
    },
  };

  const openPanel = (panel: Exclude<PanelType, null>) => {
    setActivePanel(panel);
  };

  const closePanel = () => setActivePanel(null);

  const renderPanelContent = () => {
    if (!activePanel) return null;

    const StatusRow = ({
      label,
      value,
      active,
    }: {
      label: string;
      value: string;
      active: boolean | null;
    }) => (
      <div className="jarvis-modal-status-row">
        <span className="jarvis-modal-status-label">{label}</span>
        <span className="jarvis-modal-status-value">
          {active === null ? (
            <Circle size={9} />
          ) : active ? (
            <CheckCircle2 size={14} />
          ) : (
            <Circle size={9} />
          )}
          {value}
        </span>
      </div>
    );

    switch (activePanel) {
      case 'system':
        return (
          <>
            <StatusRow
              label="APPLICATION"
              value="RUNNING"
              active={true}
            />
            <StatusRow
              label="CHAT SESSION"
              value={activeId ? 'ACTIVE' : 'STANDBY'}
              active={Boolean(activeId)}
            />
            <StatusRow
              label="AI RESPONSE"
              value={isCurrentChatStreaming ? 'PROCESSING' : 'READY'}
              active={!isCurrentChatStreaming}
            />
            <StatusRow
              label="VOICE OUTPUT"
              value={voiceOutputEnabled ? 'ENABLED' : 'DISABLED'}
              active={voiceOutputEnabled}
            />
          </>
        );

      case 'network':
      case 'knowledge':
        return (
          <>
            <StatusRow
              label="DATA SOURCES"
              value={
                hasConnectedSources === null
                  ? 'UNKNOWN'
                  : hasConnectedSources
                    ? 'CONNECTED'
                    : 'NOT CONNECTED'
              }
              active={hasConnectedSources}
            />
            <p className="jarvis-modal-note">
              실제 연결된 커넥터의 상태만 표시합니다.
            </p>
            <button
              type="button"
              className="jarvis-modal-action"
              onClick={() => {
                closePanel();
                navigate('/data-sources');
              }}
            >
              데이터 소스 관리 열기
              <ChevronRight size={15} />
            </button>
          </>
        );

      case 'core':
        return (
          <>
            <StatusRow
              label="AI APPLICATION"
              value="RUNNING"
              active={true}
            />
            <StatusRow
              label="CURRENT RESPONSE"
              value={isCurrentChatStreaming ? 'GENERATING' : 'IDLE'}
              active={!isCurrentChatStreaming}
            />
            <StatusRow
              label="LOCAL AI"
              value="CONFIGURED"
              active={true}
            />
            <p className="jarvis-modal-note">
              모델 및 서버의 실제 CPU·GPU 사용률은 별도의 모니터링 API를 연결해야 표시할 수 있습니다.
            </p>
            <button
              type="button"
              className="jarvis-modal-action"
              onClick={() => {
                closePanel();
                navigate('/dashboard');
              }}
            >
              대시보드 열기
              <ChevronRight size={15} />
            </button>
          </>
        );

      case 'privacy':
        return (
          <>
            <StatusRow
              label="VOICE OUTPUT"
              value={voiceOutputEnabled ? 'ENABLED' : 'DISABLED'}
              active={voiceOutputEnabled}
            />
            <StatusRow
              label="VOICE AUTOPLAY"
              value={voiceAutoplay ? 'ENABLED' : 'DISABLED'}
              active={voiceAutoplay}
            />
            <StatusRow
              label="TTS SERVER"
              value={
                ttsAvailable === null
                  ? 'CHECKING'
                  : ttsAvailable
                    ? 'AVAILABLE'
                    : 'UNAVAILABLE'
              }
              active={ttsAvailable}
            />
            <p className="jarvis-modal-note">
              음성 출력 설정은 현재 애플리케이션 설정을 기준으로 표시합니다.
            </p>
            <button
              type="button"
              className="jarvis-modal-action"
              onClick={() => {
                closePanel();
                navigate('/settings');
              }}
            >
              설정 열기
              <ChevronRight size={15} />
            </button>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full jarvis-chat-page">
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div className="jarvis-hud-home jarvis-hud-3d">

          <div className="jarvis-hud-grid" aria-hidden="true" />

          {/* 상단 상태 */}
          <div className="jarvis-hud-topline">
            <span>J.A.R.V.I.S</span>
            <span className="jarvis-hud-topline-center">
              ARTIFICIAL INTELLIGENCE SYSTEM
            </span>
            <span className="jarvis-hud-online">
              <i />
              SYSTEM ONLINE
            </span>
          </div>

          {/* 시스템 상태 카드 */}
          <button
            type="button"
            className="jarvis-side-stack jarvis-side-left"
            onClick={() => openPanel('system')}
          >
            <span className="jarvis-side-heading">
              <Activity size={13} />
              SYSTEM STATUS
            </span>
            <span className="jarvis-side-row">
              <i /> CORE ONLINE
            </span>
            <span className="jarvis-side-row">
              <i /> VOICE LINK READY
            </span>
            <span className="jarvis-side-row">
              <i /> LOCAL MEMORY ACTIVE
            </span>
            <span className="jarvis-side-code">SYS · 01 / 03</span>
          </button>

          {/* 데이터 네트워크 카드 */}
          <button
            type="button"
            className="jarvis-side-stack jarvis-side-right"
            onClick={() => openPanel('network')}
          >
            <span className="jarvis-side-heading">
              <Database size={13} />
              DATA NETWORK
            </span>
            <span className="jarvis-side-row">
              <i />
              SOURCES {hasConnectedSources ? 'LINKED' : 'STANDBY'}
            </span>
            <span className="jarvis-side-row">
              <i /> MEMORY INDEX
            </span>
            <span className="jarvis-side-row">
              <i /> SECURE CHANNEL
            </span>
            <span className="jarvis-side-code">NET · 02 / 03</span>
          </button>

          {/* 중앙 3D 인터페이스 */}
          <div
            className="jarvis-center-interface jarvis-center-3d"
            data-state={reactorStatus}
          >
            <JarvisReactor3D status={reactorStatus} />

            <div className="jarvis-home-greeting">
              <h1>J.A.R.V.I.S</h1>
              <p>{getGreeting()}</p>
            </div>

            <div className="jarvis-home-status">
              <span className="jarvis-status-indicator" />
              {isCurrentChatStreaming
                ? 'ANALYZING · 응답 생성 중'
                : ttsState === 'speaking'
                  ? 'VOICE RESPONSE · 음성 안내 중'
                  : 'SYSTEM STANDBY · 대기 중'}
            </div>
          </div>

          {/* 하단 카드 */}
          <button
            type="button"
            className="jarvis-micro-card jarvis-card-left"
            onClick={() => openPanel('core')}
          >
            <Cpu size={14} />
            <span>
              <b>LOCAL CORE</b>
              <small>INTELLIGENCE ONLINE</small>
            </span>
          </button>

          <button
            type="button"
            className="jarvis-micro-card jarvis-card-right"
            onClick={() => openPanel('privacy')}
          >
            <ShieldCheck size={14} />
            <span>
              <b>PRIVACY</b>
              <small>LOCAL PROCESSING</small>
            </span>
          </button>

          <button
            type="button"
            className="jarvis-micro-card jarvis-card-bottom"
            onClick={() => openPanel('knowledge')}
          >
            <HardDrive size={14} />
            <span>
              <b>KNOWLEDGE</b>
              <small>
                {hasConnectedSources
                  ? 'DATA SOURCES CONNECTED'
                  : 'NO SOURCES CONNECTED'}
              </small>
            </span>
          </button>

          {/* 중앙 투명 대화 영역 */}
          {hasConversation && (
            <section
              className="jarvis-conversation-overlay jarvis-conversation-3d"
              aria-label="JARVIS conversation"
            >
              <div className="jarvis-conversation-header">
                <span className="jarvis-conversation-title">
                  <AudioLines size={14} />
                  LIVE CONVERSATION
                </span>

                <span
                  className={`jarvis-conversation-indicator ${
                    isCurrentChatStreaming ? 'is-thinking' : ''
                  }`}
                >
                  <i />
                  {isCurrentChatStreaming
                    ? 'PROCESSING'
                    : ttsState === 'speaking'
                      ? 'VOICE RESPONSE'
                      : 'CONNECTED'}
                </span>
              </div>

              <div
                ref={listRef}
                onScroll={handleScroll}
                className="jarvis-conversation-messages"
                aria-live="polite"
              >
                <div className="jarvis-conversation-content">
                  {messages.map((msg, index) => {
                    const isLastAssistant =
                      index === messages.length - 1 &&
                      msg.role === 'assistant';

                    return (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        isLive={
                          isLastAssistant &&
                          isCurrentChatStreaming
                        }
                      />
                    );
                  })}

                  {isCurrentChatStreaming &&
                    streamState.content === '' &&
                    !(
                      messages[messages.length - 1]?.role === 'assistant' &&
                      messages[messages.length - 1]?.isResearch
                    ) && (
                      <div className="flex justify-start mb-4">
                        <StreamingDots phase={streamState.phase} />
                      </div>
                    )}
                </div>
              </div>
            </section>
          )}

          {/* 상세 정보 모달 */}
          {activePanel && (
            <div
              className="jarvis-modal-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closePanel();
                }
              }}
            >
           <section
                className="jarvis-detail-modal jarvis-hologram-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="jarvis-modal-title"
              >
                <div className="jarvis-detail-modal-header">
                  <div>
                    <span className="jarvis-modal-eyebrow">
                      J.A.R.V.I.S SYSTEM INTERFACE
                    </span>
                    <h2 id="jarvis-modal-title">
                      {panelInfo[activePanel].title}
                    </h2>
                    <p>{panelInfo[activePanel].subtitle}</p>
                  </div>

                  <button
                    type="button"
                    className="jarvis-modal-close"
                    onClick={closePanel}
                    aria-label="창 닫기"
                  >
                    <X size={19} />
                  </button>
                </div>

                <div className="jarvis-detail-modal-body">
                  <p className="jarvis-modal-description">
                    {panelInfo[activePanel].description}
                  </p>

                  {renderPanelContent()}
                </div>

                <div className="jarvis-detail-modal-footer">
                  <span>SECURE LOCAL INTERFACE</span>
                  <button type="button" onClick={closePanel}>
                    CLOSE
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      <InputArea />
    </div>
  );
}
