"use client";

import { useQuery } from "@tanstack/react-query";
import { agent2Api, agent3Api, agent4Api } from "@/lib/api";
import { Bot, ExternalLink, Loader2, WifiOff } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const agentConfig = [
  { id: 2, name: "Agent 2", role: "Inventory Intelligence Agent",
    color: "bg-blue-50 text-blue-600",
    fetchStatus: () => agent2Api.getStatus(),
    spark: "M0,10 L5,6 L10,8 L15,4 L20,7 L25,3 L30,6",
  },
  { id: 3, name: "Agent 3", role: "Vendor Intelligence Agent",
    color: "bg-purple-50 text-purple-600",
    fetchStatus: () => agent3Api.getStatus(),
    spark: "M0,8 L5,10 L10,5 L15,8 L20,4 L25,6 L30,3",
  },
  { id: 4, name: "Agent 4", role: "Procurement Agent",
    color: "bg-orange-50 text-orange-600",
    fetchStatus: () => agent4Api.getStatus(),
    spark: "M0,6 L5,9 L10,7 L15,5 L20,8 L25,4 L30,7",
  },
];

function AgentCard({ agent }: { agent: typeof agentConfig[0] }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: [`agent-status-${agent.id}`],
    queryFn: agent.fetchStatus,
    refetchInterval: 3000, // poll every 3 seconds
    retry: 1,
  });

  const status   = data?.status ?? (isError ? "offline" : "connecting");
  const task     = data?.current_task ?? "—";
  const eventsProcessed = data?.events_processed ?? 0;

  const statusColor =
    status === "running"     ? "badge-green" :
    status === "starting"    ? "badge-blue"  :
    status === "degraded"    ? "badge-yellow":
    status === "offline"     ? "badge-red"   : "badge-slate";

  const statusLabel =
    status === "running"     ? "Active"      :
    status === "starting"    ? "Starting"    :
    status === "degraded"    ? "Degraded"    :
    status === "offline"     ? "Offline"     : "Connecting";

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", agent.color)}>
        {isLoading ? <Loader2 size={15} className="animate-spin" /> :
         isError   ? <WifiOff size={15} /> :
                     <Bot size={15} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{agent.name}</span>
          <span className={cn("badge", statusColor)}>{statusLabel}</span>
        </div>
        <p className="text-xs text-slate-500 truncate">{agent.role}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{task}</p>
        {eventsProcessed > 0 && (
          <p className="text-[11px] text-emerald-600 font-medium">{eventsProcessed} events processed</p>
        )}
      </div>
      <svg width="32" height="14" viewBox="0 0 30 14" className="shrink-0">
        <path d={agent.spark} fill="none"
          stroke={status === "running" ? "#10b981" : "#cbd5e1"}
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function AgentStatusPanel() {
  return (
    <div className="section-card p-5 h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">AI Agents Status</h2>
          <p className="text-xs text-slate-400 mt-0.5">Live — refreshes every 3s</p>
        </div>
        <Link href="/agents" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
          View All <ExternalLink size={11} />
        </Link>
      </div>
      <div className="space-y-3">
        {agentConfig.map(agent => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
