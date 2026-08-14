import { TrendingDown, CheckCircle2 } from 'lucide-react';

export default function LossWatchlist({ portfolio, onTickerClick }) {
  if (!portfolio?.stocks?.length) return null;

  const losers = portfolio.stocks
    .filter(s => s.gain_loss_pct < 0)
    .sort((a, b) => a.gain_loss_pct - b.gain_loss_pct);

  if (losers.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm px-5 py-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">All positions profitable</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">No holdings are below cost basis</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown className="w-4 h-4 text-red-400" />
        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Loss Watch</h2>
        <span className="text-xs bg-red-50 text-red-400 dark:bg-red-950/40 px-2 py-0.5 rounded-full font-medium">{losers.length}</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-0.5">
        {losers.map(stock => {
          const lossBar = Math.min(Math.abs(stock.gain_loss_pct), 100);
          return (
            <button
              key={stock.ticker}
              onClick={() => onTickerClick?.(stock.ticker)}
              className="shrink-0 text-left p-3 bg-red-50/70 border border-red-100 hover:border-red-300 hover:bg-red-50 dark:bg-red-950/40 dark:border-red-900/40 dark:hover:border-red-700 dark:hover:bg-red-950/60 rounded-xl transition-colors w-36 group"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-bold text-sm text-slate-800 dark:text-slate-100 group-hover:text-red-700 dark:group-hover:text-red-400 transition-colors">{stock.ticker}</span>
                <span className="text-sm font-bold text-red-500 dark:text-red-400 tabular-nums">{stock.gain_loss_pct.toFixed(1)}%</span>
              </div>
              {stock.name && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mb-1.5">{stock.name}</p>
              )}
              <div className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums mb-2">
                ${stock.average_cost.toFixed(2)} → ${stock.current_price.toFixed(2)}
              </div>
              <div className="h-1 bg-red-100 dark:bg-red-900/40 rounded-full">
                <div className="h-full bg-red-400 rounded-full" style={{ width: `${lossBar}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
