"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Users, Volume2, VolumeX } from "lucide-react";
import { TeamBadge } from "@/components/brand/team-badge";
import { playAuctionSound, primeAuctionAudio } from "@/lib/auction/sfx";
import { speakCall, speechSupported, stopSpeech } from "@/lib/auction/speech";
import { buildAuctionCall, type AuctionCall } from "@/lib/auction/calls";
import type { SnapshotLot } from "@/lib/auction/types";
import { cn } from "@/lib/cn";
import { formatLakh } from "@/lib/money";

const STORAGE_KEY = "ipl-arena:auction-sound";
const SOUND_EVENT = "ipl-arena:auction-sound-change";

function getSoundSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function getSoundServerSnapshot(): boolean {
  return false;
}

function subscribeSound(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(SOUND_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SOUND_EVENT, callback);
  };
}

function subscribeNothing(): () => void {
  return () => {};
}

export type TranscriptLine = AuctionCall & { at: number };

export function useAuctioneer(
  lot: SnapshotLot | null,
  finished: boolean,
  running: boolean,
): {
  call: AuctionCall | null;
  transcript: TranscriptLine[];
  soundOn: boolean;
  speaking: boolean;
  voiceAvailable: boolean;
  toggleSound: () => void;
  clearTranscript: () => void;
} {
  const call = useMemo(() => buildAuctionCall(lot, finished), [lot, finished]);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const soundOn = useSyncExternalStore(subscribeSound, getSoundSnapshot, getSoundServerSnapshot);
  const voiceAvailable = useSyncExternalStore(subscribeNothing, speechSupported, () => false);
  const callRef = useRef<AuctionCall | null>(null);
  const lastId = useRef<string | null>(null);
  const firstCall = useRef(true);

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  useEffect(() => {
    return () => stopSpeech();
  }, []);

  useEffect(() => {
    if (!call) return;
    if (lastId.current === call.id) return;
    lastId.current = call.id;
    setTranscript((previous) => [...previous, { ...call, at: Date.now() }].slice(-40));
    if (firstCall.current) {
      firstCall.current = false;
      return;
    }
    if (!soundOn || document.hidden) return;
    playAuctionSound(call.tone);
    speakCall(call.text, {
      interrupt: call.tone !== "bid",
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
  }, [call, soundOn]);

  useEffect(() => {
    if (running) return;
    stopSpeech();
    const timer = window.setTimeout(() => setSpeaking(false), 0);
    return () => window.clearTimeout(timer);
  }, [running]);

  const toggleSound = useCallback(() => {
    const next = !getSoundSnapshot();
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Private mode can reject storage; the in-memory event still updates the UI.
    }
    window.dispatchEvent(new Event(SOUND_EVENT));
    if (!next) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    primeAuctionAudio();
    const current = callRef.current;
    if (!current) return;
    playAuctionSound(current.tone);
    speakCall(current.text, {
      interrupt: true,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
  }, []);

  return { call, transcript, soundOn, speaking, voiceAvailable, toggleSound, clearTranscript };
}

export function AuctioneerConsole({
  call,
  transcript,
  soundOn,
  speaking,
  voiceAvailable,
  onToggleSound,
  onClear,
  crowdOn = false,
  crowdAvailable = false,
  onToggleCrowd,
}: {
  call: AuctionCall | null;
  transcript: TranscriptLine[];
  soundOn: boolean;
  speaking: boolean;
  voiceAvailable: boolean;
  onToggleSound: () => void;
  onClear: () => void;
  crowdOn?: boolean;
  crowdAvailable?: boolean;
  onToggleCrowd?: () => void;
}) {
  const [showLog, setShowLog] = useState(false);

  return (
    <section className="surface-card overflow-hidden" aria-label="Auctioneer call">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-accent">
          <Mic size={13} aria-hidden="true" />
        </span>
        <p className="font-display text-[0.7rem] font-bold uppercase tracking-[0.16em]">Auctioneer</p>
        {speaking ? (
          <span className="flex h-4 items-end gap-0.5" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="eq-bar h-full w-[2px] rounded-full bg-accent2"
                style={{ animationDelay: `${index * 110}ms` }}
              />
            ))}
          </span>
        ) : (
          <span className="text-[0.58rem] uppercase tracking-[0.14em] text-faint">standby</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            className={cn("btn btn-sm", soundOn ? "btn-outline" : "btn-ghost")}
            onClick={onToggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? "Turn auction sound off" : "Turn auction sound on"}
            title={
              voiceAvailable
                ? "Browser-synthesized auctioneer voice and sound effects; captions stay on either way"
                : "Synthesized sound effects only; this browser has no speech engine"
            }
          >
            {soundOn ? <Volume2 size={13} aria-hidden="true" /> : <VolumeX size={13} aria-hidden="true" />}
            {soundOn ? "Sound on" : "Enable sound"}
          </button>
          {onToggleCrowd && (
            <button
              type="button"
              className={cn("btn btn-sm", crowdOn ? "btn-outline" : "btn-ghost")}
              onClick={onToggleCrowd}
              aria-pressed={crowdOn}
              disabled={!crowdAvailable}
              aria-label={crowdOn ? "Turn stadium crowd off" : "Turn stadium crowd on"}
              title={
                crowdAvailable
                  ? "Looping synthesized stadium murmur — generated in your browser, no audio files"
                  : "This browser cannot start the crowd ambience"
              }
            >
              <Users size={13} aria-hidden="true" />
              {crowdOn ? "Crowd on" : "Crowd"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowLog((value) => !value)}
            aria-expanded={showLog}
          >
            {showLog ? "Hide log" : `Log · ${transcript.length}`}
          </button>
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="min-h-[2.7rem] text-sm leading-relaxed text-fg/90">
          {call?.text ?? "The auctioneer is waiting for the next lot."}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6rem] uppercase tracking-[0.12em] text-faint">
          <span>Captions on</span>
          <span aria-hidden="true">·</span>
          <span>{voiceAvailable ? "Browser voice on this device" : "No browser voice — effects and captions only"}</span>
          <span aria-hidden="true">·</span>
          <span>Nothing is sent to a server</span>
        </p>
      </div>

      {showLog && (
        <div className="border-t border-line">
          <div className="flex items-center justify-between px-4 py-2">
            <p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-faint">Call log</p>
            <button
              type="button"
              className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-faint hover:text-fg"
              onClick={onClear}
            >
              Clear
            </button>
          </div>
          <ol className="max-h-52 divide-y divide-line/60 overflow-y-auto scrollbar-thin">
            {[...transcript].reverse().map((line) => (
              <li key={`${line.id}-${line.at}`} className="px-4 py-2">
                <p className="text-[0.72rem] leading-snug text-muted">{line.text}</p>
                <p className="num mt-0.5 text-[0.55rem] text-faint">
                  {new Date(line.at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
              </li>
            ))}
            {transcript.length === 0 && (
              <li className="px-4 py-6 text-center text-[0.7rem] text-faint">
                Calls will appear here as the room moves.
              </li>
            )}
          </ol>
        </div>
      )}
    </section>
  );
}

export function SaleOverlay({ lot, userTeamId }: { lot: SnapshotLot | null; userTeamId: string }) {
  if (!lot) return null;
  const sold = lot.status === "sold";
  const mine = sold && lot.winningTeamId === userTeamId;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 grid place-items-center overflow-hidden px-4"
      aria-hidden="true"
    >
      <div className="sale-veil absolute inset-0 bg-bg/55 backdrop-blur-[2px]" />
      <div
        className={cn(
          "sale-stamp relative w-full max-w-xl overflow-hidden rounded-2xl border-[3px] px-6 py-7 text-center shadow-2xl sm:px-10 sm:py-9",
          sold
            ? mine
              ? "border-success bg-[#06160e]/95"
              : "border-accent bg-[#170d05]/95"
            : "border-line-strong bg-surface/95",
        )}
      >
        <div className="sale-rays" aria-hidden="true" />
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background: sold
              ? `radial-gradient(420px 240px at 50% 25%, ${mine ? "rgba(52,211,153,.25)" : "rgba(255,122,26,.24)"}, transparent 70%)`
              : "radial-gradient(420px 240px at 50% 25%, rgba(148,163,184,.14), transparent 70%)",
          }}
        />
        <div className="relative">
          <p
            className={cn(
              "font-display text-[clamp(2.9rem,10vw,5.4rem)] font-black uppercase leading-none tracking-[0.06em]",
              sold ? (mine ? "text-success" : "text-accent") : "text-muted",
            )}
          >
            {sold ? "Sold" : "Unsold"}
          </p>
          <p className="mt-3 font-display text-xl font-bold uppercase tracking-wide text-fg sm:text-2xl">
            {lot.player.name}
          </p>
          {sold ? (
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
              <TeamBadge teamId={lot.winningTeamId} size={22} />
              <span>{lot.winningTeamName ?? "Franchise"}</span>
              <span className="text-faint">·</span>
              <span className="num font-semibold text-accent2">{formatLakh(lot.finalPriceLakh)}</span>
              {mine && <span className="chip chip-success">Your squad</span>}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">
              No bid at the {formatLakh(lot.basePriceLakh)} base price.
            </p>
          )}
          {sold && lot.soldVia === "rtm-match" && (
            <p className="mt-3 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-violet">
              Matched via Right to Match
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
