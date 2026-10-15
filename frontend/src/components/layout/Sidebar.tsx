"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  CheckSquare,
  FileSignature,
  Package,
  Store,
  Bot,
  ScrollText,
  GitBranch,
  Database,
  Plug,
  Upload,
  BarChart3,
  TrendingUp,
  Users,
  Settings,
  ChevronLeft,
  Box,
  LogOut,
  ShieldAlert,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/store/sidebarStore";
import { authApi, getStoredUser, type UserRole } from "@/lib/api";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

const navigation = [
  {
    section: "PROCUREMENT",
    items: [
      { label: "Dashboard",       href: "/",               icon: LayoutDashboard },
      { label: "Requests",        href: "/requests",        icon: FileText },
      { label: "Purchase Orders", href: "/purchase-orders", icon: ShoppingCart },
      { label: "Approvals",       href: "/approvals",       icon: CheckSquare },
      { label: "Contracts",       href: "/contracts",       icon: FileSignature },
    ],
  },
  {
    section: "INVENTORY & VENDORS",
    items: [
      { label: "Inventory", href: "/inventory", icon: Package },
      { label: "Vendors",   href: "/vendors",   icon: Store },
    ],
  },
  {
    section: "AGENTS & AUTOMATION",
    items: [
      { label: "Kafka Logs",     href: "/kafka-logs",      icon: Radio },
      { label: "Agent Monitor",  href: "/agents",          icon: Bot },
      { label: "Agent Logs",     href: "/agent-logs",      icon: ScrollText },
      { label: "Workflows",      href: "/workflows",       icon: GitBranch },
      { label: "Risk Analysis",  href: "/risk-analysis",   icon: ShieldAlert },
    ],
  },
  {
    section: "INTEGRATIONS",
    items: [
      { label: "Data Sources",    href: "/data-sources",     icon: Database },
      { label: "API Connections", href: "/api-connections",  icon: Plug },
      { label: "File Uploads",    href: "/file-uploads",     icon: Upload },
    ],
  },
  {
    section: "ANALYTICS",
    items: [
      { label: "Reports",        href: "/reports",        icon: BarChart3 },
      { label: "Spend Analysis", href: "/spend-analysis", icon: TrendingUp },
    ],
  },
  {
    section: "SYSTEM",
    items: [
      { label: "Users & Roles", href: "/users",    icon: Users },
      { label: "Settings",      href: "/settings", icon: Settings },
    ],
  },
];

const APPROVER_ROLES: UserRole[] = [
  "Procurement Officer",
  "Operations Manager",
  "Finance Director",
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const { collapsed, toggle } = useSidebarStore();

  const [user, setUser] = useState(getStoredUser());

  useEffect(() => {
    setUser(getStoredUser());
  }, [pathname]);

  const isApprover =
    user?.role !== undefined && APPROVER_ROLES.includes(user.role);

  const filteredNavigation = isApprover
    ? [
        {
          section: "PROCUREMENT",
          items: navigation
            .flatMap((group) => group.items)
            .filter((item) =>
              ["/purchase-orders", "/approvals", "/contracts"].includes(item.href)
            ),
        },
      ]
    : navigation.map((group) => ({
        ...group,
        items: group.items.filter((item) => item.href !== "/approvals"),
      }));

  function handleLogout() {
    authApi.logout();
    qc.clear();
    window.location.href = "/login";
  }

  const initials =
    user?.name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  return (
    <aside
      className={cn(
        "h-screen flex flex-col bg-[#0f172a] text-white transition-all duration-300 shrink-0",
        collapsed ? "w-[68px]" : "w-[232px]"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-600 shrink-0">
          <Box size={16} className="text-white" />
        </div>

        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-white leading-none">
              ProcureFlow
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Intelligent Procurement
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
        {filteredNavigation.map((group) => {
          if (group.items.length === 0) return null;

          return (
            <div key={group.section}>
              {!collapsed && (
                <p className="px-2 mb-1.5 text-[10px] font-semibold tracking-widest text-slate-500">
                  {group.section}
                </p>
              )}

              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href);

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "nav-item",
                          isActive && "active",
                          collapsed && "justify-center px-2"
                        )}
                        title={collapsed ? item.label : undefined}
                      >
                        <item.icon size={16} className="shrink-0" />
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Collapse + User */}
      <div className="border-t border-white/10">
        <button
          onClick={toggle}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 text-slate-400",
            "hover:text-white hover:bg-white/5 transition-colors text-sm",
            collapsed && "justify-center px-2"
          )}
        >
          <ChevronLeft
            size={16}
            className={cn(
              "transition-transform duration-300 shrink-0",
              collapsed && "rotate-180"
            )}
          />

          {!collapsed && <span>Collapse</span>}
        </button>

        <div className="border-t border-white/10 px-3 py-3">
          <div
            className={cn(
              "flex items-center gap-3",
              collapsed && "justify-center"
            )}
          >
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white">
                {initials}
              </span>
            </div>

            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white leading-none truncate">
                  {user?.name || "User"}
                </p>

                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {user?.role || "User"}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={handleLogout}
            className={cn(
              "mt-3 w-full flex items-center gap-2 rounded-md px-2 py-2",
              "text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors",
              collapsed && "justify-center"
            )}
            title={collapsed ? "Logout" : undefined}
          >
            <LogOut size={14} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}


