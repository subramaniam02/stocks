import { useState, useEffect, useMemo, Fragment } from 'react';
import {
  Plus, Trash2, X, TrendingUp, TrendingDown, DollarSign,
  ChevronDown, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown,
  Layers, LayoutList, Activity, RefreshCw, Calculator,
} from 'lucide-react';
import { api } from '../services/api';
import { getTaxRates, setTaxRates } from '../utils/taxSettings';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
function fmt2(n) { return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtSign(n) { return (n >= 0 ? '+$' : '-$') + fmt2(Math.abs(n)); }

function TermBadge({ term }) {
  const lt = term === 'Long-Term';
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
      lt ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60'
    }`}>{term}</span>
  );
}

function SummaryCard({ label, value, sub, pos }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm px-5 py-4">
      <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${pos == null ? 'text-slate-900 dark:text-slate-100' : pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── sort helpers ─────────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-300" />;
  return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-blue-500" /> : <ArrowDown className="w-3 h-3 ml-1 text-blue-500" />;
}

function useSortState(defaultKey, defaultDir = 'asc') {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState(defaultDir);
  const handleSort = (key) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  return { sortKey, sortDir, handleSort };
}

function sortRows(rows, sortKey, sortDir) {
  const arr = [...rows];
  arr.sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (av == null) return 1; if (bv == null) return -1;
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sortDir === 'asc' ? cmp : -cmp;
  });
  return arr;
}

const LOT_COLS = [
  { key: 'ticker',     label: 'Ticker',     align: 'left'  },
  { key: 'buy_date',   label: 'Buy Date',   align: 'left'  },
  { key: 'sell_date',  label: 'Sell Date',  align: 'left'  },
  { key: 'term',       label: 'Term',       align: 'left'  },
  { key: 'quantity',   label: 'Shares',     align: 'right' },
  { key: 'buy_price',  label: 'Buy Price',  align: 'right' },
  { key: 'sell_price', label: 'Sell Price', align: 'right' },
  { key: 'cost_basis', label: 'Cost Basis', align: 'right' },
  { key: 'proceeds',   label: 'Proceeds',   align: 'right' },
  { key: 'gain_loss',  label: 'Gain/Loss',  align: 'right' },
  { key: 'return_pct', label: 'Return',     align: 'right' },
];

const TICKER_COLS = [
  { key: 'ticker',     label: 'Ticker',     align: 'left'  },
  { key: 'count',      label: 'Txns',       align: 'right' },
  { key: 'quantity',   label: 'Shares',     align: 'right' },
  { key: 'cost_basis', label: 'Cost Basis', align: 'right' },
  { key: 'proceeds',   label: 'Proceeds',   align: 'right' },
  { key: 'gain_loss',  label: 'Gain/Loss',  align: 'right' },
  { key: 'return_pct', label: 'Return',     align: 'right' },
];

function SortableHeader({ cols, sortKey, sortDir, handleSort }) {
  return (
    <tr className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
      {cols.map(col => (
        <th
          key={col.key}
          onClick={() => handleSort(col.key)}
          className={`px-4 py-2.5 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
        >
          <span className="inline-flex items-center">
            {col.align === 'right' && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
            {col.label}
            {col.align === 'left' && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
          </span>
        </th>
      ))}
    </tr>
  );
}

