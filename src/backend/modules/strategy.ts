/**
 * Deterministic Strategy Brain & Regime Detection Engine (V2 - 2026).
 * Implements 100% deterministic, zero-LLM decision logic across 12 market regimes, 8 core strategies,
 * multi-horizon risk budget mapping, cluster-based signal correlation deduplication, and a Meta-Ensemble synthesizer.
 * Enforces NO_TRADE as a primary and preferred valid output state when net edge after costs is insufficient.
 */

import { MarketRegime } from '../../shared/types';
import { FeatureVector } from '../types/features';
import { MLHorizon } from '../types/ml';
import { LightMLEngine } from './ml';
import {
  StrategySignal,
  SignalDirection,
  TimeHorizon,
  HorizonConfig,
  RegimeAnalysis,
  MetaEnsembleSignal,
  StrategyEngineConfig,
  BacktestTickInput
} from '../types/strategy';

export const HORIZON_CONFIGS: Record<TimeHorizon, HorizonConfig> = {
  scalp: {
    horizon: 'scalp',
    minHoldingPeriodSec: 60,
    maxHoldingPeriodSec: 300,
    typicalStopLossPercent: 1.5,
    typicalTakeProfitPercent: 3.5,
    expectedSlippageBps: 20,
    riskBudgetMultiplier: 0.5
  },
  short: {
    horizon: 'short',
    minHoldingPeriodSec: 300,
    maxHoldingPeriodSec: 1200,
    typicalStopLossPercent: 3.0,
    typicalTakeProfitPercent: 7.0,
    expectedSlippageBps: 30,
    riskBudgetMultiplier: 0.75
  },
  intraday: {
    horizon: 'intraday',
    minHoldingPeriodSec: 1200,
    maxHoldingPeriodSec: 7200,
    typicalStopLossPercent: 5.5,
    typicalTakeProfitPercent: 14.0,
    expectedSlippageBps: 40,
    riskBudgetMultiplier: 1.0
  },
  swing: {
    horizon: 'swing',
    minHoldingPeriodSec: 7200,
    maxHoldingPeriodSec: 86400,
    typicalStopLossPercent: 8.5,
    typicalTakeProfitPercent: 26.0,
    expectedSlippageBps: 55,
    riskBudgetMultiplier: 1.25
  }
};

// Strategy Correlation Clusters to prevent double-counting beta & momentum
export type StrategyCluster = 'TREND' | 'FLOW' | 'EARLY' | 'REVERSION';

export const STRATEGY_CLUSTER_MAP: Record<string, StrategyCluster> = {
  Momentum: 'TREND',
  Breakout: 'TREND',
  'Market Relative Strength': 'TREND',
  'Volume Expansion': 'FLOW',
  'Liquidity Event': 'FLOW',
  'Smart Money Flow': 'FLOW',
  'New Pool / Early Momentum': 'EARLY',
  'Mean Reversion': 'REVERSION'
};

// ==========================================
// 1. DETERMINISTIC REGIME DETECTION ENGINE
// ==========================================

