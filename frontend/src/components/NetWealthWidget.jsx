import { useEffect, useMemo, useRef, useState } from 'react';
import { Landmark, X, Plus, Trash2 } from 'lucide-react';
import { getNetWealthItems, setNetWealthItems } from '../utils/netWealthSettings';

const GROWTH_RATE = 0.05;
const FORECAST_YEARS = [5, 10, 15];

function fmt(n) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function ItemRow({ item, onRemove }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 group">
      <span className="text-xs text-slate-600 dark:text-slate-300 flex-1 truncate">{item.name}</span>
      <span className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">${fmt(item.value)}</span>
      <button onClick={() => onRemove(item.id)} className="p-0.5 -m-0.5 rounded text-slate-400 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function AddItemForm({ onAdd }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const v = parseFloat(value);
    if (!name.trim() || !v) return;
    onAdd({ id: Date.now(), name: name.trim(), value: v });
    setName('');
    setValue('');
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-1.5 px-3 py-1.5">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Name (e.g. Home)"
        className="min-w-0 flex-1 px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        type="number"
        placeholder="$"
        className="w-20 px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button type="submit" className="p-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors shrink-0">
        <Plus className="w-3.5 h-3.5" />
      </button>
    </form>
  );
}

export default function NetWealthWidget({ portfolio, open, onOpenChange }) {
  const [items, setItems] = useState(() => getNetWealthItems());
  const panelRef = useRef(null);

  useEffect(() => { setNetWealthItems(items); }, [items]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onOpenChange(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onOpenChange]);

  const addAsset = (item) => setItems(prev => ({ ...prev, assets: [...prev.assets, item] }));
  const removeAsset = (id) => setItems(prev => ({ ...prev, assets: prev.assets.filter(a => a.id !== id) }));
  const addLiability = (item) => setItems(prev => ({ ...prev, liabilities: [...prev.liabilities, item] }));
  const removeLiability = (id) => setItems(prev => ({ ...prev, liabilities: prev.liabilities.filter(l => l.id !== id) }));

  const { portfolioValue, assetsTotal, liabilitiesTotal, netWealth, forecasts } = useMemo(() => {
    const portfolioValue = portfolio?.total_value ?? 0;
    const assetsTotal = items.assets.reduce((sum, a) => sum + a.value, 0);
    const liabilitiesTotal = items.liabilities.reduce((sum, l) => sum + l.value, 0);
    const netWealth = portfolioValue + assetsTotal - liabilitiesTotal;
    const forecasts = FORECAST_YEARS.map(years => ({
      years,
      value: netWealth * Math.pow(1 + GROWTH_RATE, years),
    }));
    return { portfolioValue, assetsTotal, liabilitiesTotal, netWealth, forecasts };
  }, [portfolio, items]);

  return (
    <div className="relative">
      <button
        onClick={() => onOpenChange(!open)}
        title="Net wealth"
        className={`p-2 rounded-lg transition-colors ${
          open ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
        }`}
      >
        <Landmark className="w-4 h-4 text-amber-400" />
      </button>

      {open && (
        <div ref={panelRef} className="fixed left-16 top-1/2 -translate-y-1/2 w-80 max-h-[85vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/40 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Net Wealth</span>
            <button onClick={() => onOpenChange(false)} className="p-1 -m-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors">
              <X className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 min-h-0">
            {/* Summary */}
            <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                <span>Portfolio</span><span className="tabular-nums text-slate-700 dark:text-slate-200">${fmt(portfolioValue)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                <span>Other Assets</span><span className="tabular-nums text-emerald-600 dark:text-emerald-400">+${fmt(assetsTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                <span>Liabilities</span><span className="tabular-nums text-red-500 dark:text-red-400">-${fmt(liabilitiesTotal)}</span>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Net Wealth</span>
                <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">${fmt(netWealth)}</span>
              </div>
            </div>

            {/* Assets */}
            <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/30">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Assets</span>
            </div>
            {items.assets.map(a => <ItemRow key={a.id} item={a} onRemove={removeAsset} />)}
            <AddItemForm onAdd={addAsset} />

            {/* Liabilities */}
            <div className="px-3 py-1.5 border-b border-t border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/30">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Liabilities</span>
            </div>
            {items.liabilities.map(l => <ItemRow key={l.id} item={l} onRemove={removeLiability} />)}
            <AddItemForm onAdd={addLiability} />

            {/* Forecast */}
            <div className="px-3 py-1.5 border-b border-t border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/30">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Forecast · {(GROWTH_RATE * 100).toFixed(0)}%/yr</span>
            </div>
            <div className="px-3 py-2 grid grid-cols-3 gap-2">
              {forecasts.map(f => (
                <div key={f.years} className="bg-slate-100 dark:bg-slate-800/50 rounded-lg py-2 text-center">
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{f.years}Y</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">${fmt(f.value)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
