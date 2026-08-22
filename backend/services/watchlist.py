from sqlalchemy.orm import Session
from typing import List
import models
from services.stock_data import get_portfolio_data_bulk


def get_all(db: Session) -> List[models.Watchlist]:
    """All watched tickers, most recently added first."""
    return db.query(models.Watchlist).order_by(models.Watchlist.created_at.desc()).all()


def is_watchlisted(db: Session, ticker: str) -> bool:
    return db.query(models.Watchlist).filter(models.Watchlist.ticker == ticker.upper()).first() is not None


def add_ticker(db: Session, ticker: str) -> models.Watchlist:
    """Idempotent: returns the existing row if the ticker is already watched."""
    ticker = ticker.upper().strip()
    existing = db.query(models.Watchlist).filter(models.Watchlist.ticker == ticker).first()
    if existing:
        return existing
    entry = models.Watchlist(ticker=ticker)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def remove_ticker(db: Session, ticker: str) -> bool:
    entry = db.query(models.Watchlist).filter(models.Watchlist.ticker == ticker.upper()).first()
    if not entry:
        return False
    db.delete(entry)
    db.commit()
    return True


def get_quotes(db: Session) -> List[dict]:
    """Watchlist tickers enriched with current price and today's % change,
    fetched via the same bulk pricing path used for portfolio holdings."""
    tickers = [w.ticker for w in get_all(db)]
    if not tickers:
        return []
    bulk = get_portfolio_data_bulk(tickers)
    return [
        {
            "ticker": ticker,
            "name": bulk.get(ticker, {}).get("name"),
            "price": bulk.get(ticker, {}).get("price"),
            "change_pct": bulk.get(ticker, {}).get("1d"),
        }
        for ticker in tickers
    ]


def backfill_from_holdings_and_realized(db: Session) -> int:
    """Every ticker ever held — current holdings plus past (realized) ones —
    should already be on the watchlist by default. Run once at startup so
    pre-existing portfolios are covered retroactively."""
    held_tickers = {t for (t,) in db.query(models.Holding.ticker).distinct()}
    realized_tickers = {t for (t,) in db.query(models.RealizedTransaction.ticker).distinct()}
    watched_tickers = {t for (t,) in db.query(models.Watchlist.ticker).distinct()}

    missing = (held_tickers | realized_tickers) - watched_tickers
    for ticker in missing:
        db.add(models.Watchlist(ticker=ticker))
    if missing:
        db.commit()
    return len(missing)
