"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, Calendar, ChevronDown, Plus, Search, RotateCcw,
  Upload, X, Check, FileText, CheckCircle2, Clock, AlertTriangle,
  ExternalLink, Sparkles, Trash2, Loader2, Play
} from "lucide-react";
import { format, subDays } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { procurementApi, ocrApi, INDUSTRIES, Industry } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PAGE_META: Record<string, { title: string; subtitle: string; tag: string }> = {
  "/": {
    title: "Procurement Command Center",
    subtitle: "Real-time Autonomous Pipeline Overview",
    tag: "Agent System Active",
  },
  "/requests": {
    title: "Procurement Ingestion & Extraction",
    subtitle: "Invoice Parsing via Agent 1 (OCR + Docling + Gemini)",
    tag: "Agent 1 Active",
  },
  "/purchase-orders": {
    title: "Purchase Orders & Signatures",
    subtitle: "Rule-based Routing, DocuSign eSignatures & MinIO Storage",
    tag: "Agent 4 Active",
  },
  "/approvals": {
    title: "Executive Approval Portal",
    subtitle: "Tiered Authorization & Digital Signatures",
    tag: "DocuSign Ready",
  },
  "/inventory": {
    title: "Multi-Industry Inventory",
    subtitle: "Catalog & Stock Monitoring across Industries",
    tag: "Inventory DB",
  },
  "/vendors": {
    title: "Vendor Management",
    subtitle: "Rule-based Vendor Selection & Rating Matrix",
    tag: "Vendor DB",
  },
  "/workflows": {
    title: "Autonomous Agent Workflows",
    subtitle: "Multi-Agent Orchestration & Pipeline Visualizer",
    tag: "Kafka Pipeline",
  },
  "/agent-logs": {
    title: "Agent Audit & Telemetry Logs",
    subtitle: "Distributed Trace Logs across Agents 1 → 4",
    tag: "Audit Trail",
  },
  "/file-uploads": {
    title: "Direct Document Uploads",
    subtitle: "Batch Invoice Ingestion Portal",
    tag: "Ingestion Engine",
  },
};

