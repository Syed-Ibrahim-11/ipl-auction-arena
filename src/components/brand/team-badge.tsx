import { getFranchise } from "@/lib/teams";
import { getTeamLogo } from "@/lib/brand-assets";
import { cn } from "@/lib/cn";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function TeamBadge({
  teamId,
  name,
  size = 40,
  showName = false,
  className,
}: {
  teamId?: string | null;
  name?: string | null;
  size?: number;
  showName?: boolean;
  className?: string;
}) {
  const franchise = getFranchise(teamId);
  const label = franchise?.name ?? name ?? "Franchise";
  const short = franchise?.shortName ?? initials(label);
  const primary = franchise?.primary ?? "#334155";
  const secondary = franchise?.secondary ?? "#94a3b8";
  const ink = franchise?.ink ?? "#ffffff";
  const fontSize = short.length > 3 ? 16 : short.length > 2 ? 19 : 23;
  const officialLogo = getTeamLogo(teamId);

  const badge = officialLogo ? (
    // The official crest is an SVG served from this repository; it is never
    // hotlinked from the IPL site at runtime.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={officialLogo}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="shrink-0 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,.45)]"
      style={{ width: size, height: size }}
    />
  ) : (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M32 2.8 58 12v20.6C58 49 44.8 60.5 32 63.2 19.2 60.5 6 49 6 32.6V12L32 2.8Z"
        fill={primary}
        stroke={secondary}
        strokeWidth="2"
      />
      <path d="M11 47 51 19l4.2 6.6L15.2 53.6Z" fill={secondary} opacity=".92" />
      <path
        d="M32 8.8 52 16v16c0 12.4-8.1 21.6-20 26.1C20.1 53.6 12 44.4 12 32V16L32 8.8Z"
        fill="none"
        stroke={ink}
        strokeOpacity=".18"
        strokeWidth="1.4"
      />
      <text
        x="32"
        y="38.5"
        textAnchor="middle"
        fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif"
        fontWeight="700"
        fontSize={fontSize}
        letterSpacing=".5"
        fill={ink}
      >
        {short}
      </text>
    </svg>
  );

  if (!showName) {
    return (
      <span className={cn("inline-flex", className)} role="img" aria-label={`${label} crest`}>
        {badge}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span role="img" aria-label={`${label} crest`}>
        {badge}
      </span>
      <span className="text-sm font-semibold text-fg">{label}</span>
    </span>
  );
}
