import numpy as np
import pandas as pd
import pytest

from momo_scanner.scoring import (
    momentum_score,
    rate_of_change,
    rsi,
    trend_aligned,
    volume_surge,
)


def make_df(closes, volumes=None):
    n = len(closes)
    if volumes is None:
        volumes = [1_000_000] * n
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    return pd.DataFrame(
        {
            "open": closes,
            "high": closes,
            "low": closes,
            "close": closes,
            "volume": volumes,
        },
        index=idx,
    )


def test_rate_of_change_uptrend():
    closes = np.linspace(100, 120, 21)  # +20% over 20 bars
    df = make_df(closes)
    roc = rate_of_change(df["close"], lookback=20)
    assert roc == pytest.approx(20.0, abs=0.01)


def test_rate_of_change_insufficient_history():
    df = make_df([100, 101, 102])
    with pytest.raises(ValueError):
        rate_of_change(df["close"], lookback=20)


def test_rsi_all_gains_is_100():
    closes = list(np.linspace(100, 150, 30))
    df = make_df(closes)
    val = rsi(df["close"], period=14)
    assert val == pytest.approx(100.0, abs=0.01)


def test_rsi_all_losses_is_0():
    closes = list(np.linspace(150, 100, 30))
    df = make_df(closes)
    val = rsi(df["close"], period=14)
    assert val == pytest.approx(0.0, abs=0.01)


def test_volume_surge_detects_spike():
    volumes = [1_000_000] * 20 + [5_000_000]
    closes = [100] * 21
    df = make_df(closes, volumes)
    mult = volume_surge(df["volume"], avg_period=20)
    assert mult == pytest.approx(5.0, abs=0.01)


def test_trend_aligned_true_for_clean_uptrend():
    closes = np.linspace(50, 150, 220)
    df = make_df(closes)
    result = trend_aligned(df["close"], fast=50, slow=200)
    assert result is True
    assert isinstance(result, bool)


def test_trend_aligned_false_for_downtrend():
    closes = np.linspace(150, 50, 220)
    df = make_df(closes)
    result = trend_aligned(df["close"], fast=50, slow=200)
    assert result is False
    assert isinstance(result, bool)


def test_momentum_score_strong_setup_scores_high():
    # Gentle base uptrend (keeps 50/200 SMA structure bullish) followed by
    # a sharp breakout in the last 20 bars with a volume spike on the last day.
    base = np.linspace(80, 110, 200)
    breakout = np.linspace(110, 150, 20)
    closes = np.concatenate([base, breakout])
    volumes = [1_000_000] * (len(closes) - 1) + [4_000_000]
    df = make_df(closes, volumes)
    result = momentum_score(df)
    assert result["score"] > 60
    assert result["trend_aligned"] == True  # noqa: E712 (may be np.bool_)


def test_momentum_score_weak_setup_scores_low():
    n = 220
    closes = np.linspace(150, 80, n)
    df = make_df(closes)
    result = momentum_score(df)
    assert result["score"] < 40
    assert result["trend_aligned"] is False


def test_momentum_score_raises_on_short_history():
    df = make_df([100, 101, 102])
    with pytest.raises(ValueError):
        momentum_score(df)
