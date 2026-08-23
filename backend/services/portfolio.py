from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Set
from datetime import date, timedelta
import models
import schemas
from services.stock_data import get_current_price, get_multiple_prices, get_historical_prices_bulk, get_period_returns, get_portfolio_data_bulk


def create_holding(db: Session, holding: schemas.HoldingCreate) -> models.Holding:
    """Create a new holding (lot) in the database."""
    db_holding = models.Holding(
        ticker=holding.ticker.upper(),
        purchase_date=holding.purchase_date,
        purchase_price=holding.purchase_price,
        quantity=holding.quantity
    )
    db.add(db_holding)
    db.commit()
    db.refresh(db_holding)
    return db_holding


def create_holdings_bulk(db: Session, holdings: List[schemas.HoldingCreate]) -> List[models.Holding]:
    """Create multiple holdings at once."""
    db_holdings = []
    for holding in holdings:
        db_holding = models.Holding(
            ticker=holding.ticker.upper(),
            purchase_date=holding.purchase_date,
            purchase_price=holding.purchase_price,
            quantity=holding.quantity
        )
        db_holdings.append(db_holding)

    db.add_all(db_holdings)
    db.commit()
    for h in db_holdings:
        db.refresh(h)
    return db_holdings


def get_all_holdings(db: Session) -> List[models.Holding]:
    """Get all holdings from the database."""
    return db.query(models.Holding).all()


def get_holdings_by_ticker(db: Session, ticker: str) -> List[models.Holding]:
    """Get all holdings for a specific ticker."""
    return db.query(models.Holding).filter(models.Holding.ticker == ticker.upper()).all()


def delete_holding(db: Session, holding_id: int) -> bool:
    """Delete a holding by ID."""
    holding = db.query(models.Holding).filter(models.Holding.id == holding_id).first()
    if holding:
        db.delete(holding)
        db.commit()
        return True
    return False


def clear_all_holdings(db: Session) -> int:
    """Clear all holdings from the database. Returns count of deleted records."""
    count = db.query(models.Holding).delete()
    db.commit()
    return count


def get_quantities_as_of(db: Session, as_of_date: date) -> dict:
    """Per-ticker share count actually held on a given historical date.

    Snapshot rows must NOT use "today's" holdings for a past date — buying a
    new lot (or importing a CSV) would retroactively inflate every earlier
    date, and selling a lot (which deletes its Holding row and records a
    RealizedTransaction) would retroactively erase it from every earlier date
    too. This reconstructs the true point-in-time count from lots that were
    already open by as_of_date, plus lots that were open then but have since
    been sold.
    """
    quantities: dict = {}

    for h in db.query(models.Holding).filter(models.Holding.purchase_date <= as_of_date):
        quantities[h.ticker] = quantities.get(h.ticker, 0) + h.quantity

    for r in db.query(models.RealizedTransaction).filter(
        models.RealizedTransaction.buy_date <= as_of_date,
        models.RealizedTransaction.sell_date > as_of_date
    ):
        quantities[r.ticker] = quantities.get(r.ticker, 0) + r.quantity

    return quantities


def get_unique_tickers(db: Session) -> List[str]:
    """Get list of unique tickers in portfolio."""
    result = db.query(models.Holding.ticker).distinct().all()
    return [r[0] for r in result]


