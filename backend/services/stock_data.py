import threading
import yfinance as yf
import pandas as pd
from typing import Any, Callable, Dict, Optional
import time


class _TtlCache:
    def __init__(self, ttl: int):
        self._store: Dict[str, tuple] = {}
        self.ttl = ttl
        self._lock = threading.Lock()

    def get(self, key: str):
        with self._lock:
            entry = self._store.get(key)
        if entry and time.time() - entry[1] < self.ttl:
            return entry[0]
        return None

    def get_stale(self, key: str):
        """Return (value, age_seconds) even if expired. Returns (None, None) if never set."""
        with self._lock:
            entry = self._store.get(key)
        if entry is None:
            return None, None
        return entry[0], time.time() - entry[1]

    def set(self, key: str, value):
        with self._lock:
            self._store[key] = (value, time.time())

    def clear(self):
        with self._lock:
            self._store.clear()


# Rate limiter: max 2 Yahoo Finance requests per second
_rate_lock = threading.Lock()
_last_fetch_time: float = 0.0
_FETCH_INTERVAL = 0.5  # seconds between requests


def _rate_limit():
    global _last_fetch_time
    with _rate_lock:
        gap = _FETCH_INTERVAL - (time.time() - _last_fetch_time)
        if gap > 0:
            time.sleep(gap)
        _last_fetch_time = time.time()


def _yf_fetch(fn: Callable[[], Any], label: str = "") -> Any:
    """Run a Yahoo Finance call with rate limiting and exponential backoff on 429."""
    for attempt in range(4):
        try:
            _rate_limit()
            return fn()
        except Exception as e:
            if "429" in str(e):
                wait = 2 ** (attempt + 1)  # 2, 4, 8, 16 s
                print(f"Yahoo Finance rate limited{' for ' + label if label else ''}, retrying in {wait}s")
                time.sleep(wait)
            else:
                raise
    raise RuntimeError(f"Yahoo Finance rate limit not resolved after retries{' for ' + label if label else ''}")


# fast_info (chart endpoint) — used for price lookups and validation, 60s TTL
_fast_cache = _TtlCache(ttl=60)
# rich detail (intraday + full info) — short TTL so day chart stays fresh
_detail_cache = _TtlCache(ttl=90)
# full stock.info (quoteSummary endpoint) — used only for detailed metadata, 5 min TTL
_info_cache = _TtlCache(ttl=300)
# stock.history() calls keyed by "ticker:period_or_dates"
_hist_cache = _TtlCache(ttl=3600)
# yf.screen() calls keyed by "screener_type:limit"
_screener_cache = _TtlCache(ttl=300)
# get_stock_performance keyed by "ticker:days"
_perf_cache = _TtlCache(ttl=300)


def _get_fast_info(ticker: str):
    """Fetch and cache yf.Ticker.fast_info (chart endpoint, much lighter than .info)."""
    cached = _fast_cache.get(ticker)
    if cached is not None:
        return cached
    try:
        fast = _yf_fetch(lambda: yf.Ticker(ticker).fast_info, ticker)
        _fast_cache.set(ticker, fast)
        return fast
    except Exception as e:
        print(f"Error fetching fast_info for {ticker}: {e}")
        return None


def _get_info(ticker: str) -> Optional[Dict]:
    """Fetch and cache yf.Ticker.info (quoteSummary). Falls back to fast_info on 429."""
    cached = _info_cache.get(ticker)
    if cached is not None:
        return cached
    try:
        info = _yf_fetch(lambda: yf.Ticker(ticker).info, ticker)
        _info_cache.set(ticker, info)
        return info
    except Exception as e:
        if "429" in str(e):
            print(f"quoteSummary rate limited for {ticker}, falling back to fast_info")
            fast = _get_fast_info(ticker)
            if fast:
                fallback = {
                    "shortName": ticker,
                    "sector": "Unknown",
                    "industry": "Unknown",
                    "currentPrice": getattr(fast, "last_price", None),
                    "regularMarketPrice": getattr(fast, "regular_market_price", None),
                    "marketCap": getattr(fast, "market_cap", None),
                    "trailingPE": None,
                    "fiftyTwoWeekHigh": getattr(fast, "year_high", None),
                    "fiftyTwoWeekLow": getattr(fast, "year_low", None),
                }
                _info_cache.set(ticker, fallback)
                return fallback
        print(f"Error fetching info for {ticker}: {e}")
        return None


