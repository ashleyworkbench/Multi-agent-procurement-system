"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { kafkaApi } from "@/lib/api";
import { cn, formatTime, formatDate, formatDateTime } from "@/lib/utils";
import Link from "next/link";
import {
  Radio, RefreshCw, ChevronDown, ChevronUp, Copy, Check,
  ExternalLink, Search, Sparkles, FolderDown, Bot, Package,
  Store, ShoppingCart, CheckCircle2, ShieldCheck, HardDrive, FileSignature
} from "lucide-react";
import { toast } from "sonner";

// ------------------------------------------------------------------ #
// Topic and Event Configuration                                       #
// ------------------------------------------------------------------ #
const topicMeta: Record<string, { label: string; stage: string; color: string; badge: string; icon: React.ElementType }> = {
  "invoice-topic": {
    label: "invoice-topic",
    stage: "1. Folder Drop / Ingestion",
    color: "border-sky-200 bg-sky-50/70 text-sky-700",
    badge: "bg-sky-100 text-sky-800 border-sky-300",
    icon: FolderDown,
  },
  "ocr-request-topic": {
    label: "ocr-request-topic",
    stage: "2. OCR & Extraction",
    color: "border-indigo-200 bg-indigo-50/70 text-indigo-700",
    badge: "bg-indigo-100 text-indigo-800 border-indigo-300",
    icon: Bot,
  },
  "inventory-evaluation-topic": {
    label: "inventory-evaluation-topic",
    stage: "3. Inventory Evaluation",
    color: "border-blue-200 bg-blue-50/70 text-blue-700",
    badge: "bg-blue-100 text-blue-800 border-blue-300",
    icon: Package,
  },
  "vendor-recommendation-topic": {
    label: "vendor-recommendation-topic",
    stage: "4. Vendor Selection",
    color: "border-purple-200 bg-purple-50/70 text-purple-700",
    badge: "bg-purple-100 text-purple-800 border-purple-300",
    icon: Store,
  },
  "purchase-order-topic": {
    label: "purchase-order-topic",
    stage: "5. PO Generation & DocuSign",
    color: "border-emerald-200 bg-emerald-50/70 text-emerald-700",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
    icon: ShoppingCart,
  },
};

const agentColor: Record<string, { bg: string; text: string; label: string }> = {
  agent_1: { bg: "bg-sky-100", text: "text-sky-800", label: "Agent 1 (OCR/LLM)" },
  agent_2: { bg: "bg-blue-100", text: "text-blue-800", label: "Agent 2 (Inventory)" },
  agent_3: { bg: "bg-purple-100", text: "text-purple-800", label: "Agent 3 (Vendor)" },
  agent_4: { bg: "bg-amber-100", text: "text-amber-800", label: "Agent 4 (Procurement)" },
  approval_subsystem: { bg: "bg-emerald-100", text: "text-emerald-800", label: "DocuSign Engine" },
};

function formatEventSummary(log: any, payload: any): string {
  if (log?.event_type === "INVOICE_QUEUED") {
    return `Folder ingestion: Document '${payload?.filename || "invoice"}' queued for processing`;
  }
  if (log?.event_type === "OCR_REQUEST_CREATED") {
    return `OCR extraction completed: Emitted Request #${payload?.request_id || payload?.processing_id || ""} for inventory evaluation`;
  }
  if (log?.event_type === "INVENTORY_EVALUATED") {
    const shortages = payload?.shortage_items ?? (payload?.shortages ? payload.shortages.length : 0);
    return `Inventory evaluated: ${shortages} shortage item(s) detected for Request #${payload?.request_id || ""}`;
  }
  if (log?.event_type === "VENDOR_RECOMMENDED") {
    return `Vendor Intelligence: Best matches ranked for Request #${payload?.request_id || ""}`;
  }
  if (log?.event_type === "PURCHASE_ORDER_CREATED") {
    return `PO created: ${payload?.pos_created || 1} purchase order(s) generated & dispatched for approval`;
  }
  if (log?.event_type === "APPROVAL_GRANTED") {
    return `DocuSign completed: PO #${payload?.po_number || ""} digitally signed & archived in MinIO`;
  }
  return payload?.message || log?.event_type || "Kafka Event";
}