def get_portfolio_with_performance(db: Session) -> schemas.PortfolioOverview:
    """Get full portfolio with current performance metrics."""
    holdings = get_all_holdings(db)

    if not holdings:
        return schemas.PortfolioOverview(
            total_value=0,
            total_cost_basis=0,
            total_gain_loss=0,
            total_gain_loss_pct=0,
            stocks=[]
        )

    tickers = list(set(h.ticker for h in holdings))
    portfolio_data = get_portfolio_data_bulk(tickers)

    stocks_map = {}

    for holding in holdings:
        ticker = holding.ticker
        price_stale = (portfolio_data.get(ticker) or {}).get("price") is None
        current_price = (portfolio_data.get(ticker) or {}).get("price") or 0
        cost_basis = holding.purchase_price * holding.quantity
        current_value = current_price * holding.quantity
        gain_loss = current_value - cost_basis
        gain_loss_pct = (gain_loss / cost_basis * 100) if cost_basis > 0 else 0

        holding_perf = schemas.HoldingWithPerformance(
            id=holding.id,
            ticker=holding.ticker,
            purchase_date=holding.purchase_date,
            purchase_price=holding.purchase_price,
            quantity=holding.quantity,
            created_at=holding.created_at,
            current_price=current_price,
            current_value=current_value,
            cost_basis=cost_basis,
            gain_loss=gain_loss,
            gain_loss_pct=gain_loss_pct,
            price_stale=price_stale
        )

        if ticker not in stocks_map:
            stocks_map[ticker] = {
                "ticker": ticker,
                "total_quantity": 0,
                "total_cost": 0,
                "current_price": current_price,
                "price_stale": price_stale,
                "lots": []
            }

        stocks_map[ticker]["total_quantity"] += holding.quantity
        stocks_map[ticker]["total_cost"] += cost_basis
        stocks_map[ticker]["lots"].append(holding_perf)

    stocks = []
    total_value = 0
    total_cost_basis = 0

    for ticker, data in stocks_map.items():
        stock_value = data["current_price"] * data["total_quantity"]
        stock_cost = data["total_cost"]
        stock_gain = stock_value - stock_cost
        stock_gain_pct = (stock_gain / stock_cost * 100) if stock_cost > 0 else 0
        avg_cost = stock_cost / data["total_quantity"] if data["total_quantity"] > 0 else 0

        pd_entry = portfolio_data.get(ticker, {})
        stocks.append(schemas.StockSummary(
            ticker=ticker,
            name=pd_entry.get("name"),
            total_quantity=data["total_quantity"],
            average_cost=avg_cost,
            current_price=data["current_price"],
            total_value=stock_value,
            total_cost_basis=stock_cost,
            gain_loss=stock_gain,
            gain_loss_pct=stock_gain_pct,
            lots=data["lots"],
            return_1d=pd_entry.get("1d"),
            return_1m=pd_entry.get("1m"),
            return_3m=pd_entry.get("3m"),
            return_6m=pd_entry.get("6m"),
            return_1y=pd_entry.get("1y"),
            return_3y=pd_entry.get("3y"),
            return_5y=pd_entry.get("5y"),
            price_stale=data["price_stale"],
        ))

        total_value += stock_value
        total_cost_basis += stock_cost

    total_gain_loss = total_value - total_cost_basis
    total_gain_loss_pct = (total_gain_loss / total_cost_basis * 100) if total_cost_basis > 0 else 0

    stocks.sort(key=lambda x: x.total_value, reverse=True)

    failed = [t for t in tickers if (portfolio_data.get(t) or {}).get("price") is None]
    fetch_errors = [f"Could not fetch price for {t} from Yahoo Finance" for t in failed] if failed else None

    return schemas.PortfolioOverview(
        total_value=total_value,
        total_cost_basis=total_cost_basis,
        total_gain_loss=total_gain_loss,
        total_gain_loss_pct=total_gain_loss_pct,
        stocks=stocks,
        fetch_errors=fetch_errors,
    )


_PERIOD_DAYS = {"7d": 7, "1m": 30, "3m": 90, "6m": 180, "1y": 365}


def _period_start_date(period: str, today: date) -> Optional[date]:
    if period == "all":
        return None
    if period == "ytd":
        return date(today.year, 1, 1)
    days = _PERIOD_DAYS.get(period)
    return today - timedelta(days=days) if days is not None else None


