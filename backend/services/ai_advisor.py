import os
import httpx
import json
import time
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import date, datetime

import models
import schemas
from services import portfolio, stock_data
from services import llm_debug

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:5002")
# Model listing needs a plain GET to Ollama's native /api/tags. OLLAMA_BASE_URL
# may point at the mlflow gateway's raw-proxy, which is POST-only, so this
# points directly at Ollama for that one read-only, non-inference call.
OLLAMA_DIRECT_URL = os.getenv("OLLAMA_DIRECT_URL", "http://localhost:11434")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "gemma3")
# The full-portfolio prompt (build_portfolio_prompt: every ticker, every
# lot) is large — 15-16k tokens for a 50-ticker portfolio even after capping
# lots per ticker. Verified DEFAULT_MODEL (gemma4:latest in this deployment)
# reliably returns an EMPTY completion for a prompt this size (burns its
# entire token budget with no visible output; not a timeout, not a context
# overflow — confirmed via direct llama.cpp server logs). gemma3:latest and
# llama3:latest both handle the identical prompt correctly, so the two
# large-prompt call sites (generate_recommendations, get_quick_analysis) use
# this instead of DEFAULT_MODEL, leaving the global chat/must-act model
# (smaller prompts, unaffected) untouched.
RECOMMENDATIONS_MODEL = os.getenv("OLLAMA_RECOMMENDATIONS_MODEL", "gemma3:latest")

# Feature flag: chat's system message carries every ticker + every lot (same
# formatting as build_portfolio_prompt), so a large portfolio's prompt can
# still hit length-related failures even after raising num_ctx/num_predict.
# When enabled, portfolios bigger than CHAT_CHUNK_SIZE are split into
# per-chunk calls (small prompt each) plus one final consolidation call —
# see _chat_with_portfolio_chunked. Defaults to on; set
# CHUNKED_CHAT_ENABLED=false to fall back to the single-call path for any
# portfolio size.
CHUNKED_CHAT_ENABLED = os.getenv("CHUNKED_CHAT_ENABLED", "true").lower() == "true"
CHAT_CHUNK_SIZE = int(os.getenv("CHAT_CHUNK_SIZE", "10"))

# Identifies this app's calls in the shared MLflow trace proxy so traces can
# be filtered by repo (tags.app_name = 'stocks').
APP_HEADERS = {"X-App-Name": "stocks"}


def check_ollama_available() -> bool:
    """Check if Ollama (and the configured model) is reachable.

    Uses a POST to /api/generate with an empty prompt rather than GET
    /api/tags: Ollama just loads the model and returns without generating
    any tokens, so it's cheap, and it works whether OLLAMA_BASE_URL points
    directly at Ollama or at the mlflow gateway's POST-only raw-proxy route.
    """
    try:
        response = httpx.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={"model": DEFAULT_MODEL, "prompt": "", "stream": False},
            headers=APP_HEADERS,
            # generous timeout: a cold model load (e.g. gemma4's 9.6GB) can
            # take longer than a typical health-check budget
            timeout=30.0,
        )
        return response.status_code == 200
    except Exception:
        return False


def get_available_models() -> List[str]:
    """Get list of available Ollama models."""
    try:
        response = httpx.get(f"{OLLAMA_DIRECT_URL}/api/tags", timeout=5.0)
        if response.status_code == 200:
            data = response.json()
            return [model["name"] for model in data.get("models", [])]
        return []
    except Exception:
        return []


def _format_period_returns(stock: schemas.StockSummary) -> str:
    """One-line 1D/1M/3M/6M/1Y/3Y/5Y performance summary for a ticker."""
    periods = [
        ("1D", stock.return_1d), ("1M", stock.return_1m), ("3M", stock.return_3m),
        ("6M", stock.return_6m), ("1Y", stock.return_1y), ("3Y", stock.return_3y),
        ("5Y", stock.return_5y),
    ]
    return " | ".join(f"{label} {v:+.1f}%" if v is not None else f"{label} n/a" for label, v in periods)


