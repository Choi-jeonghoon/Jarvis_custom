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
  Zap,
  ChevronRight,
  PanelLeftClose,
} from 'lucide-react';
import { ConversationList } from './ConversationList';
import { useAppStore } from '../../lib/store';
import { requestVoiceAssistant, useSharedCommandCenterData } from '../CommandCenter/data';

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

  const { agents, connectors } = useSharedCommandCenterData();
  const runningAgents = agents?.filter((a) => a.status === 'running').length ?? 0;
  const connectedSources = connectors?.filter((c) => c.connected).length ?? 0;

  const handleNewChat = () => {
    // Don't create a new chat if the current one is empty
    if (messages.length > 0) createConversation(selectedModel);
    navigate('/');
  };

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Command Center' },
    { path: '/dashboard', icon: BrainCircuit, label: 'AI Core' },
    { path: '/agents', icon: Bot, label: 'Agents', badge: runningAgents || agents?.length || 0 },
    { path: '/data-sources', icon: Database, label: 'Knowledge Base', badge: connectedSources },
    { path: '/logs', icon: ScrollText, label: 'Logs' },
    { path: '/settings', icon: Settings, label: 'Settings' },
    { path: '/get-started', icon: Rocket, label: 'Get Started' },
  ];

  const startVoice = () => {
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
            <small>COMMAND CENTER</small>
          </span>
          <button type="button" className="cc-icon-btn ghost" onClick={toggleSidebar} title="Collapse sidebar">
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
                onClick={() => navigate(item.path)}
                className={isActive ? 'is-active' : ''}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
                {!!item.badge && <em>{item.badge}</em>}
              </button>
            );
          })}
        </nav>

        {/* Conversations */}
        <div className="cc-convos">
          <div className="cc-section-head">
            <MessagesSquare size={13} />
            <span>CONVERSATIONS</span>
            <em>{conversations.length}</em>
            <button type="button" className="cc-icon-btn ghost sm" onClick={handleNewChat} title="New chat">
              <Plus size={14} />
            </button>
          </div>

          <button type="button" className="cc-model-btn" onClick={() => setCommandPaletteOpen(true)}>
            {modelLoading ? <Loader2 size={13} className="animate-spin" /> : <Cpu size={13} />}
            <span className={deepResearch ? 'is-accent' : ''}>
              {modelLoading
                ? 'Loading model…'
                : deepResearch
                  ? 'Deep Research'
                  : selectedModel || serverInfo?.model || 'Select model'}
            </span>
            <kbd>⌘K</kbd>
          </button>

          <label className="cc-side-search">
            <Search size={13} />
            <input
              type="text"
              placeholder="Search chats…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>

          <div className="cc-convo-list">
            <ConversationList searchQuery={searchQuery} />
          </div>
        </div>

        {/* Voice status */}
        <div className="cc-voice-card">
          <div className="cc-section-head">
            <span>VOICE STATUS</span>
            <ChevronRight size={13} />
          </div>
          <div className={`cc-voice-wave ${speechEnabled || isStreaming ? 'is-live' : ''}`} aria-hidden="true">
            {Array.from({ length: 26 }, (_, i) => (
              <i key={i} style={{ ['--h' as string]: `${20 + ((i * 41) % 75)}%`, animationDelay: `${(i % 9) * 0.08}s` }} />
            ))}
          </div>
          <p>{isStreaming ? 'Processing…' : speechEnabled ? 'Listening…' : 'Voice standby'}</p>
          <button type="button" className="cc-mic" onClick={startVoice} title="Tap to speak">
            <Mic size={22} />
          </button>
          <small>Tap to Speak</small>
        </div>

        <button type="button" className="cc-focus-btn" onClick={toggleSidebar}>
          <Zap size={13} /> Focus Mode
        </button>
      </div>
    </aside>
  );
}
