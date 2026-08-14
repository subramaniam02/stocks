// Parser for the backend's "[ACTION] TICKER: text | [ACTION] TICKER: text" mini-syntax
// (see backend/services/ai_advisor.py build_portfolio_prompt/parse_recommendations and
// alert_checker._build_review_content) — plain text, not markdown, so ReactMarkdown alone
// can't style it; callers use this to split it into renderable segments first.
const SEGMENT_PATTERN = /^\[([A-Z_]+)\]\s*(.+)$/;

export function parseActionText(text) {
  if (!text) return { preamble: '', segments: [] };
  const bracketIndex = text.indexOf('[');
  if (bracketIndex === -1) return { preamble: text, segments: [] };

  const preamble = text.slice(0, bracketIndex).trim();
  const rawSegments = text.slice(bracketIndex).split(' | ');

  const segments = rawSegments.map((raw) => {
    const match = raw.match(SEGMENT_PATTERN);
    if (!match) return { actionType: null, ticker: null, text: raw.trim() };

    const [, actionType, content] = match;
    const colonIndex = content.indexOf(':');
    if (colonIndex === -1) return { actionType, ticker: null, text: content.trim() };

    const tickerPart = content.slice(0, colonIndex).trim();
    const ticker = tickerPart && tickerPart !== 'N/A' && tickerPart !== 'Portfolio' ? tickerPart : null;
    return { actionType, ticker, text: content.slice(colonIndex + 1).trim() };
  });

  // Nothing actually matched the [ACTION] syntax (e.g. a markdown link like
  // "[some text](url)") — not this format, let the caller fall back to markdown.
  if (!segments.some((s) => s.actionType)) return { preamble: text, segments: [] };

  return { preamble, segments };
}