def _lot_term(purchase_date: date) -> str:
    """Long-Term once held >= 365 days (matches the LT capital-gains cutoff),
    otherwise Short-Term — surfaced to the LLM so it can reason about
    tax-loss-harvesting candidates (short-term losses are more valuable to
    realize than long-term ones)."""
    return "Long-Term" if (date.today() - purchase_date).days >= 365 else "Short-Term"


MAX_LOTS_PER_TICKER = 5


def _format_lots(stock: schemas.StockSummary) -> str:
    """One line per individual lot, oldest first among the most significant
    lots by $ gain/loss magnitude. Capped per ticker so a portfolio with
    many-lot positions (e.g. 20+ lots from recurring buys) doesn't blow up
    the prompt into tens of thousands of tokens — a real portfolio with 50
    tickers and heavy per-ticker lot counts was measured at ~32k prompt
    tokens uncapped, leaving the model no room to generate a response at
    all. The omitted lots are summarized in the ticker-level header instead
    (total shares/avg cost already reflect all lots, not just those shown)."""
    all_lots = stock.lots
    shown = sorted(all_lots, key=lambda l: abs(l.gain_loss), reverse=True)[:MAX_LOTS_PER_TICKER]
    lines = []
    for lot in sorted(shown, key=lambda l: l.purchase_date):
        lines.append(
            f"    - {lot.quantity:.2f} sh @ ${lot.purchase_price:.2f} (bought {lot.purchase_date}, {_lot_term(lot.purchase_date)}) "
            f"-> ${lot.current_price:.2f}, {lot.gain_loss_pct:+.1f}% (${lot.gain_loss:+,.2f})"
        )

    omitted = len(all_lots) - len(shown)
    if omitted > 0:
        lines.append(f"    ... and {omitted} more lot(s) with smaller gain/loss impact (not shown)")

    return "\n".join(lines)


def _format_stock_block(stock: schemas.StockSummary) -> str:
    """Full per-ticker block: summary line, period performance, and every lot."""
    name_part = f" ({stock.name})" if stock.name else ""
    header = (
        f"- {stock.ticker}{name_part}: {stock.total_quantity:.2f} shares, "
        f"avg cost ${stock.average_cost:.2f}, current ${stock.current_price:.2f}, "
        f"gain/loss {stock.gain_loss_pct:+.1f}%"
    )
    return (
        f"{header}\n"
        f"  Performance: {_format_period_returns(stock)}\n"
        f"  Lots:\n{_format_lots(stock)}"
    )


def build_portfolio_prompt(portfolio_data: schemas.PortfolioOverview) -> str:
    """Build a prompt for the AI advisor based on portfolio data."""

    stocks_summary = []
    sector_allocation = {}

    for stock in portfolio_data.stocks:
        info = stock_data.get_stock_info(stock.ticker)
        sector = info.get("sector", "Unknown") if info else "Unknown"

        stocks_summary.append(_format_stock_block(stock))

        if sector not in sector_allocation:
            sector_allocation[sector] = 0
        sector_allocation[sector] += stock.total_value
    
    total_value = portfolio_data.total_value
    sector_pcts = {
        s: (v / total_value * 100) if total_value > 0 else 0 
        for s, v in sector_allocation.items()
    }
    
    prompt = f"""You are a financial advisor AI. Analyze this stock portfolio and provide actionable recommendations.

PORTFOLIO SUMMARY:
- Total Value: ${portfolio_data.total_value:,.2f}
- Total Cost Basis: ${portfolio_data.total_cost_basis:,.2f}
- Overall Gain/Loss: ${portfolio_data.total_gain_loss:,.2f} ({portfolio_data.total_gain_loss_pct:+.1f}%)

HOLDINGS:
{chr(10).join(stocks_summary)}

SECTOR ALLOCATION:
{chr(10).join(f"- {s}: {p:.1f}%" for s, p in sorted(sector_pcts.items(), key=lambda x: -x[1]))}

Based on this portfolio, provide 3-5 specific, actionable recommendations. Consider:
1. Concentration risk (any single stock > 25% of portfolio)
2. Sector diversification
3. Positions with significant gains (> 30%) - consider taking profits
4. Positions with significant losses (> 20%) - evaluate if fundamentals changed
5. Overall portfolio balance
6. Tax-loss harvesting: look at individual lots (not just the ticker overall) — a
   Short-Term lot sitting at a loss is a harvest candidate worth calling out even
   if other lots of the same ticker are profitable, since realizing that specific
   lot's loss can offset gains elsewhere. Long-Term losing lots are lower priority.
7. Trend-based profit-taking: a position can be up overall (gain/loss %) while its
   recent momentum has turned negative (1D and/or 1M performance below the longer
   windows, or outright negative) — flag these as worth trimming to lock in gains
   before further erosion, even though the headline gain/loss % still looks good.

Format each recommendation as:
[ACTION] TICKER (if applicable): Brief recommendation

Plain text only — no markdown formatting (no **bold**, no bullet lists, no headers).
These get joined into a single line, so any markdown emphasis you add will not render
correctly.

Example:
[TAKE_PROFITS] AAPL: Consider selling 25% of position to lock in 45% gains
[DIVERSIFY] N/A: Portfolio is 80% technology, consider adding healthcare or consumer stocks
[HOLD] MSFT: Position performing well within target allocation
[HARVEST_LOSS] GLD: Short-Term lot bought 3 months ago is down 12% — consider selling to realize the loss
[REDUCE] NVDA: Up 40% overall but 1D -3.2% / 1M -8.1% momentum has turned; consider trimming to lock in gains

Provide your recommendations:"""

    return prompt


