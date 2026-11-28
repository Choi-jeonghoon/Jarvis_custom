import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  LayoutDashboard,
  BrainCircuit,
  Bot,
  Database,
  ScrollText,
  Settings,
  Rocket,
  MessagesSquare,
  Plus,
  Search,
  Cpu,
  Loader2,
  Mic,
  PanelLeftClose,
  Gauge,
} from 'lucide-react';
import { ConversationList } from './ConversationList';
import { useAppStore } from '../../lib/store';
import { requestVoiceAssistant, useSharedCommandCenterData } from '../CommandCenter/data';
import { useVoiceStore, type VoicePhase } from '../../lib/voice';
import { useModalStore } from '../../lib/ui-modals';

const PHASE_TEXT: Record<VoicePhase, string> = {
  off: '음성 꺼짐 · 눌러서 켜기',
  starting: '마이크 확인 중',
  wake: '“헬로 자비스” 대기 중',
  greeting: '인사하는 중',
  listening: '듣고 있어요',
  thinking: '생각하는 중',
  speaking: '답변하는 중',
  unavailable: '마이크 없음',
};
const LIVE_PHASES = new Set<VoicePhase>(['greeting', 'listening', 'thinking', 'speaking']);

/** Below this width the sidebar is an overlay drawer (iPad and phones). */
export const SIDEBAR_DRAWER_MAX = 1279;
const isDrawer = () => typeof window !== 'undefined' && window.innerWidth <= SIDEBAR_DRAWER_MAX;

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const createConversation = useAppStore((s) => s.createConversation);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const modelLoading = useAppStore((s) => s.modelLoading);
  const deepResearch = useAppStore((s) => s.deepResearch);
  const conversations = useAppStore((s) => s.conversations);
  const messages = useAppStore((s) => s.messages);
  const speechEnabled = useAppStore((s) => s.settings.speechEnabled);
  const isStreaming = useAppStore((s) => s.streamState.isStreaming);
  const voicePhase = useVoiceStore((s) => s.phase);

  const { agents, connectors } = useSharedCommandCenterData();
  const runningAgents = agents?.filter((a) => a.status === 'running').length ?? 0;
  const connectedSources = connectors?.filter((c) => c.connected).length ?? 0;

  const handleNewChat = () => {
    // Don't create a new chat if the current one is empty
    if (messages.length > 0) createConversation(selectedModel);
    navigate('/');
  };

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: '홈' },
    { path: '/dashboard', icon: BrainCircuit, label: 'AI 코어' },
    { path: '/agents', icon: Bot, label: '에이전트', badge: runningAgents || agents?.length || 0 },
    { path: '/data-sources', icon: Database, label: '지식 베이스', badge: connectedSources },
    { path: '/logs', icon: ScrollText, label: '로그' },
    { path: '/settings', icon: Settings, label: '설정' },
    { path: '/get-started', icon: Rocket, label: '시작하기' },
  ];

  // In drawer mode, get out of the way once the user has picked something.
  const closeIfDrawer = () => {
    if (isDrawer()) useAppStore.getState().setSidebarOpen(false);
  };
  const go = (path: string) => {
    navigate(path);
    closeIfDrawer();
  };

  const startVoice = () => {
    closeIfDrawer();
    if (location.pathname !== '/') navigate('/');
    // InputArea lives on the chat route; give it a tick to mount.
    setTimeout(requestVoiceAssistant, 60);
  };

  return (
    <aside className={`cc-sidebar ${sidebarOpen ? '' : 'is-closed'}`}>
      <div className="cc-sidebar-inner">
        {/* Brand */}
        <div className="cc-brand">
          <span className="cc-brand-mark" aria-hidden="true"><i /></span>
          <span className="cc-brand-text">
            <b>JARVIS</b>
          </span>
          <button type="button" className="cc-icon-btn ghost" onClick={toggleSidebar} aria-label="메뉴 닫기">
            <PanelLeftClose size={15} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="cc-nav">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => go(item.path)}
                className={isActive ? 'is-active' : ''}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
                {!!item.badge && <em>{item.badge}</em>}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              closeIfDrawer();
              useModalStore.getState().setDashboardOpen(true);
            }}
            aria-haspopup="dialog"
          >
            <Gauge size={18} aria-hidden="true" />
            <span>시스템 현황</span>
          </button>
        </nav>

        {/* Conversations */}
        <div className="cc-convos">
          <div className="cc-section-head">
            <MessagesSquare size={14} aria-hidden="true" />
            <span>대화</span>
            <em>{conversations.length}</em>
            <button type="button" className="cc-icon-btn ghost sm" onClick={handleNewChat} aria-label="새 대화">
              <Plus size={14} />
            </button>
          </div>

          <button type="button" className="cc-model-btn" onClick={() => setCommandPaletteOpen(true)}>
            {modelLoading ? <Loader2 size={13} className="animate-spin" /> : <Cpu size={13} />}
            <span className={deepResearch ? 'is-accent' : ''}>
              {modelLoading
                ? '모델 불러오는 중…'
                : deepResearch
                  ? '심층 조사'
                  : selectedModel || serverInfo?.model || '모델 선택'}
            </span>
            <kbd>⌘K</kbd>
          </button>

          <label className="cc-side-search">
            <Search size={13} />
            <input
              type="text"
              placeholder="대화 검색"
              aria-label="대화 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>

          <div className="cc-convo-list">
            <ConversationList searchQuery={searchQuery} />
          </div>
        </div>

        {/* Voice: one row — current state, tap to talk */}
        <button
          type="button"
          className={`cc-voice-row ${LIVE_PHASES.has(voicePhase) || isStreaming ? 'is-live' : ''}`}
          onClick={startVoice}
        >
          <span className="cc-voice-row-icon" aria-hidden="true"><Mic size={18} /></span>
          <span className="cc-voice-row-text">
            <b>말로 물어보기</b>
            <small>{speechEnabled ? PHASE_TEXT[voicePhase] : PHASE_TEXT.off}</small>
          </span>
        </button>
      </div>
    </aside>
  );
}
