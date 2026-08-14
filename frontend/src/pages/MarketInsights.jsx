import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Loader2, BarChart3, Briefcase, Globe, Activity, Filter, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

// Module-scope caches (survive unmount/remount as you switch tabs) — matches the
// backend's own 5-minute screener/performance TTL so re-visiting the page doesn't
// re-trigger a slow Yahoo Finance round-trip for data that hasn't gone stale yet.
const CACHE_TTL_MS = 5 * 60 * 1000;
const _insightsCache = new Map(); // days -> { data: { portfolio, market }, ts }
const _screenerCache = new Map(); // screenerType -> { data, ts }

function getCached(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  return (Date.now() - entry.ts < CACHE_TTL_MS) ? entry.data : null;
}

// Proactive background refresh — keeps the "Today" cache warm every 30 minutes so
// the page has fresh data the moment someone opens it, instead of only fetching
// on-demand when the tab is visited. Started once from App.jsx regardless of
// whether the Market tab is currently mounted.
const AUTO_REFRESH_MS = 30 * 60 * 1000;
const INSIGHTS_REFRESHED_EVENT = 'market-insights-cache-updated';
let _autoRefreshTimer = null;

async function refreshInsightsCache(days) {
  try {
    const combined = await api.getCombinedInsights(days, 10);
    _insightsCache.set(days, { data: { portfolio: combined.portfolio, market: combined.market }, ts: Date.now() });
    window.dispatchEvent(new CustomEvent(INSIGHTS_REFRESHED_EVENT, { detail: { days } }));
  } catch (e) {
    console.error('Background market insights refresh failed:', e);
  }
}

export function startMarketInsightsAutoRefresh(days = 1) {
  if (_autoRefreshTimer) return;
  refreshInsightsCache(days);
  _autoRefreshTimer = setInterval(() => refreshInsightsCache(days), AUTO_REFRESH_MS);
}

const TIME_PERIODS = [
  { label: 'Today', value: 1 },
  { label: '7 Days', value: 7 },
  { label: '14 Days', value: 14 },
  { label: '1 Month', value: 30 },
  { label: '3 Months', value: 90 },
];

const SCREENER_OPTIONS = [
  { id: 'day_gainers', name: 'Top Gainers', icon: TrendingUp, color: 'text-green-600 dark:text-green-400' },
  { id: 'day_losers', name: 'Top Losers', icon: TrendingDown, color: 'text-red-600 dark:text-red-400' },
  { id: 'most_actives', name: 'Most Active', icon: Activity, color: 'text-blue-600 dark:text-blue-400' },
  { id: 'growth_technology_stocks', name: 'Growth Tech', icon: TrendingUp, color: 'text-purple-600 dark:text-purple-400' },
  { id: 'undervalued_large_caps', name: 'Undervalued Large Caps', icon: BarChart3, color: 'text-amber-600 dark:text-amber-400' },
  { id: 'aggressive_small_caps', name: 'Aggressive Small Caps', icon: TrendingUp, color: 'text-pink-600 dark:text-pink-400' },
];

function formatMarketCap(value) {
  if (!value) return '-';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString()}`;
}

function formatVolume(value) {
  if (!value) return '-';
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}

function StockCard({ stock, rank, showVolume = false }) {
  const changePct = stock.change_pct ?? 0;
  const changeDollar = stock.change ?? 0;
  const isPositive = changePct >= 0;
  const price = stock.current_price || stock.end_price || 0;
  
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800/60 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
      {rank && (
        <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-slate-300 font-semibold text-xs">
          {rank}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 dark:text-slate-100">{stock.ticker}</span>
          <span className="text-xs text-gray-500 dark:text-slate-400 truncate max-w-[150px]">{stock.name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          {stock.sector && stock.sector !== 'Unknown' && (
            <span>{stock.sector}</span>
          )}
          {stock.market_cap > 0 && (
            <span className="text-gray-400 dark:text-slate-500">{formatMarketCap(stock.market_cap)}</span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="font-medium">${price.toFixed(2)}</div>
        <div className={`flex items-center justify-end gap-1 text-sm ${
          isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}>
          {isPositive ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          <span>{isPositive ? '+' : ''}${Math.abs(changeDollar).toFixed(2)}</span>
          <span className="text-xs opacity-75">({isPositive ? '+' : ''}{changePct.toFixed(2)}%)</span>
        </div>
        {showVolume && stock.volume > 0 && (
          <div className="text-xs text-gray-400 dark:text-slate-500">Vol: {formatVolume(stock.volume)}</div>
        )}
      </div>
    </div>
  );
}

