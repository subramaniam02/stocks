import { useState, useMemo, useRef, useEffect, Fragment } from 'react';
import {
  ChevronDown, ChevronRight, Trash2,
  ArrowUp, ArrowDown, ArrowUpDown,
  TrendingDown, TrendingUp, ChevronsUpDown,
  DollarSign, X as XIcon, Loader2, MoveDiagonal2,
  Calculator, Percent, ArrowRight,
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import { getTaxRates, setTaxRates } from '../utils/taxSettings';

// ── helpers ──────────────────────────────────────────────────────────────────

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function isLongTerm(purchaseDateStr) {
  return Date.now() - new Date(purchaseDateStr).getTime() >= ONE_YEAR_MS;
}
function fmt2(n) { return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtSign(n) { return (n >= 0 ? '+' : '') + '$' + fmt2(Math.abs(n)); }
function todayStr() { return new Date().toISOString().split('T')[0]; }

function TermBadge({ purchaseDate, size = 'sm' }) {
  const lt = isLongTerm(purchaseDate);
  const sz = size === 'xs' ? 'text-[9px]' : 'text-[10px]';
  const col = lt
    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60'
    : 'bg-amber-50  text-amber-700  border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60';
  return <span className={`font-semibold rounded px-1.5 py-0.5 whitespace-nowrap ${sz} ${col}`}>{lt ? 'Long-Term' : 'Short-Term'}</span>;
}

function PeriodReturn({ value }) {
  if (value == null) return <span className="text-gray-300 dark:text-slate-600">—</span>;
  const pos = value >= 0;
  return <span className={pos ? 'text-green-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{pos ? '+' : ''}{value.toFixed(2)}%</span>;
}

function SortIcon({ col, sortKey, sortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-300 dark:text-slate-600" />;
  return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-blue-500" /> : <ArrowDown className="w-3 h-3 ml-1 text-blue-500" />;
}

function computeSelectionSummary(lotsList, selectedLots) {
  let shares = 0, cost = 0, proceeds = 0, gainLoss = 0, ltShares = 0, stShares = 0, count = 0;
  for (const l of lotsList) {
    if (!selectedLots.has(l.id)) continue;
    count++;
    shares += l.quantity; cost += l.purchase_price * l.quantity;
    proceeds += l.current_value; gainLoss += l.gain_loss;
    if (isLongTerm(l.purchase_date)) ltShares += l.quantity; else stShares += l.quantity;
  }
  return count ? { count, shares, cost, proceeds, gainLoss, ltShares, stShares } : null;
}

function useSortState(defaultKey = 'ticker') {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState('asc');
  const handleSort = (key) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  return { sortKey, sortDir, handleSort };
}

// ── Sell dialog ───────────────────────────────────────────────────────────────

function SellDialog({ selectedLotObjects, onConfirm, onCancel }) {
  const [priceMode, setPriceMode]   = useState('market');
  const [customPrice, setCustomPrice] = useState('');
  const [sellDate, setSellDate]     = useState(todayStr());
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState(null);

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
    setSaving(true); setError(null);
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
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Sell Price</p>
            <div className="flex gap-2 mb-3">
              {['market', 'custom'].map(m => (
                <button key={m} onClick={() => setPriceMode(m)}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-colors ${priceMode === m ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-600 dark:border-slate-600' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:border-slate-500'}`}>
                  {m === 'market' ? 'Market Price' : 'Custom Price'}
                </button>
              ))}
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
                {multiTicker && <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">⚠ This price applies to all selected lots across different tickers.</p>}
                <input type="number" step="0.01" min="0.01" placeholder="Enter sell price…"
                  value={customPrice} onChange={e => setCustomPrice(e.target.value)} autoFocus
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Sell Date</label>
            <input type="date" value={sellDate} onChange={e => setSellDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Notes (optional)</label>
            <input type="text" placeholder="Tax-loss harvest, rebalance…" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder-slate-500" />
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 grid grid-cols-3 gap-3">
            <div><p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Shares</p><p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">{preview.totalShares.toFixed(2)}</p></div>
            <div><p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Proceeds</p><p className="text-sm font-bold text-blue-600 tabular-nums">${fmt2(preview.totalProceeds)}</p></div>
            <div><p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Gain/Loss</p>
              <p className={`text-sm font-bold tabular-nums ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{fmtSign(preview.totalGL)}</p>
            </div>
          </div>

          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg dark:bg-red-950/40 dark:border-red-800/60 dark:text-red-400">{error}</div>}
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onCancel} className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50">Cancel</button>
          <button onClick={handleConfirm} disabled={saving || (priceMode === 'custom' && !(parseFloat(customPrice) > 0))}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Confirm Sale'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Selection bar ─────────────────────────────────────────────────────────────

function StatChip({ label, value, color = 'text-white' }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function SelectionBar({ summary, onClear, onSell, positionPct }) {
  if (!summary) {
    return (
      <div className="sticky bottom-0 z-30 bg-slate-900 border-t border-slate-700 px-5 py-3 flex items-center">
        <span className="text-xs text-slate-400">Check the boxes below to select lots — you'll see totals and a sell option here.</span>
      </div>
    );
  }
  const pct = summary.cost > 0 ? (summary.gainLoss / summary.cost) * 100 : 0;
  const pos = summary.gainLoss >= 0;
  return (
    <div className="sticky bottom-0 z-30 bg-slate-900 border-t border-slate-700 px-5 py-3 flex items-center gap-4 flex-wrap">
      <span className="text-xs font-bold text-white shrink-0">{summary.count} lot{summary.count !== 1 ? 's' : ''} selected</span>
      <div className="w-px h-4 bg-slate-700 shrink-0" />
      <StatChip label="Shares"    value={summary.shares.toFixed(2)} />
      <StatChip label="Cost"      value={`$${fmt2(summary.cost)}`} />
      <StatChip label="Proceeds"  value={`$${fmt2(summary.proceeds)}`} color="text-blue-400" />
      <StatChip label="Gain/Loss" value={`${fmtSign(summary.gainLoss)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`} color={pos ? 'text-emerald-400' : 'text-red-400'} />
      <div className="w-px h-4 bg-slate-700 shrink-0" />
      <StatChip label="LT" value={summary.ltShares.toFixed(2)} color="text-emerald-400" />
      <StatChip label="ST" value={summary.stShares.toFixed(2)} color="text-amber-400" />
      {positionPct != null && (
        <>
          <div className="w-px h-4 bg-slate-700 shrink-0" />
          <StatChip label="% of Position" value={`${positionPct.toFixed(1)}%`} color="text-sky-400" />
        </>
      )}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <button onClick={onSell} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
          <DollarSign className="w-3.5 h-3.5" /> Sell Lots
        </button>
        <button onClick={onClear} className="flex items-center gap-1 text-slate-400 hover:text-white text-xs transition-colors px-1">
          <XIcon className="w-3.5 h-3.5" /> Clear
        </button>
      </div>
    </div>
  );
}

// ── Selection side panel (sell analysis drawer) ───────────────────────────────

function RateField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-[10px] text-slate-400 mb-1">{label}</label>
      <div className="relative">
        <input type="number" step="0.1" min="0" max="100" value={value}
          onChange={e => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-2.5 pr-6 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">%</span>
      </div>
    </div>
  );
}

function SelectionSidePanel({ selectedLotObjects, summary, portfolio, onClear, onSell }) {
  const [rates, setRates] = useState(() => getTaxRates());
  useEffect(() => { setTaxRates(rates); }, [rates]);
  const updateRate = (key) => (val) => setRates(r => ({ ...r, [key]: val }));

  const open = !!summary;

  // Keep the last non-empty selection around so the panel content doesn't
  // collapse to zero mid-way through the slide-out transition.
  const [lastSummary, setLastSummary] = useState(summary);
  const [lastLots, setLastLots] = useState(selectedLotObjects);
  useEffect(() => {
    if (summary) { setLastSummary(summary); setLastLots(selectedLotObjects); }
  }, [summary, selectedLotObjects]);

  const displaySummary = summary ?? lastSummary;
  const displayLots = summary ? selectedLotObjects : lastLots;

  const perTicker = useMemo(() => {
    const map = {};
    for (const l of displayLots) {
      if (!map[l.ticker]) map[l.ticker] = { proceeds: 0 };
      map[l.ticker].proceeds += l.current_value;
    }
    return map;
  }, [displayLots]);

  const allocation = useMemo(() => {
    if (!portfolio?.total_value || !displaySummary) return [];
    const afterTotal = portfolio.total_value - displaySummary.proceeds;
    return Object.entries(perTicker).map(([ticker, { proceeds }]) => {
      const stock = portfolio.stocks.find(s => s.ticker === ticker);
      if (!stock) return null;
      const before = (stock.total_value / portfolio.total_value) * 100;
      const afterValue = Math.max(0, stock.total_value - proceeds);
      const after = afterTotal > 0 ? (afterValue / afterTotal) * 100 : 0;
      return { ticker, before, after };
    }).filter(Boolean).sort((a, b) => b.before - a.before);
  }, [perTicker, portfolio, displaySummary]);

  const taxBreakdown = useMemo(() => {
    let stGains = 0, stLosses = 0, ltGains = 0, ltLosses = 0;
    for (const l of displayLots) {
      const lt = isLongTerm(l.purchase_date);
      if (l.gain_loss >= 0) { if (lt) ltGains += l.gain_loss; else stGains += l.gain_loss; }
      else                  { if (lt) ltLosses += l.gain_loss; else stLosses += l.gain_loss; }
    }
    const stNet = stGains + stLosses, ltNet = ltGains + ltLosses;
    let taxableST = 0, taxableLT = 0;
    if (stNet > 0 && ltNet > 0) { taxableST = stNet; taxableLT = ltNet; }
    else if (stNet > 0) { taxableST = Math.max(0, stNet + ltNet); }
    else if (ltNet > 0) { taxableLT = Math.max(0, stNet + ltNet); }
    return { taxableST, taxableLT };
  }, [displayLots]);

  const fedOrdinary = Number(rates.fedOrdinaryPct) || 0;
  const fedCapGains = Number(rates.fedCapGainsPct) || 0;
  const state = Number(rates.statePct) || 0;
  const stTax = taxBreakdown.taxableST * (fedOrdinary + state) / 100;
  const ltTax = taxBreakdown.taxableLT * (fedCapGains + state) / 100;
  const totalTax = stTax + ltTax;

  if (!displaySummary) return null;

  return (
    <div className={`shrink-0 overflow-hidden bg-slate-900 transition-all duration-200 ease-out ${open ? 'w-full sm:w-96 border-t sm:border-t-0 sm:border-l border-slate-700' : 'w-0 border-0'}`}>
    <div className="w-full sm:w-96 h-full flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
        <div>
          <h2 className="text-sm font-bold text-white">{displaySummary.count} Lot{displaySummary.count !== 1 ? 's' : ''} Selected</h2>
          <p className="text-xs text-slate-400 mt-0.5">{Object.keys(perTicker).join(', ')}</p>
        </div>
        <button onClick={onClear} className="p-1.5 -m-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Overview */}
        <div className="grid grid-cols-2 gap-3">
          <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Shares</p><p className="text-sm font-semibold text-white tabular-nums">{displaySummary.shares.toFixed(2)}</p></div>
          <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Cost</p><p className="text-sm font-semibold text-white tabular-nums">${fmt2(displaySummary.cost)}</p></div>
          <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Proceeds</p><p className="text-sm font-semibold text-blue-400 tabular-nums">${fmt2(displaySummary.proceeds)}</p></div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Gain/Loss</p>
            <p className={`text-sm font-semibold tabular-nums ${displaySummary.gainLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtSign(displaySummary.gainLoss)} ({displaySummary.cost > 0 ? (displaySummary.gainLoss / displaySummary.cost * 100).toFixed(2) : '0.00'}%)
            </p>
          </div>
          <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">LT Shares</p><p className="text-sm font-semibold text-emerald-400 tabular-nums">{displaySummary.ltShares.toFixed(2)}</p></div>
          <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">ST Shares</p><p className="text-sm font-semibold text-amber-400 tabular-nums">{displaySummary.stShares.toFixed(2)}</p></div>
        </div>

        {/* Tax liability */}
        <div className="border-t border-slate-800 pt-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Calculator className="w-3.5 h-3.5 text-slate-500" />
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Est. Tax Liability</h3>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <RateField label="Fed Ordinary" value={rates.fedOrdinaryPct} onChange={updateRate('fedOrdinaryPct')} />
            <RateField label="Fed Cap Gains" value={rates.fedCapGainsPct} onChange={updateRate('fedCapGainsPct')} />
            <RateField label="State" value={rates.statePct} onChange={updateRate('statePct')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Taxable ST / LT</p><p className="text-xs font-semibold text-white tabular-nums">${fmt2(taxBreakdown.taxableST)} / ${fmt2(taxBreakdown.taxableLT)}</p></div>
            <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Est. Tax</p><p className="text-sm font-semibold text-red-400 tabular-nums">${fmt2(totalTax)}</p></div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Net after tax: <span className="text-emerald-400 font-semibold">${fmt2(displaySummary.gainLoss - totalTax)}</span> · rough estimate, not tax advice</p>
        </div>

        {/* Portfolio allocation change */}
        {allocation.length > 0 && (
          <div className="border-t border-slate-800 pt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Percent className="w-3.5 h-3.5 text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Allocation After Sale</h3>
            </div>
            <div className="space-y-2">
              {allocation.map(a => (
                <div key={a.ticker} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">{a.ticker}</span>
                  <span className="flex items-center gap-1.5 tabular-nums">
                    <span className="text-slate-400">{a.before.toFixed(1)}%</span>
                    <ArrowRight className="w-3 h-3 text-slate-600" />
                    <span className={a.after < a.before ? 'text-red-400' : 'text-emerald-400'}>{a.after.toFixed(1)}%</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-slate-700 shrink-0 flex gap-2">
        <button onClick={onSell} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
          <DollarSign className="w-3.5 h-3.5" /> Sell Lots
        </button>
        <button onClick={onClear} className="px-3 py-2.5 text-xs font-semibold rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors">
          Clear
        </button>
      </div>
    </div>
    </div>
  );
}

// ── Shared lot checkbox ───────────────────────────────────────────────────────

function LotCheckbox({ id, selectedLots, onLotToggle }) {
  return (
    <input type="checkbox" checked={selectedLots.has(id)} onChange={() => onLotToggle(id)}
      onClick={e => e.stopPropagation()}
      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 cursor-pointer accent-blue-600 shrink-0" />
  );
}

// ── Ticker (aggregated) view ──────────────────────────────────────────────────

const TICKER_COLS = [
  { key: 'ticker',          label: 'Stock',      align: 'left'  },
  { key: 'total_quantity',  label: 'Shares',     align: 'right' },
  { key: 'average_cost',    label: 'Avg Cost',   align: 'right' },
  { key: 'current_price',   label: 'Current',    align: 'right' },
  { key: 'total_cost',      label: 'Total Cost', align: 'right' },
  { key: 'total_value',     label: 'Value',      align: 'right' },
  { key: 'gain_loss',       label: 'Gain/Loss',  align: 'right' },
  { key: 'gain_loss_pct',   label: 'Return',     align: 'right' },
  { key: 'gain_lot_value',  label: 'Gains',      align: 'right' },
  { key: 'loss_lot_value',  label: 'Losses',     align: 'right' },
];

function TickerView({ stocks, filterMode, onTickerClick, onRefresh, selectedLots, onLotToggle, onGroupToggle, onOpenTickerPopup, expanded, onToggle }) {
  const [deleting, setDeleting] = useState(null);
  const { sortKey, sortDir, handleSort } = useSortState('ticker');

  const sorted = useMemo(() => {
    const base = filterMode
      ? stocks.filter(stock => stock.lots.some(l => filterMode === 'loss' ? l.gain_loss < 0 : l.gain_loss > 0))
      : stocks;
    const arr = base.map(stock => {
      const gainLots = stock.lots.filter(l => l.gain_loss > 0);
      const lossLots = stock.lots.filter(l => l.gain_loss < 0);
      return {
        ...stock,
        gain_lot_value:  gainLots.reduce((s, l) => s + l.gain_loss, 0),
        gain_lot_shares: gainLots.reduce((s, l) => s + l.quantity,  0),
        loss_lot_value:  lossLots.reduce((s, l) => s + l.gain_loss, 0),
        loss_lot_shares: lossLots.reduce((s, l) => s + l.quantity,  0),
      };
    });
    const val = (s) => sortKey === 'total_cost' ? s.average_cost * s.total_quantity : s[sortKey];
    arr.sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av == null) return 1; if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [stocks, filterMode, sortKey, sortDir]);

  const summary = useMemo(() => {
    return sorted.reduce((acc, s) => {
      acc.shares += s.total_quantity;
      acc.cost += s.average_cost * s.total_quantity;
      acc.value += s.total_value;
      acc.gainLoss += s.gain_loss;
      acc.gainLotValue += s.gain_lot_value;
      acc.lossLotValue += s.loss_lot_value;
      return acc;
    }, { shares: 0, cost: 0, value: 0, gainLoss: 0, gainLotValue: 0, lossLotValue: 0 });
  }, [sorted]);
  const summaryPct = summary.cost > 0 ? (summary.gainLoss / summary.cost) * 100 : 0;

  const handleDelete = async (id) => {
    if (!confirm('Delete this lot?')) return;
    setDeleting(id);
    try { await api.deleteHolding(id); onRefresh?.(); }
    catch (e) { alert('Failed to delete: ' + e.message); }
    finally { setDeleting(null); }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
            <th className="px-3 py-2.5 w-8 bg-slate-50 dark:bg-slate-800/60" />
            {TICKER_COLS.map(col => (
              <th key={col.key} onClick={() => handleSort(col.key)}
                className={`px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors bg-slate-50 dark:bg-slate-800/60 ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                <span className="inline-flex items-center">
                  {col.align === 'right' && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                  {col.label}
                  {col.align === 'left'  && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                </span>
              </th>
            ))}
          </tr>
          <tr className="font-semibold [&>td]:bg-slate-100 dark:[&>td]:bg-slate-800 [&>td]:border-b-2 [&>td]:border-slate-300 dark:[&>td]:border-slate-600">
            <td className="px-3 py-2.5" />
            <td className="px-3 py-2.5 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Total ({sorted.length})</td>
            <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{summary.shares.toFixed(2)}</td>
            <td className="px-3 py-2.5 text-right" />
            <td className="px-3 py-2.5 text-right" />
            <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">${fmt2(summary.cost)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums text-slate-800 dark:text-slate-100">${fmt2(summary.value)}</td>
            <td className={`px-3 py-2.5 text-right tabular-nums ${summary.gainLoss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
              {summary.gainLoss >= 0 ? '+' : ''}${fmt2(summary.gainLoss)}
            </td>
            <td className={`px-3 py-2.5 text-right tabular-nums ${summaryPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
              {summaryPct >= 0 ? '+' : ''}{summaryPct.toFixed(2)}%
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
              {summary.gainLotValue > 0 ? `+$${fmt2(summary.gainLotValue)}` : '—'}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums text-red-500 dark:text-red-400">
              {summary.lossLotValue < 0 ? `-$${fmt2(Math.abs(summary.lossLotValue))}` : '—'}
            </td>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {sorted.map(stock => {
            const lotIds = stock.lots.map(l => l.id);
            const allSel = lotIds.length > 0 && lotIds.every(id => selectedLots.has(id));
            const someSel = lotIds.some(id => selectedLots.has(id));
            const stCount = stock.lots.filter(l => !isLongTerm(l.purchase_date)).length;
            const ltCount = stock.lots.filter(l =>  isLongTerm(l.purchase_date)).length;
            const lotsToShow = filterMode
              ? stock.lots.filter(l => filterMode === 'loss' ? l.gain_loss < 0 : l.gain_loss > 0)
              : stock.lots;
            return (
              <Fragment key={stock.ticker}>
                {/* Ticker row */}
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors" onClick={() => onToggle(stock.ticker)}>
                  <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                    <GroupCheckbox ids={lotIds} selectedLots={selectedLots} onGroupToggle={onGroupToggle} allSel={allSel} someSel={someSel} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {expanded.has(stock.ticker) ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />}
                      <div>
                        <button onClick={e => { e.stopPropagation(); onTickerClick?.(stock.ticker); }}
                          className="font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-600 transition-colors">{stock.ticker}</button>
                        {stock.name && <div className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[140px]">{stock.name}</div>}
                      </div>
                      <div className="flex flex-col gap-0.5 ml-1">
                        {stCount > 0 && <span className="text-[9px] font-semibold px-1 py-px rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60">{stCount} ST</span>}
                        {ltCount > 0 && <span className="text-[9px] font-semibold px-1 py-px rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60">{ltCount} LT</span>}
                      </div>
                      <button onClick={e => { e.stopPropagation(); onOpenTickerPopup?.(stock.ticker); }} title="View lots in a sortable, selectable table"
                        className="ml-1 p-1 rounded text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-600 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 transition-colors shrink-0">
                        <MoveDiagonal2 className="w-3.5 h-3.5 -scale-y-100" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{stock.total_quantity.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">${stock.average_cost.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">${stock.current_price.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">${fmt2(stock.average_cost * stock.total_quantity)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">${fmt2(stock.total_value)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${stock.gain_loss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {stock.gain_loss >= 0 ? '+' : ''}${fmt2(stock.gain_loss)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${stock.gain_loss_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {stock.gain_loss_pct >= 0 ? '+' : ''}{stock.gain_loss_pct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {stock.gain_lot_value > 0 ? (
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">+${fmt2(stock.gain_lot_value)}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">{stock.gain_lot_shares.toFixed(2)} sh · {stock.total_quantity ? (stock.gain_lot_shares / stock.total_quantity * 100).toFixed(1) : '0'}%</div>
                      </div>
                    ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {stock.loss_lot_value < 0 ? (
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-red-500 dark:text-red-400 tabular-nums">-${fmt2(Math.abs(stock.loss_lot_value))}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">{stock.loss_lot_shares.toFixed(2)} sh · {stock.total_quantity ? (stock.loss_lot_shares / stock.total_quantity * 100).toFixed(1) : '0'}%</div>
                      </div>
                    ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                  </td>
                </tr>
                {/* Expanded lot rows */}
                {expanded.has(stock.ticker) && lotsToShow.map(lot => (
                  <tr key={lot.id} className={`border-l-2 border-blue-200 dark:border-blue-800/60 transition-colors ${selectedLots.has(lot.id) ? 'bg-blue-50/60 dark:bg-blue-950/40' : 'bg-slate-50/60 hover:bg-slate-100/60 dark:bg-slate-800/60 dark:hover:bg-slate-700/60'}`}>
                    <td className="px-3 py-2 text-center">
                      <LotCheckbox id={lot.id} selectedLots={selectedLots} onLotToggle={onLotToggle} />
                    </td>
                    <td className="px-3 py-2 pl-10 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400">{lot.purchase_date}</span>
                        <TermBadge purchaseDate={lot.purchase_date} size="xs" />
                      </div>
                    </td>
                    <td className="px-5 py-2 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">{lot.quantity.toFixed(2)}</td>
                    <td className="px-5 py-2 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">${lot.purchase_price.toFixed(2)}</td>
                    <td className="px-5 py-2 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">${lot.current_price.toFixed(2)}</td>
                    <td className="px-5 py-2 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">${fmt2(lot.purchase_price * lot.quantity)}</td>
                    <td className="px-5 py-2 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">${lot.current_value.toFixed(2)}</td>
                    <td className={`px-5 py-2 text-right text-xs tabular-nums font-medium ${lot.gain_loss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                      {lot.gain_loss >= 0 ? '+' : ''}${lot.gain_loss.toFixed(2)}
                    </td>
                    <td className="px-5 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={`text-xs tabular-nums font-medium ${lot.gain_loss_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                          {lot.gain_loss_pct >= 0 ? '+' : ''}{lot.gain_loss_pct.toFixed(2)}%
                        </span>
                        <button onClick={e => { e.stopPropagation(); handleDelete(lot.id); }} disabled={deleting === lot.id}
                          className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors dark:text-slate-600 dark:hover:text-red-400 dark:hover:bg-red-950/40">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {lot.gain_loss > 0 && stock.total_quantity ? (
                        <div className="space-y-0.5">
                          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">+${lot.gain_loss.toFixed(2)}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">{lot.quantity.toFixed(2)} sh · {stock.total_quantity ? (lot.quantity / stock.total_quantity * 100).toFixed(1) : '0'}%</div>
                        </div>
                      ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {lot.gain_loss < 0 && stock.total_quantity ? (
                        <div className="space-y-0.5">
                          <div className="text-xs font-semibold text-red-500 dark:text-red-400 tabular-nums">-${Math.abs(lot.gain_loss).toFixed(2)}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">{lot.quantity.toFixed(2)} sh · {(lot.quantity / stock.total_quantity * 100).toFixed(1)}%</div>
                        </div>
                      ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// indeterminate checkbox helper
function GroupCheckbox({ ids, selectedLots, onGroupToggle, allSel, someSel }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = someSel && !allSel; }, [someSel, allSel]);
  return (
    <input ref={ref} type="checkbox" checked={allSel}
      onChange={() => onGroupToggle(ids, !allSel)}
      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 cursor-pointer accent-blue-600" />
  );
}

// ── Ticker lots popup (single-ticker table in a modal) ────────────────────────

const TICKER_POPUP_COLS = [
  { key: 'term',           label: 'Term',        align: 'left'  },
  { key: 'purchase_date',  label: 'Date',        align: 'left'  },
  { key: 'quantity',       label: 'Shares',      align: 'right' },
  { key: 'purchase_price', label: 'Buy Price',   align: 'right' },
  { key: 'total_cost',     label: 'Total Cost',  align: 'right' },
  { key: 'current_price',  label: 'Current',     align: 'right' },
  { key: 'current_value',  label: 'Value',       align: 'right' },
  { key: 'gain_loss',      label: 'Gain/Loss',   align: 'right' },
  { key: 'gain_loss_pct',  label: 'Return',      align: 'right' },
  { key: 'holding_pct',    label: '% of Position', align: 'right' },
];

function TickerLotsPopup({ stock, selectedLots, onLotToggle, onGroupToggle, onRefresh, onSell, onClose }) {
  const [deleting, setDeleting] = useState(null);
  const { sortKey, sortDir, handleSort } = useSortState('purchase_date');

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = useMemo(() => {
    if (!stock) return [];
    return stock.lots.map(lot => ({
      ...lot,
      lt: isLongTerm(lot.purchase_date),
      total_cost: lot.purchase_price * lot.quantity,
      holding_pct: stock.total_quantity ? (lot.quantity / stock.total_quantity) * 100 : null,
    }));
  }, [stock]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = sortKey === 'term' ? (a.lt ? 1 : 0) : a[sortKey];
      const bv = sortKey === 'term' ? (b.lt ? 1 : 0) : b[sortKey];
      if (av == null) return 1; if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const lotIds = useMemo(() => rows.map(r => r.id), [rows]);
  const allSel = lotIds.length > 0 && lotIds.every(id => selectedLots.has(id));
  const someSel = lotIds.some(id => selectedLots.has(id));

  const summary = useMemo(() => computeSelectionSummary(rows, selectedLots), [rows, selectedLots]);
  const positionPct = summary && stock?.total_quantity ? (summary.shares / stock.total_quantity) * 100 : null;

  const handleDelete = async (id) => {
    if (!confirm('Delete this lot?')) return;
    setDeleting(id);
    try { await api.deleteHolding(id); onRefresh?.(); }
    catch (e) { alert('Failed to delete: ' + e.message); }
    finally { setDeleting(null); }
  };

  if (!stock) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onClose}>
      <div className="w-full max-w-6xl max-h-[85vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{stock.ticker} Lots</h2>
            {stock.name && <p className="text-xs text-slate-400 dark:text-slate-500">{stock.name}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 -m-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 transition-colors">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 sticky top-0">
              <tr>
                <th className="px-3 py-2.5 w-8 text-center">
                  <GroupCheckbox ids={lotIds} selectedLots={selectedLots} onGroupToggle={onGroupToggle} allSel={allSel} someSel={someSel} />
                </th>
                {TICKER_POPUP_COLS.map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)}
                    className={`px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                    <span className="inline-flex items-center">
                      {col.align === 'right' && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                      {col.label}
                      {col.align === 'left' && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sorted.map(row => (
                <tr key={row.id} className={`transition-colors ${selectedLots.has(row.id) ? 'bg-blue-50/60 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
                  <td className="px-3 py-2.5 text-center">
                    <LotCheckbox id={row.id} selectedLots={selectedLots} onLotToggle={onLotToggle} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap"><TermBadge purchaseDate={row.purchase_date} /></td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">{row.purchase_date}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{row.quantity.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">${row.purchase_price.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">${fmt2(row.total_cost)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">${row.current_price.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">${fmt2(row.current_value)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${row.gain_loss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {row.gain_loss >= 0 ? '+' : ''}${fmt2(row.gain_loss)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${row.gain_loss_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {row.gain_loss_pct >= 0 ? '+' : ''}{row.gain_loss_pct.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs text-slate-500 dark:text-slate-400">
                    {row.holding_pct != null ? `${row.holding_pct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => handleDelete(row.id)} disabled={deleting === row.id}
                      className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors dark:text-slate-600 dark:hover:text-red-400 dark:hover:bg-red-950/40">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <SelectionBar summary={summary} onClear={() => onGroupToggle(lotIds, false)} onSell={() => { onSell(); onClose(); }} positionPct={positionPct} />
      </div>
    </div>
  );
}

// ── Gain/Loss pie side panel (on-demand, next to the ticker table) ───────────

const LOSS_COLORS = ['#ef4444','#f97316','#f59e0b','#dc2626','#ea580c','#d97706','#b91c1c','#c2410c','#92400e','#991b1b'];
const GAIN_COLORS = ['#10b981','#059669','#34d399','#065f46','#047857','#6ee7b7','#16a34a','#15803d','#86efac','#4ade80'];

function FilteredPieTooltip({ active, payload, mode }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const val = d[mode === 'loss' ? 'loss' : 'gain'];
  return (
    <div className="bg-slate-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg space-y-0.5">
      <div className="font-semibold">{d.ticker}</div>
      {d.name && <div className="text-slate-400">{d.name}</div>}
      <div className={mode === 'loss' ? 'text-red-400' : 'text-emerald-400'}>
        {mode === 'loss' ? '-' : '+'}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className="text-slate-300">{d.pct.toFixed(1)}% of total</div>
    </div>
  );
}

const OVERALL_GAIN_COLOR = '#10b981';
const OVERALL_LOSS_COLOR = '#ef4444';

function FilterSidePanel({ stocks, mode, onTickerClick, onClose }) {
  const isOverall = mode === 'overall';
  const COLORS = mode === 'loss' ? LOSS_COLORS : GAIN_COLORS;
  const sign = mode === 'loss' ? -1 : 1;

  const { pieData, total, totalGain, totalLoss } = useMemo(() => {
    if (isOverall) {
      const rows = stocks
        .filter(s => s.gain_loss != null)
        .map(s => ({ ticker: s.ticker, name: s.name, value: s.gain_loss, gain: s.gain_loss, loss: s.gain_loss }));
      const totalAbs = rows.reduce((s, r) => s + Math.abs(r.value), 0);
      const totalGain = rows.filter(r => r.value >= 0).reduce((s, r) => s + r.value, 0);
      const totalLoss = rows.filter(r => r.value < 0).reduce((s, r) => s + r.value, 0);
      const pieData = rows
        .map(r => ({ ...r, pct: totalAbs > 0 ? (Math.abs(r.value) / totalAbs) * 100 : 0 }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
      return { pieData, total: totalAbs, totalGain, totalLoss };
    }
    const byTicker = {};
    for (const stock of stocks) {
      for (const lot of stock.lots ?? []) {
        if (sign === -1 ? (lot.gain_loss ?? 0) >= 0 : (lot.gain_loss ?? 0) <= 0) continue;
        if (!byTicker[stock.ticker]) byTicker[stock.ticker] = { ticker: stock.ticker, name: stock.name, loss: 0, gain: 0 };
        if (mode === 'loss') byTicker[stock.ticker].loss += Math.abs(lot.gain_loss);
        else                 byTicker[stock.ticker].gain += lot.gain_loss;
      }
    }
    const total = Object.values(byTicker).reduce((s, d) => s + (mode === 'loss' ? d.loss : d.gain), 0);
    const pieData = Object.values(byTicker)
      .map(d => ({ ...d, pct: total > 0 ? ((mode === 'loss' ? d.loss : d.gain) / total) * 100 : 0 }))
      .sort((a, b) => (mode === 'loss' ? b.loss - a.loss : b.gain - a.gain));
    return { pieData, total, totalGain: 0, totalLoss: 0 };
  }, [stocks, mode, isOverall, sign]);

  const totalColor = mode === 'loss' ? 'text-red-400' : 'text-emerald-400';
  const totalLabel = mode === 'loss' ? 'Total Loss' : 'Total Gain';
  const totalFmt = mode === 'loss' ? `-$${fmt2(total)}` : `+$${fmt2(total)}`;
  const netTotal = totalGain + totalLoss;

  return (
    <div className="shrink-0 bg-slate-900 w-full sm:w-80 border-t sm:border-t-0 sm:border-l border-slate-700">
      <div className="w-full sm:w-80 h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
          <h2 className={`text-sm font-bold ${isOverall ? 'text-slate-100' : mode === 'loss' ? 'text-red-400' : 'text-emerald-400'}`}>
            {isOverall ? 'Overall by Ticker' : mode === 'loss' ? 'Losses' : 'Gains'}
          </h2>
          {!isOverall && (
            <button onClick={onClose} className="p-1.5 -m-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {pieData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500">
              {mode === 'loss' ? <TrendingDown className="w-8 h-8 mb-2 opacity-30" /> : <TrendingUp className="w-8 h-8 mb-2 opacity-30" />}
              <p className="text-xs text-center">{mode === 'loss' ? 'No loss positions — all lots are profitable.' : mode === 'gain' ? 'No gain positions — all lots are at a loss.' : 'No holdings yet.'}</p>
            </div>
          ) : (
            <>
              <div className="w-full h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius="52%" outerRadius="78%"
                      paddingAngle={2} dataKey={isOverall ? 'value' : mode === 'loss' ? 'loss' : 'gain'} strokeWidth={0}
                      style={{ cursor: 'pointer' }} onClick={d => onTickerClick?.(d.ticker)}>
                      {pieData.map((d, i) => (
                        <Cell key={i} fill={isOverall ? (d.value >= 0 ? OVERALL_GAIN_COLOR : OVERALL_LOSS_COLOR) : COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip content={<FilteredPieTooltip mode={isOverall ? 'gain' : mode} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {isOverall ? (
                <div className="flex justify-between gap-2 -mt-2 mb-4">
                  <div className="text-left">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Gaining</div>
                    <div className="text-sm font-bold tabular-nums text-emerald-400">+${fmt2(totalGain)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Net</div>
                    <div className={`text-sm font-bold tabular-nums ${netTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{netTotal >= 0 ? '+' : '-'}${fmt2(Math.abs(netTotal))}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Losing</div>
                    <div className="text-sm font-bold tabular-nums text-red-400">-${fmt2(Math.abs(totalLoss))}</div>
                  </div>
                </div>
              ) : (
                <div className="text-center -mt-2 mb-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{totalLabel}</div>
                  <div className={`text-xl font-bold tabular-nums ${totalColor}`}>{totalFmt}</div>
                </div>
              )}
              <div className="space-y-1">
                {pieData.map((d, i) => (
                  <button key={d.ticker} onClick={() => onTickerClick?.(d.ticker)}
                    className="w-full flex items-center gap-2 text-xs hover:bg-slate-800 rounded-lg px-2 py-1.5 transition-colors text-left">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isOverall ? (d.value >= 0 ? OVERALL_GAIN_COLOR : OVERALL_LOSS_COLOR) : COLORS[i % COLORS.length] }} />
                    <span className="font-medium text-slate-200 truncate">{d.ticker}</span>
                    <span className={`tabular-nums shrink-0 ml-auto ${isOverall ? (d.value >= 0 ? 'text-emerald-400' : 'text-red-400') : totalColor}`}>
                      {isOverall ? `${d.value >= 0 ? '+' : '-'}$${fmt2(Math.abs(d.value))}` : `${mode === 'loss' ? '-' : '+'}$${fmt2(mode === 'loss' ? d.loss : d.gain)}`}
                    </span>
                    <span className="tabular-nums shrink-0 text-slate-500 w-9 text-right">{d.pct.toFixed(0)}%</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function HoldingsTable({ portfolio, onRefresh, lastRefreshed, onTickerClick }) {
  const [selectedLots, setSelectedLots] = useState(new Set());
  const [showSellDialog, setShowSellDialog] = useState(false);
  const [popupTicker, setPopupTicker] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [filterMode, setFilterMode] = useState(null); // null | 'loss' | 'gain'

  const handleToggleExpand = (ticker) => {
    setExpanded(prev => { const s = new Set(prev); s.has(ticker) ? s.delete(ticker) : s.add(ticker); return s; });
  };
  const allExpanded = !!portfolio?.stocks?.length && portfolio.stocks.every(s => expanded.has(s.ticker));
  const handleExpandAllToggle = () => {
    setExpanded(allExpanded ? new Set() : new Set((portfolio?.stocks ?? []).map(s => s.ticker)));
  };
  const handleLossFilterToggle = () => setFilterMode(m => m === 'loss' ? null : 'loss');
  const handleGainFilterToggle = () => setFilterMode(m => m === 'gain' ? null : 'gain');

  const handleLotToggle = (id) => {
    setSelectedLots(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };
  const handleGroupToggle = (ids, selectAll) => {
    setSelectedLots(prev => { const s = new Set(prev); ids.forEach(id => selectAll ? s.add(id) : s.delete(id)); return s; });
  };

  // Flat lot map (id → lot with ticker) for selection summary + sell dialog
  const allLotsFlat = useMemo(() => {
    const map = {};
    for (const stock of portfolio?.stocks ?? [])
      for (const lot of stock.lots ?? [])
        map[lot.id] = { ...lot, ticker: stock.ticker };
    return map;
  }, [portfolio]);

  const selectionSummary = useMemo(() =>
    computeSelectionSummary(Object.values(allLotsFlat), selectedLots),
    [selectedLots, allLotsFlat]
  );

  const selectedLotObjects = useMemo(() =>
    [...selectedLots].map(id => allLotsFlat[id]).filter(Boolean),
    [selectedLots, allLotsFlat]
  );

  const popupStock = useMemo(() =>
    popupTicker ? portfolio?.stocks?.find(s => s.ticker === popupTicker) ?? null : null,
    [popupTicker, portfolio]
  );

  const handleSellConfirm = async (lots, sellDate, notes) => {
    await api.sellLots(lots, sellDate, notes);
    setSelectedLots(new Set());
    setShowSellDialog(false);
    onRefresh?.();
  };

  useEffect(() => {
    if (popupTicker && !popupStock) setPopupTicker(null);
  }, [popupTicker, popupStock]);

  if (!portfolio?.stocks?.length) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Holdings</h2>
        <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-10">No holdings yet. Add a stock or import a CSV to get started.</p>
      </div>
    );
  }

  const totalLots = portfolio.stocks.reduce((n, s) => n + s.lots.length, 0);
  const lossLotCount = portfolio.stocks.flatMap(s => s.lots).filter(l => l.gain_loss < 0).length;
  const gainLotCount = portfolio.stocks.flatMap(s => s.lots).filter(l => l.gain_loss > 0).length;
  const countLabel = `${portfolio.stocks.length} ticker${portfolio.stocks.length !== 1 ? 's' : ''} · ${totalLots} lot${totalLots !== 1 ? 's' : ''}`;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      {showSellDialog && (
        <SellDialog selectedLotObjects={selectedLotObjects} onConfirm={handleSellConfirm} onCancel={() => setShowSellDialog(false)} />
      )}
      {popupStock && (
        <TickerLotsPopup stock={popupStock} selectedLots={selectedLots} onLotToggle={handleLotToggle}
          onGroupToggle={handleGroupToggle} onRefresh={onRefresh} onSell={() => setShowSellDialog(true)}
          onClose={() => setPopupTicker(null)} />
      )}

      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0">Holdings</h2>

        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={handleExpandAllToggle}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700/50 transition-colors">
            <ChevronsUpDown className="w-3.5 h-3.5" /> {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>

          <label className="flex items-center gap-1.5 text-xs font-medium text-red-500 dark:text-red-400 cursor-pointer select-none">
            <input type="checkbox" checked={filterMode === 'loss'} onChange={handleLossFilterToggle}
              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 cursor-pointer accent-red-600" />
            Losses only <span className="text-slate-400 dark:text-slate-500">({lossLotCount})</span>
          </label>

          <label className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 cursor-pointer select-none">
            <input type="checkbox" checked={filterMode === 'gain'} onChange={handleGainFilterToggle}
              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 cursor-pointer accent-emerald-600" />
            Gains only <span className="text-slate-400 dark:text-slate-500">({gainLotCount})</span>
          </label>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">{countLabel}</span>
        </div>
      </div>

      {/* Table + permanent gain/loss pie panel + selection side panel */}
      <div className="flex flex-col sm:flex-row items-stretch">
        <div className="flex-1 min-w-0">
          <TickerView stocks={portfolio.stocks} filterMode={filterMode} onTickerClick={onTickerClick} onRefresh={onRefresh}
            selectedLots={selectedLots} onLotToggle={handleLotToggle} onGroupToggle={handleGroupToggle}
            onOpenTickerPopup={setPopupTicker} expanded={expanded} onToggle={handleToggleExpand} />
        </div>

        <FilterSidePanel stocks={portfolio.stocks} mode={filterMode ?? 'overall'} onTickerClick={onTickerClick}
          onClose={() => setFilterMode(null)} />

        <SelectionSidePanel selectedLotObjects={selectedLotObjects} summary={selectionSummary} portfolio={portfolio}
          onClear={() => setSelectedLots(new Set())} onSell={() => setShowSellDialog(true)} />
      </div>
    </div>
  );
}
