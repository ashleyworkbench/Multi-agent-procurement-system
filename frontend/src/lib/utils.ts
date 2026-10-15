import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string | undefined | null, currency: string = "INR"): string {
  if (value === undefined || value === null || isNaN(Number(value))) {
    return "₹0";
  }
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency === "INR" ? "INR" : currency,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatNumber(value: number | string | undefined | null): string {
  if (value === undefined || value === null || isNaN(Number(value))) {
    return "0";
  }
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-IN").format(num);
}

/**
 * Safely parses any date string from the backend into a local Date object.
 * If the string represents UTC but lacks a timezone indicator (e.g. "2026-10-07 15:36:24"),
 * it automatically treats it as UTC so JavaScript accurately converts it to the user's local time.
 */
export function parseDate(dateStr: string | Date | undefined | null): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  let s = String(dateStr).trim();
  if (!s) return null;
  // If date-time string lacks timezone indicator (e.g. "2026-10-07 15:36:24.123" or "2026-10-07T15:36:24")
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(s) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
    s = s.replace(" ", "T") + "Z";
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return "—";
  try {
    const d = parseDate(dateStr);
    if (!d) return String(dateStr);
    return d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(dateStr);
  }
}

export function formatTime(dateStr: string | Date | undefined | null, includeSeconds: boolean = true): string {
  if (!dateStr) return "—";
  try {
    const d = parseDate(dateStr);
    if (!d) return String(dateStr);
    return d.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      ...(includeSeconds ? { second: "2-digit" as const } : {}),
      hour12: true,
    });
  } catch {
    return String(dateStr);
  }
}

export function formatDateTime(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return "—";
  try {
    const d = parseDate(dateStr);
    if (!d) return String(dateStr);
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return String(dateStr);
  }
}

export function formatRelativeTime(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return "—";
  try {
    const d = parseDate(dateStr);
    if (!d) return String(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 10) return "Just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return formatDate(d);
  } catch {
    return String(dateStr);
  }
}

