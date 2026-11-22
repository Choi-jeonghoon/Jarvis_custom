
import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { AudioLines, Cpu, Network, Server, FileBarChart } from 'lucide-react';

import { MessageBubble } from './MessageBubble';
import { InputArea } from './InputArea';
import { StreamingDots } from './StreamingDots';
import { CommandCenter } from '../CommandCenter/CommandCenter';
import { useSharedCommandCenterData } from '../CommandCenter/data';

import { useAppStore } from '../../lib/store';
import {
  shouldAutoplayFinishedReply,
  useTtsStore,
} from '../../lib/tts';
import { stripThinkTags } from '../../lib/message-text';

import './JarvisHome.css';
import './JarvisHud3D.css';

type ReactorStatus = 'idle' | 'thinking' | 'speaking';

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

  const navigate = useNavigate();

  const listRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const wasStreaming = useRef(false);
  const lastScrollTop = useRef(0);
  const streamingConversationRef = useRef<string | null>(null);

  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const { apiReachable } = useSharedCommandCenterData();

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

  const conversation = hasConversation ? (
    <div className="cc-chat">
      <div className="cc-chat-head">
        <span className="cc-chat-title">
          <AudioLines size={14} />
          LIVE CONVERSATION
        </span>
        <span className={`cc-chat-indicator ${isCurrentChatStreaming ? 'is-thinking' : ''}`}>
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
        className="cc-chat-messages"
        aria-live="polite"
      >
        <div className="cc-chat-content">
          {messages.map((msg, index) => {
            const isLastAssistant =
              index === messages.length - 1 && msg.role === 'assistant';

            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                isLive={isLastAssistant && isCurrentChatStreaming}
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
    </div>
  ) : null;

  const network =
    apiReachable === null ? 'Checking' : apiReachable ? 'Excellent' : 'Offline';

  return (
    <div className="flex flex-col h-full jarvis-chat-page cc-page">
      <div className="flex-1 min-h-0 relative overflow-auto cc-scroll">
        <CommandCenter status={reactorStatus} conversation={conversation} />
      </div>

      <footer className="cc-footer">
        <div className="cc-footer-chips">
          <div className="cc-chip-card">
            <Server size={14} />
            <span><small>Engine</small><b>{serverInfo?.engine ?? '—'}</b></span>
          </div>
          <div className="cc-chip-card">
            <Cpu size={14} />
            <span><small>Model</small><b>{selectedModel || serverInfo?.model || '—'}</b></span>
          </div>
          <div className={`cc-chip-card ${apiReachable === false ? 'is-bad' : ''}`}>
            <Network size={14} />
            <span><small>Network</small><b>{network}</b></span>
          </div>
        </div>

        <div className="cc-talk">
          <span className="cc-talk-label">TALK TO JARVIS</span>
          <InputArea />
        </div>

        <button
          type="button"
          className="cc-briefing"
          onClick={() => navigate('/dashboard')}
        >
          <FileBarChart size={15} />
          Executive Briefing
        </button>
      </footer>
    </div>
  );
}
