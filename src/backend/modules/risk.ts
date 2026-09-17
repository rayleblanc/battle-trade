/**
 * Battle Trade - Professional Risk Engine & Position Sizing (2026).
 * 
 * Implements:
 * - Configurable Multi-Tier Risk Limits (daily loss, drawdown, exposures, streaks, cooldowns)
 * - 7 Capital Modes ($5, $10, $50, $100, $500, $1,000, $10,000) using unified code
 * - 4 Advanced Position Sizing Algorithms:
 *     1. Fixed fractional
 *     2. Volatility-adjusted (ATR/realized vol)
 *     3. Risk-per-trade (account risk % / stop loss %)
 *     4. Fractional Kelly criterion with safety ceiling cap
 * - Pool liquidity and price impact bounds (max 2% of pool depth)
 * - Automatic NO_TRADE for tiny capitals when fees/slippage/gas eliminate statistical edge
 * - 8 Comprehensive Circuit Breakers (daily loss, drawdown, loss streak, stale data,
 *   abnormal impact, liquidity shock, security incident, DB inconsistency)
 * - Deterministic State Machine: NORMAL -> CAUTION -> DEFENSIVE -> HALTED
 *   (HALTED allows only emergency exits)
 * - Detailed Limits Consumed Snapshot & Structured Reasons
 */

import { ChainId, ActivePosition, HistoricalTrade, SystemConfig, MultiLayerDecision, MarketData } from '../../shared/types';
import { BattleTradeDB } from './database';
import {
  CapitalMode,
  CapitalModeConfig,
  RiskLimitsConfig,
  RiskTrackedPosition,
  PositionSizingMethod,
  CircuitBreakerState,
  CircuitBreakerEvaluation,
  LimitsConsumedSnapshot,
  RiskCheckInput,
  RiskDecision
} from '../types/risk';

export const CAPITAL_MODE_PRESETS: Record<CapitalMode, CapitalModeConfig> = {
  '5': {
    mode: '5',
    startingCapitalUsd: 5,
    maxTradeSizeUsd: 2.0,
    minTradeSizeUsd: 1.0,
    maxSimultaneousPositions: 2,
    maxDailyLossPercent: 15.0,
    maxPortfolioDrawdownPercent: 20.0,
    maxTokenExposurePercent: 50.0,
    maxStrategyExposurePercent: 60.0,
    maxChainExposurePercent: 100.0,
    maxSlippageBps: 250,
    maxPriceImpactBps: 300,
    minLiquidityUsd: 5000,
    minEvThreshold: 0.015, // Require strong edge (> 1.5%) to overcome gas/fees
    minConfidence: 0.55,
    kellyFraction: 0.20,
    maxPositionSizeCapPercent: 40.0,
    gasCostSensitivityMultiplier: 3.0
  },
  '10': {
    mode: '10',
    startingCapitalUsd: 10,
    maxTradeSizeUsd: 3.5,
    minTradeSizeUsd: 1.5,
    maxSimultaneousPositions: 2,
    maxDailyLossPercent: 12.0,
    maxPortfolioDrawdownPercent: 18.0,
    maxTokenExposurePercent: 40.0,
    maxStrategyExposurePercent: 50.0,
    maxChainExposurePercent: 100.0,
    maxSlippageBps: 200,
    maxPriceImpactBps: 250,
    minLiquidityUsd: 8000,
    minEvThreshold: 0.010,
    minConfidence: 0.52,
    kellyFraction: 0.20,
    maxPositionSizeCapPercent: 35.0,
    gasCostSensitivityMultiplier: 2.5
  },
  '50': {
    mode: '50',
    startingCapitalUsd: 50,
    maxTradeSizeUsd: 12.0,
    minTradeSizeUsd: 4.0,
    maxSimultaneousPositions: 3,
    maxDailyLossPercent: 10.0,
    maxPortfolioDrawdownPercent: 15.0,
    maxTokenExposurePercent: 25.0,
    maxStrategyExposurePercent: 45.0,
    maxChainExposurePercent: 80.0,
    maxSlippageBps: 150,
    maxPriceImpactBps: 180,
    minLiquidityUsd: 12000,
    minEvThreshold: 0.005,
    minConfidence: 0.50,
    kellyFraction: 0.25,
    maxPositionSizeCapPercent: 25.0,
    gasCostSensitivityMultiplier: 1.8
  },
  '100': {
    mode: '100',
    startingCapitalUsd: 100,
    maxTradeSizeUsd: 20.0,
    minTradeSizeUsd: 8.0,
    maxSimultaneousPositions: 4,
    maxDailyLossPercent: 8.0,
    maxPortfolioDrawdownPercent: 15.0,
    maxTokenExposurePercent: 20.0,
    maxStrategyExposurePercent: 40.0,
    maxChainExposurePercent: 70.0,
    maxSlippageBps: 120,
    maxPriceImpactBps: 150,
    minLiquidityUsd: 20000,
    minEvThreshold: 0.004,
    minConfidence: 0.50,
    kellyFraction: 0.25,
    maxPositionSizeCapPercent: 20.0,
    gasCostSensitivityMultiplier: 1.4
  },
  '500': {
    mode: '500',
    startingCapitalUsd: 500,
    maxTradeSizeUsd: 75.0,
    minTradeSizeUsd: 20.0,
    maxSimultaneousPositions: 5,
    maxDailyLossPercent: 6.0,
    maxPortfolioDrawdownPercent: 12.0,
    maxTokenExposurePercent: 15.0,
    maxStrategyExposurePercent: 35.0,
    maxChainExposurePercent: 60.0,
    maxSlippageBps: 100,
    maxPriceImpactBps: 120,
    minLiquidityUsd: 35000,
    minEvThreshold: 0.003,
    minConfidence: 0.50,
    kellyFraction: 0.25,
    maxPositionSizeCapPercent: 15.0,
    gasCostSensitivityMultiplier: 1.1
  },
  '1000': {
    mode: '1000',
    startingCapitalUsd: 1000,
    maxTradeSizeUsd: 150.0,
    minTradeSizeUsd: 30.0,
    maxSimultaneousPositions: 6,
    maxDailyLossPercent: 5.0,
    maxPortfolioDrawdownPercent: 10.0,
    maxTokenExposurePercent: 15.0,
    maxStrategyExposurePercent: 30.0,
    maxChainExposurePercent: 50.0,
    maxSlippageBps: 80,
    maxPriceImpactBps: 100,
    minLiquidityUsd: 50000,
    minEvThreshold: 0.002,
    minConfidence: 0.48,
    kellyFraction: 0.25,
    maxPositionSizeCapPercent: 15.0,
    gasCostSensitivityMultiplier: 1.0
  },
  '10000': {
    mode: '10000',
    startingCapitalUsd: 10000,
    maxTradeSizeUsd: 1000.0,
    minTradeSizeUsd: 100.0,
    maxSimultaneousPositions: 8,
    maxDailyLossPercent: 4.0,
    maxPortfolioDrawdownPercent: 8.0,
    maxTokenExposurePercent: 10.0,
    maxStrategyExposurePercent: 25.0,
    maxChainExposurePercent: 40.0,
    maxSlippageBps: 60,
    maxPriceImpactBps: 80,
    minLiquidityUsd: 100000,
    minEvThreshold: 0.002,
    minConfidence: 0.48,
    kellyFraction: 0.25,
    maxPositionSizeCapPercent: 10.0,
    gasCostSensitivityMultiplier: 1.0
  }
};

