import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  Treemap, ResponsiveContainer,
  XAxis, YAxis, Cell, Tooltip, ReferenceLine, CartesianGrid,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { Settings, RefreshCw } from 'lucide-react';
import { VIS_STYLES, getTodayStyle, getOverallStyle } from '../utils/moversSettings';
import HoldingsTable from '../components/HoldingsTable';
import { api } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { PERIODS, periodLabel, getCachedOverallPerf, setCachedOverallPerf } from '../utils/overallPerformance';

// Measures a container directly via ResizeObserver so split-treemap children can be
// given literal pixel dimensions instead of nesting percentage heights inside a flex
// row — nested % heights failed to resolve reliably (blank charts) and, even once
// coerced into working, re-measured on every layout pass, causing visible flicker.
// Uses a callback ref (not a plain ref + effect) since the target div is behind a
// section toggle and may not exist yet on first mount — a callback ref re-attaches
// the observer whenever the div itself is created or torn down.
function useElementSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observerRef = useRef(null);
  const setRef = useCallback((el) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (el) {
      const ro = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        setSize(prev => (prev.width === width && prev.height === height) ? prev : { width, height });
      });
      ro.observe(el);
      observerRef.current = ro;
    }
  }, []);
  return [setRef, size];
}

// Treemap/bubble fill colors are intentionally theme-independent: each tile/bubble
// paints its own solid background (the page background never shows through), so
// these read fine in both light and dark mode without variants.
function getColor(pct) {
  if (pct == null) return '#334155';
  if (pct >=  5)   return '#14532d';
  if (pct >=  3)   return '#166534';
  if (pct >=  1)   return '#15803d';
  if (pct >=  0)   return '#16a34a';
  if (pct >= -1)   return '#dc2626';
  if (pct >= -3)   return '#b91c1c';
  if (pct >= -5)   return '#991b1b';
  return '#7f1d1d';
}

