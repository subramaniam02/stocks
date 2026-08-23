import json
import os
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

import models
from services import portfolio as portfolio_svc
from services import ai_advisor

_DATA_DIR = os.getenv(
    'DATA_DIR',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
)
STATE_PATH = os.path.join(_DATA_DIR, 'alert_state.json')
SETTINGS_PATH = os.path.join(_DATA_DIR, 'alert_settings.json')

LOT_PROFIT_THRESHOLD = 10.0
INTRADAY_DROP_THRESHOLD_PCT = -5.0

DEFAULT_SETTINGS = {
    "lot_crossing_enabled": True,
    "portfolio_drop_enabled": True,
    "must_act_enabled": True,
    "market_close_review_enabled": True,
    "daily_summary_enabled": True,
    "weekly_summary_enabled": True,
    "monthly_summary_enabled": True,
}

# "daily" uses each stock's live return_1d (already computed off the bulk
# price cache); "weekly"/"monthly" reuse get_overall_performance's rolling
# period_start logic, which already tracks each lot from its own purchase
# date rather than assuming a fixed portfolio composition.
SUMMARY_PERIODS = {
    "daily": "1d",
    "weekly": "7d",
    "monthly": "1m",
}


def _load_settings() -> dict:
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH, 'r') as f:
                data = json.load(f)
                return {**DEFAULT_SETTINGS, **{k: data[k] for k in DEFAULT_SETTINGS if k in data}}
        except Exception:
            pass
    return dict(DEFAULT_SETTINGS)


def _save_settings(settings: dict) -> None:
    with open(SETTINGS_PATH, 'w') as f:
        json.dump(settings, f, indent=2)


def get_alert_settings() -> dict:
    return _load_settings()


def update_alert_settings(partial: dict) -> dict:
    settings = _load_settings()
    settings.update({k: v for k, v in partial.items() if k in DEFAULT_SETTINGS})
    _save_settings(settings)
    return settings


def _load_state() -> dict:
    if os.path.exists(STATE_PATH):
        try:
            with open(STATE_PATH, 'r') as f:
                data = json.load(f)
                return {
                    "lot_last_gain_pct": data.get("lot_last_gain_pct", {}),
                    "pending_lot_crossings": data.get("pending_lot_crossings", []),
                }
        except Exception:
            pass
    return {"lot_last_gain_pct": {}, "pending_lot_crossings": []}


def _save_state(state: dict) -> None:
    with open(STATE_PATH, 'w') as f:
        json.dump(state, f, indent=2)


