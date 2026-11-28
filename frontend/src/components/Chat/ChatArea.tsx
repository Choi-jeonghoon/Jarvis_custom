
import { useRef, useEffect } from 'react';
import { AudioLines } from 'lucide-react';

import { MessageBubble } from './MessageBubble';
import { InputArea } from './InputArea';
import { StreamingDots } from './StreamingDots';
import { JarvisStage } from './JarvisStage';
import type { OrbStatus } from './GoldOrb3D';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { useModalStore } from '../../lib/ui-modals';
import { useVoiceStore } from '../../lib/voice';

import { useAppStore } from '../../lib/store';
import {
  shouldAutoplayFinishedReply,
  useTtsStore,
} from '../../lib/tts';
import { stripThinkTags } from '../../lib/message-text';

import './JarvisHome.css';
import './JarvisHud3D.css';

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

  const voicePhase = useVoiceStore((s) => s.phase);
  const voiceHeard = useVoiceStore((s) => s.heard);
  const voiceTalking = useVoiceStore((s) => s.talking);
  const historyOpen = useModalStore((s) => s.historyOpen);
  const setHistoryOpen = useModalStore((s) => s.setHistoryOpen);

  const listRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const wasStreaming = useRef(false);
  const lastScrollTop = useRef(0);
  const streamingConversationRef = useRef<string | null>(null);

  const isCurrentChatStreaming =
    streamState.isStreaming &&
    streamState.conversationId === activeId;

  const currentStreamContent = isCurrentChatStreaming
    ? streamState.content
    : '';

  const hasConversation =
    messages.length > 0 || isCurrentChatStreaming;

  const orbStatus: OrbStatus =
    isCurrentChatStreaming || voicePhase === 'thinking'
      ? 'thinking'
      : ttsState === 'speaking' || voiceTalking || voicePhase === 'speaking' || voicePhase === 'greeting'
        ? 'speaking'
        : voicePhase === 'listening'
          ? 'listening'
          : 'idle';

  // The stage shows only the latest exchange; the rest is in "전체 대화".
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
  const latestQuestion = lastUserIndex >= 0 ? messages[lastUserIndex].content : '';
  const latestAnswerMsg = messages
    .slice(lastUserIndex + 1)
    .reverse()
    .find((m) => m.role === 'assistant');
  const latestAnswer =
    (isCurrentChatStreaming && streamState.content.length > (latestAnswerMsg?.content.length ?? 0)
      ? streamState.content
      : latestAnswerMsg?.content) ?? '';

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

  // Open the full conversation at the latest answer, not the oldest message.
  useEffect(() => {
    if (!historyOpen) return;
    // The dialog mounts in a portal; wait a beat, then scroll whichever
    // element actually scrolls (the modal body).
    const id = window.setTimeout(() => {
      const list = listRef.current;
      const scroller = list?.closest<HTMLElement>('.cc-modal-body') ?? list;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }, 60);
    return () => window.clearTimeout(id);
  }, [historyOpen]);

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

  return (
    <div className="flex flex-col h-full jarvis-chat-page cc-page">
      <div className="flex-1 min-h-0 relative">
        <JarvisStage
          status={orbStatus}
          question={latestQuestion}
          answer={latestAnswer}
          thinking={isCurrentChatStreaming}
          heard={voicePhase === 'listening' ? voiceHeard : ''}
          onOpenHistory={() => setHistoryOpen(true)}
        />
      </div>

      <footer className="cc-footer is-stage">
        <div className="cc-talk">
          <InputArea />
        </div>
      </footer>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="cc-modal is-narrow cc-shell">
          <header className="cc-modal-head">
            <DialogTitle render={<h2 />}>전체 대화</DialogTitle>
          </header>
          <div className="cc-modal-body">{conversation}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
