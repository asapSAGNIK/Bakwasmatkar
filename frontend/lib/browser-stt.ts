/** Browser-native fallback STT (Web Speech API, Chrome/Edge).
 * Used only when backend reports stt_provider=browser (no GROQ_API_KEY).
 * Streams interim results as text-partial so the argument still feels live.
 */

import type { Lang } from "./types";

export interface PartialCb {
  (text: string, isFinal: boolean): void;
}

export function browserSTTSupported(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown }).SpeechRecognition
    || !!(window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
}

export function startBrowserSTT(lang: Lang, onPartial: PartialCb): () => void {
  const w = window as unknown as {
    SpeechRecognition?: new () => BrowserRecognizer;
    webkitSpeechRecognition?: new () => BrowserRecognizer;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return () => undefined;
  const rec: BrowserRecognizer = new Ctor();
  rec.lang = lang === "bn" ? "bn-BD" : "en-US";
  rec.interimResults = true;
  rec.continuous = true;
  rec.onresult = (e) => {
    let interim = "";
    let finalText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]!;
      if (res.isFinal) finalText += res[0]!.transcript;
      else interim += res[0]!.transcript;
    }
    if (finalText) onPartial(finalText, true);
    else if (interim) onPartial(interim, false);
  };
  // Auto-restart on end (Chrome stops after ~60s of continuous).
  let stopped = false;
  rec.onend = () => {
    if (!stopped) {
      try { rec.start(); } catch { /* already started */ }
    }
  };
  try { rec.start(); } catch { /* noop */ }
  return () => { stopped = true; try { rec.stop(); } catch { /* noop */ } };
}

interface BrowserRecognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0?: { transcript: string } }>;
}
