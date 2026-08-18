"""Price history fetching. Isolated from scoring.py so scoring can be
unit-tested without any network access."""
from __future__ import annotations

import pandas as pd


def fetch_history(ticker: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
    """Fetch OHLCV history for `ticker` and normalize to lowercase columns.

    Requires the `yfinance` package and outbound network access to Yahoo
    Finance, neither of which is available in this sandbox — run the CLI
    on a machine with normal internet access.
    """
    import yfinance as yf

    raw = yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=True)
    if raw.empty:
        raise ValueError(f"no data returned for {ticker!r}")
    raw = raw.rename(columns=str.lower)
    return raw[["open", "high", "low", "close", "volume"]]
