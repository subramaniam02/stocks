const KEY = 'taxes.rates';

const DEFAULT_RATES = {
  fedOrdinaryPct: 24,
  fedCapGainsPct: 15,
  statePct: 0,
};

export function getTaxRates() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_RATES };
    return { ...DEFAULT_RATES, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_RATES };
  }
}

export function setTaxRates(rates) {
  localStorage.setItem(KEY, JSON.stringify(rates));
}