export class PositionSizer {
  /**
   * 1. Fixed Fractional Sizing:
   * Allocates a fixed fraction of total portfolio equity, clamped to capital mode caps.
   */
  public static calculateFixedFractional(
    equityUsd: number,
    fraction: number,
    config: CapitalModeConfig
  ): number {
    const rawSize = equityUsd * fraction;
    const capped = Math.min(config.maxTradeSizeUsd, rawSize);
    return Number(Math.max(0, capped).toFixed(2));
  }

  /**
   * 2. Volatility-Adjusted Sizing:
   * Scales position size inversely with realized volatility.
   * size = (equity * targetVolRisk) / (volatility * volScalar)
   */
  public static calculateVolatilityAdjusted(
    equityUsd: number,
    realizedVolatility: number,
    targetRiskPercent: number,
    config: CapitalModeConfig
  ): number {
    // Clamp realized volatility between 0.5% and 25% to prevent division by zero or extreme sizes
    const safeVol = Math.max(0.005, Math.min(0.25, realizedVolatility));
    const targetRiskDollar = equityUsd * (targetRiskPercent / 100);
    const rawSize = targetRiskDollar / safeVol;
    const capByPercent = equityUsd * (config.maxPositionSizeCapPercent / 100);
    const capped = Math.min(config.maxTradeSizeUsd, capByPercent, Math.max(0, rawSize));
    return Number(capped.toFixed(2));
  }

  /**
   * 3. Risk-Per-Trade Sizing:
   * Fixed dollar risk based on explicit Stop-Loss distance.
   * size = (equity * riskPercent) / (stopLossPercent / 100)
   */
  public static calculateRiskPerTrade(
    equityUsd: number,
    riskPercent: number,
    stopLossPercent: number,
    config: CapitalModeConfig
  ): number {
    const safeSl = Math.max(0.5, stopLossPercent) / 100;
    const riskAmountUsd = equityUsd * (riskPercent / 100);
    const rawSize = riskAmountUsd / safeSl;
    const capByPercent = equityUsd * (config.maxPositionSizeCapPercent / 100);
    const capped = Math.min(config.maxTradeSizeUsd, capByPercent, Math.max(0, rawSize));
    return Number(capped.toFixed(2));
  }

