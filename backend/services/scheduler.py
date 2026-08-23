from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import date, datetime
import threading
import pytz

from database import SessionLocal
from services import portfolio

# APScheduler's own default misfire_grace_time is 1 second, so any delay
# past the scheduled time (a laptop sleeping / Docker Desktop pausing over
# lunch, a slow startup) causes the run to be silently dropped rather than
# executed late — confirmed in production logs (midday job "missed by
# 1:32:29" with zero error, just skipped until the next day). A few hours of
# grace means once-daily jobs still fire after a typical sleep/pause instead
# of going silent for the whole day.
scheduler = BackgroundScheduler(job_defaults={"misfire_grace_time": 4 * 3600})

EST = pytz.timezone('America/New_York')


def take_eod_snapshot():
    """Take a portfolio snapshot at end of the market day (4:00 PM EST).

    Also heals any snapshot gaps from the last couple of weeks (e.g. a
    previous day's live-price fetch that failed and was skipped) using actual
    historical closing prices — correct for a past date, unlike a live retry
    which only reflects "now". See retry_eod_snapshot for same-day stragglers.
    """
    db = SessionLocal()
    try:
        today = date.today()

        now_est = datetime.now(EST)
        if now_est.weekday() >= 5:
            print(f"Skipping snapshot on weekend: {now_est.strftime('%A')}")
            return

        print(f"Taking end-of-day snapshot at {now_est.isoformat()}")

        snapshots = portfolio.save_portfolio_snapshot(db, today)
        print(f"Created {len(snapshots)} snapshots for {today}")

        healed = portfolio.backfill_historical_snapshots(db, weeks=2)
        if healed.get("snapshots_created"):
            print(f"Healed {healed['snapshots_created']} gap(s) from previous day(s): {healed['tickers_backfilled']}")

        # AI recommendations are generated as part of the consolidated
        # market-close review (see check_eod, 4:05 PM EST) rather than
        # here, so there's only one LLM call per market close.

    except Exception as e:
        print(f"Error taking snapshot: {e}")
    finally:
        db.close()


def retry_eod_snapshot():
    """Retry today's snapshot ~2 hours after the main job (6:00 PM EST), for
    any tickers whose live price fetch failed the first time around — rate
    limits/network hiccups from 4:00 PM are often resolved by then.
    save_portfolio_snapshot is idempotent per (ticker, date), so this only
    touches tickers still missing from today's snapshot.
    """
    db = SessionLocal()
    try:
        now_est = datetime.now(EST)
        if now_est.weekday() >= 5:
            return
        snapshots = portfolio.save_portfolio_snapshot(db, date.today())
        if snapshots:
            print(f"EOD retry filled {len(snapshots)} ticker(s) that failed the 4:00 PM snapshot")
    except Exception as e:
        print(f"Error in EOD snapshot retry: {e}")
    finally:
        db.close()


def _startup_cache_warmup():
    """Pre-warm the bulk price/returns cache on startup so the first user request is fast."""
    from services.stock_data import warm_bulk_cache
    db = SessionLocal()
    try:
        tickers = portfolio.get_unique_tickers(db)
        if tickers:
            warm_bulk_cache(tickers)
        else:
            print("No tickers in portfolio — skipping cache warm-up")
    except Exception as e:
        print(f"Startup cache warm-up error: {e}")
    finally:
        db.close()


def track_lots():
    """Every 5 minutes: cheap, no-LLM bookkeeping only (updates per-lot
    gain% state and queues any threshold crossings) — never fires an alert.
    The midday/EOD checks below are what actually decide whether to alert."""
    db = SessionLocal()
    try:
        from services.alert_checker import track_lot_gains
        track_lot_gains(db)
    except Exception as e:
        print(f"Error in lot tracker: {e}")
    finally:
        db.close()


def check_midday():
    """Midday (12:05 PM EST): must-act check plus a conditional portfolio
    review if the portfolio-drop/lot-crossing conditions tripped since the
    last review. Silent on ordinary days."""
    db = SessionLocal()
    try:
        from services.alert_checker import run_midday_checks
        run_midday_checks(db)
    except Exception as e:
        print(f"Error in midday checks: {e}")
    finally:
        db.close()