function StockList({ stocks, loading, emptyMessage, showVolume = false }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
    );
  }

  if (!stocks || stocks.length === 0) {
    return (
      <p className="text-gray-500 dark:text-slate-400 text-center py-8">{emptyMessage}</p>
    );
  }

  return (
    <div className="space-y-2">
      {stocks.map((stock, idx) => (
        <StockCard key={stock.ticker} stock={stock} rank={idx + 1} showVolume={showVolume} />
      ))}
    </div>
  );
}

function InsightsSection({ title, icon: Icon, gainers, losers, mostActive, loading, emptyMessage }) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Icon className="w-5 h-5" />
          {title}
        </h3>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400" />
        </div>
      </div>
    );
  }

  const hasData = (gainers?.length > 0) || (losers?.length > 0) || (mostActive?.length > 0);

  if (!hasData) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Icon className="w-5 h-5" />
          {title}
        </h3>
        <p className="text-gray-500 dark:text-slate-400 text-center py-8">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Icon className="w-5 h-5" />
        {title}
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {gainers && (
          <div>
            <h4 className="text-sm font-medium text-green-700 dark:text-green-400 mb-3 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              Top Gainers
            </h4>
            <StockList stocks={gainers} emptyMessage="No gainers" />
          </div>
        )}

        {losers && (
          <div>
            <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-3 flex items-center gap-1">
              <TrendingDown className="w-4 h-4" />
              Top Losers
            </h4>
            <StockList stocks={losers} emptyMessage="No losers" />
          </div>
        )}

        {mostActive && (
          <div>
            <h4 className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-1">
              <Activity className="w-4 h-4" />
              Most Active
            </h4>
            <StockList stocks={mostActive} emptyMessage="No data" showVolume={true} />
          </div>
        )}
      </div>
    </div>
  );
}

function ScreenerView({ screenerType, onBack }) {
  const [data, setData] = useState(() => getCached(_screenerCache, screenerType));
  const [loading, setLoading] = useState(!getCached(_screenerCache, screenerType));

  const screenerInfo = SCREENER_OPTIONS.find(s => s.id === screenerType);

  useEffect(() => {
    const cached = getCached(_screenerCache, screenerType);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }
    loadData();
  }, [screenerType]);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await api.getScreenerData(screenerType, 25);
      _screenerCache.set(screenerType, { data: result, ts: Date.now() });
      setData(result);
    } catch (error) {
      console.error('Failed to load screener:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          {screenerInfo && <screenerInfo.icon className={`w-5 h-5 ${screenerInfo.color}`} />}
          {screenerInfo?.name || screenerType}
        </h3>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            title="Refresh"
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-100 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onBack}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
          >
            ← Back to Overview
          </button>
        </div>
      </div>

      <StockList
        stocks={data?.stocks}
        loading={loading}
        emptyMessage="No stocks found"
        showVolume={screenerType === 'most_actives'}
      />
    </div>
  );
}

