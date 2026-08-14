const KEY = 'netWealth.items';

export function getNetWealthItems() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { assets: [], liabilities: [] };
    const parsed = JSON.parse(raw);
    return { assets: parsed.assets ?? [], liabilities: parsed.liabilities ?? [] };
  } catch {
    return { assets: [], liabilities: [] };
  }
}

export function setNetWealthItems(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}
