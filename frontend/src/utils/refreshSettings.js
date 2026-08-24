const REFRESH_MINUTES_KEY = 'settings.refreshIntervalMinutes';

export const REFRESH_INTERVAL_OPTIONS = [1, 5, 15, 30, 60];
export const DEFAULT_REFRESH_MINUTES = 15;

export function getRefreshIntervalMinutes() {
  const stored = parseInt(localStorage.getItem(REFRESH_MINUTES_KEY), 10);
  return REFRESH_INTERVAL_OPTIONS.includes(stored) ? stored : DEFAULT_REFRESH_MINUTES;
}

export function setRefreshIntervalMinutes(minutes) {
  localStorage.setItem(REFRESH_MINUTES_KEY, String(minutes));
}