def get_current_price(ticker: str) -> Optional[float]:
    """Fetch current price via fast_info (chart endpoint)."""
    fast = _get_fast_info(ticker)
    if fast is None:
        return None
    return getattr(fast, "last_price", None) or getattr(fast, "regular_market_price", None)


def validate_ticker(ticker: str) -> bool:
    """Validate ticker via fast_info (chart endpoint — avoids quoteSummary rate limits)."""
    fast = _get_fast_info(ticker)
    if fast is None:
        return False
    price = getattr(fast, "last_price", None) or getattr(fast, "regular_market_price", None)
    return price is not None and price > 0


def get_stock_info(ticker: str) -> Optional[Dict]:
    """Get detailed stock information."""
    info = _get_info(ticker)
    if info is None:
        return None
    return {
        "ticker": ticker,
        "name": info.get("shortName", ticker),
        "sector": info.get("sector", "Unknown"),
        "industry": info.get("industry", "Unknown"),
        "current_price": info.get("currentPrice") or info.get("regularMarketPrice"),
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "52_week_high": info.get("fiftyTwoWeekHigh"),
        "52_week_low": info.get("fiftyTwoWeekLow"),
    }


def get_multiple_prices(tickers: list[str]) -> Dict[str, Optional[float]]:
    """Fetch current prices for multiple tickers efficiently."""
    return {ticker: get_current_price(ticker) for ticker in tickers}


def clear_cache():
    """Clear all caches."""
    _fast_cache.clear()
    _info_cache.clear()
    _hist_cache.clear()
    _screener_cache.clear()
    _perf_cache.clear()
    _bulk_cache.clear()


def get_historical_prices(ticker: str, start_date: str, end_date: str) -> Dict[str, float]:
    """Fetch historical closing prices for a ticker."""
    cache_key = f"{ticker}:{start_date}:{end_date}"
    cached = _hist_cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        hist = _yf_fetch(lambda: yf.Ticker(ticker).history(start=start_date, end=end_date), ticker)
        prices = {idx.strftime('%Y-%m-%d'): float(row['Close']) for idx, row in hist.iterrows()}
        _hist_cache.set(cache_key, prices)
        return prices
    except Exception as e:
        print(f"Error fetching historical prices for {ticker}: {e}")
        return {}


def get_historical_prices_bulk(tickers: list[str], start_date: str, end_date: str) -> Dict[str, Dict[str, float]]:
    """
    Fetch historical closing prices for multiple tickers.
    
    Returns:
        Dict mapping ticker -> {date_str -> price}
    """
    result = {}
    for ticker in tickers:
        result[ticker] = get_historical_prices(ticker, start_date, end_date)
    return result


_VALID_PERIODS = {"5d", "1mo", "6mo", "ytd", "1y"}

def get_stock_history(ticker: str, period: str) -> list:
    """Fetch daily closing prices for a ticker and period. Returns [{date, price}]."""
    if period not in _VALID_PERIODS:
        return []
    cache_key = f"chart:{ticker}:{period}"
    cached = _hist_cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        hist = _yf_fetch(lambda: yf.Ticker(ticker).history(period=period), ticker)
        if hist.empty:
            return []
        result = [
            {"date": idx.strftime("%Y-%m-%d"), "price": round(float(row["Close"]), 4)}
            for idx, row in hist.iterrows()
        ]
        _hist_cache.set(cache_key, result)
        return result
    except Exception as e:
        print(f"Error fetching history for {ticker} ({period}): {e}")
        return []