def query_ollama(prompt: str, model: str = DEFAULT_MODEL) -> Optional[str]:
    """Query Ollama with a prompt and return the response."""
    try:
        response = httpx.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                # Reasoning-capable models (e.g. gemma4) can spend the entire
                # num_predict budget on hidden chain-of-thought and never reach
                # the visible completion, returning empty output that looks
                # like a context/timeout failure but isn't (confirmed: ~2x
                # latency and a populated "thinking" field when this isn't
                # set). Disabling it is a no-op for non-reasoning models.
                "think": False,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 1000,
                    # A full portfolio prompt (every ticker, every lot) for a
                    # large portfolio can run ~12-16k tokens; 16384 left no
                    # room for the model to generate a response at all (it
                    # returned an empty completion). The model supports up to
                    # 131072 tokens, so this has plenty of headroom to grow.
                    "num_ctx": 32768
                }
            },
            headers=APP_HEADERS,
            # Longer than the interactive chat/JSON timeouts below: this is only
            # ever called from background jobs (generate_recommendations,
            # get_quick_analysis), and a full portfolio prompt (all lots, all
            # tickers) plus a cold model load can comfortably exceed 120s.
            timeout=300.0
        )

        if response.status_code == 200:
            data = response.json()
            return data.get("response", "")
        else:
            print(f"Ollama error: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Error querying Ollama: {e}")
        return None


def query_ollama_json(prompt: str, model: str = DEFAULT_MODEL) -> Optional[dict]:
    """Query Ollama requesting strict JSON output. Returns None on any failure
    (non-200, timeout, or invalid JSON) so callers can fail safe (no alert)."""
    try:
        response = httpx.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                # See query_ollama: avoids hidden chain-of-thought silently
                # eating the whole num_predict budget and leaving nothing to
                # parse as JSON.
                "think": False,
                "options": {
                    "temperature": 0.3,
                    "num_predict": 500,
                    "num_ctx": 16384
                }
            },
            headers=APP_HEADERS,
            timeout=120.0
        )

        if response.status_code != 200:
            print(f"Ollama error: {response.status_code} - {response.text}")
            return None

        raw = response.json().get("response", "")
        return json.loads(raw)
    except Exception as e:
        print(f"Error querying Ollama for JSON: {e}")
        return None


