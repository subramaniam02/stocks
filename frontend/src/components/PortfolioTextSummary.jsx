import { useState, useEffect, useCallback } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'weekly', label: 'This Week' },
  { key: 'monthly', label: 'This Month' },
];

function fmtDollar(n) {
  return Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function TickerChips({ tickers, colorClass, onTickerClick }) {
  return tickers.map((t, i) => (
    <span key={t}>
      <button onClick={() => onTickerClick?.(t)} className={`font-semibold hover:underline ${colorClass}`}>{t}</button>
      {i < tickers.length - 1 ? ', ' : ''}
    </span>
  ));
}

// "Today" is derived straight from the already-loaded portfolio (instant, no
// fetch); weekly/monthly reuse the backend's alert-summary computation, the
// same one behind the scheduled summary alerts.
function buildTodayStats(portfolio) {
  let gainedDollar = 0, lostDollar = 0;
  let gainers = 0, losers = 0, unchanged = 0, noData = 0;
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
  }
  const netDollar = gainedDollar + lostDollar;
  const yesterdayValue = portfolio.total_value - netDollar;
  const totalPct = yesterdayValue > 0 ? (netDollar / yesterdayValue) * 100 : null;
  return {
    totalPct, gainedDollar, lostDollar,
    gainersCount: gainers, losersCount: losers, unchangedCount: unchanged, noDataCount: noData,
    totalCount: portfolio.stocks.length,
  };
}

export default function PortfolioTextSummary({ portfolio, onTickerClick }) {
  const [period, setPeriod] = useState('today');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (p) => {
    if (p === 'today') {
      setStats(portfolio ? buildTodayStats(portfolio) : null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAlertSummary(p);
      setStats({
        totalPct: data.total_pct,
        gainedDollar: data.gained_dollar,
        lostDollar: data.lost_dollar,
        gainersCount: data.gainers_count,
        losersCount: data.losers_count,
        unchangedCount: data.unchanged_count,
        noDataCount: 0,
        totalCount: data.total_count,
      });
    } catch (e) {
      setStats(null);
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio]);

  useEffect(() => { load(period); }, [period, load]);

  if (!portfolio?.stocks?.length) return null;

  const atHigh = [], atLow = [];
  for (const s of portfolio.stocks) {
    if (s.week_52_high != null && s.current_price >= s.week_52_high * 0.99) atHigh.push(s.ticker);
    if (s.week_52_low != null && s.current_price <= s.week_52_low * 1.01) atLow.push(s.ticker);
  }

  const netDollar = stats ? stats.gainedDollar + stats.lostDollar : 0;
  const netPos = netDollar >= 0;
  const periodLabel = period === 'today' ? 'today' : period === 'weekly' ? 'this week' : 'this month';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">At a Glance</h2>
        </div>
        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-900/60 rounded-md p-0.5">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                period === p.key ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
        </div>
      ) : error || !stats ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 py-2">No data available for {periodLabel} yet.</p>
      ) : (
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {period === 'today' ? 'Today' : period === 'weekly' ? 'This week' : 'This month'} your portfolio{' '}
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">gained +${fmtDollar(stats.gainedDollar)}</span>
          {' '}and{' '}
          <span className="font-semibold text-red-500 dark:text-red-400">lost -${fmtDollar(stats.lostDollar)}</span>
          {', for a net of '}
          <span className={`font-semibold ${netPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
            {netPos ? '+' : '-'}${fmtDollar(netDollar)}
            {stats.totalPct != null && <> ({stats.totalPct >= 0 ? '+' : ''}{stats.totalPct.toFixed(2)}%)</>}
          </span>
          {'. Of '}{stats.totalCount} ticker{stats.totalCount === 1 ? '' : 's'}, <span className="font-semibold text-emerald-600 dark:text-emerald-400">{stats.gainersCount} gained</span>
          {' and '}<span className="font-semibold text-red-500 dark:text-red-400">{stats.losersCount} dropped</span>
          {stats.unchangedCount > 0 && <>, {stats.unchangedCount} unchanged</>}
          {stats.noDataCount > 0 && <>, {stats.noDataCount} without today's data</>}
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
      )}
    </div>
  );
}
