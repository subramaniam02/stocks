import { useState, useEffect, useCallback } from 'react';
import { FileText, RefreshCw, X } from 'lucide-react';
import { api } from '../services/api';

const PERIODS = [
  { key: 'today', label: 'Today', prose: 'Today' },
  { key: 'weekly', label: 'Last 7 Days', prose: 'Over the last 7 days' },
  { key: 'monthly', label: 'Last 30 Days', prose: 'Over the last 30 days' },
];

function fmtDollar(n) {
  return Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDateRange(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const fmt = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
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
  const today = new Date().toISOString().slice(0, 10);
  return {
    totalPct, gainedDollar, lostDollar, gainers, losers,
    gainersCount: gainers.length, losersCount: losers.length, unchangedCount: unchanged, noDataCount: noData,
    totalCount: portfolio.stocks.length,
    startDate: today, endDate: today,
  };
}

function statsFromApi(data) {
  return {
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
    startDate: data.start_date, endDate: data.end_date,
  };
}

function PeriodSection({ period, stats, error, atHigh, atLow, onTickerClick }) {
  const [expanded, setExpanded] = useState(null); // 'gainers' | 'losers' | null

  if (error || !stats) {
    return (
      <div>
        <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">{period.label}</h3>
        <p className="text-sm text-slate-400 dark:text-slate-500">No data available yet.</p>
      </div>
    );
  }

  const netDollar = stats.gainedDollar + stats.lostDollar;
  const netPos = netDollar >= 0;
  const dateRange = period.key !== 'today' ? fmtDateRange(stats.startDate, stats.endDate) : null;

  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
        {period.label}
        {dateRange && (
          <span className="normal-case font-normal text-slate-400 dark:text-slate-500">({dateRange})</span>
        )}
      </h3>
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {period.prose} your portfolio{' '}
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
        {period.key === 'today' && (
          <>
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
          </>
        )}
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
    </div>
  );
}

export default function PortfolioTextSummary({ portfolio, onTickerClick }) {
  const [statsByPeriod, setStatsByPeriod] = useState({});
  const [errorsByPeriod, setErrorsByPeriod] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const results = { today: portfolio ? buildTodayStats(portfolio) : null };
    const errors = {};

    await Promise.all(['weekly', 'monthly'].map(async (p) => {
      try {
        results[p] = statsFromApi(await api.getAlertSummary(p));
      } catch (e) {
        errors[p] = e.message;
      }
    }));

    setStatsByPeriod(results);
    setErrorsByPeriod(errors);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio]);

  useEffect(() => { load(); }, [load]);

  if (!portfolio?.stocks?.length) return null;

  const atHigh = [], atLow = [];
  for (const s of portfolio.stocks) {
    if (s.week_52_high != null && s.current_price >= s.week_52_high * 0.99) atHigh.push(s.ticker);
    if (s.week_52_low != null && s.current_price <= s.week_52_low * 1.01) atLow.push(s.ticker);
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">At a Glance</h2>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="space-y-4 divide-y divide-slate-100 dark:divide-slate-700 [&>*:not(:first-child)]:pt-4">
          {PERIODS.map(p => (
            <PeriodSection
              key={p.key}
              period={p}
              stats={statsByPeriod[p.key]}
              error={errorsByPeriod[p.key]}
              atHigh={atHigh}
              atLow={atLow}
              onTickerClick={onTickerClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