// ------------------------------------------------------------------ #
// Single Kafka Log Row Component                                      #
// ------------------------------------------------------------------ #
function KafkaRow({ log }: { log: any }) {
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

  const topicInfo = topicMeta[log?.topic] ?? {
    label: log?.topic || "kafka-topic",
    stage: "Broker Event",
    color: "border-slate-200 bg-slate-50 text-slate-700",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    icon: Radio,
  };
  const TopicIcon = topicInfo.icon;
  const agentInfo = agentColor[log?.source_agent] ?? {
    bg: "bg-slate-100",
    text: "text-slate-700",
    label: log?.source_agent || "Agent",
  };

  const copyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    toast.success("Payload copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white hover:border-slate-300 transition-colors shadow-xs">
      <div
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50/70 transition-colors cursor-pointer select-none"
      >
        {/* Pulsing indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border", topicInfo.badge)}>
            <TopicIcon size={13} />
          </div>
        </div>

        {/* Topic Badge */}
        <div className="shrink-0 hidden sm:block">
          <span className={cn("text-[10px] font-mono font-medium px-2 py-0.5 rounded-md border", topicInfo.badge)}>
            {log?.topic || "internal"}
          </span>
        </div>

        {/* Event Type / Summary */}
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-800">
              {log?.event_type?.replace(/_/g, " ")}
            </span>
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", agentInfo.bg, agentInfo.text)}>
              {agentInfo.label}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">
            {formatEventSummary(log, payload)}
          </p>
        </div>

        {/* Timestamp */}
        <div className="shrink-0 text-right">
          <span className="text-[11px] font-mono text-slate-700 font-semibold block">
            {formatTime(log?.created_at)}
          </span>
          <span className="text-[9px] text-slate-400 hidden md:inline">
            {formatDate(log?.created_at)}
          </span>
        </div>

        {/* Expand toggle */}
        <div className="text-slate-400 shrink-0 ml-1">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 text-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
              <span>Event ID: <b className="text-slate-700 font-bold">{log?.event_id || "N/A"}</b></span>
              <span>•</span>
              <span>Topic: <b className="text-slate-700">{log?.topic}</b></span>
              <span>•</span>
              <span>Source: <b className="text-slate-700">{log?.source_agent}</b></span>
            </div>
            <button
              onClick={copyPayload}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2 py-1 rounded-md transition-colors"
            >
              {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
              {copied ? "Copied" : "Copy JSON"}
            </button>
          </div>
          <pre className="text-[11px] font-mono text-slate-700 bg-white border border-slate-200/90 rounded-lg p-3 overflow-x-auto max-h-48 leading-relaxed">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ #
// Main Kafka Logs Panel for Control Panel                              #
// ------------------------------------------------------------------ #
export function KafkaLogsPanel() {
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["kafka-panel-logs", topicFilter],
    queryFn: () => kafkaApi.getLogs({
      topic: topicFilter !== "all" ? topicFilter : undefined,
      limit: 15,
    }),
    refetchInterval: 3000, // Poll every 3 seconds for live streaming
  });

  const logs: any[] = data?.logs ?? [];

  const filteredLogs = logs.filter((log: any) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const payloadStr = typeof log?.payload === "string" ? log.payload : JSON.stringify(log?.payload || {});
    return (
      log?.event_type?.toLowerCase().includes(term) ||
      log?.topic?.toLowerCase().includes(term) ||
      log?.source_agent?.toLowerCase().includes(term) ||
      payloadStr.toLowerCase().includes(term)
    );
  });

  const topicsList = [
    { id: "all", label: "All Topics" },
    { id: "invoice-topic", label: "invoice-topic" },
    { id: "ocr-request-topic", label: "ocr-request-topic" },
    { id: "inventory-evaluation-topic", label: "inventory-evaluation-topic" },
    { id: "vendor-recommendation-topic", label: "vendor-recommendation-topic" },
    { id: "purchase-order-topic", label: "purchase-order-topic" },
  ];

  return (
    <div className="section-card p-5 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <Radio size={16} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Kafka Event Stream & Automation Pipeline
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Live (kafka:9092)
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time message broker logs from folder ingestion to DocuSign email dispatch
              </p>
            </div>
          </div>
        </div>

        {/* Live Architecture Status Indicators */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600">
            <FolderDown size={12} className="text-sky-600" />
            <span>Folder: <b>/invoices</b></span>
            <CheckCircle2 size={11} className="text-emerald-500 ml-0.5" />
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600">
            <HardDrive size={12} className="text-indigo-600" />
            <span>MinIO: <b>Storage</b></span>
            <CheckCircle2 size={11} className="text-emerald-500 ml-0.5" />
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600">
            <FileSignature size={12} className="text-emerald-600" />
            <span>DocuSign: <b>Ready</b></span>
            <CheckCircle2 size={11} className="text-emerald-500 ml-0.5" />
          </div>

          <button
            onClick={() => refetch()}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            title="Refresh Kafka Logs"
          >
            <RefreshCw size={13} className={cn(isFetching && "animate-spin text-brand-600")} />
          </button>

          <Link
            href="/kafka-logs"
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1 font-semibold"
          >
            Full Kafka Console <ExternalLink size={12} />
          </Link>
        </div>
      </div>

      {/* Visual Pipeline Flow Stepper */}
      <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3">
        <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-2">
          End-to-End Automated Kafka Flow:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { step: "1", title: "Folder Drop", desc: "/invoices folder", icon: FolderDown, color: "text-sky-600 border-sky-200 bg-sky-50" },
            { step: "2", title: "invoice-topic", desc: "Agent 1 MinIO", icon: Radio, color: "text-indigo-600 border-indigo-200 bg-indigo-50" },
            { step: "3", title: "ocr-request-topic", desc: "OCR Extraction", icon: Bot, color: "text-blue-600 border-blue-200 bg-blue-50" },
            { step: "4", title: "inventory-topic", desc: "Agent 2 Check", icon: Package, color: "text-purple-600 border-purple-200 bg-purple-50" },
            { step: "5", title: "vendor-topic", desc: "Agent 3 Scoring", icon: Store, color: "text-amber-600 border-amber-200 bg-amber-50" },
            { step: "6", title: "PO & DocuSign", desc: "Agent 4 Email", icon: ShoppingCart, color: "text-emerald-600 border-emerald-200 bg-emerald-50" },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className={cn(
                  "p-2 rounded-lg border flex flex-col justify-between transition-all",
                  item.color
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-bold opacity-70">STEP {item.step}</span>
                  <Icon size={12} />
                </div>
                <div>
                  <p className="text-xs font-bold leading-tight truncate">{item.title}</p>
                  <p className="text-[10px] opacity-80 truncate">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {topicsList.map(t => (
            <button
              key={t.id}
              onClick={() => setTopicFilter(t.id)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border",
                topicFilter === t.id
                  ? "bg-brand-50 border-brand-300 text-brand-700 font-semibold"
                  : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search payload or event..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Log Stream List */}
      <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <RefreshCw size={18} className="animate-spin text-brand-500 mx-auto mb-2" />
            Connecting to Kafka topic stream...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-10 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <Radio size={24} className="text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-600">No Kafka logs matching filter</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Drop an invoice in the <code className="text-slate-600 bg-slate-100 px-1 py-0.5 rounded">/invoices</code> folder to trigger the real-time stream.
            </p>
          </div>
        ) : (
          filteredLogs.map((log: any, idx: number) => (
            <KafkaRow key={log?.event_id || log?.id || idx} log={log} />
          ))
        )}
      </div>

      {/* Footer info banner */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
        <span>Showing latest {filteredLogs.length} events • Real-time stream polled every 3s</span>
        <Link href="/kafka-logs" className="text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1">
          Open dedicated Kafka Logs view →
        </Link>
      </div>
    </div>
  );
}
