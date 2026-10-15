"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { kafkaApi, agent2Api, agent3Api, agent4Api, procurementApi } from "@/lib/api";
import { cn, formatTime, formatDate, formatDateTime } from "@/lib/utils";
import {
  Radio, RefreshCw, Loader2, ChevronDown, ChevronUp, Copy, Check,
  ExternalLink, Search, Filter, Circle, HardDrive, FileSignature,
  FolderDown, Bot, Package, Store, ShoppingCart, AlertTriangle,
  CheckCircle2, Download, Play, Zap, HelpCircle
} from "lucide-react";
import { toast } from "sonner";

// ------------------------------------------------------------------ #
// Topic and Event Configuration                                       #
// ------------------------------------------------------------------ #
const topicConfig: Record<string, { label: string; stage: string; color: string; badge: string; icon: React.ElementType; desc: string }> = {
  "invoice-topic": {
    label: "invoice-topic",
    stage: "1. Folder Drop & MinIO Ingestion",
    color: "border-sky-300 bg-sky-50 text-sky-700",
    badge: "bg-sky-100 text-sky-800 border-sky-300",
    icon: FolderDown,
    desc: "Ingests raw invoice files dropped into /invoices folder and stores to MinIO",
  },
  "ocr-request-topic": {
    label: "ocr-request-topic",
    stage: "2. OCR & Extraction",
    color: "border-indigo-300 bg-indigo-50 text-indigo-700",
    badge: "bg-indigo-100 text-indigo-800 border-indigo-300",
    icon: Bot,
    desc: "Agent 1 extracts invoice data and emits structured procurement items",
  },
  "inventory-evaluation-topic": {
    label: "inventory-evaluation-topic",
    stage: "3. Inventory Intelligence",
    color: "border-blue-300 bg-blue-50 text-blue-700",
    badge: "bg-blue-100 text-blue-800 border-blue-300",
    icon: Package,
    desc: "Agent 2 detects industry and evaluates stock shortages across ERP databases",
  },
  "vendor-recommendation-topic": {
    label: "vendor-recommendation-topic",
    stage: "4. Vendor Intelligence",
    color: "border-purple-300 bg-purple-50 text-purple-700",
    badge: "bg-purple-100 text-purple-800 border-purple-300",
    icon: Store,
    desc: "Agent 3 scores suppliers on price, rating, and lead time for shortage items",
  },
  "purchase-order-topic": {
    label: "purchase-order-topic",
    stage: "5. PO Execution & DocuSign",
    color: "border-emerald-300 bg-emerald-50 text-emerald-700",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
    icon: ShoppingCart,
    desc: "Agent 4 generates PO, triggers approval email, and DocuSign completes signing",
  },
};

const eventConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  INVOICE_QUEUED:         { label: "Invoice Queued",         color: "text-sky-600 bg-sky-50 border-sky-200",         icon: FolderDown },
  OCR_REQUEST_CREATED:    { label: "OCR Request Created",    color: "text-indigo-600 bg-indigo-50 border-indigo-200", icon: Bot },
  INVENTORY_EVALUATED:    { label: "Inventory Evaluated",    color: "text-blue-600 bg-blue-50 border-blue-200",       icon: Package },
  VENDOR_RECOMMENDED:     { label: "Vendor Recommended",     color: "text-purple-600 bg-purple-50 border-purple-200", icon: Store },
  PURCHASE_ORDER_CREATED: { label: "Purchase Order Created", color: "text-amber-600 bg-amber-50 border-amber-200",   icon: ShoppingCart },
  APPROVAL_REQUESTED:     { label: "Approval Requested",     color: "text-yellow-600 bg-yellow-50 border-yellow-200", icon: AlertTriangle },
  APPROVAL_GRANTED:       { label: "DocuSign Approved",      color: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  APPROVAL_REJECTED:      { label: "Approval Rejected",      color: "text-red-600 bg-red-50 border-red-200",         icon: AlertTriangle },
};

