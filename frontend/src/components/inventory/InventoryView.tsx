"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { inventoryApi, INDUSTRIES, type Industry, INDUSTRY_API_KEYS } from "@/lib/api";
import { useDataSourceStore } from "@/store/dataSourceStore";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Package, Search, RefreshCw, Loader2, AlertTriangle,
  CheckCircle2, ChevronLeft, ChevronRight, Database, Key, Plug,
} from "lucide-react";
import Link from "next/link";

const industryColors: Record<Industry, string> = {
  construction:  "bg-amber-50 text-amber-700 border-amber-200",
  pharma:        "bg-blue-50 text-blue-700 border-blue-200",
  manufacturing: "bg-purple-50 text-purple-700 border-purple-200",
  electronics:   "bg-green-50 text-green-700 border-green-200",
};

const industryEngine: Record<Industry, string> = {
  construction:  "PostgreSQL",
  manufacturing: "PostgreSQL",
  pharma:        "MySQL",
  electronics:   "MySQL",
};

const GATEWAY_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const PAGE_SIZE = 12;

export function InventoryView() {
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(1);

  const { sources } = useDataSourceStore();

  // Built-in connected industries
  const connectedIndustries = INDUSTRIES.filter(ind =>
    sources.some(s => s.industry === ind && s.dataType === "inventory" && s.status === "connected")
  );

  // Uploaded (custom) inventory sources
  const uploadedSources = sources.filter(
    s => s.dataType === "inventory" && s.status === "connected" && !INDUSTRIES.includes(s.industry as any)
  );

  type TabId = Industry | string;
  const [activeTab, setActiveTab] = useState<TabId>("construction");

  const isBuiltin = INDUSTRIES.includes(activeTab as Industry);
  const uploadedSource = !isBuiltin ? uploadedSources.find(s => s.id === activeTab) : null;

  // Auto-select first available tab
  useEffect(() => {
    const allTabs = [...connectedIndustries, ...uploadedSources.map(s => s.id)];
    if (allTabs.length > 0 && !allTabs.includes(activeTab)) {
      setActiveTab(allTabs[0]);
    }
  }, [connectedIndustries.join(","), uploadedSources.map(s => s.id).join(",")]);

  const isConnected = connectedIndustries.includes(activeTab as Industry) || !!uploadedSource;

  // For builtin: use industry state
  const industry = isBuiltin ? activeTab as Industry : "construction";

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["inventory", activeTab],
    queryFn: async () => {
      if (uploadedSource) {
        const resp = await fetch(`http://localhost:8007/onboarding/data/${uploadedSource.id}`);
        if (!resp.ok) throw new Error("Failed to fetch uploaded data");
        return resp.json();
      }
      return inventoryApi.getItems(activeTab as Industry);
    },
    staleTime: 30000,
    enabled: isConnected,
  });

  const items: any[] = data?.items ?? [];

  const filtered = items.filter(item =>
    !search || item.name?.toLowerCase().includes(search.toLowerCase()) ||
    item.category?.toLowerCase().includes(search.toLowerCase())
  );

  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const lowStock   = items.filter(i => i.quantity_in_stock <= (i.reorder_level ?? 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Live stock levels from industry databases via Integration Gateway
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary">
          <RefreshCw size={14} className={cn(isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Industry tabs — only connected ones */}
      <div className="flex items-center gap-2 flex-wrap">
        {connectedIndustries.length === 0 && uploadedSources.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            <AlertTriangle size={14} className="shrink-0" />
            No inventory databases connected.{" "}
            <Link href="/data-sources" className="underline font-semibold hover:text-amber-900">
              Connect one in Data Sources →
            </Link>
          </div>
        ) : (
          <>
            {connectedIndustries.map(ind => (
              <button key={ind}
                onClick={() => { setActiveTab(ind); setPage(1); setSearch(""); }}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-semibold border transition-all",
                  activeTab === ind ? industryColors[ind] : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                )}>
                {ind.charAt(0).toUpperCase() + ind.slice(1)}
                <span className="ml-2 text-[11px] opacity-60">{industryEngine[ind]}</span>
              </button>
            ))}
            {uploadedSources.map(s => (
              <button key={s.id}
                onClick={() => { setActiveTab(s.id); setPage(1); setSearch(""); }}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-semibold border transition-all",
                  activeTab === s.id
                    ? "bg-violet-50 text-violet-700 border-violet-200"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                )}>
                {s.name}
                <span className="ml-2 text-[11px] opacity-60">Uploaded</span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* API connection info */}
      {isConnected && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
          <Key size={12} className="shrink-0 text-slate-400" />
          {uploadedSource ? (
            <>
              <span><span className="font-semibold text-slate-700">API Key:</span>{" "}
                <code className="font-mono bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">{uploadedSource.apiKey}</code>
              </span>
              <span className="text-slate-300">·</span>
              <span><span className="font-semibold text-slate-700">Source:</span>{" "}
                <span className="text-violet-600">Uploaded Dataset</span>
              </span>
            </>
          ) : (
            <>
              <span><span className="font-semibold text-slate-700">API Key:</span>{" "}
                <code className="font-mono bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">{INDUSTRY_API_KEYS[activeTab as Industry]}</code>
              </span>
              <span className="text-slate-300">·</span>
              <span><span className="font-semibold text-slate-700">Endpoint:</span>{" "}
                <code className="font-mono bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">{GATEWAY_URL}/inventory/items?industry={activeTab}</code>
              </span>
              <span className="text-slate-300">·</span>
              <span><span className="font-semibold text-slate-700">DB:</span>{" "}
                <span className="text-brand-600">{industryEngine[activeTab as Industry]}</span>
              </span>
            </>
          )}
        </div>
      )}

      {/* Stats bar */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Items",   value: items.length,    color: "text-slate-800" },
            { label: "Low Stock",     value: lowStock.length, color: lowStock.length > 0 ? "text-red-600" : "text-emerald-600" },
            { label: "In Stock",      value: items.filter(i => i.quantity_in_stock > (i.reorder_level ?? 0)).length, color: "text-emerald-600" },
            { label: "Database", value: uploadedSource ? "Uploaded" : industryEngine[activeTab as Industry], color: "text-brand-600" },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder={`Search ${uploadedSource ? uploadedSource.name : activeTab} inventory...`}
          className="form-input pl-9"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="section-card p-16 flex items-center justify-center">
          <div className="text-center">
            <Loader2 size={32} className="animate-spin text-brand-500 mx-auto mb-3" />
            <p className="text-xs text-slate-500">Loading inventory...</p>
            <p className="text-xs text-slate-400 mt-1">Querying {uploadedSource ? "uploaded dataset" : industryEngine[activeTab as Industry]} via {uploadedSource ? "Onboarding Service" : "Integration Gateway"}</p>
          </div>
        </div>
      ) : isError ? (
        <div className="section-card p-12 text-center">
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-red-600">Could not load inventory</p>
          <p className="text-xs text-slate-400 mt-1">Check that the inventory service is running</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="section-card p-12 text-center">
          <Package size={32} className="text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No items found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paged.map((item: any, i: number) => {
              const isLow = item.quantity_in_stock <= (item.reorder_level ?? 0);
              return (
                <div key={i} className="section-card p-4 hover:shadow-card-hover transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 leading-snug">{item.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{item.category}</p>
                    </div>
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ml-2",
                      isLow ? "bg-red-50" : "bg-emerald-50"
                    )}>
                      {isLow
                        ? <AlertTriangle size={14} className="text-red-500" />
                        : <CheckCircle2  size={14} className="text-emerald-500" />}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50 rounded-lg p-2">
                      <p className={cn("text-base font-bold", isLow ? "text-red-600" : "text-slate-800")}>
                        {item.quantity_in_stock?.toLocaleString("en-IN") ?? "—"}
                      </p>
                      <p className="text-[10px] text-slate-400">In Stock</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2">
                      <p className="text-base font-bold text-slate-600">
                        {item.reorder_level?.toLocaleString("en-IN") ?? "—"}
                      </p>
                      <p className="text-[10px] text-slate-400">Reorder At</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2">
                      <p className="text-base font-bold text-brand-600">
                        {item.unit_price ? formatCurrency(item.unit_price) : "—"}
                      </p>
                      <p className="text-[10px] text-slate-400">Unit Price</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                    <span className="text-[11px] text-slate-400">{item.unit ?? ""}</span>
                    <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                      {item.warehouse_location ?? item.storage_condition ?? ""}
                    </span>
                  </div>

                  {isLow && (
                    <div className="mt-2 px-2 py-1.5 bg-red-50 border border-red-100 rounded-lg">
                      <p className="text-[11px] text-red-600 font-medium">
                        ⚠ Low stock — below reorder level
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                  className="btn-ghost p-1.5 disabled:opacity-40"><ChevronLeft size={14}/></button>
                {Array.from({length: Math.min(totalPages, 5)}, (_, i) => i+1).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    className={cn("w-7 h-7 text-xs rounded-md font-medium",
                      n===page ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-100")}>{n}</button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
                  className="btn-ghost p-1.5 disabled:opacity-40"><ChevronRight size={14}/></button>
              </div>
            </div>
          )}

          {/* Source badge */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Database size={12} />
            <span>Source: <strong className="text-slate-600">
              {uploadedSource ? uploadedSource.name : `${activeTab}_inventory_db`}
            </strong> ({uploadedSource ? "PostgreSQL / Onboarding" : industryEngine[activeTab as Industry]}) via {uploadedSource ? "Onboarding Service" : "Integration Gateway"}</span>
          </div>
        </>
      )}
    </div>
  );
}
