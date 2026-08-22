import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, RefreshCw, Star, ArrowUp, ArrowDown, ArrowUpDown, LayoutGrid, LayoutList, X } from 'lucide-react';
import { api } from '../services/api';

function fmtPrice(n) {
  if (n == null) return '—';
  return `$${n.toFixed(n < 10 ? 3 : 2)}`;
}

const COLS = [
  { key: 'ticker',      label: 'Ticker',     align: 'left'  },
  { key: 'name',        label: 'Name',       align: 'left'  },
  { key: 'price',       label: 'Price',      align: 'right' },
  { key: 'change_pct',  label: 'Today',      align: 'right' },
];

function SortIcon({ col, sortKey, sortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="w-3 h-3 ml-1 text-slate-300 dark:text-slate-600" />;
  return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-blue-500" /> : <ArrowDown className="w-3 h-3 ml-1 text-blue-500" />;
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm px-5 py-4">
      <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</div>
      {sub && <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function WatchlistCard({ quote, onTickerClick, onRemove, removing }) {
  const pos = (quote.change_pct ?? 0) >= 0;
  return (
    <div className="relative group bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-3.5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all">
      <button
        onClick={() => onRemove(quote.ticker)}
        disabled={removing}
        title="Remove from watchlist"
        className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-opacity disabled:opacity-40"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => onTickerClick?.(quote.ticker)} className="w-full text-left">
        <div className="font-bold text-slate-800 dark:text-slate-100 truncate pr-4">{quote.ticker}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 truncate mb-2">{quote.name ?? '—'}</div>
        <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{fmtPrice(quote.price)}</div>
        <div className={`text-xs font-semibold tabular-nums inline-flex items-center gap-1 ${quote.change_pct == null ? 'text-slate-400 dark:text-slate-500' : pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
          {quote.change_pct != null ? (
            <>
              {pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {pos ? '+' : ''}{quote.change_pct.toFixed(2)}%
            </>
          ) : '—'}
        </div>
      </button>
    </div>
  );
}

function WatchlistRow({ quote, onTickerClick, onRemove, removing }) {
  const pos = (quote.change_pct ?? 0) >= 0;
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
      <td className="px-4 py-2.5">
        <button onClick={() => onTickerClick?.(quote.ticker)} className="font-bold text-slate-800 dark:text-slate-100 hover:underline">
          {quote.ticker}
        </button>
      </td>
      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 truncate max-w-[240px]">{quote.name ?? '—'}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{fmtPrice(quote.price)}</td>
      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${quote.change_pct == null ? 'text-slate-400 dark:text-slate-500' : pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
        {quote.change_pct != null ? (
          <span className="inline-flex items-center gap-1 justify-end">
            {pos ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {pos ? '+' : ''}{quote.change_pct.toFixed(2)}%
          </span>
        ) : '—'}
      </td>
      <td className="px-4 py-2.5 text-right">
        <button
          onClick={() => onRemove(quote.ticker)}
          disabled={removing}
          title="Remove from watchlist"
          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

export default function WatchlistPage({ onTickerClick, onAddToWatchlist, onRemoveFromWatchlist }) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newTicker, setNewTicker] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);
  const [removingTicker, setRemovingTicker] = useState(null);
  const [sortKey, setSortKey] = useState('ticker');
  const [sortDir, setSortDir] = useState('asc');
  const [view, setView] = useState('grid'); // 'grid' | 'table'

  const handleSort = (key) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'ticker' || key === 'name' ? 'asc' : 'desc'); }
  };

  const sortedQuotes = useMemo(() => {
    const arr = [...quotes];
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1; if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [quotes, sortKey, sortDir]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getWatchlistQuotes();
      setQuotes(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker) return;
    setAdding(true);
    setAddError(null);
    try {
      await onAddToWatchlist?.(ticker);
      setNewTicker('');
      await load();
    } catch (e) {
      setAddError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (ticker) => {
    setRemovingTicker(ticker);
    try {
      await onRemoveFromWatchlist?.(ticker);
      setQuotes(prev => prev.filter(q => q.ticker !== ticker));
    } catch (e) {
      setError(e.message);
    } finally {
      setRemovingTicker(null);
    }
  };

  const gainers = quotes.filter(q => (q.change_pct ?? 0) > 0).length;
  const losers = quotes.filter(q => (q.change_pct ?? 0) < 0).length;

  return (
    <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Star className="w-5 h-5 text-amber-400" />
          Watchlist
        </h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
            <button
              onClick={() => setView('grid')}
              title="Grid view"
              className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
                view === 'grid' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView('table')}
              title="Table view"
              className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
                view === 'table' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <SummaryCard label="Watched" value={quotes.length} />
        <SummaryCard label="Gainers Today" value={gainers} />
        <SummaryCard label="Losers Today" value={losers} />
      </div>

      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <input
          type="text"
          value={newTicker}
          onChange={e => setNewTicker(e.target.value)}
          placeholder="Add a ticker…"
          aria-label="Add a ticker to watchlist"
          className="w-48 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
        />
        <button
          type="submit"
          disabled={adding || !newTicker.trim()}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />Add
        </button>
        {addError && <p className="text-sm text-red-500 dark:text-red-400">{addError}</p>}
      </form>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 rounded-lg text-sm">
          Error: {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : quotes.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400 text-center py-12 text-sm bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          No tickers watched yet — every current and past holding is added automatically, or add one above.
        </p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {sortedQuotes.map(q => (
            <WatchlistCard
              key={q.ticker}
              quote={q}
              onTickerClick={onTickerClick}
              onRemove={handleRemove}
              removing={removingTicker === q.ticker}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-100 dark:border-slate-700">
                {COLS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-4 py-2.5 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    <span className="inline-flex items-center">
                      {col.align === 'right' && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                      {col.label}
                      {col.align === 'left' && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                    </span>
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {sortedQuotes.map(q => (
                <WatchlistRow
                  key={q.ticker}
                  quote={q}
                  onTickerClick={onTickerClick}
                  onRemove={handleRemove}
                  removing={removingTicker === q.ticker}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
