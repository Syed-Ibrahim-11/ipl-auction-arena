import Image from "next/image";
import { getFranchise } from "@/lib/teams";
import { getPlayerBrand } from "@/lib/brand-assets";
import { cn } from "@/lib/cn";

const PALETTES = [
  ["#f97316", "#7c2d12"],
  ["#38bdf8", "#0c4a6e"],
  ["#a78bfa", "#3b1d78"],
  ["#34d399", "#064e3b"],
  ["#f472b6", "#831843"],
  ["#fbbf24", "#78350f"],
  ["#fb7185", "#7f1d1d"],
  ["#60a5fa", "#1e3a8a"],
] as const;

const SKIN = [
  { base: "#f4cda6", shadow: "#d6a170", light: "#fce7cd" },
  { base: "#e8b98c", shadow: "#c4905f", light: "#f6d5b0" },
  { base: "#d29b6a", shadow: "#aa7342", light: "#e8b98c" },
  { base: "#b87c4d", shadow: "#8f5831", light: "#d29b6a" },
  { base: "#93603a", shadow: "#6f4324", light: "#ab7649" },
  { base: "#6d4524", shadow: "#4d2e15", light: "#85562f" },
] as const;

const HAIR = ["#14100c", "#251a11", "#34251a", "#0c0c0c", "#4b3524"] as const;

const COUNTRY_CODES: Record<string, { code: string; bands: string[] }> = {
  india: { code: "IND", bands: ["#ff9933", "#f7f7f7", "#138808"] },
  australia: { code: "AUS", bands: ["#0b1f4d", "#0b1f4d", "#f6c445"] },
  england: { code: "ENG", bands: ["#f7f7f7", "#c8102e", "#f7f7f7"] },
  "south africa": { code: "SA", bands: ["#007a4d", "#ffb81c", "#002395"] },
  "new zealand": { code: "NZ", bands: ["#101820", "#101820", "#c8102e"] },
  "west indies": { code: "WI", bands: ["#7b0c2e", "#f2c500", "#0b6e3f"] },
  pakistan: { code: "PAK", bands: ["#01411c", "#f7f7f7", "#01411c"] },
  "sri lanka": { code: "SL", bands: ["#8d153a", "#f7b718", "#0b6e3f"] },
  afghanistan: { code: "AFG", bands: ["#101010", "#d32011", "#007a36"] },
  bangladesh: { code: "BAN", bands: ["#006a4e", "#f42a41", "#006a4e"] },
  ireland: { code: "IRE", bands: ["#169b62", "#f7f7f7", "#ff883e"] },
  zimbabwe: { code: "ZIM", bands: ["#0b6e3f", "#f7c500", "#d32011"] },
  netherlands: { code: "NED", bands: ["#ae1c28", "#f7f7f7", "#21468b"] },
  scotland: { code: "SCO", bands: ["#0065bd", "#f7f7f7", "#0065bd"] },
  nepal: { code: "NEP", bands: ["#dc143c", "#003893", "#dc143c"] },
  "united arab emirates": { code: "UAE", bands: ["#00732f", "#f7f7f7", "#101010"] },
  "united states": { code: "USA", bands: ["#3c3b6e", "#f7f7f7", "#b22234"] },
  namibia: { code: "NAM", bands: ["#003580", "#0b6e3f", "#d21034"] },
};

function hashName(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, factor: number): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return hex;
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) =>
    Math.max(0, Math.min(255, Math.round(channel * factor))),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export type PortraitTraits = {
  seed: number;
  skin: (typeof SKIN)[number];
  hair: string;
  hairStyle: number;
  beard: number;
  jerseyNumber: number;
  kit: number;
  backdrop: number;
  mouth: number;
};

