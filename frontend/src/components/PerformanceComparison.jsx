import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

const PERIODS = [
  { label: '1M',  days: 30  },
  { label: '3M',  days: 90  },
  { label: '6M',  days: 180 },
  { label: '1Y',  days: 365 },
];

const LINES = [
  { key: 'portfolio', label: 'My Portfolio',      color: '#3b82f6' },
  { key: 'spy',       label: 'S&P 500 (SPY)',     color: '#f97316' },
  { key: 'vti',       label: 'Total Market (VTI)', color: '#a855f7' },
];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatAxis(val) {
  const diff = val - 100;
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <div className="text-slate-400 mb-1.5 font-medium">{formatDate(label)}</div>
      {payload.map(p => {
        const diff = p.value - 100;
        return (
          <div key={p.dataKey} className="flex items-center gap-2 py-0.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-slate-300 w-36">{p.name}</span>
            <span className="tabular-nums font-semibold" style={{ color: p.color }}>
              {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function PerformanceComparison() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const gridColor = isDark ? '#334155' : '#f1f5f9';
  const axisColor = isDark ? '#cbd5e1' : '#94a3b8';
  const referenceLineColor = isDark ? '#475569' : '#cbd5e1';
  const [days, setDays] = useState(90);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, [days]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getPortfolioComparison(days);
      setData(result.data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Tick count for x-axis — avoid crowding
  const tickEvery = data.length > 200 ? 30 : data.length > 60 ? 14 : data.length > 20 ? 7 : 1;
  const ticks = data.filter((_, i) => i % tickEvery === 0).map(d => d.date);

  // Last values for the legend sub-labels
  const last = data[data.length - 1];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 h-[440px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Performance vs Benchmarks</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Indexed to 100 at period start · % return from baseline</p>
        </div>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                days === p.days
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-red-500 dark:text-red-400">{error}</div>
      ) : data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
          No historical snapshot data yet. Use the Backfill button below to load history.
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Legend with current values */}
          <div className="flex flex-wrap gap-5 mb-4 shrink-0">
            {LINES.map(l => {
              const val = last?.[l.key];
              const diff = val != null ? val - 100 : null;
              return (
                <div key={l.key} className="flex items-center gap-2">
                  <div className="w-3 h-0.5 rounded" style={{ background: l.color }} />
                  <span className="text-xs text-slate-500 dark:text-slate-400">{l.label}</span>
                  {diff != null && (
                    <span className={`text-xs font-bold tabular-nums ${diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                      {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis
                  dataKey="date"
                  ticks={ticks}
                  tickFormatter={formatDate}
                  tick={{ fontSize: 11, fill: axisColor }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatAxis}
                  tick={{ fontSize: 11, fill: axisColor }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <ReferenceLine y={100} stroke={referenceLineColor} strokeDasharray="4 4" />
                <Tooltip content={<CustomTooltip />} />
                {LINES.map(l => (
                  <Line
                    key={l.key}
                    type="monotone"
                    dataKey={l.key}
                    name={l.label}
                    stroke={l.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
