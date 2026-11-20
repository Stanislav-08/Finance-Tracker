import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
export type DatePref = "system" | "DMY" | "MDY" | "ISO";
export type TimePref = "system" | "h12" | "h24";
export interface Prefs { theme: ThemePref; date: DatePref; time: TimePref }

const KEY = "prefs";
const DEFAULTS: Prefs = { theme: "system", date: "system", time: "system" };
const listeners = new Set<() => void>();
let cached: Prefs | null = null;

export function getPrefs(): Prefs {
  if (cached) return cached;
  try {
    cached = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached as Prefs;
}

export function setPrefs(patch: Partial<Prefs>) {
  cached = { ...getPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cached)); } catch { /* storage unavailable */ }
  applyTheme();
  listeners.forEach((l) => l());
}

export function usePrefs() {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return getPrefs();
}

// ---- theme: follows the browser/OS theme unless the user picked one ----
const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

export const resolvedTheme = () => {
  const t = getPrefs().theme;
  return t === "system" ? (mq?.matches ? "dark" : "light") : t;
};

export function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme();
}

export function initTheme() {
  applyTheme();
  mq?.addEventListener("change", () => { if (getPrefs().theme === "system") { applyTheme(); listeners.forEach((l) => l()); } });
}

// ---- date / time formatting ----
const pad = (n: number) => String(n).padStart(2, "0");

export function fmtDate(v: string | number | Date) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  switch (getPrefs().date) {
    case "DMY": return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    case "MDY": return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    case "ISO": return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    default: return d.toLocaleDateString();
  }
}

export function fmtTime(v: string | number | Date) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  switch (getPrefs().time) {
    case "h24": return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case "h12": return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
    default: return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

export const fmtDateTime = (v: string | number | Date) => `${fmtDate(v)} ${fmtTime(v)}`;

/** Today as YYYY-MM-DD in the user's own timezone (toISOString would use UTC). */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