function fmtDollar(n) {
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '-';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPrice(n) {
  if (n == null) return null;
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '-';
  return `${sign}$${abs < 10 ? abs.toFixed(2) : abs.toFixed(1)}`;
}

// Signed-log transform: spreads clustered near-zero values apart while compressing
// extreme outliers, without requiring all-positive input (unlike a plain log scale).
// Used as the axis dataKey for the bubble charts so a handful of huge movers don't
// squash everything else into an unreadable pile near the origin.
function signedLog(v) {
  const sign = v < 0 ? -1 : 1;
  return sign * Math.log10(1 + Math.abs(v));
}
function invSignedLog(v) {
  const sign = v < 0 ? -1 : 1;
  return sign * (Math.pow(10, Math.abs(v)) - 1);
}
function log1p(v) {
  return Math.log10(1 + Math.max(0, v));
}
function invLog1p(v) {
  return Math.pow(10, v) - 1;
}

// Transforms "nice" real-world values (round percents/dollars/weights) with the same
// fn used for a chart's dataKey, then keeps only what falls inside the actual (padded)
// domain — auto ticks on a signed-log/log1p scale otherwise land on ugly non-round values.
function niceTicks(candidates, transformFn, domain) {
  const [lo, hi] = domain;
  const ticks = candidates.map(transformFn).filter(t => t >= lo && t <= hi).sort((a, b) => a - b);
  return ticks.length >= 2 ? ticks : undefined;
}

// ±1/±3/±5 double as getColor's bucket boundaries; 0 is omitted since it's already
// drawn, more prominently, by the existing ReferenceLine x={0}/y={0}.
const PCT_GRID_TICKS    = [-50, -25, -10, -5, -3, -1, 1, 3, 5, 10, 25, 50];
const DOLLAR_GRID_TICKS = [-50000, -10000, -5000, -1000, -500, -100, -25, 25, 100, 500, 1000, 5000, 10000, 50000];
const WEIGHT_GRID_TICKS = [1, 2, 5, 10, 20, 40];

// Shared by both the axis tickFormatter and the mid-chart/right-edge grid annotations below.
const fmtPctSigned1 = v => `${invSignedLog(v) > 0 ? '+' : ''}${invSignedLog(v).toFixed(1)}%`;
const fmtPctSigned0 = v => `${invSignedLog(v) > 0 ? '+' : ''}${invSignedLog(v).toFixed(0)}%`;
const fmtDollarSignedLog = v => fmtDollar(invSignedLog(v));
const fmtWeightLog1p = v => `${invLog1p(v).toFixed(1)}%`;

// Repeats each gridline's value at chart-center (X) / right edge (Y) so it can be read
// without tracing back to the bottom/left edge — plain edge labels get too far from
// bubbles clustered mid-chart or on the right.
// Recharts finds ReferenceLine/XAxis/etc. by scanning a chart's immediate children for
// that exact component type — it never calls a wrapper component to see what it returns —
// so this must return a flat array of <ReferenceLine> elements to inline as chart
// children directly, not a <GridValueLines/> element the chart would fail to recognize.
function gridValueLines({ xTicks, yTicks, xFormat, yFormat, color }) {
  return [
    ...(xTicks ?? []).map(t => (
      <ReferenceLine key={`gx-${t}`} x={t} stroke="none"
        label={{ value: xFormat(t), position: 'center', fill: color, fontSize: 10 }} />
    )),
    ...(yTicks ?? []).map(t => (
      <ReferenceLine key={`gy-${t}`} y={t} stroke="none"
        label={{ value: yFormat(t), position: 'right', fill: color, fontSize: 10 }} />
    )),
  ];
}

function HeatCell(props) {
  const { x, y, width, height, name, changePct, changeDollar, priceChange, currentPrice, depth, root, onTickerClick, dollarLabel = 'portfolio' } = props;

  if (!name || (root && root.name === name) || width < 2 || height < 2) return null;

  const color = getColor(changePct);
  const isPos = (changePct ?? 0) >= 0;
  const minDim = Math.min(width, height);

  const showTicker       = width > 32  && height > 24;
  const showCurrentPrice = width > 48  && height > 38;
  const showPriceChange  = width > 65  && height > 56;
  const showPortfolio    = width > 75  && height > 72;
  const showPercent      = width > 85  && height > 88;

  const tf = Math.max(10, Math.min(40, minDim * 0.28));
  const sf = Math.max(8,  Math.min(14, minDim * 0.13));

  const cx = x + width / 2;
  const cy = y + height / 2;

  const rows = [];
  if (showTicker)       rows.push({ size: tf });
  if (showCurrentPrice) rows.push({ size: sf + 1 });
  if (showPriceChange)  rows.push({ size: sf });
  if (showPortfolio)    rows.push({ size: sf });
  if (showPercent)      rows.push({ size: sf - 1 });

  const GAP = 3;
  const totalH = rows.reduce((s, r) => s + r.size, 0) + GAP * (rows.length - 1);
  let yCursor = cy - totalH / 2;
  const yPos = rows.map(r => {
    const mid = yCursor + r.size / 2;
    yCursor += r.size + GAP;
    return mid;
  });

  let i = 0;

  return (
    <g style={{ cursor: 'pointer' }} onClick={() => onTickerClick?.(name)}>
      <rect x={x} y={y} width={width} height={height} fill={color} stroke="#0f172a" strokeWidth={1} />
      {showTicker && (
        <text x={cx} y={yPos[i++]} textAnchor="middle" dominantBaseline="middle"
          fill="white" fontSize={tf} fontWeight="bold" fontFamily="ui-sans-serif,system-ui,sans-serif">
          {name}
        </text>
      )}
      {showCurrentPrice && currentPrice != null && (
        <text x={cx} y={yPos[i++]} textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.98)" fontSize={sf + 1} fontWeight="700" fontFamily="ui-sans-serif,system-ui,sans-serif">
          ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </text>
      )}
      {showPriceChange && priceChange != null && (
        <text x={cx} y={yPos[i++]} textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.85)" fontSize={sf} fontWeight="600" fontFamily="ui-sans-serif,system-ui,sans-serif">
          {fmtPrice(priceChange)}/share
        </text>
      )}
      {showPortfolio && changeDollar != null && (
        <text x={cx} y={yPos[i++]} textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.70)" fontSize={sf} fontFamily="ui-sans-serif,system-ui,sans-serif">
          {fmtDollar(changeDollar)} {dollarLabel}
        </text>
      )}
      {showPercent && changePct != null && (
        <text x={cx} y={yPos[i++]} textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.55)" fontSize={sf - 1} fontFamily="ui-sans-serif,system-ui,sans-serif">
          {(isPos ? '+' : '') + changePct.toFixed(2) + '%'}
        </text>
      )}
    </g>
  );
}

