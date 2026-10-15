"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HeatMeter, InterruptionBadge, StatusBar, SubtitleList } from "@/components/meters";
import { blobToBase64, createHeatMonitor } from "@/lib/audio-capture";
import { browserSTTSupported, startBrowserSTT } from "@/lib/browser-stt";
import { speakBrowser, stopBrowserSpeech } from "@/lib/browser-tts";
import { backendBase, wsUrlFor, type Lang, type StatusMsg, type Subtitle } from "@/lib/types";

interface Props {
  code: string;
  lang: Lang;
}

let seqCounter = 0;
const nextSeq = () => ++seqCounter;

export function RoomClient({ code, lang }: Props) {
  const [peers, setPeers] = useState(1);
  const [myHeat, setMyHeat] = useState(0);
  const [peerHeat, setPeerHeat] = useState(0);
  const [interrupted, setInterrupted] = useState(false);
  const [subs, setSubs] = useState<Subtitle[]>([]);
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [live, setLive] = useState(false);
  const [serverStt, setServerStt] = useState<"groq" | "browser">("groq");

  const wsRef = useRef<WebSocket | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const monitorRef = useRef<{ stop(): void } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakingRef = useRef(false);
  const heatRef = useRef(0);
  const lastSpeakSent = useRef(0);

  const pushSubtitle = useCallback((s: Omit<Subtitle, "id" | "at">) => {
    setSubs((prev) => [...prev.slice(-30), { ...s, id: `${s.seq}-${Date.now()}`, at: Date.now() }]);
  }, []);

  const playTtsAudio = useCallback((b64: string, mime: string) => {
    try {
      const el = audioRef.current;
      if (!el) return;
      el.src = `data:${mime};base64,${b64}`;
      el.volume = 1.0;
      void el.play().catch(() => undefined);
    } catch { /* autoplay blocked until user gesture; subtitles still show */ }
  }, []);

  const duckPlayback = useCallback(() => {
    const el = audioRef.current;
    if (el && !el.paused) {
      el.volume = 0.15; // F11 duck while user barges in
      window.setTimeout(() => { if (el) el.volume = 1.0; }, 1200);
    }
    stopBrowserSpeech();
  }, []);

  // ---- websocket lifecycle ----
  useEffect(() => {
    const ws = new WebSocket(wsUrlFor(code, lang));
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "hello", lang }));
      setStatus(null);
    };
    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      const t = msg.type as string;
      if (t === "room-state") {
        setPeers(Number((msg as { count?: number }).count ?? 1));
      } else if (t === "subtitle") {
        const m = msg as unknown as { from_lang: Lang; original: string; translated: string; is_final: boolean; seq: number; latency_ms?: number };
        pushSubtitle({ fromLang: m.from_lang, original: m.original, translated: m.translated, isFinal: m.is_final, seq: m.seq, latencyMs: m.latency_ms });
      } else if (t === "tts-audio") {
        const m = msg as unknown as { audio_b64: string; mime: string; lang: Lang };
        if (m.lang === lang) playTtsAudio(m.audio_b64, m.mime || "audio/mpeg");
      } else if (t === "speak") {
        const m = msg as unknown as { text: string; lang: Lang; heat?: number };
        if (m.lang === lang) speakBrowser(m.text, m.lang, Number(m.heat ?? 0));
      } else if (t === "peer-speaking") {
        const m = msg as unknown as { heat: number };
        setPeerHeat(Number(m.heat ?? 0));
      } else if (t === "interruption") {
        setInterrupted(Boolean((msg as { active?: boolean }).active));
        if ((msg as { active?: boolean }).active) window.setTimeout(() => setInterrupted(false), 2500);
      } else if (t === "barge-in") {
        duckPlayback(); // opponent keeps talking; we duck their voice locally
      } else if (t === "status") {
        const m = msg as unknown as { level: StatusMsg["level"]; message: string };
        setStatus({ level: m.level, message: m.message });
      }
    };
    ws.onclose = () => setStatus({ level: "reconnecting", message: "reconnecting… (Render free tier may cold-start ~60s)" });
    return () => { try { ws.close(); } catch { /* noop */ } wsRef.current = null; };
  }, [code, lang, pushSubtitle, playTtsAudio, duckPlayback]);

  // ---- discover provider mode (browser STT fallback when no Groq key) ----
  useEffect(() => {
    fetch(`${backendBase()}/health`).then((r) => r.json()).then((h: { stt?: string }) => {
      setServerStt(h.stt === "browser" ? "browser" : "groq");
    }).catch(() => setServerStt("groq"));
  }, []);

  const stopMic = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    recRef.current = null;
    try { monitorRef.current?.stop(); } catch { /* noop */ }
    monitorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopBrowserSpeech();
    setLive(false);
  }, []);

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      setLive(true);

      const monitor = createHeatMonitor(stream, ({ heat, speaking }) => {
        heatRef.current = heat;
        setMyHeat(heat);
        const wasSpeaking = speakingRef.current;
        speakingRef.current = speaking;
        const now = Date.now();
        // Throttle peer-speaking to 4Hz; always send barge-in edge.
        if ((!wasSpeaking && speaking) || now - lastSpeakSent.current > 250) {
          lastSpeakSent.current = now;
          wsRef.current?.send(JSON.stringify({ type: "peer-speaking", speaking, heat }));
          if (!wasSpeaking && speaking) {
            wsRef.current?.send(JSON.stringify({ type: "barge-in", ts: now }));
            duckPlayback();
          }
        }
      });
      monitorRef.current = monitor;

      if (serverStt === "browser" && browserSTTSupported()) {
        // Zero-key mode: transcribe locally, server only translates.
        startBrowserSTT(lang, (text, isFinal) => {
          wsRef.current?.send(JSON.stringify({ type: "text-partial", text, is_final: isFinal, seq: nextSeq() }));
        });
      } else {
        // Standard mode: stream 0.75s opus chunks (PRD F3).
        const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : undefined });
        recRef.current = rec;
        rec.ondataavailable = async (e) => {
          if (!e.data || e.data.size < 200) return;
          try {
            const b64 = await blobToBase64(e.data);
            wsRef.current?.send(JSON.stringify({
              type: "audio-chunk", seq: nextSeq(), lang,
              audio_b64: b64, mime: e.data.type || "audio/webm",
              heat: heatRef.current, speaking: speakingRef.current, ts: Date.now(),
            }));
          } catch { /* drop chunk */ }
        };
        rec.start(750);
      }
    } catch {
      setStatus({ level: "reconnecting", message: "microphone blocked — allow mic access and use headphones" });
    }
  }, [lang, serverStt, duckPlayback]);

  useEffect(() => () => stopMic(), [stopMic]);

  return (
    <div className="flex flex-col gap-4">
      <StatusBar status={status} peers={peers} />
      <div className="flex items-center gap-2">
        <InterruptionBadge active={interrupted} />
        {serverStt === "browser" && (
          <span className="rounded bg-amber-900 px-2 py-1 text-xs text-amber-200">subtitles-first mode (no server STT key)</span>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <HeatMeter value={myHeat} label="You" />
        <HeatMeter value={peerHeat} label="Opponent" />
      </div>
      <SubtitleList items={subs} myLang={lang} />
      <audio ref={audioRef} className="hidden" controls={false} />
      <div className="flex flex-wrap gap-2">
        {!live ? (
          <button onClick={startMic} className="rounded bg-green-600 px-4 py-2 font-semibold hover:bg-green-500">
            🎙 Enable mic & argue
          </button>
        ) : (
          <button onClick={stopMic} className="rounded bg-zinc-700 px-4 py-2 font-semibold hover:bg-zinc-600">
            Mute
          </button>
        )}
        <button
          onClick={() => { wsRef.current?.send(JSON.stringify({ type: "bye" })); stopMic(); }}
          className="rounded bg-red-700 px-4 py-2 font-semibold hover:bg-red-600"
        >
          Leave
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        Use headphones to avoid echo. Audio is processed in memory only and never stored. Room {code} · you speak {lang === "bn" ? "বাংলা" : "English"}.
      </p>
    </div>
  );
}
