import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3, Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

const PERIODS = [
  { label: '1M', days: 30  },
  { label: '3M', days: 90  },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

export default function PortfolioChart({ onBackfillComplete }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipBg = isDark ? '#1e293b' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0';
  const [days, setDays] = useState(90);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [backfillStatus, setBackfillStatus] = useState(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const [statusError, setStatusError] = useState(null);

  useEffect(() => {
    loadHistory();
  }, [days]);

  useEffect(() => {
    loadBackfillStatus();
  }, [history]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await api.getHistory(days);
      setHistory(data);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadBackfillStatus = async () => {
    try {
      setStatusError(null);
      const status = await api.getBackfillStatus();
      console.log('Backfill status:', status);
      setBackfillStatus(status);
    } catch (error) {
      console.error('Failed to load backfill status:', error);
      setStatusError(error.message);
    }
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const result = await api.backfillHistory(52);
      setBackfillResult(result);
      await loadBackfillStatus();
      await loadHistory();
      if (onBackfillComplete) {
        onBackfillComplete();
      }
    } catch (error) {
      setBackfillResult({ status: 'error', message: error.message });
    } finally {
      setBackfilling(false);
    }
  };

  const formatCurrency = (value) => {
    return `$${value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const chartData = history?.map(point => ({
    date: point.date,
    value: point.total_value,
    change: point.daily_change_pct,
  })) || [];

  const hasHistory = history && history.length > 0;
  const needsBackfill = backfillStatus?.needs_backfill || false;
  const coveragePct = backfillStatus?.coverage_pct ?? 0;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 min-h-[440px] flex flex-col">
      <div className="flex items-center justify-between mb-1 shrink-0">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Performance History
        </h2>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                days === p.days
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 mb-4">
        {backfillStatus && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {coveragePct}% coverage
          </span>
        )}
        <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60 disabled:opacity-50"
            title="Fetch historical data for missing dates (52 weeks)"
          >
            {backfilling ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Download className="w-3 h-3" />
            )}
            {backfilling ? 'Backfilling...' : 'Backfill'}
        </button>
      </div>

      {statusError && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Failed to check backfill status: {statusError}
        </div>
      )}

      {needsBackfill && backfillStatus?.tickers_missing_data?.length > 0 && !backfillResult && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800/60 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-amber-800 dark:text-amber-400 font-medium">
                Missing historical data for {backfillStatus.tickers_missing_data.length} ticker(s)
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {backfillStatus.tickers_missing_data.map(ticker => (
                  <span key={ticker} className="text-xs bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded">
                    {ticker}
                    {backfillStatus.missing_by_ticker?.[ticker] && (
                      <span className="text-amber-600 dark:text-amber-400 ml-1">
                        ({backfillStatus.missing_by_ticker[ticker]} days)
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={handleBackfill}
              disabled={backfilling}
              className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 text-sm"
            >
              {backfilling ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Download className="w-3 h-3" />
              )}
              Backfill Now
            </button>
          </div>
        </div>
      )}

      {backfillResult && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          backfillResult.status === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400' :
          backfillResult.status === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' :
          'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
        }`}>
          <div className="flex items-center gap-2">
            {backfillResult.status === 'success' ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : backfillResult.status === 'error' ? (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            ) : null}
            <span>{backfillResult.message}</span>
          </div>
          {backfillResult.tickers_backfilled?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="text-xs text-green-600 dark:text-green-400">Tickers updated:</span>
              {backfillResult.tickers_backfilled.map(ticker => (
                <span key={ticker} className="text-xs bg-green-200 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-2 py-0.5 rounded">
                  {ticker}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {loadingHistory ? (
        <div className="flex-1 min-h-[200px] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : !hasHistory ? (
        <div className="flex-1 min-h-[200px] flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
          <BarChart3 className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
          <p>No historical data yet.</p>
          <p className="text-sm mt-1">
            {backfillStatus?.tickers_missing_data?.length > 0
              ? `Click "Backfill" to fetch data for ${backfillStatus.tickers_missing_data.length} ticker(s).`
              : 'Add stocks to your portfolio and click "Backfill" to fetch historical data.'}
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 12, fill: axisColor }}
                stroke={axisColor}
              />
              <YAxis
                tickFormatter={formatCurrency}
                tick={{ fontSize: 12, fill: axisColor }}
                stroke={axisColor}
                width={80}
              />
              <Tooltip
                formatter={(value) => [formatCurrency(value), 'Value']}
                labelFormatter={(label) => `Date: ${label}`}
                contentStyle={{
                  backgroundColor: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  borderRadius: '8px',
                  color: isDark ? '#e2e8f0' : '#1e293b',
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

    </div>
  );
}
