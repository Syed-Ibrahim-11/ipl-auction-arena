"use client";

import { Trash2 } from "lucide-react";

export function DeleteRoomButton({ name }: { name: string }) {
  return (
    <button
      type="submit"
      className="inline-flex items-center gap-1 text-danger transition-colors hover:text-danger/80"
      onClick={(event) => {
        if (!window.confirm(`Delete "${name}" permanently? Lots, bids, chat and squads in this room will be removed.`)) {
          event.preventDefault();
        }
      }}
      aria-label={`Delete ${name}`}
    >
      <Trash2 size={13} /> Delete
    </button>
  );
}