export default function MarketInsights({ onBack }) {
  const [days, setDays] = useState(1);
  const [view, setView] = useState('overview');
  const [selectedScreener, setSelectedScreener] = useState(null);
  const cached = getCached(_insightsCache, days);
  const [portfolioData, setPortfolioData] = useState(cached?.portfolio ?? null);
  const [marketData, setMarketData] = useState(cached?.market ?? null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(!cached);
  const [loadingMarket, setLoadingMarket] = useState(!cached);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (view !== 'overview') return;
    const fresh = getCached(_insightsCache, days);
    if (fresh) {
      setPortfolioData(fresh.portfolio);
      setMarketData(fresh.market);
      setLoadingPortfolio(false);
      setLoadingMarket(false);
      setError(null);
      return;
    }
    loadInsights();
  }, [days, view]);

  // Pick up data pushed in by the background 30-min auto-refresh (see
  // startMarketInsightsAutoRefresh) while this page happens to be open.
  useEffect(() => {
    const onRefreshed = (e) => {
      if (e.detail?.days !== days) return;
      const fresh = getCached(_insightsCache, days);
      if (fresh) {
        setPortfolioData(fresh.portfolio);
        setMarketData(fresh.market);
        setLoadingPortfolio(false);
        setLoadingMarket(false);
      }
    };
    window.addEventListener(INSIGHTS_REFRESHED_EVENT, onRefreshed);
    return () => window.removeEventListener(INSIGHTS_REFRESHED_EVENT, onRefreshed);
  }, [days]);

  const loadInsights = async () => {
    setLoadingPortfolio(true);
    setLoadingMarket(true);
    setError(null);

    try {
      const combined = await api.getCombinedInsights(days, 10);
      _insightsCache.set(days, { data: { portfolio: combined.portfolio, market: combined.market }, ts: Date.now() });
      setPortfolioData(combined.portfolio);
      setMarketData(combined.market);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingPortfolio(false);
      setLoadingMarket(false);
    }
  };

  const handleScreenerClick = (screenerId) => {
    setSelectedScreener(screenerId);
    setView('screener');
  };

  return (
    <div className="flex-1 bg-gray-50 dark:bg-slate-900">
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {view === 'overview' && (
          <>
            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-slate-300">Time Period:</span>
                {TIME_PERIODS.map((period) => (
                  <button
                    key={period.value}
                    onClick={() => setDays(period.value)}
                    className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                      days === period.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700'
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
                <button
                  onClick={loadInsights}
                  disabled={loadingPortfolio || loadingMarket}
                  title="Refresh"
                  className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-100 disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${(loadingPortfolio || loadingMarket) ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Quick Screeners (Real-time)
              </h3>
              <div className="flex flex-wrap gap-2">
                {SCREENER_OPTIONS.map((screener) => (
                  <button
                    key={screener.id}
                    onClick={() => handleScreenerClick(screener.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 hover:border-gray-300 dark:hover:border-slate-500 transition-colors"
                  >
                    <screener.icon className={`w-4 h-4 ${screener.color}`} />
                    <span className="text-sm text-gray-700 dark:text-slate-200">{screener.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 rounded-lg">
                Error: {error}
              </div>
            )}

            <div className="space-y-6">
              {portfolioData && (
                <InsightsSection
                  title="Your Portfolio Performance"
                  icon={Briefcase}
                  gainers={portfolioData.gainers}
                  losers={portfolioData.losers}
                  loading={loadingPortfolio}
                  emptyMessage="Add stocks to your portfolio to see performance insights."
                />
              )}

              <InsightsSection
                title={days === 1 ? "Market Movers (Today)" : `Market Performance (${days} Days)`}
                icon={Globe}
                gainers={marketData?.gainers}
                losers={marketData?.losers}
                mostActive={days === 1 ? marketData?.most_active : null}
                loading={loadingMarket}
                emptyMessage="Unable to load market data."
              />
            </div>

            <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950/40 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2">About Market Insights</h4>
              <p className="text-sm text-blue-800 dark:text-blue-300">
                {days === 1
                  ? "Real-time data from Yahoo Finance screeners showing mega/large cap stocks with significant moves today."
                  : `Historical performance calculated over the last ${days} days using trending market tickers.`
                }
                {" "}Market stocks shown exclude those already in your portfolio.
              </p>
            </div>
          </>
        )}

        {view === 'screener' && selectedScreener && (
          <ScreenerView 
            screenerType={selectedScreener} 
            onBack={() => setView('overview')} 
          />
        )}
      </main>
    </div>
  );
}