def _save_alert(db: Session, alert_type: str, message: str,
                ticker: Optional[str] = None,
                value: Optional[float] = None,
                threshold: Optional[float] = None) -> models.Alert:
    alert = models.Alert(
        alert_type=alert_type,
        ticker=ticker,
        message=message,
        value=value,
        threshold=threshold,
        is_read=False,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def _compute_today_pct(port) -> Optional[float]:
    """Today's portfolio $ and % change, derived from each stock's return_1d.
    Returns None if no stock has usable today-return data."""
    today_dollar = 0.0
    have_data = False
    for stock in port.stocks:
        if stock.return_1d is None or stock.price_stale:
            continue
        per_share = stock.current_price * stock.return_1d / (100 + stock.return_1d)
        today_dollar += per_share * stock.total_quantity
        have_data = True

    if not have_data:
        return None

    yesterday_value = port.total_value - today_dollar
    today_pct = (today_dollar / yesterday_value * 100) if yesterday_value > 0 else 0.0
    return today_pct


def _build_review_content(db: Session, log_label: str) -> Optional[tuple]:
    """Today's $/% recap plus fresh AI recommendations (buy/sell/hold/harvest/
    trend). Shared by run_portfolio_review (the scheduled alert) and
    get_portfolio_review_message (the on-demand /portfolio-review chat
    command) so both surfaces stay in sync. Returns (recap, actions,
    today_pct), or None if there's no portfolio to review."""
    try:
        port = portfolio_svc.get_portfolio_with_performance(db)
    except Exception as e:
        print(f"Portfolio review ({log_label}): failed to load portfolio: {e}")
        return None

    if not port.stocks:
        return None

    today_pct = _compute_today_pct(port)
    recap = f"Today: {today_pct:+.2f}%. " if today_pct is not None else ""

    try:
        recs = ai_advisor.generate_recommendations(db)
    except Exception as e:
        print(f"Portfolio review ({log_label}): error generating recommendations: {e}")
        recs = []

    if recs:
        top = recs[:3]
        actions = " | ".join(
            f"[{r.action_type}] {r.ticker or 'Portfolio'}: {r.recommendation}" for r in top
        )
    else:
        actions = "No specific actions flagged."

    return recap, actions, today_pct


def run_portfolio_review(db: Session, reason: str) -> int:
    """The single consolidated LLM portfolio review: today's $/% recap plus
    fresh AI recommendations, saved as one Alert. This is the only place a
    "portfolio_review" alert is created — called from run_midday_checks and
    run_eod_checks."""
    result = _build_review_content(db, log_label=reason)
    if result is None:
        return 0
    recap, actions, today_pct = result

    msg = f"{reason}. {recap}{actions}"
    _save_alert(db, "portfolio_review", msg, value=round(today_pct, 2) if today_pct is not None else None)
    print(f"Portfolio review ({reason}): created alert")
    return 1


def get_portfolio_review_message(db: Session) -> Optional[str]:
    """Same recap + recommendations logic as run_portfolio_review, for the
    on-demand /portfolio-review chat command — returns the message directly
    instead of saving an Alert."""
    result = _build_review_content(db, log_label="chat")
    if result is None:
        return None
    recap, actions, _ = result
    return f"{recap}{actions}"


def track_lot_gains(db: Session) -> int:
    """Cheap, no-LLM bookkeeping. Runs every 5 minutes regardless of weekday
    (harmless, keeps state accurate for Monday). Updates each lot's last-seen
    gain% and, when a lot crosses back below the profit threshold, queues it
    in pending_lot_crossings for the next midday/EOD review to pick up —
    never fires an alert itself. No-ops entirely if the lot-crossing check is
    disabled in settings. Returns the number of newly-queued crossings."""
    settings = _load_settings()
    if not settings["lot_crossing_enabled"]:
        return 0

    state = _load_state()
    lot_last_gain_pct: dict = state["lot_last_gain_pct"]
    pending: list = state["pending_lot_crossings"]

    try:
        port = portfolio_svc.get_portfolio_with_performance(db)
    except Exception as e:
        print(f"Lot tracker: failed to load portfolio: {e}")
        return 0

    if not port.stocks:
        return 0

    seen_ids = set()
    newly_crossed = 0

    for stock in port.stocks:
        for lot in stock.lots:
            lot_id = str(lot.id)
            seen_ids.add(lot_id)

            if lot.price_stale:
                # Yahoo Finance didn't return a price this cycle, so current_price/
                # gain_loss_pct fell back to a 0-price placeholder that looks like a
                # to-zero crash. Skip it rather than compare against or store that value.
                continue

            current_pct = lot.gain_loss_pct
            last_pct = lot_last_gain_pct.get(lot_id)

            if last_pct is not None and last_pct >= LOT_PROFIT_THRESHOLD and current_pct < LOT_PROFIT_THRESHOLD:
                if stock.ticker not in pending:
                    pending.append(stock.ticker)
                    newly_crossed += 1

            lot_last_gain_pct[lot_id] = current_pct

    # Drop state for lots that no longer exist (sold/deleted)
    for stale_id in set(lot_last_gain_pct.keys()) - seen_ids:
        del lot_last_gain_pct[stale_id]

    state["lot_last_gain_pct"] = lot_last_gain_pct
    state["pending_lot_crossings"] = pending
    _save_state(state)

    if newly_crossed:
        print(f"Lot tracker: {newly_crossed} lot(s) newly crossed below +{LOT_PROFIT_THRESHOLD:.0f}% "
              f"(queued for next review)")
    return newly_crossed


def get_period_summary(db: Session, period: str) -> Optional[dict]:
    """Total $/% change, gained-vs-lost $ and ticker counts, plus the single
    best- and worst-performing ticker over 'daily' | 'weekly' | 'monthly'.
    Shared by the scheduled summary alert, the live Alerts-page preview, and
    the Performance-page text summary, so all three stay in sync."""
    period_key = SUMMARY_PERIODS.get(period)
    if period_key is None:
        return None

    if period_key == "1d":
        try:
            port = portfolio_svc.get_portfolio_with_performance(db)
        except Exception as e:
            print(f"{period} summary: failed to load portfolio: {e}")
            return None
        if not port.stocks:
            return None
        total_pct = _compute_today_pct(port)
        ranked = [
            {
                "ticker": s.ticker,
                "gain_loss_pct": s.return_1d,
                "gain_loss": s.current_price * s.return_1d / (100 + s.return_1d) * s.total_quantity,
            }
            for s in port.stocks if s.return_1d is not None and not s.price_stale
        ]
    else:
        try:
            perf = portfolio_svc.get_overall_performance(db, period_key)
        except Exception as e:
            print(f"{period} summary: failed to load overall performance: {e}")
            return None
        stocks = perf.get("stocks") or []
        if not stocks:
            return None
        total_pct = perf.get("total_gain_loss_pct")
        ranked = [
            {"ticker": s["ticker"], "gain_loss_pct": s["gain_loss_pct"], "gain_loss": s["gain_loss"]}
            for s in stocks if not s.get("price_stale")
        ]

    if not ranked:
        return None

    def _rounded(r):
        return {"ticker": r["ticker"], "gain_loss_pct": round(r["gain_loss_pct"], 2), "gain_loss": round(r["gain_loss"], 2)}

    gainers = sorted((r for r in ranked if r["gain_loss_pct"] > 0), key=lambda r: r["gain_loss_pct"], reverse=True)
    losers = sorted((r for r in ranked if r["gain_loss_pct"] < 0), key=lambda r: r["gain_loss_pct"])
    unchanged_count = len(ranked) - len(gainers) - len(losers)

    gained_dollar = sum(r["gain_loss"] for r in gainers)
    lost_dollar = sum(r["gain_loss"] for r in losers)

    return {
        "period": period,
        "total_pct": round(total_pct, 2) if total_pct is not None else None,
        "gained_dollar": round(gained_dollar, 2),
        "lost_dollar": round(lost_dollar, 2),
        "gainers_count": len(gainers),
        "losers_count": len(losers),
        "unchanged_count": unchanged_count,
        "total_count": len(ranked),
        "gainers": [_rounded(r) for r in gainers],
        "losers": [_rounded(r) for r in losers],
        "best": _rounded(gainers[0]) if gainers else None,
        "worst": _rounded(losers[0]) if losers else None,
    }


def run_summary_alert(db: Session, period: str) -> int:
    """Create the scheduled daily/weekly/monthly summary alert (best/worst
    performer + total %), if that period's toggle is enabled."""
    settings = _load_settings()
    if not settings.get(f"{period}_summary_enabled", True):
        return 0

    summary = get_period_summary(db, period)
    if summary is None:
        return 0

    total_pct, best, worst = summary["total_pct"], summary["best"], summary["worst"]
    total_str = f"{total_pct:+.2f}%" if total_pct is not None else "n/a"
    msg = (
        f"Portfolio {total_str} (+${summary['gained_dollar']:.0f} / -${abs(summary['lost_dollar']):.0f}). "
        f"{summary['gainers_count']} up, {summary['losers_count']} down."
    )
    if best:
        msg += f" Best: {best['ticker']} {best['gain_loss_pct']:+.1f}%."
    if worst:
        msg += f" Worst: {worst['ticker']} {worst['gain_loss_pct']:+.1f}%."
    _save_alert(db, f"{period}_summary", msg, value=total_pct)
    print(f"{period.capitalize()} summary: created alert")
    return 1


def get_live_conditions(db: Session) -> dict:
    """Real-time view of which tickers/lots currently satisfy each alert
    condition, independent of whether an Alert row has actually fired (the
    lot-crossing alert only fires on the way back down through the
    threshold, so this also surfaces lots currently sitting above it)."""
    settings = _load_settings()

    try:
        port = portfolio_svc.get_portfolio_with_performance(db)
    except Exception as e:
        print(f"Live conditions: failed to load portfolio: {e}")
        port = None

    lots_above_threshold = []
    if port:
        for stock in port.stocks:
            for lot in stock.lots:
                if lot.price_stale:
                    continue
                if lot.gain_loss_pct >= LOT_PROFIT_THRESHOLD:
                    lots_above_threshold.append({
                        "ticker": stock.ticker,
                        "lot_id": lot.id,
                        "purchase_date": lot.purchase_date.isoformat(),
                        "quantity": lot.quantity,
                        "gain_loss_pct": round(lot.gain_loss_pct, 2),
                        "gain_loss": round(lot.gain_loss, 2),
                    })
    lots_above_threshold.sort(key=lambda x: x["gain_loss_pct"], reverse=True)

    today_pct = _compute_today_pct(port) if port is not None else None
    state = _load_state()

    return {
        "lot_crossing": {
            "enabled": settings["lot_crossing_enabled"],
            "threshold_pct": LOT_PROFIT_THRESHOLD,
            "lots_above_threshold": lots_above_threshold,
            "pending_crossing_tickers": state["pending_lot_crossings"],
        },
        "portfolio_drop": {
            "enabled": settings["portfolio_drop_enabled"],
            "threshold_pct": INTRADAY_DROP_THRESHOLD_PCT,
            "today_pct": round(today_pct, 2) if today_pct is not None else None,
            "triggered": today_pct is not None and today_pct <= INTRADAY_DROP_THRESHOLD_PCT,
        },
        "must_act_enabled": settings["must_act_enabled"],
        "market_close_review_enabled": settings["market_close_review_enabled"],
    }


def _drop_and_crossing_reason(db: Session, settings: dict, state: dict) -> tuple:
    """Shared by run_midday_checks/run_eod_checks: checks the portfolio-drop
    and pending-lot-crossing conditions (each gated by its own toggle) and
    returns (reason_or_None, today_pct_or_None). Does not fire or clear
    anything — callers decide what to do with the result."""
    parts = []
    today_pct = None

    if settings["portfolio_drop_enabled"]:
        try:
            port = portfolio_svc.get_portfolio_with_performance(db)
            today_pct = _compute_today_pct(port)
        except Exception as e:
            print(f"Drop check: failed to load portfolio: {e}")
            today_pct = None
        if today_pct is not None and today_pct <= INTRADAY_DROP_THRESHOLD_PCT:
            parts.append(f"Portfolio down {today_pct:.1f}% today")

    if settings["lot_crossing_enabled"] and state["pending_lot_crossings"]:
        tickers = state["pending_lot_crossings"]
        reason = f"{tickers[0]} lot dropped below +{LOT_PROFIT_THRESHOLD:.0f}% profit"
        if len(tickers) > 1:
            reason += f" (+{len(tickers) - 1} more)"
        parts.append(reason)

    return (" and ".join(parts) if parts else None), today_pct


def run_midday_checks(db: Session) -> int:
    """Scheduled once daily at 12:05 PM EST. Runs the must-act check (if
    enabled) and, independently, a conditional portfolio review that only
    fires if the portfolio-drop and/or lot-crossing conditions actually
    tripped since the last review — silent on ordinary days, like must-act
    already was."""
    now = datetime.now()
    if now.weekday() >= 5:
        print(f"Skipping midday checks on weekend: {now.strftime('%A')}")
        return 0

    settings = _load_settings()
    created = 0

    if settings["must_act_enabled"]:
        created += check_midday_must_act(db)

    state = _load_state()
    reason, _ = _drop_and_crossing_reason(db, settings, state)
    if reason:
        if run_portfolio_review(db, reason=reason):
            created += 1
        state["pending_lot_crossings"] = []
        _save_state(state)

    return created


def run_eod_checks(db: Session) -> int:
    """Scheduled once daily at 4:05 PM EST. If the market-close review is
    enabled, always fires it (the daily digest) and folds in any still-
    pending drop/crossing reasons rather than firing a second alert. If the
    digest is disabled but a drop/crossing condition tripped, still fires a
    review just for those — disabling the daily digest shouldn't silently
    swallow a real portfolio drop."""
    now = datetime.now()
    if now.weekday() >= 5:
        print(f"Skipping EOD checks on weekend: {now.strftime('%A')}")
        return 0

    settings = _load_settings()
    state = _load_state()
    extra_reason, _ = _drop_and_crossing_reason(db, settings, state)

    if settings["market_close_review_enabled"]:
        reason = "Market close" if not extra_reason else f"Market close ({extra_reason})"
        created = run_portfolio_review(db, reason=reason)
    elif extra_reason:
        created = run_portfolio_review(db, reason=extra_reason)
    else:
        created = 0

    if created and (settings["lot_crossing_enabled"] or settings["portfolio_drop_enabled"]):
        state["pending_lot_crossings"] = []
        _save_state(state)

    return created


def check_midday_must_act(db: Session) -> int:
    """Ask the LLM whether there's an urgent, must-act-today situation. Only
    creates an alert when the model says yes — silent on ordinary days.
    Weekday/toggle gating is handled by the caller (run_midday_checks)."""
    if not ai_advisor.check_ollama_available():
        print("Must-act check: Ollama not available, skipping")
        return 0

    try:
        port = portfolio_svc.get_portfolio_with_performance(db)
    except Exception as e:
        print(f"Must-act check: failed to load portfolio: {e}")
        return 0

    if not port.stocks:
        return 0

    if port.fetch_errors:
        print(f"Must-act check: skipping, price data incomplete ({len(port.fetch_errors)} ticker(s) failed to fetch)")
        return 0

    try:
        prompt = ai_advisor.build_must_act_prompt(port)
        result = ai_advisor.query_ollama_json(prompt)
        if not result or not result.get("must_act"):
            print("Must-act check: no urgent action flagged")
            return 0

        reason = ai_advisor._strip_stray_markdown(result.get("reason", "").strip())
        action = ai_advisor._strip_stray_markdown(result.get("action", "").strip())
        msg = f"{reason} — {action}" if action else reason
        _save_alert(db, "llm_must_act", msg)
        print("Must-act check: created alert")
        return 1
    except Exception as e:
        print(f"Must-act check: error: {e}")
        return 0
