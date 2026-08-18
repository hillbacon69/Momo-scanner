# Momo-scanner

A small CLI that ranks stock tickers by a technical **momentum score**:
price rate-of-change, RSI, volume surge, and moving-average trend
structure. It does not predict returns, read news or fundamentals, or
make buy/sell recommendations — it's a screener, not an advisor.

**Not investment advice.** Momentum can reverse without warning; always
do your own research and consider your own risk tolerance before
trading.

## Install

```bash
pip install -r requirements.txt
```

## Usage

```bash
# Scan the built-in watchlist
python -m momo_scanner.cli

# Scan your own tickers
python -m momo_scanner.cli --tickers AAPL,NVDA,SMCI,PLTR --top 5

# Or from a file, one ticker per line
python -m momo_scanner.cli --tickers my_watchlist.txt
```

Sample output:

```
TICKER     SCORE    ROC%     RSI    VOLx   TREND
--------------------------------------------------
NVDA        78.4     24.1    68.2    2.10    True
AVGO        71.2     18.5    64.0    1.40    True
...

Not investment advice — a ranked technical heuristic only.
```

## How the score is built

For each ticker, over its recent price/volume history:

- **Rate of change (35%)** — % price change over the lookback window
  (default 20 trading days).
- **RSI (25%)** — 14-period relative strength; rewards strength but
  discounts readings above 80 as blow-off/overbought risk.
- **Volume surge (20%)** — latest volume vs. its trailing 20-day
  average; a proxy for institutional interest.
- **Trend structure (20%)** — binary check that price > 50-day SMA >
  200-day SMA (classic technical uptrend).

These combine into a 0–100 composite `score`. See
`momo_scanner/scoring.py` for the exact formulas.

## Data source

`momo_scanner/data.py` fetches history via `yfinance` (Yahoo Finance).
This requires normal outbound internet access — it will not work in a
network-restricted sandbox. The scoring logic itself
(`momo_scanner/scoring.py`) has no network dependency and is covered by
unit tests in `tests/`.

## Tests

```bash
pytest
```
