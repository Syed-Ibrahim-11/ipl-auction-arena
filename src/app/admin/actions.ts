"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { recomputeRatings } from "@/lib/ratings/recompute";
import {
  clearFailures,
  endAdminSession,
  isAdminAuthenticated,
  recordFailure,
  startAdminSession,
  throttled,
  verifyAdminPassword,
} from "@/lib/admin/auth";
import type { LoginState } from "@/lib/admin/types";

async function clientAddress(): Promise<string> {
  const store = await headers();
  return (
    store.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    store.get("x-real-ip") ||
    "local"
  );
}

function ensureAuditTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      detail TEXT,
      address TEXT,
      at TEXT NOT NULL
    )
  `);
}

function audit(action: string, detail: string, address: string): void {
  try {
    ensureAuditTable();
    getDb()
      .prepare("INSERT INTO admin_audit (action, detail, address, at) VALUES (?, ?, ?, ?)")
      .run(action, detail, address, new Date().toISOString());
  } catch {
    // Audit failures must never block the operation the admin asked for.
  }
}

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const address = await clientAddress();
  if (throttled(address)) {
    return { error: "Too many attempts. Wait ten minutes before trying again." };
  }
  const password = String(formData.get("password") ?? "");
  if (!verifyAdminPassword(password)) {
    recordFailure(address);
    audit("login-failed", "Incorrect password", address);
    return { error: "That password is not correct." };
  }
  clearFailures(address);
  await startAdminSession();
  audit("login", "Administrator signed in", address);
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const address = await clientAddress();
  await endAdminSession();
  audit("logout", "Administrator signed out", address);
  redirect("/admin");
}

export async function recomputeRatingsAction(): Promise<void> {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const summary = recomputeRatings(getDb());
  const address = await clientAddress();
  audit(
    "ratings-recompute",
    `${summary.formulaVersion}: ${summary.ratedPlayers} players across ${summary.seasonVersions} season snapshots`,
    address,
  );
  revalidatePath("/", "layout");
  redirect(`/admin?notice=ratings&rated=${summary.ratedPlayers}`);
}

export async function clearCacheAction(): Promise<void> {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  revalidatePath("/", "layout");
  audit("cache-clear", "Revalidated the full application layout", await clientAddress());
  redirect("/admin?notice=cache");
}

export async function deleteRoomAction(formData: FormData): Promise<void> {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const sessionId = String(formData.get("sessionId") ?? "").trim();
  if (!sessionId) redirect("/admin?notice=missing");

  const row = getDb()
    .prepare("SELECT name FROM auction_sessions WHERE id = ?")
    .get(sessionId) as { name: string } | undefined;
  if (!row) redirect("/admin?notice=missing");

  getDb().prepare("DELETE FROM auction_sessions WHERE id = ?").run(sessionId);
  audit(
    "room-delete",
    `Deleted auction room "${row.name}" (${sessionId})`,
    await clientAddress(),
  );
  revalidatePath("/admin");
  redirect("/admin?notice=deleted");
}
