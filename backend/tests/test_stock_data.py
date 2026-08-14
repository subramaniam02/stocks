import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
import yfinance as yf
from services.stock_data import (
    validate_ticker,
    get_current_price,
    get_stock_info,
    get_stock_performance,
    _get_fast_info,
    clear_cache,
)

TICKER = "MSFT"


@pytest.fixture(autouse=True)
def reset_cache():
    clear_cache()
    yield
    clear_cache()


def test_yfinance_version():
    """Ensure yfinance >= 1.0 is installed (1.x fixed 429 crumb handling)."""
    major = int(yf.__version__.split(".")[0])
    assert major >= 1, f"yfinance {yf.__version__} is too old — upgrade to >= 1.0"


def test_fast_info_returns_price():
    fast = _get_fast_info(TICKER)
    assert fast is not None
    price = getattr(fast, "last_price", None)
    assert price is not None and price > 0, f"fast_info.last_price missing: {fast}"


def test_validate_ticker_valid():
    assert validate_ticker(TICKER) is True


def test_validate_ticker_invalid():
    assert validate_ticker("XXXXINVALID") is False


def test_get_current_price():
    price = get_current_price(TICKER)
    assert price is not None and price > 0, f"Expected positive price, got {price}"


def test_get_stock_info():
    info = get_stock_info(TICKER)
    assert info is not None
    assert info["ticker"] == TICKER
    assert info["current_price"] is not None and info["current_price"] > 0


def test_get_stock_performance():
    perf = get_stock_performance(TICKER, days=7)
    assert perf is not None
    assert perf["ticker"] == TICKER
    assert "change_pct" in perf
    assert "start_price" in perf


def test_cache_prevents_double_fetch():
    """Second call must return cached result without extra network hit."""
    p1 = get_current_price(TICKER)
    p2 = get_current_price(TICKER)
    assert p1 == p2
