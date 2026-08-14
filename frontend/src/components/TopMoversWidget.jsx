import { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy, TrendingUp, TrendingDown, ChevronDown, ChevronUp, RefreshCw, X } from 'lucide-react';
import { api } from '../services/api';
import TickerLotsModal from './TickerLotsModal';
import { getCachedOverallPerf, setCachedOverallPerf } from '../utils/overallPerformance';

// Static: always all-time profit/loss, independent of whatever period the Trends
// tab's picker is set to — this widget is meant to be a constant reference point.
const WIDGET_PERIOD = 'all';

// Fractional lots (dividend reinvestment, etc.) can sit at a few cents of gain on
// a sliver of a share — technically a "lowest gain" but not a meaningful position.
const MIN_WHOLE_SHARES = 1;

function fmtMoverDollar(n) {
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '-';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function MoverRow({ d, expanded, onToggle }) {
  const pos = (d.changePct ?? 0) >= 0;
  const color = pos ? 'text-emerald-400' : 'text-red-400';
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-2 px-3 py-1.5 transition-colors text-left ${expanded ? 'bg-slate-700/60' : 'hover:bg-slate-800/60'}`}
    >
      <span className="text-xs font-semibold text-slate-200 truncate">{d.name}</span>
      <span className="ml-auto text-right shrink-0">
        <span className={`block text-xs font-bold tabular-nums ${color}`}>{pos ? '+' : ''}{d.changePct.toFixed(1)}%</span>
        {d.changeDollar != null && (
          <span className={`block text-[10px] tabular-nums opacity-80 ${color}`}>{fmtMoverDollar(d.changeDollar)}</span>
        )}
      </span>
    </button>
  );
}

function SectionHeader({ icon, label, open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-3 py-1.5 border-b border-t border-slate-800 bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
    >
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      {open
        ? <ChevronUp className="w-3 h-3 text-slate-500 ml-auto" />
        : <ChevronDown className="w-3 h-3 text-slate-500 ml-auto" />}
    </button>
  );
}

function LotMoverRow({ lot, expanded, onToggle }) {
  const pos = lot.gain_loss >= 0;
  const color = pos ? 'text-emerald-400' : 'text-red-400';
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-2 px-3 py-1.5 transition-colors text-left ${expanded ? 'bg-slate-700/60' : 'hover:bg-slate-800/60'}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-200">{lot.ticker}</span>
          <span className="text-[9px] text-slate-500 tabular-nums shrink-0">{lot.purchase_date}</span>
        </div>
        <p className="text-[9px] text-slate-500 tabular-nums truncate">
          {lot.quantity.toFixed(2)} sh · ${lot.purchase_price.toFixed(2)} → ${lot.current_price.toFixed(2)}
        </p>
      </div>
      <span className="text-right shrink-0">
        <span className={`block text-xs font-bold tabular-nums ${color}`}>{pos ? '+' : ''}{lot.gain_loss_pct.toFixed(1)}%</span>
        <span className={`block text-[10px] tabular-nums opacity-80 ${color}`}>{pos ? '+' : ''}${Math.abs(lot.gain_loss).toFixed(0)}</span>
      </span>
    </button>
  );
}

export default function TopMoversWidget({ portfolio, open, onOpenChange }) {
  const [perf, setPerf] = useState(() => getCachedOverallPerf(WIDGET_PERIOD));
  const [loading, setLoading] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState(null);
  const [openSections, setOpenSections] = useState({ losses: true, gains: true, lowestGains: false });
  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      // The lot modal is a full-screen overlay rendered outside panelRef — while
      // it's open it already owns click-outside/close behavior itself, so this
      // listener must not also treat that click as "outside the movers panel"
      // and collapse it too.
      if (expandedTicker) return;
      if (panelRef.current && !panelRef.current.contains(e.target)) onOpenChange(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onOpenChange, expandedTicker]);

  const load = async (force = false) => {
    if (!force) {
      const cached = getCachedOverallPerf(WIDGET_PERIOD);
      if (cached) {
        setPerf(cached);
        return;
      }
    }
    setLoading(true);
    try {
      const data = await api.getOverallPerformance(WIDGET_PERIOD);
      setCachedOverallPerf(WIDGET_PERIOD, data);
      setPerf(data);
    } catch {
      // non-critical — widget just stays empty/stale
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !perf) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { gainers, losers } = useMemo(() => {
    const ranked = (perf?.stocks ?? [])
      .filter(s => s.gain_loss_pct != null && s.quantity >= MIN_WHOLE_SHARES)
      .map(s => ({ name: s.ticker, changePct: s.gain_loss_pct, changeDollar: s.gain_loss }));
    return {
      gainers: [...ranked].sort((a, b) => b.changePct - a.changePct).slice(0, 10),
      losers: [...ranked].sort((a, b) => a.changePct - b.changePct).slice(0, 10),
    };
  }, [perf]);

  // Lot-level (not ticker-level): the smallest-margin gaining lots across the whole
  // portfolio, right now — independent of the period picker/overallPerf above.
  const lowestGains = useMemo(() => {
    const lots = [];
    for (const stock of portfolio?.stocks ?? []) {
      for (const lot of stock.lots ?? []) {
        if (lot.quantity < MIN_WHOLE_SHARES) continue;
        if (lot.price_stale || (lot.gain_loss ?? 0) < 0) continue;
        lots.push({ ...lot, ticker: stock.ticker });
      }
    }
    return lots.sort((a, b) => a.gain_loss_pct - b.gain_loss_pct).slice(0, 10);
  }, [portfolio]);

  const stockPos = expandedTicker ? portfolio?.stocks?.find(s => s.ticker === expandedTicker) : null;
  const toggleTicker = (ticker) => setExpandedTicker(t => (t === ticker ? null : ticker));

  if (!portfolio?.stocks?.length) return null;

  return (
    <div className="relative">
      <button
        onClick={() => onOpenChange(!open)}
        title="Top movers"
        className={`p-2 rounded-lg transition-colors ${
          open ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
        }`}
      >
        <Trophy className="w-4 h-4 text-emerald-400" />
      </button>

      {open && (
      <div ref={panelRef} className="fixed left-16 top-1/2 -translate-y-1/2 w-72 max-h-[85vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-800/40 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Top Movers</span>
          <div className="flex items-center gap-1">
            <button onClick={() => load(true)} disabled={loading} className="p-1 -m-1 rounded hover:bg-slate-700/60 transition-colors disabled:opacity-40">
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => onOpenChange(false)} className="p-1 -m-1 rounded hover:bg-slate-700/60 transition-colors">
              <X className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          <SectionHeader
            icon={<TrendingDown className="w-3.5 h-3.5 text-red-400" />}
            label="Top 10 Losses"
            open={openSections.losses}
            onToggle={() => toggleSection('losses')}
          />
          {openSections.losses && (
            losers.length > 0
              ? losers.map(d => <MoverRow key={d.name} d={d} expanded={expandedTicker === d.name} onToggle={() => toggleTicker(d.name)} />)
              : <p className="text-xs text-slate-600 px-3 py-3">{loading ? 'Loading…' : 'No losses'}</p>
          )}

          <SectionHeader
            icon={<Trophy className="w-3.5 h-3.5 text-blue-400" />}
            label="Top 10 Gains"
            open={openSections.gains}
            onToggle={() => toggleSection('gains')}
          />
          {openSections.gains && (
            gainers.length > 0
              ? gainers.map(d => <MoverRow key={d.name} d={d} expanded={expandedTicker === d.name} onToggle={() => toggleTicker(d.name)} />)
              : <p className="text-xs text-slate-600 px-3 py-3">{loading ? 'Loading…' : 'No gainers'}</p>
          )}

          <SectionHeader
            icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
            label="Lowest Gains"
            open={openSections.lowestGains}
            onToggle={() => toggleSection('lowestGains')}
          />
          {openSections.lowestGains && (
            lowestGains.length > 0
              ? lowestGains.map(lot => (
                  <LotMoverRow key={lot.id} lot={lot} expanded={expandedTicker === lot.ticker} onToggle={() => toggleTicker(lot.ticker)} />
                ))
              : <p className="text-xs text-slate-600 px-3 py-3">No gaining lots</p>
          )}
        </div>
      </div>
      )}

      <TickerLotsModal stockPos={stockPos} portfolioTotal={portfolio?.total_value} onClose={() => setExpandedTicker(null)} />
    </div>
  );
}
