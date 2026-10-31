import React, { useId, useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useMotionPrefs } from './useMotionPrefs';

export interface HatchedBarDatum {
  label: string;
  value: number;
  /** Draw this bar as a hatched outline — pending, projected or future. */
  hatched?: boolean;
  /** Optional per-bar meta surfaced in the tooltip. */
  note?: string;
}

export interface HatchedBarChartProps {
  data: HatchedBarDatum[];
  height?: number;
  /** Unit appended to tooltip and axis values, e.g. "h". */
  unit?: string;
  /** Legend text for the hatched state. Hidden when nothing is hatched. */
  hatchedLabel?: string;
  solidLabel?: string;
  className?: string;
  /** Hide the y-axis for compact, in-card usage. */
  compact?: boolean;
}

/** What actually gets plotted: zero-height bars are floored so the hatch shows. */
interface PlottedDatum extends HatchedBarDatum {
  plot: number;
}

interface TipProps {
  active?: boolean;
  payload?: { payload: PlottedDatum }[];
  unit?: string;
}

const ChartTooltip: React.FC<TipProps> = ({ active, payload, unit }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  return (
    <div
      className="rounded-[var(--tm-radius-md)] bg-[var(--tm-accent)] px-4 py-2.5 text-[var(--tm-accent-ink)] shadow-soft-lg"
      role="tooltip"
    >
      <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] opacity-70">
        {d.label}
      </div>
      <div className="mt-0.5">
        <span className="text-[17px] font-extrabold tabular-nums">
          {d.value.toLocaleString()}
          {unit}
        </span>
      </div>
      {d.note && <div className="mt-0.5 text-[11px] opacity-70">{d.note}</div>}
    </div>
  );
};

/**
 * Single-series magnitude bars in the accent hue. Bars flagged `hatched`
 * render as a diagonal-stripe fill so pending or future values read as
 * "not real yet" without spending another colour on them.
 */
export const HatchedBarChart: React.FC<HatchedBarChartProps> = ({
  data,
  height = 220,
  unit = '',
  hatchedLabel = 'Pending',
  solidLabel = 'Logged',
  className = '',
  compact = false
}) => {
  const { reduced } = useMotionPrefs();
  const uid = useId().replace(/:/g, '');
  const patternId = `bar-hatch-${uid}`;
  const hasHatched = data.some((d) => d.hatched);

  /**
   * A zero bar would draw nothing, so a hatched empty value gets a small
   * floor height. The tooltip and axis still report the real number.
   */
  const plotted: PlottedDatum[] = useMemo(() => {
    const max = Math.max(...data.map((d) => d.value), 0);
    const floor = max > 0 ? max * 0.045 : 1;
    return data.map((d) => ({
      ...d,
      plot: d.hatched && d.value === 0 ? floor : d.value
    }));
  }, [data]);

  const axisStyle = {
    fontSize: 11,
    fontWeight: 600,
    fill: 'var(--tm-ink-muted)'
  };

  return (
    <div className={className}>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={plotted} margin={{ top: 8, right: 4, bottom: 0, left: compact ? -24 : -8 }}>
            <defs>
              <pattern
                id={patternId}
                width="6"
                height="6"
                patternTransform="rotate(45)"
                patternUnits="userSpaceOnUse"
              >
                <rect width="6" height="6" fill="var(--tm-primary-softer)" />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="6"
                  stroke="var(--tm-primary)"
                  strokeOpacity="0.42"
                  strokeWidth="2"
                />
              </pattern>
            </defs>

            {/* Recessive grid: horizontal only */}
            <CartesianGrid
              vertical={false}
              stroke="var(--tm-border)"
              strokeDasharray="3 5"
            />

            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={axisStyle}
              dy={6}
              interval="preserveStartEnd"
            />

            {!compact && (
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={axisStyle}
                width={44}
                tickFormatter={(v: number) => `${v}${unit}`}
              />
            )}

            <Tooltip
              content={<ChartTooltip unit={unit} />}
              cursor={false}
            />

            <Bar
              dataKey="plot"
              radius={[12, 12, 12, 12]}
              maxBarSize={34}
              isAnimationActive={!reduced}
              animationDuration={850}
              animationEasing="ease-out"
            >
              {plotted.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.hatched ? `url(#${patternId})` : 'var(--tm-primary)'}
                  stroke={d.hatched ? 'var(--tm-primary)' : 'none'}
                  strokeOpacity={d.hatched ? 0.3 : 0}
                  strokeWidth={d.hatched ? 1 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Texture key — identity is never carried by colour alone */}
      {hasHatched && (
        <div className="mt-3 flex items-center gap-4 px-1">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-[var(--tm-ink-muted)]">
            <span
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ background: 'var(--tm-primary)' }}
            />
            {solidLabel}
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-[var(--tm-ink-muted)]">
            <span className="hatch h-2.5 w-2.5 rounded-[3px] ring-1 ring-[var(--tm-primary)]/25" />
            {hatchedLabel}
          </span>
        </div>
      )}
    </div>
  );
};
