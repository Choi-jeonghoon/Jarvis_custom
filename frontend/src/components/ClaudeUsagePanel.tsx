import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchUsage, type UsageProvider, type UsageReport } from '../lib/api';
import { CLAUDE_MODELS, useAppStore } from '../lib/store';

const PERIODS = [
  { days: 1, label: '오늘' },
  { days: 7, label: '7일' },
  { days: 30, label: '30일' },
  { days: 90, label: '90일' },
];

const PROVIDERS: { id: UsageProvider; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'all', label: '전체 모델' },
];

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);
const fmtUsd = (n: number) => (n > 0 && n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`);
const fmtDateTime = (ts: number | null) => (ts ? new Date(ts * 1000).toLocaleString() : '—');

const controlStyle = {
  background: 'var(--color-bg-secondary)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs px-2.5 py-1 rounded-md cursor-pointer"
      style={{
        background: active ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
        color: active ? 'var(--color-bg)' : 'var(--color-text-secondary)',
        border: '1px solid var(--color-border)',
      }}
    >
      {children}
    </button>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
      <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>{value}</div>
      {sub && <div className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</div>}
    </div>
  );
}

/** Single-series daily token bars with a per-bar hover tooltip. */
function DailyBars({ daily }: { daily: UsageReport['daily'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.total_tokens));
  const h = hover !== null ? daily[hover] : null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>일별 토큰 사용량</div>
        <div className="text-[11px] tabular-nums h-4" style={{ color: 'var(--color-text-secondary)' }}>
          {h
            ? `${h.date} · ${fmtTokens(h.total_tokens)} 토큰 (입력 ${fmtTokens(h.prompt_tokens)} / 출력 ${fmtTokens(h.completion_tokens)}) · ${h.calls}회 · ${fmtUsd(h.cost_usd)}`
            : `최대 ${fmtTokens(max)} / 일`}
        </div>
      </div>
      <div
        className="flex items-end h-28 pb-px"
        style={{ gap: daily.length > 40 ? 1 : 2, borderBottom: '1px solid var(--color-border)' }}
        onMouseLeave={() => setHover(null)}
      >
        {daily.map((d, i) => (
          <div
            key={d.date}
            className="flex-1 h-full flex items-end cursor-default"
            onMouseEnter={() => setHover(i)}
          >
            <div
              className="w-full"
              style={{
                height: d.total_tokens ? `${Math.max(2, (d.total_tokens / max) * 100)}%` : 0,
                background: 'var(--color-accent)',
                opacity: hover === null || hover === i ? 1 : 0.45,
                borderRadius: '3px 3px 0 0',
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] mt-1 tabular-nums" style={{ color: 'var(--color-text-tertiary)' }}>
        <span>{daily[0]?.date}</span>
        <span>{daily[daily.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export function ClaudeUsagePanel() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const setClaudeEnabled = useAppStore((s) => s.setClaudeEnabled);
  const models = useAppStore((s) => s.models);

  const [days, setDays] = useState(30);
  const [provider, setProvider] = useState<UsageProvider>('claude');
  const [data, setData] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchUsage(days, provider));
    } catch (e: any) {
      setError(e?.message ?? '사용량을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [days, provider]);

  useEffect(() => { void load(); }, [load]);

  const claudeAvailable = models.some((m) => m.id === settings.claudeModel);
  const active = settings.claudeEnabled && selectedModel === settings.claudeModel;
  const t = data?.totals;

  return (
    <div className="space-y-4">
      {/* Connection */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={active}
          onClick={() => setClaudeEnabled(!active)}
          disabled={!active && !claudeAvailable}
          className="relative w-11 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: active ? 'var(--color-accent)' : 'var(--color-bg-tertiary)' }}
        >
          <span
            className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
            style={{ transform: active ? 'translateX(20px)' : 'none' }}
          />
        </button>
        <span className="text-sm" style={{ color: 'var(--color-text)' }}>
          {active ? 'Claude 사용 중' : `기본 모델 사용 중 (${selectedModel || '—'})`}
        </span>
        <select
          value={settings.claudeModel}
          onChange={(e) => {
            updateSettings({ claudeModel: e.target.value });
            if (active) setSelectedModel(e.target.value);
          }}
          className="text-sm px-2 py-1 rounded-lg outline-none"
          style={controlStyle}
        >
          {CLAUDE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {!claudeAvailable && (
        <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Claude 모델이 목록에 없습니다. 아래 API Keys에서 Anthropic 키를 등록하고 서버가 <code>anthropic</code> 패키지를 설치했는지 확인하세요.
        </div>
      )}

      {/* Filters — one row above the chart */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => <Chip key={p.days} active={days === p.days} onClick={() => setDays(p.days)}>{p.label}</Chip>)}
        <span className="w-px h-4 mx-1" style={{ background: 'var(--color-border)' }} />
        {PROVIDERS.map((p) => <Chip key={p.id} active={provider === p.id} onClick={() => setProvider(p.id)}>{p.label}</Chip>)}
        <button type="button" onClick={() => void load()} className="ml-auto p-1 rounded cursor-pointer" title="새로고침" style={{ color: 'var(--color-text-secondary)' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <div className="text-xs" style={{ color: 'var(--color-error, #ef4444)' }}>{error}</div>}

      {t && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label="총 토큰" value={fmtTokens(t.total_tokens)} sub={`입력 ${fmtTokens(t.prompt_tokens)} · 출력 ${fmtTokens(t.completion_tokens)}`} />
            <StatTile label="요청 수" value={t.calls.toLocaleString()} />
            <StatTile label="예상 비용" value={fmtUsd(t.cost_usd)} sub="정가 기준 추정" />
            <StatTile label="기간" value={PERIODS.find((p) => p.days === days)?.label ?? `${days}일`} sub={data?.daily[0]?.date} />
          </div>

          {data.daily.length > 1 && <DailyBars daily={data.daily} />}

          {data.per_model.length > 0 ? (
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr style={{ color: 'var(--color-text-tertiary)' }}>
                  <th className="text-left font-normal py-1">모델</th>
                  <th className="text-right font-normal">요청</th>
                  <th className="text-right font-normal">입력</th>
                  <th className="text-right font-normal">출력</th>
                  <th className="text-right font-normal">비용</th>
                </tr>
              </thead>
              <tbody style={{ color: 'var(--color-text)' }}>
                {data.per_model.map((m) => (
                  <tr key={m.model} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                    <td className="py-1.5">{m.model}</td>
                    <td className="text-right">{m.calls}</td>
                    <td className="text-right">{fmtTokens(m.prompt_tokens)}</td>
                    <td className="text-right">{fmtTokens(m.completion_tokens)}</td>
                    <td className="text-right">{fmtUsd(m.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>이 기간에 기록된 사용량이 없습니다.</div>
          )}

          <div className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
            첫 사용 {fmtDateTime(data.first_seen)} · 마지막 사용 {fmtDateTime(data.last_seen)} · 이 앱(Jarvis)에서 보낸 요청만 집계됩니다.
            Anthropic 계정 전체 사용량/청구는 console.anthropic.com의 Usage 페이지에서 확인하세요.
          </div>
        </>
      )}
    </div>
  );
}
