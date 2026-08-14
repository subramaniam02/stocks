import { useEffect, useState } from 'react';
import { X, TrendingUp, TrendingDown, Loader2, AlertCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import TickerLotsList from './TickerLotsList';

function RangeBar({ low, high, current, label }) {
  if (low == null || high == null || current == null || high <= low) return null;
  const pct = Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100));
  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mb-1.5">
        <span className="tabular-nums">${low.toFixed(2)}</span>
        <span className="font-medium text-slate-500 dark:text-slate-400">{label}</span>
        <span className="tabular-nums">${high.toFixed(2)}</span>
      </div>
      <div className="relative h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full">
        <div className="absolute inset-y-0 left-0 bg-blue-200 dark:bg-blue-900 rounded-full" style={{ width: `${pct}%` }} />
        <div
          className="absolute top-1/2 w-3 h-3 bg-white dark:bg-slate-800 border-2 border-blue-500 rounded-full shadow-sm"
          style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
    </div>
  );
}

function StatRow({ label, value }) {
  if (value == null || value === '—') return null;
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-50 dark:border-slate-800 last:border-0">
      <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
      <span className="text-xs font-medium text-slate-700 dark:text-slate-200 tabular-nums">{value}</span>
    </div>
  );
}

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtVol(n) {
  if (n == null) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

const TREND_PERIODS = [
  { label: '1D',  value: '1d'  },
  { label: '5D',  value: '5d'  },
  { label: '1M',  value: '1mo' },
  { label: '6M',  value: '6mo' },
  { label: 'YTD', value: 'ytd' },
  { label: '1Y',  value: '1y'  },
];

function formatTrendDate(dateStr, period) {
  if (period === '1d') return dateStr; // already a time-of-day string, e.g. "09:30"
  const d = new Date(dateStr + 'T00:00:00');
  if (period === '5d')
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (period === '1mo')
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

function TrendChart({ ticker, intraday }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const axisTickColor = isDark ? '#94a3b8' : '#94a3b8';
  const tooltipBorderColor = isDark ? '#334155' : '#e2e8f0';
  const tooltipBg = isDark ? '#1e293b' : '#fff';
  const tooltipLabelColor = isDark ? '#94a3b8' : '#64748b';

  const [period, setPeriod] = useState('1d');
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    if (period === '1d') {
      setData((intraday ?? []).map(d => ({ date: d.time, price: d.price })));
      setLoading(false);
      return;
    }
    setLoading(true);
    api.getStockHistory(ticker, period)
      .then(r => setData(r.data ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [ticker, period, intraday]);

  const startPrice = data.length >= 2 ? data[0].price : null;
  const endPrice   = data.length >= 2 ? data[data.length - 1].price : null;
  const change     = startPrice != null ? endPrice - startPrice : null;
  const changePct  = startPrice != null && startPrice > 0 ? (change / startPrice) * 100 : null;
  const up = change == null ? true : change >= 0;
  const color = up ? '#10b981' : '#ef4444';

  // Tick decimation
  const tickEvery = data.length > 200 ? 30 : data.length > 60 ? 14 : data.length > 20 ? 7 : 1;
  const ticks = data.filter((_, i) => i % tickEvery === 0).map(d => d.date);

  const priceDomain = data.length
    ? [Math.min(...data.map(d => d.price)) * 0.995, Math.max(...data.map(d => d.price)) * 1.005]
    : ['auto', 'auto'];

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Price Trend</p>
        <div className="flex gap-0.5">
          {TREND_PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                period === p.value
                  ? 'bg-slate-800 text-white dark:bg-slate-600'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {change != null && (
        <div className={`flex items-baseline gap-1.5 mb-2 text-sm font-semibold tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
          <span>{up ? '+' : ''}${Math.abs(change).toFixed(2)}</span>
          <span className="text-xs font-medium opacity-80">({up ? '+' : ''}{changePct.toFixed(2)}%)</span>
        </div>
      )}
      <div className="h-36 -mx-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-4 h-4 animate-spin text-slate-300 dark:text-slate-600" />
          </div>
        ) : data.length < 2 ? (
          <div className="flex items-center justify-center h-full text-xs text-slate-300 dark:text-slate-600">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id={`tg-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                ticks={ticks}
                tickFormatter={d => formatTrendDate(d, period)}
                tick={{ fontSize: 9, fill: axisTickColor }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={priceDomain}
                tick={{ fontSize: 9, fill: axisTickColor }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `$${v.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: `1px solid ${tooltipBorderColor}`, backgroundColor: tooltipBg }}
                formatter={v => [`$${v.toFixed(2)}`, 'Price']}
                labelFormatter={d => formatTrendDate(d, period)}
                labelStyle={{ color: tooltipLabelColor, fontSize: 10 }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#tg-${ticker})`}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function TickerDetailPanel({ ticker, portfolio, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    setDetail(null);
    setError(null);
    setLoading(true);
    api.getTickerDetail(ticker)
      .then(setDetail)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [ticker]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pos = (detail?.day_change_pct ?? 0) >= 0;
  const stockPos = portfolio?.stocks?.find(s => s.ticker === ticker);

  return (
    <>
      <div className="fixed inset-0 bg-black/25 z-40 backdrop-blur-[1px]" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-[400px] bg-white dark:bg-slate-800 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{ticker}</h2>
              {detail?.quote_type && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  detail.is_etf ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {detail.quote_type}
                </span>
              )}
            </div>
            {detail?.name && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">{detail.name}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors shrink-0 ml-3">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-slate-300 dark:text-slate-600" />
            </div>
          )}
          {error && (
            <div className="m-5 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 rounded-lg text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {detail && (
            <div className="px-5 py-4 space-y-5">

              {/* Price block */}
              <div>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  ${detail.current_price?.toFixed(2) ?? '—'}
                </div>
                {detail.day_change != null && (
                  <div className={`flex items-center gap-1.5 mt-1 text-sm font-medium ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {pos ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    <span className="tabular-nums">
                      {pos ? '+' : ''}{detail.day_change.toFixed(2)} ({pos ? '+' : ''}{detail.day_change_pct.toFixed(2)}%)
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 font-normal">today</span>
                  </div>
                )}
                {(detail.sector || detail.industry) && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {[detail.sector, detail.industry].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              {/* Trend chart (includes today's intraday as the 1D period) */}
              <TrendChart ticker={ticker} intraday={detail.intraday} />

              {/* Range bars */}
              <div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Price Ranges</p>
                <RangeBar low={detail.day_low} high={detail.day_high} current={detail.current_price} label="Day Range" />
                <RangeBar low={detail['52w_low']} high={detail['52w_high']} current={detail.current_price} label="52-Week Range" />
              </div>

              {/* Your lots */}
              {stockPos && <TickerLotsList stockPos={stockPos} portfolioTotal={portfolio?.total_value} />}

              {/* Key stats */}
              <div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Key Stats</p>
                <StatRow label="Market Cap" value={fmt(detail.market_cap)} />
                <StatRow label="P/E Ratio (TTM)" value={detail.pe_ratio != null ? detail.pe_ratio.toFixed(2) : null} />
                <StatRow label="Forward P/E" value={detail.forward_pe != null ? detail.forward_pe.toFixed(2) : null} />
                <StatRow label="Beta" value={detail.beta != null ? detail.beta.toFixed(2) : null} />
                <StatRow label="Dividend Yield" value={detail.dividend_yield != null ? `${(detail.dividend_yield * 100).toFixed(2)}%` : null} />
                {detail.is_etf && (
                  <StatRow label="Expense Ratio" value={detail.expense_ratio != null ? `${(detail.expense_ratio * 100).toFixed(2)}%` : '—'} />
                )}
                <StatRow label="Volume" value={fmtVol(detail.volume)} />
                <StatRow label="Avg Volume" value={fmtVol(detail.avg_volume)} />
                <StatRow label="Open" value={detail.day_open != null ? `$${detail.day_open.toFixed(2)}` : null} />
                <StatRow label="Prev Close" value={detail.prev_close != null ? `$${detail.prev_close.toFixed(2)}` : null} />
              </div>

              {/* Description */}
              {detail.description && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">About</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-5">{detail.description}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
