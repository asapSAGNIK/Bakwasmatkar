/** Browser-native fallback TTS (speechSynthesis). Always available. */

import type { Lang } from "./types";

let current: SpeechSynthesisUtterance | null = null;

export function speakBrowser(text: string, lang: Lang, heat = 0): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  stopBrowserSpeech();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "bn" ? "bn-BD" : "en-US";
  // F12 tone hint: raise rate/pitch with heat.
  u.rate = heat > 0.65 ? 1.15 : 1.0;
  u.pitch = heat > 0.65 ? 1.15 : 1.0;
  current = u;
  window.speechSynthesis.speak(u);
}

export function stopBrowserSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  current = null;
}

export function duckBrowserSpeech(duck: boolean): void {
  // speechSynthesis has no volume-duck; stop on barge-in instead.
  if (duck) stopBrowserSpeech();
}
