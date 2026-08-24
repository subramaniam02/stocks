import { useState, useEffect } from 'react';
import { LayoutGrid, Circle, Settings as SettingsIcon, Trash2, Info, Sun, Moon, Bug, ChevronDown, ChevronRight, Bell, FileText, X, RefreshCw } from 'lucide-react';
import { REFRESH_INTERVAL_OPTIONS } from '../utils/refreshSettings';
import {
  VIS_STYLES,
  getTodayStyle, setTodayStyle,
  getOverallStyle, setOverallStyle,
} from '../utils/moversSettings';
import { useTheme } from '../contexts/ThemeContext';
import { api } from '../services/api';
import DebugPage from './DebugPage';
import ReportPage from './ReportPage';

const ALERT_TOGGLES = [
  { key: 'lot_crossing_enabled', label: 'Lot profit-drop', hint: 'A lot crossing back below +10% profit.' },
  { key: 'portfolio_drop_enabled', label: 'Portfolio drop', hint: 'Portfolio value down 5%+ for the day.' },
  { key: 'must_act_enabled', label: 'Must-act check', hint: 'Midday LLM check for urgent situations.' },
  { key: 'market_close_review_enabled', label: 'Market-close review', hint: 'Daily LLM recap + buy/sell/harvest actions.' },
  { key: 'daily_summary_enabled', label: 'Daily summary', hint: 'Total % plus best/worst performer, end of day.' },
  { key: 'weekly_summary_enabled', label: 'Weekly summary', hint: 'Total % plus best/worst performer, Fridays.' },
  { key: 'monthly_summary_enabled', label: 'Monthly summary', hint: 'Total % plus best/worst performer, 1st of month.' },
];

function ToggleSwitch({ checked, onChange, label }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative inline-flex items-center h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
      }`}
    >
      <span
        className={`absolute left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function AlertsSetting() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    api.getAlertSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  const handleToggle = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    api.updateAlertSettings({ [key]: value }).catch(() => {
      // Revert on failure
      setSettings(prev => ({ ...prev, [key]: !value }));
    });
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <Bell className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Alerts</h3>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 mb-4">
        Checks run at midday and market close (12:05 PM / 4:05 PM ET) — turn any off individually.
      </p>
      {!settings ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {ALERT_TOGGLES.map(({ key, label, hint }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-700 dark:text-slate-200">{label}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>
              </div>
              <ToggleSwitch
                checked={!!settings[key]}
                onChange={(v) => handleToggle(key, v)}
                label={label}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeSetting() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex items-center justify-between">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Appearance</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Switch between light and dark mode.</p>
      </div>
      <button
        onClick={toggleTheme}
        role="switch"
        aria-checked={isDark}
        aria-label="Toggle dark mode"
        className={`relative inline-flex items-center h-8 w-16 shrink-0 rounded-full transition-colors ${
          isDark ? 'bg-slate-700' : 'bg-slate-200'
        }`}
      >
        <span
          className={`absolute left-1 flex items-center justify-center w-6 h-6 rounded-full bg-white shadow transition-transform ${
            isDark ? 'translate-x-8' : 'translate-x-0'
          }`}
        >
          {isDark
            ? <Moon className="w-3.5 h-3.5 text-slate-700" />
            : <Sun className="w-3.5 h-3.5 text-amber-500" />}
        </span>
      </button>
    </div>
  );
}

function RefreshIntervalSetting({ value, onChange }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <RefreshCw className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Auto-Refresh Frequency</h3>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 mb-4">
        How often the portfolio and alerts refresh automatically while the market is open.
      </p>
      <div className="flex flex-wrap gap-2">
        {REFRESH_INTERVAL_OPTIONS.map(minutes => (
          <button
            key={minutes}
            onClick={() => onChange(minutes)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
              value === minutes
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500 text-slate-600 dark:text-slate-300'
            }`}
          >
            {minutes === 1 ? '1 min' : `${minutes} min`}
          </button>
        ))}
      </div>
    </div>
  );
}

function StyleOption({ icon, title, description, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-start gap-3 text-left p-4 rounded-xl border transition-colors ${
        active
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500 bg-white dark:bg-slate-800'
      }`}
    >
      <div className={`p-2 rounded-lg shrink-0 ${active ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
        {icon}
      </div>
      <div>
        <p className={`text-sm font-semibold ${active ? 'text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-200'}`}>{title}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{description}</p>
      </div>
    </button>
  );
}

function VisualizationSetting({ label, hint, value, onChange }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</h3>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 mb-4">{hint}</p>
      <div className="flex gap-3">
        <StyleOption
          icon={<LayoutGrid className="w-4 h-4" />}
          title="Heatmap"
          description="Tiles sized by position value, colored by change."
          active={value === VIS_STYLES.HEAT}
          onClick={() => onChange(VIS_STYLES.HEAT)}
        />
        <StyleOption
          icon={<Circle className="w-4 h-4" />}
          title="Bubble"
          description="Scatter plot, bubble size reflects position value."
          active={value === VIS_STYLES.BUBBLE}
          onClick={() => onChange(VIS_STYLES.BUBBLE)}
        />
      </div>
    </div>
  );
}

function ReportSetting({ portfolio, onTickerClick, onPortfolioChange }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Reports</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Portfolio gain/loss report, lot selection, and sell tool.</p>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors shrink-0"
        >
          Open Reports
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="fixed inset-4 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Reports</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <ReportPage portfolio={portfolio} onTickerClick={onTickerClick} onPortfolioChange={onPortfolioChange} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DeveloperSetting() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between gap-3 p-5 text-left"
      >
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Developer</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">LLM debug log for the AI chat widget.</p>
          </div>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />}
      </button>
      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <DebugPage />
        </div>
      )}
    </div>
  );
}

export default function SettingsPage({ onClearAll, portfolio, onTickerClick, onPortfolioChange, refreshIntervalMinutes, onRefreshIntervalChange }) {
  const [todayStyle, setTodayStyleState] = useState(getTodayStyle());
  const [overallStyle, setOverallStyleState] = useState(getOverallStyle());

  const handleTodayChange = (style) => {
    setTodayStyle(style);
    setTodayStyleState(style);
  };

  const handleOverallChange = (style) => {
    setOverallStyle(style);
    setOverallStyleState(style);
  };

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex items-center gap-2">
        <SettingsIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Settings</h1>
      </div>

      <div className="max-w-2xl space-y-5">
        <ThemeSetting />

        <RefreshIntervalSetting value={refreshIntervalMinutes} onChange={onRefreshIntervalChange} />

        <VisualizationSetting
          label="Today's Trend visualization"
          hint="Choose how the Movers page displays today's gainers and losers."
          value={todayStyle}
          onChange={handleTodayChange}
        />

        <VisualizationSetting
          label="Overall visualization"
          hint="Choose how the Movers page displays overall (all-time) gain/loss."
          value={overallStyle}
          onChange={handleOverallChange}
        />

        <div className="bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800/60 p-4 flex gap-3">
          <Info className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 dark:text-blue-300">
            Portfolio snapshots are taken automatically at 4:00 PM ET on market days — no manual action needed.
          </p>
        </div>

        <AlertsSetting />
      </div>

      <ReportSetting portfolio={portfolio} onTickerClick={onTickerClick} onPortfolioChange={onPortfolioChange} />

      <div className="max-w-2xl space-y-5">
        <DeveloperSetting />

        {onClearAll && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-red-200 dark:border-red-800/60 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">Danger Zone</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 mb-4">Permanently delete all holdings. This cannot be undone.</p>
            <button
              onClick={onClearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />Clear All Holdings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