  /**
   * 4. Fractional Kelly Criterion Sizing (with safety cap):
   * Kelly Formula: f* = (p * b - q) / b
   * where:
   *   p = win probability
   *   q = 1 - p (loss probability)
   *   b = payoff ratio = reward / risk
   * f_fractional = k * max(0, f*)
   */
  public static calculateFractionalKelly(
    equityUsd: number,
    pWin: number,
    rewardPercent: number,
    riskPercent: number,
    config: CapitalModeConfig
  ): { sizeUsd: number; fullKellyFraction: number; fractionalKellyFraction: number } {
    const safeReward = Math.max(0.001, rewardPercent);
    const safeRisk = Math.max(0.001, riskPercent);
    const b = safeReward / safeRisk; // Payoff ratio
    const p = Math.max(0.0, Math.min(1.0, pWin));
    const q = 1.0 - p;

    const fullKelly = (p * b - q) / b;
    if (fullKelly <= 0) {
      return { sizeUsd: 0, fullKellyFraction: fullKelly, fractionalKellyFraction: 0 };
    }

    const k = config.kellyFraction; // e.g. 0.25 (Quarter-Kelly)
    const fractionalKelly = fullKelly * k;

    // Hard cap position size to configured maximum percentage
    const maxAllowedFraction = config.maxPositionSizeCapPercent / 100;
    const finalFraction = Math.min(fractionalKelly, maxAllowedFraction);

    const rawSize = equityUsd * finalFraction;
    const sizeUsd = Math.min(config.maxTradeSizeUsd, Math.max(0, rawSize));

    return {
      sizeUsd: Number(sizeUsd.toFixed(2)),
      fullKellyFraction: Number(fullKelly.toFixed(4)),
      fractionalKellyFraction: Number(fractionalKelly.toFixed(4))
    };
  }
}

export class CircuitBreakerEngine {
  /**
   * Evaluates all 8 circuit breakers and returns system operating state:
   * NORMAL -> CAUTION -> DEFENSIVE -> HALTED
   */
  public static evaluateBreakers(
    limitsConfig: RiskLimitsConfig,
    activeConfig: CapitalModeConfig,
    context?: {
      isStaleData?: boolean;
      isDbInconsistent?: boolean;
      isSecurityIncident?: boolean;
      isLiquidityShock?: boolean;
      isAbnormalSlippage?: boolean;
    }
  ): CircuitBreakerEvaluation {
    const activeBreakers: string[] = [];
    const reasons: string[] = [];

    let state: CircuitBreakerState = 'NORMAL';

    // 1. Database Inconsistency (Immediate Hard Halt)
    if (context?.isDbInconsistent) {
      state = 'HALTED';
      activeBreakers.push('DB_INCONSISTENCY');
      reasons.push('Database or ledger inconsistency detected. Trading halted.');
    }

    // 2. Security Incident (Immediate Hard Halt)
    if (context?.isSecurityIncident) {
      state = 'HALTED';
      activeBreakers.push('SECURITY_INCIDENT');
      reasons.push('On-chain security incident or exploit alert triggered.');
    }

    // 3. Stale Data (Halts new entries)
    if (context?.isStaleData) {
      if (state !== 'HALTED') state = 'HALTED';
      activeBreakers.push('STALE_DATA');
      reasons.push('Market data freshness is degraded or provider unresponsive.');
    }

    // 4. Daily Loss Breaker
    const dailyLossUsd = limitsConfig.realizedPnl24hUsd < 0 ? Math.abs(limitsConfig.realizedPnl24hUsd) : 0;
    const dailyLossPercent = limitsConfig.portfolioEquityUsd > 0
      ? (dailyLossUsd / limitsConfig.portfolioEquityUsd) * 100
      : 100;

    if (dailyLossPercent >= activeConfig.maxDailyLossPercent) {
      state = 'HALTED';
      activeBreakers.push('DAILY_LOSS_EXCEEDED');
      reasons.push(`Daily loss (${dailyLossPercent.toFixed(1)}%) reached maximum limit (${activeConfig.maxDailyLossPercent}%).`);
    } else if (dailyLossPercent >= activeConfig.maxDailyLossPercent * 0.70) {
      if (state !== 'HALTED') state = 'DEFENSIVE';
      activeBreakers.push('DAILY_LOSS_DEFENSIVE');
      reasons.push(`Daily loss (${dailyLossPercent.toFixed(1)}%) is approaching maximum limit.`);
    } else if (dailyLossPercent >= activeConfig.maxDailyLossPercent * 0.40) {
      if (state === 'NORMAL') state = 'CAUTION';
      activeBreakers.push('DAILY_LOSS_CAUTION');
      reasons.push(`Daily loss (${dailyLossPercent.toFixed(1)}%) entered caution zone.`);
    }

    // 5. Portfolio Drawdown Breaker (from High-Water Mark)
    const hwm = Math.max(limitsConfig.highWaterMarkUsd, limitsConfig.portfolioEquityUsd);
    const currentDrawdownUsd = hwm - limitsConfig.portfolioEquityUsd;
    const currentDrawdownPercent = hwm > 0 ? (currentDrawdownUsd / hwm) * 100 : 0;

    if (currentDrawdownPercent >= activeConfig.maxPortfolioDrawdownPercent) {
      state = 'HALTED';
      activeBreakers.push('DRAWDOWN_EXCEEDED');
      reasons.push(`Portfolio drawdown (${currentDrawdownPercent.toFixed(1)}%) hit max drawdown limit (${activeConfig.maxPortfolioDrawdownPercent}%).`);
    } else if (currentDrawdownPercent >= activeConfig.maxPortfolioDrawdownPercent * 0.75) {
      if (state !== 'HALTED') state = 'DEFENSIVE';
      activeBreakers.push('DRAWDOWN_DEFENSIVE');
      reasons.push(`Portfolio drawdown (${currentDrawdownPercent.toFixed(1)}%) is severe.`);
    } else if (currentDrawdownPercent >= activeConfig.maxPortfolioDrawdownPercent * 0.50) {
      if (state === 'NORMAL') state = 'CAUTION';
      activeBreakers.push('DRAWDOWN_CAUTION');
      reasons.push(`Portfolio drawdown (${currentDrawdownPercent.toFixed(1)}%) entered caution threshold.`);
    }

    // 6. Consecutive Losses & Cooldown Breaker
    const streak = limitsConfig.consecutiveLossStreak;
    const maxStreak = limitsConfig.maxLossStreakLimit;
    const cooldownMs = limitsConfig.cooldownMinutesAfterLossStreak * 60 * 1000;
    const now = Date.now();
    const lastLoss = limitsConfig.lastLossTimestamp ?? 0;
    const inCooldown = streak >= maxStreak && (now - lastLoss) < cooldownMs;

    if (inCooldown) {
      state = 'HALTED';
      activeBreakers.push('LOSS_STREAK_COOLDOWN');
      const remMin = Math.ceil((cooldownMs - (now - lastLoss)) / 60000);
      reasons.push(`Consecutive loss streak (${streak}) triggered active cooldown (${remMin}m remaining).`);
    } else if (streak >= maxStreak) {
      if (state !== 'HALTED') state = 'DEFENSIVE';
      activeBreakers.push('CONSECUTIVE_LOSS_STREAK');
      reasons.push(`Loss streak reached limit (${streak}/${maxStreak}).`);
    } else if (streak >= 2) {
      if (state === 'NORMAL') state = 'CAUTION';
      activeBreakers.push('CONSECUTIVE_LOSS_CAUTION');
      reasons.push(`Loss streak caution (${streak} losses).`);
    }

    // 7. Liquidity Shock Breaker
    if (context?.isLiquidityShock) {
      if (state !== 'HALTED') state = 'DEFENSIVE';
      activeBreakers.push('LIQUIDITY_SHOCK');
      reasons.push('Pool liquidity drop or drain event detected.');
    }

    // 8. Abnormal Slippage / Price Impact Breaker
    if (context?.isAbnormalSlippage) {
      if (state !== 'HALTED') state = 'DEFENSIVE';
      activeBreakers.push('ABNORMAL_SLIPPAGE');
      reasons.push('Market spread or slippage spikes exceed tolerance.');
    }

    const sizingMultiplier =
      state === 'NORMAL' ? 1.0 :
      state === 'CAUTION' ? 0.75 :
      state === 'DEFENSIVE' ? 0.50 : 0.0;

    return {
      state,
      activeBreakers,
      reasons,
      emergencyExitOnly: state === 'HALTED',
      canOpenNewPositions: state !== 'HALTED',
      sizingMultiplier
    };
  }
}

