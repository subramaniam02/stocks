import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TrendingUp, TrendingDown, Scale, Eye, Sparkles } from 'lucide-react';
import { markdownComponents } from '../utils/markdownComponents';
import { parseActionText } from '../utils/actionText';

export const ACTION_ICONS = {
  TAKE_PROFITS: TrendingUp,
  SELL: TrendingDown,
  BUY: TrendingUp,
  HOLD: Eye,
  DIVERSIFY: Scale,
  REBALANCE: Scale,
  WATCH: Eye,
  REDUCE: TrendingDown,
  ADD: TrendingUp,
  ANALYSIS: Sparkles,
  HARVEST_LOSS: TrendingDown,
};

export const ACTION_COLORS = {
  TAKE_PROFITS: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/40',
  SELL: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40',
  BUY: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/40',
  HOLD: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40',
  DIVERSIFY: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40',
  REBALANCE: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40',
  WATCH: 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950/40',
  REDUCE: 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/40',
  ADD: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/40',
  ANALYSIS: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40',
  HARVEST_LOSS: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40',
};

function ActionSegment({ actionType, ticker, text }) {
  const Icon = ACTION_ICONS[actionType] || Sparkles;
  const colorClass = ACTION_COLORS[actionType] || 'text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-800/40';
  return (
    <div className="flex items-start gap-2 py-1">
      <div className={`p-1 rounded shrink-0 ${colorClass}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {actionType}
          </span>
          {ticker && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
              {ticker}
            </span>
          )}
        </div>
        <p className="text-sm leading-snug">{text}</p>
      </div>
    </div>
  );
}

// Renders the backend's "[ACTION] TICKER: text | ..." mini-syntax (portfolio
// reviews, must-act alerts, /portfolio-review chat replies) as styled action
// rows, matching AIRecommendations.jsx's badges. Falls back to normal markdown
// for text that doesn't use this syntax (free-form chat answers, plain alerts).
export default function AiActionText({ text }) {
  const { preamble, segments } = parseActionText(text || '');

  if (segments.length === 0) {
    return <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{text}</ReactMarkdown>;
  }

  return (
    <div>
      {preamble && <p className="text-sm mb-1.5">{preamble}</p>}
      <div className="divide-y divide-current/10">
        {segments.map((s, i) =>
          s.actionType
            ? <ActionSegment key={i} {...s} />
            : <p key={i} className="text-sm py-1">{s.text}</p>
        )}
      </div>
    </div>
  );
}
