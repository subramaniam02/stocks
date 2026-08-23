import { useState, useEffect, useCallback } from 'react';
import { FileText, RefreshCw, X } from 'lucide-react';
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

function TickerListPanel({ title, tickers, colorClass, onTickerClick, onClose }) {
  return (
    <div className="mt-3 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{title} ({tickers.length})</span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors">
          <X className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 p-3">
        {tickers.map(t => (
          <button
            key={t.ticker}
            onClick={() => onTickerClick?.(t.ticker)}
            className="flex items-center justify-between gap-2 text-left hover:underline"
          >
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t.ticker}</span>
            <span className={`text-xs font-medium tabular-nums ${colorClass}`}>
              {t.gain_loss_pct >= 0 ? '+' : ''}{t.gain_loss_pct.toFixed(1)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// "Today" is derived straight from the already-loaded portfolio (instant, no
// fetch); weekly/monthly reuse the backend's alert-summary computation, the
// same one behind the scheduled summary alerts.
function buildTodayStats(portfolio) {
  let gainedDollar = 0, lostDollar = 0;
  const gainers = [], losers = [];
  let unchanged = 0, noData = 0;
  for (const s of portfolio.stocks) {
    if (s.return_1d != null && !s.price_stale) {
      const perShare = s.current_price * s.return_1d / (100 + s.return_1d);
      const delta = perShare * s.total_quantity;
      const entry = { ticker: s.ticker, gain_loss_pct: s.return_1d, gain_loss: delta };
      if (delta > 0) { gainedDollar += delta; gainers.push(entry); }
      else if (delta < 0) { lostDollar += delta; losers.push(entry); }
      else unchanged++;
    } else {
      noData++;
    }
  }
  gainers.sort((a, b) => b.gain_loss_pct - a.gain_loss_pct);
  losers.sort((a, b) => a.gain_loss_pct - b.gain_loss_pct);
  const netDollar = gainedDollar + lostDollar;
  const yesterdayValue = portfolio.total_value - netDollar;
  const totalPct = yesterdayValue > 0 ? (netDollar / yesterdayValue) * 100 : null;
  return {
    totalPct, gainedDollar, lostDollar, gainers, losers,
    gainersCount: gainers.length, losersCount: losers.length, unchangedCount: unchanged, noDataCount: noData,
    totalCount: portfolio.stocks.length,
  };
}

export default function PortfolioTextSummary({ portfolio, onTickerClick }) {
  const [period, setPeriod] = useState('today');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null); // 'gainers' | 'losers' | null

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
        gainers: data.gainers,
        losers: data.losers,
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

  useEffect(() => { load(period); setExpanded(null); }, [period, load]);

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
        <>
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
          {'. Of '}{stats.totalCount} ticker{stats.totalCount === 1 ? '' : 's'},{' '}
          <button
            onClick={() => setExpanded(e => e === 'gainers' ? null : 'gainers')}
            disabled={stats.gainersCount === 0}
            className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline disabled:no-underline disabled:cursor-default"
          >
            {stats.gainersCount} gained
          </button>
          {' and '}
          <button
            onClick={() => setExpanded(e => e === 'losers' ? null : 'losers')}
            disabled={stats.losersCount === 0}
            className="font-semibold text-red-500 dark:text-red-400 hover:underline disabled:no-underline disabled:cursor-default"
          >
            {stats.losersCount} dropped
          </button>
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

        {expanded === 'gainers' && (
          <TickerListPanel
            title="Gainers"
            tickers={stats.gainers}
            colorClass="text-emerald-600 dark:text-emerald-400"
            onTickerClick={onTickerClick}
            onClose={() => setExpanded(null)}
          />
        )}
        {expanded === 'losers' && (
          <TickerListPanel
            title="Losers"
            tickers={stats.losers}
            colorClass="text-red-500 dark:text-red-400"
            onTickerClick={onTickerClick}
            onClose={() => setExpanded(null)}
          />
        )}
        </>
      )}
    </div>
  );
}
