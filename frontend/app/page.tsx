"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { backendBase, type Lang } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${backendBase()}/api/rooms`, { method: "POST" });
      if (!r.ok) throw new Error(`backend ${r.status}`);
      const { code: c } = (await r.json()) as { code: string };
      router.push(`/room/${c}?lang=${lang}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to create room (backend asleep? retry in ~60s)");
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    const c = code.trim().toUpperCase();
    if (c.length !== 6) {
      setError("room code is 6 characters (e.g. KX7Q2M)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${backendBase()}/api/rooms/${c}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      if (!r.ok) throw new Error(r.status === 404 ? "room not found or expired" : "room is full");
      router.push(`/room/${c}?lang=${lang}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "join failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold">🔥 Live Argument Translator</h1>
        <p className="mt-2 text-zinc-400">
          English ↔ Bengali heated voice debate. Each person speaks their own language, hears the other in theirs.
          Interrupt freely — translation streams in small chunks.
        </p>
      </header>

      <section className="rounded border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="mb-2 font-semibold">1. Pick your language</h2>
        <div className="flex gap-2" role="radiogroup" aria-label="language">
          {(["en", "bn"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`rounded px-4 py-2 font-semibold ${lang === l ? "bg-white text-black" : "bg-zinc-800 hover:bg-zinc-700"}`}
            >
              {l === "en" ? "English" : "বাংলা (Bengali)"}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900/60 p-4">
        <h2 className="mb-2 font-semibold">2. Create or join a room (no login)</h2>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={createRoom} className="rounded bg-green-600 px-4 py-2 font-semibold hover:bg-green-500 disabled:opacity-50">
            {busy ? "…" : "Create room"}
          </button>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            maxLength={6}
            className="w-32 rounded bg-zinc-800 px-3 py-2 uppercase tracking-widest"
            aria-label="room code"
          />
          <button disabled={busy} onClick={joinRoom} className="rounded bg-zinc-100 px-4 py-2 font-semibold text-black hover:bg-white disabled:opacity-50">
            Join
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
        <p className="mt-2 text-xs text-zinc-500">
          Two tabs on one machine share one mic — for grading use <strong>two real devices</strong>. First load may take ~60s (Render free cold start).
        </p>
      </section>

      <section className="text-sm text-zinc-400">
        <h2 className="font-semibold text-zinc-200">How an argument works</h2>
        <ol className="mt-1 list-decimal pl-5">
          <li>Both join the same code, each in their own language, wearing headphones.</li>
          <li>Tap “Enable mic & argue”. Talk over each other — nothing blocks.</li>
          <li>Read live subtitles first, hear translated voice ~1s later. Red badge = overlap.</li>
        </ol>
      </section>
    </div>
  );
}
