import Link from "next/link";
import { cn } from "@/lib/cn";

export function LogoMark({
  size = 38,
  mono = false,
  className,
}: {
  size?: number;
  mono?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="arena-shield" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#13223a" />
          <stop offset="1" stopColor="#080e17" />
        </linearGradient>
        <linearGradient id="arena-leg" x1="24" y1="48" x2="44" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff7a1a" />
          <stop offset="1" stopColor="#ffb15c" />
        </linearGradient>
      </defs>
      <path
        d="M32 3.2 56.5 11.8v18.5c0 15.3-10.2 26.9-24.5 31.9C17.7 57.2 7.5 45.6 7.5 30.3V11.8L32 3.2Z"
        fill={mono ? "none" : "url(#arena-shield)"}
        stroke={mono ? "currentColor" : "#ff7a1a"}
        strokeWidth="2.2"
      />
      <path
        d="M27.9 20.4 18.6 50.2"
        stroke={mono ? "currentColor" : "#edf2f9"}
        strokeWidth="5.4"
        strokeLinecap="round"
      />
      <path
        d="M36.1 20.4 45.4 50.2"
        stroke={mono ? "currentColor" : "url(#arena-leg)"}
        strokeWidth="5.4"
        strokeLinecap="round"
      />
      <path
        d="M24.6 39.4h14.8"
        stroke={mono ? "currentColor" : "#edf2f9"}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="32" cy="15.2" r="5" fill={mono ? "currentColor" : "#ff7a1a"} />
      <path
        d="M29.4 12.4c1.7 1.4 1.9 4.2.3 5.8M34.6 12.4c-1.7 1.4-1.9 4.2-.3 5.8"
        stroke={mono ? "none" : "#0a111d"}
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity=".8"
      />
      {!mono && (
        <path
          d="M17.2 44.4h5.1M41.7 44.4h5.1"
          stroke="#5aa7ff"
          strokeWidth="1.7"
          strokeLinecap="round"
          opacity=".75"
        />
      )}
    </svg>
  );
}

export function BrandLogo({
  href = "/",
  size = "md",
  className,
  markOnly = false,
}: {
  href?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  markOnly?: boolean;
}) {
  const markSize = size === "lg" ? 52 : size === "sm" ? 30 : 38;
  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={markSize} />
      {!markOnly && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.3em] text-muted">
            IPL Auction
          </span>
          <span
            className={cn(
              "font-display font-bold uppercase leading-[0.9] tracking-[0.04em] text-fg",
              size === "lg" ? "text-[2rem]" : size === "sm" ? "text-[1.15rem]" : "text-[1.45rem]",
            )}
          >
            Arena
          </span>
        </span>
      )}
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} aria-label="IPL Auction Arena home" className="group inline-flex">
      {content}
    </Link>
  );
}
