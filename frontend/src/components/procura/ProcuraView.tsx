"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  MessageSquare, Send, Bot, User, Shield, CheckCircle2,
  Clock, AlertTriangle, ArrowRight, Sparkles, RefreshCw,
  FileText, ArrowUpRight, DollarSign, Calendar, Hash,
  CornerDownLeft, X, Layers, Check, ChevronDown, ChevronUp,
  Download, ExternalLink, HelpCircle
} from "lucide-react";
import { toast } from "sonner";
import {
  procuraApi,
  procurementApi,
  getStoredUser,
  type ProcuraPO,
  type ProcuraChatMessage,
  type ProcuraProposal,
  type AuthUser
} from "@/lib/api";
import { formatCurrency, cn } from "@/lib/utils";

// Demo PO shortcuts for quick verification testing (Live POs in registry)
const DEMO_POS = [
  { po: "PO-2026-16B2AD", vendor: "Ambuja Cements", item: "Bricks (Red Clay)", price: 7.50, qty: 10000 },
  { po: "PO-2026-8588BA", vendor: "UltraTech Cement", item: "AAC Blocks", price: 4200.00, qty: 100 },
  { po: "PO-2026-4ECE1C", vendor: "Ambuja Cements", item: "Bricks (Red Clay)", price: 7.50, qty: 10000 },
  { po: "PO-2026-2B403E", vendor: "UltraTech Cement", item: "AAC Blocks", price: 4200.00, qty: 100 },
];

const QUICK_PROMPTS = [
  "What is the expected delivery date for this PO?",
  "What are our standard payment and QA terms?",
  "We propose revising the unit price to ₹510 due to volume.",
  "Can we extend the delivery date by 4 days?",
  "What is the current approval tier and approver?",
];

