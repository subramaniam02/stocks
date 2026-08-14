import os
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from contextlib import asynccontextmanager
import csv
import io
from datetime import date, datetime

from database import engine, get_db, Base
import models
import schemas
from services import portfolio, stock_data, ai_advisor, alert_checker
from services import chat_storage, llm_debug
from services.scheduler import start_scheduler, stop_scheduler

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="Stock Portfolio Tracker", version="1.0.0", lifespan=lifespan)

_extra_origins = [o for o in os.getenv("CORS_ORIGINS", "").split(",") if o]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"] + _extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "Stock Portfolio Tracker API", "version": "1.0.0"}


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.post("/api/holdings", response_model=schemas.Holding)
def create_holding(holding: schemas.HoldingCreate, db: Session = Depends(get_db)):
    """Create a new holding (lot)."""
    if not stock_data.validate_ticker(holding.ticker):
        raise HTTPException(status_code=400, detail=f"Invalid ticker: {holding.ticker}")
    return portfolio.create_holding(db, holding)


@app.get("/api/holdings", response_model=List[schemas.Holding])
def get_holdings(db: Session = Depends(get_db)):
    """Get all holdings."""
    return portfolio.get_all_holdings(db)


@app.post("/api/holdings/sell-lots")
def sell_lots(req: schemas.SellLotsRequest, db: Session = Depends(get_db)):
    """Mark selected holding lots as sold, creating realized transactions and removing the lots."""
    created = []
    for item in req.lots:
        holding = db.query(models.Holding).filter(models.Holding.id == item.lot_id).first()
        if not holding:
            continue
        if item.sell_price <= 0:
            raise HTTPException(status_code=400, detail=f"Sell price must be positive for lot {item.lot_id}")
        txn = models.RealizedTransaction(
            ticker=holding.ticker,
            buy_date=holding.purchase_date,
            sell_date=req.sell_date,
            quantity=float(holding.quantity),
            buy_price=holding.purchase_price,
            sell_price=item.sell_price,
            notes=req.notes,
        )
        db.add(txn)
        db.delete(holding)
        gain_loss = (item.sell_price - holding.purchase_price) * holding.quantity
        days_held = (req.sell_date - holding.purchase_date).days
        created.append({
            "ticker": holding.ticker,
            "quantity": float(holding.quantity),
            "buy_price": holding.purchase_price,
            "sell_price": item.sell_price,
            "gain_loss": round(gain_loss, 2),
            "term": "Long-Term" if days_held >= 365 else "Short-Term",
        })
    db.commit()
    return {"sold": len(created), "transactions": created}


@app.delete("/api/holdings/{holding_id}")
def delete_holding(holding_id: int, db: Session = Depends(get_db)):
    """Delete a holding by ID."""
    if not portfolio.delete_holding(db, holding_id):
        raise HTTPException(status_code=404, detail="Holding not found")
    return {"message": "Holding deleted"}


@app.delete("/api/holdings")
def clear_holdings(db: Session = Depends(get_db)):
    """Clear all holdings."""
    count = portfolio.clear_all_holdings(db)
    return {"message": f"Cleared {count} holdings"}