/** Deterministic trait sheet so a player looks identical on every surface and render. */
export function portraitTraits(name: string): PortraitTraits {
  const seed = hashName(name || "IPL player");
  const random = mulberry32(seed);
  random();
  return {
    seed,
    skin: SKIN[Math.floor(random() * SKIN.length)],
    hair: HAIR[Math.floor(random() * HAIR.length)],
    hairStyle: Math.floor(random() * 6),
    beard: Math.floor(random() * 4),
    jerseyNumber: 1 + Math.floor(random() * 98),
    kit: Math.floor(random() * 4),
    backdrop: Math.floor(random() * 3),
    mouth: Math.floor(random() * 3),
  };
}

function playerRoleFlags(role: string | undefined) {
  const value = (role ?? "").toLowerCase();
  return {
    keeper: value.includes("keeper") || value.includes("wicket"),
    bowler: value.includes("bowl"),
    allRounder: value.includes("all"),
    batter: value.includes("bat") || (!value.includes("bowl") && !value.includes("keeper")),
  };
}

function Hair({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 1:
      return (
        <>
          <path
            d="M69 92c-2-26 13-41 33-41 19 0 31 11 31 30-8-13-20-19-35-17-10 2-17 9-21 20-3-6-5-8-8-7z"
            fill={color}
          />
          <path d="M76 70c8-9 19-13 30-11-12 1-21 6-27 15z" fill="#ffffff" opacity="0.12" />
        </>
      );
    case 2:
      return (
        <g fill={color}>
          {[
            [75, 74],
            [85, 63],
            [97, 58],
            [109, 58],
            [121, 63],
            [129, 74],
            [71, 87],
            [130, 87],
            [78, 63],
            [116, 61],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="8.5" />
          ))}
          <path d="M70 92c0-24 14-38 31-38s30 13 30 36c-8-14-17-21-31-21s-22 7-30 23z" />
        </g>
      );
    case 3:
      return (
        <>
          <path d="M70 88c1-24 14-36 31-36 18 0 30 12 30 34-6-14-16-22-31-22-13 0-22 7-28 20z" fill={color} />
          <path d="M70 88c0-8 2-13 4-16-1 8 0 13 2 18z" fill={shade(color, 0.6)} />
          <path d="M131 88c0-8-2-13-4-16 1 8 0 13-2 18z" fill={shade(color, 0.6)} />
          <path d="M78 74c5-8 12-12 21-14-9 4-15 9-19 16z" fill="#ffffff" opacity="0.14" />
        </>
      );
    case 4:
      return (
        <>
          <circle cx="100" cy="51" r="10" fill={color} />
          <circle cx="100" cy="51" r="5.5" fill={shade(color, 0.7)} />
          <path d="M70 90c-1-25 13-38 31-38 18 0 30 12 30 35-8-15-18-22-31-22-12 0-22 7-30 25z" fill={color} />
        </>
      );
    case 5:
      return (
        <>
          <path d="M68 96c-3-28 12-44 32-44 21 0 33 14 33 41l-6 34-8-3 3-30c-8-16-17-23-29-23-11 0-20 6-27 19l2 32-8 3z" fill={color} />
          <path d="M78 72c6-9 14-13 23-13-9 3-16 8-21 16z" fill="#ffffff" opacity="0.12" />
        </>
      );
    default:
      return <path d="M69 90c-1-24 13-38 31-38 19 0 31 13 31 36-7-13-17-20-31-20-13 0-23 7-31 22z" fill={color} />;
  }
}

function Beard({ style, color, skinShadow }: { style: number; color: string; skinShadow: string }) {
  if (style === 0) return null;
  if (style === 1) {
    return (
      <path
        d="M73 104c2 20 13 30 27 30s25-10 27-30c-3 9-7 14-12 17-4 3-9 5-15 5s-11-2-15-5c-5-3-9-8-12-17z"
        fill={color}
        opacity="0.32"
      />
    );
  }
  if (style === 3) {
    return (
      <>
        <path d="M90 118c4-4 16-4 20 0 2 5 1 10-2 13-4 3-12 3-16 0-3-3-4-8-2-13z" fill={color} opacity="0.9" />
        <path d="M91 116c5-2 13-2 18 0-4 2-14 2-18 0z" fill={color} opacity="0.85" />
      </>
    );
  }
  return (
    <>
      <path
        d="M72 101c2 23 13 34 28 34s26-11 28-34c-2 7-4 10-6 12l-4 4c-5 4-11 6-18 6s-13-2-18-6l-4-4c-2-2-4-5-6-12z"
        fill={color}
        opacity="0.9"
      />
      <path d="M90 116c6-3 14-3 20 0-3 4-7 5-10 5s-7-1-10-5z" fill={color} />
      <path d="M84 108c3-2 8-3 11-1-4 0-8 1-11 3z" fill={skinShadow} opacity="0.25" />
    </>
  );
}

