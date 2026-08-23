import { FileText } from 'lucide-react';

function fmtDollar(n) {
  const abs = Math.abs(n);
  return abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function TickerChips({ tickers, colorClass, onTickerClick }) {
  return tickers.map((t, i) => (
    <span key={t}>
      <button onClick={() => onTickerClick?.(t)} className={`font-semibold hover:underline ${colorClass}`}>{t}</button>
      {i < tickers.length - 1 ? ', ' : ''}
    </span>
  ));
}

export default function PortfolioTextSummary({ portfolio, onTickerClick }) {
  if (!portfolio?.stocks?.length) return null;

  let gainedDollar = 0, lostDollar = 0;
  let gainers = 0, losers = 0, unchanged = 0, noData = 0;
  const atHigh = [], atLow = [];

  for (const s of portfolio.stocks) {
    if (s.return_1d != null && !s.price_stale) {
      const perShare = s.current_price * s.return_1d / (100 + s.return_1d);
      const delta = perShare * s.total_quantity;
      if (delta > 0) { gainedDollar += delta; gainers++; }
      else if (delta < 0) { lostDollar += delta; losers++; }
      else unchanged++;
    } else {
      noData++;
    }

    if (s.week_52_high != null && s.current_price >= s.week_52_high * 0.99) atHigh.push(s.ticker);
    if (s.week_52_low != null && s.current_price <= s.week_52_low * 1.01) atLow.push(s.ticker);
  }

  const netDollar = gainedDollar + lostDollar;
  const netPos = netDollar >= 0;
  const totalTickers = portfolio.stocks.length;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500" />
        <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Today at a Glance</h2>
      </div>
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        Today your portfolio{' '}
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">gained +${fmtDollar(gainedDollar)}</span>
        {' '}and{' '}
        <span className="font-semibold text-red-500 dark:text-red-400">lost -${fmtDollar(Math.abs(lostDollar))}</span>
        {', for a net of '}
        <span className={`font-semibold ${netPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
          {netPos ? '+' : '-'}${fmtDollar(netDollar)}
        </span>
        {'. Of '}{totalTickers} ticker{totalTickers === 1 ? '' : 's'}, <span className="font-semibold text-emerald-600 dark:text-emerald-400">{gainers} gained</span>
        {' and '}<span className="font-semibold text-red-500 dark:text-red-400">{losers} dropped</span>
        {unchanged > 0 && <>, {unchanged} unchanged</>}
        {noData > 0 && <>, {noData} without today's data</>}
        {'. '}
        {atHigh.length > 0 && (
          <>
            <TickerChips tickers={atHigh} colorClass="text-emerald-600 dark:text-emerald-400" onTickerClick={onTickerClick} />
            {atHigh.length === 1 ? ' is' : ' are'} near a 52-week high.{' '}
          </>
        )}
        {atLow.length > 0 && (
          <>
            <TickerChips tickers={atLow} colorClass="text-red-500 dark:text-red-400" onTickerClick={onTickerClick} />
            {atLow.length === 1 ? ' is' : ' are'} near a 52-week low.{' '}
          </>
        )}
        {atHigh.length === 0 && atLow.length === 0 && 'No tickers are currently near a 52-week high or low.'}
      </p>
    </div>
  );
}
