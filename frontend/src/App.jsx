import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, BarChart3, TrendingUp, Plus, LineChart, LayoutDashboard, Receipt, Bell, Settings, Search, Star } from 'lucide-react';
import { api } from './services/api';
import AddStockDialog from './components/AddStockDialog';
import MoversPage from './pages/MoversPage';
import HistoryPage from './pages/HistoryPage';
import TickerDetailPanel from './components/TickerDetailPanel';
import AIChatWidget from './components/AIChatWidget';
import TopMoversWidget from './components/TopMoversWidget';
import PortfolioMixWidget from './components/PortfolioMixWidget';
import WatchlistWidget from './components/WatchlistWidget';
import NetWealthWidget from './components/NetWealthWidget';
import MarketInsights, { startMarketInsightsAutoRefresh } from './pages/MarketInsights';
import RealizedPage from './pages/RealizedPage';
import WatchlistPage from './pages/WatchlistPage';
import AlertsPage from './pages/AlertsPage';
import SettingsPage from './pages/SettingsPage';

function fmt(n) { return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

function isMarketOpen() {
  const etStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etStr);
  const day = et.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 570 && mins < 960; // 9:30 AM – 4:00 PM ET
}

function RefreshBar({ lastRefreshed, refreshIntervalMs, portfolio }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!lastRefreshed) return null;

  const marketOpen = isMarketOpen();
  const elapsedMs = Date.now() - lastRefreshed.getTime();
  const remainMs  = Math.max(0, refreshIntervalMs - elapsedMs);
  const remainSec = Math.floor(remainMs / 1000);
  const mins      = Math.floor(remainSec / 60);
  const secs      = remainSec % 60;
  const timeStr   = lastRefreshed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });

  // Today's gains/losses from portfolio
  let todayGains = 0, todayLosses = 0, hasToday = false;
  for (const s of portfolio?.stocks ?? []) {
    if (s.return_1d == null) continue;
    hasToday = true;
    const delta = (s.current_price * s.return_1d / (100 + s.return_1d)) * s.total_quantity;
    if (delta >= 0) todayGains += delta; else todayLosses += delta;
  }
  const todayNet = todayGains + todayLosses;
  const netPos = todayNet >= 0;

  // Overall (all-time unrealized) gains/losses from portfolio — lot-level, to match Holdings Losses/Gains tabs
  let overallGains = 0, overallLosses = 0, hasOverall = false;
  for (const s of portfolio?.stocks ?? []) {
    for (const lot of s.lots ?? []) {
      if (lot.gain_loss == null) continue;
      hasOverall = true;
      if (lot.gain_loss >= 0) overallGains += lot.gain_loss; else overallLosses += lot.gain_loss;
    }
  }
  const overallNet = overallGains + overallLosses;
  const overallNetPos = overallNet >= 0;

  return (
    <div className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 overflow-x-auto">
      <div className="max-w-screen-2xl mx-auto flex items-center gap-5 w-max min-w-full">
        <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
          Last updated: <span className="text-slate-700 dark:text-slate-200 font-medium">{timeStr}</span>
        </span>

        <span className={`text-sm font-semibold px-2 py-0.5 rounded shrink-0 whitespace-nowrap ${marketOpen ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
          {marketOpen ? 'Market open' : 'Market closed'}
        </span>

        {portfolio?.total_value != null && (
          <>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 shrink-0" />
            <span className="text-sm text-slate-400 dark:text-slate-500 shrink-0 whitespace-nowrap">
              Portfolio Value&nbsp;
              <span className="text-slate-900 dark:text-slate-100 font-bold tabular-nums">${fmt(portfolio.total_value)}</span>
            </span>
          </>
        )}

        {hasToday && (
          <>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 shrink-0" />
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold shrink-0 whitespace-nowrap">Today</span>
              <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0 whitespace-nowrap">
                Gaining&nbsp;<span className="text-emerald-700 dark:text-emerald-300">+${fmt(todayGains)}</span>
              </span>
              <span className="text-sm font-bold tabular-nums text-red-500 dark:text-red-400 shrink-0 whitespace-nowrap">
                Losing&nbsp;<span className="text-red-600 dark:text-red-300">-${fmt(Math.abs(todayLosses))}</span>
              </span>
              <span className={`text-sm font-bold tabular-nums shrink-0 whitespace-nowrap ${netPos ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                Net&nbsp;{netPos ? '+' : '-'}${fmt(Math.abs(todayNet))}
              </span>
            </div>
          </>
        )}

        {hasOverall && (
          <>
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 shrink-0" />
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold shrink-0 whitespace-nowrap">Overall</span>
              <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0 whitespace-nowrap">
                Gaining&nbsp;<span className="text-emerald-700 dark:text-emerald-300">+${fmt(overallGains)}</span>
              </span>
              <span className="text-sm font-bold tabular-nums text-red-500 dark:text-red-400 shrink-0 whitespace-nowrap">
                Losing&nbsp;<span className="text-red-600 dark:text-red-300">-${fmt(Math.abs(overallLosses))}</span>
              </span>
              <span className={`text-sm font-bold tabular-nums shrink-0 whitespace-nowrap ${overallNetPos ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                Net&nbsp;{overallNetPos ? '+' : '-'}${fmt(Math.abs(overallNet))}
              </span>
            </div>
          </>
        )}

        <span className="text-sm text-slate-400 dark:text-slate-500 ml-auto shrink-0 whitespace-nowrap">
          {marketOpen
            ? <>Next refresh in <span className="text-slate-700 dark:text-slate-300 font-medium tabular-nums">{mins}:{String(secs).padStart(2, '0')}</span></>
            : <span className="text-slate-400 dark:text-slate-600">Auto-refresh paused (market closed)</span>
          }
        </span>
      </div>
    </div>
  );
}

function TickerSearch({ onSearch }) {
  const [value, setValue] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const ticker = value.trim().toUpperCase();
    if (!ticker) return;
    onSearch(ticker);
    setValue('');
  };

  return (
    <form onSubmit={submit} className="relative shrink-0">
      <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Look up ticker…"
        aria-label="Look up ticker"
        className="w-32 sm:w-44 pl-8 pr-2 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
      />
    </form>
  );
}

function LeftRail({ portfolio, currentPage, onSettings, onTickerClick, onRemoveFromWatchlist }) {
  // 'movers' | 'mix' | 'watchlist' | 'wealth' | 'ai' | null — mutually exclusive, closed by default.
  const [openPanel, setOpenPanel] = useState(null);

  return (
    // No transform here: a transformed ancestor becomes the containing block for any
    // position:fixed descendant, which broke the Movers/AI panels (they'd get clipped
    // to this rail's tiny box instead of the viewport). Center with flex instead.
    <div className="fixed left-0 inset-y-0 z-40 flex items-center">
      <div className="flex flex-col items-center gap-1 py-3 px-1.5 rounded-r-xl bg-white dark:bg-slate-900 border border-l-0 border-slate-200 dark:border-slate-800 shadow-lg">
        <TopMoversWidget
          portfolio={portfolio}
          open={openPanel === 'movers'}
          onOpenChange={(v) => setOpenPanel(v ? 'movers' : null)}
          onTickerClick={onTickerClick}
        />
        <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 my-1" />
        <PortfolioMixWidget
          portfolio={portfolio}
          open={openPanel === 'mix'}
          onOpenChange={(v) => setOpenPanel(v ? 'mix' : null)}
          onTickerClick={onTickerClick}
        />
        <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 my-1" />
        <WatchlistWidget
          open={openPanel === 'watchlist'}
          onOpenChange={(v) => setOpenPanel(v ? 'watchlist' : null)}
          onTickerClick={onTickerClick}
          onRemoveFromWatchlist={onRemoveFromWatchlist}
        />
        <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 my-1" />
        <NetWealthWidget
          portfolio={portfolio}
          open={openPanel === 'wealth'}
          onOpenChange={(v) => setOpenPanel(v ? 'wealth' : null)}
        />
        <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 my-1" />
        <AIChatWidget
          open={openPanel === 'ai'}
          onOpenChange={(v) => setOpenPanel(v ? 'ai' : null)}
        />
        <div className="w-6 h-px bg-slate-200 dark:bg-slate-800 my-1" />
        <button
          onClick={() => { setOpenPanel(null); onSettings(); }}
          title="Settings"
          className={`p-2 rounded-lg transition-colors ${
            currentPage === 'settings' ? 'bg-slate-600 text-white' : 'text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [currentPage, setCurrentPage] = useState('movers');
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [realized, setRealized] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [trendsPeriod, setTrendsPeriod] = useState('1d');
  const [watchlist, setWatchlist] = useState([]);

  const AUTO_REFRESH_MS = 15 * 60 * 1000;
  const lastRefreshedRef = useRef(null);

  const loadRealized = useCallback(async () => {
    try {
      const data = await api.getRealized();
      setRealized(data);
    } catch {
      // non-critical
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const [alertData, countData] = await Promise.all([
        api.getAlerts(false, 50),
        api.getUnreadAlertCount(),
      ]);
      setAlerts(alertData);
      setUnreadCount(countData.count);
    } catch {
      // non-critical
    }
  }, []);

  const handleMarkAlertRead = async (id) => {
    await api.markAlertRead(id);
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    await api.markAllAlertsRead();
    setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
    setUnreadCount(0);
  };

  const loadWatchlist = useCallback(async () => {
    try {
      const data = await api.getWatchlist();
      setWatchlist(data.map(w => w.ticker));
    } catch {
      // non-critical
    }
  }, []);

  const handleAddToWatchlist = useCallback(async (ticker) => {
    ticker = ticker.toUpperCase();
    await api.addToWatchlist(ticker);
    setWatchlist(prev => prev.includes(ticker) ? prev : [...prev, ticker]);
  }, []);

  const handleRemoveFromWatchlist = useCallback(async (ticker) => {
    ticker = ticker.toUpperCase();
    await api.removeFromWatchlist(ticker);
    setWatchlist(prev => prev.filter(t => t !== ticker));
  }, []);

  const loadPortfolio = useCallback(async () => {
    try {
      const portfolioData = await api.getPortfolio();
      setPortfolio(portfolioData);
      const now = new Date();
      lastRefreshedRef.current = now;
      setLastRefreshed(now);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + 15-min interval (only fires when market is open)
  useEffect(() => {
    loadPortfolio();
    loadRealized();
    loadAlerts();
    loadWatchlist();
    startMarketInsightsAutoRefresh();
    const interval = setInterval(() => {
      if (isMarketOpen()) {
        loadPortfolio();
        loadAlerts();
      }
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadPortfolio, loadRealized, loadAlerts, loadWatchlist]);

  // Refresh on tab visibility or window focus (market hours only, 1-min cooldown)
  useEffect(() => {
    const COOLDOWN_MS = 60_000;
    const maybeRefresh = () => {
      if (!isMarketOpen()) return;
      const elapsed = Date.now() - (lastRefreshedRef.current?.getTime() ?? 0);
      if (elapsed > COOLDOWN_MS) {
        loadPortfolio();
        loadAlerts();
      }
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') maybeRefresh(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', maybeRefresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', maybeRefresh);
    };
  }, [loadPortfolio, loadAlerts]);

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear all holdings? This cannot be undone.')) return;
    try {
      await api.clearAllHoldings();
      await loadPortfolio();
    } catch (err) {
      alert('Failed to clear holdings: ' + err.message);
    }
  };

  const handleTickerClick = useCallback((ticker) => setSelectedTicker(ticker), []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Loading portfolio…</p>
        </div>
      </div>
    );
  }

  const navBtn = (page, icon, label, badge) => (
    <button
      onClick={() => setCurrentPage(page)}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        currentPage === page
          ? 'bg-slate-600 text-white'
          : 'text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
      }`}
    >
      {icon}{label}
      {badge > 0 && (
        <span className="ml-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      {/* ── Header (always visible) ── */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 h-14">
            <button onClick={() => setCurrentPage('movers')} className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0">
              <TrendingUp className="w-5 h-5 text-blue-500 dark:text-blue-400" />
              <span className="text-slate-900 dark:text-white font-semibold tracking-tight">Portfolio Tracker</span>
            </button>

            {/* Nav tabs — visually centered in the header */}
            <div className="flex items-center justify-center gap-1 min-w-0">
              {navBtn('movers',   <LayoutDashboard className="w-4 h-4" />, 'Holdings')}
              {navBtn('history',  <LineChart       className="w-4 h-4" />, 'Performance')}
              {navBtn('insights', <BarChart3   className="w-4 h-4" />, 'Market')}
              {navBtn('realized', <Receipt     className="w-4 h-4" />, 'Taxes')}
              {navBtn('watchlist', <Star       className="w-4 h-4" />, 'Watchlist')}
              {navBtn('alerts',   <Bell        className="w-4 h-4" />, 'Alerts', unreadCount)}
              <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
              <TickerSearch onSearch={handleTickerClick} />
            </div>

            {/* Actions — right-aligned */}
            <div className="flex items-center gap-1 justify-self-end shrink-0">
              <button onClick={() => setDialog('manual')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors">
                <Plus className="w-4 h-4" />Add Stock
              </button>
            </div>
          </div>
        </div>
      </header>

      <RefreshBar lastRefreshed={lastRefreshed} refreshIntervalMs={AUTO_REFRESH_MS} portfolio={portfolio} />

      {/* ── Global banners ── */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800/60 px-4 py-2">
          <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
            <p className="text-sm text-red-700 dark:text-red-400"><span className="font-semibold">Error fetching data:</span> {error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 text-xs underline shrink-0">Dismiss</button>
          </div>
        </div>
      )}
      {!error && portfolio?.fetch_errors?.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 px-4 py-2">
          <div className="max-w-screen-2xl mx-auto">
            <p className="text-sm text-amber-800 dark:text-amber-400">
              <span className="font-semibold">Yahoo Finance warning:</span>{' '}
              {portfolio.fetch_errors.join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* ── Page content ── */}
      {/* pl-14 reserves space so page content (e.g. table checkboxes flush against the
          left edge) never sits underneath the fixed LeftRail. */}
      <div className="flex-1 flex flex-col pl-14 min-w-0">
        {currentPage === 'movers' && (
          <MoversPage
            portfolio={portfolio}
            onTickerClick={handleTickerClick}
            onOpenSettings={() => setCurrentPage('settings')}
            onRefresh={loadPortfolio}
            lastRefreshed={lastRefreshed}
            period={trendsPeriod}
            onPeriodChange={setTrendsPeriod}
          />
        )}
        {currentPage === 'history' && (
          <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-5">
            <HistoryPage portfolio={portfolio} realized={realized} onBackfillComplete={loadPortfolio} onTickerClick={handleTickerClick} />
          </main>
        )}
        {currentPage === 'insights' && (
          <MarketInsights onTickerClick={handleTickerClick} />
        )}
        {currentPage === 'realized' && (
          <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
            <RealizedPage onSave={loadRealized} />
          </main>
        )}
        {currentPage === 'watchlist' && (
          <WatchlistPage
            onTickerClick={handleTickerClick}
            onAddToWatchlist={handleAddToWatchlist}
            onRemoveFromWatchlist={handleRemoveFromWatchlist}
          />
        )}
        {currentPage === 'alerts' && (
          <AlertsPage
            alerts={alerts}
            unreadCount={unreadCount}
            onMarkRead={handleMarkAlertRead}
            onMarkAllRead={handleMarkAllRead}
            onRefreshAlerts={loadAlerts}
            onTickerClick={handleTickerClick}
          />
        )}
        {currentPage === 'settings' && (
          <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
            <SettingsPage
              onClearAll={handleClearAll}
              portfolio={portfolio}
              onTickerClick={handleTickerClick}
              onPortfolioChange={loadPortfolio}
            />
          </main>
        )}
      </div>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-2 text-center">
        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          API Docs (Swagger)
        </a>
      </footer>

      <AddStockDialog
        isOpen={dialog !== null}
        defaultTab={dialog || 'manual'}
        onClose={() => setDialog(null)}
        onSuccess={loadPortfolio}
      />

      {selectedTicker && (
        <TickerDetailPanel
          ticker={selectedTicker}
          portfolio={portfolio}
          onClose={() => setSelectedTicker(null)}
          inWatchlist={watchlist.includes(selectedTicker.toUpperCase())}
          onAddToWatchlist={handleAddToWatchlist}
        />
      )}

      <LeftRail portfolio={portfolio} currentPage={currentPage} onSettings={() => setCurrentPage('settings')} onTickerClick={handleTickerClick} onRemoveFromWatchlist={handleRemoveFromWatchlist} />
    </div>
  );
}