def check_eod():
    """End of day (4:05 PM EST): the market-close review (daily digest),
    folding in any still-pending drop/crossing reasons."""
    db = SessionLocal()
    try:
        from services.alert_checker import run_eod_checks
        run_eod_checks(db)
    except Exception as e:
        print(f"Error in EOD checks: {e}")
    finally:
        db.close()


def check_daily_summary():
    """Weekdays, 4:10 PM EST: best/worst performer + total % for the day."""
    db = SessionLocal()
    try:
        now_est = datetime.now(EST)
        if now_est.weekday() >= 5:
            return
        from services.alert_checker import run_summary_alert
        run_summary_alert(db, "daily")
    except Exception as e:
        print(f"Error in daily summary: {e}")
    finally:
        db.close()


def check_weekly_summary():
    """Fridays, 4:12 PM EST: best/worst performer + total % for the week."""
    db = SessionLocal()
    try:
        now_est = datetime.now(EST)
        if now_est.weekday() != 4:
            return
        from services.alert_checker import run_summary_alert
        run_summary_alert(db, "weekly")
    except Exception as e:
        print(f"Error in weekly summary: {e}")
    finally:
        db.close()


def check_monthly_summary():
    """1st of each month, 4:15 PM EST: best/worst performer + total % for
    the trailing 30 days."""
    db = SessionLocal()
    try:
        from services.alert_checker import run_summary_alert
        run_summary_alert(db, "monthly")
    except Exception as e:
        print(f"Error in monthly summary: {e}")
    finally:
        db.close()


def start_scheduler():
    """Start the background scheduler for daily snapshots."""
    scheduler.add_job(
        take_eod_snapshot,
        CronTrigger(hour=16, minute=0, timezone=EST),
        id='eod_snapshot',
        name='End-of-day portfolio snapshot',
        replace_existing=True
    )

    scheduler.add_job(
        retry_eod_snapshot,
        CronTrigger(hour=18, minute=0, timezone=EST),
        id='eod_snapshot_retry',
        name='Retry end-of-day snapshot for tickers that failed at 4:00 PM',
        replace_existing=True
    )

    scheduler.add_job(
        track_lots,
        'interval',
        minutes=5,
        id='lot_tracker',
        name='5-minute per-lot profit tracker (bookkeeping only, no alerts)',
        replace_existing=True
    )

    scheduler.add_job(
        check_midday,
        CronTrigger(hour=12, minute=5, timezone=EST),
        id='midday_checks',
        name='Midday must-act check + conditional portfolio review',
        replace_existing=True
    )

    scheduler.add_job(
        check_eod,
        CronTrigger(hour=16, minute=5, timezone=EST),
        id='eod_review',
        name='End-of-day portfolio review',
        replace_existing=True
    )

    scheduler.add_job(
        check_daily_summary,
        CronTrigger(hour=16, minute=10, timezone=EST),
        id='daily_summary',
        name='Daily portfolio summary (best/worst performer)',
        replace_existing=True
    )

    scheduler.add_job(
        check_weekly_summary,
        CronTrigger(hour=16, minute=12, timezone=EST),
        id='weekly_summary',
        name='Weekly portfolio summary (Fridays, best/worst performer)',
        replace_existing=True
    )

    scheduler.add_job(
        check_monthly_summary,
        CronTrigger(day=1, hour=16, minute=15, timezone=EST),
        id='monthly_summary',
        name='Monthly portfolio summary (1st of month, best/worst performer)',
        replace_existing=True
    )

    scheduler.start()
    print("Scheduler started - will take snapshots at 4:00 PM EST on weekdays")
    print("EOD snapshot retry registered (6:00 PM EST weekdays)")
    print("Lot tracker registered (every 5 minutes, bookkeeping only)")
    print("Midday checks registered (12:05 PM EST weekdays)")
    print("EOD review registered (4:05 PM EST weekdays)")
    print("Daily/weekly/monthly summary alerts registered (4:10/4:12/4:15 PM EST)")

    # Pre-warm the bulk cache in the background so the first page load is fast
    threading.Thread(target=_startup_cache_warmup, daemon=True).start()


def stop_scheduler():
    """Stop the background scheduler."""
    scheduler.shutdown()
    print("Scheduler stopped")


def trigger_snapshot_now():
    """Manually trigger a snapshot immediately."""
    take_eod_snapshot()