def build_must_act_prompt(portfolio_data: schemas.PortfolioOverview) -> str:
    """Build a prompt asking the LLM whether there's an urgent, must-do action today."""

    stocks_summary = []
    for stock in portfolio_data.stocks:
        today_part = f", today {stock.return_1d:+.1f}%" if stock.return_1d is not None else ""
        stocks_summary.append(
            f"- {stock.ticker}: {stock.total_quantity} shares, "
            f"avg cost ${stock.average_cost:.2f}, current ${stock.current_price:.2f}, "
            f"gain/loss {stock.gain_loss_pct:+.1f}%{today_part}"
        )

    prompt = f"""You are a disciplined financial risk monitor. You are NOT here to give general advice —
you are here to flag only genuinely urgent, must-act-today situations (e.g. a position craterING today,
extreme single-stock concentration risk, a stop-loss-worthy move, or similarly time-sensitive risk).
An ordinary day with normal fluctuations is NOT must-act. Most days should NOT be must-act.

PORTFOLIO SUMMARY:
- Total Value: ${portfolio_data.total_value:,.2f}
- Overall Gain/Loss: ${portfolio_data.total_gain_loss:,.2f} ({portfolio_data.total_gain_loss_pct:+.1f}%)

HOLDINGS:
{chr(10).join(stocks_summary)}

Respond with ONLY a JSON object, no other text, in this exact shape:
{{"must_act": true or false, "reason": "short explanation", "action": "the specific action to take, or empty string if must_act is false"}}"""

    return prompt


def _strip_stray_markdown(text: str) -> str:
    """These recommendation/must-act strings are joined into single plain-text
    lines (see build_portfolio_prompt/build_must_act_prompt) and never meant to
    carry markdown — but small models don't reliably follow that instruction,
    sometimes emitting an unclosed ** that renders as a literal asterisk in the
    UI instead of bold. Since no formatting is wanted here anyway, just strip
    ** outright rather than trying to detect/repair unmatched pairs."""
    return text.replace('**', '')


def parse_recommendations(response_text: str) -> List[dict]:
    """Parse AI response into structured recommendations."""
    recommendations = []
    lines = response_text.strip().split('\n')
    
    action_keywords = ['TAKE_PROFITS', 'SELL', 'BUY', 'HOLD', 'DIVERSIFY', 'REBALANCE', 'WATCH', 'REDUCE', 'ADD', 'HARVEST_LOSS']
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        for action in action_keywords:
            if f'[{action}]' in line.upper():
                parts = line.split(']', 1)
                if len(parts) == 2:
                    content = parts[1].strip()
                    ticker = None
                    
                    if ':' in content:
                        ticker_part, rec_text = content.split(':', 1)
                        ticker_part = ticker_part.strip().upper()
                        if ticker_part != 'N/A' and len(ticker_part) <= 5 and ticker_part.isalpha():
                            ticker = ticker_part
                        content = rec_text.strip()
                    
                    recommendations.append({
                        "action_type": action,
                        "ticker": ticker,
                        "recommendation": _strip_stray_markdown(content)
                    })
                break
    
    return recommendations


def generate_recommendations(db: Session, model: str = RECOMMENDATIONS_MODEL) -> List[models.Recommendation]:
    """Generate AI recommendations for the portfolio and save to database."""
    
    if not check_ollama_available():
        print("Ollama is not available")
        return []
    
    portfolio_data = portfolio.get_portfolio_with_performance(db)
    
    if not portfolio_data.stocks:
        print("No stocks in portfolio")
        return []
    
    prompt = build_portfolio_prompt(portfolio_data)
    response = query_ollama(prompt, model)
    
    if not response:
        print("No response from Ollama")
        return []
    
    parsed = parse_recommendations(response)
    
    if not parsed:
        db_rec = models.Recommendation(
            recommendation=response,
            ticker=None,
            action_type="ANALYSIS"
        )
        db.add(db_rec)
        db.commit()
        db.refresh(db_rec)
        return [db_rec]
    
    saved_recs = []
    for rec in parsed:
        db_rec = models.Recommendation(
            recommendation=rec["recommendation"],
            ticker=rec["ticker"],
            action_type=rec["action_type"]
        )
        db.add(db_rec)
        saved_recs.append(db_rec)
    
    db.commit()
    for r in saved_recs:
        db.refresh(r)
    
    return saved_recs


def get_quick_analysis(db: Session) -> str:
    """Get a quick portfolio analysis without saving to database."""

    if not check_ollama_available():
        return "Ollama AI is not available. Please ensure Ollama is running locally."

    portfolio_data = portfolio.get_portfolio_with_performance(db)

    if not portfolio_data.stocks:
        return "No stocks in portfolio to analyze."

    prompt = build_portfolio_prompt(portfolio_data)
    response = query_ollama(prompt, RECOMMENDATIONS_MODEL)

    return response or "Unable to generate analysis at this time."


