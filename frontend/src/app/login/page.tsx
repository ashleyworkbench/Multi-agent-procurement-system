"use client";

import { FormEvent, Suspense, useState, useEffect } from "react";
import { Eye, EyeOff, Building2, Shield, ArrowRight, CheckCircle2, Star } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { authApi, getStoredUser } from "@/lib/api";

const DEMO_VENDORS = [
  {
    id: 8,
    name: "Ambuja Cements",
    email: "neha@ambuja.com",
    city: "Ahmedabad",
    rating: 4.35,
    tag: "Active Orders: Bricks, Cement",
  },
  {
    id: 2,
    name: "UltraTech Cement",
    email: "kavitha@ultratech.com",
    city: "Ahmedabad",
    rating: 4.7,
    tag: "Active Orders: AAC Blocks",
  },
  {
    id: 3,
    name: "Tata Steel",
    email: "rahul@tatasteel.com",
    city: "Jamshedpur",
    rating: 4.8,
    tag: "Supplier: TMT Rebar, Steel",
  },
  {
    id: 1,
    name: "ACC Cement Ltd",
    email: "suresh@acccement.com",
    city: "Mumbai",
    rating: 4.5,
    tag: "Supplier: Grade 53 Cement",
  },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"buyer" | "vendor">("buyer");

  // Buyer Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Vendor Form state
  const [vendorIdentifier, setVendorIdentifier] = useState("");
  const [vendorPassword, setVendorPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleBuyerSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await authApi.login(email.trim(), password);
      qc.clear();

      const user = getStoredUser();
      const requestedRedirect = searchParams.get("redirect");

      const destination =
        requestedRedirect && user?.role !== "Admin"
          ? requestedRedirect
          : user?.role === "Admin"
          ? "/"
          : "/purchase-orders";

      window.location.href = destination;
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Invalid email or password. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVendorLogin = async (vendorData?: { vendor_id?: number; vendor_name?: string; email?: string }) => {
    setError("");
    setLoading(true);

    try {
      const payload = vendorData || {
        email: vendorIdentifier.includes("@") ? vendorIdentifier.trim() : undefined,
        vendor_name: !vendorIdentifier.includes("@") ? vendorIdentifier.trim() : undefined,
        password: vendorPassword || "VendorPass@123",
      };

      await authApi.vendorLogin(payload);
      qc.clear();

      const requestedRedirect = searchParams.get("redirect");
      const destination =
        requestedRedirect && !requestedRedirect.includes("/login")
          ? requestedRedirect
          : "/vendor-portal";

      window.location.href = destination;
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Could not verify vendor account. Please choose a registered vendor."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100/80 px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Outer Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200/80 p-8 sm:p-10">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 mb-3">
              <Building2 size={24} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              ProcureFlow Enterprise
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Multi-Agent Procurement & Vendor Collaboration Platform
            </p>
          </div>

          {/* Login Type Segmented Switcher */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6 border border-slate-200">
            <button
              type="button"
              onClick={() => { setActiveTab("buyer"); setError(""); }}
              className={`flex-1 py-2.5 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === "buyer"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Shield size={16} className={activeTab === "buyer" ? "text-blue-600" : ""} />
              Internal Approvers
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("vendor"); setError(""); }}
              className={`flex-1 py-2.5 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === "vendor"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Building2 size={16} className={activeTab === "vendor" ? "text-emerald-600" : ""} />
              Vendor Partner Portal
            </button>
          </div>

          {error && (
            <div className="mb-5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs sm:text-sm text-red-700 animate-in fade-in">
              {error}
            </div>
          )}

          {activeTab === "buyer" ? (
            /* Buyer Login Form */
            <div>
              <form onSubmit={handleBuyerSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Corporate Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@procureflow.local"
                    required
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="w-full rounded-xl border border-slate-300 px-4 py-2.5 pr-12 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 shadow-md shadow-blue-500/20 disabled:opacity-50 transition active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  {loading ? "Authenticating..." : "Sign in to Procurement"}
                  <ArrowRight size={16} />
                </button>
              </form>

              {/* Demo Internal Accounts */}
              <div className="mt-6 pt-5 border-t border-slate-100">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 text-center">
                  1-Click Role Login (Password: Password@123)
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => { setEmail("admin@procureflow.local"); setPassword("Password@123"); }}
                    className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-800 text-left transition font-medium flex items-center justify-between"
                  >
                    <span>🛠️ System Admin</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEmail("officer.procurement@procureflow.local"); setPassword("Password@123"); }}
                    className="p-2.5 border border-blue-200 rounded-xl bg-blue-50/40 hover:bg-blue-100/50 text-blue-900 text-left transition font-medium flex items-center justify-between"
                  >
                    <span>📋 Officer (&lt; ₹50k)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEmail("manager.ops@procureflow.local"); setPassword("Password@123"); }}
                    className="p-2.5 border border-amber-200 rounded-xl bg-amber-50/40 hover:bg-amber-100/50 text-amber-900 text-left transition font-medium flex items-center justify-between"
                  >
                    <span>👔 Manager (₹50k-₹2L)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEmail("director.finance@procureflow.local"); setPassword("Password@123"); }}
                    className="p-2.5 border border-purple-200 rounded-xl bg-purple-50/40 hover:bg-purple-100/50 text-purple-900 text-left transition font-medium flex items-center justify-between"
                  >
                    <span>💼 Director (&gt; ₹2L)</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Vendor Partner Login */
            <div>
              <p className="text-xs text-slate-600 mb-3 font-medium">
                Select your verified vendor account to enter the Vendor Portal and chat with Procura AI:
              </p>

              {/* Vendor Fast-Logins */}
              <div className="space-y-2 mb-5">
                {DEMO_VENDORS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={loading}
                    onClick={() => handleVendorLogin({ vendor_id: v.id, vendor_name: v.name, email: v.email })}
                    className="w-full text-left p-3 rounded-2xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition group flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm group-hover:text-emerald-700">
                          {v.name}
                        </span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                          ID #{v.id}
                        </span>
                        <span className="flex items-center text-[10px] text-amber-600 font-semibold gap-0.5">
                          <Star size={10} className="fill-amber-400 text-amber-400" />
                          {v.rating}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{v.tag} • {v.city}</p>
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-emerald-600 group-hover:text-white text-slate-400 flex items-center justify-center shrink-0 transition">
                      <ArrowRight size={14} />
                    </div>
                  </button>
                ))}
              </div>

              {/* Or manual vendor entry */}
              <div className="pt-4 border-t border-slate-100">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Or enter vendor credentials
                </p>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={vendorIdentifier}
                    onChange={(e) => setVendorIdentifier(e.target.value)}
                    placeholder="Vendor email or company name"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  />
                  <button
                    type="button"
                    disabled={loading || !vendorIdentifier.trim()}
                    onClick={() => handleVendorLogin()}
                    className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {loading ? "Connecting..." : "Sign in as Vendor"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-slate-500 text-sm">Loading ProcureFlow authentication...</div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}