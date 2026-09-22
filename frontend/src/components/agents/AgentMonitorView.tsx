"use client";

import { useQuery } from "@tanstack/react-query";
import { agent2Api, agent3Api, agent4Api, ocrApi, procurementApi } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Bot, ArrowRight, CheckCircle2, Activity, Loader2, WifiOff,
  Play, ChevronDown, ChevronUp, Package, Store, ShoppingCart,
  AlertTriangle, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useDataSourceStore } from "@/store/dataSourceStore";
import { INDUSTRIES } from "@/lib/api";

// ------------------------------------------------------------------ //
// Live agent card                                                       //
// ------------------------------------------------------------------ //
const agentDefs = [
  { id: 2, name: "Agent 2", role: "Inventory Intelligence Agent", color: "bg-blue-50 text-blue-600",
    listens: "ocr-request-topic", publishes: "inventory-evaluation-topic",
    fetchStatus: () => agent2Api.getStatus() },
  { id: 3, name: "Agent 3", role: "Vendor Intelligence Agent",    color: "bg-purple-50 text-purple-600",
    listens: "inventory-evaluation-topic", publishes: "vendor-recommendation-topic",
    fetchStatus: () => agent3Api.getStatus() },
  { id: 4, name: "Agent 4", role: "Procurement Agent",            color: "bg-orange-50 text-orange-600",
    listens: "vendor-recommendation-topic", publishes: "purchase-order-topic",
    fetchStatus: () => agent4Api.getStatus() },
];

