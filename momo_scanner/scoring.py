"""Momentum scoring logic for a single ticker's price/volume history.

All functions take a pandas DataFrame with columns:
    ['open', 'high', 'low', 'close', 'volume']
indexed by date, ascending (oldest first).
"""
from __future__ import annotations

import pandas as pd


def rate_of_change(close: pd.Series, lookback: int) -> float:
    """Percent change of the last close vs. `lookback` bars ago."""
    if len(close) <= lookback:
        raise ValueError(f"need > {lookback} bars, got {len(close)}")
    start = close.iloc[-lookback - 1]
    end = close.iloc[-1]
    if start == 0:
        raise ValueError("zero starting price")
    return (end - start) / start * 100.0


def rsi(close: pd.Series, period: int = 14) -> float:
    """Wilder's RSI, latest value."""
    if len(close) <= period:
        raise ValueError(f"need > {period} bars, got {len(close)}")
    delta = close.diff().dropna()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    last_gain = avg_gain.iloc[-1]
    last_loss = avg_loss.iloc[-1]
    if last_loss == 0:
        return 100.0
    rs = last_gain / last_loss
    return 100.0 - (100.0 / (1.0 + rs))


def volume_surge(volume: pd.Series, avg_period: int = 20) -> float:
    """Latest volume as a multiple of its trailing average (excluding today)."""
    if len(volume) <= avg_period:
        raise ValueError(f"need > {avg_period} bars, got {len(volume)}")
    baseline = volume.iloc[-avg_period - 1:-1].mean()
    if baseline == 0:
        raise ValueError("zero baseline volume")
    return volume.iloc[-1] / baseline


def trend_aligned(close: pd.Series, fast: int = 50, slow: int = 200) -> bool:
    """True if price > fast SMA > slow SMA (classic uptrend structure)."""
    if len(close) < slow:
        raise ValueError(f"need >= {slow} bars, got {len(close)}")
    fast_sma = close.rolling(fast).mean().iloc[-1]
    slow_sma = close.rolling(slow).mean().iloc[-1]
    price = close.iloc[-1]
    return bool(price > fast_sma > slow_sma)


def momentum_score(
    df: pd.DataFrame,
    roc_lookback: int = 20,
    rsi_period: int = 14,
    vol_avg_period: int = 20,
    trend_fast: int = 50,
    trend_slow: int = 200,
) -> dict:
    """Composite momentum score for one ticker's history.

    Returns a dict of the component metrics plus a 0-100 `score`.
    Raises ValueError if there isn't enough history for the requested windows.
    """
    close = df["close"]
    volume = df["volume"]

    roc = rate_of_change(close, roc_lookback)
    rsi_val = rsi(close, rsi_period)
    vol_mult = volume_surge(volume, vol_avg_period)
    trend_ok = trend_aligned(close, trend_fast, trend_slow)

    # Each component contributes 0-100, then weighted-averaged.
    # ROC: map roughly -20%..+40% onto 0..100.
    roc_component = max(0.0, min(100.0, (roc + 20.0) / 60.0 * 100.0))
    # RSI: reward strength but penalize extreme overbought (>80) as blow-off risk.
    if rsi_val <= 80:
        rsi_component = max(0.0, min(100.0, (rsi_val - 30) / 50 * 100.0))
    else:
        rsi_component = max(0.0, 100.0 - (rsi_val - 80) * 5)
    # Volume: 1x avg -> 0, 3x+ avg -> 100.
    vol_component = max(0.0, min(100.0, (vol_mult - 1.0) / 2.0 * 100.0))
    trend_component = 100.0 if trend_ok else 0.0

    score = (
        0.35 * roc_component
        + 0.25 * rsi_component
        + 0.20 * vol_component
        + 0.20 * trend_component
    )

    return {
        "roc_pct": round(roc, 2),
        "rsi": round(rsi_val, 2),
        "volume_mult": round(vol_mult, 2),
        "trend_aligned": trend_ok,
        "score": round(score, 2),
    }
