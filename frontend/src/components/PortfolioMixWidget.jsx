import { useEffect, useMemo, useRef } from 'react';
import { PieChart as PieChartIcon, X } from 'lucide-react';

const MIN_PCT = 1;

const COLORS = [
  'bg-blue-400', 'bg-emerald-400', 'bg-amber-400', 'bg-purple-400',
  'bg-pink-400', 'bg-cyan-400', 'bg-orange-400', 'bg-lime-400',
  'bg-violet-400', 'bg-red-400', 'bg-teal-400', 'bg-fuchsia-400',
];

function fmtDollar(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

export default function PortfolioMixWidget({ portfolio, open, onOpenChange, onTickerClick }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onOpenChange(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onOpenChange]);

  const rows = useMemo(() => {
    const total = portfolio?.total_value;
    if (!total) return [];
    return (portfolio?.stocks ?? [])
      .map(s => ({ ticker: s.ticker, value: s.total_value, pct: (s.total_value / total) * 100 }))
      .filter(r => r.pct >= MIN_PCT)
      .sort((a, b) => b.pct - a.pct);
  }, [portfolio]);

  const coveredPct = rows.reduce((sum, r) => sum + r.pct, 0);

  if (!portfolio?.stocks?.length) return null;

  return (
    <div className="relative">
      <button
        onClick={() => onOpenChange(!open)}
        title="Portfolio mix"
        className={`p-2 rounded-lg transition-colors ${
          open ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
        }`}
      >
        <PieChartIcon className="w-4 h-4 text-blue-400" />
      </button>

      {open && (
        <div ref={panelRef} className="fixed left-16 top-1/2 -translate-y-1/2 w-72 max-h-[85vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/40 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Portfolio Mix</span>
            <button onClick={() => onOpenChange(false)} className="p-1 -m-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors">
              <X className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            </button>
          </div>

          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500">
            Tickers &ge; {MIN_PCT}% of portfolio · covering {coveredPct.toFixed(0)}%
          </div>

          <div className="overflow-y-auto flex-1 min-h-0">
            {rows.length > 0 ? rows.map((r, i) => (
              <button
                key={r.ticker}
                onClick={() => onTickerClick?.(r.ticker)}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors text-left"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${COLORS[i % COLORS.length]}`} />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{r.ticker}</span>
                <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mx-1">
                  <div className={`h-full rounded-full ${COLORS[i % COLORS.length]}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
                </div>
                <span className="text-right shrink-0">
                  <span className="block text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">{r.pct.toFixed(1)}%</span>
                  <span className="block text-[10px] tabular-nums opacity-70 text-slate-500 dark:text-slate-400">{fmtDollar(r.value)}</span>
                </span>
              </button>
            )) : (
              <p className="text-xs text-slate-400 dark:text-slate-600 px-3 py-3">No position holds {MIN_PCT}%+ of the portfolio</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
