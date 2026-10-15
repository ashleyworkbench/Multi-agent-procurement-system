"use client";

import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { riskApi, INDUSTRIES, getStoredUser } from "@/lib/api";
import { cn, formatDateTime, formatDate } from "@/lib/utils";
import {
  ShieldAlert, RefreshCw, MessageSquarePlus,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
  Loader2, Activity, WifiOff, BarChart2, ClipboardList,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AgentRationaleCard } from "@/components/common/AgentRationaleCard";
import AdminFeedbackModal from "./AdminFeedbackModal";

// ------------------------------------------------------------------ //
// Types                                                                //
// ------------------------------------------------------------------ //


const RISK_COLORS: Record<string, string> = {
  Low:    "badge-green",
  Medium: "badge-yellow",
  High:   "badge-red",
};

const RISK_BG: Record<string, string> = {
  Low:    "bg-green-50 border-green-200",
  Medium: "bg-yellow-50 border-yellow-200",
  High:   "bg-red-50 border-red-200",
};

// ------------------------------------------------------------------ //
// Helpers                                                              //
// ------------------------------------------------------------------ //
function RiskBadge({ label }: { label: string | null }) {
  if (!label) return <span className="badge badge-slate">Unscored</span>;
  return <span className={cn("badge", RISK_COLORS[label] ?? "badge-slate")}>{label}</span>;
}