const agentConfig = [
  { id: "all",                label: "All Sources",     color: "border-slate-300 text-slate-700" },
  { id: "agent_1",            label: "Agent 1 (OCR)",   color: "border-sky-400 text-sky-700" },
  { id: "agent_2",            label: "Agent 2 (Stock)", color: "border-blue-400 text-blue-700" },
  { id: "agent_3",            label: "Agent 3 (Vendor)",color: "border-purple-400 text-purple-700" },
  { id: "agent_4",            label: "Agent 4 (PO)",    color: "border-amber-400 text-amber-700" },
  { id: "approval_subsystem", label: "DocuSign Engine", color: "border-emerald-400 text-emerald-700" },
];

function formatKafkaSummary(log: any, payload: any): string {
  if (log?.event_type === "INVOICE_QUEUED") {
    return `[Ingestion] Invoice document '${payload?.filename || "invoice.pdf"}' automatically picked up from folder & queued on invoice-topic`;
  }
  if (log?.event_type === "OCR_REQUEST_CREATED") {
    return `[OCR & LLM] Extraction completed for Request #${payload?.request_id || payload?.processing_id || ""}. Items emitted to ocr-request-topic`;
  }
  if (log?.event_type === "INVENTORY_EVALUATED") {
    const shortages = payload?.shortage_items ?? (payload?.shortages ? payload.shortages.length : 0);
    return `[Inventory] Stock evaluation completed: ${shortages} shortage item(s) found. Published to inventory-evaluation-topic`;
  }
  if (log?.event_type === "VENDOR_RECOMMENDED") {
    const vendors = payload?.vendors_found ?? (payload?.recommendations ? payload.recommendations.length : 1);
    return `[Vendor Selection] Ranked ${vendors} supplier(s) based on price, rating & lead time. Published to vendor-recommendation-topic`;
  }
  if (log?.event_type === "PURCHASE_ORDER_CREATED") {
    const count = payload?.pos_created || 1;
    return `[Procurement] Generated ${count} PO(s). Dispatched DocuSign authorization email to designated approver. Published to purchase-order-topic`;
  }
  if (log?.event_type === "APPROVAL_GRANTED") {
    return `[DocuSign] PO #${payload?.po_number || ""} digitally signed by ${payload?.signer || "Approver"} and archived in MinIO`;
  }
  return payload?.message || log?.event_type?.replace(/_/g, " ") || "Kafka Message Processed";
}

