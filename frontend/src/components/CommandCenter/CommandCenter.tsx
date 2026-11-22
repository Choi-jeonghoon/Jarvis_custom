import { Component, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  ChevronRight,
  Cpu,
  Database,
  FileSearch,
  Globe,
  Info,
  Layers,
  Lightbulb,
  Mic,
  MessageSquarePlus,
  Plug,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
  Activity,
  CheckCircle2,
  Code2,
  ListChecks,
  Command,
} from 'lucide-react';

import { JarvisReactor3D } from '../Chat/JarvisReactor3D';
import { useAppStore } from '../../lib/store';
import type { ManagedAgent } from '../../lib/api';
import {
  requestVoiceAssistant,
  timeAgo,
  useSharedCommandCenterData,
} from './data';
import './CommandCenter.css';

type ReactorStatus = 'idle' | 'thinking' | 'speaking';
type Tone = 'cyan' | 'blue' | 'teal' | 'purple' | 'amber' | 'green' | 'red';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Panel({
  title,
  className = '',
  action,
  children,
}: {
  title: string;
  className?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`cc-panel ${className}`}>
      <header className="cc-panel-head">
        <h3>{title}</h3>
        {action}
      </header>
      <div className="cc-panel-body">{children}</div>
    </section>
  );
}

function LinkAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="cc-link" onClick={onClick}>
      {label} <ChevronRight size={12} />
    </button>
  );
}