function TxnRow({ t, indent, onDelete, deletingId }) {
  const pos = t.gain_loss >= 0;
  return (
    <tr className={`transition-colors ${indent ? 'bg-slate-50/60 hover:bg-slate-100/60 dark:bg-slate-800/60 dark:hover:bg-slate-700/60' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
      <td className={`px-4 py-2.5 font-bold text-slate-800 dark:text-slate-100 ${indent ? 'pl-10 text-xs font-semibold' : ''}`}>{t.ticker}</td>
      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">{t.buy_date}</td>
      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">{t.sell_date}</td>
      <td className="px-4 py-2.5"><TermBadge term={t.term} /></td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{t.quantity.toFixed(2)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">${fmt2(t.buy_price)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">${fmt2(t.sell_price)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">${fmt2(t.cost_basis)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">${fmt2(t.proceeds)}</td>
      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
        {fmtSign(t.gain_loss)}
      </td>
      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
        {t.return_pct >= 0 ? '+' : ''}{t.return_pct.toFixed(2)}%
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-400 dark:text-slate-500 max-w-[150px] truncate">{t.notes || '—'}</td>
      <td className="px-4 py-2.5">
        <button
          onClick={() => onDelete(t.id)}
          disabled={deletingId === t.id}
          className="text-slate-300 hover:text-red-400 disabled:opacity-40 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

// ── By Lots view ─────────────────────────────────────────────────────────────

function LotView({ rows, onDelete, deletingId }) {
  const { sortKey, sortDir, handleSort } = useSortState('sell_date', 'desc');
  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
          <SortableHeader cols={LOT_COLS} sortKey={sortKey} sortDir={sortDir} handleSort={handleSort} />
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map(t => (
            <TxnRow key={t.id} t={t} onDelete={onDelete} deletingId={deletingId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── By Ticker view ───────────────────────────────────────────────────────────

function TickerView({ rows, onDelete, deletingId }) {
  const { sortKey, sortDir, handleSort } = useSortState('ticker', 'asc');
  const [expanded, setExpanded] = useState(new Set());

  const grouped = useMemo(() => {
    const map = {};
    for (const r of rows) {
      if (!map[r.ticker]) {
        map[r.ticker] = { ticker: r.ticker, txns: [], quantity: 0, cost_basis: 0, proceeds: 0, gain_loss: 0, ltCount: 0, stCount: 0 };
      }
      const g = map[r.ticker];
      g.txns.push(r);
      g.quantity += r.quantity;
      g.cost_basis += r.cost_basis;
      g.proceeds += r.proceeds;
      g.gain_loss += r.gain_loss;
      if (r.term === 'Long-Term') g.ltCount += 1; else g.stCount += 1;
    }
    return Object.values(map).map(g => ({
      ...g,
      count: g.txns.length,
      return_pct: g.cost_basis > 0 ? (g.gain_loss / g.cost_basis) * 100 : 0,
    }));
  }, [rows]);

  const sorted = useMemo(() => sortRows(grouped, sortKey, sortDir), [grouped, sortKey, sortDir]);

  const toggle = (ticker) => {
    const s = new Set(expanded);
    s.has(ticker) ? s.delete(ticker) : s.add(ticker);
    setExpanded(s);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
          <tr className="text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
            <th className="px-4 py-2.5 w-8" />
            {TICKER_COLS.map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`px-4 py-2.5 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                <span className="inline-flex items-center">
                  {col.align === 'right' && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                  {col.label}
                  {col.align === 'left' && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map(g => {
            const pos = g.gain_loss >= 0;
            const isOpen = expanded.has(g.ticker);
            return (
              <Fragment key={g.ticker}>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors" onClick={() => toggle(g.ticker)}>
                  <td className="px-4 py-2.5 text-center">
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 dark:text-slate-100">{g.ticker}</span>
                      {g.stCount > 0 && <span className="text-[9px] font-semibold px-1 py-px rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60">{g.stCount} ST</span>}
                      {g.ltCount > 0 && <span className="text-[9px] font-semibold px-1 py-px rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60">{g.ltCount} LT</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{g.count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{g.quantity.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">${fmt2(g.cost_basis)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">${fmt2(g.proceeds)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {fmtSign(g.gain_loss)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {g.return_pct >= 0 ? '+' : ''}{g.return_pct.toFixed(2)}%
                  </td>
                </tr>
                {isOpen && g.txns.map(t => (
                  <TxnRow key={t.id} t={t} indent onDelete={onDelete} deletingId={deletingId} />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Since Sold (movement) view ──────────────────────────────────────────────

const MOVEMENT_COLS = [
  { key: 'ticker',           label: 'Ticker',        align: 'left'  },
  { key: 'sell_date',        label: 'Sold',          align: 'left'  },
  { key: 'quantity',         label: 'Shares',        align: 'right' },
  { key: 'sell_price',       label: 'Sell Price',    align: 'right' },
  { key: 'current_price',    label: 'Current Price', align: 'right' },
  { key: 'change',           label: 'Change',        align: 'right' },
  { key: 'change_pct',       label: 'Change %',      align: 'right' },
  { key: 'value_since_sold', label: 'If Still Held', align: 'right' },
];

function MovementRow({ m }) {
  const stale = m.price_stale || m.current_price == null;
  const pos = !stale && m.change >= 0;
  const colorClass = stale ? 'text-slate-300 dark:text-slate-600' : pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
      <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-slate-100">{m.ticker}</td>
      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">{m.sell_date}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{m.quantity.toFixed(2)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">${fmt2(m.sell_price)}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{stale ? '—' : `$${fmt2(m.current_price)}`}</td>
      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${colorClass}`}>{stale ? '—' : fmtSign(m.change)}</td>
      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${colorClass}`}>
        {stale ? '—' : `${m.change_pct >= 0 ? '+' : ''}${m.change_pct.toFixed(2)}%`}
      </td>
      <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${colorClass}`}>{stale ? '—' : fmtSign(m.value_since_sold)}</td>
    </tr>
  );
}

function MovementView({ movements, loading, onRefresh }) {
  const { sortKey, sortDir, handleSort } = useSortState('sell_date', 'desc');
  const sorted = useMemo(() => sortRows(movements, sortKey, sortDir), [movements, sortKey, sortDir]);

  const netSinceSold = useMemo(
    () => movements.reduce((sum, m) => sum + (m.value_since_sold ?? 0), 0),
    [movements]
  );
  const trackedCount = movements.filter(m => !m.price_stale).length;

  return (
    <div>
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 gap-3 flex-wrap">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Tracking <span className="font-semibold text-slate-700 dark:text-slate-200">{trackedCount}</span> of {movements.length} sold lots.
          Net move since sale:{' '}
          <span className={`font-semibold ${netSinceSold >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
            {fmtSign(netSinceSold)}
          </span>{' '}
          if still held.
        </p>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh prices
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
            <SortableHeader cols={MOVEMENT_COLS} sortKey={sortKey} sortDir={sortDir} handleSort={handleSort} />
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {sorted.map(m => <MovementRow key={m.id} m={m} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tax estimate ─────────────────────────────────────────────────────────────

function RateInput({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          step="0.1"
          min="0"
          max="100"
          value={value}
          onChange={e => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
          className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg pl-3 pr-7 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">%</span>
      </div>
    </div>
  );
}

function TaxEstimate({ summary }) {
  const [rates, setRates] = useState(() => getTaxRates());

  useEffect(() => { setTaxRates(rates); }, [rates]);

  const updateRate = (key) => (val) => setRates(r => ({ ...r, [key]: val }));

  const { taxableST, taxableLT } = useMemo(() => {
    const stNet = summary.stGains + summary.stLosses;
    const ltNet = summary.ltGains + summary.ltLosses;
    if (stNet > 0 && ltNet > 0) return { taxableST: stNet, taxableLT: ltNet };
    if (stNet > 0 && ltNet <= 0) return { taxableST: Math.max(0, stNet + ltNet), taxableLT: 0 };
    if (stNet <= 0 && ltNet > 0) return { taxableST: 0, taxableLT: Math.max(0, stNet + ltNet) };
    return { taxableST: 0, taxableLT: 0 };
  }, [summary]);

  const fedOrdinary = Number(rates.fedOrdinaryPct) || 0;
  const fedCapGains = Number(rates.fedCapGainsPct) || 0;
  const state = Number(rates.statePct) || 0;

  const stTax = taxableST * (fedOrdinary + state) / 100;
  const ltTax = taxableLT * (fedCapGains + state) / 100;
  const totalTax = stTax + ltTax;
  const netCapitalLoss = summary.stGains + summary.stLosses + summary.ltGains + summary.ltLosses < 0
    && taxableST === 0 && taxableLT === 0;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <Calculator className="w-4 h-4 text-slate-400 dark:text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Tax Estimate</h2>
      </div>
      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <RateInput label="Federal — Ordinary Income" value={rates.fedOrdinaryPct} onChange={updateRate('fedOrdinaryPct')} />
        <RateInput label="Federal — Long-Term Cap Gains" value={rates.fedCapGainsPct} onChange={updateRate('fedCapGainsPct')} />
        <RateInput label="State" value={rates.statePct} onChange={updateRate('statePct')} />
      </div>
      <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Taxable ST Gain</div>
          <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">${fmt2(taxableST)}</div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">taxed as ordinary income</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Taxable LT Gain</div>
          <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">${fmt2(taxableLT)}</div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">taxed at cap gains rate</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Estimated Tax</div>
          <div className="text-lg font-bold tabular-nums text-red-500 dark:text-red-400">${fmt2(totalTax)}</div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">${fmt2(stTax)} ST + ${fmt2(ltTax)} LT</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Net After Tax</div>
          <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">${fmt2(summary.net - totalTax)}</div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">realized gain minus est. tax</div>
        </div>
      </div>
      {netCapitalLoss && (
        <div className="px-5 pb-4 text-xs text-slate-400 dark:text-slate-500">
          Net capital loss for the year — no tax due. Up to $3,000 may be deductible against ordinary income, with the remainder carried forward (consult a tax advisor).
        </div>
      )}
      <div className="px-5 pb-4 text-[11px] text-slate-400 dark:text-slate-500">
        Rough estimate only — assumes flat rates and doesn't account for brackets, NIIT, AMT, or other income. Not tax advice.
      </div>
    </div>
  );
}

const EMPTY_FORM = { ticker: '', buy_date: '', sell_date: '', quantity: '', buy_price: '', sell_price: '', notes: '' };

export default function RealizedPage({ onSave }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('ticker'); // 'lot' | 'ticker' | 'movement'
  const [deletingId, setDeletingId] = useState(null);
  const [movements, setMovements] = useState([]);
  const [movementsLoaded, setMovementsLoaded] = useState(false);
  const [loadingMovements, setLoadingMovements] = useState(false);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (viewMode === 'movement' && !movementsLoaded) loadMovements();
  }, [viewMode, movementsLoaded]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getRealized();
      setTransactions(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMovements = async () => {
    setLoadingMovements(true);
    try {
      const data = await api.getRealizedMovements();
      setMovements(data);
      setMovementsLoaded(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMovements(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.addRealized({
        ticker: form.ticker.trim().toUpperCase(),
        buy_date: form.buy_date,
        sell_date: form.sell_date,
        quantity: parseFloat(form.quantity),
        buy_price: parseFloat(form.buy_price),
        sell_price: parseFloat(form.sell_price),
        notes: form.notes || null,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
      onSave?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this transaction?')) return;
    setDeletingId(id);
    try {
      await api.deleteRealized(id);
      setTransactions(ts => ts.filter(t => t.id !== id));
    } catch (e) {
      alert('Failed to delete: ' + e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const rows = useMemo(() => transactions.map(t => {
    const cost_basis = t.buy_price * t.quantity;
    const proceeds = t.sell_price * t.quantity;
    return { ...t, cost_basis, proceeds, return_pct: cost_basis > 0 ? (t.gain_loss / cost_basis) * 100 : 0 };
  }), [transactions]);

  const summary = useMemo(() => {
    let stGains = 0, stLosses = 0, ltGains = 0, ltLosses = 0;
    for (const t of rows) {
      const gl = t.gain_loss;
      if (t.term === 'Long-Term') {
        if (gl >= 0) ltGains += gl; else ltLosses += gl;
      } else {
        if (gl >= 0) stGains += gl; else stLosses += gl;
      }
    }
    const net = stGains + stLosses + ltGains + ltLosses;
    return { stGains, stLosses, ltGains, ltLosses, net };
  }, [rows]);

  // preview gain/loss while filling form
  const preview = useMemo(() => {
    const qty = parseFloat(form.quantity);
    const bp = parseFloat(form.buy_price);
    const sp = parseFloat(form.sell_price);
    if (!qty || !bp || !sp) return null;
    const gl = (sp - bp) * qty;
    const bd = form.buy_date ? new Date(form.buy_date).getTime() : null;
    const sd = form.sell_date ? new Date(form.sell_date).getTime() : null;
    const term = bd && sd && (sd - bd) >= ONE_YEAR_MS ? 'Long-Term' : 'Short-Term';
    return { gl, term };
  }, [form.quantity, form.buy_price, form.sell_price, form.buy_date, form.sell_date]);

  const field = (key, label, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        required={key !== 'notes'}
        className="w-full border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  const tabBtn = (mode, icon, label) => (
    <button
      onClick={() => setViewMode(mode)}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-slate-200 dark:border-slate-700 first:border-l-0 ${
        viewMode === mode ? 'bg-slate-800 dark:bg-slate-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
      }`}
    >
      {icon}{label}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="Net Realized"
          value={fmtSign(summary.net)}
          pos={summary.net >= 0}
        />
        <SummaryCard
          label="ST Gains"
          value={`+$${fmt2(summary.stGains)}`}
          sub="Short-term gains"
          pos={true}
        />
        <SummaryCard
          label="ST Losses"
          value={`-$${fmt2(Math.abs(summary.stLosses))}`}
          sub="Short-term losses"
          pos={false}
        />
        <SummaryCard
          label="LT Gains"
          value={`+$${fmt2(summary.ltGains)}`}
          sub="Long-term gains"
          pos={true}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="LT Losses"
          value={`-$${fmt2(Math.abs(summary.ltLosses))}`}
          sub="Long-term losses"
          pos={false}
        />
        <SummaryCard
          label="ST Net"
          value={fmtSign(summary.stGains + summary.stLosses)}
          sub="Short-term net"
          pos={(summary.stGains + summary.stLosses) >= 0}
        />
        <SummaryCard
          label="LT Net"
          value={fmtSign(summary.ltGains + summary.ltLosses)}
          sub="Long-term net"
          pos={(summary.ltGains + summary.ltLosses) >= 0}
        />
        <SummaryCard
          label="Total Entries"
          value={transactions.length}
          sub={`${transactions.filter(t => t.term === 'Long-Term').length} LT · ${transactions.filter(t => t.term === 'Short-Term').length} ST`}
        />
      </div>

      <TaxEstimate summary={summary} />

      {/* Add button + form */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Realized Transactions</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
              {tabBtn('lot', <LayoutList className="w-3.5 h-3.5" />, 'By Lots')}
              {tabBtn('ticker', <Layers className="w-3.5 h-3.5" />, 'By Ticker')}
              {tabBtn('movement', <Activity className="w-3.5 h-3.5" />, 'Since Sold')}
            </div>
            <button
              onClick={() => { setShowForm(f => !f); setError(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
            >
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showForm ? 'Cancel' : 'Add Transaction'}
            </button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
            {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg dark:bg-red-950/40 dark:border-red-800/60 dark:text-red-400">{error}</div>}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              {field('ticker', 'Ticker', 'text', 'AAPL')}
              {field('buy_date', 'Buy Date', 'date')}
              {field('sell_date', 'Sell Date', 'date')}
              {field('quantity', 'Shares', 'number', '10')}
              {field('buy_price', 'Buy Price', 'number', '150.00')}
              {field('sell_price', 'Sell Price', 'number', '180.00')}
              {field('notes', 'Notes (optional)', 'text', 'Tax-loss harvest…')}
            </div>
            {preview && (
              <div className={`mt-3 text-sm font-medium ${preview.gl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                Preview: {fmtSign(preview.gl)} · <TermBadge term={preview.term} />
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save Transaction'}
              </button>
            </div>
          </form>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-sm">Loading…</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-14 text-slate-400 dark:text-slate-500 text-sm">
            <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-20" />
            No realized transactions yet. Add one above.
          </div>
        ) : viewMode === 'lot' ? (
          <LotView rows={rows} onDelete={handleDelete} deletingId={deletingId} />
        ) : viewMode === 'ticker' ? (
          <TickerView rows={rows} onDelete={handleDelete} deletingId={deletingId} />
        ) : loadingMovements && !movementsLoaded ? (
          <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-sm">Fetching current prices…</div>
        ) : (
          <MovementView movements={movements} loading={loadingMovements} onRefresh={loadMovements} />
        )}
      </div>
    </div>
  );
}
