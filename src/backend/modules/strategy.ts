/**
 * Deterministic Strategy Brain & Regime Detection Engine.
 * Implements 100% mathematical, zero-LLM decision logic across 12 market regimes, 8 core strategies,
 * multi-horizon risk budget mapping, signal correlation deduplication, and a Meta-Ensemble synthesizer.
 * Enforces NO TRADE as a primary valid output state.
 */

import { MarketRegime } from '../../shared/types';
import { FeatureVector } from '../types/features';
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
    typicalTakeProfitPercent: 3.0,
    expectedSlippageBps: 15,
    riskBudgetMultiplier: 0.5
  },
  short: {
    horizon: 'short',
    minHoldingPeriodSec: 300,
    maxHoldingPeriodSec: 900,
    typicalStopLossPercent: 3.0,
    typicalTakeProfitPercent: 6.0,
    expectedSlippageBps: 25,
    riskBudgetMultiplier: 0.75
  },
  intraday: {
    horizon: 'intraday',
    minHoldingPeriodSec: 900,
    maxHoldingPeriodSec: 3600,
    typicalStopLossPercent: 5.0,
    typicalTakeProfitPercent: 12.0,
    expectedSlippageBps: 35,
    riskBudgetMultiplier: 1.0
  },
  swing: {
    horizon: 'swing',
    minHoldingPeriodSec: 3600,
    maxHoldingPeriodSec: 14400,
    typicalStopLossPercent: 8.0,
    typicalTakeProfitPercent: 25.0,
    expectedSlippageBps: 50,
    riskBudgetMultiplier: 1.25
  }
};

// ==========================================
// 1. DETERMINISTIC REGIME DETECTION ENGINE
// ==========================================

