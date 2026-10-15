"use client";

import type { Lang, StatusMsg, Subtitle } from "@/lib/types";

export function HeatMeter({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const color = pct > 70 ? "bg-red-500" : pct > 35 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="w-full" aria-label={`${label} heat ${pct}%`}>
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span>{pct}% heat</span>
      </div>
      <div className="h-2 rounded bg-zinc-800">
        <div className={`h-2 rounded transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function InterruptionBadge({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div role="alert" className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide">
      ⚡ Overlap — both speaking!
    </div>
  );
}

export function SubtitleList({ items, myLang }: { items: Subtitle[]; myLang: Lang }) {
  const visible = items.slice(-8);
  return (
    <div className="flex h-72 flex-col gap-2 overflow-y-auto rounded border border-zinc-800 bg-zinc-900/60 p-3" aria-live="polite">
      {visible.length === 0 && (
        <p className="text-sm text-zinc-500">No speech yet — start arguing. Subtitles appear here in under ~1.5s.</p>
      )}
      {visible.map((s) => (
        <div key={s.id} className="rounded bg-zinc-800/70 p-2 text-sm">
          <div className="text-[11px] uppercase text-zinc-400">
            {s.fromLang === myLang ? "You" : "Opponent"} {s.isFinal ? "" : "…speaking"}
            {s.latencyMs != null && s.latencyMs > 0 ? ` · ${s.latencyMs}ms` : ""}
          </div>
          <div className="text-zinc-300">{s.original}</div>
          <div className="font-medium text-zinc-100">→ {s.translated}</div>
        </div>
      ))}
    </div>
  );
}

export function StatusBar({ status, peers }: { status: StatusMsg | null; peers: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`inline-block h-2 w-2 rounded-full ${peers >= 2 ? "bg-green-500" : "bg-amber-500"}`} />
      <span className="text-zinc-400">
        {peers >= 2 ? "Connected: 2/2 — argue freely, interruption allowed" : "Waiting for opponent… share the room code"}
      </span>
      {status && <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">{status.message}</span>}
    </div>
  );
}
