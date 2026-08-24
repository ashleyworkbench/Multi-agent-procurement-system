"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { procurementApi, agent2Api, agent3Api, agent4Api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ScrollText, RefreshCw, Loader2, ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, Zap, Package, Store, ShoppingCart,
  Filter, Circle,
} from "lucide-react";

// ------------------------------------------------------------------ #
// Event type config                                                    //
// ------------------------------------------------------------------ #
const eventConfig: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  OCR_REQUEST_CREATED:    { color: "text-slate-500  bg-slate-50",   icon: ScrollText,    label: "OCR Request" },
  INVENTORY_EVALUATED:    { color: "text-blue-600   bg-blue-50",    icon: Package,       label: "Inventory Evaluated" },
  VENDOR_RECOMMENDED:     { color: "text-purple-600 bg-purple-50",  icon: Store,         label: "Vendor Recommended" },
  PURCHASE_ORDER_CREATED: { color: "text-orange-600 bg-orange-50",  icon: ShoppingCart,  label: "PO Created" },
  APPROVAL_REQUESTED:     { color: "text-amber-600  bg-amber-50",   icon: AlertTriangle, label: "Approval Requested" },
  APPROVAL_GRANTED:       { color: "text-emerald-600 bg-emerald-50",icon: CheckCircle2,  label: "Approved" },
  APPROVAL_REJECTED:      { color: "text-red-600    bg-red-50",     icon: AlertTriangle, label: "Rejected" },
};

const agentConfig = [
  { id: "all",     label: "All Agents",  color: "border-slate-300 text-slate-600" },
  { id: "agent_2", label: "Agent 2",     color: "border-blue-400   text-blue-600" },
  { id: "agent_3", label: "Agent 3",     color: "border-purple-400 text-purple-600" },
  { id: "agent_4", label: "Agent 4",     color: "border-orange-400 text-orange-600" },
];

