import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import AddStockForm from './AddStockForm';
import CSVUpload from './CSVUpload';

export default function AddStockDialog({ isOpen, defaultTab = 'manual', onClose, onSuccess }) {
  const [tab, setTab] = useState(defaultTab);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (isOpen) setTab(defaultTab);
  }, [isOpen, defaultTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSuccess = () => {
    onSuccess?.();
    onClose();
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Add to Portfolio</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setTab('manual')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'manual'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600 dark:bg-blue-950/40 dark:text-blue-400'
                : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700/50'
            }`}
          >
            Add Manually
          </button>
          <button
            onClick={() => setTab('csv')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'csv'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600 dark:bg-blue-950/40 dark:text-blue-400'
                : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700/50'
            }`}
          >
            Import CSV
          </button>
        </div>

        <div>
          {tab === 'manual' ? (
            <AddStockForm onAddSuccess={handleSuccess} />
          ) : (
            <CSVUpload onUploadSuccess={handleSuccess} />
          )}
        </div>
      </div>
    </div>
  );
}
