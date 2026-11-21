import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { dur, gsap, reducedMotion } from '../utils/animations';

/* 1. Sparkline (reusable mini trend line / area) */
export const Sparkline: React.FC<{
  data: number[];
  color?: string;
  filled?: boolean;
  height?: number;
  width?: number;
}> = ({
  data,
  color = 'var(--ink-2)',
  filled = false,
  height = 28,
  width = 88,
}) => {
  const gradId = useId();
  const pathRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / Math.max(1, data.length - 1)) * width;
    const y = height - 4 - ((v - min) / span) * (height - 8);
    return [x, y] as const;
  });
  const line = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;

  useEffect(() => {
    if (reducedMotion()) return;
    if (pathRef.current) {
      const len = pathRef.current.getTotalLength?.() || width * 1.4;
      gsap.fromTo(
        pathRef.current,
        { strokeDasharray: len, strokeDashoffset: len },
        {
          strokeDashoffset: 0,
          duration: dur(1.2),
          ease: 'power2.inOut',
          clearProps: 'strokeDasharray,strokeDashoffset',
        }
      );
    }
    if (areaRef.current) {
      gsap.fromTo(
        areaRef.current,
        { opacity: 0 },
        { opacity: 1, duration: dur(0.9), delay: dur(0.3), ease: 'power2.out' }
      );
    }
  }, [line, width]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible shrink-0"
      aria-hidden="true"
    >
      {filled && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
      )}
      {filled && <path ref={areaRef} d={area} fill={`url(#${gradId})`} />}
      <path
        ref={pathRef}
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

/* 2. Live Activity Bar Chart (Conveyor shift + elastic bar rise) */
export const LiveBarsChart: React.FC<{ bars: number[]; unitLabel?: string }> = ({
  bars,
  unitLabel = 'items',
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const max = Math.max(...bars, 1);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || reducedMotion()) return;
    const barEls = Array.from(row.querySelectorAll<HTMLElement>('.live-bar-fill'));
    if (!barEls.length) return;

    if (!mountedRef.current) {
      mountedRef.current = true;
      gsap.fromTo(
        barEls,
        { scaleY: 0, transformOrigin: 'bottom center' },
        {
          scaleY: 1,
          duration: 0.75,
          ease: 'expo.out',
          stagger: 0.015,
          delay: 0.25,
          clearProps: 'transform',
        }
      );
    } else {
      const barW = barEls[0].parentElement?.offsetWidth || 10;
      gsap.fromTo(
        barEls.slice(0, -1),
        { x: barW },
        { x: 0, duration: 0.7, ease: 'power3.out', clearProps: 'transform' }
      );
      const lastBar = barEls[barEls.length - 1];
      if (lastBar) {
        gsap.fromTo(
          lastBar,
          { scaleY: 0, transformOrigin: 'bottom center' },
          { scaleY: 1, duration: 0.8, ease: 'back.out(1.8)', clearProps: 'transform' }
        );
      }
    }
  }, [bars]);

  return (
    <div>
      <div ref={rowRef} className="h-[118px] flex items-end gap-[4px] pt-2 overflow-hidden">
        {bars.map((val, idx) => {
          const isLast = idx === bars.length - 1;
          const isHover = hoverIdx === idx;
          const pct = Math.max(12, Math.round((val / max) * 100));
          return (
            <div
              key={idx}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              className="relative flex-1 h-full flex items-end group cursor-pointer"
              title={`${val} ${unitLabel} (${30 - idx} min ago)`}
            >
              <div
                style={{ height: `${pct}%` }}
                className={`live-bar-fill w-full rounded-t-[4px] transition-opacity duration-150 ${
                  isLast || isHover
                    ? 'bg-[var(--accent)] opacity-100'
                    : 'bg-[var(--accent)] opacity-45 group-hover:opacity-80'
                }`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-[var(--muted)] mt-2 tabular-nums">
        <span>−30 min</span>
        <span>
          {hoverIdx !== null
            ? `${bars[hoverIdx]} ${unitLabel} · ${30 - hoverIdx}m ago`
            : 'now'}
        </span>
      </div>
    </div>
  );
};

/* 3. Ring Progress with Stroke Sweep & Count-Up */
export const RingProgress: React.FC<{ pct: number; label: string }> = ({
  pct,
  label,
}) => {
  const size = 112;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const arcRef = useRef<SVGCircleElement>(null);
  const valRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reducedMotion()) return;
    if (arcRef.current) {
      gsap.fromTo(
        arcRef.current,
        { strokeDashoffset: circ },
        { strokeDashoffset: offset, duration: 1.1, delay: 0.2, ease: 'expo.out' }
      );
    }
    if (valRef.current) {
      const obj = { v: 0 };
      gsap.to(obj, {
        v: pct,
        duration: 1.0,
        delay: 0.2,
        ease: 'power3.out',
        onUpdate: () => {
          if (valRef.current) valRef.current.textContent = `${Math.round(obj.v)}%`;
        },
      });
    }
  }, [circ, offset, pct]);

  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--card-3)"
          strokeWidth={stroke}
        />
        <circle
          ref={arcRef}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span ref={valRef} className="text-[20px] font-bold leading-none tabular-nums">
          {pct}%
        </span>
        <span className="text-[11px] text-[var(--muted)] mt-0.5">{label}</span>
      </div>
    </div>
  );
};