def get_overall_performance(db: Session, period: str = "all") -> dict:
    """Portfolio movement over a period, but a lot only ever counts from its own
    purchase date — a lot bought in August never gets credited (or blamed) for
    what the ticker did before August, even if the selected period starts earlier.
    """
    holdings = get_all_holdings(db)
    today = date.today()
    if not holdings:
        return {
            "period": period, "start_date": None,
            "total_effective_cost": 0, "total_current_value": 0,
            "total_gain_loss": 0, "total_gain_loss_pct": 0, "stocks": [],
        }

    period_start = _period_start_date(period, today)
    tickers = list(set(h.ticker for h in holdings))
    portfolio_data = get_portfolio_data_bulk(tickers)

    # Only lots that were already open by period_start need a historical reference
    # price — lots bought after it just use their own purchase price, no fetch needed.
    historical = {}
    if period_start is not None:
        hist_tickers = list({h.ticker for h in holdings if h.purchase_date <= period_start})
        if hist_tickers:
            historical = get_historical_prices_bulk(
                hist_tickers, period_start.isoformat(), (today + timedelta(days=1)).isoformat()
            )

    def _price_on_or_after(ticker: str, day: date) -> Optional[float]:
        series = historical.get(ticker) or {}
        candidates = sorted(d for d in series if d >= day.isoformat())
        if not candidates:
            return None
        return series[candidates[0]]

    stocks_map = {}
    for h in holdings:
        ticker = h.ticker
        pd_entry = portfolio_data.get(ticker) or {}
        current_price = pd_entry.get("price") or 0
        price_stale = pd_entry.get("price") is None

        effective_start_price = h.purchase_price
        if period_start is not None and h.purchase_date <= period_start:
            hist_price = _price_on_or_after(ticker, period_start)
            if hist_price is not None:
                effective_start_price = hist_price
            # else: historical fetch failed — fall back to the lot's own purchase price

        effective_cost = effective_start_price * h.quantity
        current_value = current_price * h.quantity

        entry = stocks_map.setdefault(ticker, {
            "ticker": ticker, "name": pd_entry.get("name"), "current_price": current_price,
            "price_stale": price_stale, "quantity": 0, "effective_cost": 0, "current_value": 0,
        })
        entry["quantity"] += h.quantity
        entry["effective_cost"] += effective_cost
        entry["current_value"] += current_value

    stocks = []
    total_effective_cost = 0.0
    total_current_value = 0.0
    for ticker, e in stocks_map.items():
        gain_loss = e["current_value"] - e["effective_cost"]
        gain_loss_pct = (gain_loss / e["effective_cost"] * 100) if e["effective_cost"] > 0 else 0
        stocks.append({
            "ticker": ticker,
            "name": e["name"],
            "current_price": e["current_price"],
            "quantity": e["quantity"],
            "effective_cost": e["effective_cost"],
            "current_value": e["current_value"],
            "gain_loss": gain_loss,
            "gain_loss_pct": gain_loss_pct,
            "price_stale": e["price_stale"],
        })
        total_effective_cost += e["effective_cost"]
        total_current_value += e["current_value"]

    stocks.sort(key=lambda s: s["current_value"], reverse=True)
    total_gain_loss = total_current_value - total_effective_cost
    total_gain_loss_pct = (total_gain_loss / total_effective_cost * 100) if total_effective_cost > 0 else 0

    return {
        "period": period,
        "start_date": period_start.isoformat() if period_start else None,
        "total_effective_cost": total_effective_cost,
        "total_current_value": total_current_value,
        "total_gain_loss": total_gain_loss,
        "total_gain_loss_pct": total_gain_loss_pct,
        "stocks": stocks,
    }


def save_portfolio_snapshot(db: Session, snapshot_date: date) -> List[models.PortfolioSnapshot]:
    """Save current portfolio prices as a snapshot.

    Skips any ticker whose live price fetch fails instead of writing a $0
    placeholder — get_historical_snapshots sums total_value per date, so a
    single $0 ticker used to crater the whole portfolio's indexed return for
    that day. Also skips tickers that already have a snapshot for this date,
    making this safe to call again later the same day to pick up stragglers
    (see the end-of-day retry job in scheduler.py).
    """
    holdings = get_all_holdings(db)
    if not holdings:
        return []

    tickers = list(set(h.ticker for h in holdings))

    already_saved = {
        row[0] for row in db.query(models.PortfolioSnapshot.ticker)
        .filter(models.PortfolioSnapshot.snapshot_date == snapshot_date)
        .all()
    }
    tickers_to_fetch = [t for t in tickers if t not in already_saved]
    if not tickers_to_fetch:
        return []

    prices = get_multiple_prices(tickers_to_fetch)
    ticker_quantities = get_quantities_as_of(db, snapshot_date)

    previous_snapshots = db.query(models.PortfolioSnapshot).filter(
        models.PortfolioSnapshot.snapshot_date < snapshot_date
    ).order_by(models.PortfolioSnapshot.snapshot_date.desc()).all()

    previous_prices = {}
    for snap in previous_snapshots:
        if snap.ticker not in previous_prices:
            previous_prices[snap.ticker] = snap.current_price

    snapshots = []
    for ticker in tickers_to_fetch:
        current_price = prices.get(ticker)
        if not current_price:
            continue  # fetch failed — leave the gap for the retry job / next day's catch-up to fill

        total_value = current_price * ticker_quantities.get(ticker, 0)

        daily_change_pct = None
        if ticker in previous_prices and previous_prices[ticker] > 0:
            daily_change_pct = ((current_price - previous_prices[ticker]) / previous_prices[ticker]) * 100

        snapshot = models.PortfolioSnapshot(
            snapshot_date=snapshot_date,
            ticker=ticker,
            current_price=current_price,
            total_value=total_value,
            daily_change_pct=daily_change_pct
        )
        snapshots.append(snapshot)

    db.add_all(snapshots)
    db.commit()

    return snapshots


