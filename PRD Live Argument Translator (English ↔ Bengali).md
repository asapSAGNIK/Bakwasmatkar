# PRD: Live Argument Translator (English ↔ Bengali)

*Solo assignment project. Draft v1.*

## 1. Overview

A web app that lets two people who share no language (one speaks English, the other Bengali) have a real, heated argument over a live audio call. Each person speaks their own language and hears the other in theirs, with translation streaming in small chunks so both can interrupt and talk over each other.

## 2. Problem Statement

Normal translators force strict turn-taking: speak, wait, read or hear the result. That kills an argument, which needs interruption, overlap, emotion and fast changes of mind. The product must remove the "translator in the middle" feeling as much as possible.

## 3. Goals

- G1: Two users can join a room and talk by voice, each in their own language.
- G2: Translation starts while the speaker is still talking (partial results).
- G3: Both users can speak at the same time; neither is blocked.
- G4: Emotional intensity is visible or audible to the other side (the "heat" indicator).
- G5: Meaning is accurate enough that a person can be persuaded.
- G6: Always-on public link, $0 cost, public repo.

## 4. Non-Goals

- Video calling.
- More than two participants or more than two languages.
- Accounts, payments, chat history, mobile apps.
- Commercial-grade accuracy or scale.

## 5. Users and Scenario

**Primary scenario:** Asha (English only) and Rahim (Bengali only) argue about a topic they pick (e.g. "Is pineapple on pizza acceptable?"). Neither understands the other's language, yet the argument feels natural.

**Grader / reviewer:** opens the link, joins a room in two tabs or with a friend, and judges whether an argument is actually possible.

## 6. User Flow

1. User A opens the link, picks language (English), creates a room, gets a room code or link.
2. User B opens the link, picks language (Bengali), joins with the code.
3. Both grant microphone access.
4. Both talk freely. Each sees live subtitles of the other (original + translation, updating mid-sentence) and hears the translated voice.
5. The heat meter shows how intense each speaker is. An interruption badge appears when speech overlaps.
6. Either user leaves; the session ends.

## 7. Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| F1 | Create and join a room by code, no login | Must |
| F2 | Language selection (English or Bengali) per user | Must |
| F3 | Capture mic audio and stream it in small chunks (about 0.5 to 1 s) over WebSocket | Must |
| F4 | Speech-to-text on streamed audio with partial results | Must |
| F5 | Translate English ↔ Bengali text, updating as partials arrive | Must |
| F6 | Text-to-speech playback of the translation in the listener's language | Must |
| F7 | Full-duplex: both users can speak simultaneously; audio from each direction is processed independently | Must |
| F8 | Live subtitles showing original and translated text | Must |
| F9 | Heat indicator from speaker volume and speaking pace | Should |
| F10 | Interruption indicator when both speak at once | Should |
| F11 | Barge-in: if the listener starts talking, the translated playback of the other person is ducked or stopped | Should |
| F12 | Pass tone hints to TTS (faster or louder voice when heat is high) | Could |
| F13 | Bonus GPU mode using SeamlessStreaming (speech-to-speech) when available; frontend auto-detects and falls back | Could |
| F14 | Clear status messages ("slow mode", "reconnecting") | Should |

## 8. Non-Functional Requirements

- **Latency target:** first translated subtitle under about 1.5 s after speech starts; translated audio under about 3 s. Stretch goal: under 2 s.
- **Availability:** public link works at all times in standard mode.
- **Cost:** $0. Only free tiers and open-source tools.
- **Browser support:** current Chrome (primary), Edge and Firefox (best effort).
- **Privacy:** audio is not stored; processed in memory only. State this in the README.

## 9. Proposed Architecture

- **Frontend:** static web app (HTML/JS or React) on Vercel or Netlify. Mic capture with Web Audio API, WebSocket client, subtitle UI, heat meter.
- **Backend:** small Python (FastAPI) or Node server on a free host (Render, Railway or Hugging Face Space). Manages rooms, relays messages, calls the speech, translation and TTS services.
- **Pipeline (standard mode):** audio chunks → streaming STT (e.g. Groq-hosted Whisper) → translation (free API or IndicTrans2/NLLB) → TTS (free API, Meta MMS-TTS or Piper) → audio to the other user.
- **Pipeline (GPU mode, optional):** audio → SeamlessStreaming on Colab/Kaggle → translated speech, exposed via a tunnel.
- **Heat metric:** computed client-side from RMS volume and words per second, sent as a number alongside the audio.

## 10. Free Tooling Options

| Layer | Options |
| --- | --- |
| Frontend hosting | Vercel, Netlify, Cloudflare Pages |
| Backend hosting | Render, Railway, Hugging Face Space |
| Speech-to-text | Groq Whisper (free tier), faster-whisper |
| Translation | NLLB, IndicTrans2, or a free translation API |
| Text-to-speech | MMS-TTS, Piper, or a free TTS API |
| Speech-to-speech | Meta SeamlessStreaming (GPU, CC-BY-NC) |

Free-tier limits and model language support change; verify them before committing.

## 11. Success Metrics

- Two people can hold a 3-minute argument without either needing to type or wait for the other to finish.
- Median subtitle latency under 1.5 s; audio under 3 s.
- At least one successful interruption test (both speak at once and both are translated).
- Live link and repo submitted and working for a reviewer with no setup.

## 12. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Free API rate limits hit during grading | Cache nothing sensitive, add graceful "busy" message, keep a backup mode |
| High latency kills the argument feel | Small chunks, stream partials, show subtitles before audio |
| Bengali TTS or STT quality is weak | Test early with real argument sentences; fall back to subtitles-only |
| GPU session offline | Always-on standard mode; GPU mode is a bonus only |
| Free host sleeps (cold start) | Ping keep-alive, mention first-load delay in README |
| Echo and feedback on speakers | Recommend headphones; enable echo cancellation in getUserMedia |
| Scope creep working alone | Ship must-haves first, treat Should/Could as stretch |

## 13. Milestones

1. **Day 1:** Two-tab room with raw audio streaming over WebSocket.
2. **Day 2:** STT + translation + subtitles in one direction, then both.
3. **Day 3:** TTS playback, full-duplex, barge-in.
4. **Day 4:** Heat meter, interruption badge, UI polish.
5. **Day 5:** Deploy frontend and backend, test with a real second person, fix latency.
6. **Day 6:** README, architecture diagram, demo video, optional GPU mode.

## 14. Submission Checklist

- [ ] Live link (always on, standard mode)
- [ ] Public GitHub repo with clean README
- [ ] README sections: what it is, how to use, architecture, what runs where, limits, credits for open-source tools
- [ ] Short demo video (1 to 2 min) showing an actual interrupting argument
- [ ] Note explaining design choices: why translation, why streaming, how heat is shown
- [ ] Optional: one-click Colab notebook for GPU mode

## 15. Open Questions

- Does the assignment require a specific stack, or a public link that stays up for a fixed period?
- Is voice required, or are live subtitles acceptable as a fallback?
- Which exact free STT/translation/TTS services will be used (decide after a quick latency test)?
- Will the reviewer test alone (two tabs) or with another person?
