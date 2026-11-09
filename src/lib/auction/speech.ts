export type SpeakOptions = {
  interrupt?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
};

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  return (
    voices.find((voice) => /^en[-_]IN/i.test(voice.lang)) ??
    voices.find((voice) => /^en[-_]GB/i.test(voice.lang)) ??
    voices.find((voice) => voice.default && voice.lang.startsWith("en")) ??
    null
  );
}

/**
 * Speaks a line with the local browser voice. Returns false when speech is busy and
 * `interrupt` was not requested, or when the browser has no speech engine.
 */
export function speakCall(text: string, options?: SpeakOptions): boolean {
  if (!speechSupported()) return false;
  const synth = window.speechSynthesis;
  if (!options?.interrupt && (synth.speaking || synth.pending)) return false;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-IN";
  utterance.rate = 1.08;
  utterance.pitch = 0.88;
  utterance.volume = 0.95;
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.onstart = () => options?.onStart?.();
  utterance.onend = () => options?.onEnd?.();
  utterance.onerror = () => options?.onEnd?.();
  synth.speak(utterance);
  return true;
}

export function stopSpeech(): void {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
}
