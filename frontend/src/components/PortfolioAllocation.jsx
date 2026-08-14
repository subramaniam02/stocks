import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PieChart as PieIcon } from 'lucide-react';

const COLORS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981',
  '#ef4444', '#06b6d4', '#f97316', '#ec4899',
  '#6366f1', '#84cc16',
];
const OTHER_COLOR = '#64748b';
const MAX_SLICES = 9;

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg max-w-[220px]">
      <div className="font-semibold">{d.ticker}</div>
      {d.isOther
        ? <div className="text-slate-300 mb-1">{d.tickers.join(', ')}</div>
        : d.name && <div className="text-slate-300 mb-1">{d.name}</div>
      }
      <div>${d.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div className="text-slate-300">{d.pct.toFixed(1)}% of portfolio</div>
    </div>
  );
}

function CustomLegend({ data, onTickerClick }) {
  return (
    <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1 shrink-0">
      {data.map((entry) => (
        <button
          key={entry.ticker}
          onClick={() => !entry.isOther && onTickerClick?.(entry.ticker)}
          title={entry.isOther ? entry.tickers.join(', ') : undefined}
          className={`w-full flex items-center justify-between text-xs rounded-md px-1 py-0.5 transition-colors group ${entry.isOther ? 'cursor-default' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className={`font-medium text-slate-700 dark:text-slate-200 truncate ${entry.isOther ? '' : 'group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'}`}>{entry.ticker}</span>
            {entry.name && (
              <span className="text-slate-400 dark:text-slate-500 truncate hidden sm:block">{entry.name}</span>
            )}
          </div>
          <span className="text-slate-500 dark:text-slate-400 shrink-0 ml-2 tabular-nums">{entry.pct.toFixed(1)}%</span>
        </button>
      ))}
    </div>
  );
}

export default function PortfolioAllocation({ portfolio, onTickerClick }) {
  if (!portfolio?.stocks?.length) return null;

  const totalValue = portfolio.total_value;
  const sorted = portfolio.stocks
    .filter(s => s.total_value > 0)
    .map(s => ({
      ticker: s.ticker,
      name: s.name,
      value: s.total_value,
      pct: totalValue > 0 ? (s.total_value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const top = sorted.slice(0, MAX_SLICES).map((s, i) => ({ ...s, color: COLORS[i % COLORS.length] }));
  const rest = sorted.slice(MAX_SLICES);

  const data = rest.length > 0
    ? [...top, {
        ticker: 'Other',
        tickers: rest.map(s => s.ticker),
        value: rest.reduce((sum, s) => sum + s.value, 0),
        pct: rest.reduce((sum, s) => sum + s.pct, 0),
        color: OTHER_COLOR,
        isOther: true,
      }]
    : top;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 h-[440px] flex flex-col">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 shrink-0">
        <PieIcon className="w-4 h-4" />
        Allocation
        {rest.length > 0 && (
          <span className="ml-auto text-[10px] font-medium text-slate-400 dark:text-slate-500 normal-case tracking-normal">
            Top {MAX_SLICES} + {rest.length} more
          </span>
        )}
      </h2>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="52%"
              outerRadius="78%"
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
              style={{ cursor: 'pointer' }}
              onClick={(entry) => !entry.isOther && onTickerClick?.(entry.ticker)}
            >
              {data.map((entry) => (
                <Cell key={entry.ticker} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <CustomLegend data={data} onTickerClick={onTickerClick} />
    </div>
  );
}