export class DeterministicRegimeEngine {
  /**
   * Deterministically classifies market regime without LLM using:
   * - Trend structure: EMA 9/21/50 alignment, distances, and ADX directional strength
   * - Realized volatility: Annualized sample standard deviation & ATR range expansion
   * - Breadth: Meme momentum/liquidity breadth & global market breadth score
   * - Liquidity: Depth, USD pool size, reserve imbalance, price impact, LP net flow
   * - Volume: Volume relative to 20-period average, volume Z-score, volume acceleration
   * - Buy/Sell flow: Buy/sell volume ratio, synthetic order book imbalance, whale flow
   * - Context BTC/ETH: 24h returns, macro volatility, beta, correlation
   * - Drawdown: Local peak-to-trough drawdown & recovery strength
   */
  public classifyRegime(features: FeatureVector): RegimeAnalysis {
    const now = Date.now();
    const drivers: string[] = [];

    // 1. DATA STRESS: High missingness, degraded confidence, or stale feeds
    const isDataStress =
      features.missingnessRatio > 0.30 ||
      features.confidence < 0.50 ||
      features.freshness < 0.50;

    if (isDataStress) {
      drivers.push(
        `Data Missingness ${(features.missingnessRatio * 100).toFixed(1)}% | Feed Confidence ${(features.confidence * 100).toFixed(1)}% | Freshness ${(features.freshness * 100).toFixed(1)}%`
      );
      return {
        primaryRegime: 'DATA_STRESS',
        confidence: 0.95,
        regimeRationale: 'Critical data deficiency: feature history missing or provider feeds stale. Entries blocked.',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // 2. LIQUIDITY STRESS: Depleted pool, severe reserve imbalance, or prohibitive price impact
    const isLiquidityStress =
      features.liquidity.liquidityUsd < 10000 ||
      features.liquidity.reserveImbalance > 0.35 ||
      features.liquidity.priceImpact1kUsd > 10.0;

    if (isLiquidityStress) {
      drivers.push(
        `Liquidity Pool $${features.liquidity.liquidityUsd.toFixed(0)} | Reserve Imbalance ${(features.liquidity.reserveImbalance * 100).toFixed(1)}% | 1k Impact ${features.liquidity.priceImpact1kUsd.toFixed(1)}%`
      );
      return {
        primaryRegime: 'LIQUIDITY_STRESS',
        confidence: 0.92,
        regimeRationale: 'Insufficient on-chain liquidity depth or extreme reserve skew threatening severe slippage.',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // 3. MEME PANIC: High token failure rate, aggressive liquidity withdrawal, or negative flow
    const isMemePanic =
      (features.meme.memeFailureRatePercent > 35 && features.flow.netFlowUsd < -10000) ||
      (features.meme.memeLiquidityBreadth < 25 && features.meme.memeMomentumBreadth < 30);

    if (isMemePanic) {
      drivers.push(
        `Meme Failure Rate ${features.meme.memeFailureRatePercent.toFixed(1)}% | Net Flow $${features.flow.netFlowUsd.toFixed(0)} | Liquidity Breadth ${features.meme.memeLiquidityBreadth.toFixed(1)}`
      );
      return {
        primaryRegime: 'MEME_PANIC',
        secondaryRegime: 'PANIC',
        confidence: 0.88,
        regimeRationale: 'Sector-wide meme collapse: high rug/abandonment rate and systemic pool liquidity drainage.',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // 4. MEME EUPHORIA: High retail rotation, momentum breadth expansion, strong buy ratio
    const isMemeEuphoria =
      features.meme.memeMomentumBreadth > 70 &&
      features.volume.buySellRatio > 1.8 &&
      features.volume.volumeZScore > 1.4 &&
      features.flow.netFlowUsd > 15000;

    if (isMemeEuphoria) {
      drivers.push(
        `Meme Momentum Breadth ${features.meme.memeMomentumBreadth.toFixed(1)} | Buy/Sell Ratio ${features.volume.buySellRatio.toFixed(2)} | Volume Z-Score ${features.volume.volumeZScore.toFixed(2)}`
      );
      return {
        primaryRegime: 'MEME_EUPHORIA',
        secondaryRegime: 'EUPHORIA',
        confidence: 0.86,
        regimeRationale: 'Retail viral frenzy: rampant positive net inflows, retail buy dominance, and rapid momentum breadth.',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // 5. PANIC: Broad macro cascade or severe token drawdown
    const isGlobalPanic =
      features.macro.btcReturn24h < -5.0 ||
      features.macro.ethReturn24h < -6.0 ||
      features.price.localDrawdown < -0.22;

    if (isGlobalPanic) {
      drivers.push(
        `BTC 24h Return ${features.macro.btcReturn24h.toFixed(2)}% | ETH 24h Return ${features.macro.ethReturn24h.toFixed(2)}% | Local Drawdown ${(features.price.localDrawdown * 100).toFixed(1)}%`
      );
      return {
        primaryRegime: 'PANIC',
        secondaryRegime: features.technical.realizedVolatility > 0.60 ? 'HIGH_VOL' : undefined,
        confidence: 0.88,
        regimeRationale: 'Systemic macro selloff or acute local capitulation event in progress.',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // 6. EUPHORIA: Broad macro rally with high token participation and buying volume
    const isGlobalEuphoria =
      features.macro.btcReturn24h > 4.0 &&
      features.price.returnSimple > 0.12 &&
      features.volume.buySellRatio > 1.6;

    if (isGlobalEuphoria) {
      drivers.push(
        `BTC 24h +${features.macro.btcReturn24h.toFixed(2)}% | Token Return +${(features.price.returnSimple * 100).toFixed(1)}% | Buy/Sell Ratio ${features.volume.buySellRatio.toFixed(2)}`
      );
      return {
        primaryRegime: 'EUPHORIA',
        secondaryRegime: 'TREND_UP',
        confidence: 0.84,
        regimeRationale: 'Macro risk-on expansion with high buy flow and aggressive price appreciation.',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // 7. TREND_UP: Bullish moving average alignment (EMA9 > EMA21 > EMA50) with expanding trend strength
    const isTrendUp =
      features.price.emaDistance9 > 0.008 &&
      features.price.emaDistance21 > 0.015 &&
      features.price.emaDistance50 >= -0.005 &&
      features.technical.adx14 > 22 &&
      features.price.returnSimple > 0;

    if (isTrendUp) {
      drivers.push(
        `EMA9/21/50 Bullish Alignment | EMA9 Dist +${(features.price.emaDistance9 * 100).toFixed(2)}% | ADX ${features.technical.adx14.toFixed(1)}`
      );
      return {
        primaryRegime: 'TREND_UP',
        secondaryRegime: features.technical.realizedVolatility > 0.50 ? 'HIGH_VOL' : undefined,
        confidence: 0.87,
        regimeRationale: 'Constructive multi-timeframe trend structure with positive moving average slope and healthy directional strength.',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // 8. TREND_DOWN: Bearish moving average alignment (EMA9 < EMA21 < EMA50) with declining momentum
    const isTrendDown =
      features.price.emaDistance9 < -0.008 &&
      features.price.emaDistance21 < -0.015 &&
      features.technical.adx14 > 22;

    if (isTrendDown) {
      drivers.push(
        `EMA9/21/50 Bearish Breakdown | EMA9 Dist ${(features.price.emaDistance9 * 100).toFixed(2)}% | ADX ${features.technical.adx14.toFixed(1)}`
      );
      return {
        primaryRegime: 'TREND_DOWN',
        secondaryRegime: features.price.localDrawdown < -0.15 ? 'PANIC' : undefined,
        confidence: 0.86,
        regimeRationale: 'Persistent downward price discovery with seller dominance across fast and medium moving averages.',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // 9. HIGH_VOL: Realized volatility > 0.65 or ATR range expansion > 2.0
    const isHighVol =
      features.technical.realizedVolatility > 0.65 ||
      features.technical.rangeExpansion > 2.0 ||
      features.macro.btcVolatility24h > 0.05;

    if (isHighVol) {
      drivers.push(
        `Realized Vol ${(features.technical.realizedVolatility * 100).toFixed(1)}% | Range Expansion ${features.technical.rangeExpansion.toFixed(2)}x`
      );
      return {
        primaryRegime: 'HIGH_VOL',
        confidence: 0.82,
        regimeRationale: 'Elevated price variance, wide bid-ask swings, and heightened intra-bar volatility.',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // 10. LOW_VOL: Compressed volatility (< 0.20) and range contraction (< 0.90)
    const isLowVol =
      features.technical.realizedVolatility < 0.20 &&
      features.technical.rangeExpansion < 0.90;

    if (isLowVol) {
      drivers.push(
        `Realized Vol ${(features.technical.realizedVolatility * 100).toFixed(1)}% | Range Contraction ${features.technical.rangeExpansion.toFixed(2)}x`
      );
      return {
        primaryRegime: 'LOW_VOL',
        secondaryRegime: 'RANGE',
        confidence: 0.81,
        regimeRationale: 'Volatility compression and tight trading ranges preceding potential volatility breakout.',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // 11. RANGE: Low ADX (< 20) with price oscilating near EMA21
    const isRange =
      features.technical.adx14 < 20 &&
      Math.abs(features.price.emaDistance21) < 0.025;

    if (isRange) {
      drivers.push(
        `ADX ${features.technical.adx14.toFixed(1)} < 20 | Distance from EMA21 ${(features.price.emaDistance21 * 100).toFixed(2)}%`
      );
      return {
        primaryRegime: 'RANGE',
        confidence: 0.78,
        regimeRationale: 'Mean-reverting non-directional regime bounded by horizontal support and resistance levels.',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // 12. UNKNOWN: Default when signals are conflicting or non-conclusive
    return {
      primaryRegime: 'UNKNOWN',
      confidence: 0.50,
      regimeRationale: 'Indeterminate market conditions: conflicting technical indicators without a dominant directional bias.',
      keyDrivers: ['Mixed technical signals', 'Low regime clarity'],
      calculatedTimestamp: now
    };
  }
}

// ==========================================
// 2. DETERMINISTIC STRATEGY ENSEMBLE (8 STRATEGIES)
// ==========================================

export class StrategyEngine {
  // 1. Momentum Strategy
  public evalMomentum(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const rsiScore = fv.technical.rsi14 > 50 ? (fv.technical.rsi14 - 50) * 1.6 : 0;
    const velScore = fv.price.velocity > 0 ? Math.min(25, fv.price.velocity * 600) : 0;
    const volScore = fv.volume.volumeZScore > 0 ? Math.min(25, fv.volume.volumeZScore * 12) : 0;
    const emaScore = fv.price.emaDistance9 > 0 ? Math.min(20, fv.price.emaDistance9 * 500) : 0;

    const rawScore = rsiScore + velScore + volScore + emaScore;
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    const direction: SignalDirection = score >= 58 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'short';
    const horizonCfg = HORIZON_CONFIGS[horizon];

    const invalidation = currPrice * (1 - horizonCfg.typicalStopLossPercent / 100);
    const minTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 0.85);
    const maxTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 1.25);

    return {
      strategyName: 'Momentum',
      direction,
      score,
      confidence: Math.min(0.95, 0.45 + score / 200),
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.997, maxPrice: currPrice * 1.003 },
      invalidation,
      targetZone: { minPrice: minTarget, maxPrice: maxTarget },
      stopLogic: `Trailing stop loss below EMA9; invalidation at $${invalidation.toFixed(6)}`,
      structuredRationale: `RSI-14 at ${fv.technical.rsi14.toFixed(1)}, velocity ${(fv.price.velocity * 100).toFixed(2)}%, Volume Z-score ${fv.volume.volumeZScore.toFixed(2)}`,
      requiredFeatures: ['rsi14', 'velocity', 'volumeZScore', 'emaDistance9'],
      generatedTimestamp: now
    };
  }

  // 2. Breakout Strategy
  public evalBreakout(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const isBreakout = fv.price.breakoutDistance20 > 0 && fv.volume.volumeZScore > 1.2;
    const rawScore = isBreakout
      ? 55 + Math.min(30, fv.price.breakoutDistance20 * 600) + Math.min(15, fv.volume.volumeZScore * 8)
      : 15;
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    const direction: SignalDirection = score >= 62 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'intraday';
    const horizonCfg = HORIZON_CONFIGS[horizon];

    const invalidation = currPrice * (1 - horizonCfg.typicalStopLossPercent / 100);
    const minTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 0.85);
    const maxTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 1.30);

    return {
      strategyName: 'Breakout',
      direction,
      score,
      confidence: isBreakout ? 0.84 : 0.25,
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.995, maxPrice: currPrice * 1.006 },
      invalidation,
      targetZone: { minPrice: minTarget, maxPrice: maxTarget },
      stopLogic: `Invalidate if price retraces back into 20-bar prior range ($${invalidation.toFixed(6)})`,
      structuredRationale: `Breakout distance ${(fv.price.breakoutDistance20 * 100).toFixed(2)}% with volume expansion ${fv.volume.volumeZScore.toFixed(2)}σ`,
      requiredFeatures: ['breakoutDistance20', 'volumeZScore', 'atr14'],
      generatedTimestamp: now
    };
  }

  // 3. New Pool / Early Momentum Strategy
  public evalNewPoolEarlyMomentum(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const isEarly =
      (fv.meme.newPoolVelocity > 0.5 || fv.meme.newPoolCount24h > 40) &&
      (fv.smartMoney.earlyEntryClusterDetected || fv.flow.whaleBuyCount >= 2);

    const rawScore = isEarly
      ? 58 +
        (fv.volume.buySellRatio > 1.5 ? 18 : 0) +
        Math.min(15, fv.flow.whaleBuyCount * 4) +
        (fv.volume.volumeAcceleration > 0 ? 9 : 0)
      : 15;
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    const direction: SignalDirection = score >= 62 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'scalp';
    const horizonCfg = HORIZON_CONFIGS[horizon];

    const invalidation = currPrice * (1 - horizonCfg.typicalStopLossPercent / 100);
    const minTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 0.85);
    const maxTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 1.40);

    return {
      strategyName: 'New Pool / Early Momentum',
      direction,
      score,
      confidence: isEarly ? 0.82 : 0.20,
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.99, maxPrice: currPrice * 1.01 },
      invalidation,
      targetZone: { minPrice: minTarget, maxPrice: maxTarget },
      stopLogic: `Tight scalp invalidation at $${invalidation.toFixed(6)} or immediate momentum stall`,
      structuredRationale: `Early pool momentum with Buy/Sell ratio ${(fv.volume.buySellRatio || 1.0).toFixed(2)}, whale buy count ${fv.flow.whaleBuyCount}`,
      requiredFeatures: ['newPoolVelocity', 'earlyEntryClusterDetected', 'whaleBuyCount'],
      generatedTimestamp: now
    };
  }

  // 4. Mean Reversion Strategy
  public evalMeanReversion(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const isOversold =
      fv.technical.rsi14 < 32 &&
      fv.technical.bollingerBands.percentB < 0.08 &&
      fv.price.localDrawdown < -0.10;

    const rawScore = isOversold
      ? 55 +
        (32 - fv.technical.rsi14) * 1.8 +
        Math.max(0, (0.08 - fv.technical.bollingerBands.percentB) * 150) +
        (fv.price.recoveryStrength > 0.2 ? 15 : 0)
      : 10;
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    const direction: SignalDirection = score >= 58 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'short';
    const horizonCfg = HORIZON_CONFIGS[horizon];

    const invalidation = currPrice * (1 - horizonCfg.typicalStopLossPercent / 100);
    const targetPrice = fv.technical.bollingerBands.middle > currPrice
      ? fv.technical.bollingerBands.middle
      : currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100);

    return {
      strategyName: 'Mean Reversion',
      direction,
      score,
      confidence: isOversold ? 0.80 : 0.20,
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.994, maxPrice: currPrice * 1.004 },
      invalidation,
      targetZone: { minPrice: targetPrice * 0.98, maxPrice: targetPrice * 1.03 },
      stopLogic: `Stop loss if price breaks below lower band expansion limit ($${invalidation.toFixed(6)})`,
      structuredRationale: `Oversold reversion: RSI-14 ${fv.technical.rsi14.toFixed(1)}, Bollinger %B ${fv.technical.bollingerBands.percentB.toFixed(2)}, target SMA20 at $${targetPrice.toFixed(6)}`,
      requiredFeatures: ['rsi14', 'bollingerBands', 'recoveryStrength'],
      generatedTimestamp: now
    };
  }

  // 5. Volume Expansion Strategy
  public evalVolumeExpansion(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const isExpansion =
      fv.volume.relativeVolume > 2.2 &&
      fv.volume.volumeAcceleration > 0 &&
      fv.volume.buySellRatio > 1.3;

    const rawScore = isExpansion
      ? 52 +
        Math.min(30, (fv.volume.relativeVolume - 2.0) * 12) +
        Math.min(18, (fv.volume.buySellRatio - 1.0) * 15)
      : 20;
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    const direction: SignalDirection = score >= 60 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'intraday';
    const horizonCfg = HORIZON_CONFIGS[horizon];

    const invalidation = currPrice * (1 - horizonCfg.typicalStopLossPercent / 100);
    const minTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 0.85);
    const maxTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 1.25);

    return {
      strategyName: 'Volume Expansion',
      direction,
      score,
      confidence: isExpansion ? 0.83 : 0.30,
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.996, maxPrice: currPrice * 1.004 },
      invalidation,
      targetZone: { minPrice: minTarget, maxPrice: maxTarget },
      stopLogic: `Volume dry-up stop: exit if volume contracts below 20-period average or price hits $${invalidation.toFixed(6)}`,
      structuredRationale: `Volume expansion ${fv.volume.relativeVolume.toFixed(2)}x baseline with buy/sell ratio ${fv.volume.buySellRatio.toFixed(2)}`,
      requiredFeatures: ['relativeVolume', 'volumeAcceleration', 'buySellRatio'],
      generatedTimestamp: now
    };
  }

  // 6. Liquidity Event Strategy
  public evalLiquidityEvent(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const isLpInflow =
      fv.liquidity.lpNetFlowUsd > 5000 &&
      fv.liquidity.liquidityChangePercent > 3.0 &&
      fv.liquidity.reserveImbalance < 0.20;

    const rawScore = isLpInflow
      ? 58 +
        Math.min(25, fv.liquidity.liquidityChangePercent * 4) +
        Math.min(17, (fv.liquidity.lpNetFlowUsd / 10000) * 5)
      : 20;
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    const direction: SignalDirection = score >= 60 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'swing';
    const horizonCfg = HORIZON_CONFIGS[horizon];

    const invalidation = currPrice * (1 - horizonCfg.typicalStopLossPercent / 100);
    const minTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 0.85);
    const maxTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 1.30);

    return {
      strategyName: 'Liquidity Event',
      direction,
      score,
      confidence: isLpInflow ? 0.81 : 0.25,
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.995, maxPrice: currPrice * 1.005 },
      invalidation,
      targetZone: { minPrice: minTarget, maxPrice: maxTarget },
      stopLogic: `Immediate exit if LP liquidity net flow turns negative or falls below $${invalidation.toFixed(6)}`,
      structuredRationale: `LP net inflow $${fv.liquidity.lpNetFlowUsd.toFixed(0)} (${fv.liquidity.liquidityChangePercent.toFixed(1)}% expansion) with balanced reserves`,
      requiredFeatures: ['lpNetFlowUsd', 'liquidityChangePercent', 'reserveImbalance'],
      generatedTimestamp: now
    };
  }

  // 7. Smart Money Flow Strategy (Wallet Profiling & Cohorts Interface)
  public evalSmartMoneyFlow(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const isSmartMoneyInflow =
      fv.smartMoney.topSmartMoneyNetFlowUsd > 8000 &&
      fv.smartMoney.avgSmartMoneyProfitability > 55;

    const rawScore = isSmartMoneyInflow
      ? 56 +
        Math.min(25, fv.smartMoney.smartMoneyDominanceRatio * 60) +
        Math.min(19, (fv.smartMoney.topSmartMoneyNetFlowUsd / 20000) * 15)
      : 25;
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    const direction: SignalDirection = score >= 60 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'intraday';
    const horizonCfg = HORIZON_CONFIGS[horizon];

    const invalidation = currPrice * (1 - horizonCfg.typicalStopLossPercent / 100);
    const minTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 0.85);
    const maxTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 1.25);

    return {
      strategyName: 'Smart Money Flow',
      direction,
      score,
      confidence: isSmartMoneyInflow ? 0.86 : 0.35,
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.996, maxPrice: currPrice * 1.004 },
      invalidation,
      targetZone: { minPrice: minTarget, maxPrice: maxTarget },
      stopLogic: `Exit when smart money cohorts begin distribution or on price stop $${invalidation.toFixed(6)}`,
      structuredRationale: `Smart money net inflow $${fv.smartMoney.topSmartMoneyNetFlowUsd.toFixed(0)} | Tracked profitability ${fv.smartMoney.avgSmartMoneyProfitability.toFixed(1)}%`,
      requiredFeatures: ['topSmartMoneyNetFlowUsd', 'avgSmartMoneyProfitability', 'smartMoneyDominanceRatio'],
      generatedTimestamp: now
    };
  }

  // 8. Market Relative Strength Strategy
  public evalMarketRelativeStrength(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const isOutperforming =
      fv.macro.relativeStrengthVsBtc > 4.0 &&
      fv.macro.betaToBtc > 0.8;

    const rawScore = isOutperforming
      ? 54 +
        Math.min(26, fv.macro.relativeStrengthVsBtc * 2.5) +
        Math.min(20, (fv.macro.betaToBtc - 0.5) * 15)
      : 20;
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    const direction: SignalDirection = score >= 60 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'swing';
    const horizonCfg = HORIZON_CONFIGS[horizon];

    const invalidation = currPrice * (1 - horizonCfg.typicalStopLossPercent / 100);
    const minTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 0.85);
    const maxTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 1.35);

    return {
      strategyName: 'Market Relative Strength',
      direction,
      score,
      confidence: isOutperforming ? 0.83 : 0.28,
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.995, maxPrice: currPrice * 1.005 },
      invalidation,
      targetZone: { minPrice: minTarget, maxPrice: maxTarget },
      stopLogic: `Exit if relative strength vs BTC falls below zero; hard stop at $${invalidation.toFixed(6)}`,
      structuredRationale: `Outperforming BTC by +${fv.macro.relativeStrengthVsBtc.toFixed(2)}% with beta ${fv.macro.betaToBtc.toFixed(2)}`,
      requiredFeatures: ['relativeStrengthVsBtc', 'betaToBtc', 'correlationToBtc'],
      generatedTimestamp: now
    };
  }

  public evaluateAllStrategies(fv: FeatureVector, currPrice: number): StrategySignal[] {
    return [
      this.evalMomentum(fv, currPrice),
      this.evalBreakout(fv, currPrice),
      this.evalNewPoolEarlyMomentum(fv, currPrice),
      this.evalMeanReversion(fv, currPrice),
      this.evalVolumeExpansion(fv, currPrice),
      this.evalLiquidityEvent(fv, currPrice),
      this.evalSmartMoneyFlow(fv, currPrice),
      this.evalMarketRelativeStrength(fv, currPrice)
    ];
  }
}

