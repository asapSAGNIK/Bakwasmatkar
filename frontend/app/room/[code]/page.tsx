"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { RoomClient } from "@/components/RoomClient";
import type { Lang } from "@/lib/types";

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const search = useSearchParams();
  const raw = (search.get("lang") ?? "en").toLowerCase();
  const lang: Lang = raw === "bn" ? "bn" : "en";
  const roomCode = decodeURIComponent(code).toUpperCase();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Room {roomCode}</h1>
        <a href="/" className="text-sm text-zinc-400 underline">← lobby</a>
      </header>
      <RoomClient code={roomCode} lang={lang} />
    </div>
  );
}