export class DeterministicRegimeEngine {
  public classifyRegime(features: FeatureVector): RegimeAnalysis {
    const now = Date.now();
    const drivers: string[] = [];

    // Check Data Stress
    if (features.missingnessRatio > 0.3 || features.confidence < 0.5 || features.freshness < 0.5) {
      drivers.push(`Missingness ${(features.missingnessRatio * 100).toFixed(0)}%, Confidence ${features.confidence}`);
      return {
        primaryRegime: 'DATA_STRESS',
        confidence: 0.95,
        regimeRationale: 'High data missingness or stale feeds detected',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // Check Liquidity Stress
    if (features.liquidity.liquidityUsd < 10000 || features.liquidity.reserveImbalance > 0.35) {
      drivers.push(`Liquidity $${features.liquidity.liquidityUsd.toFixed(0)}, Imbalance ${(features.liquidity.reserveImbalance * 100).toFixed(1)}%`);
      return {
        primaryRegime: 'LIQUIDITY_STRESS',
        confidence: 0.90,
        regimeRationale: 'Liquidity pool depleted or severe reserve imbalance',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // Check Meme Panic vs Meme Euphoria
    if (features.meme.memeFailureRatePercent > 35 && features.flow.netFlowUsd < -10000) {
      drivers.push(`Meme Failure Rate ${features.meme.memeFailureRatePercent}%, Net Flow $${features.flow.netFlowUsd}`);
      return {
        primaryRegime: 'MEME_PANIC',
        secondaryRegime: 'PANIC',
        confidence: 0.88,
        regimeRationale: 'Widespread meme token liquidations and high pool abandonment rate',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    if (features.meme.memeMomentumBreadth > 70 && features.volume.buySellRatio > 1.8 && features.volume.volumeZScore > 1.5) {
      drivers.push(`Meme Momentum Breadth ${features.meme.memeMomentumBreadth}, Buy/Sell Ratio ${features.volume.buySellRatio}`);
      return {
        primaryRegime: 'MEME_EUPHORIA',
        secondaryRegime: 'EUPHORIA',
        confidence: 0.85,
        regimeRationale: 'High meme token rotation, retail accumulation, and volume surge',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // Global Panic / Euphoria
    if (features.macro.btcReturn24h < -5.0 || features.price.localDrawdown < -0.20) {
      drivers.push(`BTC 24h Return ${features.macro.btcReturn24h}%, Drawdown ${(features.price.localDrawdown * 100).toFixed(1)}%`);
      return {
        primaryRegime: 'PANIC',
        confidence: 0.85,
        regimeRationale: 'Macro selloff or steep token drawdown',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    if (features.macro.btcReturn24h > 4.0 && features.price.returnSimple > 0.10) {
      drivers.push(`BTC 24h ${features.macro.btcReturn24h}%, Token Return ${(features.price.returnSimple * 100).toFixed(1)}%`);
      return {
        primaryRegime: 'EUPHORIA',
        confidence: 0.82,
        regimeRationale: 'Broad market rally and aggressive buying',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    // Trend & Volatility
    if (features.price.emaDistance9 > 0.01 && features.price.emaDistance21 > 0.02 && features.technical.adx14 > 22) {
      drivers.push(`EMA9 > EMA21 distance ${(features.price.emaDistance9 * 100).toFixed(2)}%, ADX ${features.technical.adx14.toFixed(1)}`);
      return {
        primaryRegime: 'TREND_UP',
        secondaryRegime: features.technical.realizedVolatility > 0.5 ? 'HIGH_VOL' : undefined,
        confidence: 0.88,
        regimeRationale: 'Strong bullish trend alignment across moving averages with expanding ADX',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    if (features.price.emaDistance9 < -0.01 && features.price.emaDistance21 < -0.02 && features.technical.adx14 > 22) {
      drivers.push(`EMA9 < EMA21 distance ${(features.price.emaDistance9 * 100).toFixed(2)}%, ADX ${features.technical.adx14.toFixed(1)}`);
      return {
        primaryRegime: 'TREND_DOWN',
        confidence: 0.88,
        regimeRationale: 'Deteriorating price structure under EMA fast/slow cross',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    if (features.technical.realizedVolatility > 0.70 || features.technical.rangeExpansion > 2.2) {
      drivers.push(`Realized Vol ${features.technical.realizedVolatility.toFixed(2)}, Range Expansion ${features.technical.rangeExpansion.toFixed(2)}`);
      return {
        primaryRegime: 'HIGH_VOL',
        confidence: 0.80,
        regimeRationale: 'Elevated price variance and rapid intra-bar swings',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    if (features.technical.realizedVolatility < 0.20 && features.technical.rangeExpansion < 0.9) {
      drivers.push(`Realized Vol ${features.technical.realizedVolatility.toFixed(2)}, Range Expansion ${features.technical.rangeExpansion.toFixed(2)}`);
      return {
        primaryRegime: 'LOW_VOL',
        secondaryRegime: 'RANGE',
        confidence: 0.80,
        regimeRationale: 'Compressed price range and dormant volatility',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    if (features.technical.adx14 < 20) {
      drivers.push(`ADX ${features.technical.adx14.toFixed(1)} < 20`);
      return {
        primaryRegime: 'RANGE',
        confidence: 0.75,
        regimeRationale: 'Sideways consolidation with low trend directional strength',
        keyDrivers: drivers,
        calculatedTimestamp: now
      };
    }

    return {
      primaryRegime: 'UNKNOWN',
      confidence: 0.50,
      regimeRationale: 'No single dominant market regime rule activated',
      keyDrivers: ['Mixed technical signals'],
      calculatedTimestamp: now
    };
  }
}

// ==========================================
// 2. STRATEGY EVALUATORS (8 STRATEGIES)
// ==========================================

export class StrategyEngine {
  private regimeEngine = new DeterministicRegimeEngine();

  // 1. Momentum Strategy
  public evalMomentum(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const score = Math.min(100, Math.max(0,
      (fv.technical.rsi14 > 50 ? (fv.technical.rsi14 - 50) * 1.5 : 0) +
      (fv.price.velocity > 0 ? fv.price.velocity * 500 : 0) +
      (fv.volume.volumeZScore > 0 ? fv.volume.volumeZScore * 10 : 0)
    ));

    const direction: SignalDirection = score > 55 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'short';
    const horizonCfg = HORIZON_CONFIGS[horizon];

    const invalidation = currPrice * (1 - horizonCfg.typicalStopLossPercent / 100);
    const targetPrice = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100);

    return {
      strategyName: 'Momentum',
      direction,
      score: Math.round(score),
      confidence: Math.min(0.95, 0.5 + (score / 200)),
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.998, maxPrice: currPrice * 1.002 },
      invalidation,
      targetZone: { minPrice: targetPrice * 0.98, maxPrice: targetPrice * 1.05 },
      stopLogic: 'Hard price invalidation below local EMA9 support',
      structuredRationale: `RSI14 at ${fv.technical.rsi14}, Velocity ${(fv.price.velocity * 100).toFixed(2)}% with Volume Z-Score ${fv.volume.volumeZScore.toFixed(2)}`,
      requiredFeatures: ['rsi14', 'velocity', 'volumeZScore', 'ema9'],
      generatedTimestamp: now
    };
  }

  // 2. Breakout Strategy
  public evalBreakout(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const isBreakout = fv.price.breakoutDistance20 > 0 && fv.volume.volumeZScore > 1.2;
    const score = isBreakout
      ? Math.min(100, 60 + fv.price.breakoutDistance20 * 500 + fv.volume.volumeZScore * 10)
      : 20;

    const direction: SignalDirection = score > 60 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'intraday';
    const horizonCfg = HORIZON_CONFIGS[horizon];

    return {
      strategyName: 'Breakout',
      direction,
      score: Math.round(score),
      confidence: isBreakout ? 0.85 : 0.3,
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.995, maxPrice: currPrice * 1.005 },
      invalidation: currPrice * (1 - horizonCfg.typicalStopLossPercent / 100),
      targetZone: { minPrice: currPrice * 1.08, maxPrice: currPrice * 1.15 },
      stopLogic: 'Immediate exit if price falls back inside 20-period range',
      structuredRationale: `20-bar breakout distance ${(fv.price.breakoutDistance20 * 100).toFixed(2)}% supported by Volume Z-Score ${fv.volume.volumeZScore.toFixed(2)}`,
      requiredFeatures: ['breakoutDistance20', 'volumeZScore', 'atr14'],
      generatedTimestamp: now
    };
  }

  // 3. New Pool / Early Momentum Strategy
  public evalNewPoolEarlyMomentum(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const isEarly = fv.meme.newPoolCount24h > 50 && fv.smartMoney.earlyEntryClusterDetected;
    const score = isEarly
      ? Math.min(100, 65 + (fv.volume.buySellRatio > 1.5 ? 20 : 0) + (fv.flow.whaleBuyCount * 5))
      : 15;

    const direction: SignalDirection = score > 60 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'scalp';
    const horizonCfg = HORIZON_CONFIGS[horizon];

    return {
      strategyName: 'New Pool / Early Momentum',
      direction,
      score: Math.round(score),
      confidence: isEarly ? 0.80 : 0.25,
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.99, maxPrice: currPrice * 1.01 },
      invalidation: currPrice * (1 - horizonCfg.typicalStopLossPercent / 100),
      targetZone: { minPrice: currPrice * 1.05, maxPrice: currPrice * 1.12 },
      stopLogic: 'Tight scalp trailing stop based on 1m bar lows',
      structuredRationale: `Early entry wallet cluster detected with Buy/Sell ratio ${(fv.volume.buySellRatio || 1.0).toFixed(2)}`,
      requiredFeatures: ['earlyEntryClusterDetected', 'buySellRatio', 'whaleBuyCount'],
      generatedTimestamp: now
    };
  }

  // 4. Mean Reversion Strategy
  public evalMeanReversion(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const oversold = fv.technical.rsi14 < 32 && fv.technical.bollingerBands.percentB < 0.05;
    const score = oversold
      ? Math.min(100, 60 + (32 - fv.technical.rsi14) * 2 + (0.05 - fv.technical.bollingerBands.percentB) * 200)
      : 10;

    const direction: SignalDirection = score > 55 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'short';
    const horizonCfg = HORIZON_CONFIGS[horizon];

    return {
      strategyName: 'Mean Reversion',
      direction,
      score: Math.round(score),
      confidence: oversold ? 0.78 : 0.20,
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.995, maxPrice: currPrice * 1.002 },
      invalidation: currPrice * (1 - horizonCfg.typicalStopLossPercent / 100),
      targetZone: { minPrice: fv.technical.bollingerBands.middle * 0.99, maxPrice: fv.technical.bollingerBands.middle * 1.01 },
      stopLogic: 'Stop loss if price breaks below lower band expansion threshold',
      structuredRationale: `Extreme oversold state: RSI14 ${fv.technical.rsi14.toFixed(1)}, Bollinger %B ${fv.technical.bollingerBands.percentB.toFixed(2)}`,
      requiredFeatures: ['rsi14', 'bollingerBands', 'sma20'],
      generatedTimestamp: now
    };
  }

  // 5. Volume Expansion Strategy
  public evalVolumeExpansion(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const expansion = fv.volume.relativeVolume > 2.5 && fv.volume.volumeAcceleration > 0;
    const score = expansion
      ? Math.min(100, 50 + fv.volume.relativeVolume * 12)
      : 25;

    const direction: SignalDirection = score > 60 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'intraday';

    return {
      strategyName: 'Volume Expansion',
      direction,
      score: Math.round(score),
      confidence: expansion ? 0.82 : 0.35,
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.997, maxPrice: currPrice * 1.003 },
      invalidation: currPrice * 0.96,
      targetZone: { minPrice: currPrice * 1.08, maxPrice: currPrice * 1.15 },
      stopLogic: 'Exit if volume contracts back below 20-period average',
      structuredRationale: `Relative volume surge ${fv.volume.relativeVolume.toFixed(2)}x with positive volume acceleration`,
      requiredFeatures: ['relativeVolume', 'volumeAcceleration'],
      generatedTimestamp: now
    };
  }

  // 6. Liquidity Event Strategy
  public evalLiquidityEvent(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const lpInflow = fv.liquidity.lpNetFlowUsd > 5000 && fv.liquidity.liquidityChangePercent > 3.0;
    const score = lpInflow ? Math.min(100, 65 + (fv.liquidity.liquidityChangePercent * 4)) : 20;

    const direction: SignalDirection = score > 60 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'swing';

    return {
      strategyName: 'Liquidity Event',
      direction,
      score: Math.round(score),
      confidence: lpInflow ? 0.80 : 0.30,
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.995, maxPrice: currPrice * 1.005 },
      invalidation: currPrice * 0.92,
      targetZone: { minPrice: currPrice * 1.15, maxPrice: currPrice * 1.25 },
      stopLogic: 'Exit if LP liquidity net flow turns negative',
      structuredRationale: `LP net inflow $${fv.liquidity.lpNetFlowUsd} (${fv.liquidity.liquidityChangePercent.toFixed(1)}% expansion)`,
      requiredFeatures: ['lpNetFlowUsd', 'liquidityChangePercent', 'liquidityUsd'],
      generatedTimestamp: now
    };
  }

  // 7. Smart Money Flow Strategy
  public evalSmartMoneyFlow(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const smInflow = fv.smartMoney.topSmartMoneyNetFlowUsd > 10000 && fv.smartMoney.avgSmartMoneyProfitability > 60;
    const score = smInflow ? Math.min(100, 70 + (fv.smartMoney.smartMoneyDominanceRatio * 50)) : 30;

    const direction: SignalDirection = score > 60 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'intraday';

    return {
      strategyName: 'Smart Money Flow',
      direction,
      score: Math.round(score),
      confidence: smInflow ? 0.88 : 0.40,
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.996, maxPrice: currPrice * 1.004 },
      invalidation: currPrice * 0.95,
      targetZone: { minPrice: currPrice * 1.10, maxPrice: currPrice * 1.20 },
      stopLogic: 'Exit when smart money cohorts begin distribution',
      structuredRationale: `Smart money net inflow $${fv.smartMoney.topSmartMoneyNetFlowUsd} with profitability ${fv.smartMoney.avgSmartMoneyProfitability}%`,
      requiredFeatures: ['topSmartMoneyNetFlowUsd', 'smartMoneyDominanceRatio'],
      generatedTimestamp: now
    };
  }

  // 8. Market Relative Strength Strategy
  public evalMarketRelativeStrength(fv: FeatureVector, currPrice: number): StrategySignal {
    const now = Date.now();
    const outperforming = fv.macro.relativeStrengthVsBtc > 5.0 && fv.macro.betaToBtc > 1.0;
    const score = outperforming ? Math.min(100, 60 + fv.macro.relativeStrengthVsBtc * 2) : 25;

    const direction: SignalDirection = score > 60 ? 'LONG' : 'FLAT';
    const horizon: TimeHorizon = 'swing';

    return {
      strategyName: 'Market Relative Strength',
      direction,
      score: Math.round(score),
      confidence: outperforming ? 0.82 : 0.30,
      expectedHorizon: horizon,
      entryZone: { minPrice: currPrice * 0.995, maxPrice: currPrice * 1.005 },
      invalidation: currPrice * 0.92,
      targetZone: { minPrice: currPrice * 1.15, maxPrice: currPrice * 1.30 },
      stopLogic: 'Exit if relative strength vs BTC falls below zero',
      structuredRationale: `Outperforming BTC by +${fv.macro.relativeStrengthVsBtc.toFixed(2)}% with beta ${fv.macro.betaToBtc}`,
      requiredFeatures: ['relativeStrengthVsBtc', 'betaToBtc', 'btcReturn24h'],
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

  public synthesizeMetaSignal(
    tokenAddress: string,
    chainId: string,
    fv: FeatureVector,
    currPrice: number,
    config: StrategyEngineConfig,
    securityPassed: boolean,
    securityReason?: string
  ): MetaEnsembleSignal {
    const now = Date.now();
    const regimeAnalysis = this.regimeEngine.classifyRegime(fv);
    const primaryRegime = regimeAnalysis.primaryRegime;

    // Hard Security / Data / Liquidity Block Check
    if (!securityPassed || primaryRegime === 'DATA_STRESS' || primaryRegime === 'LIQUIDITY_STRESS') {
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
        stopLogic: 'No Trade - Hard Safety Block',
        expectedValueUsdPerDollar: -1.0,
        regime: primaryRegime,
        contributingStrategies: [],
        isNoTrade: true,
        noTradeReason: securityReason || `Hard regime block: ${primaryRegime}`,
        aggressiveModeActive: config.aggressiveMode,
        calculatedTimestamp: now
      };
    }

    const rawSignals = this.strategyEngine.evaluateAllStrategies(fv, currPrice);

    // Regime-based strategy weights
    const regimeWeights: Record<string, number> = {
      Momentum: primaryRegime === 'TREND_UP' ? 1.4 : primaryRegime === 'EUPHORIA' ? 1.5 : 0.8,
      Breakout: primaryRegime === 'TREND_UP' || primaryRegime === 'HIGH_VOL' ? 1.3 : 0.7,
      'New Pool / Early Momentum': primaryRegime === 'MEME_EUPHORIA' ? 1.8 : 0.5,
      'Mean Reversion': primaryRegime === 'RANGE' || primaryRegime === 'LOW_VOL' ? 1.5 : 0.3,
      'Volume Expansion': primaryRegime === 'HIGH_VOL' || primaryRegime === 'TREND_UP' ? 1.2 : 0.8,
      'Liquidity Event': 1.0,
      'Smart Money Flow': 1.2,
      'Market Relative Strength': primaryRegime === 'TREND_UP' ? 1.2 : 0.8
    };

    let totalWeightedScore = 0;
    let totalWeight = 0;
    const contributing: { name: string; weight: number; score: number; direction: SignalDirection }[] = [];

    // Deduplication of correlated strategy signals (e.g. Momentum + Breakout correlation ~0.8)
    for (let i = 0; i < rawSignals.length; i++) {
      const sig = rawSignals[i];
      let weight = regimeWeights[sig.strategyName] || 1.0;

      // Deduplicate if previous correlated strategy also fired
      if (i > 0 && rawSignals[i - 1].direction === sig.direction && rawSignals[i - 1].score > 60) {
        weight *= (1 - config.correlationDeductionFactor);
      }

      if (sig.direction === 'LONG') {
        totalWeightedScore += sig.score * weight * sig.confidence;
        totalWeight += weight * sig.confidence;
        contributing.push({ name: sig.strategyName, weight, score: sig.score, direction: sig.direction });
      }
    }

    const signal_score = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;
    const signal_confidence = Math.min(1.0, totalWeight > 0 ? totalWeight / 5.0 : 0.0);
    const signal_quality = Math.min(1.0, fv.confidence * fv.freshness);

    // Threshold check (Aggressive vs Standard)
    const requiredThreshold = config.aggressiveMode ? Math.max(45, config.minMetaScoreToTrade - 10) : config.minMetaScoreToTrade;
    const isTradeAllowed = signal_score >= requiredThreshold && signal_confidence >= config.minConfidence;

    if (!isTradeAllowed) {
      return {
        signal_id: `meta_${now}_${tokenAddress.slice(0, 6)}`,
        tokenAddress,
        chainId,
        direction: 'FLAT',
        signal_score,
        signal_confidence,
        signal_quality,
        signal_age: 0,
        signal_decay: 1.0,
        selectedHorizon: 'short',
        entryZone: { minPrice: currPrice, maxPrice: currPrice },
        invalidation: currPrice * 0.95,
        targetZone: { minPrice: currPrice, maxPrice: currPrice },
        stopLogic: 'No Trade - Score or Confidence below minimum edge threshold',
        expectedValueUsdPerDollar: 0.0,
        regime: primaryRegime,
        contributingStrategies: contributing,
        isNoTrade: true,
        noTradeReason: `Signal score (${signal_score}) or confidence (${signal_confidence.toFixed(2)}) below required threshold (${requiredThreshold})`,
        aggressiveModeActive: config.aggressiveMode,
        calculatedTimestamp: now
      };
    }

    // Determine horizon & trade parameters
    const selectedHorizon: TimeHorizon = signal_score > 80 ? 'swing' : signal_score > 70 ? 'intraday' : 'short';
    const horizonCfg = HORIZON_CONFIGS[selectedHorizon];

    const invalidation = currPrice * (1 - horizonCfg.typicalStopLossPercent / 100);
    const minTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 0.8);
    const maxTarget = currPrice * (1 + horizonCfg.typicalTakeProfitPercent / 100 * 1.2);

    const expectedGainPercent = horizonCfg.typicalTakeProfitPercent;
    const expectedLossPercent = horizonCfg.typicalStopLossPercent;
    const winRateEst = Math.min(0.85, 0.50 + (signal_score / 200));
    const ev = (winRateEst * expectedGainPercent - (1 - winRateEst) * expectedLossPercent) / 100;

    return {
      signal_id: `meta_${now}_${tokenAddress.slice(0, 6)}`,
      tokenAddress,
      chainId,
      direction: 'LONG',
      signal_score,
      signal_confidence,
      signal_quality,
      signal_age: 0,
      signal_decay: 1.0,
      selectedHorizon,
      entryZone: { minPrice: currPrice * 0.998, maxPrice: currPrice * 1.002 },
      invalidation,
      targetZone: { minPrice: minTarget, maxPrice: maxTarget },
      stopLogic: `Deterministic ${horizonCfg.typicalStopLossPercent}% trailing stop loss for ${selectedHorizon} horizon`,
      expectedValueUsdPerDollar: Number(ev.toFixed(4)),
      regime: primaryRegime,
      contributingStrategies: contributing,
      isNoTrade: false,
      aggressiveModeActive: config.aggressiveMode,
      calculatedTimestamp: now
    };
  }
}

// ==========================================
// 4. BACKTESTING STRATEGY ADAPTER
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
      input.securityBlockReason
    );
  }
}
