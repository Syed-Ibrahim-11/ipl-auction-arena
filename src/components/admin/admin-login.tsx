"use client";

import { useActionState, useState } from "react";
import { KeyRound, Lock, ShieldCheck, Terminal } from "lucide-react";
import { loginAction } from "@/app/admin/actions";
import type { LoginState } from "@/lib/admin/types";

export function AdminLogin({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [reveal, setReveal] = useState(false);

  return (
    <div className="container-page grid min-h-[70vh] place-items-center py-14">
      <div className="w-full max-w-md">
        <div className="surface-card relative overflow-hidden p-7">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(420px 220px at 80% 0%, color-mix(in srgb, var(--accent-2) 16%, transparent), transparent 70%)",
            }}
            aria-hidden="true"
          />
          <div className="relative">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-accent2/40 bg-accent2/10 text-accent2">
              <Lock size={22} />
            </span>
            <p className="mt-5 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-accent2">
              Restricted console
            </p>
            <h1 className="mt-2 font-display text-3xl font-black uppercase leading-none tracking-wide">
              Control room
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              This panel can rewrite ratings, clear the cache and inspect every room. It is locked behind a
              server-verified operator key; the key is never stored in the browser.
            </p>

            <form action={action} className="mt-6 space-y-3">
              <label htmlFor="admin-password" className="block text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-faint">
                Operator key
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                    aria-hidden="true"
                  />
                  <input
                    id="admin-password"
                    name="password"
                    type={reveal ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    autoFocus
                    className="input w-full pl-9"
                    placeholder="Enter the admin password"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setReveal((value) => !value)}
                  aria-pressed={reveal}
                >
                  {reveal ? "Hide" : "Show"}
                </button>
              </div>
              {state.error && (
                <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger" role="alert">
                  {state.error}
                </p>
              )}
              <button type="submit" className="btn btn-primary w-full" disabled={pending || !configured}>
                {pending ? "Verifying…" : "Unlock console"}
                <ShieldCheck size={15} />
              </button>
            </form>

            {!configured && (
              <p className="mt-4 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs leading-relaxed text-gold">
                No admin password is configured. Set <code className="font-mono">ADMIN_PASSWORD</code> in
                <code className="font-mono"> .env.local</code> and restart the server.
              </p>
            )}

            <div className="mt-6 flex items-start gap-2 border-t border-line pt-4 text-[0.62rem] leading-relaxed text-faint">
              <Terminal size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>
                Sessions are signed with HMAC-SHA256 and expire after 12 hours. Eight failed attempts from one
                address trigger a ten-minute lockout.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
