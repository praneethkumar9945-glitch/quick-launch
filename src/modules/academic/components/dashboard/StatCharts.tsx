import React from 'react';

/** Small SVG charts for the Academic home summary cards. Colours come from theme tokens. */

export interface ChartSegment {
  label: string;
  value: number;
  color: string;
}

const TRACK = 'var(--stat-chart-track)';

export const WeekBars: React.FC<{ days: { label: string; value: number; active: boolean }[] }> = ({ days }) => {
  const max = Math.max(1, ...days.map((d) => d.value));
  const width = 168;
  const height = 52;
  const gap = 8;
  const barW = (width - gap * (days.length - 1)) / days.length;

  return (
    <svg viewBox={`0 0 ${width} ${height + 14}`} className="stat-chart-svg" role="img" aria-label="Batches per weekday">
      {days.map((d, i) => {
        const x = i * (barW + gap);
        const h = d.value === 0 ? 3 : Math.max(6, (d.value / max) * height);
        return (
          <g key={`${d.label}-${i}`}>
            <rect x={x} y={0} width={barW} height={height} rx={5} fill={TRACK} />
            <rect
              className="stat-chart-bar"
              style={{ animationDelay: `${i * 45}ms` }}
              x={x}
              y={height - h}
              width={barW}
              height={h}
              rx={5}
              fill={d.active ? 'var(--lime)' : 'var(--stat-chart-muted)'}
            />
            <text
              x={x + barW / 2}
              y={height + 12}
              textAnchor="middle"
              className={d.active ? 'stat-chart-label is-active' : 'stat-chart-label'}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const Legend: React.FC<{ segments: ChartSegment[] }> = ({ segments }) => (
  <ul className="stat-chart-legend">
    {segments.map((s) => (
      <li key={s.label}>
        <span className="stat-chart-dot" style={{ background: s.color }} />
        <span>{s.label}</span>
      </li>
    ))}
  </ul>
);

export const Donut: React.FC<{ segments: ChartSegment[]; label: string }> = ({ segments, label }) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const r = 22;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="stat-chart-row">
      <svg viewBox="0 0 60 60" className="stat-chart-donut" role="img" aria-label={label}>
        <circle cx={30} cy={30} r={r} fill="none" stroke={TRACK} strokeWidth={8} />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => {
              const len = (s.value / total) * c;
              const el = (
                <circle
                  key={s.label}
                  cx={30}
                  cy={30}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={8}
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 30 30)"
                  className="stat-chart-arc"
                />
              );
              offset += len;
              return el;
            })}
      </svg>
      <Legend segments={segments} />
    </div>
  );
};

export const StackedBar: React.FC<{ segments: ChartSegment[]; label: string }> = ({ segments, label }) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const width = 168;
  let x = 0;

  return (
    <div className="stat-chart-stack">
      <svg viewBox={`0 0 ${width} 14`} className="stat-chart-svg" role="img" aria-label={label}>
        <rect x={0} y={0} width={width} height={14} rx={7} fill={TRACK} />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => {
              const w = (s.value / total) * width;
              const el = (
                <rect key={s.label} className="stat-chart-seg" x={x} y={0} width={Math.max(w - 2, 2)} height={14} rx={4} fill={s.color} />
              );
              x += w;
              return el;
            })}
      </svg>
      <Legend segments={segments} />
    </div>
  );
};

export const Gauge: React.FC<{ done: number; total: number; label: string; doneLabel: string; restLabel: string }> = ({
  done,
  total,
  label,
  doneLabel,
  restLabel
}) => {
  const ratio = total > 0 ? Math.min(1, done / total) : 1;
  const r = 34;
  const half = Math.PI * r;
  const arc = `M ${44 - r} 42 A ${r} ${r} 0 0 1 ${44 + r} 42`;

  return (
    <div className="stat-chart-row">
      <svg viewBox="0 0 88 48" className="stat-chart-gauge" role="img" aria-label={label}>
        <path d={arc} fill="none" stroke={TRACK} strokeWidth={9} strokeLinecap="round" />
        <path
          d={arc}
          fill="none"
          stroke="var(--lime)"
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${ratio * half} ${half}`}
          className="stat-chart-arc"
        />
        <text x={44} y={40} textAnchor="middle" className="stat-chart-gauge-text">
          {Math.round(ratio * 100)}%
        </text>
      </svg>
      <Legend
        segments={[
          { label: doneLabel, value: done, color: 'var(--lime)' },
          { label: restLabel, value: Math.max(total - done, 0), color: 'var(--stat-chart-muted)' }
        ]}
      />
    </div>
  );
};
