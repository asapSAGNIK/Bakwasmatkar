/** RMS heat (0..1) + speaking detection from a mic stream.
 * Production notes: echoCancellation + noiseSuppression on, AnalyserNode
 * with 2048 FFT, 65% threshold hysteresis to avoid flicker.
 */

export interface HeatSample {
  heat: number; // 0..1
  speaking: boolean;
}

export function createHeatMonitor(stream: MediaStream, onSample: (s: HeatSample) => void) {
  const Ctx = window.AudioContext;
  const ctx = new Ctx();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let stopped = false;
  let speaking = false;
  let raf = 0;

  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
    const rms = Math.sqrt(sum / buf.length); // ~0..0.5 for speech
    const heat = Math.min(1, rms * 4);
    const on = heat > 0.12;
    const off = heat < 0.07;
    if (on) speaking = true;
    else if (off) speaking = false;
    onSample({ heat, speaking });
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      void ctx.close().catch(() => undefined);
    },
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      resolve(s.includes(",") ? s.split(",")[1]! : s);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