SCREENER_TYPES = [
    "day_gainers",
    "day_losers", 
    "most_actives",
    "undervalued_large_caps",
    "growth_technology_stocks",
    "aggressive_small_caps",
    "small_cap_gainers",
    "undervalued_growth_stocks",
]


def get_market_movers(screener_type: str = "day_gainers", limit: int = 25) -> list[Dict]:
    """
    Fetch market movers using Yahoo Finance screeners.
    
    Screener types:
    - day_gainers: Top gaining stocks (>3% gain, mega/large cap)
    - day_losers: Top losing stocks (<-2.5% loss, mega/large cap)
    - most_actives: Most traded stocks by volume
    - undervalued_large_caps: Large caps trading below intrinsic value
    - growth_technology_stocks: Tech sector growth stocks
    - aggressive_small_caps: High-growth small caps
    - small_cap_gainers: Small caps with gains
    - undervalued_growth_stocks: Growth stocks at value prices
    
    Returns list of stock data dicts.
    """
    cache_key = f"{screener_type}:{limit}"
    cached = _screener_cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        response = _yf_fetch(lambda: yf.screen(screener_type, count=limit), screener_type)

        if not response or 'quotes' not in response:
            print(f"No data from screener: {screener_type}")
            return []

        stocks = []
        for quote in response['quotes'][:limit]:
            stock_data = {
                "ticker": quote.get("symbol", ""),
                "name": quote.get("shortName") or quote.get("longName", ""),
                "sector": quote.get("sector", "Unknown"),
                "current_price": quote.get("regularMarketPrice", 0),
                "change": quote.get("regularMarketChange", 0),
                "change_pct": quote.get("regularMarketChangePercent", 0),
                "volume": quote.get("regularMarketVolume", 0),
                "market_cap": quote.get("marketCap", 0),
                "avg_volume": quote.get("averageDailyVolume3Month", 0),
                "52_week_high": quote.get("fiftyTwoWeekHigh", 0),
                "52_week_low": quote.get("fiftyTwoWeekLow", 0),
            }
            stocks.append(stock_data)

        _screener_cache.set(cache_key, stocks)
        return stocks
    except Exception as e:
        print(f"Error fetching market movers ({screener_type}): {e}")
        return []


def get_day_gainers(limit: int = 25) -> list[Dict]:
    """Get today's top gaining stocks (mega/large cap, >3% gain)."""
    return get_market_movers("day_gainers", limit)


def get_day_losers(limit: int = 25) -> list[Dict]:
    """Get today's top losing stocks (mega/large cap, <-2.5% loss)."""
    return get_market_movers("day_losers", limit)


def get_most_active(limit: int = 25) -> list[Dict]:
    """Get most actively traded stocks by volume."""
    return get_market_movers("most_actives", limit)


def get_market_overview(limit: int = 10) -> Dict:
    """
    Get comprehensive market overview with gainers, losers, and most active.
    Uses Yahoo Finance screeners for real-time market data.
    """
    gainers = get_day_gainers(limit)
    losers = get_day_losers(limit)
    most_active = get_most_active(limit)
    
    return {
        "gainers": gainers,
        "losers": losers,
        "most_active": most_active,
        "total_gainers": len(gainers),
        "total_losers": len(losers),
        "source": "Yahoo Finance Screener",
        "note": "Real-time market data for mega/large cap stocks"
    }


