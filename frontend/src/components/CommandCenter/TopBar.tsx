import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Menu, Search, Settings } from 'lucide-react';
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

const STATUS_TEXT = {
  checking: '연결 확인 중',
  offline: '서버 연결 끊김',
  degraded: '일부 에이전트 점검 필요',
  optimal: '정상 작동 중',
} as const;

export function TopBar() {
  const now = useClock();
  const navigate = useNavigate();
  const { apiReachable, agents } = useSharedCommandCenterData();
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  const degraded = agents?.some((a) => ['error', 'needs_attention', 'stalled'].includes(a.status));
  const status: keyof typeof STATUS_TEXT =
    apiReachable === null ? 'checking' : apiReachable === false ? 'offline' : degraded ? 'degraded' : 'optimal';

  return (
    <header className="cc-topbar">
      <div className="cc-topbar-left">
        {!sidebarOpen && (
          <button type="button" className="cc-icon-btn" onClick={toggleSidebar} aria-label="메뉴 열기">
            <Menu size={17} />
          </button>
        )}
        <span className={`cc-status status-${status}`} role="status">
          <i aria-hidden="true" />
          <span>{STATUS_TEXT[status]}</span>
        </span>
      </div>

      <div className="cc-clock">
        <time dateTime={now.toISOString()}>
          {now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </time>
        <small>{now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</small>
      </div>

      <div className="cc-topbar-right">
        <ClaudeToggle />
        <button
          type="button"
          className="cc-search"
          onClick={() => setCommandPaletteOpen(true)}
          aria-label="검색 및 명령"
        >
          <Search size={15} />
          <span>검색</span>
          <kbd>⌘K</kbd>
        </button>
        <ApprovalBell inline />
        <button type="button" className="cc-icon-btn" aria-label="설정" onClick={() => navigate('/settings')}>
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
}
