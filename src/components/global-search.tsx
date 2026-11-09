"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const CommandPalette = dynamic(
  () => import("@/components/command-palette").then((module) => module.CommandPalette),
  { ssr: false },
);

let prefetched = false;

/** Start downloading the palette without mounting it. */
function prefetchPalette(): void {
  if (prefetched) return;
  prefetched = true;
  void import("@/components/command-palette");
}

/**
 * Search is a shortcut, not page chrome, so its bundle stays out of every
 * page load until the user shows intent (⌘K, the header button, or a hover).
 */
export function GlobalSearch() {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        prefetchPalette();
        setArmed(true);
      }
    };
    const onWarm = () => prefetchPalette();
    const onOpen = () => {
      prefetchPalette();
      setArmed(true);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("arena:prefetch-search", onWarm);
    window.addEventListener("arena:open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("arena:prefetch-search", onWarm);
      window.removeEventListener("arena:open-search", onOpen);
    };
  }, []);

  if (!armed) return null;
  return <CommandPalette autoOpen />;
}