function BubbleDot({ cx, cy, r, payload, onTickerClick, isDark }) {
  const radius = r || 10;
  const color = getColor(payload.changePct);
  const inside = radius >= 14;
  const showPrice = inside && radius > 22 && payload.currentPrice != null;
  const tickerY = showPrice ? cy - radius * 0.18 : cy;
  const priceY  = cy + radius * 0.38;
  // The small-dot ticker label sits outside the bubble, directly on the chart
  // background, so (unlike the bubble fill itself) it needs a theme-aware color.
  const outsideLabelColor = isDark ? '#94a3b8' : '#64748b';
  return (
    <g onClick={() => onTickerClick?.(payload.name)} style={{ cursor: 'pointer' }}>
      <circle cx={cx} cy={cy} r={radius} fill={color} fillOpacity={0.85} stroke={color} strokeWidth={1} />
      {inside ? (
        <>
          <text x={cx} y={tickerY} textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={Math.min(11, radius * 0.55)} fontWeight="bold"
            fontFamily="ui-sans-serif,system-ui,sans-serif">
            {payload.name}
          </text>
          {showPrice && (
            <text x={cx} y={priceY} textAnchor="middle" dominantBaseline="middle"
              fill="rgba(255,255,255,0.85)" fontSize={Math.min(10, radius * 0.42)}
              fontFamily="ui-sans-serif,system-ui,sans-serif">
              ${payload.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </text>
          )}
        </>
      ) : (
        <text x={cx} y={cy + radius + 9} textAnchor="middle" dominantBaseline="middle"
          fill={outsideLabelColor} fontSize={9} fontWeight="600"
          fontFamily="ui-sans-serif,system-ui,sans-serif">
          {payload.name}
        </text>
      )}
    </g>
  );
}

function BubbleTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isPos = (d.changePct ?? 0) >= 0;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="font-bold text-slate-900 dark:text-white mb-1">{d.name}</p>
      {d.currentPrice != null && (
        <p className="text-slate-700 dark:text-slate-200 mb-1 tabular-nums font-semibold">
          ${d.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      )}
      <p className={isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>
        {isPos ? '+' : ''}{(d.changePct ?? 0).toFixed(2)}% today
      </p>
      {d.changeDollar != null && (
        <p className="text-slate-600 dark:text-slate-300">{fmtDollar(d.changeDollar)} portfolio impact</p>
      )}
      <p className="text-slate-500 dark:text-slate-400">${(d.size / 1000).toFixed(1)}K position</p>
    </div>
  );
}

function OverallBubbleTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isPos = (d.changePct ?? 0) >= 0;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="font-bold text-slate-900 dark:text-white mb-1">{d.name}</p>
      {d.currentPrice != null && (
        <p className="text-slate-700 dark:text-slate-200 mb-1 tabular-nums font-semibold">
          ${d.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      )}
      <p className={isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>
        {isPos ? '+' : ''}{(d.changePct ?? 0).toFixed(2)}% overall gain
      </p>
      {d.changeDollar != null && (
        <p className="text-slate-600 dark:text-slate-300">{fmtDollar(d.changeDollar)} unrealized</p>
      )}
      <p className="text-slate-500 dark:text-slate-400">{d.portfolioWeight?.toFixed(1)}% of portfolio · ${(d.size / 1000).toFixed(1)}K</p>
    </div>
  );
}

const LEGEND = [
  { label: '≥ +5%',      color: '#14532d' },
  { label: '+3 to +5%',  color: '#166534' },
  { label: '+1 to +3%',  color: '#15803d' },
  { label: '0 to +1%',   color: '#16a34a' },
  { label: '0 to −1%',   color: '#dc2626' },
  { label: '−1 to −3%',  color: '#b91c1c' },
  { label: '−3 to −5%',  color: '#991b1b' },
  { label: '≤ −5%',      color: '#7f1d1d' },
];


function PeriodPerformanceRow({ d, onTickerClick, sortKey }) {
  const pos = (d.changePct ?? 0) >= 0;
  const color = pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
  const perSharePos = (d.priceChange ?? 0) >= 0;
  const perShareColor = perSharePos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
  return (
    <button
      onClick={() => onTickerClick?.(d.name)}
      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors text-left"
    >
      <span className="flex-1 min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{d.name}</span>
      <span className={`w-14 text-right text-xs tabular-nums shrink-0 ${sortKey === 'priceChange' ? 'font-bold' : ''} ${perShareColor}`}>
        {d.priceChange != null ? fmtPrice(d.priceChange) : '—'}
      </span>
      <span className={`w-16 text-right text-xs tabular-nums shrink-0 ${sortKey === 'changeDollar' ? 'font-bold' : ''} ${color}`}>
        {fmtDollar(d.changeDollar ?? 0)}
      </span>
      <span className={`w-14 text-right text-xs tabular-nums shrink-0 ${sortKey === 'changePct' ? 'font-bold' : ''} ${color}`}>
        {pos ? '+' : ''}{(d.changePct ?? 0).toFixed(1)}%
      </span>
    </button>
  );
}

function PeriodPerformancePanel({ stocks, totalDollar, totalPct, periodText, onTickerClick }) {
  const [sortKey, setSortKey] = useState('changePct');
  const [sortDir, setSortDir] = useState('desc');

  const sorted = useMemo(() => {
    const arr = [...stocks];
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1; if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [stocks, sortKey, sortDir]);

  const handleSort = (key) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const totalPos = totalDollar >= 0;

  return (
    <div className="w-72 shrink-0 h-full min-h-0 border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/30 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
          Portfolio Performance <span className="text-slate-400 dark:text-slate-500 normal-case font-normal">· {periodText}</span>
        </p>
        <div className="flex items-baseline gap-2">
          <span className={`text-sm font-bold tabular-nums ${totalPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
            {fmtDollar(totalDollar)}
          </span>
          <span className={`text-xs font-semibold tabular-nums ${totalPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
            ({totalPos ? '+' : ''}{totalPct.toFixed(2)}%)
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-[10px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider shrink-0">
        <button onClick={() => handleSort('name')} className="flex-1 text-left hover:text-slate-800 dark:hover:text-slate-300 transition-colors">Ticker</button>
        <button onClick={() => handleSort('priceChange')} className="w-14 text-right hover:text-slate-800 dark:hover:text-slate-300 transition-colors">$/sh</button>
        <button onClick={() => handleSort('changeDollar')} className="w-16 text-right hover:text-slate-800 dark:hover:text-slate-300 transition-colors">$</button>
        <button onClick={() => handleSort('changePct')} className="w-14 text-right hover:text-slate-800 dark:hover:text-slate-300 transition-colors">%</button>
      </div>
      <div className="overflow-y-auto flex-1 min-h-0">
        {sorted.length > 0
          ? sorted.map(d => <PeriodPerformanceRow key={d.name} d={d} sortKey={sortKey} onTickerClick={onTickerClick} />)
          : <p className="text-xs text-slate-400 dark:text-slate-600 px-3 py-3">No data</p>}
      </div>
    </div>
  );
}

export default function MoversPage({ portfolio, onTickerClick, onOpenSettings, onRefresh, lastRefreshed, period, onPeriodChange }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const chartGridColor = isDark ? '#334155' : '#e2e8f0';
  const chartAxisLineColor = isDark ? '#334155' : '#cbd5e1';
  const chartTickColor = isDark ? '#94a3b8' : '#64748b';
  const chartLabelColor = isDark ? '#64748b' : '#94a3b8';
  const chartRefLineColor = isDark ? '#475569' : '#94a3b8';
  const [section, setSection] = useState('trend'); // 'trend' | 'table'
  const [todayStyle] = useState(getTodayStyle);
  const [overallStyle] = useState(getOverallStyle);
  const [todayRowRef, todayRowSize] = useElementSize();
  const [overallRowRef, overallRowSize] = useElementSize();

  const [overallPerf, setOverallPerf] = useState(() => getCachedOverallPerf(period));
  const [loadingOverallPerf, setLoadingOverallPerf] = useState(false);
  const [overallPerfError, setOverallPerfError] = useState(null);

  const loadOverallPerf = useCallback(async (p, force = false) => {
    if (!force) {
      const cached = getCachedOverallPerf(p);
      if (cached) {
        setOverallPerf(cached);
        setOverallPerfError(null);
        return;
      }
    }
    setLoadingOverallPerf(true);
    setOverallPerfError(null);
    try {
      const data = await api.getOverallPerformance(p);
      setCachedOverallPerf(p, data);
      setOverallPerf(data);
    } catch (e) {
      setOverallPerfError(e.message);
    } finally {
      setLoadingOverallPerf(false);
    }
  }, []);

  // Lazy-load: only fetch once the Trends tab is actually visited, then again
  // whenever the period picker changes (subject to the cache above). 1D uses
  // today's local portfolio data directly — no fetch needed.
  useEffect(() => {
    if (section === 'trend' && period !== '1d') loadOverallPerf(period);
  }, [section, period, loadOverallPerf]);

  const {
    redData, greenData, barData, filteredCount,
    todayXDomain, todayYDomain, todayXTicks, todayYTicks,
    todayTotalDollar, todayTotalPct,
  } = useMemo(() => {
    if (!portfolio?.stocks?.length) {
      return {
        redData: [], greenData: [], barData: [], filteredCount: 0,
        todayXDomain: [-1, 1], todayYDomain: [-1, 1], todayXTicks: undefined, todayYTicks: undefined,
        todayTotalDollar: 0, todayTotalPct: 0,
      };
    }

    const totalValue = portfolio.total_value || 1;

    // Totals are computed across the *whole* portfolio (not just the >0.5%-weight
    // filtered subset below), so they match the app-wide "Today" figures elsewhere.
    let todayTotalDollar = 0;
    let todayStartValue = 0;
    for (const s of portfolio.stocks) {
      if (s.return_1d == null) continue;
      const perShare = s.current_price * s.return_1d / (100 + s.return_1d);
      const dollar = perShare * s.total_quantity;
      todayTotalDollar += dollar;
      todayStartValue += (s.total_value - dollar);
    }
    const todayTotalPct = todayStartValue > 0 ? (todayTotalDollar / todayStartValue) * 100 : 0;

    const filtered = portfolio.stocks
      .filter(s => s.total_value / totalValue >= 0.005)
      .map(s => {
        const pct = s.return_1d ?? null;
        const perShare = pct != null ? s.current_price * pct / (100 + pct) : null;
        const portfolioDollar = perShare != null ? perShare * s.total_quantity : null;
        return {
          name: s.ticker,
          size: s.total_value,
          changePct: pct,
          changeDollar: portfolioDollar,
          priceChange: perShare,
          currentPrice: s.current_price > 0 ? s.current_price : null,
          xPos: signedLog(pct ?? 0),
          yPos: signedLog(portfolioDollar ?? 0),
        };
      })
      .sort((a, b) => b.size - a.size);

    const red   = filtered.filter(d => (d.changePct ?? 0) < 0);
    const green = filtered.filter(d => (d.changePct ?? 0) >= 0);
    const bar = [...filtered].sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));

    // Domains mirror the Scatter's own filtered dataset and the padding previously
    // expressed as string domains (e.g. 'dataMin - 0.15'), so bounds don't shift.
    const todayPlotted = bar.filter(d => d.changeDollar != null);
    const todayXNums = todayPlotted.map(d => d.xPos);
    const todayYNums = todayPlotted.map(d => d.yPos);
    const todayXDomain = todayXNums.length
      ? [Math.min(...todayXNums) - 0.15, Math.max(...todayXNums) + 0.15] : [-1, 1];
    const todayYDomain = todayYNums.length
      ? [Math.min(...todayYNums) - 0.2, Math.max(...todayYNums) + 0.2] : [-1, 1];

    return {
      redData: red, greenData: green, barData: bar,
      filteredCount: filtered.length,
      todayXDomain, todayYDomain,
      todayXTicks: niceTicks(PCT_GRID_TICKS, signedLog, todayXDomain),
      todayYTicks: niceTicks(DOLLAR_GRID_TICKS, signedLog, todayYDomain),
      todayTotalDollar, todayTotalPct,
    };
  }, [portfolio]);

  const {
    overallData, overallRed, overallGreen, overallFilteredCount,
    overallXDomain, overallYDomain, overallXTicks, overallYTicks,
  } = useMemo(() => {
    const rows = overallPerf?.stocks ?? [];
    const totalValue = overallPerf?.total_current_value || 1;

    const overall = rows
      .filter(s => s.current_value / totalValue >= 0.005)
      .map(s => {
        const gainPct = s.gain_loss_pct ?? null;
        const perShareGain = s.quantity > 0 ? s.gain_loss / s.quantity : null;
        const weight = s.current_value / totalValue * 100;
        return {
          name: s.ticker,
          size: s.current_value,
          changePct: gainPct,
          changeDollar: s.gain_loss,
          priceChange: perShareGain,
          portfolioWeight: weight,
          currentPrice: s.current_price > 0 ? s.current_price : null,
          xPos: signedLog(gainPct ?? 0),
          yPos: log1p(weight),
        };
      })
      .filter(d => d.changePct != null)
      .sort((a, b) => b.size - a.size);

    const overallRedSplit   = overall.filter(d => (d.changePct ?? 0) < 0);
    const overallGreenSplit = overall.filter(d => (d.changePct ?? 0) >= 0);

    const overallXNums = overall.map(d => d.xPos);
    const overallYNums = overall.map(d => d.yPos);
    const overallXDomain = overallXNums.length
      ? [Math.min(...overallXNums) - 0.15, Math.max(...overallXNums) + 0.15] : [-1, 1];
    const overallYDomain = [0, overallYNums.length ? Math.max(...overallYNums) + 0.1 : 1];

    return {
      overallData: overall, overallRed: overallRedSplit, overallGreen: overallGreenSplit,
      overallFilteredCount: overall.length,
      overallXDomain, overallYDomain,
      overallXTicks: niceTicks(PCT_GRID_TICKS, signedLog, overallXDomain),
      overallYTicks: niceTicks(WEIGHT_GRID_TICKS, log1p, overallYDomain),
    };
  }, [overallPerf]);

  if (!portfolio?.stocks?.length) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 text-sm">
        No holdings yet. Add a stock or import a CSV to get started.
      </div>
    );
  }

  const contentHeight = 'calc(100vh - 130px)';
  const isToday = period === '1d';
  const activeStyle = isToday ? todayStyle : overallStyle;

  return (
    <div className="flex-1 bg-white dark:bg-slate-900 flex flex-col">
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 dark:border-slate-800">
        {section !== 'table' && LEGEND.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
            <span className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{label}</span>
          </div>
        ))}
        <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
          {section === 'table'
            ? `${portfolio.stocks.length} tickers · ${portfolio.stocks.reduce((n, s) => n + s.lots.length, 0)} lots`
            : isToday
            ? <>{filteredCount} tickers &gt;0.5% of portfolio · sized by value · colored by today's % change</>
            : <>{overallFilteredCount} tickers &gt;0.5% of portfolio · sized by value · colored by gain/loss % over the selected period</>
          }
        </span>
        {section === 'trend' && (
          <>
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
              {PERIODS.map(p => (
                <button
                  key={p.value}
                  onClick={() => onPeriodChange(p.value)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                    period === p.value ? 'bg-slate-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {!isToday && (
              <button
                onClick={() => loadOverallPerf(period, true)}
                disabled={loadingOverallPerf}
                title="Refresh"
                className="flex items-center justify-center w-6 h-6 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingOverallPerf ? 'animate-spin' : ''}`} />
              </button>
            )}
          </>
        )}
        {/* Section toggle */}
        <div className="flex items-center gap-0.5 ml-3 bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
          {[['trend', 'Trends'], ['table', 'Table']].map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setSection(mode)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                section === mode ? 'bg-slate-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            title="Visualization settings"
            className="flex items-center justify-center w-6 h-6 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {section === 'trend' && isToday && activeStyle === VIS_STYLES.HEAT && (
        /* Split Treemap: left = red, right = green. Sized via a single ResizeObserver on
           the row (see useElementSize) rather than nested ResponsiveContainers, which
           flickered when resolving percentage heights inside a flex row. */
        <div className="flex flex-1" style={{ height: contentHeight }}>
          <div ref={todayRowRef} className="flex flex-1 min-w-0">
            {/* Red (losers) — left half */}
            <div className="border-r border-slate-200 dark:border-slate-800 min-w-0" style={{ width: todayRowSize.width / 2 }}>
              {redData.length > 0 ? (
                todayRowSize.width > 0 && todayRowSize.height > 0 && (
                  <Treemap
                    width={todayRowSize.width / 2}
                    height={todayRowSize.height}
                    data={redData}
                    dataKey="size"
                    content={<HeatCell onTickerClick={onTickerClick} />}
                    isAnimationActive={false}
                  />
                )
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm">
                  No losers today
                </div>
              )}
            </div>
            {/* Green (gainers) — right half */}
            <div className="min-w-0" style={{ width: todayRowSize.width / 2 }}>
              {greenData.length > 0 ? (
                todayRowSize.width > 0 && todayRowSize.height > 0 && (
                  <Treemap
                    width={todayRowSize.width / 2}
                    height={todayRowSize.height}
                    data={greenData}
                    dataKey="size"
                    content={<HeatCell onTickerClick={onTickerClick} />}
                    isAnimationActive={false}
                  />
                )
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm">
                  No gainers today
                </div>
              )}
            </div>
          </div>
          <PeriodPerformancePanel stocks={barData} totalDollar={todayTotalDollar} totalPct={todayTotalPct} periodText="1D" onTickerClick={onTickerClick} />
        </div>
      )}

      {section === 'trend' && isToday && activeStyle === VIS_STYLES.BUBBLE && (
        /* Bubble chart: X = % change, Y = $ portfolio impact, size = position value */
        <div className="flex flex-1" style={{ height: contentHeight }}>
          <div className="flex-1 min-w-0 px-4 py-4">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1 text-center">
              Bubble size = position value · X = today's % change · Y = $ impact on your portfolio
            </p>
            <ResponsiveContainer width="100%" height="93%">
              <ScatterChart margin={{ top: 16, right: 40, bottom: 36, left: 64 }}>
                <CartesianGrid stroke={chartGridColor} strokeOpacity={0.4} strokeWidth={1} />
                <XAxis
                  type="number"
                  dataKey="xPos"
                  name="% Change"
                  domain={todayXDomain}
                  ticks={todayXTicks}
                  tickFormatter={fmtPctSigned1}
                  tick={{ fill: chartTickColor, fontSize: 11 }}
                  axisLine={{ stroke: chartAxisLineColor }}
                  tickLine={false}
                  label={{ value: "Today's Return (%) — log scale", position: 'insideBottom', offset: -16, fill: chartLabelColor, fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="yPos"
                  name="$ Impact"
                  domain={todayYDomain}
                  ticks={todayYTicks}
                  tickFormatter={fmtDollarSignedLog}
                  tick={{ fill: chartTickColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: 'Portfolio $ Impact — log scale', angle: -90, position: 'insideLeft', offset: 10, fill: chartLabelColor, fontSize: 11 }}
                />
                <ZAxis dataKey="size" range={[300, 4000]} name="Position Value" />
                <ReferenceLine x={0} stroke={chartRefLineColor} strokeWidth={1} />
                <ReferenceLine y={0} stroke={chartRefLineColor} strokeWidth={1} strokeDasharray="4 4" />
                {gridValueLines({ xTicks: todayXTicks, yTicks: todayYTicks, xFormat: fmtPctSigned1, yFormat: fmtDollarSignedLog, color: chartLabelColor })}
                <Tooltip content={<BubbleTooltip />} cursor={false} />
                <Scatter
                  data={barData.filter(d => d.changeDollar != null)}
                  isAnimationActive={false}
                  shape={(props) => <BubbleDot {...props} onTickerClick={onTickerClick} isDark={isDark} />}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <PeriodPerformancePanel stocks={barData} totalDollar={todayTotalDollar} totalPct={todayTotalPct} periodText="1D" onTickerClick={onTickerClick} />
        </div>
      )}

      {section === 'trend' && !isToday && loadingOverallPerf && !overallPerf && (
        <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm" style={{ height: contentHeight }}>
          Loading period performance…
        </div>
      )}

      {section === 'trend' && !isToday && overallPerfError && (
        <div className="flex-1 flex items-center justify-center text-red-500 dark:text-red-400 text-sm" style={{ height: contentHeight }}>
          {overallPerfError}
        </div>
      )}

      {section === 'trend' && !isToday && overallPerf && activeStyle === VIS_STYLES.HEAT && (
        /* Split Treemap: left = losers, right = gainers, colored by gain/loss % over the selected period */
        <div className="flex flex-1" style={{ height: contentHeight }}>
          <div ref={overallRowRef} className="flex flex-1 min-w-0">
            <div className="border-r border-slate-200 dark:border-slate-800 min-w-0" style={{ width: overallRowSize.width / 2 }}>
              {overallRed.length > 0 ? (
                overallRowSize.width > 0 && overallRowSize.height > 0 && (
                  <Treemap
                    width={overallRowSize.width / 2}
                    height={overallRowSize.height}
                    data={overallRed}
                    dataKey="size"
                    content={<HeatCell onTickerClick={onTickerClick} dollarLabel="unrealized" />}
                    isAnimationActive={false}
                  />
                )
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm">
                  No positions at a loss
                </div>
              )}
            </div>
            <div className="min-w-0" style={{ width: overallRowSize.width / 2 }}>
              {overallGreen.length > 0 ? (
                overallRowSize.width > 0 && overallRowSize.height > 0 && (
                  <Treemap
                    width={overallRowSize.width / 2}
                    height={overallRowSize.height}
                    data={overallGreen}
                    dataKey="size"
                    content={<HeatCell onTickerClick={onTickerClick} dollarLabel="unrealized" />}
                    isAnimationActive={false}
                  />
                )
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm">
                  No positions with gains
                </div>
              )}
            </div>
          </div>
          <PeriodPerformancePanel
            stocks={overallData}
            totalDollar={overallPerf.total_gain_loss}
            totalPct={overallPerf.total_gain_loss_pct}
            periodText={periodLabel(period)}
            onTickerClick={onTickerClick}
          />
        </div>
      )}

      {section === 'trend' && !isToday && overallPerf && activeStyle === VIS_STYLES.BUBBLE && (
        /* Overall bubble chart: X = gain/loss % over the selected period, Y = portfolio weight % */
        <div className="flex flex-1" style={{ height: contentHeight }}>
          <div className="flex-1 min-w-0 px-4 py-4">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1 text-center">
              Bubble size = position value · X = gain/loss % over the selected period · Y = % of portfolio
            </p>
            <ResponsiveContainer width="100%" height="93%">
              <ScatterChart margin={{ top: 16, right: 40, bottom: 36, left: 64 }}>
                <CartesianGrid stroke={chartGridColor} strokeOpacity={0.4} strokeWidth={1} />
                <XAxis
                  type="number"
                  dataKey="xPos"
                  name="% Gain/Loss"
                  domain={overallXDomain}
                  ticks={overallXTicks}
                  tickFormatter={fmtPctSigned0}
                  tick={{ fill: chartTickColor, fontSize: 11 }}
                  axisLine={{ stroke: chartAxisLineColor }}
                  tickLine={false}
                  label={{ value: 'Gain/Loss (%) over period — log scale', position: 'insideBottom', offset: -16, fill: chartLabelColor, fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="yPos"
                  name="Portfolio Weight"
                  domain={overallYDomain}
                  ticks={overallYTicks}
                  tickFormatter={fmtWeightLog1p}
                  tick={{ fill: chartTickColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: '% of Portfolio — log scale', angle: -90, position: 'insideLeft', offset: 10, fill: chartLabelColor, fontSize: 11 }}
                />
                <ZAxis dataKey="size" range={[120, 1400]} name="Position Value" />
                <ReferenceLine x={0} stroke={chartRefLineColor} strokeWidth={1} />
                {gridValueLines({ xTicks: overallXTicks, yTicks: overallYTicks, xFormat: fmtPctSigned0, yFormat: fmtWeightLog1p, color: chartLabelColor })}
                <Tooltip content={<OverallBubbleTooltip />} cursor={false} />
                <Scatter
                  data={overallData}
                  isAnimationActive={false}
                  shape={(props) => <BubbleDot {...props} onTickerClick={onTickerClick} isDark={isDark} />}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <PeriodPerformancePanel
            stocks={overallData}
            totalDollar={overallPerf.total_gain_loss}
            totalPct={overallPerf.total_gain_loss_pct}
            periodText={periodLabel(period)}
            onTickerClick={onTickerClick}
          />
        </div>
      )}

      {section === 'table' && (
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-4 sm:p-6">
          <HoldingsTable portfolio={portfolio} onRefresh={onRefresh} lastRefreshed={lastRefreshed} onTickerClick={onTickerClick} />
        </div>
      )}

    </div>
  );
}
