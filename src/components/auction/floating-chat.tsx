"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  Minus,
  Send,
  ShieldAlert,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { getFranchise } from "@/lib/teams";
import type { SnapshotChatMessage } from "@/lib/auction/types";
import { cn } from "@/lib/cn";
import { parseVoiceBody, VoiceClip } from "@/components/auction/lobby-shared";

const EMOTES = ["🔥", "👏", "😱", "💰", "🤝", "🧠"];
const MAX_RECORD_MS = 60_000;
const MAX_BYTES = 700_000;

type MicState = "unknown" | "prompt" | "granted" | "denied" | "unsupported" | "insecure";

function micBlockedReason(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) {
    return "Microphone access needs a secure page. Open the site over HTTPS or from localhost, then try again.";
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    return "This browser cannot record audio. Try a recent Chrome, Edge or Safari.";
  }
  return null;
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The recording could not be read."));
    reader.onloadend = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : "");
    };
    reader.readAsDataURL(blob);
  });
}

export function FloatingRoomChat({
  sessionId,
  messages,
  viewerTeamId,
  disabled,
  onSend,
  onSendVoice,
}: {
  sessionId: string;
  messages: SnapshotChatMessage[];
  viewerTeamId: string | null;
  disabled?: boolean;
  onSend: (body: string, kind: "chat" | "emote") => Promise<boolean>;
  onSendVoice: (audioBase64: string, mime: string, durationMs: number) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [seenId, setSeenId] = useState(0);
  const [value, setValue] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [micState, setMicState] = useState<MicState>("unknown");
  const [checkingMic, setCheckingMic] = useState(false);

  const listRef = useRef<HTMLOListElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const discardRef = useRef(false);

  const latestId = messages.reduce((max, message) => Math.max(max, message.id), 0);
  const unread = open
    ? 0
    : messages.reduce(
        (count, message) =>
          message.id > seenId && message.kind !== "system" && message.teamId !== viewerTeamId
            ? count + 1
            : count,
        0,
      );

  function closeChat() {
    setSeenId(latestId);
    setOpen(false);
  }

  function stopTicker() {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  useEffect(() => {
    if (!open) return;
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    return () => {
      stopTicker();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        discardRef.current = true;
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const blocked = micBlockedReason();
      if (blocked) {
        if (!cancelled) setMicState(window.isSecureContext ? "unsupported" : "insecure");
        return;
      }
      try {
        const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (cancelled) return;
        setMicState(status.state === "granted" ? "granted" : status.state === "denied" ? "denied" : "prompt");
      } catch {
        if (!cancelled) setMicState((current) => (current === "granted" ? "granted" : "prompt"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function finishRecording(mime: string) {
    stopTicker();
    setRecording(false);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    const blob = new Blob(chunksRef.current, { type: mime });
    chunksRef.current = [];
    if (discardRef.current) {
      discardRef.current = false;
      setRecordMs(0);
      return;
    }
    const durationMs = Math.min(MAX_RECORD_MS, Math.max(500, Date.now() - startedAtRef.current));
    setRecordMs(0);
    if (blob.size === 0) {
      setVoiceError("Nothing was recorded.");
      return;
    }
    if (blob.size > MAX_BYTES) {
      setVoiceError("That clip is too long. Keep it under a minute.");
      return;
    }
    setSendingVoice(true);
    try {
      const base64 = await blobToBase64(blob);
      if (!base64) throw new Error("The recording could not be read.");
      const ok = await onSendVoice(base64, blob.type || "audio/webm", durationMs);
      if (!ok) setVoiceError("The voice note could not be sent.");
    } catch {
      setVoiceError("The voice note could not be sent.");
    } finally {
      setSendingVoice(false);
    }
  }

  const requestMicrophone = useCallback(async (): Promise<MediaStream | null> => {
    const blocked = micBlockedReason();
    if (blocked) {
      setMicState(window.isSecureContext ? "unsupported" : "insecure");
      setVoiceError(blocked);
      return null;
    }
    setCheckingMic(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      setMicState("granted");
      setVoiceError(null);
      return stream;
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      const denied = name === "NotAllowedError" || name === "SecurityError";
      setMicState(denied ? "denied" : "prompt");
      setVoiceError(
        denied
          ? "Microphone blocked. Open the padlock (or mic) icon in the address bar, allow the microphone, then press Retry."
          : name === "NotFoundError"
            ? "No microphone was found. Connect one and try again."
            : name === "NotReadableError"
              ? "The microphone is busy in another app. Close it and try again."
              : "The microphone could not be opened.",
      );
      return null;
    } finally {
      setCheckingMic(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (disabled || sendingVoice) return;
    setVoiceError(null);
    const stream = await requestMicrophone();
    if (!stream) return;
    try {
      streamRef.current = stream;
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      discardRef.current = false;
      startedAtRef.current = Date.now();
      setRecordMs(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void finishRecording(recorder.mimeType || mimeType || "audio/webm");
      };
      recorder.start(250);
      setRecording(true);
      tickRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setRecordMs(elapsed);
        if (elapsed >= MAX_RECORD_MS) {
          if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
        }
      }, 200);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setVoiceError("This browser could not start the recorder. Try Chrome, Edge or Safari.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, sendingVoice, onSendVoice, requestMicrophone]);

  function stopRecording(discard = false) {
    discardRef.current = discard;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  async function submitText() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    const ok = await onSend(trimmed, "chat");
    if (ok) setValue("");
  }

  async function submitEmote(emote: string) {
    if (disabled) return;
    await onSend(emote, "emote");
  }

  if (!open) {
    return (
      <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative flex h-12 w-12 items-center justify-center rounded-full border border-accent/50 bg-surface text-accent2 shadow-[0_12px_30px_-10px_rgba(0,0,0,.7)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="Open room chat"
          title="Room chat"
        >
          <MessageCircle size={20} />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[0.6rem] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-3 right-3 z-40 w-[min(94vw,360px)] sm:bottom-6 sm:right-6">
      <div className="flex max-h-[min(74vh,540px)] flex-col overflow-hidden rounded-2xl border border-lineStrong bg-bg/95 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent2">
            <MessageCircle size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xs font-bold uppercase tracking-[0.12em]">Room chat</p>
            <p className="text-[0.58rem] text-faint">
              {disabled
                ? "Take a seat to chat"
                : recording
                  ? "Recording voice note…"
                  : micState === "granted"
                    ? "Text, emote or voice · mic ready"
                    : "Text, emote or voice"}
            </p>
          </div>
          <button
            type="button"
            onClick={closeChat}
            className="rounded-md p-1.5 text-faint transition-colors hover:bg-surface2 hover:text-fg"
            aria-label="Minimise chat"
            title="Minimise"
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (recording) stopRecording(true);
              closeChat();
            }}
            className="rounded-md p-1.5 text-faint transition-colors hover:bg-danger/10 hover:text-danger"
            aria-label="Close chat"
            title="Close"
          >
            <X size={15} />
          </button>
        </div>

        <ol
          ref={listRef}
          className="min-h-[8rem] flex-1 space-y-1.5 overflow-y-auto px-3 py-2.5 scrollbar-thin"
          aria-live="polite"
        >
          {messages.length === 0 && (
            <li className="py-6 text-center text-[0.68rem] text-faint">
              No messages yet. Say hello before the hammer falls.
            </li>
          )}
          {messages.map((message) => {
            const franchise = getFranchise(message.teamId);
            const system = message.kind === "system";
            const voice = message.kind === "voice" ? parseVoiceBody(message.body) : null;
            return (
              <li key={message.id} className="flex items-start gap-2">
                {system ? (
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                ) : (
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: franchise?.primary ?? "var(--muted)" }}
                    aria-hidden="true"
                  />
                )}
                <div
                  className={cn(
                    "min-w-0 flex-1 break-words text-[0.72rem] leading-snug",
                    system ? "italic text-faint" : "text-muted",
                  )}
                >
                  {!system && <span className="mr-1.5 font-semibold text-fg">{message.displayName}</span>}
                  {voice ? (
                    <VoiceClip
                      src={`/api/sessions/${sessionId}/voice/${voice.clipId}`}
                      durationMs={voice.durationMs}
                    />
                  ) : message.kind === "emote" ? (
                    <span className="text-lg leading-none">{message.body}</span>
                  ) : (
                    message.body
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="border-t border-line px-2.5 py-2">
          {voiceError && (
            <p className="mb-1.5 rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-[0.62rem] leading-snug text-danger">
              {voiceError}
            </p>
          )}
          {!recording && micState !== "granted" && micState !== "unknown" && (
            <div className="mb-1.5 flex items-start gap-2 rounded-md border border-line bg-surface2/70 px-2 py-1.5 text-[0.6rem] leading-snug text-muted">
              {micState === "unsupported" || micState === "insecure" ? (
                <ShieldAlert size={13} className="mt-0.5 shrink-0 text-gold" />
              ) : (
                <MicOff size={13} className="mt-0.5 shrink-0 text-faint" />
              )}
              <p className="flex-1">
                {micState === "denied"
                  ? "Microphone is blocked for this site. Allow it from the address-bar padlock, then retry."
                  : micState === "insecure"
                    ? "Voice notes need HTTPS or localhost. Open the secure link to use the microphone."
                    : micState === "unsupported"
                      ? "This browser cannot record audio. Voice messages are unavailable here."
                      : "Voice notes need microphone access. Allow it when your browser asks."}
              </p>
              {micState === "prompt" || micState === "denied" ? (
                <button
                  type="button"
                  onClick={() => void requestMicrophone()}
                  disabled={checkingMic}
                  className="btn btn-outline btn-sm shrink-0 px-2 py-0.5 text-[0.6rem]"
                >
                  {checkingMic ? <Loader2 size={11} className="animate-spin" /> : "Allow"}
                </button>
              ) : null}
            </div>
          )}
          {recording ? (
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />
              <span className="num text-xs font-semibold">{clock(recordMs)}</span>
              <span className="flex-1 text-[0.62rem] text-faint">Tap stop to send · max 1:00</span>
              <button
                type="button"
                onClick={() => stopRecording(true)}
                className="rounded-md p-1.5 text-faint transition-colors hover:bg-surface2 hover:text-danger"
                aria-label="Discard recording"
                title="Discard"
              >
                <Trash2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => stopRecording(false)}
                className="btn btn-primary btn-sm gap-1 px-2.5"
                aria-label="Stop and send voice note"
              >
                <Square size={11} /> Send
              </button>
            </div>
          ) : (
            <>
              <div className="mb-1.5 flex flex-wrap gap-1">
                {EMOTES.map((emote) => (
                  <button
                    key={emote}
                    type="button"
                    className="rounded-md border border-line bg-surface2 px-1.5 py-0.5 text-sm transition-colors hover:border-accent/40 disabled:opacity-40"
                    onClick={() => void submitEmote(emote)}
                    disabled={disabled}
                    aria-label={`Send ${emote}`}
                  >
                    {emote}
                  </button>
                ))}
              </div>
              <form
                className="flex items-center gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitText();
                }}
              >
                <input
                  className="input min-w-0 flex-1 py-1.5 text-xs"
                  value={value}
                  maxLength={240}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={disabled ? "Take a seat to chat" : "Talk to the room…"}
                  disabled={disabled}
                  aria-label="Room chat message"
                />
                <button
                  type="button"
                  onClick={() => void startRecording()}
                  className="btn btn-outline btn-sm shrink-0 px-2"
                  disabled={disabled || sendingVoice}
                  aria-label="Record a voice note"
                  title={micState === "granted" ? "Record voice note" : "Record voice note (asks for microphone access)"}
                >
                  {sendingVoice ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm shrink-0 px-2.5"
                  disabled={disabled || value.trim().length === 0}
                  aria-label="Send message"
                >
                  <Send size={13} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
