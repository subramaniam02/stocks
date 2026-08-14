import { useState } from 'react';
import { Plus, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

export default function AddStockForm({ onAddSuccess }) {
  const [formData, setFormData] = useState({
    ticker: '',
    purchase_date: new Date().toISOString().split('T')[0],
    purchase_price: '',
    quantity: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [stockInfo, setStockInfo] = useState(null);
  const [result, setResult] = useState(null);

  const handleTickerBlur = async () => {
    const ticker = formData.ticker.trim().toUpperCase();
    if (!ticker || ticker.length < 1) {
      setStockInfo(null);
      return;
    }

    setValidating(true);
    setStockInfo(null);
    try {
      const info = await api.getStockInfo(ticker);
      setStockInfo(info);
    } catch (error) {
      setStockInfo({ error: true, message: 'Invalid ticker symbol' });
    } finally {
      setValidating(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setResult(null);

    if (name === 'ticker') {
      setStockInfo(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.ticker || !formData.purchase_date || !formData.purchase_price || !formData.quantity) {
      setResult({ success: false, message: 'Please fill in all fields' });
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      await api.addHolding({
        ticker: formData.ticker.toUpperCase(),
        purchase_date: formData.purchase_date,
        purchase_price: parseFloat(formData.purchase_price),
        quantity: parseInt(formData.quantity, 10),
      });

      setResult({
        success: true,
        message: `Added ${formData.quantity} shares of ${formData.ticker.toUpperCase()}`,
      });

      setFormData({
        ticker: '',
        purchase_date: new Date().toISOString().split('T')[0],
        purchase_price: '',
        quantity: '',
      });
      setStockInfo(null);

      if (onAddSuccess) {
        onAddSuccess();
      }
    } catch (error) {
      setResult({
        success: false,
        message: error.message || 'Failed to add holding',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const useCurrentPrice = () => {
    if (stockInfo && stockInfo.current_price) {
      setFormData(prev => ({
        ...prev,
        purchase_price: stockInfo.current_price.toFixed(2),
      }));
    }
  };

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="ticker" className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
            Ticker Symbol
          </label>
          <div className="relative">
            <input
              type="text"
              id="ticker"
              name="ticker"
              value={formData.ticker}
              onChange={handleChange}
              onBlur={handleTickerBlur}
              placeholder="AAPL"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder-slate-500"
              disabled={submitting}
            />
            {validating && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400 dark:text-slate-500" />
              </div>
            )}
          </div>
          {stockInfo && !stockInfo.error && (
            <div className="mt-2 p-2 bg-green-50 dark:bg-emerald-950/40 rounded-lg text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-green-800 dark:text-emerald-300">{stockInfo.name}</span>
                <span className="text-green-700 dark:text-emerald-400">${stockInfo.current_price?.toFixed(2)}</span>
              </div>
              {stockInfo.sector && (
                <span className="text-xs text-green-600 dark:text-emerald-400">{stockInfo.sector}</span>
              )}
            </div>
          )}
          {stockInfo && stockInfo.error && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{stockInfo.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="purchase_date" className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
            Purchase Date
          </label>
          <input
            type="date"
            id="purchase_date"
            name="purchase_date"
            value={formData.purchase_date}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="purchase_price" className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
            Purchase Price ($)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              id="purchase_price"
              name="purchase_price"
              value={formData.purchase_price}
              onChange={handleChange}
              placeholder="150.00"
              step="0.01"
              min="0.01"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder-slate-500"
              disabled={submitting}
            />
            {stockInfo && stockInfo.current_price && (
              <button
                type="button"
                onClick={useCurrentPrice}
                className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                title="Use current market price"
              >
                Current
              </button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
            Quantity (Shares)
          </label>
          <input
            type="number"
            id="quantity"
            name="quantity"
            value={formData.quantity}
            onChange={handleChange}
            placeholder="10"
            min="1"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder-slate-500"
            disabled={submitting}
          />
        </div>

        {formData.purchase_price && formData.quantity && (
          <div className="p-3 bg-gray-50 dark:bg-slate-800/60 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-slate-300">Total Cost:</span>
              <span className="font-semibold dark:text-slate-100">
                ${(parseFloat(formData.purchase_price) * parseInt(formData.quantity || 0, 10)).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || (stockInfo && stockInfo.error)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Add Holding
            </>
          )}
        </button>
      </form>

      {result && (
        <div
          className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
            result.success ? 'bg-green-50 text-green-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          {result.success ? (
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          )}
          {result.message}
        </div>
      )}
    </div>
  );
}