// ==========================================
// 3. META-ENSEMBLE SYNTHESIZER
// ==========================================

export class MetaEnsembleEngine {
  private regimeEngine = new DeterministicRegimeEngine();
  private strategyEngine = new StrategyEngine();
  private mlEngine = new LightMLEngine();

  /**
   * Synthesizes signals from all 8 strategies across:
   * - Market Regime alignment weights
   * - Cluster-based correlation deduplication to prevent multi-signal collinearity
   * - Data Quality weighting (confidence * freshness)
   * - Realistic Round-Trip Trading Cost Model (fees, slippage, price impact, gas)
   * - Net Expected Value (EV) per dollar traded
   * - Strict Risk & Security gating for Aggressive Mode
   * - NO_TRADE priority state when edge after costs is insufficient
   */
  public synthesizeMetaSignal(
    tokenAddress: string,
    chainId: string,
    fv: FeatureVector,
    currPrice: number,
    config: StrategyEngineConfig,
    securityPassed: boolean,
    securityReason?: string,
    securityScore: number = 100,
    liquidityScore: number = 100,
    costConfig?: {
      feeBps?: number;
      slippageBps?: number;
      priceImpactBps?: number;
      gasCostUsd?: number;
      notionalUsd?: number;
    }
  ): MetaEnsembleSignal {
    const now = Date.now();
    const regimeAnalysis = this.regimeEngine.classifyRegime(fv);
    const primaryRegime = regimeAnalysis.primaryRegime;

    // Hard Security, Liquidity, or Data block
    const isHardBlocked =
      !securityPassed ||
      securityScore < 50 ||
      liquidityScore < 40 ||
      primaryRegime === 'DATA_STRESS' ||
      primaryRegime === 'LIQUIDITY_STRESS';

    if (isHardBlocked) {
      const blockReason =
        securityReason ||
        (securityScore < 50 ? `Security score too low (${securityScore}/100)` : undefined) ||
        (liquidityScore < 40 ? `Liquidity score too low (${liquidityScore}/100)` : undefined) ||
        `Deterministic regime block: ${primaryRegime}`;

      return {
        signal_id: `meta_${now}_${tokenAddress.slice(0, 6)}`,
        tokenAddress,
        chainId,
        direction: 'FLAT',
        signal_score: 0,
        signal_confidence: 0,
        signal_quality: 0,
        signal_age: 0,
        signal_decay: 1.0,
        selectedHorizon: 'short',
        entryZone: { minPrice: currPrice, maxPrice: currPrice },
        invalidation: currPrice * 0.95,
        targetZone: { minPrice: currPrice, maxPrice: currPrice },
        stopLogic: 'No Trade - Hard Safety / Security Block Enforced',
        expectedValueUsdPerDollar: -1.0,
        netExpectedReturnPercent: -100,
        estimatedCostBps: 0,
        correlationPenaltyApplied: 0,
        securityScore,
        liquidityScore,
        regime: primaryRegime,
        contributingStrategies: [],
        isNoTrade: true,
        noTradeReason: blockReason,
        aggressiveModeActive: false,
        calculatedTimestamp: now
      };
    }

    // Safety Gate for Aggressive Mode
    // Aggressive Mode is ONLY permitted within strict Risk and Security boundaries
    let effectiveAggressiveMode = config.aggressiveMode;
    if (effectiveAggressiveMode) {
      const isDangerousRegime =
        primaryRegime === 'PANIC' ||
        primaryRegime === 'MEME_PANIC';

      if (securityScore < 75 || liquidityScore < 60 || isDangerousRegime) {
        // Automatically disarm aggressive mode
        effectiveAggressiveMode = false;
      }
    }

    const rawSignals = this.strategyEngine.evaluateAllStrategies(fv, currPrice);

    // Regime-based Strategy Weight Matrix
    const regimeWeights: Record<string, number> = {
      Momentum:
        primaryRegime === 'TREND_UP'
          ? 1.5
          : primaryRegime === 'EUPHORIA'
          ? 1.4
          : primaryRegime === 'RANGE'
          ? 0.5
          : 0.8,
      Breakout:
        primaryRegime === 'TREND_UP' || primaryRegime === 'HIGH_VOL'
          ? 1.4
          : primaryRegime === 'LOW_VOL'
          ? 1.2
          : 0.6,
      'New Pool / Early Momentum':
        primaryRegime === 'MEME_EUPHORIA'
          ? 1.8
          : primaryRegime === 'HIGH_VOL'
          ? 1.2
          : 0.4,
      'Mean Reversion':
        primaryRegime === 'RANGE' || primaryRegime === 'LOW_VOL'
          ? 1.6
          : primaryRegime === 'TREND_UP'
          ? 0.3
          : 0.5,
      'Volume Expansion':
        primaryRegime === 'HIGH_VOL' || primaryRegime === 'MEME_EUPHORIA'
          ? 1.3
          : 0.9,
      'Liquidity Event':
        primaryRegime === 'LOW_VOL' || primaryRegime === 'TREND_UP'
          ? 1.2
          : 0.9,
      'Smart Money Flow':
        primaryRegime === 'TREND_UP' || primaryRegime === 'RANGE'
          ? 1.3
          : 1.0,
      'Market Relative Strength':
        primaryRegime === 'TREND_UP' || primaryRegime === 'EUPHORIA'
          ? 1.4
          : 0.7
    };

    // Cluster-based Correlation Deduplication:
    // When multiple strategies in the same correlation cluster fire in the same direction,
    // apply progressive penalization to prevent collinearity / double-counting beta.
    const clusterSeenCount: Record<StrategyCluster, number> = {
      TREND: 0,
      FLOW: 0,
      EARLY: 0,
      REVERSION: 0
    };

    let totalWeightedScore = 0;
    let totalWeight = 0;
    let correlationPenaltySum = 0;
    const contributing: { name: string; weight: number; score: number; direction: SignalDirection }[] = [];

    const deductionFactor = config.correlationDeductionFactor ?? 0.5;

    for (const sig of rawSignals) {
      if (sig.direction === 'LONG') {
        const cluster = STRATEGY_CLUSTER_MAP[sig.strategyName] || 'TREND';
        const priorCount = clusterSeenCount[cluster];
        clusterSeenCount[cluster]++;

        let baseWeight = regimeWeights[sig.strategyName] ?? 1.0;
        let correlationMultiplier = 1.0;

        if (priorCount > 0) {
          // Penalize subsequent signals from the same correlation group
          correlationMultiplier = Math.pow(1 - deductionFactor, priorCount);
          correlationPenaltySum += (1 - correlationMultiplier);
        }

        const effectiveWeight = baseWeight * correlationMultiplier;
        totalWeightedScore += sig.score * effectiveWeight * sig.confidence;
        totalWeight += effectiveWeight * sig.confidence;

        contributing.push({
          name: sig.strategyName,
          weight: Number(effectiveWeight.toFixed(3)),
          score: sig.score,
          direction: sig.direction
        });
      }
    }

    const rawSignalScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;
    const dataQuality = Math.min(1.0, fv.confidence * fv.freshness);
    const signal_confidence = Math.min(1.0, totalWeight > 0 ? (totalWeight / 4.5) * dataQuality : 0.0);

    // Dynamic Thresholds: standard vs aggressive
    const baseThreshold = config.minMetaScoreToTrade || 60;
    const requiredScore = effectiveAggressiveMode
      ? Math.max(48, baseThreshold - 10)
      : baseThreshold;

    const minConf = config.minConfidence || 0.50;

    // Determine horizon based on contributing signals
    let selectedHorizon: TimeHorizon = 'short';
    if (rawSignalScore >= 78) {
      selectedHorizon = 'swing';
    } else if (rawSignalScore >= 68) {
      selectedHorizon = 'intraday';
    } else if (primaryRegime === 'MEME_EUPHORIA' || primaryRegime === 'HIGH_VOL') {
      selectedHorizon = 'scalp';
    }

    const horizonCfg = HORIZON_CONFIGS[selectedHorizon];

    // Execution Cost & Net Expected Value (EV) Model
    const feeBps = costConfig?.feeBps ?? 30; // 30 bps each way -> 60 bps round trip
    const slippageBps = costConfig?.slippageBps ?? horizonCfg.expectedSlippageBps;
    const priceImpactBps = costConfig?.priceImpactBps ?? Math.round(fv.liquidity.priceImpact1kUsd * 10);
    const gasCostUsd = costConfig?.gasCostUsd ?? (fv.macro.gasPriceGwei * 0.000000001 * 150000 * 2500); // approx $0.05 on Base/BSC
    const notionalUsd = costConfig?.notionalUsd ?? (config.defaultTradeSizeUsd || 50.0);

    const gasBps = notionalUsd > 0 ? (gasCostUsd / notionalUsd) * 10000 : 20;
    const roundTripCostBps = (feeBps * 2) + (slippageBps * 2) + priceImpactBps + gasBps;
    const totalCostPercent = roundTripCostBps / 100;

    // Probabilistic payoff calculation
    // Win rate is derived from signal score, quality, and regime alignment
    const regimeModifier =
      primaryRegime === 'TREND_UP' || primaryRegime === 'MEME_EUPHORIA' ? 1.05 :
      primaryRegime === 'PANIC' || primaryRegime === 'MEME_PANIC' ? 0.75 : 0.95;

    const baseWinRate = 0.35 + (rawSignalScore / 100) * 0.45;
    const winRateEst = Math.min(0.85, Math.max(0.15, baseWinRate * dataQuality * regimeModifier));

    const targetGainPercent = horizonCfg.typicalTakeProfitPercent;
    const stopLossPercent = horizonCfg.typicalStopLossPercent;

    const grossEvPercent = (winRateEst * targetGainPercent) - ((1 - winRateEst) * stopLossPercent);
    const netEvPercent = grossEvPercent - totalCostPercent;
    const netEvPerDollar = netEvPercent / 100;

    const minEvRequired = config.minEvThreshold ?? 0.002; // minimum 0.20% net edge after costs

    const hasStatisticalEdge =
      rawSignalScore >= requiredScore &&
      signal_confidence >= minConf &&
      netEvPerDollar >= minEvRequired;

    // If edge after costs is non-positive or below threshold, NO_TRADE is mandatory
    if (!hasStatisticalEdge) {
      let noTradeReason = `Insufficient statistical edge: Score ${rawSignalScore}/${requiredScore}, Conf ${(signal_confidence * 100).toFixed(0)}%/${(minConf * 100).toFixed(0)}%`;
      if (netEvPerDollar < minEvRequired) {
        noTradeReason = `Negative or insufficient net EV after costs (${(netEvPercent).toFixed(2)}% net vs ${(totalCostPercent).toFixed(2)}% costs)`;
      }

      return {
        signal_id: `meta_${now}_${tokenAddress.slice(0, 6)}`,
        tokenAddress,
        chainId,
        direction: 'FLAT',
        signal_score: rawSignalScore,
        signal_confidence: Number(signal_confidence.toFixed(3)),
        signal_quality: Number(dataQuality.toFixed(3)),
        signal_age: 0,
        signal_decay: 1.0,
        selectedHorizon,
        entryZone: { minPrice: currPrice, maxPrice: currPrice },
        invalidation: currPrice * (1 - stopLossPercent / 100),
        targetZone: { minPrice: currPrice, maxPrice: currPrice },
        stopLogic: 'No Trade - Edge after costs insufficient to justify execution',
        expectedValueUsdPerDollar: Number(netEvPerDollar.toFixed(4)),
        netExpectedReturnPercent: Number(netEvPercent.toFixed(2)),
        estimatedCostBps: Math.round(roundTripCostBps),
        correlationPenaltyApplied: Number(correlationPenaltySum.toFixed(2)),
        securityScore,
        liquidityScore,
        regime: primaryRegime,
        contributingStrategies: contributing,
        isNoTrade: true,
        noTradeReason,
        aggressiveModeActive: effectiveAggressiveMode,
        calculatedTimestamp: now
      };
    }

    const invalidation = currPrice * (1 - stopLossPercent / 100);
    const minTarget = currPrice * (1 + targetGainPercent * 0.85 / 100);
    const maxTarget = currPrice * (1 + targetGainPercent * 1.25 / 100);

    const horizonToMlMap: Record<TimeHorizon, MLHorizon> = {
      scalp: '5m',
      short: '15m',
      intraday: '30m',
      swing: '1h'
    };

    const mlPrediction = this.mlEngine.predict(
      {
        featureVector: fv,
        regime: primaryRegime,
        securityScore,
        liquidityScore
      },
      horizonToMlMap[selectedHorizon],
      costConfig
    );

    return {
      signal_id: `meta_${now}_${tokenAddress.slice(0, 6)}`,
      tokenAddress,
      chainId,
      direction: 'LONG',
      signal_score: rawSignalScore,
      signal_confidence: Number(signal_confidence.toFixed(3)),
      signal_quality: Number(dataQuality.toFixed(3)),
      signal_age: 0,
      signal_decay: 1.0,
      selectedHorizon,
      entryZone: { minPrice: currPrice * 0.998, maxPrice: currPrice * 1.002 },
      invalidation,
      targetZone: { minPrice: minTarget, maxPrice: maxTarget },
      stopLogic: `Deterministic ${stopLossPercent}% stop loss ($${invalidation.toFixed(6)}) for ${selectedHorizon} horizon`,
      expectedValueUsdPerDollar: Number(netEvPerDollar.toFixed(4)),
      netExpectedReturnPercent: Number(netEvPercent.toFixed(2)),
      estimatedCostBps: Math.round(roundTripCostBps),
      correlationPenaltyApplied: Number(correlationPenaltySum.toFixed(2)),
      securityScore,
      liquidityScore,
      regime: primaryRegime,
      contributingStrategies: contributing,
      isNoTrade: false,
      aggressiveModeActive: effectiveAggressiveMode,
      ml_prediction: mlPrediction,
      calculatedTimestamp: now
    };
  }
}

// ==========================================
// 4. BACKTESTING STRATEGY RUNNER
// ==========================================

export class BacktestStrategyRunner {
  private metaEngine = new MetaEnsembleEngine();

  public runBacktestTick(
    input: BacktestTickInput,
    config: StrategyEngineConfig
  ): MetaEnsembleSignal {
    return this.metaEngine.synthesizeMetaSignal(
      input.featureVector.tokenAddress,
      input.featureVector.chainId,
      input.featureVector,
      input.currentPriceUsd,
      config,
      input.securityPassed,
      input.securityBlockReason,
      input.securityScore ?? 100,
      input.liquidityScore ?? 100
    );
  }
}
