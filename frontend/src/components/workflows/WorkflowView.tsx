"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ocrApi, agent2Api, agent3Api, procurementApi } from "@/lib/api";
import { formatCurrency, cn } from "@/lib/utils";
import {
  GitFork, FileText, Package, Store, ShoppingCart,
  CheckCircle2, Clock, Loader2, AlertTriangle, ChevronDown, ChevronUp,
  RefreshCw, Play, ArrowRight, ShieldAlert, Sparkles, Building2, User
} from "lucide-react";
import { toast } from "sonner";

export function WorkflowView() {
  const [selectedReqId, setSelectedReqId] = useState<number>(1);
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({
    stage1: true,
    stage2: true,
    stage3: true,
    stage4: true,
  });

  const toggleStage = (stage: string) => {
    setExpandedStages(prev => ({ ...prev, [stage]: !prev[stage] }));
  };

  // Queries
  const { data: ocrData, isLoading: reqLoading, refetch: refetchRequests } = useQuery({
    queryKey: ["ocr-requests"],
    queryFn: ocrApi.getRequests,
    refetchInterval: 10000,
  });

  const requests = ocrData?.requests ?? [];
  const selectedReq = requests.find((r: any) => r.id === selectedReqId) || requests[0];

  const currentReqId = selectedReq?.id ?? selectedReqId;

  const { data: reqItems } = useQuery({
    queryKey: ["request-items", currentReqId],
    queryFn: () => ocrApi.getRequestItems(currentReqId),
    enabled: !!currentReqId,
  });

  const { data: a2Status } = useQuery({
    queryKey: ["agent2-status"],
    queryFn: agent2Api.getStatus,
    refetchInterval: 3000,
  });

  const { data: a3Status } = useQuery({
    queryKey: ["agent3-status"],
    queryFn: agent3Api.getStatus,
    refetchInterval: 3000,
  });

  const { data: a4Status } = useQuery({
    queryKey: ["agent4-status"],
    queryFn: procurementApi.getSummary,
    refetchInterval: 3000,
  });

  // Cached results for this request
  const { data: invResult, refetch: refetchInv } = useQuery({
    queryKey: ["inv-result", currentReqId],
    queryFn: () => agent2Api.getResult(currentReqId),
    retry: 0,
    refetchInterval: 3000,
  });

  const { data: vendorResult, refetch: refetchVendor } = useQuery({
    queryKey: ["vendor-result", currentReqId],
    queryFn: () => agent3Api.getResult(currentReqId),
    retry: 0,
    refetchInterval: 3000,
  });

  const { data: poResult, refetch: refetchPOs } = useQuery({
    queryKey: ["po-result", currentReqId],
    queryFn: () => procurementApi.getPOs({ request_id: currentReqId }),
    retry: 0,
    refetchInterval: 3000,
  });

  const [triggering, setTriggering] = useState(false);

  const triggerPipeline = async () => {
    if (!currentReqId) return;
    setTriggering(true);
    try {
      toast.info(`Triggering workflow pipeline for Request #${currentReqId}...`);
      await agent2Api.trigger(currentReqId);
      toast.success("Event dispatched to Kafka! Watching stages update...");
      setTimeout(() => {
        refetchInv();
        refetchVendor();
        refetchPOs();
      }, 1500);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err.message || "Failed to trigger pipeline");
    } finally {
      setTriggering(false);
    }
  };

  // Determine stage statuses
  const stage1Status = selectedReq ? "completed" : "pending";

  const isAgent2Active = a2Status?.current_task?.includes(`#${currentReqId}`);
  const stage2Status = invResult
    ? "completed"
    : isAgent2Active
    ? "processing"
    : "pending";

  const posList = poResult?.purchase_orders ?? [];

  const isAgent3Active = a3Status?.current_task?.includes(`#${currentReqId}`);
  const stage3Status = vendorResult
    ? "completed"
    : isAgent3Active
    ? "processing"
    : invResult?.all_items_available
    ? "skipped"
    : (invResult && !invResult.all_items_available && posList.length > 0)
    ? "completed"
    : "pending";

  const stage4Status = posList.length > 0
    ? "completed"
    : vendorResult
    ? (posList.length === 0 ? "completed" : "processing")
    : "pending";

  const stages = [
    {
      id: "stage1",
      name: "Document Intelligence",
      agent: "Agent 1: OCR + LLM",
      icon: FileText,
      color: "border-slate-300 text-slate-700 bg-slate-50",
      activeColor: "border-slate-500 text-slate-800 bg-slate-100",
      status: stage1Status,
      topic: "ocr-request-topic",
    },
    {
      id: "stage2",
      name: "Inventory Evaluation",
      agent: "Agent 2: Inventory Intelligence",
      icon: Package,
      color: "border-blue-200 text-blue-700 bg-blue-50",
      activeColor: "border-blue-500 text-blue-800 bg-blue-100",
      status: stage2Status,
      topic: "inventory-evaluation-topic",
    },
    {
      id: "stage3",
      name: "Vendor Intelligence",
      agent: "Agent 3: Multi-Criteria Selection",
      icon: Store,
      color: "border-purple-200 text-purple-700 bg-purple-50",
      activeColor: "border-purple-500 text-purple-800 bg-purple-100",
      status: stage3Status,
      topic: "vendor-recommendation-topic",
    },
    {
      id: "stage4",
      name: "Procurement Execution",
      agent: "Agent 4: PO & Audit Generator",
      icon: ShoppingCart,
      color: "border-orange-200 text-orange-700 bg-orange-50",
      activeColor: "border-orange-500 text-orange-800 bg-orange-100",
      status: stage4Status,
      topic: "purchase-order-topic",
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Workflow Tracker</h1>
            <span className="badge badge-purple flex items-center gap-1">
              <Sparkles size={12} /> Real-Time Kafka Stream
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Track end-to-end automated procurement requests across all 4 autonomous AI agents
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              refetchRequests();
              refetchInv();
              refetchVendor();
              refetchPOs();
            }}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw size={14} /> Refresh
          </button>

          <button
            onClick={triggerPipeline}
            disabled={triggering || !currentReqId}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {triggering ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Dispathing...
              </>
            ) : (
              <>
                <Play size={14} /> Run Pipeline
              </>
            )}
          </button>
        </div>
      </div>

      {/* Request Selector Carousel / Bar */}
      <div className="section-card p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Select Procurement Request
        </p>
        {reqLoading ? (
          <div className="flex items-center justify-center p-6 text-slate-400">
            <Loader2 className="animate-spin mr-2" size={16} /> Loading requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">
            No procurement requests found. Upload an invoice in Requests tab to start.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {requests.map((r: any) => {
              const isSelected = r.id === currentReqId;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedReqId(r.id)}
                  className={cn(
                    "p-3 rounded-xl text-left border transition-all flex flex-col justify-between",
                    isSelected
                      ? "border-brand-500 bg-brand-50/50 shadow-sm ring-1 ring-brand-500"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-brand-700">
                      Req #{r.id}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-600">
                      {formatCurrency(r.total_estimated_cost)}
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-medium text-slate-800 truncate">
                    {r.requester_name || "Enterprise Requisition"}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {r.created_at ? new Date(r.created_at).toLocaleTimeString() : "Recent"}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Progress Timeline Stepper */}
      <div className="section-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Pipeline Flow — Request #{currentReqId}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live progression through Kafka event bus topics
            </p>
          </div>
          {selectedReq && (
            <div className="text-right">
              <span className="text-xs text-slate-500 font-medium">Estimated Value</span>
              <p className="text-base font-bold text-slate-900">
                {formatCurrency(selectedReq.total_estimated_cost)}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
          {stages.map((st, idx) => {
            const Icon = st.icon;
            const isDone = st.status === "completed";
            const isRunning = st.status === "processing";
            const isSkipped = st.status === "skipped";

            return (
              <div
                key={st.id}
                className={cn(
                  "p-4 rounded-xl border relative transition-all",
                  isRunning
                    ? "border-amber-400 bg-amber-50/60 shadow-md ring-2 ring-amber-400 animate-pulse"
                    : isDone
                    ? "border-emerald-200 bg-emerald-50/40"
                    : isSkipped
                    ? "border-slate-200 bg-slate-50 opacity-70"
                    : "border-slate-200 bg-slate-50/50"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    Stage {idx + 1}
                  </span>
                  {isDone && (
                    <span className="badge badge-green flex items-center gap-1 text-[10px]">
                      <CheckCircle2 size={10} /> Completed
                    </span>
                  )}
                  {isRunning && (
                    <span className="badge badge-yellow flex items-center gap-1 text-[10px]">
                      <Loader2 size={10} className="animate-spin" /> Processing
                    </span>
                  )}
                  {isSkipped && (
                    <span className="badge badge-slate text-[10px]">In Stock</span>
                  )}
                  {st.status === "pending" && (
                    <span className="badge badge-slate flex items-center gap-1 text-[10px]">
                      <Clock size={10} /> Waiting
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2.5 mt-2">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      isDone
                        ? "bg-emerald-100 text-emerald-700"
                        : isRunning
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-200 text-slate-600"
                    )}
                  >
                    <Icon size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800">{st.name}</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">{st.agent}</p>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                  <span className="font-mono truncate">{st.topic}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage Details Breakdown */}
      <div className="space-y-4">
        {/* Stage 1 Breakdown */}
        <div className="section-card overflow-hidden">
          <button
            onClick={() => toggleStage("stage1")}
            className="w-full flex items-center justify-between p-4 bg-slate-50/80 hover:bg-slate-100 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center">
                <FileText size={16} />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-800">
                  Stage 1: Document OCR & Line Item Extraction
                </span>
                <p className="text-xs text-slate-500">
                  Document processed by Agent 1 (OCR + LLM) into structured line items
                </p>
              </div>
            </div>
            {expandedStages.stage1 ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expandedStages.stage1 && (
            <div className="p-5 border-t border-slate-100 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-[11px] text-slate-400">Request ID</span>
                  <p className="text-base font-bold text-slate-800">#{currentReqId}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-[11px] text-slate-400">Requester</span>
                  <p className="text-base font-bold text-slate-800">
                    {selectedReq?.requester_name || "Enterprise User"}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-[11px] text-slate-400">Total Items</span>
                  <p className="text-base font-bold text-slate-800">
                    {reqItems?.items?.length ?? 0}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl">
                  <span className="text-[11px] text-slate-400">Estimated Total</span>
                  <p className="text-base font-bold text-brand-600">
                    {formatCurrency(selectedReq?.total_estimated_cost)}
                  </p>
                </div>
              </div>

              {reqItems?.items && reqItems.items.length > 0 && (
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Item Description</th>
                        <th className="p-3 text-right">Quantity</th>
                        <th className="p-3 text-right">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reqItems.items.map((it: any, idx: number) => (
                        <tr key={it.id || idx} className="hover:bg-slate-50/60">
                          <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-3 font-medium text-slate-800">{it.description}</td>
                          <td className="p-3 text-right text-slate-600 font-semibold">
                            {it.quantity}
                          </td>
                          <td className="p-3 text-right text-slate-800 font-bold">
                            {formatCurrency(it.estimated_cost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stage 2 Breakdown */}
        <div className="section-card overflow-hidden">
          <button
            onClick={() => toggleStage("stage2")}
            className="w-full flex items-center justify-between p-4 bg-blue-50/60 hover:bg-blue-100/60 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <Package size={16} />
              </div>
              <div>
                <span className="text-sm font-bold text-blue-900">
                  Stage 2: Inventory Shortage Evaluation
                </span>
                <p className="text-xs text-blue-600">
                  Agent 2 queried industry databases via Gateway and evaluated stock availability
                </p>
              </div>
            </div>
            {expandedStages.stage2 ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expandedStages.stage2 && (
            <div className="p-5 border-t border-blue-100 space-y-4">
              {!invResult ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  No evaluation available yet for this request. Run the pipeline to evaluate.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-[11px] text-slate-400">Total Items</span>
                      <p className="text-base font-bold text-slate-800">{invResult.total_items}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-[11px] text-slate-400">In Stock</span>
                      <p className="text-base font-bold text-emerald-600">
                        {invResult.total_items - invResult.shortage_items}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-[11px] text-slate-400">Shortages</span>
                      <p className="text-base font-bold text-red-600">
                        {invResult.shortage_items}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-[11px] text-slate-400">Shortage Cost</span>
                      <p className="text-base font-bold text-amber-600">
                        {formatCurrency(invResult.total_shortage_cost)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {invResult.items?.map((item: any, i: number) => (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border text-xs",
                          item.has_shortage
                            ? "bg-red-50/50 border-red-200 text-red-900"
                            : "bg-emerald-50/50 border-emerald-200 text-emerald-900"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {item.has_shortage ? (
                            <AlertTriangle size={14} className="text-red-600" />
                          ) : (
                            <CheckCircle2 size={14} className="text-emerald-600" />
                          )}
                          <span className="font-semibold">{item.item_description}</span>
                          <span className="badge badge-slate text-[10px]">{item.industry}</span>
                        </div>
                        <div className="flex items-center gap-4 text-slate-600 font-mono">
                          <span>Requested: {item.requested_quantity}</span>
                          <span>Stock: {item.stock_quantity}</span>
                          {item.has_shortage && (
                            <span className="text-red-700 font-bold">
                              Deficit: {item.shortage_quantity}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Stage 3 Breakdown */}
        <div className="section-card overflow-hidden">
          <button
            onClick={() => toggleStage("stage3")}
            className="w-full flex items-center justify-between p-4 bg-purple-50/60 hover:bg-purple-100/60 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                <Store size={16} />
              </div>
              <div>
                <span className="text-sm font-bold text-purple-900">
                  Stage 3: Vendor Selection & Multi-Criteria Scoring
                </span>
                <p className="text-xs text-purple-600">
                  Agent 3 scored suppliers based on pricing, lead time, and reliability rating
                </p>
              </div>
            </div>
            {expandedStages.stage3 ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expandedStages.stage3 && (
            <div className="p-5 border-t border-purple-100 space-y-4">
              {!vendorResult ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  {invResult?.all_items_available
                    ? "All items were available in stock. No vendor selection required."
                    : "No vendor recommendations generated yet."}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-[11px] text-slate-400">Shortage Items</span>
                      <p className="text-base font-bold text-slate-800">
                        {vendorResult.total_shortage_items}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-[11px] text-slate-400">Vendors Matched</span>
                      <p className="text-base font-bold text-purple-600">
                        {vendorResult.vendors_found}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-[11px] text-slate-400">Unmatched Items</span>
                      <p className="text-base font-bold text-slate-500">
                        {vendorResult.no_vendor_items}
                      </p>
                    </div>
                  </div>

                  {vendorResult.recommendations?.map((rec: any, i: number) => {
                    const vendorName = rec.vendor_name || rec.best_vendor?.vendor_name || "Unknown Vendor";
                    const itemName = rec.item_name || rec.item_description || "Unknown Item";
                    const totalPrice = rec.total_price ?? rec.best_vendor?.total_cost ?? rec.shortage_cost ?? 0;
                    const qty = rec.quantity ?? rec.requested_quantity ?? 0;
                    const unitPrice = rec.unit_price ?? rec.best_vendor?.unit_price ?? 0;
                    const leadDays = rec.lead_time_days ?? rec.best_vendor?.lead_time_days ?? "N/A";
                    const score = rec.composite_score ?? rec.best_vendor?.score ?? rec.score;

                    return (
                      <div
                        key={i}
                        className="p-4 rounded-xl border border-purple-100 bg-white space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Building2 size={14} className="text-purple-600" />
                            <span className="font-bold text-slate-900">{vendorName}</span>
                            <span className="badge badge-purple">{itemName}</span>
                          </div>
                          <span className="text-sm font-bold text-emerald-600">
                            {formatCurrency(totalPrice)}
                          </span>
                        </div>
                        <div className="flex items-center gap-6 text-slate-500 pt-1">
                          <span>Quantity: {qty}</span>
                          <span>Unit Price: {formatCurrency(unitPrice)}</span>
                          <span>Lead Time: {leadDays} days</span>
                          <span>Score: {typeof score === "number" ? score.toFixed(2) : (score || "N/A")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stage 4 Breakdown */}
        <div className="section-card overflow-hidden">
          <button
            onClick={() => toggleStage("stage4")}
            className="w-full flex items-center justify-between p-4 bg-orange-50/60 hover:bg-orange-100/60 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
                <ShoppingCart size={16} />
              </div>
              <div>
                <span className="text-sm font-bold text-orange-900">
                  Stage 4: Purchase Orders & Audit Trail
                </span>
                <p className="text-xs text-orange-600">
                  Agent 4 committed purchase orders to procurement_db and generated compliance audit records
                </p>
              </div>
            </div>
            {expandedStages.stage4 ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expandedStages.stage4 && (
            <div className="p-5 border-t border-orange-100 space-y-4">
              {posList.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  No purchase orders created yet for this request.
                </div>
              ) : (
                <div className="space-y-3">
                  {posList.map((po: any) => (
                    <div
                      key={po.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 text-sm">
                            {po.po_number}
                          </span>
                          <span
                            className={cn(
                              "badge",
                              po.status === "APPROVED"
                                ? "badge-green"
                                : po.status === "PENDING_APPROVAL"
                                ? "badge-yellow"
                                : "badge-slate"
                            )}
                          >
                            {po.status?.replace("_", " ")}
                          </span>
                        </div>
                        <p className="text-slate-600 mt-1">
                          {po.item_name} · Vendor: <span className="font-semibold">{po.vendor_name}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="font-bold text-slate-900 text-sm">
                            {formatCurrency(po.total_price)}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Qty: {po.quantity} @ {formatCurrency(po.unit_price)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