function AgentStatusCard({ a }: { a: typeof agentDefs[0] }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: [`live-agent-${a.id}`], queryFn: a.fetchStatus,
    refetchInterval: 3000, retry: 1,
  });
  const isRunning = (data?.status === "running" || data?.status === "active" || data?.status === "ready") || (!isError && data && data.status !== "offline" && data.status !== "degraded");
  const isOffline = isError || data?.status === "offline";
  const cls = isRunning ? "badge-green" : isOffline ? "badge-red" : "badge-blue";
  const label = isRunning ? "Active" : isOffline ? "Offline" : "Connecting";

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", a.color)}>
        {isLoading ? <Loader2 size={14} className="animate-spin" /> :
         isError   ? <WifiOff size={14} /> : <Bot size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">{a.name}</span>
          <span className={cn("badge", cls)}>{label}</span>
        </div>
        <p className="text-xs text-slate-500 truncate">{data?.current_task ?? a.role}</p>
        {(data?.events_processed ?? 0) > 0 && (
          <p className="text-[11px] text-emerald-600">{data.events_processed} events processed</p>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Pipeline result viewer                                               //
// ------------------------------------------------------------------ //
function InventoryResult({ data }: { data: any }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-blue-100 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors">
        <div className="flex items-center gap-2">
          <Package size={15} className="text-blue-600" />
          <span className="text-sm font-semibold text-blue-800">Agent 2 — Inventory Evaluation</span>
          <span className={cn("badge", data.all_items_available ? "badge-green" : "badge-yellow")}>
            {data.shortage_items} shortage{data.shortage_items !== 1 ? "s" : ""}
          </span>
        </div>
        {open ? <ChevronUp size={14} className="text-blue-400" /> : <ChevronDown size={14} className="text-blue-400" />}
      </button>
      {open && (
        <div className="p-4 space-y-3 bg-white">
          <div className="grid grid-cols-4 gap-3 text-center">
            {[
              { l: "Total Items",    v: data.total_items },
              { l: "In Stock",       v: data.total_items - data.shortage_items, color: "text-emerald-600" },
              { l: "Shortage Items", v: data.shortage_items,                    color: "text-red-500" },
              { l: "Shortage Cost",  v: formatCurrency(data.total_shortage_cost) },
            ].map(c => (
              <div key={c.l} className="p-3 bg-slate-50 rounded-xl">
                <p className={cn("text-lg font-bold", c.color ?? "text-slate-800")}>{c.v}</p>
                <p className="text-[11px] text-slate-400">{c.l}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {data.items?.map((item: any, i: number) => (
              <div key={i} className={cn(
                "flex items-center justify-between px-3 py-2 rounded-lg text-xs",
                item.has_shortage ? "bg-red-50 border border-red-100" : "bg-emerald-50 border border-emerald-100"
              )}>
                <div className="flex items-center gap-2">
                  {item.has_shortage
                    ? <AlertTriangle size={11} className="text-red-500 shrink-0" />
                    : <CheckCircle2  size={11} className="text-emerald-500 shrink-0" />}
                  <span className="font-medium text-slate-700">{item.item_description}</span>
                  <span className="badge badge-slate">{item.industry}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500">
                  <span>Need: {item.requested_quantity}</span>
                  <span>Stock: {item.stock_quantity}</span>
                  {item.has_shortage && <span className="text-red-600 font-semibold">Short: {item.shortage_quantity}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VendorResult({ data }: { data: any }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-purple-100 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 hover:bg-purple-100 transition-colors">
        <div className="flex items-center gap-2">
          <Store size={15} className="text-purple-600" />
          <span className="text-sm font-semibold text-purple-800">Agent 3 — Vendor Recommendations</span>
          <span className="badge badge-purple">{data.vendors_found} vendors selected</span>
        </div>
        {open ? <ChevronUp size={14} className="text-purple-400" /> : <ChevronDown size={14} className="text-purple-400" />}
      </button>
      {open && (
        <div className="p-4 space-y-3 bg-white">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { l: "Items Evaluated",  v: data.total_shortage_items },
              { l: "Vendors Found",    v: data.vendors_found,    color: "text-purple-600" },
              { l: "No Vendor Found",  v: data.no_vendor_items,  color: data.no_vendor_items > 0 ? "text-red-500" : "text-slate-400" },
            ].map(c => (
              <div key={c.l} className="p-3 bg-slate-50 rounded-xl">
                <p className={cn("text-lg font-bold", c.color ?? "text-slate-800")}>{c.v}</p>
                <p className="text-[11px] text-slate-400">{c.l}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {data.recommendations?.map((rec: any, i: number) => (
              <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-800">{rec.item_description}</span>
                  <span className={cn("badge", rec.best_vendor ? "badge-green" : "badge-red")}>
                    {rec.recommendation?.replace("_", " ")}
                  </span>
                </div>
                {rec.best_vendor ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600">
                    <div><span className="text-slate-400">Vendor</span><p className="font-semibold">{rec.best_vendor.vendor_name}</p></div>
                    <div><span className="text-slate-400">Price</span><p className="font-semibold">{formatCurrency(rec.best_vendor.unit_price)}/unit</p></div>
                    <div><span className="text-slate-400">Lead Time</span><p className="font-semibold">{rec.best_vendor.lead_time_days} days</p></div>
                    <div><span className="text-slate-400">Score</span><p className="font-semibold text-purple-600">{(rec.best_vendor.score * 100).toFixed(0)}%</p></div>
                  </div>
                ) : (
                  <p className="text-xs text-red-500">{rec.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function POResult({ requestId }: { requestId: number }) {
  const [open, setOpen] = useState(true);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["po-for-request", requestId],
    queryFn:  () => procurementApi.getPOs({ request_id: requestId, limit: 20 }),
    refetchInterval: 4000,
  });
  const pos = data?.purchase_orders ?? [];

  return (
    <div className="border border-orange-100 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-orange-50 hover:bg-orange-100 transition-colors">
        <div className="flex items-center gap-2">
          <ShoppingCart size={15} className="text-orange-600" />
          <span className="text-sm font-semibold text-orange-800">Agent 4 — Purchase Orders</span>
          {isLoading
            ? <Loader2 size={12} className="animate-spin text-orange-400" />
            : <span className="badge badge-yellow">{pos.length} POs created</span>}
        </div>
        {open ? <ChevronUp size={14} className="text-orange-400" /> : <ChevronDown size={14} className="text-orange-400" />}
      </button>
      {open && (
        <div className="p-4 bg-white">
          {pos.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">
              No POs yet for this request. Agent 4 is processing via Kafka — check back in a few seconds.
            </p>
          ) : (
            <div className="space-y-2">
              {pos.map((po: any) => (
                <div key={po.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                  <div>
                    <p className="font-mono font-semibold text-slate-700">{po.po_number}</p>
                    <p className="text-slate-500 mt-0.5">{po.item_name} · {po.vendor_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-800">{formatCurrency(po.total_price)}</p>
                    <p className="text-slate-400">Delivery: {po.delivery_date_expected}</p>
                  </div>
                  <span className={cn("badge ml-3",
                    po.status === "PENDING_APPROVAL" ? "badge-yellow" :
                    po.status === "APPROVED"         ? "badge-green"  : "badge-slate")}>
                    {po.status?.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Main view                                                            //
// ------------------------------------------------------------------ //
export function AgentMonitorView() {
  const [selectedReqId, setSelectedReqId] = useState(1);
  const [running, setRunning]             = useState(false);
  const [step, setStep]                   = useState<"idle"|"a2"|"a3"|"done">("idle");
  const [a2Result, setA2Result]           = useState<any>(null);
  const [a3Result, setA3Result]           = useState<any>(null);

  const { sources } = useDataSourceStore();
  const connectedIndustries = INDUSTRIES.filter(ind =>
    sources.some(s => s.industry === ind && s.status === "connected")
  );
  const hasConnections = connectedIndustries.length > 0;

  const { data: ocrData } = useQuery({
    queryKey: ["ocr-procurement-requests"],
    queryFn: ocrApi.getProcurementRequests
  });
  const requests = Array.isArray(ocrData) ? ocrData : (ocrData?.requests ?? []);

  useEffect(() => {
    if (requests.length > 0 && !requests.some((r: any) => r.id === selectedReqId)) {
      setSelectedReqId(requests[0].id);
    }
  }, [requests, selectedReqId]);

  const run = async () => {
    if (!hasConnections) {
      toast.error("No databases connected. Connect at least one industry in Data Sources first.");
      return;
    }

    setRunning(true);
    setStep("idle");
    setA2Result(null);
    setA3Result(null);

    try {
      // --- Agent 2: Inventory evaluation ---
      setStep("a2");
      toast.info("Agent 2 evaluating inventory...");
      const eval2 = await agent2Api.evaluate(selectedReqId);
      setA2Result(eval2);
      toast.success(`Agent 2 done — ${eval2.shortage_items} shortage item(s) found`);

      if (eval2.all_items_available) {
        toast.success("All items in stock. No vendor action needed.");
        setStep("done");
        setRunning(false);
        return;
      }

      // --- Agent 3: Vendor recommendation ---
      setStep("a3");
      toast.info("Agent 3 finding best vendors...");
      const eval3 = await agent3Api.recommend(eval2);
      setA3Result(eval3);
      toast.success(`Agent 3 done — ${eval3.vendors_found} vendor(s) selected`);

      // --- Agent 4: Create POs ---
      toast.info("Agent 4 creating purchase orders...");
      const eval4 = await agent4Api.process(eval3);
      toast.success(`Agent 4 done — ${eval4.pos_created} purchase order(s) created!`);

      setStep("done");
    } catch (e: any) {
      toast.error(`Pipeline error: ${e?.response?.data?.detail ?? e.message}`);
      setStep("done");
    }
    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Agent Monitor</h1>
        <p className="text-sm text-slate-500 mt-0.5">Run the full pipeline and see every step in real time</p>
      </div>

      {/* Live agent status */}
      <div className="section-card p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Live Agent Status</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {agentDefs.map(a => <AgentStatusCard key={a.id} a={a} />)}
        </div>
      </div>

      {/* Pipeline trigger */}
      <div className="section-card p-5">
        <p className="text-sm font-semibold text-slate-800 mb-1">Run Full Pipeline</p>
        <p className="text-xs text-slate-400 mb-4">
          Select a procurement request → Agent 2 checks inventory → Agent 3 finds vendors → Agent 4 creates POs
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={selectedReqId} onChange={e => setSelectedReqId(Number(e.target.value))}
            className="form-input w-auto" disabled={running}>
            {requests.length === 0
              ? <option value={1}>Request #1</option>
              : requests.map((r: any) => (
                <option key={r.id} value={r.id}>
                  Request #{r.id} — {r.requester_name} ({formatCurrency(r.total_estimated_cost)})
                </option>
              ))}
          </select>
          <button onClick={run} disabled={running || !hasConnections} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
            {running
              ? <><Loader2 size={14} className="animate-spin" /> Running...</>
              : <><Play size={14} /> Run Agents 2 → 3 → 4</>}
          </button>
        </div>

        {!hasConnections && (
          <div className="mt-3 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertTriangle size={14} className="shrink-0" />
            No databases connected. Go to{" "}
            <a href="/data-sources" className="underline font-semibold hover:text-red-900">Data Sources</a>
            {" "}and connect at least one industry first.
          </div>
        )}

        {/* Step progress indicator */}
        {step !== "idle" && (
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            {[
              { id: "a2", label: "Agent 2: Inventory", done: a2Result },
              { id: "a3", label: "Agent 3: Vendors",   done: a3Result },
              { id: "done", label: "Agent 4: POs",     done: step === "done" },
            ].map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                  s.done ? "bg-emerald-500 text-white" :
                  step === s.id ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-400")}>
                  {s.done ? <CheckCircle2 size={12} /> : i + 1}
                </div>
                <span className={cn("text-xs font-medium",
                  s.done ? "text-emerald-600" :
                  step === s.id ? "text-brand-600" : "text-slate-400")}>
                  {s.label}
                  {step === s.id && !s.done && <Loader2 size={10} className="inline ml-1 animate-spin" />}
                </span>
                {i < 2 && <ArrowRight size={12} className="text-slate-300" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results — show as they come in */}
      {a2Result && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">
            Pipeline Results — Request #{selectedReqId}
          </h2>
          <InventoryResult data={a2Result} />
          {a3Result && <VendorResult data={a3Result} />}
          {step === "done" && <POResult requestId={selectedReqId} />}
        </div>
      )}

      {/* Architecture note */}
      <div className="bg-slate-900 rounded-xl p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Core Architecture Principle</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            "Agents NEVER access databases directly",
            "Agents ONLY communicate via APIs",
            "All results visible in real time",
          ].map(p => (
            <div key={p} className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
              <span className="text-sm text-slate-300">{p}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