// ------------------------------------------------------------------ #
// Kafka event log row                                                  //
// ------------------------------------------------------------------ #
function KafkaLogRow({ log }: { log: any }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = eventConfig[log.event_type] ?? { color: "text-slate-500 bg-slate-50", icon: Zap, label: log.event_type };
  const Icon = cfg.icon;

  let payload: any = {};
  try { payload = typeof log.payload === "string" ? JSON.parse(log.payload) : log.payload; } catch {}

  const agentColor: Record<string, string> = {
    agent_2: "bg-blue-100 text-blue-700",
    agent_3: "bg-purple-100 text-purple-700",
    agent_4: "bg-orange-100 text-orange-700",
    agent_1: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden hover:border-slate-200 transition-colors">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        {/* Event icon */}
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", cfg.color.split(" ").slice(1).join(" "))}>
          <Icon size={13} className={cfg.color.split(" ")[0]} />
        </div>

        {/* Event type */}
        <span className="text-sm font-semibold text-slate-700 min-w-[200px]">{cfg.label}</span>

        {/* Source agent */}
        <span className={cn("badge text-[11px]", agentColor[log.source_agent] ?? "badge-slate")}>
          {log.source_agent?.replace("_", " ")}
        </span>

        {/* Topic */}
        <code className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md hidden md:block truncate max-w-[180px]">
          {log.topic}
        </code>

        {/* Request ID */}
        {payload.request_id && (
          <span className="text-xs text-slate-500 hidden lg:block">
            Request #{payload.request_id}
          </span>
        )}

        <span className="ml-auto text-[11px] text-slate-400 whitespace-nowrap">
          {log.created_at?.slice(0, 19)}
        </span>
        {expanded ? <ChevronUp size={13} className="text-slate-400 shrink-0" /> : <ChevronDown size={13} className="text-slate-400 shrink-0" />}
      </button>

      {/* Expanded payload */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 mb-3">
            <div><p className="text-[10px] text-slate-400 uppercase tracking-wide">Event ID</p>
              <p className="text-xs font-mono text-slate-600 truncate">{log.event_id}</p></div>
            <div><p className="text-[10px] text-slate-400 uppercase tracking-wide">Type</p>
              <p className="text-xs font-semibold text-slate-700">{log.event_type}</p></div>
            <div><p className="text-[10px] text-slate-400 uppercase tracking-wide">Source</p>
              <p className="text-xs font-semibold text-slate-700">{log.source_agent}</p></div>
            <div><p className="text-[10px] text-slate-400 uppercase tracking-wide">Topic</p>
              <code className="text-xs text-slate-600">{log.topic}</code></div>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Payload</p>
            <pre className="text-[11px] font-mono text-slate-600 bg-white border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-48">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ #
// Live agent status mini-bar                                           //
// ------------------------------------------------------------------ #
function AgentStatusBadge({ name, fetchFn }: { name: string; fetchFn: () => Promise<any> }) {
  const { data, isError } = useQuery({
    queryKey: [`log-status-${name}`], queryFn: fetchFn,
    refetchInterval: 5000, retry: 1,
  });
  const running = data?.status === "running";
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl">
      <Circle size={8} className={cn("fill-current", running ? "text-emerald-500" : isError ? "text-red-400" : "text-amber-400")} />
      <span className="text-xs font-semibold text-slate-700">{name}</span>
      {data?.events_processed > 0 && (
        <span className="text-[11px] text-slate-400">{data.events_processed} events</span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ #
// Main view                                                            //
// ------------------------------------------------------------------ #
export function AgentLogsView() {
  const [agentFilter, setAgentFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["agent-logs", agentFilter],
    queryFn:  () => procurementApi.getAgentLogs(
      agentFilter !== "all" ? { source_agent: agentFilter, limit: 100 } : { limit: 100 }
    ),
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const logs: any[] = data?.logs ?? [];

  const filtered = eventFilter === "all"
    ? logs
    : logs.filter(l => l.event_type === eventFilter);

  const eventTypes = Array.from(new Set(logs.map((l: any) => l.event_type as string)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agent Logs</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Kafka event history from procurement_db — {logs.length} total events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(a => !a)}
            className={cn("btn-secondary text-xs", autoRefresh && "border-emerald-300 text-emerald-600")}
          >
            <Circle size={8} className={cn("fill-current", autoRefresh ? "text-emerald-500" : "text-slate-400")} />
            {autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
          </button>
          <button onClick={() => refetch()} className="btn-secondary">
            <RefreshCw size={14} className={cn(isFetching && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Live agent status */}
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Live:</p>
        <AgentStatusBadge name="Agent 2" fetchFn={agent2Api.getStatus} />
        <AgentStatusBadge name="Agent 3" fetchFn={agent3Api.getStatus} />
        <AgentStatusBadge name="Agent 4" fetchFn={agent4Api.getStatus} />
      </div>

      {/* Summary stats */}
      {!isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Events",  value: logs.length },
            { label: "Agent 2 Events", value: logs.filter(l => l.source_agent === "agent_2").length },
            { label: "Agent 3 Events", value: logs.filter(l => l.source_agent === "agent_3").length },
            { label: "Agent 4 Events", value: logs.filter(l => l.source_agent === "agent_4").length },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Agent filter */}
        <div className="flex items-center gap-1">
          {agentConfig.map(a => (
            <button key={a.id} onClick={() => setAgentFilter(a.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                agentFilter === a.id ? a.color + " bg-white" : "border-slate-200 text-slate-500 bg-white hover:border-slate-300"
              )}>
              {a.label}
            </button>
          ))}
        </div>

        {/* Event type filter */}
        {eventTypes.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <Filter size={12} className="text-slate-400" />
            <button onClick={() => setEventFilter("all")}
              className={cn("px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all",
                eventFilter === "all" ? "border-slate-400 bg-slate-100 text-slate-700" : "border-slate-200 text-slate-500 hover:border-slate-300")}>
              All
            </button>
            {eventTypes.map(et => {
              const cfg = eventConfig[et as string] ?? { label: et, color: "text-slate-500 bg-slate-50" };
              return (
                <button key={et} onClick={() => setEventFilter(et as string)}
                  className={cn("px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all",
                    eventFilter === et
                      ? "border-brand-400 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-500 hover:border-slate-300")}>
                  {cfg.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Log entries */}
      {isLoading ? (
        <div className="section-card p-16 flex items-center justify-center">
          <div className="text-center">
            <Loader2 size={28} className="animate-spin text-brand-500 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading agent logs...</p>
          </div>
        </div>
      ) : isError ? (
        <div className="section-card p-12 text-center">
          <AlertTriangle size={28} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-600 font-semibold">Could not load logs</p>
          <p className="text-xs text-slate-400 mt-1">Procurement service must be running</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="section-card p-12 text-center">
          <ScrollText size={32} className="text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No events logged yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Run the agent pipeline from the Agent Monitor to generate events
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((log: any) => (
            <KafkaLogRow key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}