function RoleProp({ role, skin, secondary }: { role: string | undefined; skin: string; secondary: string }) {
  const flags = playerRoleFlags(role);
  const ballX = 147;
  const ballY = 178;
  return (
    <>
      {(flags.batter || flags.allRounder) && (
        <g transform="rotate(19 152 120)">
          <rect x="147" y="18" width="10" height="54" rx="5" fill="#20232a" />
          <rect x="147" y="24" width="10" height="4" fill={secondary} opacity="0.7" />
          <rect x="147" y="32" width="10" height="4" fill={secondary} opacity="0.7" />
          <rect x="147" y="40" width="10" height="4" fill={secondary} opacity="0.7" />
          <path d="M143 72h18l3 74c0 6-4 10-12 10s-12-4-12-10z" fill="#d9bc8f" />
          <path d="M143 72h18l1 16h-20z" fill="#e8cfa6" />
          <path d="M152 74v78" stroke="#b9945f" strokeWidth="1.2" opacity="0.7" />
          <path d="M144 146h16" stroke="#b9945f" strokeWidth="2" opacity="0.6" />
        </g>
      )}
      {flags.keeper ? (
        <>
          <g>
            <path d="M48 166c-8 4-11 12-9 19 1 5 5 8 10 8 7 0 11-5 11-12 0-8-4-14-12-15z" fill="#f2ede0" />
            <path d="M50 172c4 3 5 8 4 13" stroke={secondary} strokeWidth="2" fill="none" opacity="0.8" />
            <path d="M44 189c4 2 9 2 13 0" stroke="#c9c0aa" strokeWidth="2" fill="none" />
          </g>
          <g transform="translate(200 0) scale(-1 1)">
            <path d="M48 166c-8 4-11 12-9 19 1 5 5 8 10 8 7 0 11-5 11-12 0-8-4-14-12-15z" fill="#f2ede0" />
            <path d="M50 172c4 3 5 8 4 13" stroke={secondary} strokeWidth="2" fill="none" opacity="0.8" />
            <path d="M44 189c4 2 9 2 13 0" stroke="#c9c0aa" strokeWidth="2" fill="none" />
          </g>
        </>
      ) : (
        <>
          <circle cx={ballX + 1} cy={ballY + 13} r="9" fill={skin} />
          <circle cx={ballX} cy={ballY} r="13" fill="#b3202c" />
          <path d={`M${ballX - 12} ${ballY + 3}c7-6 17-6 24 0`} fill="none" stroke="#f4e7dc" strokeWidth="1.6" opacity="0.9" />
          <path d={`M${ballX - 12} ${ballY + 3}c8 1 15 1 24 0`} fill="none" stroke="#7d121a" strokeWidth="1" opacity="0.6" />
          <circle cx={ballX - 4} cy={ballY - 5} r="3.5" fill="#ffffff" opacity="0.22" />
        </>
      )}
    </>
  );
}

