import { createContext, useContext, useEffect, useState } from 'react';
import {
  checkHealth,
  fetchManagedAgents,
  fetchPendingApprovals,
  fetchTelemetry,
  getMemoryStats,
} from '../../lib/api';
import type { ManagedAgent, PendingApproval } from '../../lib/api';
import { listConnectors } from '../../lib/connectors-api';
import type { ConnectorInfo } from '../../types/connectors';

export interface TelemetryStats {
  total_tokens?: number;
  total_requests?: number;
  avg_throughput_tok_per_sec?: number;
  avg_gpu_utilization_pct?: number;
  avg_mean_itl_ms?: number;
  total_latency?: number;
}

export interface CommandCenterData {
  apiReachable: boolean | null;
  agents: ManagedAgent[] | null;
  approvals: PendingApproval[];
  connectors: ConnectorInfo[] | null;
  memoryEntries: number | null;
  memoryError: string | null;
  telemetry: TelemetryStats | null;
}

const INITIAL: CommandCenterData = {
  apiReachable: null,
  agents: null,
  approvals: [],
  connectors: null,
  memoryEntries: null,
  memoryError: null,
  telemetry: null,
};

/**
 * Polls the backend for everything the Command Center panels display.
 * Each source fails independently so one broken endpoint (e.g. the memory
 * backend) never blanks the rest of the dashboard.
 */
export function useCommandCenterData(intervalMs = 15000): CommandCenterData {
  const [data, setData] = useState<CommandCenterData>(INITIAL);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const [health, agents, approvals, connectors, memory, telemetry] =
        await Promise.allSettled([
          checkHealth(),
          fetchManagedAgents(),
          fetchPendingApprovals(),
          listConnectors(),
          getMemoryStats(),
          fetchTelemetry(),
        ]);
      if (cancelled) return;

      setData((prev) => ({
        apiReachable: health.status === 'fulfilled' ? health.value : false,
        agents: agents.status === 'fulfilled' ? agents.value : prev.agents,
        approvals: approvals.status === 'fulfilled' ? approvals.value : prev.approvals,
        connectors: connectors.status === 'fulfilled' ? connectors.value : prev.connectors,
        memoryEntries:
          memory.status === 'fulfilled' && typeof memory.value.entries === 'number'
            ? memory.value.entries
            : null,
        memoryError:
          memory.status === 'rejected'
            ? String((memory.reason as Error)?.message ?? 'unavailable')
            : null,
        telemetry:
          telemetry.status === 'fulfilled' && telemetry.value && typeof telemetry.value === 'object'
            ? (telemetry.value as TelemetryStats)
            : prev.telemetry,
      }));
    };

    void refresh();
    const id = setInterval(refresh, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return data;
}

export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Fire-and-forget request for the voice assistant (handled by InputArea). */
export const OPEN_VOICE_EVENT = 'jarvis:open-voice';
export function requestVoiceAssistant() {
  window.dispatchEvent(new CustomEvent(OPEN_VOICE_EVENT));
}

export const CommandCenterDataContext = createContext<CommandCenterData>(INITIAL);
export const useSharedCommandCenterData = () => useContext(CommandCenterDataContext);