export class RiskEngine {
  constructor(private db?: BattleTradeDB) {}

  public getCapitalModeConfig(mode: CapitalMode, customOverrides?: Partial<CapitalModeConfig>): CapitalModeConfig {
    const base = CAPITAL_MODE_PRESETS[mode] || CAPITAL_MODE_PRESETS['100'];
    return { ...base, ...customOverrides };
  }

  /**
   * Main Risk Decision Pipeline:
   * Evaluates all limits, circuit breakers, liquidity depth, costs, and executes sizing.
   */
  public evaluateRisk(
    input: RiskCheckInput,
    limitsConfig: RiskLimitsConfig
  ): RiskDecision {
    const now = Date.now();
    const config = this.getCapitalModeConfig(limitsConfig.capitalMode, limitsConfig.customOverrides);
    const equity = limitsConfig.portfolioEquityUsd;
    const cash = limitsConfig.cashBalanceUsd;

    const reasons: string[] = [];
    const blockCodes: string[] = [];
    const warnings: string[] = [];

    // 1. Evaluate Circuit Breakers
    const breakerEval = CircuitBreakerEngine.evaluateBreakers(limitsConfig, config, {
      isStaleData: input.isStaleData,
      isDbInconsistent: input.isDbInconsistent,
      isSecurityIncident: input.isSecurityIncident,
      isLiquidityShock: input.isLiquidityShock,
      isAbnormalSlippage: input.isAbnormalSlippage
    });

    if (breakerEval.state === 'HALTED') {
      blockCodes.push(...breakerEval.activeBreakers);
      reasons.push(...breakerEval.reasons);
    } else if (breakerEval.state !== 'NORMAL') {
      warnings.push(...breakerEval.reasons);
    }

    // 2. Exposure & Portfolio Constraints
    const activePositions = limitsConfig.activePositions || [];
    const positionsCount = activePositions.length;

    if (positionsCount >= config.maxSimultaneousPositions) {
      blockCodes.push('MAX_POSITIONS_REACHED');
      reasons.push(`Max simultaneous positions limit reached (${positionsCount}/${config.maxSimultaneousPositions})`);
    }

    // Token Exposure
    const currentTokenExposureUsd = activePositions
      .filter(p => p.tokenAddress.toLowerCase() === input.tokenAddress.toLowerCase())
      .reduce((sum, p) => sum + p.sizeUsd, 0);
    const tokenExposurePct = equity > 0 ? (currentTokenExposureUsd / equity) * 100 : 0;

    // Strategy Exposure
    const currentStrategyExposureUsd = activePositions
      .filter(p => p.strategyName === input.strategyName)
      .reduce((sum, p) => sum + p.sizeUsd, 0);
    const strategyExposurePct = equity > 0 ? (currentStrategyExposureUsd / equity) * 100 : 0;

    // Chain Exposure
    const currentChainExposureUsd = activePositions
      .filter(p => p.chainId === input.chainId)
      .reduce((sum, p) => sum + p.sizeUsd, 0);
    const chainExposurePct = equity > 0 ? (currentChainExposureUsd / equity) * 100 : 0;

    // 3. Pool Liquidity & Security Constraints
    if (input.poolLiquidityUsd < config.minLiquidityUsd) {
      blockCodes.push('INSUFFICIENT_LIQUIDITY');
      reasons.push(`Pool liquidity ($${input.poolLiquidityUsd.toLocaleString()}) below minimum requirement ($${config.minLiquidityUsd.toLocaleString()})`);
    }

    if (input.estimatedPriceImpactBps > config.maxPriceImpactBps) {
      blockCodes.push('EXCESSIVE_PRICE_IMPACT');
      reasons.push(`Estimated price impact (${(input.estimatedPriceImpactBps / 100).toFixed(2)}%) exceeds limit (${(config.maxPriceImpactBps / 100).toFixed(2)}%)`);
    }

    if (input.securityScore < 70) {
      blockCodes.push('LOW_SECURITY_SCORE');
      reasons.push(`Security score (${input.securityScore}/100) below minimum trading threshold`);
    }

    // 4. Position Sizing Computation
    const sizingMethod = input.preferredSizingMethod || 'FRACTIONAL_KELLY';
    let rawSizeUsd = 0;

    let stopLossPct = input.stopLossPercent;
    let targetProfitPct = input.targetProfitPercent;

    if (!stopLossPct && input.metaSignal && input.currentPriceUsd > 0 && input.metaSignal.invalidation > 0) {
      stopLossPct = Math.max(0.5, ((input.currentPriceUsd - input.metaSignal.invalidation) / input.currentPriceUsd) * 100);
    }
    if (!targetProfitPct && input.metaSignal && input.currentPriceUsd > 0 && input.metaSignal.targetZone) {
      const avgTarget = (input.metaSignal.targetZone.minPrice + input.metaSignal.targetZone.maxPrice) / 2;
      targetProfitPct = Math.max(1.0, ((avgTarget - input.currentPriceUsd) / input.currentPriceUsd) * 100);
    }
    stopLossPct = stopLossPct || 2.5;
    targetProfitPct = targetProfitPct || 5.0;

    const pWin = input.mlPrediction?.calibrated_probability || 0.52;

    switch (sizingMethod) {
      case 'FIXED_FRACTIONAL':
        rawSizeUsd = PositionSizer.calculateFixedFractional(equity, 0.10, config);
        break;
      case 'VOLATILITY_ADJUSTED':
        rawSizeUsd = PositionSizer.calculateVolatilityAdjusted(equity, input.realizedVolatility, 1.5, config);
        break;
      case 'RISK_PER_TRADE':
        rawSizeUsd = PositionSizer.calculateRiskPerTrade(equity, 1.5, stopLossPct, config);
        break;
      case 'FRACTIONAL_KELLY':
      default: {
        const kellyRes = PositionSizer.calculateFractionalKelly(equity, pWin, targetProfitPct, stopLossPct, config);
        rawSizeUsd = kellyRes.sizeUsd;
        break;
      }
    }

    // Apply circuit breaker sizing multiplier
    let finalSizeUsd = rawSizeUsd * breakerEval.sizingMultiplier;

    // Constrain by liquidity depth: size cannot exceed 2% of pool liquidity
    const maxPoolSize = input.poolLiquidityUsd * 0.02;
    if (finalSizeUsd > maxPoolSize) {
      finalSizeUsd = maxPoolSize;
      warnings.push(`Position size reduced to 2% of pool liquidity ($${maxPoolSize.toFixed(2)})`);
    }

    // Constrain by token exposure limit
    const maxTokenExposureDollar = equity * (config.maxTokenExposurePercent / 100);
    const availableTokenAllowance = Math.max(0, maxTokenExposureDollar - currentTokenExposureUsd);
    if (finalSizeUsd > availableTokenAllowance) {
      finalSizeUsd = availableTokenAllowance;
      warnings.push(`Position size capped by token exposure limit (${config.maxTokenExposurePercent}%)`);
    }

    // Constrain by strategy exposure limit
    const maxStrategyExposureDollar = equity * (config.maxStrategyExposurePercent / 100);
    const availableStrategyAllowance = Math.max(0, maxStrategyExposureDollar - currentStrategyExposureUsd);
    if (finalSizeUsd > availableStrategyAllowance) {
      finalSizeUsd = availableStrategyAllowance;
      warnings.push(`Position size capped by strategy exposure limit (${config.maxStrategyExposurePercent}%)`);
    }

    // Constrain by available cash
    if (finalSizeUsd > cash) {
      finalSizeUsd = Math.max(0, cash * 0.95);
      warnings.push(`Position size constrained by available cash ($${cash.toFixed(2)})`);
    }

    // 5. CRITICAL CHECK FOR SMALL CAPITAL: Does Cost Destroy Edge?
    // EV = P(win) * reward - P(loss) * loss - fees - slippage - gas - price_impact - latency
    const estimatedGas = input.estimatedGasCostUsd || 0.05;
    const gasBps = finalSizeUsd > 0 ? (estimatedGas / finalSizeUsd) * 10000 : 1000;
    const totalCostBps = input.roundTripEstimatedCostBps + gasBps;
    const totalCostPercent = totalCostBps / 100;

    const expectedReturnPercent = (pWin * targetProfitPct) - ((1 - pWin) * stopLossPct);
    const netEvPercent = expectedReturnPercent - totalCostPercent;

    if (finalSizeUsd > 0 && netEvPercent < (config.minEvThreshold * 100)) {
      blockCodes.push('COST_CRUSHES_EDGE');
      reasons.push(`Fees, slippage, and gas ($${(totalCostPercent * finalSizeUsd / 100).toFixed(2)}) consume statistical edge on small trade size ($${finalSizeUsd.toFixed(2)})`);
      finalSizeUsd = 0;
    }

    if (finalSizeUsd < config.minTradeSizeUsd && finalSizeUsd > 0) {
      blockCodes.push('BELOW_MIN_SIZE');
      reasons.push(`Calculated size ($${finalSizeUsd.toFixed(2)}) is below minimum trade threshold ($${config.minTradeSizeUsd})`);
      finalSizeUsd = 0;
    }

    const isAllowed = blockCodes.length === 0 && finalSizeUsd > 0 && breakerEval.canOpenNewPositions;

    // Target and stop calculations
    const hardStopPrice = input.currentPriceUsd * (1 - stopLossPct / 100);
    const takeProfitPrice = input.currentPriceUsd * (1 + targetProfitPct / 100);
    const recommendedTokens = input.currentPriceUsd > 0 ? finalSizeUsd / input.currentPriceUsd : 0;

    // Daily loss and drawdown metrics
    const dailyLossUsd = limitsConfig.realizedPnl24hUsd < 0 ? Math.abs(limitsConfig.realizedPnl24hUsd) : 0;
    const dailyLossPercent = equity > 0 ? (dailyLossUsd / equity) * 100 : 0;
    const hwm = Math.max(limitsConfig.highWaterMarkUsd, equity);
    const currentDrawdownPercent = hwm > 0 ? ((hwm - equity) / hwm) * 100 : 0;

    const cooldownRemainingSec = limitsConfig.lastLossTimestamp && limitsConfig.consecutiveLossStreak >= limitsConfig.maxLossStreakLimit
      ? Math.max(0, Math.ceil(((limitsConfig.lastLossTimestamp + limitsConfig.cooldownMinutesAfterLossStreak * 60000) - now) / 1000))
      : 0;

    const limitsSnapshot: LimitsConsumedSnapshot = {
      dailyLossUsd: Number(dailyLossUsd.toFixed(2)),
      dailyLossPercent: Number(dailyLossPercent.toFixed(2)),
      dailyLossLimitPercent: config.maxDailyLossPercent,
      currentDrawdownPercent: Number(currentDrawdownPercent.toFixed(2)),
      maxDrawdownLimitPercent: config.maxPortfolioDrawdownPercent,
      activePositionsCount: positionsCount,
      maxSimultaneousPositionsLimit: config.maxSimultaneousPositions,
      tokenExposurePercent: Number(tokenExposurePct.toFixed(1)),
      maxTokenExposureLimitPercent: config.maxTokenExposurePercent,
      strategyExposurePercent: Number(strategyExposurePct.toFixed(1)),
      maxStrategyExposureLimitPercent: config.maxStrategyExposurePercent,
      chainExposurePercent: Number(chainExposurePct.toFixed(1)),
      maxChainExposureLimitPercent: config.maxChainExposurePercent,
      consecutiveLossStreak: limitsConfig.consecutiveLossStreak,
      maxLossStreakLimit: limitsConfig.maxLossStreakLimit,
      cooldownRemainingSec
    };

    return {
      allowed: isAllowed,
      circuitBreakerState: breakerEval.state,
      recommendedSizeUsd: Number(finalSizeUsd.toFixed(2)),
      recommendedSizeTokens: Number(recommendedTokens.toFixed(4)),
      sizingMethodUsed: sizingMethod,
      reasons: isAllowed ? ['Risk checks passed successfully'] : reasons,
      blockCodes,
      warnings,
      limitsConsumed: limitsSnapshot,
      executionConstraints: {
        maxSlippageBps: config.maxSlippageBps,
        maxPriceImpactBps: config.maxPriceImpactBps,
        hardStopPriceUsd: Number(hardStopPrice.toFixed(6)),
        takeProfitPriceUsd: Number(takeProfitPrice.toFixed(6)),
        stopLossPercent: stopLossPct,
        takeProfitPercent: targetProfitPct
      },
      capitalMode: limitsConfig.capitalMode,
      timestamp: now
    };
  }