def get_historical_snapshots(db: Session, days: int = 30) -> List[schemas.HistoricalDataPoint]:
    """Get historical portfolio value snapshots."""
    snapshots = db.query(
        models.PortfolioSnapshot.snapshot_date,
        func.sum(models.PortfolioSnapshot.total_value).label("total_value"),
        func.avg(models.PortfolioSnapshot.daily_change_pct).label("daily_change_pct")
    ).group_by(
        models.PortfolioSnapshot.snapshot_date
    ).order_by(
        models.PortfolioSnapshot.snapshot_date.desc()
    ).limit(days).all()

    return [
        schemas.HistoricalDataPoint(
            date=s.snapshot_date,
            total_value=s.total_value,
            daily_change_pct=s.daily_change_pct
        )
        for s in reversed(snapshots)
    ]


def get_existing_snapshot_dates(db: Session) -> Set[date]:
    """Get all dates that already have snapshots."""
    results = db.query(models.PortfolioSnapshot.snapshot_date).distinct().all()
    return {r[0] for r in results}


def get_existing_ticker_date_pairs(db: Session) -> Set[tuple]:
    """Get all (ticker, date) pairs that already have snapshots."""
    results = db.query(
        models.PortfolioSnapshot.ticker,
        models.PortfolioSnapshot.snapshot_date
    ).all()
    return {(r[0], r[1]) for r in results}


def get_tickers_with_snapshots(db: Session) -> Set[str]:
    """Get all tickers that have any snapshot data."""
    results = db.query(models.PortfolioSnapshot.ticker).distinct().all()
    return {r[0] for r in results}


def get_trading_days(start_date: date, end_date: date) -> List[date]:
    """
    Get list of potential trading days (weekdays) between start and end date.
    Note: This doesn't account for market holidays.
    """
    trading_days = []
    current = start_date
    while current <= end_date:
        if current.weekday() < 5:  # Monday = 0, Friday = 4
            trading_days.append(current)
        current += timedelta(days=1)
    return trading_days


def get_backfill_status(db: Session, weeks: int = 52) -> dict:
    """
    Get detailed backfill status including per-ticker coverage.
    """
    holdings = get_all_holdings(db)
    if not holdings:
        return {
            "needs_backfill": False,
            "total_trading_days": 0,
            "missing_dates": 0,
            "missing_ticker_dates": 0,
            "tickers_missing_data": [],
            "coverage_pct": 100
        }

    tickers = list(set(h.ticker for h in holdings))
    tickers_set = set(tickers)

    end_date = date.today()
    start_date = end_date - timedelta(weeks=weeks)
    all_weekdays = set(get_trading_days(start_date, end_date))

    existing_pairs = get_existing_ticker_date_pairs(db)

    # Dates that have snapshot data for at least one portfolio ticker.
    # After a backfill, market holidays will have NO data for any ticker, so
    # they're excluded here — preventing them from forever showing as "missing".
    dates_with_any_data = {
        d for (t, d) in existing_pairs
        if t in tickers_set and start_date <= d <= end_date
    }

    if dates_with_any_data:
        # Use confirmed trading days (holidays naturally excluded).
        # Also include recent weekdays not yet in the DB in case backfill
        # hasn't been run for the last few days.
        recent_cutoff = end_date - timedelta(days=14)
        recent_unconfirmed = {d for d in all_weekdays if d >= recent_cutoff and d not in dates_with_any_data}
        effective_days = dates_with_any_data | recent_unconfirmed
    else:
        # No data at all yet — use all weekdays so we prompt for initial backfill.
        effective_days = all_weekdays

    # A 1-2 day gap is just today's (and sometimes yesterday's) snapshot not having
    # run yet — normal pipeline lag that self-heals via the daily job, not something
    # worth surfacing as a "needs backfill" warning.
    BACKFILL_GRACE_DAYS = 2

    tickers_missing_data = {}
    for ticker in tickers:
        missing_count = sum(1 for d in effective_days if (ticker, d) not in existing_pairs)
        if missing_count > BACKFILL_GRACE_DAYS:
            tickers_missing_data[ticker] = missing_count

    total_expected = len(tickers) * len(effective_days)
    total_existing = sum(1 for (t, d) in existing_pairs if t in tickers_set and start_date <= d <= end_date)
    total_missing = sum(tickers_missing_data.values())

    coverage_pct = round((total_existing / total_expected) * 100, 1) if total_expected > 0 else 100

    return {
        "needs_backfill": total_missing > 0,
        "total_trading_days": len(effective_days),
        "total_tickers": len(tickers),
        "existing_snapshots": total_existing,
        "missing_ticker_dates": total_missing,
        "tickers_missing_data": list(tickers_missing_data.keys()),
        "missing_by_ticker": tickers_missing_data,
        "coverage_pct": coverage_pct,
        "date_range": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat()
        }
    }