type DateFilterOption = "today" | "7days" | "30days" | "all";

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();

  // Date Filter state
  const [dateFilter, setDateFilter] = useState<DateFilterOption>("7days");
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const dateDropdownRef = useRef<HTMLDivElement>(null);

  // Notifications state
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  // New Request modal state
  const [newRequestModalOpen, setNewRequestModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState<Industry>("construction");
  const [isExtracting, setIsExtracting] = useState(false);

  // Reset Demo modal state
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Search input
  const [searchQuery, setSearchQuery] = useState("");

  const today = new Date();
  const dateRanges: Record<DateFilterOption, { label: string; text: string }> = {
    today: {
      label: "Today",
      text: format(today, "MMM dd, yyyy"),
    },
    "7days": {
      label: "Last 7 Days",
      text: `${format(subDays(today, 6), "MMM dd")} – ${format(today, "MMM dd, yyyy")}`,
    },
    "30days": {
      label: "Last 30 Days",
      text: `${format(subDays(today, 29), "MMM dd")} – ${format(today, "MMM dd, yyyy")}`,
    },
    all: {
      label: "All Time",
      text: "All Records",
    },
  };

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(event.target as Node)) {
        setDateDropdownOpen(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch recent events for Notifications
  const { data: eventsData } = useQuery({
    queryKey: ["recent-events"],
    queryFn: () => procurementApi.getEvents({ limit: 6 }),
    refetchInterval: 10000,
  });
  const recentEvents = eventsData?.events ?? [];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    toast.info(`Searching for "${searchQuery}" in POs & Requests...`);
    router.push(`/purchase-orders?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleStartExtraction = async () => {
    if (!selectedFile) return;
    setIsExtracting(true);
    const form = new FormData();
    form.append("file", selectedFile);
    try {
      const GATEWAY_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const resp = await fetch(`${GATEWAY_URL}/agent1/upload`, {
        method: "POST",
        body: form,
      });
      if (!resp.ok) throw new Error(await resp.text());
      toast.success(`${selectedFile.name} uploaded! Agent 1 pipeline initiated.`);
      setSelectedFile(null);
      setNewRequestModalOpen(false);
      qc.invalidateQueries({ queryKey: ["ocr-requests-list"] });
      qc.invalidateQueries({ queryKey: ["agent1-documents"] });
      router.push("/requests");
    } catch (err: any) {
      toast.error(`Extraction failed: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleResetDemo = async () => {
    setIsResetting(true);
    try {
      await procurementApi.resetDemo();
      toast.success("Demo environment cleanly reset! Ready for fresh presentation.");
      setResetConfirmOpen(false);
      qc.invalidateQueries();
      window.location.reload();
    } catch (err: any) {
      toast.error(`Reset failed: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  const currentMeta = PAGE_META[pathname] || {
    title: "Multi-Agent Autonomous Procurement",
    subtitle: "End-to-End Enterprise Procurement Pipeline",
    tag: "Active",
  };

  return (
    <>
      <header className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-100 shrink-0 z-20">
        {/* Left: Dynamic page context according to system needs & page significance */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 truncate">
                {currentMeta.title}
              </h2>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-200">
                {currentMeta.tag}
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate hidden md:block">
              {currentMeta.subtitle}
            </p>
          </div>

          {/* Date range pill with interactive dropdown */}
          <div className="relative ml-2 hidden lg:block" ref={dateDropdownRef}>
            <button
              onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors shadow-sm"
              title="Filter date range"
            >
              <Calendar size={13} className="text-brand-600" />
              <span>{dateRanges[dateFilter].text}</span>
              <ChevronDown size={12} className="text-slate-400" />
            </button>

            {dateDropdownOpen && (
              <div className="absolute left-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Select Timeframe
                </div>
                {(["today", "7days", "30days", "all"] as DateFilterOption[]).map(key => (
                  <button
                    key={key}
                    onClick={() => {
                      setDateFilter(key);
                      setDateDropdownOpen(false);
                      toast.info(`Timeframe filtered to: ${dateRanges[key].label}`);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <span>{dateRanges[key].label}</span>
                    {dateFilter === key && <Check size={13} className="text-brand-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Search + Reset Demo + New Request + Notifications + Profile */}
        <div className="flex items-center gap-2.5">
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="relative hidden xl:block">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search POs, vendors, items..."
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-48 focus:w-64 transition-all
                         focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white placeholder-slate-400"
            />
          </form>

          {/* Reset Demo Button */}
          <button
            onClick={() => setResetConfirmOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors shadow-sm"
            title="Clear demo data and reset environment for guide demonstration"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">Reset Demo</span>
          </button>

          {/* New Request button */}
          <button
            onClick={() => setNewRequestModalOpen(true)}
            className="btn-primary py-1.5 px-3 text-xs gap-1.5 shadow-sm"
          >
            <Plus size={14} />
            <span>New Request</span>
          </button>

          {/* Notifications Dropdown */}
          <div className="relative" ref={notifDropdownRef}>
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="System Notifications & Events"
            >
              <Bell size={17} />
              {recentEvents.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell size={14} className="text-brand-400" />
                    <span className="text-xs font-bold">System Telemetry & Alerts</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    Live
                  </span>
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                  {recentEvents.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      No recent agent events.
                    </div>
                  ) : (
                    recentEvents.map((evt: any, i: number) => (
                      <div key={i} className="p-3 hover:bg-slate-50 transition-colors text-xs">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-semibold text-brand-700 uppercase">
                            {evt.source_agent || "System"}
                          </span>
                          <span className="text-slate-400">
                            {evt.timestamp ? format(new Date(evt.timestamp), "HH:mm:ss") : "Now"}
                          </span>
                        </div>
                        <p className="text-slate-700 text-xs line-clamp-2">
                          {evt.description || evt.event_type || JSON.stringify(evt.payload || {})}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
                  <button
                    onClick={() => {
                      setNotificationsOpen(false);
                      router.push("/agent-logs");
                    }}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                  >
                    View All Audit Logs <ExternalLink size={11} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Profile */}
          <div
            className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center cursor-pointer shadow-sm"
            title="Procurement Officer (Admin)"
          >
            <span className="text-xs font-bold text-white">PO</span>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* New Request Modal                                             */}
      {/* ------------------------------------------------------------- */}
      {newRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center">
                  <Upload size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">New Procurement Request</h3>
                  <p className="text-xs text-slate-500">Initiate Agent 1 OCR & Data Extraction</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setNewRequestModalOpen(false);
                  setSelectedFile(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Industry Context
                </label>
                <select
                  value={selectedIndustry}
                  onChange={e => setSelectedIndustry(e.target.value as Industry)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 capitalize font-medium"
                >
                  {INDUSTRIES.map(ind => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Invoice or Requisition Document
                </label>
                {selectedFile ? (
                  <div className="flex items-center justify-between p-3.5 rounded-xl border border-brand-300 bg-brand-50/50">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText size={18} className="text-brand-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{selectedFile.name}</p>
                        <p className="text-[11px] text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 hover:border-brand-400 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors">
                    <Upload size={24} className="text-slate-400 mb-2" />
                    <span className="text-xs font-semibold text-slate-700">Choose Invoice PDF or Image</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">Supports PDF, PNG, JPG</span>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="sr-only"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) setSelectedFile(f);
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setNewRequestModalOpen(false);
                  setSelectedFile(null);
                }}
                disabled={isExtracting}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartExtraction}
                disabled={!selectedFile || isExtracting}
                className="btn-primary py-2 px-4 text-xs font-semibold gap-1.5 disabled:opacity-50"
              >
                {isExtracting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Starting Agent 1...
                  </>
                ) : (
                  <>
                    <Play size={12} className="fill-white" />
                    Extract & Route
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Demo Reset Confirmation Modal                                 */}
      {/* ------------------------------------------------------------- */}
      {resetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-5 bg-amber-500 text-white flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <RotateCcw size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold">Reset Demo Records</h3>
                <p className="text-xs text-amber-100">Clean slate for live guide presentations</p>
              </div>
            </div>

            <div className="p-5 text-xs text-slate-600 space-y-3">
              <p>
                This will delete demo generated records, including:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-700">
                <li>Temporary extracted OCR requests and processing history</li>
                <li>Created Purchase Orders and test signatures</li>
                <li>Real-time event and audit logs</li>
              </ul>
              <p className="text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200 font-medium">
                Core master catalogs (inventory items, registered vendors, and approver rules) will remain completely intact.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setResetConfirmOpen(false)}
                disabled={isResetting}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Keep Records
              </button>
              <button
                onClick={handleResetDemo}
                disabled={isResetting}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors inline-flex items-center gap-1.5"
              >
                {isResetting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Resetting Environment...
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    Confirm Clean-up
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

