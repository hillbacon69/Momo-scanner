"""Command-line entry point for the momentum scanner.

Not investment advice. This ranks tickers by a technical momentum
heuristic (price rate-of-change, RSI, volume surge, trend structure) —
it says nothing about valuation, news, earnings, or risk, and past
momentum does not predict future returns.
"""
from __future__ import annotations

import argparse
import sys

from .data import fetch_history
from .scoring import momentum_score

DEFAULT_TICKERS = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA",
    "AMD", "NFLX", "AVGO", "CRM", "ADBE", "COST", "PEP", "LIN",
]


def parse_args(argv=None):
    p = argparse.ArgumentParser(
        prog="momo-scanner",
        description="Rank tickers by a technical momentum score. Not investment advice.",
    )
    p.add_argument(
        "--tickers",
        help="Comma-separated tickers, or a path to a file with one ticker per line. "
        "Defaults to a small built-in watchlist.",
    )
    p.add_argument("--top", type=int, default=10, help="Number of results to show (default: 10)")
    p.add_argument("--period", default="1y", help="History window for yfinance (default: 1y)")
    p.add_argument("--roc-lookback", type=int, default=20, help="Rate-of-change lookback in bars (default: 20)")
    return p.parse_args(argv)


def load_tickers(spec: str | None) -> list[str]:
    if not spec:
        return DEFAULT_TICKERS
    try:
        with open(spec) as f:
            return [line.strip().upper() for line in f if line.strip()]
    except OSError:
        return [t.strip().upper() for t in spec.split(",") if t.strip()]


def main(argv=None) -> int:
    args = parse_args(argv)
    tickers = load_tickers(args.tickers)

    results = []
    for ticker in tickers:
        try:
            df = fetch_history(ticker, period=args.period)
            metrics = momentum_score(df, roc_lookback=args.roc_lookback)
        except Exception as exc:  # noqa: BLE001 - report and continue scanning
            print(f"skip {ticker}: {exc}", file=sys.stderr)
            continue
        results.append({"ticker": ticker, **metrics})

    results.sort(key=lambda r: r["score"], reverse=True)

    if not results:
        print("No results — check network access and ticker list.", file=sys.stderr)
        return 1

    header = f"{'TICKER':<8}{'SCORE':>8}{'ROC%':>8}{'RSI':>8}{'VOLx':>8}{'TREND':>8}"
    print(header)
    print("-" * len(header))
    for r in results[: args.top]:
        print(
            f"{r['ticker']:<8}{r['score']:>8.1f}{r['roc_pct']:>8.1f}"
            f"{r['rsi']:>8.1f}{r['volume_mult']:>8.2f}{str(r['trend_aligned']):>8}"
        )

    print("\nNot investment advice — a ranked technical heuristic only.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