def backfill_historical_snapshots(db: Session, weeks: int = 52) -> dict:
    """
    Backfill missing historical snapshots for the past N weeks.
    
    This handles:
    - Dates with no snapshots at all
    - New tickers that don't have historical data yet
    - Partial data where some tickers are missing for certain dates

    Args:
        db: Database session
        weeks: Number of weeks to go back (default 52)

    Returns:
        Dict with backfill statistics
    """
    holdings = get_all_holdings(db)
    if not holdings:
        return {"status": "no_holdings", "message": "No holdings to backfill", "snapshots_created": 0}

    tickers = list(set(h.ticker for h in holdings))

    end_date = date.today()
    start_date = end_date - timedelta(weeks=weeks)
    trading_days = get_trading_days(start_date, end_date)

    existing_pairs = get_existing_ticker_date_pairs(db)
    
    missing_pairs = []
    for ticker in tickers:
        for day in trading_days:
            if (ticker, day) not in existing_pairs:
                missing_pairs.append((ticker, day))
    
    if not missing_pairs:
        return {
            "status": "complete",
            "message": "All tickers have complete historical data",
            "snapshots_created": 0,
            "tickers": tickers
        }

    tickers_to_backfill = list(set(pair[0] for pair in missing_pairs))
    print(f"Backfilling {len(missing_pairs)} missing ticker/date combinations for {len(tickers_to_backfill)} tickers...")

    historical_prices = get_historical_prices_bulk(
        tickers_to_backfill,
        start_date.strftime('%Y-%m-%d'),
        (end_date + timedelta(days=1)).strftime('%Y-%m-%d')
    )

    ticker_previous_prices = {}
    for ticker in tickers_to_backfill:
        last_snapshot = db.query(models.PortfolioSnapshot).filter(
            models.PortfolioSnapshot.ticker == ticker,
            models.PortfolioSnapshot.snapshot_date < start_date
        ).order_by(models.PortfolioSnapshot.snapshot_date.desc()).first()
        
        if last_snapshot:
            ticker_previous_prices[ticker] = last_snapshot.current_price

    snapshots_created = 0
    snapshots_to_add = []
    # missing_pairs is sorted by date below, so this only recomputes when the date
    # actually changes — one point-in-time reconstruction per date, not per ticker.
    quantities_by_date: dict = {}

    for ticker, snapshot_date in sorted(missing_pairs, key=lambda x: (x[1], x[0])):
        date_str = snapshot_date.strftime('%Y-%m-%d')
        ticker_history = historical_prices.get(ticker, {})
        current_price = ticker_history.get(date_str)

        if current_price is None:
            continue

        if snapshot_date not in quantities_by_date:
            quantities_by_date[snapshot_date] = get_quantities_as_of(db, snapshot_date)
        total_value = current_price * quantities_by_date[snapshot_date].get(ticker, 0)

        daily_change_pct = None
        prev_price = ticker_previous_prices.get(ticker)
        if prev_price and prev_price > 0:
            daily_change_pct = ((current_price - prev_price) / prev_price) * 100

        snapshot = models.PortfolioSnapshot(
            snapshot_date=snapshot_date,
            ticker=ticker,
            current_price=current_price,
            total_value=total_value,
            daily_change_pct=daily_change_pct
        )
        snapshots_to_add.append(snapshot)
        snapshots_created += 1

        ticker_previous_prices[ticker] = current_price

    if snapshots_to_add:
        db.add_all(snapshots_to_add)
        db.commit()

    new_tickers = [t for t in tickers_to_backfill if t not in get_tickers_with_snapshots(db)]
    
    return {
        "status": "success",
        "message": f"Backfilled {snapshots_created} snapshots for {len(tickers_to_backfill)} tickers",
        "snapshots_created": snapshots_created,
        "tickers_backfilled": tickers_to_backfill,
        "new_tickers_added": new_tickers if new_tickers else None,
        "date_range": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat()
        }
    }
