import type { AuctionCallTone } from "./calls";

type AudioContextConstructor = typeof AudioContext;

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const ctor: AudioContextConstructor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!ctor) return null;
  if (!context) context = new ctor();
  if (context.state === "suspended") void context.resume();
  return context;
}

function note(
  ctx: AudioContext,
  frequency: number,
  offset: number,
  duration: number,
  type: OscillatorType,
  volume: number,
) {
  const start = ctx.currentTime + offset;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

/** Resumes the shared audio context. Call from a user gesture before playback. */
export function primeAuctionAudio(): void {
  getContext();
}

let crowdSource: AudioBufferSourceNode | null = null;
let crowdGain: GainNode | null = null;

function createNoiseBuffer(ctx: AudioContext, seconds: number, brown = false): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < data.length; index += 1) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[index] = last * 3.2;
    } else {
      data[index] = white;
    }
  }
  return buffer;
}

/** Low, looping stadium murmur. Starts only after a user gesture. */
export function startCrowdAmbience(): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().then(() => startCrowdAmbience()).catch(() => {});
    return;
  }
  if (crowdSource) return;
  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, 4, true);
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 720;
  filter.Q.value = 0.4;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 1.6);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
  crowdSource = source;
  crowdGain = gain;
}

export function stopCrowdAmbience(): void {
  if (!crowdSource) return;
  const ctx = context;
  const source = crowdSource;
  const gain = crowdGain;
  crowdSource = null;
  crowdGain = null;
  if (ctx && gain) {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
  }
  window.setTimeout(() => {
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
    source.disconnect();
  }, 450);
}

function crowdSwell(ctx: AudioContext, seconds = 1.2, volume = 0.11): void {
  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, seconds, false);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 780;
  filter.Q.value = 0.6;
  const gain = ctx.createGain();
  const start = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.16);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(start);
  source.stop(start + seconds + 0.05);
}

/** Short, quiet synthesized effects — no bundled audio assets and nothing fetched remotely. */
export function playAuctionSound(tone: AuctionCallTone): void {
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") return;
  switch (tone) {
    case "open":
      note(ctx, 523.25, 0, 0.14, "sine", 0.06);
      note(ctx, 783.99, 0.09, 0.2, "sine", 0.05);
      break;
    case "bid":
      note(ctx, 1046.5, 0, 0.045, "triangle", 0.035);
      break;
    case "once":
      note(ctx, 880, 0, 0.07, "triangle", 0.045);
      break;
    case "twice":
      note(ctx, 880, 0, 0.06, "triangle", 0.045);
      note(ctx, 880, 0.11, 0.06, "triangle", 0.045);
      break;
    case "rtm":
      note(ctx, 659.25, 0, 0.1, "sine", 0.05);
      note(ctx, 987.77, 0.1, 0.16, "sine", 0.045);
      break;
    case "sold":
      note(ctx, 523.25, 0, 0.16, "triangle", 0.06);
      note(ctx, 659.25, 0.07, 0.16, "triangle", 0.06);
      note(ctx, 783.99, 0.14, 0.18, "triangle", 0.06);
      note(ctx, 1046.5, 0.21, 0.3, "triangle", 0.07);
      note(ctx, 98, 0.02, 0.3, "sine", 0.09);
      crowdSwell(ctx, 1.5, 0.12);
      break;
    case "unsold":
      note(ctx, 392, 0, 0.16, "sine", 0.05);
      note(ctx, 293.66, 0.14, 0.26, "sine", 0.05);
      break;
  }
}
