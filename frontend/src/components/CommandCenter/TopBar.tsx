import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { LayoutGrid, Monitor, Moon, Search, Settings, Sun, User, PanelLeft } from 'lucide-react';
import { ApprovalBell } from '../ApprovalBell';
import { useAppStore } from '../../lib/store';
import { useSharedCommandCenterData } from './data';
import { ClaudeToggle } from './ClaudeToggle';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function TopBar() {
  const now = useClock();
  const navigate = useNavigate();
  const { apiReachable, agents } = useSharedCommandCenterData();
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const displayName = useAppStore((s) => s.optInDisplayName);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const degraded = agents?.some((a) => ['error', 'needs_attention', 'stalled'].includes(a.status));
  const status =
    apiReachable === null ? 'CHECKING' : apiReachable === false ? 'OFFLINE' : degraded ? 'DEGRADED' : 'OPTIMAL';

  const ThemeIcon = settings.theme === 'light' ? Sun : settings.theme === 'dark' ? Moon : Monitor;
  const nextTheme = settings.theme === 'light' ? 'dark' : settings.theme === 'dark' ? 'system' : 'light';

  return (
    <header className="cc-topbar">
      <div className="cc-topbar-left">
        {!sidebarOpen && (
          <button type="button" className="cc-icon-btn" onClick={toggleSidebar} title="Open sidebar">
            <PanelLeft size={16} />
          </button>
        )}
        <div className={`cc-status-pill status-${status.toLowerCase()}`}>
          SYSTEM STATUS <i /> <b>{status}</b>
        </div>
      </div>

      <div className="cc-clock">
        <small>
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </small>
        <time>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
      </div>

      <div className="cc-topbar-right">
        <ClaudeToggle />
        <button type="button" className="cc-search" onClick={() => setCommandPaletteOpen(true)}>
          <Search size={14} />
          <span>Search…</span>
          <kbd>⌘K</kbd>
        </button>
        <button type="button" className="cc-icon-btn" title="Dashboard" onClick={() => navigate('/dashboard')}>
          <LayoutGrid size={16} />
        </button>
        <ApprovalBell inline />
        <button
          type="button"
          className="cc-icon-btn"
          title={`Theme: ${settings.theme}`}
          onClick={() => updateSettings({ theme: nextTheme })}
        >
          <ThemeIcon size={16} />
        </button>
        <button type="button" className="cc-icon-btn" title="Settings" onClick={() => navigate('/settings')}>
          <Settings size={16} />
        </button>
        <div className="cc-operator">
          <span>
            <b>{displayName || 'Operator'}</b>
            <small>Commander</small>
          </span>
          <i><User size={15} /></i>
        </div>
      </div>
    </header>
  );
}
