"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { primeAuctionAudio, startCrowdAmbience, stopCrowdAmbience } from "@/lib/auction/sfx";

const STORAGE_KEY = "ipl-arena:crowd-sound";
const CHANGE_EVENT = "ipl-arena:crowd-sound-change";

function getCrowdSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function getCrowdServerSnapshot(): boolean {
  return false;
}

function subscribeCrowd(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function subscribeNothing(): () => void {
  return () => {};
}

function getAudioAvailable(): boolean {
  return typeof window !== "undefined" && "AudioContext" in window;
}

export function useCrowdAmbience(): {
  crowdOn: boolean;
  toggleCrowd: () => void;
  available: boolean;
} {
  const crowdOn = useSyncExternalStore(subscribeCrowd, getCrowdSnapshot, getCrowdServerSnapshot);
  const available = useSyncExternalStore(subscribeNothing, getAudioAvailable, () => false);

  useEffect(() => {
    if (!crowdOn) {
      stopCrowdAmbience();
      return;
    }
    startCrowdAmbience();
    function onVisibility() {
      if (document.hidden) stopCrowdAmbience();
      else startCrowdAmbience();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopCrowdAmbience();
    };
  }, [crowdOn]);

  const toggleCrowd = useCallback(() => {
    const next = !getCrowdSnapshot();
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Ignore storage failures; audio still follows the in-memory event.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
    if (next) primeAuctionAudio();
  }, []);

  return { crowdOn, toggleCrowd, available };
}