function Wave({ bars = 18, tone = 'cyan', live = false }: { bars?: number; tone?: Tone; live?: boolean }) {
  return (
    <span className={`cc-wave tone-${tone} ${live ? 'is-live' : ''}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} style={{ ['--h' as string]: `${25 + ((i * 37) % 70)}%`, animationDelay: `${(i % 7) * 0.09}s` }} />
      ))}
    </span>
  );
}

/** Keeps a missing WebGL context from taking down the whole app. */
class ReactorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="cc-globe-fallback" aria-hidden="true">
          <span /><span /><span />
        </div>
      );
    }
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

function CoreOverview() {
  const d = useSharedCommandCenterData();
  const models = useAppStore((s) => s.models);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const speechEnabled = useAppStore((s) => s.settings.speechEnabled);
  const navigate = useNavigate();

  const running = d.agents?.filter((a) => a.status === 'running').length ?? 0;

  const rows: { icon: typeof Cpu; label: string; value: string; tone: Tone; to: string }[] = [
    {
      icon: BrainCircuit,
      label: 'AI Core',
      value: d.apiReachable === null ? 'Checking…' : d.apiReachable ? 'Active' : 'Offline',
      tone: d.apiReachable === false ? 'red' : 'cyan',
      to: '/dashboard',
    },
    {
      icon: Database,
      label: 'Memory',
      value: d.memoryEntries !== null ? `${d.memoryEntries.toLocaleString()} Stored` : 'Unavailable',
      tone: d.memoryEntries !== null ? 'blue' : 'red',
      to: '/settings',
    },
    {
      icon: Mic,
      label: 'Voice',
      value: speechEnabled ? 'Online' : 'Disabled',
      tone: 'teal',
      to: '/settings',
    },
    {
      icon: Bot,
      label: 'Agents',
      value: d.agents ? (running ? `${running} Running` : `${d.agents.length} Standby`) : '—',
      tone: 'purple',
      to: '/agents',
    },
    {
      icon: Layers,
      label: 'LLMs',
      value: `${models.length} Available`,
      tone: 'amber',
      to: '/settings',
    },
    {
      icon: ShieldCheck,
      label: 'System',
      value: serverInfo ? `${serverInfo.engine} engine` : '—',
      tone: 'green',
      to: '/logs',
    },
  ];

  return (
    <Panel title="AI Core Overview" className="cc-core">
      <ul className="cc-core-list">
        {rows.map((r) => (
          <li key={r.label}>
            <button type="button" onClick={() => navigate(r.to)} className={`tone-${r.tone}`}>
              <span className="cc-icon-box"><r.icon size={15} /></span>
              <span className="cc-core-text">
                <b>{r.label}</b>
                <small>{r.value}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Hero({
  status,
  conversation,
}: {
  status: ReactorStatus;
  conversation: ReactNode | null;
}) {
  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const model = selectedModel || serverInfo?.model || 'no model';

  if (conversation) {
    return <section className="cc-panel cc-hero is-chat">{conversation}</section>;
  }

  return (
    <section className="cc-panel cc-hero" data-state={status}>
      <div className="cc-hero-orbit" aria-hidden="true" />
      <div className="cc-hero-reactor">
        <ReactorBoundary>
          <JarvisReactor3D status={status} />
        </ReactorBoundary>
      </div>
      <div className="cc-hero-title">
        <h1>JARVIS</h1>
        <p>AI CORE</p>
        <small>{model}</small>
      </div>
      <div className="cc-hero-state">
        <i />
        {status === 'thinking' ? 'ANALYZING' : status === 'speaking' ? 'SPEAKING' : 'STANDBY'}
      </div>
    </section>
  );
}

interface FeedItem {
  key: string;
  icon: typeof Info;
  title: string;
  sub: string;
  tag: 'INFO' | 'WARN' | 'TIP' | 'LIVE';
  to?: string;
}

function LiveFeed() {
  const d = useSharedCommandCenterData();
  const conversations = useAppStore((s) => s.conversations);
  const navigate = useNavigate();

  const items = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    if (d.apiReachable === false) {
      out.push({ key: 'api', icon: AlertTriangle, title: 'Backend unreachable', sub: 'Check server status', tag: 'WARN', to: '/settings' });
    }
    for (const a of d.approvals.slice(0, 2)) {
      out.push({ key: `ap-${a.id}`, icon: AlertTriangle, title: a.description || a.action_type, sub: `Approval needed · ${a.tier}`, tag: 'WARN' });
    }
    for (const a of d.agents ?? []) {
      if (['error', 'needs_attention', 'stalled', 'budget_exceeded'].includes(a.status)) {
        out.push({ key: `ag-${a.id}`, icon: AlertTriangle, title: `${a.name} needs attention`, sub: a.status.replace('_', ' '), tag: 'WARN', to: '/agents' });
      } else if (a.status === 'running') {
        out.push({ key: `ag-${a.id}`, icon: Bot, title: `${a.name} is running`, sub: a.current_activity || 'Working…', tag: 'LIVE', to: '/agents' });
      }
    }
    if (d.memoryError) {
      out.push({ key: 'mem', icon: Database, title: 'Memory backend unavailable', sub: 'Native extension not installed', tag: 'WARN', to: '/settings' });
    }
    if (d.telemetry?.avg_throughput_tok_per_sec) {
      out.push({
        key: 'tps',
        icon: Activity,
        title: `Throughput ${d.telemetry.avg_throughput_tok_per_sec.toFixed(1)} tok/s`,
        sub: `${(d.telemetry.total_requests ?? 0).toLocaleString()} requests served`,
        tag: 'LIVE',
        to: '/dashboard',
      });
    }
    const connected = d.connectors?.filter((c) => c.connected) ?? [];
    for (const c of connected.slice(0, 2)) {
      out.push({ key: `c-${c.connector_id}`, icon: Plug, title: `${c.display_name} connected`, sub: `${(c.chunks ?? 0).toLocaleString()} chunks indexed`, tag: 'INFO', to: '/data-sources' });
    }
    if (d.connectors && connected.length === 0) {
      out.push({ key: 'tip-src', icon: Lightbulb, title: 'Connect a data source', sub: 'Give JARVIS your knowledge', tag: 'TIP', to: '/data-sources' });
    }
    for (const c of conversations.slice(0, 2)) {
      out.push({ key: `cv-${c.id}`, icon: Info, title: c.title || 'Untitled conversation', sub: timeAgo(c.updatedAt), tag: 'INFO' });
    }
    return out.slice(0, 6);
  }, [d, conversations]);

  return (
    <Panel
      title="Live Intelligence Feed"
      className="cc-feed"
      action={<span className="cc-live-pill"><i />LIVE</span>}
    >
      <ul className="cc-feed-list">
        {items.length === 0 && <li className="cc-empty">No activity yet</li>}
        {items.map((it) => (
          <li key={it.key}>
            <button type="button" className={`tag-${it.tag}`} onClick={() => it.to && navigate(it.to)}>
              <span className="cc-icon-box"><it.icon size={13} /></span>
              <span className="cc-feed-text">
                <b>{it.title}</b>
                <small>{it.sub}</small>
              </span>
              <em>{it.tag}</em>
            </button>
          </li>
        ))}
      </ul>
      <div className="cc-panel-foot">
        <LinkAction label="View All Intelligence" onClick={() => navigate('/logs')} />
      </div>
    </Panel>
  );
}

const AGENT_ICON: Record<string, { icon: typeof Bot; tone: Tone }> = {
  deep_research: { icon: FileSearch, tone: 'cyan' },
  research: { icon: Search, tone: 'cyan' },
  coding: { icon: Code2, tone: 'green' },
  code: { icon: Code2, tone: 'green' },
  memory: { icon: Database, tone: 'purple' },
  browser: { icon: Globe, tone: 'amber' },
  task: { icon: ListChecks, tone: 'blue' },
  orchestrator: { icon: Workflow, tone: 'teal' },
};

function agentVisual(a: ManagedAgent) {
  const t = a.agent_type.toLowerCase();
  const key = Object.keys(AGENT_ICON).find((k) => t.includes(k));
  return key ? AGENT_ICON[key] : { icon: Bot, tone: 'purple' as Tone };
}

function ActiveAgents() {
  const d = useSharedCommandCenterData();
  const navigate = useNavigate();
  const agents = d.agents ?? [];

  return (
    <Panel
      title="Active Agents"
      className="cc-agents"
      action={<LinkAction label="View All" onClick={() => navigate('/agents')} />}
    >
      <div className="cc-agent-grid">
        {agents.slice(0, 6).map((a) => {
          const v = agentVisual(a);
          const live = a.status === 'running';
          const bad = ['error', 'needs_attention', 'stalled', 'budget_exceeded'].includes(a.status);
          return (
            <button key={a.id} type="button" className={`cc-agent tone-${v.tone}`} onClick={() => navigate('/agents')}>
              <span className="cc-icon-box lg"><v.icon size={17} /></span>
              <span className="cc-agent-text">
                <b>{a.name}</b>
                <small className={live ? 'is-live' : bad ? 'is-bad' : ''}>
                  <i />{live ? 'Active' : bad ? 'Attention' : a.status === 'paused' ? 'Paused' : 'Standby'}
                </small>
              </span>
              {live ? <Wave bars={14} tone={v.tone} live /> : bad ? <AlertTriangle size={16} className="cc-agent-flag bad" /> : <CheckCircle2 size={16} className="cc-agent-flag" />}
            </button>
          );
        })}
        {agents.length < 6 && (
          <button type="button" className="cc-agent cc-agent-add" onClick={() => navigate('/agents')}>
            <span className="cc-icon-box lg"><Sparkles size={17} /></span>
            <span className="cc-agent-text">
              <b>{agents.length === 0 ? 'Create your first agent' : 'New Agent'}</b>
              <small>Deploy an autonomous agent</small>
            </span>
          </button>
        )}
      </div>
    </Panel>
  );
}

function MissionTimeline() {
  const conversations = useAppStore((s) => s.conversations);
  const activeId = useAppStore((s) => s.activeId);
  const selectConversation = useAppStore((s) => s.selectConversation);
  const navigate = useNavigate();
  const recent = conversations.slice(0, 4);
  const maxMsgs = Math.max(1, ...recent.map((c) => c.messages.length));

  return (
    <Panel
      title="Mission Timeline"
      className="cc-timeline"
      action={<span className="cc-chip">Recent</span>}
    >
      <ol className="cc-timeline-list">
        {recent.length === 0 && <li className="cc-empty">No missions yet — start a conversation</li>}
        {recent.map((c) => {
          const d = new Date(c.updatedAt);
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  selectConversation(c.id);
                  navigate('/');
                }}
                className={c.id === activeId ? 'is-active' : ''}
              >
                <time>
                  {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                  <small>{d.toLocaleDateString([], { month: 'short', day: 'numeric' })}</small>
                </time>
                <i className="cc-tl-dot" />
                <span className="cc-tl-body">
                  <b>{c.title || 'Untitled'}</b>
                  <span className="cc-tl-bar"><span style={{ width: `${(c.messages.length / maxMsgs) * 100}%` }} /></span>
                </span>
                <em>{c.id === activeId ? 'Live' : timeAgo(c.updatedAt)}</em>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="cc-panel-foot">
        <LinkAction label="View Dashboard" onClick={() => navigate('/dashboard')} />
      </div>
    </Panel>
  );
}

function QuickCommands() {
  const navigate = useNavigate();
  const createConversation = useAppStore((s) => s.createConversation);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const messages = useAppStore((s) => s.messages);
  const deepResearch = useAppStore((s) => s.deepResearch);
  const setDeepResearch = useAppStore((s) => s.setDeepResearch);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);

  const cmds = [
    {
      icon: MessageSquarePlus,
      label: 'Start New Chat',
      run: () => {
        if (messages.length > 0) createConversation(selectedModel);
        navigate('/');
      },
    },
    { icon: Mic, label: 'Start Voice Chat', run: requestVoiceAssistant },
    { icon: FileSearch, label: deepResearch ? 'Deep Research: ON' : 'Deep Research', run: () => setDeepResearch(!deepResearch), active: deepResearch },
    { icon: Plug, label: 'Connect Data Source', run: () => navigate('/data-sources') },
    { icon: Command, label: 'Switch Model  ⌘K', run: () => setCommandPaletteOpen(true) },
  ];

  return (
    <Panel title="Quick Commands" className="cc-quick">
      <div className="cc-quick-list">
        {cmds.map((c) => (
          <button key={c.label} type="button" onClick={c.run} className={c.active ? 'is-active' : ''}>
            <span className="cc-icon-box sm"><c.icon size={13} /></span>
            {c.label}
          </button>
        ))}
      </div>
    </Panel>
  );
}

function Ring({ label, value, pct }: { label: string; value: string; pct: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="cc-ring">
      <svg viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} className="track" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className="value"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <span>
        <small>{label}</small>
        <b>{value}</b>
      </span>
    </div>
  );
}

function SystemMonitor() {
  const t = useSharedCommandCenterData().telemetry;
  const tps = t?.avg_throughput_tok_per_sec ?? 0;
  const gpu = t?.avg_gpu_utilization_pct ?? 0;
  const itl = t?.avg_mean_itl_ms ?? 0;

  return (
    <Panel title="System Monitor" className="cc-monitor">
      <div className="cc-rings">
        <Ring label="Speed" value={`${tps.toFixed(0)}t/s`} pct={(tps / 60) * 100} />
        <Ring label="GPU" value={`${gpu.toFixed(0)}%`} pct={gpu} />
        <Ring label="Latency" value={`${itl.toFixed(0)}ms`} pct={(itl / 100) * 100} />
      </div>
      <p className="cc-monitor-foot">
        {t ? `${(t.total_tokens ?? 0).toLocaleString()} tokens · ${(t.total_requests ?? 0).toLocaleString()} requests` : 'Telemetry unavailable'}
      </p>
    </Panel>
  );
}

const STARS: [number, number][] = [
  [8, 70], [22, 52], [34, 60], [46, 30], [58, 42], [70, 26], [82, 48], [92, 40], [64, 66], [40, 82],
];

function MemoryInsights() {
  const d = useSharedCommandCenterData();
  const conversations = useAppStore((s) => s.conversations);
  const navigate = useNavigate();
  const toolCalls = useMemo(
    () => conversations.reduce((n, c) => n + c.messages.reduce((m, msg) => m + (msg.toolCalls?.length ?? 0), 0), 0),
    [conversations],
  );

  return (
    <Panel title="Memory Insights" className="cc-memory">
      <div className="cc-memory-body">
        <div className="cc-constellation">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={STARS.slice(0, 8).map((p) => p.join(',')).join(' ')} />
            <polyline points={[STARS[4], STARS[8], STARS[9]].map((p) => p.join(',')).join(' ')} />
            {STARS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.8 : 1.2} />)}
          </svg>
          <LinkAction label="Memory Settings" onClick={() => navigate('/settings')} />
        </div>
        <dl className="cc-memory-stats">
          <div><dt>Memories</dt><dd>{d.memoryEntries !== null ? d.memoryEntries.toLocaleString() : '—'}</dd></div>
          <div><dt>Sessions</dt><dd>{conversations.length.toLocaleString()}</dd></div>
          <div><dt>Tool Calls</dt><dd>{toolCalls.toLocaleString()}</dd></div>
        </dl>
      </div>
    </Panel>
  );
}

const PROVIDER_TONE: Tone[] = ['purple', 'teal', 'blue', 'amber', 'cyan', 'green'];

function LlmStatus() {
  const models = useAppStore((s) => s.models);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const navigate = useNavigate();

  const providers = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of models) {
      const key = m.owned_by || 'local';
      map.set(key, [...(map.get(key) ?? []), m.id]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [models]);

  return (
    <Panel
      title="LLM Status"
      className="cc-llm"
      action={<span className="cc-ok">{providers.length} Connected</span>}
    >
      <div className="cc-llm-grid">
        {providers.length === 0 && <p className="cc-empty">No models available</p>}
        {providers.slice(0, 9).map(([provider, ids], i) => {
          const hasSelected = ids.includes(selectedModel);
          return (
            <button
              key={provider}
              type="button"
              className={`cc-llm-card tone-${PROVIDER_TONE[i % PROVIDER_TONE.length]} ${hasSelected ? 'is-selected' : ''}`}
              onClick={() => setCommandPaletteOpen(true)}
              title={ids.join('\n')}
            >
              <span className="cc-icon-box sm"><Radio size={12} /></span>
              <span>
                <b>{provider}</b>
                <small>{hasSelected ? `In use · ${selectedModel}` : `${ids.length} model${ids.length > 1 ? 's' : ''}`}</small>
              </span>
            </button>
          );
        })}
      </div>
      <div className="cc-panel-foot">
        <LinkAction label="Manage Providers" onClick={() => navigate('/settings')} />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

export function CommandCenter({
  status,
  conversation,
}: {
  status: ReactorStatus;
  conversation: ReactNode | null;
}) {
  return (
    <div className={`cc-grid ${conversation ? 'is-chat' : ''}`}>
      <CoreOverview />
      <Hero status={status} conversation={conversation} />
      <LiveFeed />
      <ActiveAgents />
      {!conversation && <MissionTimeline />}
      <QuickCommands />
      <SystemMonitor />
      <MemoryInsights />
      <LlmStatus />
    </div>
  );
}

