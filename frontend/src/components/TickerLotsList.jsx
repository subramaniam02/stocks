const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export default function TickerLotsList({ stockPos, portfolioTotal }) {
  if (!stockPos) return null;

  const pctOfPortfolio = portfolioTotal > 0 ? (stockPos.total_value / portfolioTotal) * 100 : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          Your Lots <span className="text-slate-300 dark:text-slate-600 normal-case font-normal">({stockPos.lots.length})</span>
        </p>
        <span className={`text-xs font-bold tabular-nums ${stockPos.gain_loss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
          {stockPos.gain_loss >= 0 ? '+' : ''}${stockPos.gain_loss.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ({stockPos.gain_loss >= 0 ? '+' : ''}{stockPos.gain_loss_pct.toFixed(2)}%)
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          ['Shares', stockPos.total_quantity.toFixed(2)],
          ['Avg Cost', `$${stockPos.average_cost.toFixed(2)}`],
          ['Current Price', `$${stockPos.current_price.toFixed(2)}`],
          ['Value', `$${stockPos.total_value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`],
          ...(pctOfPortfolio != null ? [['% of Portfolio', `${pctOfPortfolio.toFixed(1)}%`]] : []),
        ].map(([l, v]) => (
          <div key={l} className="bg-slate-50 dark:bg-slate-900/40 rounded-lg py-2 text-center">
            <p className="text-[10px] text-slate-400 dark:text-slate-500">{l}</p>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{v}</p>
          </div>
        ))}
      </div>

      <div className="border border-slate-100 dark:border-slate-700 rounded-lg overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
        {[...stockPos.lots]
          .sort((a, b) => new Date(b.purchase_date) - new Date(a.purchase_date))
          .map(lot => {
            const lotPos = lot.gain_loss >= 0;
            const longTerm = (Date.now() - new Date(lot.purchase_date).getTime()) >= ONE_YEAR_MS;
            return (
              <div key={lot.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-600 dark:text-slate-300">{lot.purchase_date}</span>
                    <span className={`text-[9px] font-semibold px-1 py-px rounded ${longTerm ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'}`}>
                      {longTerm ? 'LT' : 'ST'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                    {lot.quantity.toFixed(2)} sh · ${lot.purchase_price.toFixed(2)} → ${lot.current_price.toFixed(2)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-semibold tabular-nums ${lotPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {lotPos ? '+' : ''}${Math.abs(lot.gain_loss).toFixed(0)}
                  </p>
                  <p className={`text-[10px] tabular-nums ${lotPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {lotPos ? '+' : ''}{lot.gain_loss_pct.toFixed(1)}%
                  </p>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
