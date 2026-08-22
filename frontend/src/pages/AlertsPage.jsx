import { useState, useEffect, useCallback } from 'react';
import {
  Bell, CheckCheck, Trash2, RefreshCw, TrendingDown, Moon, Zap, Sparkles,
  AlertTriangle, CheckCircle2, Gauge,
} from 'lucide-react';
import { api } from '../services/api';
import AiActionText from '../components/AiActionText';

function alertIcon(type) {
  if (type === 'lot_profit_drop') return <TrendingDown className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />;
  if (type === 'llm_must_act') return <Zap className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />;
  if (type === 'eod_summary') return <Moon className="w-4 h-4 text-slate-400 shrink-0" />;
  if (type === 'portfolio_review') return <Sparkles className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />;
  return <Bell className="w-4 h-4 text-slate-400 shrink-0" />;
}

function alertBadge(type) {
  const cls = 'text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide';
  if (type === 'lot_profit_drop') return <span className={`${cls} bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300`}>Profit</span>;
  if (type === 'llm_must_act') return <span className={`${cls} bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300`}>Must Act</span>;
  if (type === 'eod_summary') return <span className={`${cls} bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300`}>Daily Recap</span>;
  if (type === 'portfolio_review') return <span className={`${cls} bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300`}>AI Review</span>;
  return null;
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function StatusCard({ icon, label, enabled, statusLabel, statusColor, children }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
        </div>
        {!enabled ? (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 uppercase tracking-wide">Disabled</span>
        ) : (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${statusColor}`}>{statusLabel}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function LiveConditions({ live, onTickerClick }) {
  if (!live) return null;
  const drop = live.portfolio_drop;
  const crossing = live.lot_crossing;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <StatusCard
        icon={<Gauge className="w-4 h-4 text-slate-400" />}
        label="Portfolio Drop"
        enabled={drop.enabled}
        statusLabel={drop.triggered ? 'Triggered' : 'Normal'}
        statusColor={drop.triggered ? 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'}
      >
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold tabular-nums ${
            drop.today_pct == null ? 'text-slate-400 dark:text-slate-500' : drop.today_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
          }`}>
            {drop.today_pct != null ? `${drop.today_pct >= 0 ? '+' : ''}${drop.today_pct.toFixed(2)}%` : '—'}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">today, fires at {drop.threshold_pct}%</span>
        </div>
      </StatusCard>

      <StatusCard
        icon={<TrendingDown className="w-4 h-4 text-slate-400" />}
        label="Lot Profit Crossing"
        enabled={crossing.enabled}
        statusLabel={crossing.pending_crossing_tickers.length > 0 ? 'Pending' : 'Normal'}
        statusColor={crossing.pending_crossing_tickers.length > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'}
      >
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
          {crossing.lots_above_threshold.length} lot(s) currently ≥ +{crossing.threshold_pct}% gain
        </p>
        {crossing.lots_above_threshold.length > 0 ? (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {crossing.lots_above_threshold.map(lot => (
              <button
                key={lot.lot_id}
                onClick={() => onTickerClick?.(lot.ticker)}
                className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
              >
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{lot.ticker}</span>
                <span className="text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  +{lot.gain_loss_pct.toFixed(1)}% (${lot.gain_loss.toFixed(0)})
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500">No lots above threshold right now</p>
        )}
      </StatusCard>
    </div>
  );
}

function AlertRow({ alert, onMarkRead }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors ${!alert.is_read ? 'bg-blue-50/40 dark:bg-slate-700/20' : ''}`}>
      <div className="mt-0.5">{alertIcon(alert.alert_type)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {alertBadge(alert.alert_type)}
          {alert.ticker && (
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
              {alert.ticker}
            </span>
          )}
        </div>
        <div className={`text-sm leading-snug ${!alert.is_read ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>
          <AiActionText text={alert.message} />
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{fmtTime(alert.triggered_at)}</p>
      </div>
      {!alert.is_read && (
        <button
          onClick={() => onMarkRead(alert.id)}
          className="shrink-0 mt-1 w-2 h-2 rounded-full bg-blue-500 hover:bg-blue-400 transition-colors cursor-pointer"
          title="Mark as read"
        />
      )}
    </div>
  );
}

export default function AlertsPage({ alerts, unreadCount, onMarkRead, onMarkAllRead, onRefreshAlerts, onTickerClick }) {
  const [live, setLive] = useState(null);
  const [loadingLive, setLoadingLive] = useState(true);
  const [clearing, setClearing] = useState(false);

  const loadLive = useCallback(async () => {
    setLoadingLive(true);
    try {
      const data = await api.getLiveAlertConditions();
      setLive(data);
    } catch {
      // non-critical
    } finally {
      setLoadingLive(false);
    }
  }, []);

  useEffect(() => { loadLive(); }, [loadLive]);

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await api.clearAllAlerts();
      await onRefreshAlerts?.();
    } finally {
      setClearing(false);
    }
  };

  return (
    <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-500 dark:text-blue-400" />
          Alerts
        </h1>
        <button
          onClick={loadLive}
          disabled={loadingLive}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingLive ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Live Conditions</h2>
        {loadingLive && !live ? (
          <div className="flex items-center justify-center py-10 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
          </div>
        ) : (
          <LiveConditions live={live} onTickerClick={onTickerClick} />
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            History {unreadCount > 0 && <span className="text-blue-500 dark:text-blue-400 normal-case">({unreadCount} new)</span>}
          </h2>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button onClick={onMarkAllRead} className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors">
                <CheckCheck className="w-3.5 h-3.5" />Mark all read
              </button>
            )}
            {alerts.length > 0 && (
              <button onClick={handleClearAll} disabled={clearing} className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" />Clear all
              </button>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
              <Bell className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No alerts yet</p>
            </div>
          ) : (
            <div className="max-h-[32rem] overflow-y-auto">
              {alerts.map(alert => (
                <AlertRow key={alert.id} alert={alert} onMarkRead={onMarkRead} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
