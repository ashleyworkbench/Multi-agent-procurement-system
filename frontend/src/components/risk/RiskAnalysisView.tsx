"use client";

import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { riskApi, INDUSTRIES, getStoredUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ShieldAlert, RefreshCw, MessageSquarePlus,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
  Loader2, Activity, WifiOff, BarChart2, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";

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
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string>(INDUSTRIES[0]);
  const [isAdmin, setIsAdmin] = useState(false);

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
      toast.success("Risk analysis complete ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â scores updated");
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
        `Vendor data synced successfully ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${result?.records_ready ?? 0} records ready`
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
                ? new Date(vendorHistoryConfig.fetched_at).toLocaleString()
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
                  {new Date(modelStatus.active_model.trained_at ?? modelStatus.active_model.deployed_at).toLocaleDateString()}
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
                  {uniqueEvents.map((event: any) => {
                    const payload = event.parsedPayload ?? {};
                    const recommendations = Array.isArray(payload.recommendations)
                      ? payload.recommendations
                      : [];
                    const first = recommendations[0] ?? {};
                    const best = first.best_vendor ?? null;
                    const requestId = payload.request_id ?? event.id;
                    const isExpanded = expandedHistory === requestId;

                    return (
                      <Fragment key={requestId}>
                        <tr
                          className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                          onClick={() =>
                            setExpandedHistory(isExpanded ? null : requestId)
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
                              ? new Date(event.created_at).toLocaleDateString()
                              : "—"}
                          </td>

                          <td className="py-3 px-3 font-medium">
                            #{requestId}
                          </td>

                          <td className="py-3 px-3 capitalize">
                            {first.industry ?? "—"}
                          </td>

                          <td className="py-3 px-3">
                            {first.item_name ?? first.item_description ?? "—"}
                          </td>

                          <td className="py-3 px-3">
                            {first.requested_quantity ?? first.quantity ?? "—"}
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
                                    Possible Vendors for this Order
                                  </h3>

                                  {Array.isArray(first.all_vendors) &&
                                  first.all_vendors.length > 0 ? (
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
                                          </tr>
                                        </thead>

                                        <tbody>
                                          {first.all_vendors.map(
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
                                    <h3 className="font-semibold text-slate-800 mb-3">
                                      Selected Vendor
                                    </h3>

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
                                      first.reasons?.length
                                    ) ? (
                                      <div className="mt-5 pt-4 border-t border-slate-100">
                                        <p className="text-sm font-semibold text-slate-700 mb-2">
                                          Why This Vendor Was Chosen
                                        </p>

                                        <ul className="space-y-1 text-sm text-slate-600">
                                          {[
                                            ...(best.reasons ?? []),
                                            ...(best.risk_factors ?? []),
                                            ...(first.reasons ?? []),
                                          ]
                                            .filter(Boolean)
                                            .filter(
                                              (reason: string, index: number, arr: string[]) =>
                                                arr.indexOf(reason) === index
                                            )
                                            .map((reason: string, index: number) => (
                                              <li key={`${reason}-${index}`}>
                                                • {reason}
                                              </li>
                                            ))}
                                        </ul>
                                      </div>
                                    ) : null}
                                  </div>
                                )}

                                {!best && (
                                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                                    No vendor was selected for this procurement request.
                                    {first.notes && (
                                      <p className="mt-1">{first.notes}</p>
                                    )}
                                  </div>
                                )}

                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>
    </div>
  );
}























