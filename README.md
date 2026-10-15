# 🔥 Live Argument Translator (English ↔ Bengali)

Two people who share no language argue live by voice. Each speaks their own language and hears the other in theirs — with streaming subtitles, translated voice, interruption badges, and a heat meter. No login, no cost, no stored audio.

- **Live link (standard mode):** `https://YOUR-VERCEL-APP.vercel.app` → backend `https://YOUR-API.onrender.com`
- **Reviewer path (2 min):** open the link on **two real devices** → one picks English + Create room → other picks বাংলা + Join with code → both tap “Enable mic & argue” (headphones on) → interrupt each other freely.

> Privacy: audio and text are processed **in memory only** and never written to disk. Rooms auto-expire after 2h. Server logs contain sizes/latencies, never content.

## How to use

1. Device A: pick **English**, Create room, share the 6-letter code.
2. Device B: pick **বাংলা**, Join with the code.
3. Both grant mic access and tap **Enable mic & argue**.
4. Argue. Subtitles arrive first (~1.5s), translated voice follows (~3s). Red **Overlap** badge = both speaking. Heat bars = vocal intensity.
5. Either taps **Leave** to end.

Grading tip: two tabs on one laptop share a single mic and will fight over it — use two phones/laptops. First load after idle can take ~60s (Render free cold start); the UI says “reconnecting” meanwhile.

## Architecture

```
[Browser A: mic 0.75s opus chunks + RMS heat] ─┐
                                              ├─► WSS /ws/{code} ─► FastAPI RoomStore (in-memory, 2 peers max)
[Browser B: mic 0.75s opus chunks + RMS heat] ─┘        │
                                                       ├─► STT: Groq Whisper-turbo (or browser Web Speech fallback)
                                                       ├─► Translate: Groq llama-3.1-8b (or MyMemory fallback)
                                                       └─► TTS: Edge-TTS mp3 (or browser speechSynthesis fallback)
                                                                │ subtitles broadcast first, audio second
                                                        ◄─ WSS: subtitle | tts-audio | speak | interruption | barge-in
```

**What runs where**

| Piece | Runs on | Notes |
|---|---|---|
| Next.js 14 (TS strict) static/app | Vercel | Mic capture, heat (RMS), barge-in ducking, subtitle UI |
| FastAPI + Uvicorn | Render free (Docker, 512MB/0.1CPU) | Rooms, WS relay, provider calls. No ML models on-box |
| STT/translate | Groq Cloud free tier (optional `GROQ_API_KEY`) | Whisper-turbo ~228×realtime; LLM keeps chunks speakable |
| TTS | Edge-TTS (no key) | `en-US-AriaNeural`, `bn-IN-TanishaaNeural`; rate +15% when heat high |
| Fallbacks (zero-key) | Browser natively | Web Speech STT → server translate → speechSynthesis TTS; subtitles-only if all else fails |

**Why this design**

- *Why Groq, not local models:* Render free has 512MB RAM / 0.1 CPU — NLLB + Whisper-small need GBs and would take 8–15s/chunk vs the 1.5s/3s target. One optional Groq key covers STT+translation at ~300–500ms.
- *Why streaming chunks:* 0.75s opus chunks processed in independent asyncio tasks (no turn-taking lock) = full-duplex interruption (F7) + partial subtitles while the speaker is still talking (G2).
- *Why heat as volume+pace:* RMS volume is computable at 60fps with zero ML; WPM from subtitle deltas adds pace. It is honest about being a proxy, but it makes emotion visible and drives TTS rate (F12).
- *Why subtitles before audio:* TTS synthesis + mp3 transfer is the slowest leg; showing text first keeps the argument alive even in “slow mode”.

## Run locally ($0)

```powershell
# backend
pip install -r backend/requirements.txt
uvicorn app.main:app --reload --port 8000  # run inside backend/
# frontend (new terminal)
npm --prefix frontend ci
$env:NEXT_PUBLIC_BACKEND_URL="http://localhost:8000"
npm --prefix frontend run dev  # http://localhost:3000
```

Optional: create `backend/.env` with `GROQ_API_KEY=...` (get one free at console.groq.com/keys, no card). Without it the app auto-switches to browser-native mode.

## Deploy (Vercel + Render, always-on standard mode)

1. Push this repo to GitHub (public).
2. **Render:** New → Blueprint → select repo (`render.yaml`). Set `CORS_ORIGINS=https://<your>.vercel.app` and optional `GROQ_API_KEY`. Note free instances sleep after 15 min idle — add a free 10-min pinger (e.g. UptimeRobot on `/health`) and mention the cold start in your submission.
3. **Vercel:** Import repo, root directory `frontend`, env `NEXT_PUBLIC_BACKEND_URL=https://<your-api>.onrender.com`, deploy.
4. Smoke test: `/health` → `{"status":"ok"}`, then create a room and join from two devices.

## Limits (honest)

- Groq free: Whisper 20 RPM/2000 RPD, LLM 30 RPM/14.4k RPD — a 3-min argument (~120 chunks + ~40 translations) fits, but back-to-back grading sessions may hit 429 → UI shows “slow mode”, retries, and falls back to subtitles.
- Edge-TTS is unofficial (no SLA); failures fall back to device voices automatically.
- MyMemory fallback: ~5k chars/day/IP, lower Bengali quality — subtitles-only continuity, not persuasion-grade.
- Render free: 512MB, sleeps; first WS connect after idle ≈ 60s. No persistence by design.
- Browser support: Chrome primary (MediaRecorder opus + Web Speech). Edge best-effort, Firefox best-effort (no Web Speech STT → needs Groq key for voice; subtitles via typed `text-partial` still work if you add the debug box).

## Project layout

```
backend/app/{main,config,models,rooms}.py  api/{routes_rooms,ws}.py  pipeline/{stt,translate,tts}.py
backend/tests/{test_rooms,test_pipeline}.py
frontend/app/{page,layout,room/[code]/page}.tsx  components/{RoomClient,meters}.tsx  lib/{types,audio-capture,browser-stt,browser-tts}.ts
render.yaml  docker-compose.yml  .github/workflows/ci.yml
```

Quality gates: `ruff check`, `pytest`, `tsc --noEmit`, `next lint`, `next build` — all in CI.

## Credits (open-source)

- Groq Whisper + Llama (free tier) · MyMemory (fallback MT) · Microsoft Edge neural voices via `edge-tts` (no key) · Web Speech API + speechSynthesis (browser fallbacks)
- FastAPI, Uvicorn, httpx, Next.js, React, Tailwind

## Demo video script (1–2 min)

1. (0:00) Show lobby, create English room, show code.
2. (0:20) Second device joins as Bengali.
3. (0:35) Argue “pineapple on pizza” — interrupt mid-sentence, point at Overlap badge + heat bars.
4. (1:10) Show subtitles updating mid-sentence, then translated voice arriving.
5. (1:30) Leave, state $0 + in-memory privacy.

## Milestones → status

Day 1 raw duplex audio ✅ · Day 2 STT+translate+subtitles ✅ · Day 3 TTS+barge-in ✅ · Day 4 heat/interruption/polish ✅ · Day 5 deploy+2-device test ⬜ (you are here) · Day 6 README/video ⬜ (README done, record video)