@app.post("/api/upload-csv")
async def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload CSV file with holdings. Expected columns: ticker, purchase_date (MM/DD/YYYY), purchase_price, quantity"""
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read()
    decoded = content.decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(decoded))

    holdings_to_create = []
    errors = []
    row_num = 1

    for row in reader:
        row_num += 1
        print(row)
        try:
            ticker = row.get('ticker', '').strip().upper()
            if not ticker:
                errors.append(f"Row {row_num}: Missing ticker")
                continue

            if not stock_data.validate_ticker(ticker):
                errors.append(f"Row {row_num}: Invalid ticker '{ticker}'")
                continue

            purchase_date_str = row.get('purchase_date', '').strip()
            try:
                purchase_date = datetime.strptime(purchase_date_str, '%m/%d/%Y').date()
            except ValueError:
                errors.append(f"Row {row_num}: Invalid date format '{purchase_date_str}'. Use MM/DD/YYYY")
                continue

            try:
                purchase_price = float(row.get('purchase_price', 0))
                if purchase_price <= 0:
                    errors.append(f"Row {row_num}: Purchase price must be positive")
                    continue
            except ValueError:
                errors.append(f"Row {row_num}: Invalid purchase price")
                continue

            try:
                quantity = float(row.get('quantity', 0))
                if quantity <= 0:
                    errors.append(f"Row {row_num}: Quantity must be positive")
                    continue
            except ValueError:
                errors.append(f"Row {row_num}: Invalid quantity")
                continue

            holdings_to_create.append(schemas.HoldingCreate(
                ticker=ticker,
                purchase_date=purchase_date,
                purchase_price=purchase_price,
                quantity=quantity
            ))
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")

    created = []
    if holdings_to_create:
        created = portfolio.create_holdings_bulk(db, holdings_to_create)

    return {
        "message": f"Successfully imported {len(created)} holdings",
        "imported": len(created),
        "errors": errors
    }


@app.get("/api/portfolio", response_model=schemas.PortfolioOverview)
def get_portfolio(db: Session = Depends(get_db)):
    """Get portfolio overview with current performance."""
    return portfolio.get_portfolio_with_performance(db)


@app.get("/api/portfolio/history", response_model=List[schemas.HistoricalDataPoint])
def get_portfolio_history(days: int = 30, db: Session = Depends(get_db)):
    """Get historical portfolio snapshots."""
    return portfolio.get_historical_snapshots(db, days)


@app.post("/api/portfolio/snapshot")
def create_snapshot(db: Session = Depends(get_db)):
    """Manually trigger a portfolio snapshot."""
    today = date.today()
    snapshots = portfolio.save_portfolio_snapshot(db, today)
    return {"message": f"Created {len(snapshots)} snapshots", "date": today.isoformat()}


@app.get("/api/portfolio/overall-performance")
def get_overall_performance(period: str = "all", db: Session = Depends(get_db)):
    """Portfolio movement over a period. Each lot only counts from its own purchase
    date onward — a lot bought in August never gets credited/blamed for what the
    ticker did before August, even if the selected period starts earlier."""
    valid_periods = {"1m", "3m", "6m", "1y", "ytd", "all"}
    if period not in valid_periods:
        raise HTTPException(status_code=400, detail=f"Invalid period. Must be one of {sorted(valid_periods)}")
    return portfolio.get_overall_performance(db, period)


@app.get("/api/stock/{ticker}")
def get_stock_info(ticker: str):
    """Get information about a specific stock."""
    info = stock_data.get_stock_info(ticker.upper())
    if not info:
        raise HTTPException(status_code=404, detail=f"Stock not found: {ticker}")
    return info


@app.get("/api/stock/{ticker}/detail")
def get_ticker_detail(ticker: str):
    """Get rich ticker detail: intraday chart, day/52w ranges, expense ratio for ETFs."""
    detail = stock_data.get_ticker_detail(ticker.upper())
    if not detail:
        raise HTTPException(status_code=404, detail=f"Ticker not found: {ticker}")
    return detail


@app.get("/api/stock/{ticker}/performance")
def get_stock_performance(ticker: str, days: int = 30):
    """Get performance metrics for a specific stock over N days."""
    if days < 1 or days > 365:
        raise HTTPException(status_code=400, detail="Days must be between 1 and 365")

    perf = stock_data.get_stock_performance(ticker.upper(), days)
    if not perf:
        raise HTTPException(status_code=404, detail=f"Could not fetch performance for: {ticker}")
    return perf


@app.get("/api/stock/{ticker}/history")
def get_stock_history(ticker: str, period: str = "1mo"):
    """Get daily closing prices for a ticker over a given period (5d, 1mo, 6mo, ytd, 1y)."""
    data = stock_data.get_stock_history(ticker.upper(), period)
    return {"ticker": ticker, "period": period, "data": data}


@app.get("/api/insights/portfolio")
def get_portfolio_insights(days: int = 30, db: Session = Depends(get_db)):
    """Get performance insights for stocks in your portfolio."""
    if days < 1 or days > 365:
        raise HTTPException(status_code=400, detail="Days must be between 1 and 365")

    tickers = portfolio.get_unique_tickers(db)
    if not tickers:
        return {
            "gainers": [],
            "losers": [],
            "all": [],
            "total_analyzed": 0,
            "days": days,
            "message": "No stocks in portfolio"
        }

    return stock_data.get_top_performers(tickers, days)


@app.get("/api/insights/market")
def get_market_insights(days: int = 1, limit: int = 10):
    """
    Get market insights using Yahoo Finance screeners.

    For days=1 (today), uses real-time screener data.
    For days>1, fetches trending tickers and calculates performance over the period.
    """
    if limit < 1 or limit > 50:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 50")

    if days <= 1:
        return stock_data.get_market_overview(limit)
    else:
        trending = stock_data.get_trending_tickers(limit=30)
        if not trending:
            return {
                "gainers": [],
                "losers": [],
                "all": [],
                "total_analyzed": 0,
                "days": days,
                "message": "Unable to fetch market data"
            }
        return stock_data.get_top_performers(trending, days, limit)


@app.get("/api/insights/screener/{screener_type}")
def get_screener_data(screener_type: str, limit: int = 25):
    """
    Get stocks from a specific Yahoo Finance screener.

    Available screener types:
    - day_gainers: Top gaining stocks (mega/large cap, >3% gain)
    - day_losers: Top losing stocks (mega/large cap, <-2.5% loss)
    - most_actives: Most traded stocks by volume
    - undervalued_large_caps: Large caps trading below intrinsic value
    - growth_technology_stocks: Tech sector growth stocks
    - aggressive_small_caps: High-growth small caps
    - small_cap_gainers: Small caps with gains
    - undervalued_growth_stocks: Growth stocks at value prices
    """
    if screener_type not in stock_data.SCREENER_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid screener type. Available: {', '.join(stock_data.SCREENER_TYPES)}"
        )

    stocks = stock_data.get_market_movers(screener_type, limit)
    return {
        "screener_type": screener_type,
        "stocks": stocks,
        "count": len(stocks)
    }


@app.get("/api/insights/screeners")
def get_available_screeners():
    """Get list of available screener types."""
    return {
        "screeners": [
            {"id": "day_gainers", "name": "Day Gainers", "description": "Top gaining stocks (mega/large cap, >3% gain)"},
            {"id": "day_losers", "name": "Day Losers", "description": "Top losing stocks (mega/large cap, <-2.5% loss)"},
            {"id": "most_actives", "name": "Most Active", "description": "Most traded stocks by volume"},
            {"id": "undervalued_large_caps", "name": "Undervalued Large Caps", "description": "Large caps below intrinsic value"},
            {"id": "growth_technology_stocks", "name": "Growth Tech", "description": "Tech sector growth stocks"},
            {"id": "aggressive_small_caps", "name": "Aggressive Small Caps", "description": "High-growth small caps"},
            {"id": "small_cap_gainers", "name": "Small Cap Gainers", "description": "Small caps with gains"},
            {"id": "undervalued_growth_stocks", "name": "Undervalued Growth", "description": "Growth stocks at value prices"},
        ]
    }


@app.get("/api/insights/combined")
def get_combined_insights(days: int = 1, limit: int = 10, db: Session = Depends(get_db)):
    """Get combined insights for both portfolio and market stocks."""
    portfolio_tickers = portfolio.get_unique_tickers(db)

    if days <= 1:
        portfolio_insights = None
        if portfolio_tickers:
            portfolio_insights = stock_data.get_top_performers(portfolio_tickers, 1, limit)

        market_overview = stock_data.get_market_overview(limit)

        if portfolio_tickers:
            portfolio_set = set(portfolio_tickers)
            market_overview["gainers"] = [
                s for s in market_overview["gainers"]
                if s["ticker"] not in portfolio_set
            ][:limit]
            market_overview["losers"] = [
                s for s in market_overview["losers"]
                if s["ticker"] not in portfolio_set
            ][:limit]

        return {
            "portfolio": portfolio_insights,
            "market": market_overview,
            "days": days,
            "portfolio_tickers": portfolio_tickers,
            "source": "Yahoo Finance Screener (real-time)"
        }
    else:
        portfolio_insights = None
        if portfolio_tickers:
            portfolio_insights = stock_data.get_top_performers(portfolio_tickers, days, limit)

        trending = stock_data.get_trending_tickers(limit=30)
        trending_filtered = [t for t in trending if t not in set(portfolio_tickers)]
        market_insights = stock_data.get_top_performers(trending_filtered, days, limit) if trending_filtered else None

        return {
            "portfolio": portfolio_insights,
            "market": market_insights,
            "days": days,
            "portfolio_tickers": portfolio_tickers,
            "market_tickers_analyzed": len(trending_filtered),
            "source": "Yahoo Finance (historical)"
        }


@app.get("/api/recommendations", response_model=List[schemas.Recommendation])
def get_recommendations(limit: int = 10, db: Session = Depends(get_db)):
    """Get recent AI recommendations."""
    return db.query(models.Recommendation).order_by(
        models.Recommendation.created_at.desc()
    ).limit(limit).all()


@app.post("/api/recommendations/generate")
def generate_recommendations(db: Session = Depends(get_db)):
    """Manually trigger AI recommendation generation."""
    if not ai_advisor.check_ollama_available():
        raise HTTPException(
            status_code=503,
            detail="Ollama is not available. Please ensure it's running on localhost:11434"
        )

    recs = ai_advisor.generate_recommendations(db)
    return {
        "message": f"Generated {len(recs)} recommendations",
        "recommendations": [
            {"action": r.action_type, "ticker": r.ticker, "text": r.recommendation}
            for r in recs
        ]
    }


@app.get("/api/ai/status")
def get_ai_status():
    """Check if Ollama AI is available."""
    available = ai_advisor.check_ollama_available()
    models = ai_advisor.get_available_models() if available else []
    return {
        "available": available,
        "models": models,
        "default_model": ai_advisor.DEFAULT_MODEL
    }


@app.get("/api/ai/analyze")
def get_quick_analysis(db: Session = Depends(get_db)):
    """Get a quick AI analysis of the portfolio."""
    analysis = ai_advisor.get_quick_analysis(db)
    return {"analysis": analysis}


@app.post("/api/chat", response_model=schemas.ChatResponse)
def chat(request: schemas.ChatRequest, db: Session = Depends(get_db)):
    """Send a message to the AI advisor. Maintains conversation history per session."""
    if not ai_advisor.check_ollama_available():
        raise HTTPException(
            status_code=503,
            detail="Ollama is not available. Please ensure it's running on localhost:11434"
        )

    session_id = request.session_id
    if session_id:
        session = chat_storage.load_session(session_id)
        history = session["messages"] if session else []
    else:
        session_id = chat_storage.create_session()
        history = []

    if request.message.strip().lower() == "/portfolio-review":
        response_text = alert_checker.get_portfolio_review_message(db)
        if not response_text:
            response_text = "No holdings to review yet — add some stocks first."
    else:
        response_text = ai_advisor.chat_with_portfolio(
            message=request.message,
            history=history,
            db=db,
            session_id=session_id,
            model=request.model or ai_advisor.DEFAULT_MODEL,
        )

    if not response_text:
        raise HTTPException(status_code=500, detail="Failed to get response from AI")

    updated_history = history + [
        {"role": "user", "content": request.message},
        {"role": "assistant", "content": response_text},
    ]
    chat_storage.save_messages(session_id, updated_history)

    return schemas.ChatResponse(
        response=response_text,
        session_id=session_id,
        messages=[schemas.ChatMessageItem(**m) for m in updated_history]
    )


@app.get("/api/chat/sessions", response_model=list[schemas.ChatSessionSummary])
def list_chat_sessions():
    """List all saved chat sessions."""
    return chat_storage.list_sessions()


@app.get("/api/chat/sessions/{session_id}")
def get_chat_session(session_id: str):
    """Get full message history for a chat session."""
    session = chat_storage.load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.delete("/api/chat/sessions/{session_id}")
def delete_chat_session(session_id: str):
    """Delete a chat session."""
    if not chat_storage.delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted"}


@app.get("/api/debug/llm-calls")
def get_llm_debug_calls(limit: int = 50):
    """Return recent LLM calls with full prompts and responses."""
    return llm_debug.read_calls(limit)


@app.delete("/api/debug/llm-calls")
def clear_llm_debug_calls():
    """Clear the LLM debug log."""
    llm_debug.clear_calls()
    return {"message": "Debug log cleared"}


@app.post("/api/portfolio/backfill")
def backfill_history(weeks: int = 52, db: Session = Depends(get_db)):
    """
    Backfill missing historical snapshots for the past N weeks.
    Fetches historical prices from Yahoo Finance for dates without snapshots.
    """
    if weeks < 1 or weeks > 52:
        raise HTTPException(status_code=400, detail="Weeks must be between 1 and 52")

    result = portfolio.backfill_historical_snapshots(db, weeks)
    return result


@app.get("/api/portfolio/backfill/status")
def get_backfill_status_endpoint(db: Session = Depends(get_db)):
    """
    Get the current status of historical data coverage.

    This checks coverage for ALL tickers in the portfolio, including
    newly added tickers that may not have historical data yet.
    """
    return portfolio.get_backfill_status(db, weeks=52)


@app.get("/api/portfolio/comparison")
def get_portfolio_comparison(days: int = 90, db: Session = Depends(get_db)):
    """Compare portfolio performance vs SPY (S&P 500) and VTI (Total Market), indexed to 100."""
    from datetime import timedelta
    end_date = date.today()
    start_date = end_date - timedelta(days=days + 10)  # buffer for weekends/holidays

    snapshots = portfolio.get_historical_snapshots(db, days + 10)
    port_by_date = {s.date.isoformat(): s.total_value for s in snapshots}

    start_str, end_str = start_date.isoformat(), end_date.isoformat()
    spy_prices = stock_data.get_historical_prices("SPY", start_str, end_str)
    vti_prices = stock_data.get_historical_prices("VTI", start_str, end_str)

    common_dates = sorted(
        set(port_by_date) & set(spy_prices) & set(vti_prices)
    )
    if not common_dates:
        return {"data": [], "period_days": days}

    base_port = port_by_date[common_dates[0]]
    base_spy  = spy_prices[common_dates[0]]
    base_vti  = vti_prices[common_dates[0]]

    result = []
    for d in common_dates:
        result.append({
            "date":      d,
            "portfolio": round(port_by_date[d] / base_port * 100, 2),
            "spy":       round(spy_prices[d]   / base_spy  * 100, 2),
            "vti":       round(vti_prices[d]   / base_vti  * 100, 2),
        })
    return {"data": result, "period_days": days}


@app.get("/api/realized")
def get_realized_transactions(db: Session = Depends(get_db)):
    """Get all realized gain/loss transactions."""
    txns = db.query(models.RealizedTransaction).order_by(
        models.RealizedTransaction.sell_date.desc()
    ).all()
    result = []
    for t in txns:
        gain_loss = (t.sell_price - t.buy_price) * t.quantity
        days_held = (t.sell_date - t.buy_date).days
        term = "Long-Term" if days_held >= 365 else "Short-Term"
        result.append({
            "id": t.id,
            "ticker": t.ticker,
            "buy_date": t.buy_date.isoformat(),
            "sell_date": t.sell_date.isoformat(),
            "quantity": t.quantity,
            "buy_price": t.buy_price,
            "sell_price": t.sell_price,
            "notes": t.notes,
            "gain_loss": gain_loss,
            "term": term,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })
    return result


@app.get("/api/realized/movements")
def get_realized_movements(db: Session = Depends(get_db)):
    """For each sold lot, track how far the ticker has moved since the sell date."""
    txns = db.query(models.RealizedTransaction).order_by(
        models.RealizedTransaction.sell_date.desc()
    ).all()
    if not txns:
        return []

    tickers = list({t.ticker for t in txns})
    prices = stock_data.get_multiple_prices(tickers)

    result = []
    for t in txns:
        current_price = prices.get(t.ticker)
        change = None
        change_pct = None
        value_since_sold = None
        if current_price is not None:
            change = current_price - t.sell_price
            change_pct = (change / t.sell_price * 100) if t.sell_price > 0 else None
            value_since_sold = change * t.quantity
        result.append({
            "id": t.id,
            "ticker": t.ticker,
            "sell_date": t.sell_date.isoformat(),
            "quantity": t.quantity,
            "sell_price": t.sell_price,
            "current_price": current_price,
            "price_stale": current_price is None,
            "change": change,
            "change_pct": change_pct,
            "value_since_sold": value_since_sold,
        })
    return result


@app.post("/api/realized")
def create_realized_transaction(txn: schemas.RealizedTransactionCreate, db: Session = Depends(get_db)):
    """Record a realized gain/loss transaction."""
    if txn.sell_date < txn.buy_date:
        raise HTTPException(status_code=400, detail="Sell date cannot be before buy date")
    if txn.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")
    if txn.buy_price <= 0 or txn.sell_price <= 0:
        raise HTTPException(status_code=400, detail="Prices must be positive")
    db_txn = models.RealizedTransaction(
        ticker=txn.ticker.upper().strip(),
        buy_date=txn.buy_date,
        sell_date=txn.sell_date,
        quantity=txn.quantity,
        buy_price=txn.buy_price,
        sell_price=txn.sell_price,
        notes=txn.notes,
    )
    db.add(db_txn)
    db.commit()
    db.refresh(db_txn)
    gain_loss = (db_txn.sell_price - db_txn.buy_price) * db_txn.quantity
    days_held = (db_txn.sell_date - db_txn.buy_date).days
    return {
        "id": db_txn.id,
        "ticker": db_txn.ticker,
        "buy_date": db_txn.buy_date.isoformat(),
        "sell_date": db_txn.sell_date.isoformat(),
        "quantity": db_txn.quantity,
        "buy_price": db_txn.buy_price,
        "sell_price": db_txn.sell_price,
        "notes": db_txn.notes,
        "gain_loss": gain_loss,
        "term": "Long-Term" if days_held >= 365 else "Short-Term",
        "created_at": db_txn.created_at.isoformat() if db_txn.created_at else None,
    }


@app.delete("/api/realized/{txn_id}")
def delete_realized_transaction(txn_id: int, db: Session = Depends(get_db)):
    """Delete a realized transaction."""
    txn = db.query(models.RealizedTransaction).filter(models.RealizedTransaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(txn)
    db.commit()
    return {"message": "Transaction deleted"}


@app.get("/api/alerts", response_model=List[schemas.AlertOut])
def get_alerts(unread_only: bool = False, limit: int = 50, db: Session = Depends(get_db)):
    """Get alerts, newest first."""
    q = db.query(models.Alert).order_by(models.Alert.triggered_at.desc())
    if unread_only:
        q = q.filter(models.Alert.is_read == False)
    return q.limit(limit).all()


@app.get("/api/alerts/unread-count")
def get_unread_alert_count(db: Session = Depends(get_db)):
    """Get count of unread alerts."""
    count = db.query(models.Alert).filter(models.Alert.is_read == False).count()
    return {"count": count}


@app.post("/api/alerts/{alert_id}/read")
def mark_alert_read(alert_id: int, db: Session = Depends(get_db)):
    """Mark a single alert as read."""
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_read = True
    db.commit()
    return {"ok": True}


@app.post("/api/alerts/read-all")
def mark_all_alerts_read(db: Session = Depends(get_db)):
    """Mark all alerts as read."""
    db.query(models.Alert).filter(models.Alert.is_read == False).update({"is_read": True})
    db.commit()
    return {"ok": True}


@app.delete("/api/alerts")
def clear_all_alerts(db: Session = Depends(get_db)):
    """Delete all alerts."""
    count = db.query(models.Alert).delete()
    db.commit()
    return {"message": f"Deleted {count} alert(s)"}


@app.post("/api/alerts/check")
def trigger_alert_check(db: Session = Depends(get_db)):
    """Manually trigger the per-lot profit tracker (the 5-minute background
    check — never fires an alert itself, just updates tracking state used by
    the midday/EOD reviews)."""
    count = alert_checker.track_lot_gains(db)
    return {"alerts_created": count}


@app.get("/api/settings/alerts", response_model=schemas.AlertSettings)
def get_alert_settings():
    """Per-alert-type on/off toggles: lot-crossing, portfolio-drop, must-act,
    market-close review. Read by the scheduler's midday/EOD jobs."""
    return alert_checker.get_alert_settings()


@app.put("/api/settings/alerts", response_model=schemas.AlertSettings)
def update_alert_settings(update: schemas.AlertSettingsUpdate):
    partial = {k: v for k, v in update.model_dump().items() if v is not None}
    return alert_checker.update_alert_settings(partial)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
