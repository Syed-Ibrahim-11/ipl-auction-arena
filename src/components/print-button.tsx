"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print team sheet" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
      <Printer size={15} /> {label}
    </button>
  );
}