  // Legacy API wrapper to ensure zero regressions in database/portfolio modules
  validateHardCaps(config: SystemConfig, pendingTradeSizeUsd: number): { passed: boolean; reason?: string } {
    const isSim = config.simulationMode;
    if (!isSim) {
      return { passed: false, reason: 'Live trading is locked. Only Paper/Simulation mode is allowed.' };
    }

    if (!this.db) {
      return { passed: true };
    }

    const balanceId = isSim ? 'SIM_USD' : 'LIVE_USD';
    const balance = this.db.getBalance(balanceId);
    const activePositions = this.db.getPositions({ is_simulation: isSim ? 1 : 0 });
    const currentExposure = activePositions.reduce((sum, pos) => sum + pos.size_usd, 0);

    if (currentExposure + pendingTradeSizeUsd > config.maxDailyExposureUsd) {
      return {
        passed: false,
        reason: `Daily exposure cap reached ($${currentExposure.toFixed(2)} + $${pendingTradeSizeUsd.toFixed(2)} > Max $${config.maxDailyExposureUsd.toFixed(2)})`
      };
    }

    if (pendingTradeSizeUsd > config.maxTradeSizeUsd) {
      return {
        passed: false,
        reason: `Trade size $${pendingTradeSizeUsd.toFixed(2)} exceeds Max configured $${config.maxTradeSizeUsd.toFixed(2)}`
      };
    }

    if (balance.amount < pendingTradeSizeUsd) {
      return {
        passed: false,
        reason: `Insufficient balance ($${balance.amount.toFixed(2)} available, $${pendingTradeSizeUsd.toFixed(2)} requested)`
      };
    }

    return { passed: true };
  }

