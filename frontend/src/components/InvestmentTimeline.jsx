import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Landmark } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

function fmtDate(str) {
  const d = new Date(str);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function fmtCurrency(v) {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const RANGES = [
  { label: '1Y', years: 1 },
  { label: '3Y', years: 3 },
  { label: '5Y', years: 5 },
  { label: 'All', years: null },
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg space-y-1">
      <div className="font-semibold text-slate-300">{label}</div>
      {d.bought > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Bought</span>
          <span className="font-semibold text-indigo-300">+${d.bought.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      )}
      {d.boughtTickers?.length > 0 && (
        <div className="text-slate-500">{d.boughtTickers.join(', ')}</div>
      )}
      {d.soldAbs > 0 && (
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Sold</span>
          <span className="font-semibold text-red-300">-${d.soldAbs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      )}
      {d.soldTickers?.length > 0 && (
        <div className="text-slate-500">{d.soldTickers.join(', ')}</div>
      )}
    </div>
  );
}

export default function InvestmentTimeline({ portfolio, realized }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const gridColor = isDark ? '#334155' : '#f1f5f9';
  const axisColor = isDark ? '#cbd5e1' : '#94a3b8';
  const cursorColor = isDark ? '#334155' : '#f1f5f9';
  const [range, setRange] = useState('All');

  const { allData, totalInvested } = useMemo(() => {
    if (!portfolio?.stocks?.length && !realized?.length) return { allData: [], totalInvested: 0 };

    // Bucketed by month (not exact date): a portfolio with frequent small lots (dividend
    // reinvestment, ESPP, etc.) can have activity on dozens of distinct days per month,
    // which turns a per-day chart into a dense, unreadable strip. Bucketing to month also
    // matches the month/year axis label, so each visible bar is one real, distinct tick.
    const byMonth = {};
    const bump = (date, key, tickerKey, amount, ticker) => {
      if (!date) return;
      const monthKey = date.slice(0, 7); // "YYYY-MM"
      if (!byMonth[monthKey]) byMonth[monthKey] = { bought: 0, sold: 0, boughtTickers: [], soldTickers: [] };
      byMonth[monthKey][key] += amount;
      byMonth[monthKey][tickerKey].push(ticker);
    };

    // Buys from currently-held lots
    for (const stock of portfolio?.stocks ?? []) {
      for (const lot of stock.lots ?? []) {
        bump(lot.purchase_date, 'bought', 'boughtTickers', lot.purchase_price * lot.quantity, stock.ticker);
      }
    }
    // Buys + sells from realized (sold) lots — the original buy still counts toward money invested
    for (const t of realized ?? []) {
      bump(t.buy_date, 'bought', 'boughtTickers', t.buy_price * t.quantity, t.ticker);
      bump(t.sell_date, 'sold', 'soldTickers', t.sell_price * t.quantity, t.ticker);
    }

    const sortedMonths = Object.keys(byMonth).sort();
    let cumulative = 0;
    const allData = sortedMonths.map(monthKey => {
      const info = byMonth[monthKey];
      const date = `${monthKey}-01`;
      cumulative += info.bought;
      return {
        date,
        label: fmtDate(date),
        bought: info.bought,
        sold: -info.sold,
        soldAbs: info.sold,
        boughtTickers: [...new Set(info.boughtTickers)],
        soldTickers: [...new Set(info.soldTickers)],
        cumulative,
      };
    });

    return { allData, totalInvested: cumulative };
  }, [portfolio, realized]);

  const chartData = useMemo(() => {
    if (range === 'All') return allData;
    const opt = RANGES.find(r => r.label === range);
    if (!opt?.years) return allData;
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - opt.years);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return allData.filter(d => d.date >= cutoffStr);
  }, [allData, range]);

  if (!allData.length) return null;

  const currentValue = portfolio?.total_value ?? 0;
  const gain = currentValue - totalInvested;
  const gainPct = totalInvested > 0 ? (gain / totalInvested) * 100 : 0;
  const gainPos = gain >= 0;

  const firstDate = chartData[0]?.date;
  const lastDate = chartData[chartData.length - 1]?.date;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 h-[440px] flex flex-col">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Investment Timeline</h2>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            ${totalInvested.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} invested
          </div>
          <div className={`text-xs font-medium tabular-nums ${gainPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
            {gainPos ? '+' : ''}${gain.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ({gainPos ? '+' : ''}{gainPct.toFixed(1)}%) today
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2 shrink-0">
        <div className="flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-indigo-500" />Bought</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-red-500" />Sold</span>
        </div>
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setRange(r.label)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                range === r.label
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: axisColor }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={fmtCurrency}
              tick={{ fontSize: 10, fill: axisColor }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <ReferenceLine y={0} stroke={axisColor} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: cursorColor }} />
            <Bar dataKey="bought" radius={[3, 3, 0, 0]} fill="#6366f1" fillOpacity={0.8} />
            <Bar dataKey="sold" radius={[0, 0, 3, 3]} fill="#ef4444" fillOpacity={0.8} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-slate-400 dark:text-slate-500 shrink-0">
        <span>{chartData.length} event{chartData.length !== 1 ? 's' : ''} in range</span>
        {firstDate && lastDate && firstDate !== lastDate && (
          <span>{fmtDate(firstDate)} → {fmtDate(lastDate)}</span>
        )}
      </div>
    </div>
  );
}
