export type Lang = "en" | "bn";

export interface Subtitle {
  id: string;
  fromLang: Lang;
  original: string;
  translated: string;
  isFinal: boolean;
  seq: number;
  latencyMs?: number;
  at: number;
}

export interface StatusMsg {
  level: "info" | "busy" | "reconnecting" | "slow";
  message: string;
}

export const LANG_LABEL: Record<Lang, string> = { en: "English", bn: "বাংলা (Bengali)" };

export function backendBase(): string {
  const raw = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
  // Empty string = same-origin mode (single ngrok tunnel + Next rewrites).
  // Keeps NEXT_PUBLIC_BACKEND_URL unset/empty in frontend/.env.local for friend test.
  if (!raw || raw.trim() === "") return "";
  return raw.replace(/\/$/, "");
}

export function wsUrlFor(code: string, lang: Lang): string {
  const base = backendBase();
  if (!base) {
    // Same-origin: build wss://host/ws/... from current page (works behind ngrok https).
    if (typeof window !== "undefined") {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${window.location.host}/ws/${code}?lang=${lang}`;
    }
    return `ws://localhost:8000/ws/${code}?lang=${lang}`;
  }
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/ws/${code}?lang=${lang}`;
}