  calculateDynamicSize(
    capital: number,
    decision: MultiLayerDecision,
    streak: number,
    config: SystemConfig
  ): number {
    let riskPercent = config.minRiskPercentPerTrade;
    if (decision.conviction === 'VERY_HIGH') riskPercent = config.maxRiskPercentPerTrade;
    else if (decision.conviction === 'HIGH') riskPercent = (config.maxRiskPercentPerTrade + config.minRiskPercentPerTrade) / 2;
    else if (decision.conviction === 'MEDIUM') riskPercent = config.minRiskPercentPerTrade * 1.5;

    let streakMultiplier = 1.0;
    if (streak >= 3) {
      streakMultiplier = 1.35;
    } else if (streak <= -2) {
      streakMultiplier = 0.5;
    }

    riskPercent = Math.min(config.maxRiskPercentPerTrade, Math.max(config.minRiskPercentPerTrade, riskPercent * streakMultiplier));
    const calculatedSize = capital * (riskPercent / 100);

    return Math.min(config.maxTradeSizeUsd, Math.max(5.0, calculatedSize));
  }
}

function expectedReturnReturn(grossPercent: number, costPercent: number): number {
  return grossPercent - costPercent;
}

// Portfolio Engine: Tracks positions, partial principal recovery, and historical trades
export class PortfolioEngine {
  constructor(private db: BattleTradeDB) {}