def get_stock_performance(ticker: str, days: int) -> Optional[Dict]:
    """Calculate stock performance over a given number of days."""
    cache_key = f"{ticker}:{days}"
    cached = _perf_cache.get(cache_key)
    if cached is not None:
        return cached
    try:
        period = "1mo" if days <= 30 else "3mo" if days <= 90 else "1y"
        hist_cache_key = f"{ticker}:{period}"
        hist = _hist_cache.get(hist_cache_key)
        if hist is None:
            hist = _yf_fetch(lambda: yf.Ticker(ticker).history(period=period), ticker)
            _hist_cache.set(hist_cache_key, hist)

        if hist.empty or len(hist) < 2:
            return None

        hist = hist.tail(days + 1) if len(hist) > days else hist

        start_price = float(hist['Close'].iloc[0])
        end_price = float(hist['Close'].iloc[-1])
        change = end_price - start_price
        change_pct = (change / start_price) * 100 if start_price > 0 else 0

        info = _get_info(ticker) or {}

        result = {
            "ticker": ticker,
            "name": info.get("shortName", ticker),
            "sector": info.get("sector", "Unknown"),
            "market_cap": info.get("marketCap", 0),
            "start_price": round(start_price, 2),
            "end_price": round(end_price, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "high": round(float(hist['High'].max()), 2),
            "low": round(float(hist['Low'].min()), 2),
            "avg_volume": int(hist['Volume'].mean()),
            "days": days,
        }
        _perf_cache.set(cache_key, result)
        return result
    except Exception as e:
        print(f"Error getting performance for {ticker}: {e}")
        return None


_PERIOD_TRADING_DAYS = {"1d": 1, "1m": 21, "3m": 63, "6m": 126, "1y": 252, "3y": 756, "5y": 1260}

# Bulk portfolio data cache — 1h TTL (period returns are slow to change intraday)
_bulk_cache = _TtlCache(ttl=3600)
# Company name cache — names rarely change, 24h TTL
_name_cache = _TtlCache(ttl=86400)

# Tracks which cache keys are currently being refreshed in the background
_bulk_refresh_in_progress: Dict[str, bool] = {}
_bulk_refresh_lock = threading.Lock()


def get_ticker_name(ticker: str) -> Optional[str]:
    """Get company shortName from chart metadata (same endpoint as fast_info, no extra call)."""
    cached = _name_cache.get(ticker)
    if cached is not None:
        return cached
    fast = _get_fast_info(ticker)
    if fast is None:
        return None
    # _md is lazy-loaded; accessing last_price triggers the HTTP fetch
    try:
        _ = fast.last_price
    except Exception:
        pass
    md = getattr(fast, "_md", None)
    name = None
    if isinstance(md, dict):
        name = md.get("shortName") or md.get("longName")
    if name:
        _name_cache.set(ticker, name)
    return name


def _do_bulk_fetch(tickers: list[str], cache_key: str) -> Dict[str, Dict]:
    """Perform the actual yfinance download and populate the bulk cache."""
    empty_entry = lambda: {"price": None, "name": None, **{p: None for p in _PERIOD_TRADING_DAYS}}

    try:
        download_arg = tickers if len(tickers) > 1 else tickers[0]
        raw = _yf_fetch(
            lambda: yf.download(download_arg, period="5y", auto_adjust=True, progress=False),
            f"bulk download {len(tickers)} tickers",
        )
    except Exception as e:
        print(f"Bulk download failed: {e}")
        raw = pd.DataFrame()

    result: Dict[str, Dict] = {}
    for ticker in tickers:
        entry = empty_entry()
        try:
            if not raw.empty:
                close = (raw["Close"] if len(tickers) == 1 else raw["Close"][ticker]).dropna()
                if len(close) > 0:
                    current = float(close.iloc[-1])
                    entry["price"] = current
                    for period, n_days in _PERIOD_TRADING_DAYS.items():
                        if len(close) > n_days:
                            past = float(close.iloc[-(n_days + 1)])
                            entry[period] = ((current - past) / past * 100) if past > 0 else None
        except Exception as e:
            print(f"Error processing bulk data for {ticker}: {e}")

        if entry["price"] is None:
            entry["price"] = get_current_price(ticker)
        entry["name"] = get_ticker_name(ticker)
        result[ticker] = entry

    _bulk_cache.set(cache_key, result)
    with _bulk_refresh_lock:
        _bulk_refresh_in_progress.pop(cache_key, None)
    print(f"Bulk cache refreshed for {len(tickers)} tickers")
    return result


def _bg_bulk_refresh(tickers: list[str], cache_key: str) -> None:
    """Background thread target: refresh bulk cache silently."""
    try:
        _do_bulk_fetch(tickers, cache_key)
    except Exception as e:
        print(f"Background bulk refresh failed: {e}")
        with _bulk_refresh_lock:
            _bulk_refresh_in_progress.pop(cache_key, None)


def get_portfolio_data_bulk(tickers: list[str]) -> Dict[str, Dict]:
    """
    Fetch current price and period returns for all portfolio tickers.

    Strategy:
    - Fresh cache hit  → return immediately (< 1ms)
    - Stale cache hit  → return stale data immediately, refresh in background
    - Cold miss        → fetch synchronously (only happens on very first call or
                         after a restart before the startup pre-warm finishes)
    """
    if not tickers:
        return {}

    cache_key = "|".join(sorted(tickers))

    # 1. Fresh hit — fast path
    fresh = _bulk_cache.get(cache_key)
    if fresh is not None:
        return fresh

    # 2. Stale hit — return old data instantly, kick off background refresh
    stale, age = _bulk_cache.get_stale(cache_key)
    if stale is not None:
        with _bulk_refresh_lock:
            already_running = _bulk_refresh_in_progress.get(cache_key, False)
            if not already_running:
                _bulk_refresh_in_progress[cache_key] = True
                threading.Thread(
                    target=_bg_bulk_refresh,
                    args=(list(tickers), cache_key),
                    daemon=True,
                ).start()
                print(f"Serving stale bulk data ({age:.0f}s old), refreshing in background")
        return stale

    # 3. Cold miss — must fetch synchronously
    print(f"Cold bulk fetch for {len(tickers)} tickers (no cache)")
    with _bulk_refresh_lock:
        _bulk_refresh_in_progress[cache_key] = True
    return _do_bulk_fetch(list(tickers), cache_key)


def warm_bulk_cache(tickers: list[str]) -> None:
    """Pre-warm the bulk cache. Called from scheduler on startup."""
    if not tickers:
        return
    cache_key = "|".join(sorted(tickers))
    fresh = _bulk_cache.get(cache_key)
    if fresh is not None:
        print(f"Bulk cache already warm for {len(tickers)} tickers")
        return
    print(f"Startup cache warm-up: fetching data for {len(tickers)} tickers…")
    _do_bulk_fetch(list(tickers), cache_key)


def get_period_returns(ticker: str) -> Dict[str, Optional[float]]:
    """Return % change for 1d/3m/1y/3y/5y using a single 5y history fetch."""
    cache_key = f"{ticker}:period_returns"
    cached = _hist_cache.get(cache_key)
    if cached is not None:
        return cached

    hist_key = f"{ticker}:5y"
    hist = _hist_cache.get(hist_key)
    if hist is None:
        try:
            hist = _yf_fetch(lambda: yf.Ticker(ticker).history(period="5y"), ticker)
            _hist_cache.set(hist_key, hist)
        except Exception as e:
            print(f"Error fetching 5y history for {ticker}: {e}")
            return {p: None for p in _PERIOD_TRADING_DAYS}

    result: Dict[str, Optional[float]] = {}
    if hist.empty or len(hist) < 2:
        result = {p: None for p in _PERIOD_TRADING_DAYS}
    else:
        current = float(hist["Close"].iloc[-1])
        for period, n_days in _PERIOD_TRADING_DAYS.items():
            if len(hist) <= n_days:
                result[period] = None
            else:
                past = float(hist["Close"].iloc[-(n_days + 1)])
                result[period] = ((current - past) / past * 100) if past > 0 else None

    _hist_cache.set(cache_key, result)
    return result


def get_top_performers(tickers: list[str], days: int, limit: int = 10) -> Dict:
    """
    Get top and bottom performing stocks from a list of tickers.
    
    Returns dict with gainers, losers, and all performance data.
    """
    performances = []
    
    for ticker in tickers:
        perf = get_stock_performance(ticker, days)
        if perf:
            performances.append(perf)
    
    performances.sort(key=lambda x: x["change_pct"], reverse=True)
    
    gainers = [p for p in performances if p["change_pct"] > 0][:limit]
    losers = [p for p in performances if p["change_pct"] < 0]
    losers = sorted(losers, key=lambda x: x["change_pct"])[:limit]
    
    return {
        "gainers": gainers,
        "losers": losers,
        "all": performances,
        "total_analyzed": len(performances),
        "days": days
    }


def get_ticker_detail(ticker: str) -> Optional[Dict]:
    """Get rich ticker detail: intraday chart, day/52w range, expense ratio (ETF), position-agnostic."""
    cached = _detail_cache.get(ticker)
    if cached is not None:
        return cached

    info = _get_info(ticker)
    if info is None:
        return None

    # Intraday (today, 5-minute candles)
    intraday = []
    try:
        tk = yf.Ticker(ticker)
        hist_1d = _yf_fetch(lambda: tk.history(period="1d", interval="5m"), ticker)
        if not hist_1d.empty:
            intraday = [
                {"time": idx.strftime("%H:%M"), "price": round(float(row["Close"]), 2)}
                for idx, row in hist_1d.iterrows()
                if not pd.isna(row["Close"])
            ]
    except Exception as e:
        print(f"Intraday fetch failed for {ticker}: {e}")

    current_price = info.get("currentPrice") or info.get("regularMarketPrice")
    prev_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
    day_change, day_change_pct = None, None
    if current_price is not None and prev_close and prev_close > 0:
        day_change = round(current_price - prev_close, 2)
        day_change_pct = round(day_change / prev_close * 100, 2)

    quote_type = info.get("quoteType", "EQUITY").upper()
    expense_ratio = (
        info.get("annualReportExpenseRatio")
        or info.get("netExpenseRatio")
        or info.get("expenseRatio")
    )

    result = {
        "ticker": ticker,
        "name": info.get("shortName") or info.get("longName", ticker),
        "quote_type": quote_type,
        "is_etf": quote_type == "ETF",
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "description": info.get("longBusinessSummary"),
        "current_price": current_price,
        "prev_close": prev_close,
        "day_open": info.get("regularMarketOpen") or info.get("open"),
        "day_high": info.get("dayHigh") or info.get("regularMarketDayHigh"),
        "day_low": info.get("dayLow") or info.get("regularMarketDayLow"),
        "day_change": day_change,
        "day_change_pct": day_change_pct,
        "volume": info.get("regularMarketVolume") or info.get("volume"),
        "avg_volume": info.get("averageVolume") or info.get("averageDailyVolume10Day"),
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "forward_pe": info.get("forwardPE"),
        "52w_high": info.get("fiftyTwoWeekHigh"),
        "52w_low": info.get("fiftyTwoWeekLow"),
        "expense_ratio": expense_ratio,
        "dividend_yield": info.get("dividendYield"),
        "beta": info.get("beta"),
        "intraday": intraday,
    }
    _detail_cache.set(ticker, result)
    return result


def get_trending_tickers(limit: int = 50) -> list[str]:
    """
    Get a dynamic list of trending/significant tickers from market screeners.
    Combines most active + gainers + losers for comprehensive coverage.
    """
    tickers = set()
    
    for screener in ["most_actives", "day_gainers", "day_losers"]:
        try:
            stocks = get_market_movers(screener, limit=20)
            for stock in stocks:
                if stock.get("ticker"):
                    tickers.add(stock["ticker"])
        except Exception as e:
            print(f"Error fetching {screener}: {e}")
    
    return list(tickers)[:limit]