export function ProcuraView() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialPoFromUrl = searchParams.get("po") || "";

  // Available POs in registry / for this user
  const [availablePos, setAvailablePos] = useState<ProcuraPO[]>([]);
  const [isLoadingAvailablePos, setIsLoadingAvailablePos] = useState(false);

  // Verification State
  const [poNumberInput, setPoNumberInput] = useState(initialPoFromUrl);
  const [vendorInput, setVendorInput] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [vendorToken, setVendorToken] = useState<string>("");
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  // Live Data State
  const [po, setPo] = useState<ProcuraPO | null>(null);
  const [messages, setMessages] = useState<ProcuraChatMessage[]>([]);
  const [proposals, setProposals] = useState<ProcuraProposal[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  // Chat input & interaction
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showPoDetails, setShowPoDetails] = useState(true);

  // Negotiation Modal State
  const [negotiateModalOpen, setNegotiateModalOpen] = useState(false);
  const [proposedPrice, setProposedPrice] = useState<string>("");
  const [proposedQty, setProposedQty] = useState<string>("");
  const [proposedDate, setProposedDate] = useState<string>("");
  const [negotiateReason, setNegotiateReason] = useState<string>("");
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);

  // Buyer Review State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedProposalForReview, setSelectedProposalForReview] = useState<ProcuraProposal | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch POs available to the logged-in user (Vendor or Approver)
  useEffect(() => {
    const user = getStoredUser();
    setCurrentUser(user);

    if (user?.role === "Vendor") {
      setVendorInput(user.name || (user as any).vendor_name || "");
    }

    const fetchPOs = async () => {
      setIsLoadingAvailablePos(true);
      try {
        const res = await procurementApi.getPOs();
        if (res && res.purchase_orders) {
          setAvailablePos(res.purchase_orders);
        }
      } catch (e) {
        console.warn("Could not fetch available POs for Procura switcher", e);
      } finally {
        setIsLoadingAvailablePos(false);
      }
    };

    fetchPOs();
  }, []);

  // Synchronize active PO when URL param changes
  useEffect(() => {
    if (initialPoFromUrl) {
      setPoNumberInput(initialPoFromUrl);
      loadPoConversation(initialPoFromUrl);
    } else {
      // Clean reset if navigating back to /procura with no po query
      setIsVerified(false);
      setPo(null);
      setMessages([]);
      setProposals([]);
      setVendorToken("");
    }
  }, [initialPoFromUrl]);

  // Load chat and records cleanly for a target PO
  const loadPoConversation = async (targetPoNumber: string, targetVendor?: string) => {
    const poNum = targetPoNumber.trim();
    if (!poNum) return;

    // 1. Immediately reset messages and active PO to prevent displaying previous chat
    setIsLoadingChat(true);
    setPo(null);
    setMessages([]);
    setProposals([]);
    setIsVerified(false);

    try {
      const user = getStoredUser();

      // If user has a valid active session, load chat history directly
      if (user) {
        const res = await procuraApi.getChatHistory(poNum);
        if (res && res.po) {
          setPo(res.po);
          setMessages(res.messages || []);
          setProposals(res.proposals || []);
          setIsVerified(true);
          setPoNumberInput(res.po.po_number);
          setProposedPrice(res.po.unit_price.toString());
          setProposedQty(res.po.quantity.toString());
          setProposedDate(res.po.delivery_date_expected || "");
          return;
        }
      }

      // Guest flow: verify using vendor identifier
      let vendor = (targetVendor || vendorInput).trim();
      if (!vendor) {
        const demo = DEMO_POS.find(d => d.po.toLowerCase() === poNum.toLowerCase());
        if (demo) vendor = demo.vendor;
      }

      if (!vendor) {
        setIsLoadingChat(false);
        return;
      }

      const res = await procuraApi.verifyPO(poNum, vendor);
      if (res.success && res.po) {
        setPo(res.po);
        setVendorToken(res.token);
        setMessages(res.messages || []);
        setProposals(res.proposals || []);
        setIsVerified(true);
        setPoNumberInput(res.po.po_number);
        setProposedPrice(res.po.unit_price.toString());
        setProposedQty(res.po.quantity.toString());
        setProposedDate(res.po.delivery_date_expected || "");
      }
    } catch (err: any) {
      toast.error(err.message || `Could not load conversation for PO ${poNum}`);
    } finally {
      setIsLoadingChat(false);
    }
  };

  // Switch to another PO cleanly
  const handleSelectPo = (newPoNumber: string) => {
    router.replace(`/procura?po=${encodeURIComponent(newPoNumber)}`);
    loadPoConversation(newPoNumber);
  };

  // Switch PO / Return to selection screen
  const handleSwitchPo = () => {
    setIsVerified(false);
    setPo(null);
    setMessages([]);
    setProposals([]);
    setVendorToken("");
    router.replace("/procura");
  };

  // Handle Manual Form Verification
  const handleVerifyPO = async (e?: React.FormEvent, customPo?: string, customVendor?: string) => {
    if (e) e.preventDefault();
    const targetPo = (customPo || poNumberInput).trim();
    const targetVendor = (customVendor || vendorInput).trim();

    if (!targetPo) {
      toast.error("Please enter a Purchase Order number");
      return;
    }
    if (!targetVendor && !currentUser) {
      toast.error("Please enter the authorized Vendor Name or ID");
      return;
    }

    setIsVerifying(true);
    await loadPoConversation(targetPo, targetVendor);
    setIsVerifying(false);
  };

  // Send message to Procura
  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputMessage).trim();
    if (!textToSend || !po || isSending) return;

    // Optimistically append vendor message
    const tempVendorMsg: ProcuraChatMessage = {
      id: Date.now(),
      conversation_id: 0,
      po_number: po.po_number,
      sender: "vendor",
      message: textToSend,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempVendorMsg]);
    setInputMessage("");
    setIsSending(true);

    try {
      const res = await procuraApi.sendMessage(po.po_number, textToSend, vendorToken);
      if (res.messages) {
        setMessages(res.messages);
      }
      if (res.proposals) {
        setProposals(res.proposals);
      }
      if (res.is_proposal && res.proposal) {
        toast.info(`Formal counter-proposal #${res.proposal.id} registered and submitted for buyer review.`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send message to Procura");
    } finally {
      setIsSending(false);
    }
  };

  // Direct Formal Negotiation Submission
  const handleSubmitCounterOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!po) return;

    const priceNum = parseFloat(proposedPrice);
    const qtyNum = parseInt(proposedQty, 10);

    if (isNaN(priceNum) || priceNum <= 0) {
      toast.error("Please enter a valid positive unit price");
      return;
    }
    if (isNaN(qtyNum) || qtyNum <= 0) {
      toast.error("Please enter a valid positive quantity");
      return;
    }

    setIsSubmittingProposal(true);
    try {
      const res = await procuraApi.submitNegotiation({
        po_number: po.po_number,
        proposed_unit_price: priceNum,
        proposed_quantity: qtyNum,
        proposed_delivery_date: proposedDate || undefined,
        reason: negotiateReason.trim() || "Vendor commercial terms adjustment",
      }, vendorToken);

      setMessages(res.messages || []);
      setProposals(res.proposals || []);
      setNegotiateModalOpen(false);
      setNegotiateReason("");
      toast.success(`Proposal #${res.proposal.id} submitted for Buyer review.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit proposal");
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  // Buyer Proposal Review (Approve or Reject)
  const handleReviewProposal = async (action: "APPROVE" | "REJECT") => {
    if (!selectedProposalForReview || !po) return;

    setIsReviewing(true);
    try {
      const res = await procuraApi.reviewProposal(selectedProposalForReview.id, {
        action,
        review_notes: reviewNotes.trim() || (action === "APPROVE" ? "Approved as negotiated" : "Rejected by buyer"),
      });

      toast.success(res.message);
      setReviewModalOpen(false);
      setReviewNotes("");

      const targetPoNumber = (res as any).new_po_number || po.po_number;
      // Refresh PO and chat history
      const refreshed = await procuraApi.getChatHistory(targetPoNumber, vendorToken);
      if (refreshed.po) setPo(refreshed.po);
      if (refreshed.messages) setMessages(refreshed.messages);
      if (refreshed.proposals) setProposals(refreshed.proposals);
      if ((res as any).new_po_number) {
        router.replace(`/procura?po=${(res as any).new_po_number}`);
      }
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action.toLowerCase()} proposal`);
    } finally {
      setIsReviewing(false);
    }
  };

  // Refresh current PO data
  const handleRefreshPO = async () => {
    if (!po) return;
    try {
      const refreshed = await procuraApi.getChatHistory(po.po_number, vendorToken);
      if (refreshed.po) setPo(refreshed.po);
      if (refreshed.messages) setMessages(refreshed.messages);
      if (refreshed.proposals) setProposals(refreshed.proposals);
      toast.success("PO details updated from registry");
    } catch (err: any) {
      toast.error("Failed to refresh PO data");
    }
  };

  // Calculated preview values for negotiation modal
  const calcPrice = parseFloat(proposedPrice) || (po?.unit_price ?? 0);
  const calcQty = parseInt(proposedQty, 10) || (po?.quantity ?? 0);
  const calcTotal = calcPrice * calcQty;
  const currentTotal = po?.total_price ?? 0;
  const variancePct = po?.unit_price ? (((calcPrice - po.unit_price) / po.unit_price) * 100) : 0;

  const pendingProposal = proposals.find(p => p.status === "PENDING");

  const isBuyerRole = currentUser?.role && ["Admin", "Procurement Officer", "Operations Manager", "Finance Director"].includes(currentUser.role);

  if (isLoadingChat) {
    return (
      <div className="max-w-4xl mx-auto py-24 px-4 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 mb-4">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Connecting to Procura Intelligence...</h2>
        <p className="text-sm text-slate-500 mt-1">Retrieving Purchase Order records, policies, and negotiation history</p>
      </div>
    );
  }

  // ===================================================================
  // SCREEN 1: PO Lookup & Vendor Verification Screen
  // ===================================================================
  if (!isVerified || !po) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Banner */}
        <div className="bg-gradient-to-r from-brand-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-8 mb-8 shadow-xl border border-indigo-800/40 relative overflow-hidden">
          <div className="absolute right-0 top-0 -mt-12 -mr-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 mb-3">
            <span className="p-2.5 bg-indigo-500/20 rounded-xl border border-indigo-400/30">
              <Sparkles className="w-6 h-6 text-indigo-300" />
            </span>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-200 text-xs font-semibold tracking-wide border border-indigo-400/20">
              <Bot className="w-3.5 h-3.5 text-indigo-300" />
              Procura AI • RAG Vendor Portal
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Vendor Purchase Order Negotiation Portal
          </h1>
          <p className="text-indigo-200 text-sm max-w-2xl leading-relaxed">
            Enter your authorized Purchase Order number and Vendor name to access grounded PO records,
            clarify commercial terms with Procura RAG assistant, and submit structured price or delivery counter-offers.
          </p>
        </div>

        {/* Active POs Grid */}
        {availablePos.length > 0 && (
          <div className="bg-white rounded-2xl shadow-card border border-slate-200 p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Your Active Purchase Orders</h2>
                  <p className="text-xs text-slate-500">Select an order to open its dedicated Procura AI negotiation chat</p>
                </div>
              </div>
              <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-semibold border border-indigo-100">
                {availablePos.length} Orders Available
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {availablePos.map((item) => (
                <div
                  key={item.po_number}
                  onClick={() => handleSelectPo(item.po_number)}
                  className="cursor-pointer group p-4 rounded-xl border border-slate-200 hover:border-indigo-500 bg-slate-50/60 hover:bg-indigo-50/40 transition-all shadow-sm hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-brand-600 group-hover:text-indigo-600">
                        {item.po_number}
                      </span>
                      <span className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                        item.status === "APPROVED" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                        item.status === "PENDING_APPROVAL" && "bg-amber-50 text-amber-700 border-amber-200",
                        item.status === "ORDERED" && "bg-purple-50 text-purple-700 border-purple-200",
                        item.status === "DELIVERED" && "bg-blue-50 text-blue-700 border-blue-200",
                      )}>
                        {item.status}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-950 transition-colors">
                      {item.item_name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {item.quantity} units • ₹{Number(item.unit_price).toFixed(2)}/unit
                    </div>
                    <div className="text-xs font-bold text-slate-800 mt-2">
                      Total: ₹{Number(item.total_price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="mt-3.5 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-indigo-600 group-hover:text-indigo-700">
                    <span>Chat & Negotiate</span>
                    <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verification Card */}
        <div className="bg-white rounded-2xl shadow-card border border-slate-200 p-8 mb-8">
          <div className="flex items-center gap-3 pb-6 border-b border-slate-100 mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 font-bold">
              <Shield className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">PO Security & Verification</h2>
              <p className="text-xs text-slate-500">Provide PO number and authorized vendor identity to establish session</p>
            </div>
          </div>

          <form onSubmit={handleVerifyPO} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                  Purchase Order Number
                </label>
                <div className="relative">
                  <Hash className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={poNumberInput}
                    onChange={(e) => setPoNumberInput(e.target.value)}
                    placeholder="e.g. PO-2024-0002"
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                  Authorized Vendor Name or ID
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={vendorInput}
                    onChange={(e) => setVendorInput(e.target.value)}
                    placeholder="e.g. Tata Steel"
                    className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
                    required
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isVerifying}
              className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Verifying Purchase Order Registry...
                </>
              ) : (
                <>
                  Verify PO & Access Procura Chat
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Selector */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Quick Test Demo Purchase Orders (Click to fill & verify)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DEMO_POS.map((demo) => (
                <button
                  key={demo.po}
                  type="button"
                  onClick={() => {
                    setPoNumberInput(demo.po);
                    setVendorInput(demo.vendor);
                    handleVerifyPO(undefined, demo.po, demo.vendor);
                  }}
                  className="p-3 text-left bg-slate-50 hover:bg-indigo-50/60 border border-slate-200 hover:border-indigo-300 rounded-xl transition-all group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-bold text-brand-600 group-hover:text-indigo-600">
                      {demo.po}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      ₹{demo.price}/unit
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-800">{demo.item}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Vendor: {demo.vendor} • {demo.qty} units</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-slate-600 text-xs">
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-800 block mb-0.5">RAG Grounded Intelligence</span>
              Answers strictly grounded in live PostgreSQL records, contract policies, and SLAs.
            </div>
          </div>
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
            <Shield className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-800 block mb-0.5">Absolute PO Safety</span>
              Proposals are safely staged as PENDING; only authorized human buyers can approve revisions.
            </div>
          </div>
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
            <Layers className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-800 block mb-0.5">Audit Trail & DocuSign</span>
              Full revision history logged to procurement_audit with automatic PDF re-generation.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===================================================================
  // SCREEN 2: Procura Command Center (Verified Active PO & Chat)
  // ===================================================================
  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-white rounded-2xl shadow-card border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white flex items-center justify-center shadow-md">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 font-mono">{po.po_number}</h1>
              <span className={cn(
                "badge text-xs px-2.5 py-0.5 rounded-full font-semibold",
                po.status === "APPROVED" && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                po.status === "PENDING_APPROVAL" && "bg-amber-50 text-amber-700 border border-amber-200",
                po.status === "ORDERED" && "bg-purple-50 text-purple-700 border border-purple-200",
                po.status === "DELIVERED" && "bg-blue-50 text-blue-700 border border-blue-200",
                po.status === "REJECTED" && "bg-red-50 text-red-700 border border-red-200",
              )}>
                {po.status}
              </span>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                {po.approval_tier || "TIER_1_OFFICER"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Vendor: <strong className="text-slate-700">{po.vendor_name}</strong> • Item: <span className="text-slate-800 font-medium">{po.item_name}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {availablePos.length > 1 && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
              <span className="text-slate-500 font-medium hidden sm:inline">PO:</span>
              <select
                value={po.po_number}
                onChange={(e) => handleSelectPo(e.target.value)}
                className="bg-transparent text-xs font-mono font-bold text-indigo-700 focus:outline-none cursor-pointer"
              >
                {availablePos.map((p) => (
                  <option key={p.po_number} value={p.po_number}>
                    {p.po_number} ({p.item_name})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setShowPoDetails(!showPoDetails)}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            {showPoDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showPoDetails ? "Hide PO Details" : "Show PO Details"}
          </button>

          <button
            onClick={() => setNegotiateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
          >
            <DollarSign className="w-4 h-4" />
            Propose Terms
          </button>

          <button
            onClick={handleRefreshPO}
            title="Refresh PO records"
            className="btn-secondary text-xs py-1.5 px-2.5 text-slate-600"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleSwitchPo}
            className="text-xs text-slate-500 hover:text-slate-800 underline px-2 py-1"
          >
            Switch PO
          </button>
        </div>
      </div>

      {/* Collapsible PO Summary Card */}
      {showPoDetails && (
        <div className="bg-white rounded-2xl shadow-card border border-slate-200 p-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Item Name</div>
              <div className="text-sm font-semibold text-slate-800 mt-1 truncate" title={po.item_name}>{po.item_name}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Quantity</div>
              <div className="text-sm font-semibold text-slate-800 mt-1">{po.quantity} units</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Unit Price</div>
              <div className="text-sm font-semibold text-slate-800 mt-1">₹{Number(po.unit_price).toFixed(2)}</div>
            </div>

            <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100">
              <div className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">Total Amount</div>
              <div className="text-sm font-bold text-indigo-900 mt-1">₹{Number(po.total_price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Expected Delivery</div>
              <div className="text-sm font-semibold text-slate-800 mt-1">{po.delivery_date_expected || "Not Set"}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Assigned Approver</div>
              <div className="text-sm font-semibold text-slate-800 mt-1 truncate" title={po.assigned_approver_name || "Procurement Officer"}>
                {po.assigned_approver_name || "Procurement Officer"}
              </div>
            </div>
          </div>

          {/* Pending Proposal Notice Banner */}
          {pendingProposal && (
            <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-200 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-amber-900 flex items-center gap-2">
                    Pending Buyer Review: Proposal #{pendingProposal.id}
                    <span className="text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-mono">
                      Variance: {pendingProposal.price_variance_pct > 0 ? `+${pendingProposal.price_variance_pct}%` : `${pendingProposal.price_variance_pct}%`}
                    </span>
                  </div>
                  <div className="text-xs text-amber-800 mt-0.5">
                    Proposed: ₹{Number(pendingProposal.proposed_unit_price || po.unit_price).toFixed(2)}/unit • {pendingProposal.proposed_quantity || po.quantity} units • Delivery: {pendingProposal.proposed_delivery_date || po.delivery_date_expected} • Total: ₹{Number(pendingProposal.proposed_total_price).toLocaleString("en-IN")}
                  </div>
                  {pendingProposal.reason && (
                    <div className="text-[11px] text-amber-700 italic mt-0.5">Reason: "{pendingProposal.reason}"</div>
                  )}
                </div>
              </div>

              {isBuyerRole && (
                <button
                  onClick={() => {
                    setSelectedProposalForReview(pendingProposal);
                    setReviewModalOpen(true);
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all"
                >
                  Review as Buyer
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Chat Interface */}
      <div className="bg-white rounded-2xl shadow-card border border-slate-200 flex flex-col h-[650px] overflow-hidden">
        {/* Chat Stream Header */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-slate-800">
              Procura Grounded Engine • Gemini LLM + RAG Active
            </span>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            PO Ref: {po.po_number}
          </span>
        </div>

        {/* Message Stream */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/50">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-8">
              <Bot className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-600">Procura is ready.</p>
              <p className="text-xs text-slate-400 mt-1">Ask any question regarding this PO or propose revised terms.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isAssistant = msg.sender === "assistant";
              const isSystem = msg.sender === "system";

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center my-3">
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded-xl text-xs max-w-xl text-center shadow-xs flex items-center gap-2 font-medium">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{msg.message}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3 max-w-[85%]",
                    isAssistant ? "mr-auto" : "ml-auto flex-row-reverse"
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 mt-0.5",
                      isAssistant
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-slate-700 text-white"
                    )}
                  >
                    {isAssistant ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>

                  <div
                    className={cn(
                      "p-4 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-xs",
                      isAssistant
                        ? "bg-white text-slate-800 border border-slate-200 rounded-tl-sm"
                        : "bg-brand-600 text-white rounded-tr-sm"
                    )}
                  >
                    <div className="whitespace-pre-wrap">{msg.message}</div>

                    {/* Metadata / Policy chips for Assistant */}
                    {isAssistant && msg.structured_data?.policy_summary && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-indigo-700 font-medium">
                        <Shield className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Policy Grounding: {msg.structured_data.policy_summary}</span>
                      </div>
                    )}

                    <div className={cn(
                      "text-[10px] mt-1.5 text-right font-mono",
                      isAssistant ? "text-slate-400" : "text-brand-100"
                    )}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {isSending && (
            <div className="flex gap-3 max-w-[80%] mr-auto">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-3.5 bg-white text-slate-600 border border-slate-200 rounded-2xl rounded-tl-sm shadow-xs flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                <span>Procura is retrieving procurement context and reasoning...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Pills */}
        <div className="px-6 py-2.5 bg-white border-t border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-500" /> Suggestions:
          </span>
          {QUICK_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(prompt)}
              className="text-xs bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 px-3 py-1 rounded-full border border-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Message Input Box */}
        <div className="p-4 bg-white border-t border-slate-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask Procura about delivery, payment, or propose counter terms..."
              disabled={isSending}
              className="flex-1 px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
            />

            <button
              type="submit"
              disabled={isSending || !inputMessage.trim()}
              className="p-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl shadow-sm transition-all disabled:opacity-40"
              title="Send Message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* =============================================================== */}
      {/* MODAL 1: Structured Negotiation / Counter-Offer Submission     */}
      {/* =============================================================== */}
      {negotiateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Propose Revised Terms</h3>
                  <p className="text-xs text-slate-500">For Purchase Order: {po.po_number}</p>
                </div>
              </div>
              <button
                onClick={() => setNegotiateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitCounterOffer} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Proposed Unit Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={proposedPrice}
                    onChange={(e) => setProposedPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 font-mono"
                    placeholder="e.g. 510.00"
                    required
                  />
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Current: ₹{Number(po.unit_price).toFixed(2)}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Proposed Quantity
                  </label>
                  <input
                    type="number"
                    value={proposedQty}
                    onChange={(e) => setProposedQty(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 font-mono"
                    placeholder="e.g. 100"
                    required
                  />
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Current: {po.quantity} units
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Proposed Expected Delivery Date
                </label>
                <input
                  type="date"
                  value={proposedDate}
                  onChange={(e) => setProposedDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Current: {po.delivery_date_expected || "Not specified"}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Commercial Justification / Reason
                </label>
                <textarea
                  value={negotiateReason}
                  onChange={(e) => setNegotiateReason(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g. Raw material price adjustment, volume discount, freight timeline adjustment..."
                />
              </div>

              {/* Dynamic Delta Calculation Box */}
              <div className="p-3.5 bg-indigo-50/70 rounded-xl border border-indigo-100 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>Current PO Total:</span>
                  <span className="font-mono font-medium">₹{Number(currentTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-indigo-900 font-bold">
                  <span>Revised PO Total:</span>
                  <span className="font-mono">₹{Number(calcTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 pt-1 border-t border-indigo-200/50">
                  <span>Price Variance:</span>
                  <span className={cn(
                    "font-bold font-mono",
                    variancePct > 0 ? "text-amber-700" : "text-emerald-700"
                  )}>
                    {variancePct > 0 ? `+${variancePct.toFixed(2)}%` : `${variancePct.toFixed(2)}%`}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNegotiateModalOpen(false)}
                  className="flex-1 py-2.5 btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProposal}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all disabled:opacity-50"
                >
                  {isSubmittingProposal ? "Submitting Proposal..." : "Submit for Buyer Review"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =============================================================== */}
      {/* MODAL 2: Buyer Review Modal (Authorized Approval Action)       */}
      {/* =============================================================== */}
      {reviewModalOpen && selectedProposalForReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Authorize Proposal #{selectedProposalForReview.id}</h3>
                  <p className="text-xs text-slate-500">PO: {selectedProposalForReview.po_number}</p>
                </div>
              </div>
              <button
                onClick={() => setReviewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Unit Price:</span>
                  <span className="font-semibold text-slate-800">
                    ₹{selectedProposalForReview.current_unit_price} → ₹{selectedProposalForReview.proposed_unit_price || selectedProposalForReview.current_unit_price}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Quantity:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedProposalForReview.current_quantity} → {selectedProposalForReview.proposed_quantity || selectedProposalForReview.current_quantity} units
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Delivery Date:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedProposalForReview.current_delivery_date || "None"} → {selectedProposalForReview.proposed_delivery_date || "Unchanged"}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                  <span className="text-slate-700">Total Price:</span>
                  <span className="text-indigo-900 font-mono">
                    ₹{Number(selectedProposalForReview.proposed_total_price).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              {selectedProposalForReview.reason && (
                <div className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Vendor Reason:</span>
                  <p className="mt-0.5 text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    "{selectedProposalForReview.reason}"
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Buyer Review Notes / Audit Explanation
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g. Price approved within department tolerance. Schedule acceptable."
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  disabled={isReviewing}
                  onClick={() => handleReviewProposal("REJECT")}
                  className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-xs rounded-lg border border-red-200 transition-all disabled:opacity-50"
                >
                  Reject Proposal
                </button>
                <button
                  type="button"
                  disabled={isReviewing}
                  onClick={() => handleReviewProposal("APPROVE")}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all disabled:opacity-50"
                >
                  Approve & Update PO
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
