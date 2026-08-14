import { useEffect, useRef } from 'react';
import { Bell, X, CheckCheck, TrendingDown, Moon, Zap, Sparkles } from 'lucide-react';
import AiActionText from './AiActionText';

function alertIcon(type) {
  if (type === 'lot_profit_drop') return <TrendingDown className="w-4 h-4 text-amber-400 shrink-0" />;
  if (type === 'llm_must_act') return <Zap className="w-4 h-4 text-red-400 shrink-0" />;
  if (type === 'eod_summary') return <Moon className="w-4 h-4 text-slate-400 shrink-0" />;
  if (type === 'portfolio_review') return <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />;
  return <Bell className="w-4 h-4 text-slate-400 shrink-0" />;
}

function alertBadge(type) {
  if (type === 'lot_profit_drop') return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 uppercase tracking-wide">Profit</span>;
  if (type === 'llm_must_act') return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 uppercase tracking-wide">Must Act</span>;
  if (type === 'eod_summary') return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 uppercase tracking-wide">Daily Recap</span>;
  if (type === 'portfolio_review') return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 uppercase tracking-wide">AI Review</span>;
  return null;
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function AlertItem({ alert, onMarkRead }) {
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 border-b border-slate-800 hover:bg-slate-800/40 transition-colors ${
        !alert.is_read ? 'bg-slate-800/20' : ''
      }`}
    >
      <div className="mt-0.5">{alertIcon(alert.alert_type)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {alertBadge(alert.alert_type)}
          {alert.ticker && (
            <span className="text-[10px] font-bold text-slate-300 bg-slate-700 px-1.5 py-0.5 rounded">
              {alert.ticker}
            </span>
          )}
        </div>
        <div className={`text-sm leading-snug ${!alert.is_read ? 'text-slate-100' : 'text-slate-400'}`}>
          <AiActionText text={alert.message} />
        </div>
        <p className="text-xs text-slate-500 mt-1">{fmtTime(alert.triggered_at)}</p>
      </div>
      {!alert.is_read && (
        <button
          onClick={() => onMarkRead(alert.id)}
          className="shrink-0 mt-1 w-2 h-2 rounded-full bg-blue-400 hover:bg-blue-300 transition-colors cursor-pointer"
          title="Mark as read"
        />
      )}
    </div>
  );
}

export default function AlertsPanel({ alerts, unreadCount, onMarkRead, onMarkAllRead, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-[32rem] max-h-[75vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700 shrink-0">
        <Bell className="w-4 h-4 text-slate-300" />
        <span className="text-sm font-semibold text-slate-100 flex-1">
          Alerts{' '}
          {unreadCount > 0 && (
            <span className="text-blue-400">({unreadCount} new)</span>
          )}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-700 rounded transition-colors ml-1"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Alert list */}
      <div className="overflow-y-auto flex-1">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Bell className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No alerts yet</p>
            <p className="text-xs mt-1 text-slate-600">Alerts fire every 5 minutes</p>
          </div>
        ) : (
          alerts.map(alert => (
            <AlertItem key={alert.id} alert={alert} onMarkRead={onMarkRead} />
          ))
        )}
      </div>
    </div>
  );
}
