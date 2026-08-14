import { useEffect } from 'react';
import { X } from 'lucide-react';
import TickerLotsList from './TickerLotsList';

export default function TickerLotsModal({ stockPos, portfolioTotal, onClose }) {
  useEffect(() => {
    if (!stockPos) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [stockPos, onClose]);

  if (!stockPos) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="w-full max-w-sm mx-4 max-h-[80vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{stockPos.ticker} Lots</span>
          <button
            onClick={onClose}
            className="p-1.5 -m-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          <TickerLotsList stockPos={stockPos} portfolioTotal={portfolioTotal} />
        </div>
      </div>
    </div>
  );
}