export function PlayerAvatar({
  name,
  teamId,
  role,
  country,
  size = "md",
  className,
  showNote = false,
}: {
  name: string;
  teamId?: string | null;
  role?: string;
  country?: string | null;
  size?: "sm" | "md" | "lg" | "hero";
  className?: string;
  showNote?: boolean;
}) {
  const franchise = getFranchise(teamId);
  const brand = getPlayerBrand(undefined, name);
  const traits = portraitTraits(name);
  const palette = franchise
    ? [franchise.primary, franchise.secondary]
    : PALETTES[traits.seed % PALETTES.length];
  const primary = palette[0];
  const secondary = palette[1];
  const deep = shade(primary, 0.42);
  const mids = shade(primary, 0.64);
  const ink = franchise?.ink ?? "#ffffff";
  const flags = playerRoleFlags(role);
  const countryInfo = COUNTRY_CODES[(country ?? "").toLowerCase().trim()] ?? null;
  const uid = `pa-${traits.seed.toString(36)}-${hashName(`${teamId ?? ""}|${name}`).toString(36)}`;

  const sizeClass = {
    sm: "h-10 w-10 rounded-lg",
    md: "h-16 w-16 rounded-xl",
    lg: "h-28 w-28 rounded-2xl",
    hero: "aspect-[4/5] w-full rounded-2xl",
  }[size];

  const imageSizes = {
    sm: "40px",
    md: "64px",
    lg: "112px",
    hero: "(max-width: 640px) 90vw, 480px",
  }[size];

  const viewBox =
    size === "hero"
      ? "0 0 200 250"
      : size === "lg"
        ? "18 14 164 164"
        : size === "md"
          ? "24 20 152 152"
          : "40 30 120 120";
  const detailed = size === "lg" || size === "hero";

  return (
    <div
      className={cn("relative isolate overflow-hidden border border-white/10 bg-bg", sizeClass, className)}
      style={{
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.14), 0 10px 30px -18px ${shade(primary, 0.5)}`,
      }}
      role="img"
      aria-label={brand ? `Official squad portrait of ${name}` : `Illustrated portrait of ${name}.`}
    >
      {brand ? (
        <>
          <Image
            src={brand.photo}
            alt=""
            fill
            sizes={imageSizes}
            className="object-cover"
            style={{ objectPosition: size === "sm" || size === "md" ? "50% 18%" : "50% 12%" }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(4,7,12,0) 48%, rgba(4,7,12,.18) 68%, rgba(4,7,12,.82) 100%)",
            }}
          />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
        </>
      ) : (
      <svg viewBox={viewBox} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor={mids} stopOpacity="0.95" />
            <stop offset="52%" stopColor={deep} />
            <stop offset="100%" stopColor="#05080d" />
          </linearGradient>
          <radialGradient id={`${uid}-glow`} cx="0.18" cy="0.08" r="0.85">
            <stop offset="0%" stopColor={secondary} stopOpacity="0.55" />
            <stop offset="55%" stopColor={secondary} stopOpacity="0.1" />
            <stop offset="100%" stopColor={secondary} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-vignette`} cx="0.5" cy="0.42" r="0.75">
            <stop offset="55%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
          </radialGradient>
          <linearGradient id={`${uid}-skin`} x1="0.15" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor={traits.skin.light} />
            <stop offset="55%" stopColor={traits.skin.base} />
            <stop offset="100%" stopColor={traits.skin.shadow} />
          </linearGradient>
          <linearGradient id={`${uid}-jersey`} x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor={shade(primary, 1)} />
            <stop offset="62%" stopColor={shade(primary, 0.68)} />
            <stop offset="100%" stopColor={shade(primary, 0.34)} />
          </linearGradient>
          <linearGradient id={`${uid}-light`} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        <rect width="200" height="250" fill={`url(#${uid}-bg)`} />
        <rect width="200" height="250" fill={`url(#${uid}-glow)`} />

        {traits.backdrop === 0 && (
          <g opacity="0.3">
            <polygon points="0,0 58,0 128,250 44,250" fill={secondary} opacity="0.08" />
            <polygon points="200,0 168,0 92,250 152,250" fill="#ffffff" opacity="0.05" />
          </g>
        )}
        {traits.backdrop === 1 && (
          <g opacity="0.32">
            {Array.from({ length: 18 }, (_, index) => {
              const x = 12 + ((index * 37 + traits.seed) % 178);
              const y = 16 + ((index * 53 + traits.seed) % 210);
              return <circle key={index} cx={x} cy={y} r={index % 3 === 0 ? 2.2 : 1.2} fill="#ffffff" opacity={0.18 + (index % 4) * 0.08} />;
            })}
          </g>
        )}
        {traits.backdrop === 2 && (
          <g opacity="0.25" stroke="#ffffff" strokeWidth="0.7">
            {[0, 1, 2, 3].map((line) => (
              <line key={line} x1={-20 + line * 46} y1="0" x2={60 + line * 46} y2="250" opacity="0.35" />
            ))}
          </g>
        )}

        {size === "hero" && (
          <text
            x="186"
            y="246"
            textAnchor="end"
            fontSize="58"
            fontWeight="800"
            fill="#ffffff"
            opacity="0.08"
            fontFamily="var(--font-display, system-ui), sans-serif"
          >
            {String(traits.jerseyNumber).padStart(2, "0")}
          </text>
        )}

        <RoleProp role={role} skin={traits.skin.base} secondary={secondary} />

        <rect x="88" y="116" width="24" height="52" rx="10" fill={traits.skin.shadow} />
        <polygon points="88,122 112,122 112,138 88,138" fill={traits.skin.shadow} opacity="0.35" />

        <path
          d="M36 250c2-42 18-72 42-82 8-4 36-4 44 0 24 10 40 40 42 82z"
          fill={`url(#${uid}-jersey)`}
        />
        <path
          d="M36 250c-6-26-8-52 0-72 8-8 24-10 36-2l-8 32c-10 12-17 28-19 42z"
          fill={`url(#${uid}-jersey)`}
        />
        <path
          d="M164 250c6-26 8-52 0-72-8-8-24-10-36-2l8 32c10 12 17 28 19 42z"
          fill={`url(#${uid}-jersey)`}
        />
        {traits.kit === 1 && (
          <path d="M64 168c12-6 60-6 72 0l-6 18c-18-5-42-5-60 0z" fill={secondary} opacity="0.9" />
        )}
        {traits.kit === 2 && (
          <path d="M52 226L126 166l12 8-74 62z" fill={secondary} opacity="0.55" />
        )}
        {traits.kit === 3 && (
          <>
            <rect x="42" y="200" width="9" height="50" rx="4" fill={secondary} opacity="0.7" />
            <rect x="149" y="200" width="9" height="50" rx="4" fill={secondary} opacity="0.7" />
          </>
        )}
        <path d="M86 166l14 20 14-20" fill="none" stroke={secondary} strokeWidth="7" strokeLinejoin="round" />
        <path d="M100 188v62" stroke={secondary} strokeWidth="2.4" opacity="0.55" />
        <path d="M36 250c2-42 18-72 42-82" fill="none" stroke="#ffffff" strokeWidth="1.2" opacity="0.18" />

        {detailed && (
          <g transform="translate(64 180)">
            <path d="M0 0h18v9c0 7-9 12-9 12S0 16 0 9z" fill={secondary} stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1" />
            <text x="9" y="10.5" textAnchor="middle" fontSize="6.2" fontWeight="800" fill={ink} opacity="0.92" fontFamily="var(--font-display, system-ui), sans-serif">
              {franchise?.shortName ?? "XI"}
            </text>
          </g>
        )}

        <ellipse cx="69" cy="99" rx="7" ry="8" fill={traits.skin.base} />
        <ellipse cx="131" cy="99" rx="7" ry="8" fill={traits.skin.base} />
        <path d="M67 97c2-2 4-2 6 0" stroke={traits.skin.shadow} strokeWidth="1.2" fill="none" opacity="0.7" />
        <path d="M127 97c2-2 4-2 6 0" stroke={traits.skin.shadow} strokeWidth="1.2" fill="none" opacity="0.7" />

        <ellipse cx="100" cy="96" rx="31" ry="36" fill={`url(#${uid}-skin)`} />
        <path d="M112 66c13 10 17 30 9 48 8-16 8-36-4-48z" fill={traits.skin.shadow} opacity="0.22" />
        <ellipse cx="100" cy="106" rx="20" ry="19" fill={traits.skin.base} opacity="0.18" />

        <Hair style={traits.hairStyle} color={traits.hair} />

        <path d="M82 89c4-2 9-2 12 0" stroke={traits.hair} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d="M106 89c4-2 9-2 12 0" stroke={traits.hair} strokeWidth="2.4" strokeLinecap="round" fill="none" />

        <g>
          <ellipse cx="88" cy="97" rx="6.4" ry="4.1" fill="#f7f4ee" />
          <circle cx="88.5" cy="97" r="2.9" fill="#2b1d13" />
          <circle cx="88.5" cy="97" r="1.3" fill="#0b0805" />
          <circle cx="87.5" cy="96" r="1" fill="#ffffff" opacity="0.85" />
          <ellipse cx="112" cy="97" rx="6.4" ry="4.1" fill="#f7f4ee" />
          <circle cx="111.5" cy="97" r="2.9" fill="#2b1d13" />
          <circle cx="111.5" cy="97" r="1.3" fill="#0b0805" />
          <circle cx="110.5" cy="96" r="1" fill="#ffffff" opacity="0.85" />
        </g>

        <path d="M99 99l-2 10c0 2 1 3 3 3" fill="none" stroke={traits.skin.shadow} strokeWidth="1.7" strokeLinecap="round" opacity="0.65" />
        <path d="M93 105c2 1 4 1 5 0" stroke={traits.skin.shadow} strokeWidth="1.2" fill="none" opacity="0.4" />

        {traits.mouth === 0 && <path d="M92 118c3 2.5 13 2.5 16 0" stroke="#7d3a35" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.85" />}
        {traits.mouth === 1 && <path d="M92 118c3 4 13 4 16 0" stroke="#7d3a35" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.85" />}
        {traits.mouth === 2 && <path d="M93 119h14" stroke="#7d3a35" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.85" />}

        <Beard style={traits.beard} color={traits.hair} skinShadow={traits.skin.shadow} />

        {flags.batter && !flags.allRounder && size !== "hero" && (
          <path d="M64 172l-8 18" stroke="#20232a" strokeWidth="5" strokeLinecap="round" opacity="0.5" />
        )}

        <rect width="200" height="250" fill={`url(#${uid}-light)`} />
        <rect width="200" height="250" fill={`url(#${uid}-vignette)`} />

        {size === "hero" && countryInfo && (
          <g transform="translate(10 12)">
            <rect x="0" y="0" width="20" height="13" rx="2.5" fill="#0b0f16" opacity="0.55" />
            {countryInfo.bands.map((band, index) => (
              <rect key={index} x="0" y={index * (13 / 3)} width="20" height={13 / 3} fill={band} opacity="0.95" />
            ))}
            <rect x="20" y="0" width="24" height="13" rx="2.5" fill="#0b0f16" opacity="0.55" />
            <text x="32" y="9.6" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ffffff" opacity="0.92" fontFamily="system-ui, sans-serif">
              {countryInfo.code}
            </text>
          </g>
        )}
      </svg>
      )}

      {size !== "hero" && (
        <span
          className="absolute left-1 top-1 rounded bg-black/45 px-1 py-0.5 font-display text-[0.55rem] font-bold leading-none tracking-wide text-white/85 backdrop-blur-sm"
          aria-hidden="true"
        >
          {String(brand?.jersey ?? traits.jerseyNumber).padStart(2, "0")}
        </span>
      )}

      {showNote && (
        <span className="absolute bottom-2 left-2 right-2 rounded-md bg-black/40 px-1.5 py-1 text-[0.55rem] font-semibold uppercase tracking-[0.16em] text-white/70 backdrop-blur-sm">
          {brand ? "Official squad portrait" : "Illustrated portrait"}
        </span>
      )}
    </div>
  );
}