def build_system_message(portfolio_data) -> str:
    """Build a system message with current portfolio context."""
    if not portfolio_data.stocks:
        return (
            "You are a knowledgeable financial advisor assistant. "
            "The user currently has no stocks in their portfolio. "
            "Help them understand investing basics and get started."
        )

    stocks_info = "\n".join(_format_stock_block(s) for s in portfolio_data.stocks)

    return f"""You are a knowledgeable financial advisor assistant helping the user manage their stock portfolio. Be concise, clear, and actionable.

Current Portfolio (as of {datetime.now().strftime('%B %d, %Y')}):
- Total Value: ${portfolio_data.total_value:,.2f}
- Total Cost Basis: ${portfolio_data.total_cost_basis:,.2f}
- Overall P&L: ${portfolio_data.total_gain_loss:,.2f} ({portfolio_data.total_gain_loss_pct:+.1f}%)

Holdings (per-ticker performance across periods, and every individual lot):
{stocks_info}

Use this data to answer questions. Provide specific, grounded advice."""


def _call_ollama_chat(messages: List[dict], model: str, session_id: str = None, log_label: str = "") -> Optional[str]:
    """Single non-streaming call to Ollama's /api/chat, with debug logging.
    Shared by the direct chat path and the chunked-chat path (one call per
    chunk, plus the final consolidation call)."""
    tag = f" ({log_label})" if log_label else ""
    t0 = time.time()
    error_msg = None
    response_text = None
    try:
        response = httpx.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model": model,
                "messages": messages,
                "stream": False,
                # See query_ollama: avoids hidden chain-of-thought silently
                # eating the whole num_predict budget and returning empty
                # content — confirmed on this exact call site (2x latency,
                # ~3k chars of hidden "thinking" when unset).
                "think": False,
                "options": {
                    "temperature": 0.7,
                    # Left unset, Ollama falls back to a small per-model
                    # default (often 128) and the response gets cut off
                    # mid-sentence with done_reason "length" — this was
                    # happening on ordinary chat replies, not just long ones.
                    "num_predict": 2048,
                    # Matches RECOMMENDATIONS_MODEL's context size (see
                    # query_ollama): build_system_message uses the same
                    # per-stock formatting as build_portfolio_prompt, so a
                    # large portfolio can approach 16k tokens before the
                    # model generates a single reply token.
                    "num_ctx": 32768,
                }
            },
            headers=APP_HEADERS,
            timeout=120.0
        )
        if response.status_code == 200:
            data = response.json()
            response_text = data.get("message", {}).get("content", "")
            if data.get("done_reason") == "length":
                print(f"Ollama chat warning{tag}: response truncated (done_reason=length)")
        else:
            error_msg = f"HTTP {response.status_code}: {response.text}"
            print(f"Ollama chat error{tag}: {error_msg}")
    except Exception as e:
        error_msg = str(e)
        print(f"Error in Ollama chat call{tag}: {e}")

    latency_ms = int((time.time() - t0) * 1000)
    try:
        system_content = messages[0]["content"] if messages and messages[0]["role"] == "system" else ""
        llm_debug.append_call(
            session_id=f"{session_id or ''}{':' + log_label if log_label else ''}",
            model=model,
            system_prompt=system_content,
            messages_sent=messages,
            response=response_text or "",
            latency_ms=latency_ms,
            error=error_msg,
        )
    except Exception as e:
        print(f"Debug log error: {e}")

    return response_text


def _build_chunk_system_message(chunk_stocks: List, chunk_idx: int, total_chunks: int) -> str:
    """System message for one chunk of a large portfolio's holdings — scoped
    so the model doesn't assume it's seeing the whole portfolio."""
    stocks_info = "\n".join(_format_stock_block(s) for s in chunk_stocks)
    return f"""You are a knowledgeable financial advisor assistant helping the user manage their stock portfolio. Be concise, clear, and actionable.

The portfolio is large, so it has been split into parts to analyze separately. You are looking at
PART {chunk_idx} of {total_chunks} — do not comment on overall portfolio totals, diversification, or
sector balance, since you can't see the rest of the holdings. Just analyze this part of the holdings
in light of the user's question.

Holdings in this part (per-ticker performance across periods, and every individual lot):
{stocks_info}

Use this data to answer the user's question as it relates to these specific holdings."""


