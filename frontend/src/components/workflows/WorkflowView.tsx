"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ocrApi, procurementApi } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { AgentRationaleCard } from "@/components/common/AgentRationaleCard";
import {
  FileText,
  Package,
  Store,
  ShoppingCart,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
} from "lucide-react";

function parsePayload(payload: any) {
  if (!payload) return {};
  if (typeof payload === "object") return payload;

  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function Status({
  done,
  failed = false,
}: {
  done: boolean;
  failed?: boolean;
}) {
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
        <XCircle size={12} /> Failed
      </span>
    );
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">
        <CheckCircle2 size={12} /> Completed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-600">
      <Clock size={12} /> Processing
    </span>
  );
}

function WorkflowRow({ request }: { request: any }) {
  const [open, setOpen] = useState(false);

  const requestId = request.id;

  const { data: itemsData } = useQuery({
    queryKey: ["workflow-items", requestId],
    queryFn: () => ocrApi.getRequestItems(requestId),
    retry: 1,
  });

  const { data: eventsData } = useQuery({
    queryKey: ["workflow-events", requestId],
    queryFn: () =>
      procurementApi.getEvents({
        request_id: requestId,
        limit: 100,
      }),
    refetchInterval: 5000,
    retry: 1,
  });

  const { data: poData } = useQuery({
    queryKey: ["workflow-pos", requestId],
    queryFn: () =>
      procurementApi.getPOs({
        request_id: requestId,
        limit: 50,
      }),
    refetchInterval: 5000,
    retry: 1,
  });

  const items = itemsData?.items ?? [];
  const events = eventsData?.events ?? [];
  const pos = poData?.purchase_orders ?? [];

  const inventoryEvent = events.find(
    (e: any) => e.event_type === "INVENTORY_EVALUATED"
  );

  const vendorEvent = events.find(
    (e: any) => e.event_type === "VENDOR_RECOMMENDED"
  );

  const poEvent = events.find(
    (e: any) => e.event_type === "PURCHASE_ORDER_CREATED"
  );

  const inventory = parsePayload(inventoryEvent?.payload);
  const vendorSummary = parsePayload(vendorEvent?.payload);
  const poSummary = parsePayload(poEvent?.payload);

  const invoice =
    request.invoice_number ||
    request.invoice_no ||
    request.filename ||
    `Request #${requestId}`;

  const company =
    request.requester_name ||
    request.company_name ||
    request.company ||
    "—";

  const uploaded = request.created_at
    ? formatDateTime(request.created_at)
    : "—";

  const inventoryDone = !!inventoryEvent;
  const vendorDone = !!vendorEvent;
  const procurementDone = !!poEvent;

  const failedItems = poSummary.failed_items ?? 0;

  const procurementFailed =
    procurementDone && failedItems > 0 && pos.length === 0;

  const overallDone =
    inventoryDone && vendorDone && procurementDone;

  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td className="px-4 py-4">
          <div className="font-medium text-slate-800 truncate max-w-[240px]">
            {invoice}
          </div>

          <div className="text-xs text-slate-400 mt-1">
            Request #{requestId}
          </div>
        </td>

        <td className="px-4 py-4 text-sm text-slate-600">
          {company}
        </td>

        <td className="px-4 py-4 text-xs text-slate-500 whitespace-nowrap">
          {uploaded}
        </td>

        <td className="px-4 py-4">
          <Status done={true} />
        </td>

        <td className="px-4 py-4">
          <Status done={inventoryDone} />
        </td>

        <td className="px-4 py-4">
          <Status done={vendorDone} />
        </td>

        <td className="px-4 py-4">
          <Status
            done={procurementDone}
            failed={procurementFailed}
          />
        </td>

        <td className="px-4 py-4">
          <Status done={overallDone} />
        </td>

        <td className="px-4 py-4">
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            {open ? "Hide" : "View"}

            {open ? (
              <ChevronUp size={15} />
            ) : (
              <ChevronDown size={15} />
            )}
          </button>
        </td>
      </tr>

      {open && (
        <tr className="bg-slate-50">
          <td colSpan={9} className="p-5">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

              {/* AGENT 1 */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2 mb-4">
                  <FileText
                    size={18}
                    className="text-blue-600"
                  />

                  <h3 className="font-semibold text-slate-800">
                    Agent 1 — OCR
                  </h3>

                  <Status done={true} />
                </div>

                <p className="text-xs text-slate-500 mb-3">
                  Extracted invoice line items
                </p>

                {items.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No extracted items available.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {items.map((item: any) => (
                      <div
                        key={item.id}
                        className="rounded-lg bg-slate-50 border border-slate-100 p-3"
                      >
                        <div className="font-medium text-sm text-slate-800">
                          {item.description}
                        </div>

                        <div className="flex justify-between mt-1 text-xs text-slate-500">
                          <span>
                            Quantity: {item.quantity}
                          </span>

                          <span>
                            {formatCurrency(
                              item.estimated_cost ?? 0
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AGENT 2 */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Package
                    size={18}
                    className="text-blue-600"
                  />

                  <h3 className="font-semibold text-slate-800">
                    Agent 2 — Inventory
                  </h3>

                  <Status done={inventoryDone} />
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="rounded-lg bg-slate-50 p-3 text-center">
                    <div className="font-semibold text-slate-800">
                      {inventory.total_items ?? items.length}
                    </div>

                    <div className="text-[11px] text-slate-400">
                      Items
                    </div>
                  </div>

                  <div className="rounded-lg bg-red-50 p-3 text-center">
                    <div className="font-semibold text-red-600">
                      {inventory.shortage_items ?? 0}
                    </div>

                    <div className="text-[11px] text-red-400">
                      Shortages
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-3 text-center">
                    <div className="font-semibold text-slate-800">
                      {formatCurrency(
                        inventory.total_shortage_cost ?? 0
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400">
                      Shortage Cost
                    </div>
                  </div>
                </div>

                {items.length > 0 && (
                  <div className="space-y-2">
                    {items.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
                      >
                        <span className="text-sm text-slate-700">
                          {item.description}
                        </span>

                        <span className="text-xs text-slate-500">
                          Required: {item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-slate-400 mt-3">
                  Detailed available-stock quantities are not
                  persisted in workflow history.
                </p>
              </div>

              {/* AGENT 4 */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ShoppingCart
                    size={18}
                    className="text-orange-600"
                  />

                  <h3 className="font-semibold text-slate-800">
                    Agent 4 — Procurement
                  </h3>

                  <Status done={procurementDone} />
                </div>

                {pos.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No purchase orders created.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {pos.map((po: any) => (
                      <div
                        key={po.id}
                        className="rounded-lg bg-slate-50 border border-slate-100 p-3"
                      >
                        <div className="font-mono text-xs font-semibold text-slate-700">
                          {po.po_number}
                        </div>

                        <div className="mt-1 text-sm font-medium text-slate-800">
                          {po.item_name}
                        </div>

                        <div className="text-xs text-slate-500 mt-1">
                          Vendor: {po.vendor_name}
                        </div>

                        <div className="flex justify-between mt-2">
                          <span className="text-xs text-slate-500">
                            Qty: {po.quantity}
                          </span>

                          <span className="font-semibold text-slate-800">
                            {formatCurrency(
                              po.total_price ?? 0
                            )}
                          </span>
                        </div>

                        <div className="mt-2 text-[11px] text-slate-400">
                          {po.status}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* AGENT 3 */}
            <div className="mt-4 rounded-xl border border-violet-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-4">
                <Store
                  size={18}
                  className="text-violet-600"
                />

                <h3 className="font-semibold text-slate-800">
                  Agent 3 — Vendor Selection & Score Analysis
                </h3>

                <Status done={vendorDone} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="rounded-lg bg-violet-50 p-3">
                  <div className="text-lg font-semibold text-violet-700">
                    {vendorSummary.vendors_found ?? 0}
                  </div>

                  <div className="text-xs text-slate-500">
                    Vendors Found
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-lg font-semibold text-slate-800">
                    {vendorSummary.total_shortage_items ?? 0}
                  </div>

                  <div className="text-xs text-slate-500">
                    Shortage Items
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-lg font-semibold text-slate-800">
                    {formatCurrency(
                      vendorSummary.total_recommended_cost ?? 0
                    )}
                  </div>

                  <div className="text-xs text-slate-500">
                    Recommended Cost
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-lg font-semibold text-slate-800">
                    {pos.length}
                  </div>

                  <div className="text-xs text-slate-500">
                    Selected Vendors
                  </div>
                </div>
              </div>

              {pos.length > 0 ? (
                <div className="space-y-3">
                  {pos.map((po: any) => {
                    const recommendations =
                      Array.isArray(vendorSummary?.recommendations)
                        ? vendorSummary.recommendations
                        : [];

                    const recommendation =
                      recommendations.find((r: any) => {
                        const best = r?.best_vendor || {};
                        return (
                          best?.item_name === po.item_name ||
                          best?.item_description === po.item_name ||
                          r?.item_name === po.item_name
                        );
                      }) || recommendations[0];

                    const bestVendor =
                      recommendation?.best_vendor || {};

                    const score =
                      bestVendor?.suitability_score ??
                      bestVendor?.score ??
                      recommendation?.suitability_score ??
                      recommendation?.score;

                    const riskScore =
                      bestVendor?.risk_score ??
                      recommendation?.risk_score;

                                        const qualityScore =
                      bestVendor?.quality_score ??
                      bestVendor?.supporting_metrics?.quality_score ??
                      bestVendor?.supporting_metrics?.defect_rate ??
                      recommendation?.quality_score ??
                      recommendation?.supporting_metrics?.quality_score ??
                      recommendation?.supporting_metrics?.defect_rate;

                    const complianceScore =
                      bestVendor?.compliance_score ??
                      bestVendor?.supporting_metrics?.compliance_score ??
                      recommendation?.compliance_score ??
                      recommendation?.supporting_metrics?.compliance_score;

                    const reasons =
                      bestVendor?.reasons ??
                      recommendation?.reasons ??
                      [];

                    return (
                      <div
                        key={po.id}
                        className="rounded-lg border border-slate-100 p-4"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                          <div>
                            <div className="text-[11px] text-slate-400">
                              Item
                            </div>

                            <div className="font-medium text-sm text-slate-800">
                              {po.item_name}
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] text-slate-400">
                              Selected Vendor
                            </div>

                            <div className="font-medium text-sm text-slate-800">
                              {po.vendor_name || "—"}
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] text-slate-400">
                              Price
                            </div>

                            <div className="font-medium text-sm text-slate-800">
                              {formatCurrency(
                                po.unit_price ?? 0
                              )}{" "}
                              / unit
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] text-slate-400">
                              Overall Score
                            </div>

                            <div className="font-medium text-sm text-slate-800">
                              {score || "Not persisted"}
                            </div>
                          </div>

                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">

                          <div className="rounded-lg bg-slate-50 p-3">
                            <div className="text-[11px] text-slate-400">
                              Delivery / Lead Time
                            </div>

                            <div className="text-sm text-slate-700">
                              {po.delivery_date_expected ||
                                "Not persisted"}
                            </div>
                          </div>

                          <div className="rounded-lg bg-slate-50 p-3">
                            <div className="text-[11px] text-slate-400">
                              Risk Score
                            </div>

                            <div className="text-sm text-slate-700">
                              {riskScore ?? "Not available"}
                            </div>
                          </div>

                          <div className="rounded-lg bg-slate-50 p-3">
                            <div className="text-[11px] text-slate-400">
                              Defect Rate / Compliance
                            </div>

                            <div className="text-sm text-slate-700">
                              {qualityScore != null ? `${(Number(qualityScore) * 100).toFixed(2)}%` : "Not available"} / {complianceScore != null ? Number(complianceScore).toFixed(2) : "Not available"}
                            </div>
                          </div>

                        </div>

                        <div className="mt-3">
                          <AgentRationaleCard
                            notes={po.notes}
                            reasons={reasons}
                            riskScore={riskScore}
                            riskLevel={bestVendor?.risk_level || recommendation?.risk_level}
                            suitabilityScore={score}
                            routing={po.approval_tier}
                            assignedTo={po.assigned_approver_name}
                            title={`Selection Rationale · ${po.item_name}`}
                            subtitle={`Procurement evaluation for ${po.vendor_name || "selected vendor"}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  No vendor recommendations available.
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function WorkflowView() {
  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["workflow-requests"],

    queryFn: async () => {
      const res = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_URL ||
          "http://localhost:8000"
        }/ocr/requests`,
        {
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": "GATEWAY-master-key-2024",
          },
        }
      );

      if (!res.ok) {
        throw new Error(
          "Failed to load workflow history"
        );
      }

      return res.json();
    },

    refetchInterval: 5000,
  });

  const requests = data?.requests ?? [];

  const completed = requests.filter(
    (r: any) => !r.status || r.status.toLowerCase() === "completed" || r.status.toLowerCase() === "done"
  ).length;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">

      <div>
        <div className="flex items-center justify-between">

          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Autonomous Agent Workflows
            </h1>

            <p className="text-sm text-slate-500 mt-1">
              End-to-end procurement processing history across all agents
            </p>
          </div>

          <button
            onClick={() => refetch()}
            className="btn-secondary flex items-center gap-2"
          >
            {isFetching ? (
              <Loader2
                size={15}
                className="animate-spin"
              />
            ) : (
              <RefreshCw size={15} />
            )}

            Refresh
          </button>

        </div>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        <div className="card">
          <div className="text-sm text-slate-500">
            Total Invoices
          </div>

          <div className="text-2xl font-bold text-slate-900 mt-1">
            {requests.length}
          </div>
        </div>

        <div className="card">
          <div className="text-sm text-slate-500">
            Completed
          </div>

          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {completed}
          </div>
        </div>

        <div className="card">
          <div className="text-sm text-slate-500">
            Processing
          </div>

          <div className="text-2xl font-bold text-amber-600 mt-1">
            {requests.length - completed}
          </div>
        </div>

        <div className="card">
          <div className="text-sm text-slate-500">
            Failed
          </div>

          <div className="text-2xl font-bold text-red-600 mt-1">
            0
          </div>
        </div>

      </div>

      {/* TABLE */}
      <div className="card overflow-hidden p-0">

        <div className="overflow-x-auto">

          <table className="w-full text-left">

            <thead className="bg-slate-50">
              <tr>

                <th className="px-4 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Invoice
                </th>

                <th className="px-4 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Company
                </th>

                <th className="px-4 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Uploaded
                </th>

                <th className="px-4 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Agent 1 — OCR
                </th>

                <th className="px-4 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Agent 2 — Inventory
                </th>

                <th className="px-4 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Agent 3 — Vendor
                </th>

                <th className="px-4 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Agent 4 — Procurement
                </th>

                <th className="px-4 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Overall
                </th>

                <th className="px-4 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Details
                </th>

              </tr>
            </thead>

            <tbody>

              {isLoading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-12 text-center"
                  >
                    <Loader2
                      size={28}
                      className="animate-spin mx-auto text-brand-500"
                    />
                  </td>
                </tr>

              ) : requests.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-12 text-center text-sm text-slate-400"
                  >
                    No invoices found.
                  </td>
                </tr>

              ) : (
                requests.map((request: any) => (
                  <WorkflowRow
                    key={request.id}
                    request={request}
                  />
                ))
              )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}





