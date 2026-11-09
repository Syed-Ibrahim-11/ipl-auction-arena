import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "ipl_admin_session";
const SESSION_SECONDS = 60 * 60 * 12;

function configuredPassword(): string | null {
  return process.env.ADMIN_PASSWORD ?? process.env.ADMIN_KEY ?? null;
}

export function adminConfigured(): boolean {
  return Boolean(configuredPassword());
}

function signingSecret(): string {
  return process.env.ADMIN_SESSION_SECRET ?? configuredPassword() ?? "unconfigured-admin";
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyAdminPassword(input: string): boolean {
  const expected = configuredPassword();
  if (!expected) return false;
  return safeEqual(input, expected);
}

export function createAdminToken(now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: now + SESSION_SECONDS * 1000, nonce: randomBytes(8).toString("hex") }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminToken(token: string | null | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof data.exp === "number" && data.exp > now;
  } catch {
    return false;
  }
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminToken(store.get(ADMIN_COOKIE)?.value);
}

export async function startAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, createAdminToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function endAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** In-memory login throttling. Adequate for a single-node local deployment. */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function throttled(address: string): boolean {
  const entry = attempts.get(address);
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= 8;
}

export function recordFailure(address: string): void {
  const now = Date.now();
  const entry = attempts.get(address);
  if (!entry || entry.resetAt < now) {
    attempts.set(address, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return;
  }
  entry.count += 1;
}

export function clearFailures(address: string): void {
  attempts.delete(address);
}