// ------------------------------------------------------------------ #
// Log Entry Row Component                                             #
// ------------------------------------------------------------------ #
function KafkaLogRow({ log }: { log: any }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  let payload: any = {};
  try {
    if (typeof log?.payload === "string") {
      payload = JSON.parse(log.payload) || {};
    } else if (log?.payload && typeof log.payload === "object") {
      payload = log.payload;
    }
  } catch {
    payload = {};
  }

  const topicCfg = topicConfig[log?.topic] ?? {
    label: log?.topic || "kafka-topic",
    stage: "Event Broker",
    color: "border-slate-200 bg-slate-50 text-slate-700",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    icon: Radio,
    desc: "",
  };
  const eventCfg = eventConfig[log?.event_type] ?? {
    label: log?.event_type || "Event",
    color: "text-slate-600 bg-slate-50 border-slate-200",
    icon: Zap,
  };

  const TopicIcon = topicCfg.icon;
  const EventIcon = eventCfg.icon;

  const copyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    toast.success("Payload copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-slate-200/90 rounded-xl overflow-hidden bg-white hover:border-slate-300 transition-colors shadow-xs">
      <div
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/70 transition-colors cursor-pointer select-none"
      >
        {/* Pulsing Dot + Topic Icon */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border", topicCfg.badge)}>
            <TopicIcon size={15} />
          </div>
        </div>

        {/* Event Type & Topic Pill */}
        <div className="min-w-[190px] shrink-0">
          <div className="flex items-center gap-1.5">
            <span className={cn("text-xs font-bold px-2 py-0.5 rounded border inline-flex items-center gap-1", eventCfg.color)}>
              <EventIcon size={11} />
              {eventCfg.label}
            </span>
          </div>
          <code className="text-[10px] text-slate-500 font-mono mt-0.5 block truncate">
            {log?.topic || "internal"}
          </code>
        </div>

        {/* Description / Summary */}
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-xs font-medium text-slate-800 leading-snug">
            {formatKafkaSummary(log, payload)}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
            <span className="font-mono">Source: <b className="text-slate-600">{log?.source_agent}</b></span>
            {payload?.request_id && (
              <>
                <span>•</span>
                <span>Request: <b className="text-slate-600">#{payload.request_id}</b></span>
              </>
            )}
            {payload?.po_number && (
              <>
                <span>•</span>
                <span>PO: <b className="text-slate-600">{payload.po_number}</b></span>
              </>
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div className="shrink-0 text-right">
          <span className="text-xs font-mono font-semibold text-slate-700 block">
            {formatTime(log?.created_at)}
          </span>
          <span className="text-[10px] text-slate-400">
            {formatDate(log?.created_at)}
          </span>
        </div>

        {/* Expand toggle */}
        <div className="text-slate-400 shrink-0 ml-1">
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>
      </div>

      {/* Expanded payload & event metadata */}
      {expanded && (
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 bg-white p-3 rounded-lg border border-slate-200/80">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Event ID</p>
              <p className="text-xs font-mono font-semibold text-slate-700 truncate">{log?.event_id || "-"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Kafka Topic</p>
              <code className="text-xs text-brand-700 font-bold">{log?.topic}</code>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Source Agent</p>
              <p className="text-xs font-semibold text-slate-700">{log?.source_agent}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Timestamp (IST)</p>
              <p className="text-xs font-mono text-slate-700 font-medium">{formatDateTime(log?.created_at)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Kafka Event Payload (JSON):
            </p>
            <button
              onClick={copyPayload}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-md transition-colors"
            >
              {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy Payload"}
            </button>
          </div>

          <pre className="text-xs font-mono text-slate-700 bg-white border border-slate-200 rounded-lg p-3.5 overflow-x-auto max-h-56 leading-relaxed">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ #
// Main Kafka Logs Page View                                           #
// ------------------------------------------------------------------ #
export function KafkaLogsView() {
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [refreshInterval, setRefreshInterval] = useState<number>(3000); // 3s default

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["kafka-logs-view", topicFilter, agentFilter],
    queryFn: () => kafkaApi.getLogs({
      topic: topicFilter !== "all" ? topicFilter : undefined,
      source_agent: agentFilter !== "all" ? agentFilter : undefined,
      limit: 100,
    }),
    refetchInterval: refreshInterval > 0 ? refreshInterval : false,
  });

  const logs: any[] = data?.logs ?? [];

  // Client-side text filter
  const filteredLogs = logs.filter((log: any) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const payloadStr = typeof log?.payload === "string" ? log.payload : JSON.stringify(log?.payload || {});
    return (
      log?.event_type?.toLowerCase().includes(term) ||
      log?.topic?.toLowerCase().includes(term) ||
      log?.source_agent?.toLowerCase().includes(term) ||
      log?.event_id?.toLowerCase().includes(term) ||
      payloadStr.toLowerCase().includes(term)
    );
  });

  const downloadLogs = () => {
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kafka_logs_${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Kafka logs exported successfully");
  };

  const topicsList = [
    { id: "all", label: "All Topics" },
    { id: "invoice-topic", label: "invoice-topic" },
    { id: "ocr-request-topic", label: "ocr-request-topic" },
    { id: "inventory-evaluation-topic", label: "inventory-evaluation-topic" },
    { id: "vendor-recommendation-topic", label: "vendor-recommendation-topic" },
    { id: "purchase-order-topic", label: "purchase-order-topic" },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
              <Radio size={20} className="animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Kafka Event Logs & Pipeline Stream</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Real-time message broker monitoring from folder ingestion to DocuSign signature
              </p>
            </div>
          </div>
        </div>

        {/* Right header controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Refresh interval selector */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-500 font-medium">Auto-refresh:</span>
            <select
              value={refreshInterval}
              onChange={e => setRefreshInterval(Number(e.target.value))}
              className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value={2000}>2s</option>
              <option value={3000}>3s (Live)</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
              <option value={0}>Paused</option>
            </select>
          </div>

          <button
            onClick={() => refetch()}
            className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"
            title="Refresh now"
          >
            <RefreshCw size={13} className={cn(isFetching && "animate-spin text-brand-600")} />
            <span>Refresh</span>
          </button>

          <button
            onClick={downloadLogs}
            disabled={filteredLogs.length === 0}
            className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"
            title="Export filtered logs to JSON"
          >
            <Download size={13} />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Kafka Events",
            value: logs.length,
            desc: "Recorded in procurement_events",
            color: "text-slate-900",
            icon: Radio,
            bg: "bg-emerald-50 text-emerald-600",
          },
          {
            label: "Folder Ingestion Events",
            value: logs.filter(l => l.topic === "invoice-topic").length,
            desc: "Invoices picked from /invoices",
            color: "text-sky-700",
            icon: FolderDown,
            bg: "bg-sky-50 text-sky-600",
          },
          {
            label: "Inventory & Shortage",
            value: logs.filter(l => l.topic === "inventory-evaluation-topic").length,
            desc: "Agent 2 stock evaluations",
            color: "text-blue-700",
            icon: Package,
            bg: "bg-blue-50 text-blue-600",
          },
          {
            label: "PO & DocuSign Approvals",
            value: logs.filter(l => l.topic === "purchase-order-topic").length,
            desc: "Agent 4 POs & digital signatures",
            color: "text-emerald-700",
            icon: ShoppingCart,
            bg: "bg-emerald-50 text-emerald-600",
          },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="stat-card flex items-start justify-between">
              <div>
                <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                <p className="text-xs font-semibold text-slate-700 mt-1">{s.label}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{s.desc}</p>
              </div>
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-slate-100", s.bg)}>
                <Icon size={16} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Architecture & Topic Topology Card */}
      <div className="section-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <h2 className="text-sm font-bold text-slate-900">
              Automated Pipeline Architecture & Topic Topology
            </h2>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1 font-mono">
              Broker: <b className="text-slate-800">kafka:9092</b>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              Storage: <b className="text-slate-800">MinIO (Bucket: invoices)</b>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              Signatures: <b className="text-slate-800">DocuSign Connect</b>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-1">
          {Object.entries(topicConfig).map(([topicName, cfg], i) => {
            const Icon = cfg.icon;
            const count = logs.filter(l => l.topic === topicName).length;
            return (
              <div
                key={topicName}
                onClick={() => setTopicFilter(topicFilter === topicName ? "all" : topicName)}
                className={cn(
                  "p-3 rounded-xl border transition-all cursor-pointer select-none",
                  topicFilter === topicName
                    ? "ring-2 ring-brand-500 bg-white shadow-xs"
                    : "bg-white hover:border-slate-300"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    STAGE {i + 1}
                  </span>
                  <span className={cn("badge text-[10px]", count > 0 ? "badge-green" : "badge-slate")}>
                    {count} events
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border", cfg.badge)}>
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{cfg.label}</p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                  {cfg.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Topic tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
          {topicsList.map(t => (
            <button
              key={t.id}
              onClick={() => setTopicFilter(t.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border",
                topicFilter === t.id
                  ? "bg-brand-50 border-brand-300 text-brand-700 font-semibold"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search bar & Source agent filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {agentConfig.map(a => (
              <button
                key={a.id}
                onClick={() => setAgentFilter(a.id)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all",
                  agentFilter === a.id
                    ? a.color + " bg-white shadow-xs"
                    : "border-slate-200 text-slate-500 bg-white hover:border-slate-300"
                )}
              >
                {a.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search filename, request ID, PO..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Log Feed */}
      {isLoading ? (
        <div className="section-card p-16 flex items-center justify-center">
          <div className="text-center">
            <Loader2 size={30} className="animate-spin text-brand-500 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">Connecting to Kafka stream...</p>
            <p className="text-xs text-slate-400 mt-1">Polling procurement_events from PostgreSQL</p>
          </div>
        </div>
      ) : isError ? (
        <div className="section-card p-12 text-center">
          <AlertTriangle size={28} className="text-red-500 mx-auto mb-3" />
          <p className="text-sm text-red-600 font-semibold">Unable to fetch Kafka event stream</p>
          <p className="text-xs text-slate-400 mt-1">Ensure procurement-service and api-gateway are running</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="section-card p-14 text-center">
          <Radio size={36} className="text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No Kafka Events Recorded Yet</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Drop an invoice in the <code className="text-slate-700 bg-slate-100 px-1 py-0.5 rounded font-mono">/invoices</code> folder
            or upload via the File Uploads view to automatically start the end-to-end Kafka pipeline.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log: any, idx: number) => (
            <KafkaLogRow key={log?.event_id || log?.id || idx} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}
