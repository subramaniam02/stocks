import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// per-share dollar change: derived from return_1d % and current price
function dayDollar(stock) {
  if (stock.return_1d == null) return null;
  return stock.current_price * stock.return_1d / (100 + stock.return_1d);
}

function MoverTable({ title, stocks, icon: Icon, colorClass, emptyMsg, onTickerClick }) {
  const isUp = colorClass.includes('emerald');
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <Icon className={`w-4 h-4 ${colorClass}`} />
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</h3>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
          isUp ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-400'
        }`}>
          {stocks.length}
        </span>
      </div>

      {stocks.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-xs text-slate-400 dark:text-slate-500">{emptyMsg}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
              <th className="px-4 py-2 text-left  text-xs font-medium text-slate-400 dark:text-slate-500">Ticker</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 dark:text-slate-500">Price</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 dark:text-slate-500">Day Change</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 dark:text-slate-500">Portfolio Δ</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 dark:text-slate-500">Holdings Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {stocks.map(s => {
              const up = (s.return_1d ?? 0) >= 0;
              const perShare = dayDollar(s);
              // total dollar impact on the user's portfolio for this position
              const portfolioDelta = perShare != null ? perShare * s.total_quantity : null;
              const color = up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
              return (
                <tr key={s.ticker} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <button
                      onClick={() => onTickerClick?.(s.ticker)}
                      className="font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      {s.ticker}
                    </button>
                    {s.name && <div className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[120px]">{s.name}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">
                    ${s.current_price.toFixed(2)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${color}`}>
                    {perShare != null
                      ? <div>{up ? '+' : ''}${Math.abs(perShare).toFixed(2)}</div>
                      : null}
                    {s.return_1d != null
                      ? <div className="text-xs font-normal opacity-75">{up ? '+' : ''}{s.return_1d.toFixed(2)}%</div>
                      : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${color}`}>
                    {portfolioDelta != null
                      ? <>{up ? '+' : ''}${Math.abs(portfolioDelta).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                      : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    ${s.total_value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function TodayMovers({ portfolio, onTickerClick }) {
  if (!portfolio?.stocks?.length) return null;

  const withReturn = portfolio.stocks.filter(s => s.return_1d != null);
  const winners = [...withReturn].filter(s => s.return_1d > 0).sort((a, b) => b.return_1d - a.return_1d);
  const losers  = [...withReturn].filter(s => s.return_1d < 0).sort((a, b) => a.return_1d - b.return_1d);
  const flat    = withReturn.filter(s => s.return_1d === 0);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="flex divide-x divide-slate-100 dark:divide-slate-800">
        <MoverTable
          title="Today's Losers"
          stocks={losers}
          icon={TrendingDown}
          colorClass="text-red-400"
          emptyMsg="No losers today"
          onTickerClick={onTickerClick}
        />
        <MoverTable
          title="Today's Winners"
          stocks={winners}
          icon={TrendingUp}
          colorClass="text-emerald-500"
          emptyMsg="No winners today"
          onTickerClick={onTickerClick}
        />
      </div>
      {flat.length > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <Minus className="w-3 h-3" />
          Unchanged today: {flat.map(s => s.ticker).join(', ')}
        </div>
      )}
    </div>
  );
}
