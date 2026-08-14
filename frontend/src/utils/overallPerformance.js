// Shared between MoversPage's "Trends" tab and the global TopMoversWidget so both
// read/write the same period selection and the same cached API responses instead
// of drifting out of sync or double-fetching.

export const PERIODS = [
  { label: '1D',  value: '1d'  },
  { label: '1M',  value: '1m'  },
  { label: '3M',  value: '3m'  },
  { label: '6M',  value: '6m'  },
  { label: '1Y',  value: '1y'  },
  { label: 'YTD', value: 'ytd' },
  { label: 'All', value: 'all' },
];

export function periodLabel(value) {
  return PERIODS.find(p => p.value === value)?.label ?? value;
}

const TTL_MS = 5 * 60 * 1000;
const _cache = new Map(); // period -> { data, ts }

export function getCachedOverallPerf(period) {
  const entry = _cache.get(period);
  if (!entry) return null;
  return (Date.now() - entry.ts < TTL_MS) ? entry.data : null;
}

export function setCachedOverallPerf(period, data) {
  _cache.set(period, { data, ts: Date.now() });
}