function PillarBar({ name, value }: { name: string; value: number }) {
  const color =
    value >= 70 ? "bg-green-500" : value >= 45 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-600">
        <span>{name}</span>
        <span className="font-medium">{value.toFixed(0)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div className={cn("h-1.5 rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Vendor row card                                                       //
// ------------------------------------------------------------------ //
// Main view                                                            //
// ------------------------------------------------------------------ //
export default function RiskAnalysisView() {
  const queryClient = useQueryClient();
  const [expandedHistory, setExpandedHistory] = useState<string | number | null>(null);
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string>(INDUSTRIES[0]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [feedbackVendor, setFeedbackVendor] = useState<{
    vendor_id?: string;
    vendor_name?: string;
    risk_level?: string | null;
    order_id?: string | null;
  } | null>(null);
  const [showFeedbackList, setShowFeedbackList] = useState(false);

  useEffect(() => {
    setIsAdmin(getStoredUser()?.role === "Admin");
  }, []);

  // ---- Queries ----
  const { data: status, isError: statusErr } = useQuery({
    queryKey: ["risk-status"],
    queryFn: () => riskApi.getStatus(),
    refetchInterval: 15_000,
    retry: 1,
  });

  const { data: feedbackData } = useQuery({
    queryKey: ["risk-feedback", companyId],
    queryFn: () => riskApi.getFeedback(companyId),
    refetchInterval: 15_000,
    retry: 1,
    enabled: !!companyId,
  });

  const { data: modelStatus } = useQuery({
    queryKey: ["risk-model-status", companyId],
    queryFn: () => riskApi.getModelStatus(companyId),
    refetchInterval: 60_000,
    retry: 1,
    enabled: !!companyId,
  });

  const { data: vendorHistoryConfig } = useQuery({
    queryKey: ["vendor-history-config", companyId],
    queryFn: () => riskApi.getVendorHistoryConfig(companyId),
    refetchInterval: 30_000,
    retry: 1,
    enabled: !!companyId,
  });

  const { data: procurementEvents, isLoading: historyLoading } = useQuery({
    queryKey: ["vendor-recommendation-history"],
    queryFn: () => riskApi.getEvents({ limit: 100 }),
    refetchInterval: 30_000,
    retry: 1,
  });

  // ---- Mutations ----
  const analyzeMut = useMutation({
    mutationFn: () => riskApi.analyzeRisk(companyId),
    onSuccess: () => {
      toast.success("Risk analysis complete — scores updated");
    },
    onError: () => toast.error("Analysis failed. Check if the agent is running."),
  });

  const testConnectionMut = useMutation({
    mutationFn: () =>
      riskApi.testVendorHistoryConnection({
        company_id: companyId,
      }),
    onSuccess: () => {
      toast.success("Vendor Service connection is working");
      qc.invalidateQueries({ queryKey: ["vendor-history-config", companyId] });
    },
    onError: () => {
      toast.error("Vendor Service connection failed");
    },
  });

  const syncVendorHistoryMut = useMutation({
    mutationFn: () => riskApi.syncVendorHistory(companyId),
    onSuccess: (result) => {
      toast.success(
        `Vendor data synced successfully — ${result?.records_ready ?? 0} records ready`
      );
      qc.invalidateQueries({ queryKey: ["vendor-history-config", companyId] });
      qc.invalidateQueries({ queryKey: ["risk-model-status", companyId] });
    },
    onError: () => {
      toast.error("Vendor data synchronization failed");
    },
  });

  const retrainMut = useMutation({
    mutationFn: () => riskApi.retrainModel(companyId),
    onSuccess: (d) => {
      const r = d?.result;
      const metrics = r?.candidate_metrics;
      const metricSummary = metrics
        ? `Accuracy ${(metrics.accuracy * 100).toFixed(1)}%, Precision ${(metrics.precision * 100).toFixed(1)}%, Recall ${(metrics.recall * 100).toFixed(1)}%, F1 ${(metrics.f1_score * 100).toFixed(1)}%`
        : "Candidate metrics unavailable";
      if (r?.deployment_status === "active") {
        toast.success(`Model evaluated and deployed. ${metricSummary}`);
      } else {
        toast.warning(`Candidate retained without deployment: ${r?.rejection_reason ?? "validation failed"}. ${metricSummary}`);
      }
      qc.invalidateQueries({ queryKey: ["risk-model-status", companyId] });
    },
    onError: () => toast.error("Retraining failed."),
  });

  // ---- Derived ----

  const isAgentOnline =
    !statusErr && status && status.status !== "offline";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <ShieldAlert size={20} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Risk Analysis</h1>
            <p className="text-sm text-slate-500">Agent 5 — Vendor Risk Intelligence</p>
          </div>
          <span className={cn("badge ml-2", isAgentOnline ? "badge-green" : "badge-red")}>
            {isAgentOnline ? (
              <><Activity size={10} className="mr-1 inline" /> Online</>
            ) : (
              <><WifiOff size={10} className="mr-1 inline" /> Offline</>
            )}
          </span>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Company selector */}
          <select
            className="form-input text-sm h-9 w-44"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            {INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>

          {isAdmin && (
            <>

              <button
                className="btn-secondary text-sm"
                onClick={() => retrainMut.mutate()}
                disabled={retrainMut.isPending}
                title="Evaluate and deploy a candidate model"
              >
                {retrainMut.isPending ? (
                  <Loader2 size={14} className="animate-spin mr-1 inline" />
                ) : (
                  <ClipboardList size={14} className="mr-1 inline" />
                )}
                Retrain
              </button>
            </>
          )}

          <button
            className="btn-primary text-sm"
            onClick={() => analyzeMut.mutate()}
            disabled={analyzeMut.isPending}
          >
            {analyzeMut.isPending ? (
              <Loader2 size={14} className="animate-spin mr-1 inline" />
            ) : (
              <RefreshCw size={14} className="mr-1 inline" />
            )}
            Analyze
          </button>
        </div>
      </div>

      {/* Data source */}
      <div className="section-card">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-slate-800">Data Source</h2>
            <p className="text-xs text-slate-500 mt-1">
              Vendor performance data through the Integration Gateway
            </p>
          </div>

          <span
            className={cn(
              "badge",
              vendorHistoryConfig?.record_count > 0
                ? "badge-green"
                : "badge-slate"
            )}
          >
            {vendorHistoryConfig?.record_count > 0
              ? "Data Available"
              : "Not Synced"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Source</p>
            <p className="text-sm font-semibold text-slate-800 mt-1">
              {companyId.charAt(0).toUpperCase() + companyId.slice(1)} Vendor Service
            </p>
            <p className="text-xs text-slate-500 mt-1">
              PostgreSQL
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Raw Records</p>
            <p className="text-xl font-bold text-slate-800 mt-1">
              {vendorHistoryConfig?.raw_record_count ?? 0}
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Ready for Analysis</p>
            <p className="text-xl font-bold text-slate-800 mt-1">
              {vendorHistoryConfig?.ready_record_count ??
                vendorHistoryConfig?.record_count ??
                0}
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Quarantined / Removed</p>
            <p className="text-xl font-bold text-slate-800 mt-1">
              {vendorHistoryConfig?.quarantined_record_count ?? 0}
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Last Synced</p>
            <p className="text-sm font-semibold text-slate-800 mt-1">
              {vendorHistoryConfig?.fetched_at
                ? formatDateTime(vendorHistoryConfig.fetched_at)
                : "Never"}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            className="btn-secondary text-sm"
            onClick={() => testConnectionMut.mutate()}
            disabled={
              testConnectionMut.isPending || syncVendorHistoryMut.isPending
            }
          >
            {testConnectionMut.isPending ? (
              <Loader2 size={14} className="animate-spin mr-1 inline" />
            ) : (
              <Activity size={14} className="mr-1 inline" />
            )}
            Test Connection
          </button>

          <button
            className="btn-primary text-sm"
            onClick={() => syncVendorHistoryMut.mutate()}
            disabled={
              testConnectionMut.isPending || syncVendorHistoryMut.isPending
            }
          >
            {syncVendorHistoryMut.isPending ? (
              <Loader2 size={14} className="animate-spin mr-1 inline" />
            ) : (
              <RefreshCw size={14} className="mr-1 inline" />
            )}
            Sync Data
          </button>
        </div>
      </div>

      {/* Model status banner */}
      {modelStatus && (
        <div className="section-card flex flex-wrap items-center gap-4 text-sm">
          <span className="font-medium text-slate-700">Model status:</span>
          <span className={cn("badge", modelStatus.active_model ? "badge-green" : "badge-slate")}>
            {modelStatus.active_model ? "Deployed" : "No model"}
          </span>
          {modelStatus.active_model && (
            <>
              <span className="text-slate-500">
                Accuracy: <strong>{(((modelStatus.active_model.metrics?.accuracy ?? modelStatus.active_model.accuracy) ?? 0) * 100).toFixed(1)}%</strong>
              </span>
              <span className="text-slate-500">
                Precision: <strong>{(((modelStatus.active_model.metrics?.precision ?? modelStatus.active_model.precision) ?? 0) * 100).toFixed(1)}%</strong>
              </span>
              <span className="text-slate-500">
                Recall: <strong>{(((modelStatus.active_model.metrics?.recall ?? modelStatus.active_model.recall) ?? 0) * 100).toFixed(1)}%</strong>
              </span>
              <span className="text-slate-500">
                F1: <strong>{(((modelStatus.active_model.metrics?.f1_score ?? modelStatus.active_model.metrics?.f1_macro ?? modelStatus.active_model.f1_score) ?? 0) * 100).toFixed(1)}%</strong>
              </span>
              <span className="text-slate-500">
                Trained:{" "}
                <strong>
                  {formatDate(modelStatus.active_model.trained_at ?? modelStatus.active_model.deployed_at)}
                </strong>
              </span>
            </>
          )}
          {!modelStatus.active_model && (
            <span className="text-slate-500">
              Sync history, then <strong>Retrain</strong> to train the first model.
            </span>
          )}
        </div>
      )}

      {/* Continuous Learning & Feedback Loop Section */}
      <div className="section-card bg-gradient-to-br from-white to-purple-50/20 border border-purple-100 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-purple-100/80 text-purple-700 flex items-center justify-center font-bold">
                <Sparkles size={16} />
              </div>
              <h2 className="font-semibold text-slate-800 text-base">
                Continuous Learning & Feedback Loop
              </h2>
              <span className="badge badge-purple text-xs">
                Auto-Retrain Threshold: {modelStatus?.auto_retrain_threshold ?? 5} Feedbacks
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              When an order is completed, actual delivery performance (timeliness, defect rate, verified risk) is recorded.
              Once <strong>{modelStatus?.auto_retrain_threshold ?? 5} unconsumed feedback records</strong> accumulate, Agent 5 automatically retrains the Random Forest model and promotes it if performance benchmarks pass.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              className="btn-primary text-xs flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-xs"
              onClick={() => setFeedbackVendor({})}
            >
              <MessageSquarePlus size={14} />
              <span>+ Record Vendor Feedback</span>
            </button>
            <button
              className="btn-secondary text-xs flex items-center gap-1 text-slate-600"
              onClick={() => setShowFeedbackList(!showFeedbackList)}
            >
              <ClipboardList size={13} />
              <span>{showFeedbackList ? "Hide History" : `View Feedback (${feedbackData?.count ?? 0})`}</span>
            </button>
          </div>
        </div>

        {/* Progress meter */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          <div className="bg-white rounded-xl p-3 border border-slate-200/80">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="font-medium text-slate-700">Auto-Retrain Buffer</span>
              <span className="font-bold text-purple-700">
                {modelStatus?.unconsumed_feedback_count ?? 0} / {modelStatus?.auto_retrain_threshold ?? 5}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-600 transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    (((modelStatus?.unconsumed_feedback_count ?? 0) / (modelStatus?.auto_retrain_threshold ?? 5)) * 100)
                  )}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {(modelStatus?.auto_retrain_threshold ?? 5) - (modelStatus?.unconsumed_feedback_count ?? 0) > 0
                ? `${(modelStatus?.auto_retrain_threshold ?? 5) - (modelStatus?.unconsumed_feedback_count ?? 0)} more feedback record(s) until automatic retraining`
                : "Threshold reached! Model retraining triggered in background"}
            </p>
          </div>

          <div className="bg-white rounded-xl p-3 border border-slate-200/80">
            <span className="text-xs text-slate-500">Auto-Retrain Policy</span>
            <p className="text-base font-bold text-slate-800 mt-0.5">
              Every {modelStatus?.auto_retrain_threshold ?? 5} Feedback Records
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Safe promotion: candidate tested against thresholds
            </p>
          </div>

          <div className="bg-white rounded-xl p-3 border border-slate-200/80">
            <span className="text-xs text-slate-500">Total Feedback Stored</span>
            <p className="text-base font-bold text-slate-800 mt-0.5">
              {feedbackData?.count ?? 0} Records
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Continuous supervised dataset in PostgreSQL
            </p>
          </div>
        </div>

        {/* Collapsible Feedback List */}
        {showFeedbackList && (
          <div className="mt-4 pt-4 border-t border-slate-200/60">
            <h4 className="text-xs font-semibold text-slate-700 mb-2">Recorded Feedback Records</h4>
            {(!feedbackData?.feedback || feedbackData.feedback.length === 0) ? (
              <p className="text-xs text-slate-400 italic py-2">
                No feedback records recorded yet. Click &quot;+ Record Vendor Feedback&quot; or provide feedback from Purchase Orders.
              </p>
            ) : (
              <div className="overflow-x-auto max-h-60 overflow-y-auto">
                <table className="w-full text-xs bg-white rounded-lg border border-slate-200">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Time</th>
                      <th className="p-2 text-left">Vendor</th>
                      <th className="p-2 text-left">Order ID</th>
                      <th className="p-2 text-left">Rating</th>
                      <th className="p-2 text-left">Outcome</th>
                      <th className="p-2 text-left">Verified Risk</th>
                      <th className="p-2 text-left">Consumed</th>
                      <th className="p-2 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbackData.feedback.map((f: any, i: number) => (
                      <tr key={f.id ?? i} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="p-2 text-slate-500 whitespace-nowrap">{f.created_at ? formatDateTime(f.created_at) : "—"}</td>
                        <td className="p-2 font-medium text-slate-800">{f.vendor_name || f.vendor_id}</td>
                        <td className="p-2 text-slate-600 font-mono">{f.order_id || "—"}</td>
                        <td className="p-2 font-semibold text-amber-600">⭐ {Number(f.rating).toFixed(1)}</td>
                        <td className="p-2 capitalize">{f.actual_outcome?.replace(/_/g, " ") || "—"}</td>
                        <td className="p-2"><RiskBadge label={f.verified_risk_label || f.actual_risk_label} /></td>
                        <td className="p-2">
                          <span className={cn("badge text-[10px]", f.consumed ? "badge-slate" : "badge-green")}>
                            {f.consumed ? "Consumed" : "Queued"}
                          </span>
                        </td>
                        <td className="p-2 text-slate-500 max-w-xs truncate">{f.notes || f.admin_notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vendor / PO Risk Analysis History */}
      <div className="section-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-800">
              Vendor / PO Risk Analysis History
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Procurement requirements, selected vendors, possible vendors, and selection reasons.
            </p>
          </div>
          <button
            className="text-xs text-blue-600 hover:underline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["vendor-recommendation-history"] })}
          >
            Refresh
          </button>
        </div>

        {historyLoading && (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="animate-spin mr-2" size={18} />
            Loading procurement history...
          </div>
        )}

        {!historyLoading && (() => {
          const events = Array.isArray(procurementEvents?.events)
            ? procurementEvents.events
            : [];

          const uniqueEvents = Array.from(
            new Map(
              events
                .filter(
                  (event: any) =>
                    event?.event_type === "VENDOR_RECOMMENDED" &&
                    event?.source_agent === "agent_3"
                )
                .map((event: any) => {
                  let payload: any = event.payload;

                  if (typeof payload === "string") {
                    try {
                      payload = JSON.parse(payload);
                    } catch {
                      payload = {};
                    }
                  }

                  return [
                    payload?.request_id ?? event.id,
                    { ...event, parsedPayload: payload },
                  ];
                })
            ).values()
          );

          if (uniqueEvents.length === 0) {
            return (
              <div className="py-10 text-center text-slate-500">
                <ClipboardList size={34} className="mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No vendor recommendation history yet.</p>
                <p className="text-sm mt-1">
                  Vendor recommendations generated by Agent 3 will appear here.
                </p>
              </div>
            );
          }

          return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="py-3 px-3 font-medium text-slate-500"></th>
                    <th className="py-3 px-3 font-medium text-slate-500">Date</th>
                    <th className="py-3 px-3 font-medium text-slate-500">PO / Request</th>
                    <th className="py-3 px-3 font-medium text-slate-500">Company</th>
                    <th className="py-3 px-3 font-medium text-slate-500">Item</th>
                    <th className="py-3 px-3 font-medium text-slate-500">Qty</th>
                    <th className="py-3 px-3 font-medium text-slate-500">Selected Vendor</th>
                    <th className="py-3 px-3 font-medium text-slate-500">Risk</th>
                    <th className="py-3 px-3 font-medium text-slate-500">Risk Score</th>
                  </tr>
                </thead>

                <tbody>
                  {uniqueEvents.flatMap((event: any) => {
                    const payload = event.parsedPayload ?? {};
                    const recommendations = Array.isArray(payload.recommendations) && payload.recommendations.length > 0
                      ? payload.recommendations
                      : [{}];
                    const requestId = payload.request_id ?? event.id;

                    return recommendations.map((rec: any, recIdx: number) => {
                      const best = rec.best_vendor ?? null;
                      const rowKey = `${requestId}-${recIdx}`;
                      const isExpanded = expandedHistory === rowKey;

                      return (
                        <Fragment key={rowKey}>
                          <tr
                            className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                            onClick={() =>
                              setExpandedHistory(isExpanded ? null : rowKey)
                            }
                          >
                            <td className="py-3 px-3">
                              {isExpanded ? (
                                <ChevronUp size={16} />
                              ) : (
                                <ChevronDown size={16} />
                              )}
                            </td>

                            <td className="py-3 px-3 whitespace-nowrap">
                              {event.created_at
                                ? formatDateTime(event.created_at)
                                : "—"}
                            </td>

                            <td className="py-3 px-3 font-medium">
                              #{requestId}
                            </td>

                            <td className="py-3 px-3 capitalize">
                              {rec.industry ?? "—"}
                            </td>

                            <td className="py-3 px-3">
                              {rec.item_name ?? rec.item_description ?? "—"}
                            </td>

                            <td className="py-3 px-3">
                              {rec.requested_quantity ?? rec.quantity ?? "—"}
                            </td>

                            <td className="py-3 px-3 font-medium">
                              {best?.vendor_name ?? "No vendor selected"}
                            </td>

                            <td className="py-3 px-3">
                              {best?.risk_level ? (
                                <RiskBadge label={best.risk_level} />
                              ) : (
                                "—"
                              )}
                            </td>

                            <td className="py-3 px-3 font-semibold">
                              {best?.risk_score != null
                                ? Number(best.risk_score).toFixed(1)
                                : "—"}
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="border-b border-slate-200 bg-slate-50">
                              <td colSpan={9} className="p-4">
                                <div className="space-y-5">

                                  <div>
                                    <h3 className="font-semibold text-slate-800 mb-3">
                                      Possible Vendors for {rec.item_name ?? "this Order"}
                                    </h3>

                                    {Array.isArray(rec.all_vendors) &&
                                    rec.all_vendors.length > 0 ? (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm bg-white rounded-lg">
                                          <thead>
                                            <tr className="border-b border-slate-200">
                                              <th className="text-left p-3">Vendor</th>
                                              <th className="text-left p-3">Risk</th>
                                              <th className="text-left p-3">Risk Score</th>
                                              <th className="text-left p-3">Suitability</th>
                                              <th className="text-left p-3">Lead Time</th>
                                              <th className="text-left p-3">Unit Price</th>
                                              <th className="text-left p-3">Total Price</th>
                                              <th className="text-right p-3">Action</th>
                                            </tr>
                                          </thead>

                                          <tbody>
                                            {rec.all_vendors.map(
                                              (vendor: any, index: number) => {
                                                const selected =
                                                  best &&
                                                  (vendor.vendor_id === best.vendor_id ||
                                                    vendor.purchase_vendor_id ===
                                                      best.purchase_vendor_id);

                                                return (
                                                  <tr
                                                    key={`${vendor.vendor_id ?? vendor.vendor_name}-${index}`}
                                                    className={cn(
                                                      "border-b border-slate-100",
                                                      selected && "bg-green-50"
                                                    )}
                                                  >
                                                    <td className="p-3 font-medium">
                                                      <div className="flex items-center gap-2">
                                                        {selected && (
                                                          <CheckCircle2
                                                            size={15}
                                                            className="text-green-600"
                                                          />
                                                        )}
                                                        {vendor.vendor_name ?? "Unknown Vendor"}
                                                      </div>
                                                    </td>

                                                    <td className="p-3">
                                                      <RiskBadge label={vendor.risk_level} />
                                                    </td>

                                                    <td className="p-3">
                                                      {vendor.risk_score != null
                                                        ? Number(vendor.risk_score).toFixed(1)
                                                        : "—"}
                                                    </td>

                                                    <td className="p-3">
                                                      {vendor.suitability_score != null
                                                        ? Number(vendor.suitability_score).toFixed(1)
                                                        : "—"}
                                                    </td>

                                                    <td className="p-3">
                                                      {vendor.lead_time_days != null
                                                        ? `${vendor.lead_time_days} days`
                                                        : "—"}
                                                    </td>

                                                    <td className="p-3">
                                                      {vendor.unit_price != null
                                                        ? `₹${Number(vendor.unit_price).toLocaleString("en-IN")}`
                                                        : "—"}
                                                    </td>

                                                    <td className="p-3">
                                                      {vendor.total_price != null
                                                        ? `₹${Number(vendor.total_price).toLocaleString("en-IN")}`
                                                        : "—"}
                                                    </td>

                                                    <td className="p-3 text-right">
                                                      <button
                                                        className="btn-secondary text-xs px-2.5 py-1 inline-flex items-center gap-1 text-slate-700 hover:text-purple-600 hover:border-purple-300"
                                                        onClick={() => setFeedbackVendor({
                                                          vendor_id: vendor.vendor_id || vendor.purchase_vendor_id,
                                                          vendor_name: vendor.vendor_name,
                                                          risk_level: vendor.risk_level,
                                                          order_id: String(requestId)
                                                        })}
                                                        title="Submit delivery feedback for ML retraining"
                                                      >
                                                        <MessageSquarePlus size={12} className="text-purple-600" />
                                                        <span>Feedback</span>
                                                      </button>
                                                    </td>
                                                  </tr>
                                                );
                                              }
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    ) : (
                                      <p className="text-sm text-slate-500">
                                        No detailed vendor list is available for this historical record.
                                      </p>
                                    )}
                                  </div>

                                  {best && (
                                    <div className="section-card bg-white border-green-200">
                                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                        <h3 className="font-semibold text-slate-800">
                                          Selected Vendor
                                        </h3>
                                        <button
                                          className="btn-secondary text-xs px-2.5 py-1 inline-flex items-center gap-1.5 text-purple-700 bg-purple-50/70 border-purple-200 hover:bg-purple-100"
                                          onClick={() => setFeedbackVendor({
                                            vendor_id: best.vendor_id || best.purchase_vendor_id,
                                            vendor_name: best.vendor_name,
                                            risk_level: best.risk_level,
                                            order_id: String(requestId)
                                          })}
                                        >
                                          <MessageSquarePlus size={13} className="text-purple-600" />
                                          <span>Provide Delivery Feedback</span>
                                        </button>
                                      </div>

                                      <div className="flex items-center gap-3 mb-4">
                                        <CheckCircle2
                                          size={20}
                                          className="text-green-600"
                                        />
                                        <span className="text-lg font-bold">
                                          {best.vendor_name ?? "Unknown Vendor"}
                                        </span>
                                        <RiskBadge label={best.risk_level} />
                                      </div>

                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                        <div>
                                          <p className="text-xs text-slate-500">Risk Score</p>
                                          <p className="font-semibold">
                                            {best.risk_score != null
                                              ? Number(best.risk_score).toFixed(1)
                                              : "—"}
                                          </p>
                                        </div>

                                        <div>
                                          <p className="text-xs text-slate-500">Suitability</p>
                                          <p className="font-semibold">
                                            {best.suitability_score != null
                                              ? Number(best.suitability_score).toFixed(1)
                                              : "—"}
                                          </p>
                                        </div>

                                        <div>
                                          <p className="text-xs text-slate-500">Lead Time</p>
                                          <p className="font-semibold">
                                            {best.lead_time_days != null
                                              ? `${best.lead_time_days} days`
                                              : "—"}
                                          </p>
                                        </div>

                                        <div>
                                          <p className="text-xs text-slate-500">Confidence</p>
                                          <p className="font-semibold">
                                            {best.confidence != null
                                              ? `${(Number(best.confidence) * 100).toFixed(1)}%`
                                              : "—"}
                                          </p>
                                        </div>

                                        <div>
                                          <p className="text-xs text-slate-500">Unit Price</p>
                                          <p className="font-semibold">
                                            {best.unit_price != null
                                              ? `₹${Number(best.unit_price).toLocaleString("en-IN")}`
                                              : "—"}
                                          </p>
                                        </div>

                                        <div>
                                          <p className="text-xs text-slate-500">Total Price</p>
                                          <p className="font-semibold">
                                            {best.total_price != null
                                              ? `₹${Number(best.total_price).toLocaleString("en-IN")}`
                                              : "—"}
                                          </p>
                                        </div>

                                        <div>
                                          <p className="text-xs text-slate-500">Can Fulfill</p>
                                          <p className="font-semibold">
                                            {best.can_fulfill == null
                                              ? "—"
                                              : best.can_fulfill
                                                ? "Yes"
                                                : "No"}
                                          </p>
                                        </div>
                                      </div>

                                      {(
                                        best.reasons?.length ||
                                        best.risk_factors?.length ||
                                        rec.reasons?.length ||
                                        best.notes ||
                                        rec.notes
                                      ) ? (
                                        <div className="mt-5 pt-4 border-t border-slate-100">
                                          <AgentRationaleCard
                                            notes={best.notes || rec.notes}
                                            reasons={[
                                              ...(best.reasons ?? []),
                                              ...(best.risk_factors ?? []),
                                              ...(rec.reasons ?? []),
                                            ]}
                                            riskLevel={best.risk_level}
                                            riskScore={best.risk_score}
                                            suitabilityScore={best.suitability_score}
                                            title={`Why ${best.vendor_name || "This Vendor"} Was Chosen`}
                                            subtitle={`Multi-criteria risk evaluation & selection rationale for ${rec.item_name || "this item"}`}
                                          />
                                        </div>
                                      ) : null}
                                    </div>
                                  )}

                                  {!best && (
                                    <div className="mt-4">
                                      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                                        No vendor was selected for this procurement request.
                                      </div>
                                      {rec.notes && (
                                        <div className="mt-3">
                                          <AgentRationaleCard notes={rec.notes} />
                                        </div>
                                      )}
                                    </div>
                                  )}

                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* Admin Feedback Modal */}
      {feedbackVendor && (
        <AdminFeedbackModal
          vendor={feedbackVendor}
          companyId={companyId}
          orderId={feedbackVendor.order_id}
          onClose={() => setFeedbackVendor(null)}
        />
      )}
    </div>
  );
}























