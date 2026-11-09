import { cn } from "@/lib/cn";

type Discipline = {
  rating: number | null;
  formRating: number | null;
  percentile: number | null;
  reliability: number | null;
  components: Array<{
    label: string;
    value: number | null;
    peerMedian: number | null;
    weight: number;
    ratio: number | null;
  }>;
  sample: { matches: number; balls: number; dismissals?: number };
};

const AXES = [
  { key: "batting" as const, label: "Batting", angle: -90, color: "var(--info)" },
  { key: "bowling" as const, label: "Bowling", angle: 150, color: "var(--danger)" },
  { key: "fielding" as const, label: "Fielding", angle: 30, color: "var(--success)" },
];

function polar(center: number, radius: number, angleDeg: number): [number, number] {
  const angle = (angleDeg * Math.PI) / 180;
  return [center + radius * Math.cos(angle), center + radius * Math.sin(angle)];
}

function points(values: number[], radius: number, center = 110): string {
  return AXES.map((axis, index) => {
    const [x, y] = polar(center, (Math.max(0, Math.min(100, values[index])) / 100) * radius, axis.angle);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function RatingRadar({
  batting,
  bowling,
  fielding,
}: {
  batting: number | null;
  bowling: number | null;
  fielding: number | null;
}) {
  const values = [batting ?? 0, bowling ?? 0, fielding ?? 0];
  return (
    <svg viewBox="0 0 220 200" className="mx-auto w-full max-w-[260px]" role="img" aria-label={`Rating radar: batting ${batting ?? "not rated"}, bowling ${bowling ?? "not rated"}, fielding ${fielding ?? "not rated"}`}>
      <defs>
        <linearGradient id="radar-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.42" />
          <stop offset="100%" stopColor="var(--accent2)" stopOpacity="0.14" />
        </linearGradient>
      </defs>
      {[25, 50, 75, 100].map((level) => (
        <polygon
          key={level}
          points={points([level, level, level], 74)}
          fill="none"
          stroke="var(--line)"
          strokeWidth={level === 100 ? 1.2 : 0.8}
          strokeDasharray={level === 100 ? undefined : "3 4"}
        />
      ))}
      {AXES.map((axis) => {
        const [x, y] = polar(110, 74, axis.angle);
        return <line key={axis.key} x1="110" y1="110" x2={x} y2={y} stroke="var(--line)" strokeWidth="0.8" />;
      })}
      <polygon points={points(values, 74)} fill="url(#radar-fill)" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {AXES.map((axis, index) => {
        const [x, y] = polar(110, (Math.max(0, Math.min(100, values[index])) / 100) * 74, axis.angle);
        return <circle key={axis.key} cx={x} cy={y} r="3" fill={axis.color} stroke="var(--surface)" strokeWidth="1.5" />;
      })}
      {AXES.map((axis) => {
        const [x, y] = polar(110, 92, axis.angle);
        return (
          <text
            key={axis.label}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--muted)"
            fontSize="9"
            fontFamily="Inter, sans-serif"
            fontWeight="600"
            letterSpacing="0.06em"
          >
            {axis.label.toUpperCase()}
          </text>
        );
      })}
      {AXES.map((axis, index) => {
        const [x, y] = polar(110, 92, axis.angle);
        return (
          <text
            key={`${axis.label}-value`}
            x={x}
            y={y + 11}
            textAnchor="middle"
            fill={values[index] === 0 ? "var(--faint)" : "var(--fg)"}
            fontSize="10"
            fontFamily="'Barlow Condensed', sans-serif"
            fontWeight="700"
          >
            {values[index] === 0 && (index === 0 ? batting === null : index === 1 ? bowling === null : fielding === null)
              ? "—"
              : values[index]}
          </text>
        );
      })}
    </svg>
  );
}

export function DisciplineCard({
  title,
  discipline,
  accent,
}: {
  title: string;
  discipline: Discipline | null | undefined;
  accent: string;
}) {
  if (!discipline) {
    return (
      <div className="panel p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">{title}</p>
          <span className="text-lg font-semibold text-faint">—</span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          Not enough role-relevant evidence to score this discipline. It carries no weight in the overall
          rating.
        </p>
      </div>
    );
  }
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">{title}</p>
          <p className="num mt-1 font-display text-3xl font-bold leading-none" style={{ color: accent }}>
            {discipline.rating ?? "—"}
          </p>
        </div>
        <div className="text-right text-[0.62rem] text-faint">
          <p>Percentile</p>
          <p className="num text-fg">
            {discipline.percentile !== null ? `${Math.round(discipline.percentile * 100)}th` : "—"}
          </p>
          <p className="mt-1">Reliability</p>
          <p className="num text-fg">
            {discipline.reliability !== null ? `${Math.round(discipline.reliability * 100)}%` : "—"}
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {discipline.components.map((component) => (
          <li key={component.label}>
            <div className="flex items-baseline justify-between gap-2 text-[0.68rem]">
              <span className="text-muted">{component.label}</span>
              <span className="num text-fg">
                {component.value ?? "—"}
                {component.peerMedian !== null && (
                  <span className="ml-1 text-[0.6rem] text-faint">vs {component.peerMedian}</span>
                )}
              </span>
            </div>
            <div className="progress-track mt-1 h-1">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(3, Math.min(100, ((component.ratio ?? 0) / 1.6) * 100))}%`,
                  background: accent,
                  opacity: 0.8,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-line pt-2 text-[0.58rem] leading-relaxed text-faint">
        Sample: {discipline.sample.matches} matches · {discipline.sample.balls.toLocaleString("en-IN")} balls
        {discipline.formRating !== null ? ` · form ${discipline.formRating}` : ""}
      </p>
    </div>
  );
}

export function SeasonTrend({
  seasons,
}: {
  seasons: Array<{ season: number; runs: number; wickets: number; matches: number }>;
}) {
  if (seasons.length === 0) return null;
  const ordered = [...seasons].sort((a, b) => a.season - b.season);
  const totalRuns = ordered.reduce((sum, season) => sum + season.runs, 0);
  const totalWickets = ordered.reduce((sum, season) => sum + season.wickets, 0);
  const peak = [...ordered].sort((a, b) => b.runs - a.runs)[0];
  const maxRuns = Math.max(...ordered.map((season) => season.runs), 1);
  const maxWickets = Math.max(...ordered.map((season) => season.wickets), 1);
  const width = 720;
  const height = 236;
  const padding = { left: 38, right: 38, top: 18, bottom: 40 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const usable = plotW;
  const step = usable / Math.max(ordered.length, 1);
  const barWidth = Math.min(16, Math.max(4, step * 0.3));
  const labelEvery = Math.ceil(ordered.length / 12);
  const runY = (runs: number) => padding.top + plotH - (runs / maxRuns) * plotH;
  const wicketHeight = (wickets: number) => (wickets / maxWickets) * plotH * 0.42;

  const points = ordered.map((season, index) => {
    const x = padding.left + index * step + step / 2;
    return { ...season, x, y: runY(season.runs) };
  });
  const linePath = points.map((p, index) => `${index === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `M${points[0].x.toFixed(1)},${(padding.top + plotH).toFixed(1)} ${points
    .map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ")} L${points[points.length - 1].x.toFixed(1)},${(padding.top + plotH).toFixed(1)} Z`;
  const gridLevels = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          { label: "Seasons", value: String(ordered.length) },
          { label: "Runs", value: totalRuns.toLocaleString("en-IN") },
          { label: "Wickets", value: totalWickets.toLocaleString("en-IN") },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-line bg-surface2/50 px-3 py-2">
            <p className="text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-faint">{item.label}</p>
            <p className="num mt-0.5 font-display text-lg font-bold leading-none">{item.value}</p>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Runs and wickets by IPL season">
        <defs>
          <linearGradient id="season-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {gridLevels.map((level) => {
          const y = padding.top + plotH - level * plotH;
          return (
            <g key={level}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="var(--line)"
                strokeWidth={level === 0 ? 1 : 0.7}
                strokeDasharray={level === 0 ? undefined : "3 5"}
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                textAnchor="end"
                fill="var(--faint)"
                fontSize="8"
                fontFamily="Inter, sans-serif"
              >
                {Math.round(maxRuns * level)}
              </text>
              <text
                x={width - padding.right + 8}
                y={y + 3}
                textAnchor="start"
                fill="var(--faint)"
                fontSize="8"
                fontFamily="Inter, sans-serif"
              >
                {Math.round(maxWickets * level)}
              </text>
            </g>
          );
        })}
        <text
          x={padding.left - 8}
          y={padding.top - 6}
          textAnchor="end"
          fill="var(--muted)"
          fontSize="7.5"
          fontFamily="Inter, sans-serif"
          fontWeight="700"
          letterSpacing="0.08em"
        >
          RUNS
        </text>
        <text
          x={width - padding.right + 8}
          y={padding.top - 6}
          textAnchor="start"
          fill="var(--muted)"
          fontSize="7.5"
          fontFamily="Inter, sans-serif"
          fontWeight="700"
          letterSpacing="0.08em"
        >
          WKTS
        </text>
        <path d={areaPath} fill="url(#season-area)" />
        {points.map((season, index) => (
          <g key={`${season.season}-bar-${index}`}>
            <title>{`${season.season}: ${season.runs} runs, ${season.wickets} wickets, ${season.matches} matches`}</title>
            {season.wickets > 0 && (
              <rect
                x={season.x - barWidth / 2}
                y={padding.top + plotH - wicketHeight(season.wickets)}
                width={barWidth}
                height={Math.max(wicketHeight(season.wickets), 1.5)}
                rx="2"
                fill="var(--info)"
                opacity="0.55"
              />
            )}
          </g>
        ))}
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((season, index) => (
          <g key={`${season.season}-point-${index}`}>
            <circle cx={season.x} cy={season.y} r="3.4" fill="var(--accent2)" stroke="var(--surface)" strokeWidth="1.6" />
            {ordered.length <= 9 && (
              <text
                x={season.x}
                y={season.y - 9}
                textAnchor="middle"
                fill="var(--fg)"
                fontSize="8.5"
                fontFamily="'Barlow Condensed', sans-serif"
                fontWeight="700"
              >
                {season.runs}
              </text>
            )}
          </g>
        ))}
        {points.map((season, index) =>
          index % labelEvery === 0 ? (
            <g key={`${season.season}-label-${index}`}>
              <text
                x={season.x}
                y={padding.top + plotH + 15}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize="8.5"
                fontFamily="Inter, sans-serif"
                fontWeight="600"
              >
                {season.season}
              </text>
              <text
                x={season.x}
                y={padding.top + plotH + 27}
                textAnchor="middle"
                fill="var(--faint)"
                fontSize="7.5"
                fontFamily="Inter, sans-serif"
              >
                {season.matches}M
              </text>
            </g>
          ) : null,
        )}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6rem] text-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-accent" /> Runs per season
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-info" /> Wickets
        </span>
        <span className="ml-auto">
          Peak {peak.season} · {peak.runs.toLocaleString("en-IN")} runs
        </span>
      </div>
    </div>
  );
}

export function ScorePill({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="panel p-3">
      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-faint">{label}</p>
      <p className={cn("num mt-1 font-display text-lg font-bold", tone)}>{value}</p>
    </div>
  );
}