  openPosition(
    token: MarketData,
    decision: MultiLayerDecision,
    sizeUsd: number,
    tokensAmount: number,
    buyPriceUsd: number,
    isSimulation: boolean
  ): ActivePosition {
    const balanceId = isSimulation ? 'SIM_USD' : 'LIVE_USD';
    const balance = this.db.getBalance(balanceId);

    this.db.updateBalance(balanceId, balance.amount - sizeUsd, balance.allocated_to_trades + sizeUsd);

    const position: ActivePosition = {
      id: `pos_${Date.now()}_${token.address.slice(2, 6)}`,
      tokenAddress: token.address,
      chainId: token.chainId,
      name: token.name,
      symbol: token.symbol,
      buyPriceUsd,
      currentPriceUsd: buyPriceUsd,
      sizeUsd,
      amountTokens: tokensAmount,
      buyTimestamp: Date.now(),
      lastUpdateTimestamp: Date.now(),
      highestPriceUsd: buyPriceUsd,
      isPrincipalRecovered: false,
      targetTakeProfitPercent: decision.targetTakeProfitPercent,
      stopLossPercent: decision.stopLossPercent,
      trailingStopPercent: decision.trailingStopPercent,
      isSimulation,
      pnlUsd: 0,
      pnlPercent: 0,
      regimeAtEntry: decision.layer3Macro.macroClimate === 'RISK_ON' ? 'RISK_ON' : 'RISK_OFF',
      setupPattern: decision.layer4Learning.patternType,
      scoresAtEntry: {
        secScore: decision.layer1Security.score,
        momScore: decision.layer2Momentum.score,
        macroScore: decision.layer3Macro.score,
        patternScore: decision.layer4Learning.score
      }
    };

    this.db.savePosition({
      id: position.id,
      token_address: position.tokenAddress,
      chain_id: position.chainId,
      name: position.name,
      symbol: position.symbol,
      buy_price_usd: position.buyPriceUsd,
      current_price_usd: position.currentPriceUsd,
      size_usd: position.sizeUsd,
      amount_tokens: position.amountTokens,
      buy_timestamp: position.buyTimestamp,
      last_update_timestamp: position.lastUpdateTimestamp,
      highest_price_usd: position.highestPriceUsd,
      is_principal_recovered: 0,
      target_take_profit_percent: position.targetTakeProfitPercent,
      stop_loss_percent: position.stopLossPercent,
      trailing_stop_percent: position.trailingStopPercent,
      is_simulation: position.isSimulation ? 1 : 0,
      pnl_usd: position.pnlUsd,
      pnl_percent: position.pnlPercent,
      regime_at_entry: position.regimeAtEntry || 'CHOPPY',
      setup_pattern: position.setupPattern || 'VELOCITY_BREAKOUT'
    });

    this.db.addAuditEvent('SYSTEM_EXECUTOR', 'OPEN_POSITION', undefined, `Posición abierta para ${token.symbol} a $${buyPriceUsd}`);

    return position;
  }