/* 4. Reusable Vertical Bar Chart */
export const SimpleBarChart: React.FC<{
  items: { label: string; value: number; highlight?: boolean; tooltip?: string }[];
  yTicks: { value: number; label: string }[];
  maxVal: number;
  height?: number;
}> = ({ items, yTicks, maxVal, height = 165 }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!barsRef.current || reducedMotion()) return;
    const els = Array.from(barsRef.current.querySelectorAll<HTMLElement>('.simple-bar-col'));
    if (!els.length) return;
    gsap.fromTo(
      els,
      { scaleY: 0, transformOrigin: 'bottom center' },
      {
        scaleY: 1,
        duration: 1.0,
        ease: 'expo.out',
        stagger: 0.04,
        delay: 0.15,
        clearProps: 'transform',
      }
    );
  }, [items.length]);

  return (
    <div className="flex gap-3">
      <div
        className="flex flex-col justify-between text-[11px] text-[var(--muted)] tabular-nums text-right pr-1 shrink-0 pb-6"
        style={{ height: height + 24 }}
      >
        {yTicks.map((t) => (
          <span key={t.label}>{t.label}</span>
        ))}
      </div>
      <div className="flex-1 flex flex-col">
        <div
          ref={barsRef}
          className="relative flex items-end gap-2 sm:gap-3 border-b border-[var(--line)]"
          style={{ height }}
        >
          {yTicks.slice(0, -1).map((t) => (
            <div
              key={t.label}
              style={{ bottom: `${(t.value / maxVal) * 100}%` }}
              className="absolute inset-x-0 border-t border-dashed border-[var(--line)] pointer-events-none"
            />
          ))}
          {items.map((item, idx) => {
            const pct = Math.max(4, Math.min(100, (item.value / maxVal) * 100));
            const isHi = item.highlight || hoverIdx === idx;
            return (
              <div
                key={item.label}
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
                className="relative flex-1 h-full flex items-end justify-center group cursor-pointer"
                title={item.tooltip || `${item.label}: ${item.value}`}
              >
                {hoverIdx === idx && item.tooltip && (
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-[var(--ink)] text-[var(--bg)] text-[11px] font-medium whitespace-nowrap z-10 tabular-nums pointer-events-none shadow-md">
                    {item.tooltip}
                  </div>
                )}
                <div
                  style={{ height: `${pct}%` }}
                  className={`simple-bar-col w-full max-w-[34px] rounded-t-[8px] transition-opacity duration-200 ${
                    isHi
                      ? 'bg-[var(--accent)] opacity-100'
                      : 'bg-[var(--accent)] opacity-50 group-hover:opacity-85'
                  }`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 sm:gap-3 pt-2">
          {items.map((item, idx) => (
            <span
              key={item.label}
              className={`flex-1 text-center text-[11px] truncate ${
                item.highlight || hoverIdx === idx
                  ? 'text-[var(--ink)] font-semibold'
                  : 'text-[var(--muted)]'
              }`}
            >
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

/* 5. Smooth Multi-Series Stacked / Area Chart */
export interface AreaSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

export const StackedAreaChart: React.FC<{
  labels: string[];
  series: AreaSeries[];
  yTicks: { value: number; label: string }[];
  maxVal: number;
  height?: number;
  valuePrefix?: string;
  valueSuffix?: string;
  stacked?: boolean;
}> = ({
  labels,
  series,
  yTicks,
  maxVal,
  height = 210,
  valuePrefix = '',
  valueSuffix = '',
  stacked = true,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const layersRef = useRef<SVGGElement>(null);
  const w = 780;
  const h = height;

  const seriesSig = series.map((s) => `${s.key}:${s.values.join(',')}`).join('|');

  useEffect(() => {
    if (!layersRef.current || reducedMotion()) return;
    gsap.fromTo(
      layersRef.current,
      { opacity: 0.35 },
      { opacity: 1, duration: 0.65, ease: 'expo.out', clearProps: 'opacity' }
    );
    const lines = layersRef.current.querySelectorAll<SVGPathElement>('.area-line');
    lines.forEach((p, idx) => {
      const len = p.getTotalLength?.() || w * 1.3;
      gsap.fromTo(
        p,
        { strokeDasharray: len, strokeDashoffset: len },
        {
          strokeDashoffset: 0,
          duration: 1.0,
          delay: idx * 0.06,
          ease: 'expo.out',
          clearProps: 'strokeDasharray,strokeDashoffset',
        }
      );
    });
  }, [seriesSig]);

  const computed = useMemo(() => {
    const n = labels.length;
    const layers: {
      key: string;
      label: string;
      color: string;
      topPts: { x: number; y: number }[];
      areaD: string;
      lineD: string;
    }[] = [];

    const running = new Array(n).fill(0);

    for (const s of series) {
      const topValues = s.values.map((v, i) => (stacked ? running[i] + v : v));
      const baseValues = stacked ? [...running] : new Array(n).fill(0);
      if (stacked) {
        topValues.forEach((tv, i) => {
          running[i] = tv;
        });
      }

      const topPts = topValues.map((v, i) => ({
        x: (i / Math.max(1, n - 1)) * w,
        y: h - (v / maxVal) * (h - 14),
      }));
      const basePts = baseValues.map((v, i) => ({
        x: (i / Math.max(1, n - 1)) * w,
        y: h - (v / maxVal) * (h - 14),
      }));

      const smoothLine = (pts: { x: number; y: number }[]) => {
        if (pts.length < 2) return '';
        let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i];
          const p1 = pts[i + 1];
          const cx = (p0.x + p1.x) / 2;
          d += ` C${cx.toFixed(1)},${p0.y.toFixed(1)} ${cx.toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
        }
        return d;
      };

      const reverseSmoothBase = (pts: { x: number; y: number }[]) => {
        const rev = [...pts].reverse();
        if (rev.length < 2) return '';
        let d = ` L${rev[0].x.toFixed(1)},${rev[0].y.toFixed(1)}`;
        for (let i = 0; i < rev.length - 1; i++) {
          const p0 = rev[i];
          const p1 = rev[i + 1];
          const cx = (p0.x + p1.x) / 2;
          d += ` C${cx.toFixed(1)},${p0.y.toFixed(1)} ${cx.toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
        }
        return d;
      };

      const lineD = smoothLine(topPts);
      const areaD = `${lineD}${reverseSmoothBase(basePts)} Z`;
      layers.push({ key: s.key, label: s.label, color: s.color, topPts, areaD, lineD });
    }
    return layers;
  }, [h, labels.length, maxVal, series, stacked]);

  return (
    <div className="flex gap-3">
      <div
        className="flex flex-col justify-between text-[11px] text-[var(--muted)] tabular-nums text-right pr-1 shrink-0 pb-6"
        style={{ height: height + 26 }}
      >
        {yTicks.map((t) => (
          <span key={t.label}>{t.label}</span>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="relative" style={{ height }}>
          <svg
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
            className="w-full h-full overflow-visible"
            onMouseLeave={() => setHoverIdx(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const rel = (e.clientX - rect.left) / rect.width;
              const idx = Math.max(
                0,
                Math.min(labels.length - 1, Math.round(rel * (labels.length - 1)))
              );
              setHoverIdx(idx);
            }}
          >
            {yTicks.map((t) => {
              const y = h - (t.value / maxVal) * (h - 14);
              return (
                <line
                  key={t.label}
                  x1={0}
                  x2={w}
                  y1={y}
                  y2={y}
                  stroke="var(--line)"
                  strokeDasharray="3 4"
                />
              );
            })}

            <g ref={layersRef}>
              {computed.map((layer) => (
                <g key={layer.key}>
                  <path d={layer.areaD} fill={layer.color} fillOpacity="0.22" />
                  <path
                    d={layer.lineD}
                    fill="none"
                    stroke={layer.color}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    className="area-line"
                  />
                </g>
              ))}
            </g>

            {hoverIdx !== null && (
              <line
                x1={(hoverIdx / Math.max(1, labels.length - 1)) * w}
                x2={(hoverIdx / Math.max(1, labels.length - 1)) * w}
                y1={0}
                y2={h}
                stroke="var(--line-2)"
                strokeWidth="1.2"
              />
            )}
          </svg>

          {hoverIdx !== null && series.length > 0 && (
            <div
              style={{
                left: `${(hoverIdx / Math.max(1, labels.length - 1)) * 100}%`,
              }}
              className="absolute top-2 -translate-x-1/2 px-3 py-2 rounded-xl glass-solid text-[12px] pointer-events-none z-20 min-w-[140px]"
            >
              <div className="font-semibold text-[var(--ink)] mb-1">
                {labels[hoverIdx]}
              </div>
              {series.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between gap-3 text-[11px] tabular-nums"
                >
                  <span className="flex items-center gap-1.5 text-[var(--muted)]">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: s.color }}
                    />
                    {s.label}
                  </span>
                  <span className="font-medium text-[var(--ink)]">
                    {valuePrefix}
                    {s.values[hoverIdx].toLocaleString('en-US')}
                    {valueSuffix}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between text-[11px] text-[var(--muted)] pt-2 tabular-nums">
          {labels.map((lbl, i) => (
            <span
              key={lbl}
              className={
                hoverIdx === i ? 'text-[var(--ink)] font-semibold' : undefined
              }
            >
              {lbl}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
