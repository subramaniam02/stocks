import { useEffect, useRef, useState } from 'react';
import { Star, X, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

function fmtPrice(n) {
  if (n == null) return '—';
  return `$${n.toFixed(n < 10 ? 3 : 2)}`;
}

function WatchlistRow({ quote, onTickerClick, onRemove }) {
  const pos = (quote.change_pct ?? 0) >= 0;
  const color = pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors group">
      <button onClick={() => onTickerClick?.(quote.ticker)} className="flex-1 min-w-0 text-left">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate block">{quote.ticker}</span>
      </button>
      <span className="text-right shrink-0">
        <span className="block text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">{fmtPrice(quote.price)}</span>
        {quote.change_pct != null && (
          <span className={`block text-[10px] tabular-nums opacity-90 ${color}`}>
            {pos ? '+' : ''}{quote.change_pct.toFixed(2)}%
          </span>
        )}
      </span>
      <button
        onClick={() => onRemove?.(quote.ticker)}
        title="Remove from watchlist"
        className="p-1 -m-1 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-opacity shrink-0"
      >
        <X className="w-3 h-3 text-slate-400 dark:text-slate-500" />
      </button>
    </div>
  );
}

export default function WatchlistWidget({ open, onOpenChange, onTickerClick, onRemoveFromWatchlist }) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onOpenChange(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onOpenChange]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getWatchlistQuotes();
      setQuotes(data);
    } catch {
      // non-critical — widget just stays empty/stale
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRemove = async (ticker) => {
    setQuotes(prev => prev.filter(q => q.ticker !== ticker));
    try {
      await onRemoveFromWatchlist?.(ticker);
    } catch {
      load(); // out of sync with the server — resync
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => onOpenChange(!open)}
        title="Watchlist"
        className={`p-2 rounded-lg transition-colors ${
          open ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
        }`}
      >
        <Star className="w-4 h-4 text-amber-400" />
      </button>

      {open && (
        <div ref={panelRef} className="fixed left-16 top-1/2 -translate-y-1/2 w-72 max-h-[85vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/40 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Watchlist</span>
            <div className="flex items-center gap-1">
              <button onClick={load} disabled={loading} className="p-1 -m-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-40">
                <RefreshCw className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => onOpenChange(false)} className="p-1 -m-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors">
                <X className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 min-h-0">
            {quotes.length > 0 ? (
              quotes.map(q => (
                <WatchlistRow key={q.ticker} quote={q} onTickerClick={onTickerClick} onRemove={handleRemove} />
              ))
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-600 px-3 py-3">
                {loading ? 'Loading…' : 'No tickers watched yet'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
