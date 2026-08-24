"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { vendorApi, INDUSTRIES, type Industry, INDUSTRY_API_KEYS } from "@/lib/api";
import { useDataSourceStore } from "@/store/dataSourceStore";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Store, Search, RefreshCw, Loader2, AlertTriangle,
  Star, MapPin, Phone, Mail, Package, ChevronDown, ChevronUp, Database, Key,
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

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1,2,3,4,5].map(n => (
        <Star key={n} size={11}
          className={cn(n <= Math.round(rating) ? "text-amber-400 fill-amber-400" : "text-slate-200")} />
      ))}
      <span className="text-xs font-semibold text-slate-600 ml-1">{rating}</span>
    </div>
  );
}

function VendorCard({ vendor }: { vendor: any }) {
  const [expanded, setExpanded] = useState(false);
  const products: any[] = vendor.vendor_products ?? vendor.products ?? [];

  return (
    <div className="section-card overflow-hidden">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-brand-600">
                {vendor.vendor_name?.slice(0,3).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{vendor.vendor_name}</p>
              <StarRating rating={parseFloat(vendor.rating)} />
            </div>
          </div>
          <span className={cn("badge", vendor.is_active === 1 || vendor.is_active === true ? "badge-green" : "badge-red")}>
            {vendor.is_active === 1 || vendor.is_active === true ? "Active" : "Inactive"}
          </span>
        </div>

        {/* Contact */}
        <div className="space-y-1.5">
          {vendor.contact_person && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Store size={11} className="shrink-0 text-slate-400" />
              {vendor.contact_person}
            </div>
          )}
          {(vendor.city || vendor.state || vendor.country) && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <MapPin size={11} className="shrink-0 text-slate-400" />
              {[vendor.city, vendor.state, vendor.country].filter(Boolean).join(", ")}
            </div>
          )}
          {vendor.email && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Mail size={11} className="shrink-0 text-slate-400" />
              {vendor.email}
            </div>
          )}
          {vendor.phone && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Phone size={11} className="shrink-0 text-slate-400" />
              {vendor.phone}
            </div>
          )}
        </div>

        {/* Products toggle */}
        {products.length > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-3 w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-xs font-medium text-slate-600"
          >
            <span className="flex items-center gap-2">
              <Package size={11} />
              {products.length} product{products.length !== 1 ? "s" : ""}
            </span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      {/* Products expanded */}
      {expanded && products.length > 0 && (
        <div className="border-t border-slate-100">
          <div className="grid grid-cols-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-4 py-2 bg-slate-50">
            <span>Item</span>
            <span className="text-right">Price</span>
            <span className="text-right">Lead</span>
          </div>
          {products.map((p: any, i: number) => (
            <div key={i} className="grid grid-cols-3 items-center px-4 py-2 border-t border-slate-50 text-xs hover:bg-slate-50">
              <span className="text-slate-700 font-medium truncate pr-2">{p.item_name}</span>
              <span className="text-right text-slate-600">{formatCurrency(p.unit_price)}</span>
              <span className="text-right text-slate-400">{p.lead_time_days}d</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function VendorsView() {
  const [search, setSearch]       = useState("");
  const [sortBy, setSortBy]       = useState<"rating"|"name">("rating");

  const { sources } = useDataSourceStore();

  const connectedIndustries = INDUSTRIES.filter(ind =>
    sources.some(s => s.industry === ind && s.dataType === "vendor" && s.status === "connected")
  );

  const uploadedSources = sources.filter(
    s => s.status === "connected" && !INDUSTRIES.includes(s.industry as any) &&
    (s.dataType === "vendor" || s.dataType === "vendors" as any)
  );

  type TabId = Industry | string;
  const [activeTab, setActiveTab] = useState<TabId>("construction");

  const isBuiltin = INDUSTRIES.includes(activeTab as Industry);
  const uploadedSource = !isBuiltin ? uploadedSources.find(s => s.id === activeTab) : null;
  const isConnected = connectedIndustries.includes(activeTab as Industry) || !!uploadedSource;

  useEffect(() => {
    const allTabs = [...connectedIndustries, ...uploadedSources.map(s => s.id)];
    if (allTabs.length > 0 && !allTabs.includes(activeTab)) {
      setActiveTab(allTabs[0]);
    }
  }, [connectedIndustries.join(","), uploadedSources.map(s => s.id).join(",")]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["vendors", activeTab],
    queryFn: async () => {
      if (uploadedSource) {
        const resp = await fetch(`http://localhost:8007/onboarding/data/${uploadedSource.id}`);
        if (!resp.ok) throw new Error("Failed to fetch uploaded data");
        return resp.json();
      }
      return vendorApi.getVendors(activeTab as Industry);
    },
    staleTime: 30000,
    enabled: isConnected,
  });

  // Uploaded vendor data comes back as flat rows, builtin as { vendors: [] }
  const vendors: any[] = uploadedSource
    ? (data?.items ?? [])
    : (data?.vendors ?? []);

  const filtered = vendors
    .filter(v => !search ||
      (v.vendor_name ?? v.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (v.city ?? "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortBy === "rating"
      ? parseFloat(b.rating ?? 0) - parseFloat(a.rating ?? 0)
      : (a.vendor_name ?? a.name ?? "").localeCompare(b.vendor_name ?? b.name ?? ""));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vendors</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Supplier directory from industry databases via Integration Gateway
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
            No vendor databases connected.{" "}
            <Link href="/data-sources" className="underline font-semibold hover:text-amber-900">
              Connect one in Data Sources →
            </Link>
          </div>
        ) : (
          <>
            {connectedIndustries.map(ind => (
              <button key={ind}
                onClick={() => { setActiveTab(ind); setSearch(""); }}
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
                onClick={() => { setActiveTab(s.id); setSearch(""); }}
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
                <code className="font-mono bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">{GATEWAY_URL}/vendors?industry={activeTab}</code>
              </span>
              <span className="text-slate-300">·</span>
              <span><span className="font-semibold text-slate-700">DB:</span>{" "}
                <span className="text-brand-600">{industryEngine[activeTab as Industry]}</span>
              </span>
            </>
          )}
        </div>
      )}

      {/* Summary */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: "Total Vendors", value: vendors.length },
            { label: "Active",        value: vendors.filter(v => v.is_active === 1 || v.is_active === true).length },
            { label: "Avg Rating",    value: vendors.length
              ? (vendors.reduce((s,v) => s + parseFloat(v.rating||0), 0) / vendors.length).toFixed(2)
              : "—" },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search + sort */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${uploadedSource ? uploadedSource.name : activeTab} vendors...`} className="form-input pl-9" />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className="form-input w-auto">
          <option value="rating">Sort: Rating</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="section-card p-16 flex items-center justify-center">
          <div className="text-center">
            <Loader2 size={32} className="animate-spin text-brand-500 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading vendors...</p>
          </div>
        </div>
      ) : isError ? (
        <div className="section-card p-12 text-center">
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-red-600">Could not load vendors</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="section-card p-12 text-center">
          <Store size={32} className="text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No vendors found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((vendor: any, i: number) => (
              <VendorCard key={i} vendor={vendor} />
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Database size={12} />
            <span>Source: <strong className="text-slate-600">
              {uploadedSource ? uploadedSource.name : `${activeTab}_vendor_db`}
            </strong> ({uploadedSource ? "PostgreSQL / Onboarding" : industryEngine[activeTab as Industry]}) via {uploadedSource ? "Onboarding Service" : "Integration Gateway"}</span>
          </div>
        </>
      )}
    </div>
  );
}