  updateAndCheckExit(
    position: ActivePosition,
    latestPriceUsd: number
  ): { exit: boolean; reason?: HistoricalTrade['exitReason']; principalRecovered: boolean } {
    let exit = false;
    let reason: HistoricalTrade['exitReason'] | undefined = undefined;
    let principalRecovered = position.isPrincipalRecovered;

    const pnlPercent = ((latestPriceUsd - position.buyPriceUsd) / position.buyPriceUsd) * 100;
    const highestPriceUsd = Math.max(position.highestPriceUsd, latestPriceUsd);
    const dropFromPeakPercent = ((highestPriceUsd - latestPriceUsd) / highestPriceUsd) * 100;

    if (pnlPercent >= 100 && !position.isPrincipalRecovered) {
      principalRecovered = true;
      this.db.addAuditEvent('SYSTEM_EXECUTOR', 'PARTIAL_TAKE_PROFIT', undefined, `Recuperado 50% capital en ${position.symbol} por alcanzar +100% de rentabilidad.`);
    }

    if (pnlPercent >= position.targetTakeProfitPercent) {
      exit = true;
      reason = 'TAKE_PROFIT';
    } else if (pnlPercent >= 5.0 && dropFromPeakPercent >= position.trailingStopPercent) {
      exit = true;
      reason = 'TRAILING_STOP';
    } else if (pnlPercent <= -position.stopLossPercent) {
      exit = true;
      reason = 'STOP_LOSS';
    }

    const dbPos = this.db.getPosition(position.id);
    if (dbPos) {
      this.db.savePosition({
        ...dbPos,
        current_price_usd: latestPriceUsd,
        highest_price_usd: highestPriceUsd,
        is_principal_recovered: principalRecovered ? 1 : 0,
        pnl_usd: (latestPriceUsd - position.buyPriceUsd) * position.amountTokens,
        pnl_percent: pnlPercent,
        last_update_timestamp: Date.now()
      });
    }

    return { exit, reason, principalRecovered };
  }

  closePosition(
    position: ActivePosition,
    sellPriceUsd: number,
    reason: HistoricalTrade['exitReason']
  ): HistoricalTrade {
    const balanceId = position.isSimulation ? 'SIM_USD' : 'LIVE_USD';
    const balance = this.db.getBalance(balanceId);

    let finalAmountTokens = position.amountTokens;
    let finalSizeUsd = position.sizeUsd;

    if (position.isPrincipalRecovered) {
      finalAmountTokens = position.amountTokens / 2;
      finalSizeUsd = position.sizeUsd / 2;
    }

    const revenue = finalAmountTokens * sellPriceUsd;
    const pnlUsd = revenue - finalSizeUsd;
    const pnlPercent = ((sellPriceUsd - position.buyPriceUsd) / position.buyPriceUsd) * 100;

    const returnedCash = position.isPrincipalRecovered ? (revenue + position.sizeUsd) : revenue;
    const newAllocated = Math.max(0, balance.allocated_to_trades - position.sizeUsd);
    this.db.updateBalance(balanceId, balance.amount + returnedCash, newAllocated);

    this.db.deletePosition(position.id);

    const trade: HistoricalTrade = {
      id: position.id,
      tokenAddress: position.tokenAddress,
      chainId: position.chainId,
      name: position.name,
      symbol: position.symbol,
      buyPriceUsd: position.buyPriceUsd,
      sellPriceUsd,
      sizeUsd: position.sizeUsd,
      buyTimestamp: position.buyTimestamp,
      sellTimestamp: Date.now(),
      pnlUsd,
      pnlPercent,
      exitReason: reason,
      isSimulation: position.isSimulation,
      regimeAtEntry: position.regimeAtEntry,
      setupPattern: position.setupPattern,
      scoresAtEntry: position.scoresAtEntry
    };

    this.db.addAuditEvent('SYSTEM_EXECUTOR', 'CLOSE_POSITION', undefined, `Posición cerrada para ${position.symbol} via ${reason} con PnL: $${pnlUsd.toFixed(2)} (${pnlPercent.toFixed(1)}%)`);
    this.db.saveHistoricalTrade(trade);

    return trade;
  }
}
