"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_EVENT = "arena-theme-change";

function subscribeTheme(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

function themeSnapshot(): "dark" | "classic" {
  return document.documentElement.dataset.theme === "classic" ? "classic" : "dark";
}

function serverThemeSnapshot(): "dark" | "classic" {
  return "dark";
}

const subscribeMounted = () => () => {};
const mountedSnapshot = () => true;
const serverMountedSnapshot = () => false;

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot, serverThemeSnapshot);
  const mounted = useSyncExternalStore(subscribeMounted, mountedSnapshot, serverMountedSnapshot);

  function toggle() {
    const next = theme === "classic" ? "dark" : "classic";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("arena-theme", next);
    } catch {
      // Storage can be unavailable in private browsing; the theme still applies for this page.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={
        className ??
        "inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface2 text-muted transition-colors hover:border-lineStrong hover:text-fg"
      }
      aria-label={theme === "classic" ? "Switch to modern dark theme" : "Switch to classic light theme"}
      title={theme === "classic" ? "Modern theme" : "Classic scoreboard theme"}
    >
      {mounted && theme === "classic" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
