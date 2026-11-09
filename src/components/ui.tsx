import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const OVR_TIERS = [
  { min: 88, label: "Elite", color: "var(--gold)" },
  { min: 80, label: "Top tier", color: "var(--success)" },
  { min: 70, label: "Quality", color: "var(--info)" },
  { min: 60, label: "Rotation", color: "var(--muted)" },
  { min: 0, label: "Development", color: "var(--faint)" },
];

export function ovrTier(value: number | null | undefined) {
  if (value === null || value === undefined) return { min: 0, label: "Unrated", color: "var(--faint)" };
  return OVR_TIERS.find((tier) => value >= tier.min) ?? OVR_TIERS[OVR_TIERS.length - 1];
}

export function OvrBadge({
  value,
  size = "md",
  className,
}: {
  value: number | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const tier = ovrTier(value);
  const dimensions = {
    sm: "h-9 w-9 text-[0.95rem] rounded-lg",
    md: "h-12 w-12 text-[1.25rem] rounded-xl",
    lg: "h-20 w-20 text-[2.1rem] rounded-2xl",
  }[size];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 flex-col items-center justify-center border font-display font-bold leading-none tabular-nums",
        dimensions,
        className,
      )}
      style={{
        color: tier.color,
        borderColor: `color-mix(in srgb, ${tier.color} 40%, transparent)`,
        background: `color-mix(in srgb, ${tier.color} 12%, var(--surface-2))`,
      }}
      title={value === null || value === undefined ? "Not rated" : `${value} overall · ${tier.label}`}
    >
      {value ?? "—"}
      <span className="mt-0.5 text-[0.42em] font-sans font-semibold uppercase tracking-[0.12em] opacity-70">
        OVR
      </span>
    </span>
  );
}

export function EvidenceBadge({ quality }: { quality: string | null | undefined }) {
  const map: Record<string, { label: string; className: string }> = {
    strong: { label: "Strong evidence", className: "chip chip-success" },
    moderate: { label: "Moderate evidence", className: "chip chip-info" },
    limited: { label: "Limited evidence", className: "chip chip-gold" },
    none: { label: "No rated sample", className: "chip" },
  };
  const entry = map[quality ?? "none"] ?? map.none;
  return <span className={entry.className}>{entry.label}</span>;
}

export function RoleChip({ role, label }: { role: string; label?: string }) {
  const tone: Record<string, string> = {
    batter: "chip chip-info",
    bowler: "chip chip-danger",
    "all-rounder": "chip chip-success",
    wicketkeeper: "chip chip-gold",
  };
  return <span className={tone[role] ?? "chip"}>{label ?? role}</span>;
}

export function RatingMeter({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null | undefined;
  hint?: string;
}) {
  const safe = value ?? 0;
  const tier = ovrTier(value);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
        <span className="num text-sm font-semibold" style={{ color: value === null ? "var(--faint)" : tier.color }}>
          {value ?? "—"}
        </span>
      </div>
      <div className="progress-track mt-2" aria-hidden="true">
        <div
          className="progress-fill"
          style={{ width: `${Math.max(0, Math.min(100, safe))}%`, background: tier.color }}
        />
      </div>
      {hint && <p className="mt-1.5 text-[0.7rem] leading-snug text-faint">{hint}</p>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-3 font-display text-[clamp(2.4rem,5vw,4rem)] font-bold uppercase leading-[0.94] tracking-[0.01em]">
          {title}
        </h1>
        {description && <p className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-muted">{description}</p>}
        {meta && <div className="mt-5">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="section-title mt-2">{title}</h2>
        {description && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatBlock({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="panel p-4">
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-faint">{label}</p>
      <p className="stat-value mt-2" style={{ color: tone }}>
        {value}
      </p>
      {hint && <p className="mt-2 text-xs leading-snug text-muted">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center px-6 py-14 text-center">
      <p className="font-display text-xl font-semibold uppercase tracking-[0.06em] text-fg">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function FormPips({ form }: { form: Array<"W" | "L" | "N" | "T"> }) {
  if (form.length === 0) return <span className="text-xs text-faint">No matches</span>;
  return (
    <span className="inline-flex gap-1" aria-label={`Recent form: ${form.join(", ")}`}>
      {form.map((result, index) => (
        <span
          key={`${result}-${index}`}
          className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[0.6rem] font-bold"
          style={{
            background:
              result === "W"
                ? "color-mix(in srgb, var(--success) 18%, transparent)"
                : result === "L"
                  ? "color-mix(in srgb, var(--danger) 16%, transparent)"
                  : "var(--surface-2)",
            color: result === "W" ? "var(--success)" : result === "L" ? "var(--danger)" : "var(--muted)",
          }}
        >
          {result}
        </span>
      ))}
    </span>
  );
}

export function Notice({
  title,
  children,
  tone = "info",
}: {
  title?: string;
  children: ReactNode;
  tone?: "info" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-xs leading-relaxed",
        tone === "warning"
          ? "border-gold/30 bg-gold/5 text-muted"
          : "border-info/25 bg-info/5 text-muted",
      )}
    >
      {title && <p className="mb-1 font-semibold text-fg">{title}</p>}
      {children}
    </div>
  );
}