def _build_consolidation_system_message(portfolio_data, chunk_responses: List[str]) -> str:
    """System message for the final call: ties together the partial,
    per-chunk analyses into one coherent answer with full portfolio totals
    back in view."""
    partials = "\n\n".join(
        f"--- Partial analysis {i + 1} of {len(chunk_responses)} ---\n{r}"
        for i, r in enumerate(chunk_responses)
    )
    return f"""You are a knowledgeable financial advisor assistant helping the user manage their stock portfolio. Be concise, clear, and actionable.

Current Portfolio (as of {datetime.now().strftime('%B %d, %Y')}):
- Total Value: ${portfolio_data.total_value:,.2f}
- Total Cost Basis: ${portfolio_data.total_cost_basis:,.2f}
- Overall P&L: ${portfolio_data.total_gain_loss:,.2f} ({portfolio_data.total_gain_loss_pct:+.1f}%)

The portfolio was too large to analyze in one pass, so it was split into {len(chunk_responses)} parts
and analyzed separately. Here are those partial analyses:

{partials}

Consolidate these partial analyses into a single, clear, non-repetitive answer to the user's question.
Resolve any overlaps, prioritize the most important points, and reference specific tickers/lots where
relevant. You may also use the overall totals above (e.g. for diversification/allocation questions the
individual parts couldn't answer on their own)."""


def _chat_with_portfolio_chunked(
    message: str,
    history: List[dict],
    portfolio_data,
    model: str,
    session_id: str = None,
) -> Optional[str]:
    """Feature-flagged (CHUNKED_CHAT_ENABLED) alternative to the single-call
    chat path for large portfolios: splits holdings into CHAT_CHUNK_SIZE-sized
    groups, asks the model about each chunk independently (small prompt, safe
    from length-related failures/truncation), then makes one final call that
    consolidates all the partial answers — that final call is the only one
    that sees the full conversation history."""
    stocks = portfolio_data.stocks
    chunks = [stocks[i:i + CHAT_CHUNK_SIZE] for i in range(0, len(stocks), CHAT_CHUNK_SIZE)]
    total = len(chunks)

    chunk_responses = []
    for idx, chunk in enumerate(chunks, start=1):
        system_content = _build_chunk_system_message(chunk, idx, total)
        messages = [{"role": "system", "content": system_content}, {"role": "user", "content": message}]
        resp = _call_ollama_chat(messages, model, session_id, log_label=f"chunk{idx}/{total}")
        if resp:
            chunk_responses.append(resp)

    if not chunk_responses:
        return None

    system_content = _build_consolidation_system_message(portfolio_data, chunk_responses)
    messages = [{"role": "system", "content": system_content}]
    messages.extend(history)
    messages.append({"role": "user", "content": message})
    return _call_ollama_chat(messages, model, session_id, log_label="consolidation")


def chat_with_portfolio(
    message: str,
    history: List[dict],
    db: Session,
    model: str = DEFAULT_MODEL,
    session_id: str = None,
) -> Optional[str]:
    """Multi-turn chat with full portfolio context and conversation history.
    For large portfolios (see CHUNKED_CHAT_ENABLED), delegates to the chunked
    path instead of sending one oversized prompt."""
    portfolio_data = portfolio.get_portfolio_with_performance(db)

    if CHUNKED_CHAT_ENABLED and len(portfolio_data.stocks) > CHAT_CHUNK_SIZE:
        return _chat_with_portfolio_chunked(message, history, portfolio_data, model, session_id)

    system_content = build_system_message(portfolio_data)
    messages = [{"role": "system", "content": system_content}]
    messages.extend(history)
    messages.append({"role": "user", "content": message})
    return _call_ollama_chat(messages, model, session_id)
