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
  const url = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
  return url.replace(/\/$/, "");
}

export function wsUrlFor(code: string, lang: Lang): string {
  const base = backendBase().replace(/^http/, "ws");
  return `${base}/ws/${code}?lang=${lang}`;
}
