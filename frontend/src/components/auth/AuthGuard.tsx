"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authApi, getStoredUser, type AuthUser } from "@/lib/api";

const APPROVER_ROLES = [
  "Procurement Officer",
  "Operations Manager",
  "Finance Director",
];

const APPROVER_ALLOWED_ROUTES = [
  "/purchase-orders",
  "/approvals",
  "/contracts",
];

export function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      const storedUser = getStoredUser();

      if (!storedUser) {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }

      try {
        const currentUser = await authApi.me();

        if (APPROVER_ROLES.includes(currentUser.role)) {
          const isAllowed = APPROVER_ALLOWED_ROUTES.some(
            (route) => pathname === route || pathname.startsWith(`${route}/`)
          );
          if (!isAllowed) {
            router.replace("/purchase-orders");
            return;
          }
        }

        if (mounted) {
          setUser(currentUser);
          setChecking(false);
        }
      } catch {
        if (mounted) {
          setUser(null);
          setChecking(false);
        }
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      }
    }

    checkAuth();

    return () => {
      mounted = false;
    };
  }, [pathname, router]);

  if (checking || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <p className="text-sm text-slate-500">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
