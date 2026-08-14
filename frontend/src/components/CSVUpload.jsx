import { useState, useRef } from 'react';
import { FileText, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { api } from '../services/api';

const STORAGE_KEY = 'csv_last_upload';

function formatUploadDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function CSVUpload({ onUploadSuccess }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [lastUpload, setLastUpload] = useState(() => localStorage.getItem(STORAGE_KEY));
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.csv')) await uploadFile(file);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (file) await uploadFile(file);
  };

  const uploadFile = async (file) => {
    setUploading(true);
    setResult(null);
    try {
      const response = await api.uploadCSV(file);
      const now = new Date().toISOString();
      setResult({ success: true, message: response.message, imported: response.imported, errors: response.errors || [] });
      if (response.imported > 0) {
        localStorage.setItem(STORAGE_KEY, now);
        setLastUpload(now);
        onUploadSuccess?.();
      }
    } catch (error) {
      setResult({ success: false, message: error.message, errors: [] });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-6 space-y-4">
      {lastUpload && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <Clock className="w-3.5 h-3.5" />
          Last import: <span className="font-medium text-slate-500 dark:text-slate-400">{formatUploadDate(lastUpload)}</span>
        </div>
      )}

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragging ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/40' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-500'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <FileText className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          Drag and drop your CSV, or
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? 'Uploading…' : 'Select File'}
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
          Columns: ticker, purchase_date (MM/DD/YYYY), purchase_price, quantity
        </p>
      </div>

      {result && (
        <div className={`p-3 rounded-lg border text-sm ${result.success ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800/60' : 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800/60'}`}>
          <div className="flex items-center gap-2">
            {result.success
              ? <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              : <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />}
            <span className={result.success ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-700 dark:text-red-400'}>{result.message}</span>
          </div>
          {result.errors.length > 0 && (
            <ul className="mt-2 text-xs text-red-600 dark:text-red-400 list-disc list-inside space-y-0.5">
              {result.errors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
              {result.errors.length > 5 && <li>…and {result.errors.length - 5} more</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
