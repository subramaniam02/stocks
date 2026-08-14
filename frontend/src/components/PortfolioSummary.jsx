import { TrendingUp, TrendingDown, DollarSign, Wallet, Activity } from 'lucide-react';

function StatCard({ label, value, subValue, icon: Icon, accent }) {
  const accents = {
    blue:  { bg: 'bg-blue-50 dark:bg-blue-950/40',    border: 'border-blue-200 dark:border-blue-800/60',   text: 'text-blue-600 dark:text-blue-400',   bar: 'bg-blue-500'   },
    slate: { bg: 'bg-slate-50 dark:bg-slate-800/60',   border: 'border-slate-200 dark:border-slate-700',  text: 'text-slate-600 dark:text-slate-300',  bar: 'bg-slate-400'  },
    green: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800/60',text: 'text-emerald-600 dark:text-emerald-400',bar: 'bg-emerald-500' },
    red:   { bg: 'bg-red-50 dark:bg-red-950/40',     border: 'border-red-200 dark:border-red-800/60',    text: 'text-red-600 dark:text-red-400',    bar: 'bg-red-500'    },
  };
  const c = accents[accent] ?? accents.slate;

  return (
    <div className={`relative rounded-xl border ${c.border} ${c.bg} p-5 overflow-hidden`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${c.bar} rounded-l-xl`} />
      <div className={`flex items-center gap-1.5 text-xs font-medium ${c.text} uppercase tracking-wider mb-2`}>
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{value}</div>
      {subValue && (
        <div className={`text-xs font-medium mt-0.5 tabular-nums ${c.text}`}>{subValue}</div>
      )}
    </div>
  );
}

function SplitCard({ label, gains, losses, gainsLabel, lossesLabel }) {
  const fmt = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return (
    <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-300 rounded-l-xl" />
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{label}</div>
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-0.5">{gainsLabel}</div>
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">+${fmt(gains)}</div>
        </div>
        <div className="w-px bg-slate-100 dark:bg-slate-700" />
        <div className="flex-1">
          <div className="text-[10px] font-medium text-red-500 dark:text-red-400 uppercase tracking-wider mb-0.5">{lossesLabel}</div>
          <div className="text-lg font-bold text-red-500 dark:text-red-400 tabular-nums">-${fmt(Math.abs(losses))}</div>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioSummary({ portfolio, realized = [] }) {
  if (!portfolio) return null;

  const pos = portfolio.total_gain_loss >= 0;
  const fmt = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Today's net change for the stat card
  let todayDollar = null;
  let todayPct = null;
  if (portfolio.stocks?.length) {
    let change = 0;
    for (const s of portfolio.stocks) {
      if (s.return_1d == null) continue;
      const perShare = s.current_price * s.return_1d / (100 + s.return_1d);
      change += perShare * s.total_quantity;
    }
    const yesterdayValue = portfolio.total_value - change;
    todayDollar = change;
    todayPct = yesterdayValue > 0 ? (change / yesterdayValue) * 100 : 0;
  }

  // Short-term (<1yr) vs long-term (>=1yr) breakdown per lot
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  let stGains = 0, stLosses = 0, ltGains = 0, ltLosses = 0;
  for (const s of portfolio.stocks ?? []) {
    for (const lot of s.lots ?? []) {
      const purchaseDate = new Date(lot.purchase_date);
      const gl = lot.gain_loss ?? 0;
      if (purchaseDate <= oneYearAgo) {
        if (gl >= 0) ltGains += gl; else ltLosses += gl;
      } else {
        if (gl >= 0) stGains += gl; else stLosses += gl;
      }
    }
  }

  // Realized ST/LT breakdown
  let rStGains = 0, rStLosses = 0, rLtGains = 0, rLtLosses = 0;
  for (const t of realized) {
    const gl = t.gain_loss ?? 0;
    if (t.term === 'Long-Term') {
      if (gl >= 0) rLtGains += gl; else rLtLosses += gl;
    } else {
      if (gl >= 0) rStGains += gl; else rStLosses += gl;
    }
  }
  const hasRealized = realized.length > 0;
  const todayPos = (todayDollar ?? 0) >= 0;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
      <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">Portfolio Summary</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Value"
          value={`$${fmt(portfolio.total_value)}`}
          icon={DollarSign}
          accent="blue"
        />
        <StatCard
          label="Cost Basis"
          value={`$${fmt(portfolio.total_cost_basis)}`}
          icon={Wallet}
          accent="slate"
        />
        <StatCard
          label="Today's Change"
          value={todayDollar != null ? `${todayPos ? '+' : ''}$${fmt(todayDollar)}` : '—'}
          subValue={todayPct != null ? `${todayPos ? '+' : ''}${todayPct.toFixed(2)}% today` : null}
          icon={todayPos ? TrendingUp : TrendingDown}
          accent={todayDollar == null ? 'slate' : todayPos ? 'green' : 'red'}
        />
        <StatCard
          label="Total Gain/Loss"
          value={`${pos ? '+' : ''}$${fmt(portfolio.total_gain_loss)}`}
          subValue={`${pos ? '+' : ''}${portfolio.total_gain_loss_pct.toFixed(2)}% overall`}
          icon={pos ? TrendingUp : TrendingDown}
          accent={pos ? 'green' : 'red'}
        />
        <StatCard
          label="Holdings"
          value={portfolio.stocks?.length ?? 0}
          subValue={`${portfolio.stocks?.reduce((n, s) => n + s.lots.length, 0) ?? 0} lots`}
          icon={Activity}
          accent="slate"
        />
      </div>

      {/* Gains vs Losses breakdown row */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${hasRealized ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-4 mt-4`}>
        <SplitCard
          label="Unrealized ST · < 1 Year"
          gains={stGains}
          losses={stLosses}
          gainsLabel="Gains"
          lossesLabel="Losses"
        />
        <SplitCard
          label="Unrealized LT · ≥ 1 Year"
          gains={ltGains}
          losses={ltLosses}
          gainsLabel="Gains"
          lossesLabel="Losses"
        />
        {hasRealized && (
          <SplitCard
            label="Realized · All Time"
            gains={rStGains + rLtGains}
            losses={rStLosses + rLtLosses}
            gainsLabel={`Gains (${realized.length})`}
            lossesLabel="Losses"
          />
        )}
      </div>
    </div>
  );
}
