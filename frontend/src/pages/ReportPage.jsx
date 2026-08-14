import { useState, useMemo, useRef, useEffect } from 'react';
import { Copy, Check, ChevronDown, ChevronRight, List, AlignLeft, X as XIcon, DollarSign, Loader2 } from 'lucide-react';
import { api } from '../services/api';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
function term(dateStr) {
  return Date.now() - new Date(dateStr).getTime() >= ONE_YEAR_MS ? 'Long-Term' : 'Short-Term';
}
function fmt2(n) { return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtSign(n) { return (n >= 0 ? '+' : '') + '$' + fmt2(Math.abs(n)); }
function today() { return new Date().toISOString().split('T')[0]; }

// ── Ticker selector ────────────────────────────────────────────────────────────

function TickerSelector({ tickers, selected, onChange, lossLotTickers, gainLotTickers, tickerStats }) {
  const [viewFilter, setViewFilter] = useState('all');

  const handleLoss = () => { setViewFilter('loss'); onChange(new Set(lossLotTickers)); };
  const handleGain = () => { setViewFilter('gain'); onChange(new Set(gainLotTickers)); };
  const handleAll  = () => { setViewFilter('all');  onChange(new Set(tickers)); };
  const handleNone = () => { onChange(new Set()); };

  const visibleTickers = useMemo(() => {
    if (viewFilter === 'loss')
      return [...lossLotTickers].sort((a, b) => (tickerStats[a]?.losses ?? 0) - (tickerStats[b]?.losses ?? 0));
    if (viewFilter === 'gain')
      return [...gainLotTickers].sort((a, b) => (tickerStats[b]?.gains ?? 0) - (tickerStats[a]?.gains ?? 0));
    return [...tickers].sort((a, b) => (tickerStats[b]?.net ?? 0) - (tickerStats[a]?.net ?? 0));
  }, [viewFilter, tickers, lossLotTickers, gainLotTickers, tickerStats]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Select Tickers</h2>
        <div className="flex items-center gap-2">
          <button onClick={handleLoss} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${viewFilter === 'loss' ? 'bg-red-600 text-white border-red-600' : 'text-red-500 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800/60 dark:hover:bg-red-950/40'}`}>
            Loss Lots <span className={`text-[10px] ${viewFilter === 'loss' ? 'text-red-200' : 'text-red-400'}`}>{lossLotTickers.length}</span>
          </button>
          <button onClick={handleGain} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${viewFilter === 'gain' ? 'bg-emerald-600 text-white border-emerald-600' : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800/60 dark:hover:bg-emerald-950/40'}`}>
            Gain Lots <span className={`text-[10px] ${viewFilter === 'gain' ? 'text-emerald-200' : 'text-emerald-500'}`}>{gainLotTickers.length}</span>
          </button>
          <div className="w-px h-3 bg-slate-200 dark:bg-slate-700" />
          <button onClick={handleAll}  className="text-xs text-blue-600 hover:underline">All</button>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <button onClick={handleNone} className="text-xs text-slate-400 dark:text-slate-500 hover:underline">None</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {visibleTickers.map((t, idx) => {
          const on = selected.has(t);
          return (
            <button key={t} onClick={() => { const s = new Set(selected); on ? s.delete(t) : s.add(t); onChange(s); }}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                on
                  ? viewFilter === 'loss' ? 'bg-red-600 text-white border-red-600' : viewFilter === 'gain' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-800 dark:bg-slate-600 text-white border-slate-800 dark:border-slate-600'
                  : viewFilter === 'loss' ? 'bg-white text-red-500 border-red-200 hover:border-red-400 dark:bg-slate-800 dark:text-red-400 dark:border-red-800/60 dark:hover:border-red-600' : viewFilter === 'gain' ? 'bg-white text-emerald-600 border-emerald-200 hover:border-emerald-400 dark:bg-slate-800 dark:text-emerald-400 dark:border-emerald-800/60 dark:hover:border-emerald-600' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:border-slate-500'
              }`}>
              <span className={`text-[9px] font-bold tabular-nums leading-none ${on ? 'opacity-60' : 'opacity-40'}`}>{idx + 1}</span>
              {t}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
        {selected.size} of {visibleTickers.length} selected
        {viewFilter === 'loss' && <span className="ml-2 text-red-400">· #1 = biggest loss</span>}
        {viewFilter === 'gain' && <span className="ml-2 text-emerald-600 dark:text-emerald-400">· #1 = biggest gain</span>}
        {viewFilter === 'all'  && <span className="ml-2">· #1 = best net gain/loss</span>}
      </p>
    </div>
  );
}

// ── Summary cards ──────────────────────────────────────────────────────────────

function SummaryCards({ data }) {
  const { totalValue, totalCost, totalGainLoss, totalGains, totalLosses, totalGainProceeds, totalLossProceeds } = data;
  const pct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
  const cards = [
    { label: 'Total Value',       value: `$${fmt2(totalValue)}`,                                                  color: 'text-slate-900 dark:text-slate-100' },
    { label: 'Cost Basis',        value: `$${fmt2(totalCost)}`,                                                   color: 'text-slate-900 dark:text-slate-100' },
    { label: 'Net Gain/Loss',     value: `${fmtSign(totalGainLoss)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`, color: totalGainLoss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400' },
    { label: 'Gain Lot Proceeds', value: `$${fmt2(totalGainProceeds)}`,                                           color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Loss Lot Proceeds', value: `$${fmt2(totalLossProceeds)}`,                                           color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Total Gains',       value: `+$${fmt2(totalGains)}`,                                                 color: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Total Losses',      value: `-$${fmt2(Math.abs(totalLosses))}`,                                      color: 'text-red-500 dark:text-red-400' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm px-4 py-3">
          <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">{c.label}</div>
          <div className={`text-sm font-bold tabular-nums ${c.color}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Sell dialog ────────────────────────────────────────────────────────────────

function SellDialog({ selectedLotObjects, onConfirm, onCancel }) {
  const [priceMode, setPriceMode] = useState('market');
  const [customPrice, setCustomPrice] = useState('');
  const [sellDate, setSellDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Group by ticker for preview
  const byTicker = useMemo(() => {
    const map = {};
    for (const l of selectedLotObjects) {
      if (!map[l.ticker]) map[l.ticker] = { lots: [], currentPrice: l.current_price };
      map[l.ticker].lots.push(l);
    }
    return map;
  }, [selectedLotObjects]);

  const multiTicker = Object.keys(byTicker).length > 1;

  const preview = useMemo(() => {
    let totalProceeds = 0, totalCost = 0, totalShares = 0;
    for (const l of selectedLotObjects) {
      const sp = priceMode === 'market' ? l.current_price : parseFloat(customPrice) || 0;
      totalProceeds += sp * l.quantity;
      totalCost += l.purchase_price * l.quantity;
      totalShares += l.quantity;
    }
    return { totalProceeds, totalCost, totalGL: totalProceeds - totalCost, totalShares };
  }, [selectedLotObjects, priceMode, customPrice]);

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      const lots = selectedLotObjects.map(l => ({
        lot_id: l.id,
        sell_price: priceMode === 'market' ? l.current_price : parseFloat(customPrice),
      }));
      await onConfirm(lots, sellDate, notes || null);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const pos = preview.totalGL >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={onCancel}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Sell {selectedLotObjects.length} Lot{selectedLotObjects.length !== 1 ? 's' : ''}</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{Object.keys(byTicker).join(', ')}</p>
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 dark:text-slate-500 transition-colors">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Price mode */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Sell Price</p>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setPriceMode('market')}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-colors ${priceMode === 'market' ? 'bg-slate-800 dark:bg-slate-600 text-white border-slate-800 dark:border-slate-600' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:border-slate-500'}`}
              >
                Market Price
              </button>
              <button
                onClick={() => setPriceMode('custom')}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-colors ${priceMode === 'custom' ? 'bg-slate-800 dark:bg-slate-600 text-white border-slate-800 dark:border-slate-600' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:border-slate-500'}`}
              >
                Custom Price
              </button>
            </div>

            {priceMode === 'market' ? (
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 space-y-1.5">
                {Object.entries(byTicker).map(([ticker, { lots, currentPrice }]) => (
                  <div key={ticker} className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{ticker}</span>
                    <span className="tabular-nums text-slate-600 dark:text-slate-300">${fmt2(currentPrice)} × {lots.reduce((s, l) => s + l.quantity, 0).toFixed(2)} shares</span>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {multiTicker && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">⚠ This price applies to all selected lots across different tickers.</p>
                )}
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Enter sell price…"
                  value={customPrice}
                  onChange={e => setCustomPrice(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* Sell date */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Sell Date</label>
            <input
              type="date"
              value={sellDate}
              onChange={e => setSellDate(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Notes (optional)</label>
            <input
              type="text"
              placeholder="Tax-loss harvest, rebalance…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Preview */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Shares</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">{preview.totalShares.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Proceeds</p>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 tabular-nums">${fmt2(preview.totalProceeds)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Gain/Loss</p>
              <p className={`text-sm font-bold tabular-nums ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                {fmtSign(preview.totalGL)}
              </p>
            </div>
          </div>

          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg dark:bg-red-950/40 dark:border-red-800/60 dark:text-red-400">{error}</div>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onCancel} className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || (priceMode === 'custom' && !(parseFloat(customPrice) > 0))}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Confirm Sale`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Selection summary bar ──────────────────────────────────────────────────────

function StatChip({ label, value, color = 'text-white' }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function SelectionBar({ summary, onClear, onSell }) {
  if (!summary) return null;
  const pct = summary.cost > 0 ? (summary.gainLoss / summary.cost) * 100 : 0;
  const pos = summary.gainLoss >= 0;
  return (
    <div className="sticky bottom-4 z-30 px-2">
      <div className="bg-slate-900 rounded-xl px-5 py-3 shadow-2xl flex items-center gap-4 flex-wrap border border-slate-700">
        <span className="text-xs font-bold text-white shrink-0">{summary.count} lot{summary.count !== 1 ? 's' : ''}</span>
        <div className="w-px h-4 bg-slate-700 shrink-0" />
        <StatChip label="Shares"    value={summary.shares.toFixed(2)} />
        <StatChip label="Cost"      value={`$${fmt2(summary.cost)}`} />
        <StatChip label="Proceeds"  value={`$${fmt2(summary.proceeds)}`} color="text-blue-400" />
        <StatChip label="Gain/Loss" value={`${fmtSign(summary.gainLoss)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`} color={pos ? 'text-emerald-400' : 'text-red-400'} />
        <div className="w-px h-4 bg-slate-700 shrink-0" />
        <StatChip label="LT" value={summary.ltShares.toFixed(2)} color="text-emerald-400" />
        <StatChip label="ST" value={summary.stShares.toFixed(2)} color="text-amber-400" />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            onClick={onSell}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            <DollarSign className="w-3.5 h-3.5" /> Sell Lots
          </button>
          <button onClick={onClear} className="flex items-center gap-1 text-slate-400 hover:text-white text-xs transition-colors px-1">
            <XIcon className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lot group ──────────────────────────────────────────────────────────────────

function LotGroup({ ticker, lots, avgCostBasis, currentPrice, onTickerClick, rank,
  tickerGains, tickerLosses, tickerShares, lotShares, lotProceeds,
  selectedLots, onLotToggle, onGroupToggle }) {

  const [open, setOpen] = useState(false);
  const total = lots.reduce((s, l) => s + l.gain_loss, 0);
  const pos = total >= 0;

  const allSelected  = lots.length > 0 && lots.every(l => selectedLots.has(l.id));
  const someSelected = lots.some(l => selectedLots.has(l.id));
  const cbRef = useRef(null);
  useEffect(() => {
    if (cbRef.current) cbRef.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <div
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-700 transition-colors cursor-pointer select-none"
      >
        <input ref={cbRef} type="checkbox" checked={allSelected}
          onChange={() => onGroupToggle(lots.map(l => l.id), !allSelected)}
          onClick={e => e.stopPropagation()}
          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 cursor-pointer shrink-0 accent-blue-600"
        />
        {open ? <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />}
        {rank != null && <span className="text-xs font-bold text-slate-400 dark:text-slate-500 tabular-nums w-5 text-right shrink-0">#{rank}</span>}
        <button onClick={e => { e.stopPropagation(); onTickerClick?.(ticker); }}
          className="font-bold text-slate-800 dark:text-slate-100 hover:text-blue-600 transition-colors text-sm shrink-0">
          {ticker}
        </button>
        <span className="text-xs text-slate-500 dark:text-slate-400">Avg: <span className="font-semibold text-slate-700 dark:text-slate-200">${fmt2(avgCostBasis)}</span></span>
        <span className="text-xs text-slate-500 dark:text-slate-400">Cur: <span className="font-semibold text-slate-700 dark:text-slate-200">${fmt2(currentPrice)}</span></span>
        {lotShares != null && <span className="text-xs text-slate-500 dark:text-slate-400">Lot Shares: <span className="font-semibold text-slate-700 dark:text-slate-200">{lotShares.toFixed(2)}</span></span>}
        {tickerShares != null && <span className="text-xs text-slate-500 dark:text-slate-400">Total: <span className="font-semibold text-slate-700 dark:text-slate-200">{tickerShares.toFixed(2)}</span></span>}
        {lotProceeds != null && <span className="text-xs text-slate-500 dark:text-slate-400">Proceeds: <span className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums">${fmt2(lotProceeds)}</span></span>}
        {tickerGains != null && tickerGains > 0 && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">+${fmt2(tickerGains)}</span>}
        {tickerLosses != null && tickerLosses < 0 && <span className="text-xs text-red-500 dark:text-red-400 font-semibold tabular-nums">-${fmt2(Math.abs(tickerLosses))}</span>}
        <span className="text-xs text-slate-400 dark:text-slate-500">{lots.length} lot{lots.length !== 1 ? 's' : ''}</span>
        <span className={`ml-auto text-sm font-bold tabular-nums shrink-0 ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{fmtSign(total)}</span>
      </div>

      {open && (
        <table className="w-full text-sm">
          <thead className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
            <tr className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
              <th className="px-3 py-2 w-8" />
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Term</th>
              <th className="px-4 py-2 text-right">Shares</th>
              <th className="px-4 py-2 text-right">Buy Price</th>
              <th className="px-4 py-2 text-right">Cost Basis</th>
              <th className="px-4 py-2 text-right">Current</th>
              <th className="px-4 py-2 text-right">Proceeds</th>
              <th className="px-4 py-2 text-right">Gain/Loss</th>
              <th className="px-4 py-2 text-right">Return</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {lots.map(lot => {
              const t = term(lot.purchase_date);
              const lpos = lot.gain_loss >= 0;
              const checked = selectedLots.has(lot.id);
              return (
                <tr key={lot.id} className={`transition-colors ${checked ? 'bg-blue-50/60 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
                  <td className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked={checked} onChange={() => onLotToggle(lot.id)}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 cursor-pointer accent-blue-600" />
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-700 dark:text-slate-200">{lot.purchase_date}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${t === 'Long-Term' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60'}`}>{t}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{lot.quantity.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">${fmt2(lot.purchase_price)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">${fmt2(lot.purchase_price * lot.quantity)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">${fmt2(lot.current_price)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-blue-600 dark:text-blue-400">${fmt2(lot.current_value)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${lpos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{fmtSign(lot.gain_loss)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${lpos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {lot.gain_loss_pct >= 0 ? '+' : ''}{lot.gain_loss_pct.toFixed(2)}%
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

function LotSection({ title, color, tickerGroups, onTickerClick, selectedLots, onLotToggle, onGroupToggle }) {
  if (tickerGroups.length === 0) return null;
  const sectionProceeds = tickerGroups.reduce((s, g) => s + g.lotProceeds, 0);
  const sectionGainLoss = tickerGroups.reduce((s, g) => s + g.lots.reduce((gs, l) => gs + l.gain_loss, 0), 0);
  const pos = sectionGainLoss >= 0;
  return (
    <div>
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <h3 className={`text-sm font-bold uppercase tracking-wider ${color}`}>{title}</h3>
        <span className="text-xs text-slate-400 dark:text-slate-500">Proceeds: <span className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums">${fmt2(sectionProceeds)}</span></span>
        <span className={`text-xs font-semibold tabular-nums ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{fmtSign(sectionGainLoss)}</span>
      </div>
      <div className="space-y-2">
        {tickerGroups.map((g, idx) => (
          <LotGroup key={g.ticker} {...g} rank={idx + 1} onTickerClick={onTickerClick}
            selectedLots={selectedLots} onLotToggle={onLotToggle} onGroupToggle={onGroupToggle} />
        ))}
      </div>
    </div>
  );
}

// ── Copy helpers ───────────────────────────────────────────────────────────────

function buildCopyText(summary, gainGroups, lossGroups) {
  const lines = [];
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const pct = summary.totalCost > 0 ? (summary.totalGainLoss / summary.totalCost) * 100 : 0;
  lines.push(`# Portfolio Report — ${date}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  lines.push(`| **Total Value** | $${fmt2(summary.totalValue)} |`);
  lines.push(`| **Cost Basis** | $${fmt2(summary.totalCost)} |`);
  lines.push(`| **Net Gain/Loss** | ${fmtSign(summary.totalGainLoss)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%) |`);
  lines.push(`| **Total Gains** | +$${fmt2(summary.totalGains)} |`);
  lines.push(`| **Total Losses** | -$${fmt2(Math.abs(summary.totalLosses))} |`);
  lines.push(`| **Gain Lot Proceeds** | $${fmt2(summary.totalGainProceeds)} |`);
  lines.push(`| **Loss Lot Proceeds** | $${fmt2(summary.totalLossProceeds)} |`);
  const section = (title, groups) => {
    if (!groups.length) return;
    const sProceeds = groups.reduce((s, g) => s + g.lotProceeds, 0);
    const sGainLoss = groups.reduce((s, g) => s + g.lots.reduce((gs, l) => gs + l.gain_loss, 0), 0);
    lines.push(''); lines.push(`## ${title}`);
    lines.push(`> Proceeds: $${fmt2(sProceeds)} · Net: ${fmtSign(sGainLoss)}`);
    for (const g of groups) {
      const total = g.lots.reduce((s, l) => s + l.gain_loss, 0);
      lines.push('');
      lines.push(`### ${g.ticker} — Avg: $${fmt2(g.avgCostBasis)} · Cur: $${fmt2(g.currentPrice)} · Proceeds: $${fmt2(g.lotProceeds)} · **${fmtSign(total)}**`);
      lines.push('');
      lines.push('| Date | Term | Shares | Buy Price | Cost Basis | Current | Proceeds | Gain/Loss | Return |');
      lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
      for (const l of g.lots) {
        const t = term(l.purchase_date);
        const sign = l.gain_loss >= 0 ? '+' : '';
        lines.push(`| ${l.purchase_date} | ${t} | ${l.quantity.toFixed(2)} | $${fmt2(l.purchase_price)} | $${fmt2(l.purchase_price * l.quantity)} | $${fmt2(l.current_price)} | $${fmt2(l.current_value)} | ${sign}$${fmt2(Math.abs(l.gain_loss))} | ${sign}${l.gain_loss_pct.toFixed(2)}% |`);
      }
    }
  };
  section('Gain Lots', gainGroups);
  section('Loss Lots', lossGroups);
  return lines.join('\n');
}

// ── Simple report view ─────────────────────────────────────────────────────────

function SimpleReport({ summary, stocks }) {
  if (stocks.length === 0) return null;
  const { totalValue, totalCost, totalGainLoss } = summary;
  const totalPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm px-5 py-4 flex flex-wrap gap-6">
        <div>
          <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Total Portfolio Value</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">${fmt2(totalValue)}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Cost Basis</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">${fmt2(totalCost)}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Net Gain/Loss</div>
          <div className={`text-2xl font-bold tabular-nums ${totalGainLoss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
            {fmtSign(totalGainLoss)} ({totalPct >= 0 ? '+' : ''}{totalPct.toFixed(2)}%)
          </div>
        </div>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
            <tr className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
              <th className="px-4 py-2.5 text-left">Ticker</th>
              <th className="px-4 py-2.5 text-right">Shares</th>
              <th className="px-4 py-2.5 text-right">Avg Cost</th>
              <th className="px-4 py-2.5 text-right">Current</th>
              <th className="px-4 py-2.5 text-right">Proceeds</th>
              <th className="px-4 py-2.5 text-right">Gains</th>
              <th className="px-4 py-2.5 text-right">Losses</th>
              <th className="px-4 py-2.5 text-right">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {stocks.map(s => {
              const net = s.gains + s.losses;
              return (
                <tr key={s.ticker} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">{s.ticker}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">{s.totalShares.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">${fmt2(s.avgCostBasis)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">${fmt2(s.currentPrice)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-blue-600 dark:text-blue-400">${fmt2(s.totalValue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{s.gains > 0 ? `+$${fmt2(s.gains)}` : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-red-500 dark:text-red-400">{s.losses < 0 ? `-$${fmt2(Math.abs(s.losses))}` : '—'}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-bold ${net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{fmtSign(net)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildSimpleCopyText(summary, stocks) {
  const lines = [];
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const pct = summary.totalCost > 0 ? (summary.totalGainLoss / summary.totalCost) * 100 : 0;
  lines.push(`# Portfolio Report — ${date}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  lines.push(`| **Total Portfolio Value** | $${fmt2(summary.totalValue)} |`);
  lines.push(`| **Cost Basis** | $${fmt2(summary.totalCost)} |`);
  lines.push(`| **Net Gain/Loss** | ${fmtSign(summary.totalGainLoss)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%) |`);
  lines.push('');
  lines.push('## Ticker Summary');
  lines.push('');
  lines.push('| Ticker | Shares | Avg Cost | Current | Proceeds | Gains | Losses | Net |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const s of stocks) {
    const net = s.gains + s.losses;
    lines.push(`| **${s.ticker}** | ${s.totalShares.toFixed(2)} | $${fmt2(s.avgCostBasis)} | $${fmt2(s.currentPrice)} | $${fmt2(s.totalValue)} | ${s.gains > 0 ? `+$${fmt2(s.gains)}` : '—'} | ${s.losses < 0 ? `-$${fmt2(Math.abs(s.losses))}` : '—'} | ${fmtSign(net)} |`);
  }
  return lines.join('\n');
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function ReportPage({ portfolio, onTickerClick, onPortfolioChange }) {
  const allTickers = useMemo(() => (portfolio?.stocks ?? []).map(s => s.ticker).sort(), [portfolio]);

  const lossLotTickers = useMemo(() =>
    (portfolio?.stocks ?? []).filter(s => s.lots.some(l => (l.gain_loss ?? 0) < 0)).map(s => s.ticker).sort(),
    [portfolio]
  );
  const gainLotTickers = useMemo(() =>
    (portfolio?.stocks ?? []).filter(s => s.lots.some(l => (l.gain_loss ?? 0) > 0)).map(s => s.ticker).sort(),
    [portfolio]
  );
  const tickerStats = useMemo(() => {
    const map = {};
    for (const s of portfolio?.stocks ?? []) {
      const losses = s.lots.reduce((sum, l) => (l.gain_loss ?? 0) < 0 ? sum + l.gain_loss : sum, 0);
      const gains  = s.lots.reduce((sum, l) => (l.gain_loss ?? 0) > 0 ? sum + l.gain_loss : sum, 0);
      map[s.ticker] = { losses, gains, net: gains + losses };
    }
    return map;
  }, [portfolio]);

  const [selected, setSelected]           = useState(() => new Set(allTickers));
  const [copied, setCopied]               = useState(false);
  const [view, setView]                   = useState('detailed');
  const [selectedLots, setSelectedLots]   = useState(new Set());
  const [showSellDialog, setShowSellDialog] = useState(false);

  const handleLotToggle = (id) => {
    setSelectedLots(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };
  const handleGroupToggle = (ids, selectAll) => {
    setSelectedLots(prev => { const s = new Set(prev); ids.forEach(id => selectAll ? s.add(id) : s.delete(id)); return s; });
  };

  const { summary, gainGroups, lossGroups, allGroups, simpleStocks } = useMemo(() => {
    const stocks = (portfolio?.stocks ?? []).filter(s => selected.has(s.ticker));
    let totalValue = 0, totalCost = 0, totalGains = 0, totalLosses = 0;
    const gainGroups = [], lossGroups = [];

    for (const stock of stocks) {
      totalValue += stock.total_value;
      const gainLots = stock.lots.filter(l => (l.gain_loss ?? 0) > 0);
      const lossLots = stock.lots.filter(l => (l.gain_loss ?? 0) < 0);
      const allLots  = stock.lots;
      for (const l of allLots) {
        totalCost += l.purchase_price * l.quantity;
        if (l.gain_loss > 0) totalGains  += l.gain_loss;
        if (l.gain_loss < 0) totalLosses += l.gain_loss;
      }
      const avgBasis = (lots) => {
        const totS = lots.reduce((s, l) => s + l.quantity, 0);
        const totC = lots.reduce((s, l) => s + l.purchase_price * l.quantity, 0);
        return totS > 0 ? totC / totS : 0;
      };
      const tickerGains      = gainLots.reduce((s, l) => s + l.gain_loss, 0);
      const tickerLosses     = lossLots.reduce((s, l) => s + l.gain_loss, 0);
      const tickerShares     = allLots.reduce((s, l) => s + l.quantity, 0);
      const gainLotShares    = gainLots.reduce((s, l) => s + l.quantity, 0);
      const lossLotShares    = lossLots.reduce((s, l) => s + l.quantity, 0);
      const gainLotProceeds  = gainLots.reduce((s, l) => s + l.current_value, 0);
      const lossLotProceeds  = lossLots.reduce((s, l) => s + l.current_value, 0);
      // Attach ticker to each lot for use in sell dialog
      const tag = (lots) => lots.map(l => ({ ...l, ticker: stock.ticker }));
      if (gainLots.length) gainGroups.push({ ticker: stock.ticker, lots: tag(gainLots), avgCostBasis: avgBasis(gainLots), currentPrice: stock.current_price, tickerGains, tickerLosses, tickerShares, lotShares: gainLotShares, lotProceeds: gainLotProceeds });
      if (lossLots.length) lossGroups.push({ ticker: stock.ticker, lots: tag(lossLots), avgCostBasis: avgBasis(lossLots), currentPrice: stock.current_price, tickerGains, tickerLosses, tickerShares, lotShares: lossLotShares, lotProceeds: lossLotProceeds });
    }
    gainGroups.sort((a, b) => b.lots.reduce((s, l) => s + l.gain_loss, 0) - a.lots.reduce((s, l) => s + l.gain_loss, 0));
    lossGroups.sort((a, b) => a.lots.reduce((s, l) => s + l.gain_loss, 0) - b.lots.reduce((s, l) => s + l.gain_loss, 0));
    const totalGainLoss     = totalValue - totalCost;
    const totalGainProceeds = gainGroups.reduce((s, g) => s + g.lotProceeds, 0);
    const totalLossProceeds = lossGroups.reduce((s, g) => s + g.lotProceeds, 0);
    const simpleStocks = stocks.map(s => {
      const totalShares = s.lots.reduce((sum, l) => sum + l.quantity, 0);
      const totalCostT  = s.lots.reduce((sum, l) => sum + l.purchase_price * l.quantity, 0);
      const gains  = s.lots.filter(l => (l.gain_loss ?? 0) > 0).reduce((sum, l) => sum + l.gain_loss, 0);
      const losses = s.lots.filter(l => (l.gain_loss ?? 0) < 0).reduce((sum, l) => sum + l.gain_loss, 0);
      return { ticker: s.ticker, totalShares, avgCostBasis: totalShares > 0 ? totalCostT / totalShares : 0, currentPrice: s.current_price, totalValue: s.total_value, gains, losses };
    }).sort((a, b) => a.ticker.localeCompare(b.ticker));
    // Gain and loss groups are already sorted (biggest gain first, biggest
    // loss first respectively), so concatenating gives a single "biggest
    // movers each direction" ordering with no extra sort needed.
    const allGroups = [...gainGroups, ...lossGroups];
    return { summary: { totalValue, totalCost, totalGainLoss, totalGains, totalLosses, totalGainProceeds, totalLossProceeds }, gainGroups, lossGroups, allGroups, simpleStocks };
  }, [portfolio, selected]);

  // Flat lot map for selection summary + sell dialog
  const allLotsMap = useMemo(() => {
    const map = {};
    for (const g of [...gainGroups, ...lossGroups]) for (const l of g.lots) map[l.id] = l;
    return map;
  }, [gainGroups, lossGroups]);

  const selectionSummary = useMemo(() => {
    if (selectedLots.size === 0) return null;
    let shares = 0, cost = 0, proceeds = 0, gainLoss = 0, ltShares = 0, stShares = 0;
    for (const id of selectedLots) {
      const l = allLotsMap[id];
      if (!l) continue;
      shares += l.quantity; cost += l.purchase_price * l.quantity;
      proceeds += l.current_value; gainLoss += l.gain_loss;
      if (term(l.purchase_date) === 'Long-Term') ltShares += l.quantity; else stShares += l.quantity;
    }
    return { count: selectedLots.size, shares, cost, proceeds, gainLoss, ltShares, stShares };
  }, [selectedLots, allLotsMap]);

  const selectedLotObjects = useMemo(() =>
    [...selectedLots].map(id => allLotsMap[id]).filter(Boolean),
    [selectedLots, allLotsMap]
  );

  const handleSellConfirm = async (lots, sellDate, notes) => {
    await api.sellLots(lots, sellDate, notes);
    setSelectedLots(new Set());
    setShowSellDialog(false);
    onPortfolioChange?.();
  };

  const handleCopy = () => {
    const text = view === 'simple' ? buildSimpleCopyText(summary, simpleStocks) : buildCopyText(summary, gainGroups, lossGroups);
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  if (!portfolio?.stocks?.length) {
    return <div className="p-10 text-center text-slate-400 dark:text-slate-500 text-sm">No portfolio data available.</div>;
  }

  const toggleBtn = (v, icon, label) => (
    <button onClick={() => setView(v)}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${v === view ? 'bg-slate-800 dark:bg-slate-600 text-white border-slate-800 dark:border-slate-600' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:border-slate-500'}`}>
      {icon}{label}
    </button>
  );

  return (
    <div className="space-y-5 pb-24">
      {/* Sell dialog */}
      {showSellDialog && (
        <SellDialog
          selectedLotObjects={selectedLotObjects}
          onConfirm={handleSellConfirm}
          onCancel={() => setShowSellDialog(false)}
        />
      )}

      {/* Ticker selector + controls */}
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <TickerSelector tickers={allTickers} selected={selected} onChange={setSelected}
            lossLotTickers={lossLotTickers} gainLotTickers={gainLotTickers} tickerStats={tickerStats} />
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <div className="flex gap-2">
            {toggleBtn('simple',   <AlignLeft className="w-4 h-4" />, 'Simple')}
            {toggleBtn('detailed', <List      className="w-4 h-4" />, 'Detailed')}
          </div>
          <button onClick={handleCopy} disabled={selected.size === 0}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border shadow-sm transition-all disabled:opacity-40 ${copied ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700/50'}`}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Report'}
          </button>
        </div>
      </div>

      {selected.size === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500 text-sm">Select at least one ticker to generate a report.</div>
      ) : view === 'simple' ? (
        <SimpleReport summary={summary} stocks={simpleStocks} />
      ) : (
        <>
          <SummaryCards data={summary} />
          <LotSection title="All Lots" color="text-slate-500 dark:text-slate-400" tickerGroups={allGroups} onTickerClick={onTickerClick}
            selectedLots={selectedLots} onLotToggle={handleLotToggle} onGroupToggle={handleGroupToggle} />
        </>
      )}

      <SelectionBar
        summary={selectionSummary}
        onClear={() => setSelectedLots(new Set())}
        onSell={() => setShowSellDialog(true)}
      />
    </div>
  );
}
