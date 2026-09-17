/**
 * Battle Trade - Professional Paper Execution Engine, AMM Math & Portfolio Management.
 * 
 * Features:
 * - Realistic AMM Constant Product ($x \cdot y = k$) Price Impact & Swap Math
 * - Non-random latency, dynamic slippage, DEX swap fees & on-chain gas simulation
 * - Partial fills for orders exceeding instantaneous pool depth + residual timeout
 * - Intrabar High/Low Stop-Loss and Take-Profit evaluation
 * - Full TrackedPosition lifecycle: thesis, strategy, signal, regime, VWAP, fees,
 *   staged targets, dynamic trailing stop, MFE, MAE, time in trade, horizon, invalidations
 * - 10-Rule Comprehensive Exit Engine (hard stop, ATR stop, thesis invalidation,
 *   security/liquidity deterioration, signal reversal, partial TPs, adaptive trailing,
 *   time stop, regime exit, emergency exit)
 * - Adaptive TP/SL engine guided by ATR, volatility, liquidity depth, EV, and confidence
 * - Mark-to-market valuation with freshness verification (> 60s stale check)
 * - Safe restart recovery from persistent database
 * - Double-entry balanced ledger tracking
 * - LiveExecutionAdapter physically blocked by default
 */

import { ChainId, MarketRegime } from '../../shared/types';
import { BattleTradeDB } from './database';
import {
  AMMQuote,
  PaperExecutionOrder,
  PaperExecutionResult,
  IntrabarCandle,
  TrackedPosition,
  StagedTarget,
  ExitRuleType,
  ExitTrigger,
  AdaptiveTPSLParams,
  AdaptiveTPSLResult,
  ILiveExecutionAdapter
} from '../types/execution';

export class AMMExecutionModel {
  /**
   * Calculates realistic Constant Product AMM ($x \cdot y = k$) quote,
   * price impact, swap fees, and partial fill capacity.
   */
  public static quoteSwap(
    inputAmountUsd: number,
    poolLiquidityUsd: number,
    spotPriceUsd: number,
    chainId: ChainId,
    dexFeeRate = 0.003 // 0.30% typical Uniswap/PancakeSwap fee
  ): AMMQuote {
    const safeLiquidity = Math.max(1000, poolLiquidityUsd);
    const safeSpotPrice = Math.max(0.000001, spotPriceUsd);

    // Constant Product AMM Pool Reserves:
    // In a 50/50 pool: Quote Reserve Rx = Liquidity / 2
    const poolReserveQuoteUsd = safeLiquidity / 2;
    // Base Reserve Ry = Rx / SpotPrice
    const poolReserveBaseTokens = poolReserveQuoteUsd / safeSpotPrice;

    // Depth limit: Maximum safe instantaneous volume per block is 2.5% of pool depth
    const maxSafeSizeUsd = safeLiquidity * 0.025;
    const isPartialFill = inputAmountUsd > maxSafeSizeUsd;
    const filledSizeUsd = isPartialFill ? maxSafeSizeUsd : inputAmountUsd;
    const residualSizeUsd = isPartialFill ? (inputAmountUsd - maxSafeSizeUsd) : 0;

    // Fee calculation on filled portion
    const dexFeeUsd = filledSizeUsd * dexFeeRate;
    const netInputUsd = filledSizeUsd - dexFeeUsd;

    // Constant Product formula for tokens out:
    // delta_y = (Ry * delta_x_net) / (Rx + delta_x_net)
    const tokensOut = (poolReserveBaseTokens * netInputUsd) / (poolReserveQuoteUsd + netInputUsd);

    // Effective execution price
    const effectivePriceUsd = tokensOut > 0 ? (filledSizeUsd / tokensOut) : safeSpotPrice;

    // Exact price impact relative to spot price
    const priceImpactPercent = ((effectivePriceUsd - safeSpotPrice) / safeSpotPrice) * 100;
    const priceImpactBps = Math.max(0, Math.round(priceImpactPercent * 100));

    // Gas estimation by chain
    const gasFeeUsd = chainId === ChainId.BASE ? 0.015 : 0.08; // Base L2 vs BSC

    return {
      inputAmountUsd,
      poolLiquidityUsd: safeLiquidity,
      poolReserveQuoteUsd: Number(poolReserveQuoteUsd.toFixed(2)),
      poolReserveBaseTokens: Number(poolReserveBaseTokens.toFixed(4)),
      spotPriceUsd: safeSpotPrice,
      effectivePriceUsd: Number(effectivePriceUsd.toFixed(8)),
      priceImpactBps,
      priceImpactPercent: Number(priceImpactPercent.toFixed(4)),
      tokensOut: Number(tokensOut.toFixed(6)),
      dexFeeUsd: Number(dexFeeUsd.toFixed(4)),
      gasFeeUsd,
      maxSafeSizeUsd: Number(maxSafeSizeUsd.toFixed(2)),
      isPartialFill,
      filledSizeUsd: Number(filledSizeUsd.toFixed(2)),
      residualSizeUsd: Number(residualSizeUsd.toFixed(2))
    };
  }
}

export class PaperExecutionEngine {
  /**
   * Realistic execution of trading orders using AMM mechanics,
   * non-random network latency, and market slippage.
   */
  public static executeOrder(order: PaperExecutionOrder): PaperExecutionResult {
    const now = Date.now();

    // 1. Timeout Check
    if (order.deadlineTimestamp && now > order.deadlineTimestamp) {
      return {
        orderId: order.orderId,
        positionId: order.positionId,
        status: 'EXPIRED',
        observedPriceUsd: order.observedPriceUsd,
        executionPriceUsd: order.observedPriceUsd,
        filledSizeUsd: 0,
        filledTokens: 0,
        residualSizeUsd: order.requestedSizeUsd,
        priceImpactBps: 0,
        slippageBps: 0,
        dexFeeUsd: 0,
        gasFeeUsd: 0,
        totalCostUsd: 0,
        decisionTimestamp: order.decisionTimestamp,
        executionTimestamp: now,
        executionLatencyMs: now - order.decisionTimestamp,
        rejectionReason: 'Order deadline expired before execution'
      };
    }

    // 2. Realistic Simulated Latency (Base ~80ms, BSC ~200ms)
    const baseLatency = order.chainId === ChainId.BASE ? 80 : 200;
    const jitter = Math.floor((order.requestedSizeUsd % 20) * 3); // Deterministic pseudo-jitter
    const executionLatencyMs = baseLatency + jitter;
    const executionTimestamp = order.decisionTimestamp + executionLatencyMs;

    // 3. AMM Swap Math
    const ammQuote = AMMExecutionModel.quoteSwap(
      order.requestedSizeUsd,
      order.poolLiquidityUsd,
      order.observedPriceUsd,
      order.chainId
    );

    // 4. Volatility-derived dynamic slippage
    const vol = order.realizedVolatility || 0.03;
    const dynamicSlippageBps = Math.round(vol * 500); // e.g. 3% vol -> 15 bps slippage
    const totalSlippageBps = ammQuote.priceImpactBps + dynamicSlippageBps;

    // 5. Slippage Tolerance Guard
    if (totalSlippageBps > order.maxSlippageBps) {
      return {
        orderId: order.orderId,
        positionId: order.positionId,
        status: 'REJECTED',
        observedPriceUsd: order.observedPriceUsd,
        executionPriceUsd: order.observedPriceUsd,
        filledSizeUsd: 0,
        filledTokens: 0,
        residualSizeUsd: order.requestedSizeUsd,
        priceImpactBps: ammQuote.priceImpactBps,
        slippageBps: totalSlippageBps,
        dexFeeUsd: 0,
        gasFeeUsd: 0,
        totalCostUsd: 0,
        decisionTimestamp: order.decisionTimestamp,
        executionTimestamp,
        executionLatencyMs,
        rejectionReason: `Total slippage + price impact (${totalSlippageBps} bps) exceeded limit (${order.maxSlippageBps} bps)`
      };
    }

    // 6. Execution Price with Slippage & Impact
    const slippageMultiplier = order.side === 'BUY'
      ? (1 + totalSlippageBps / 10000)
      : (1 - totalSlippageBps / 10000);

    const executionPriceUsd = Number((order.observedPriceUsd * slippageMultiplier).toFixed(8));
    const filledTokens = executionPriceUsd > 0
      ? Number((ammQuote.filledSizeUsd / executionPriceUsd).toFixed(6))
      : 0;

    const totalCostUsd = Number((ammQuote.dexFeeUsd + ammQuote.gasFeeUsd).toFixed(4));
    const status = ammQuote.isPartialFill ? 'PARTIALLY_FILLED' : 'FILLED';

    return {
      orderId: order.orderId,
      positionId: order.positionId,
      status,
      observedPriceUsd: order.observedPriceUsd,
      executionPriceUsd,
      filledSizeUsd: ammQuote.filledSizeUsd,
      filledTokens,
      residualSizeUsd: ammQuote.residualSizeUsd,
      priceImpactBps: ammQuote.priceImpactBps,
      slippageBps: totalSlippageBps,
      dexFeeUsd: ammQuote.dexFeeUsd,
      gasFeeUsd: ammQuote.gasFeeUsd,
      totalCostUsd,
      decisionTimestamp: order.decisionTimestamp,
      executionTimestamp,
      executionLatencyMs
    };
  }
}

export class IntrabarEvaluator {
  /**
   * Checks whether Stop Loss or Take Profit occurred intrabar (High/Low)
   * within a given candle.
   */
  public static evaluateIntrabar(
    candle: IntrabarCandle,
    stopLossPriceUsd: number,
    takeProfitPriceUsd: number
  ): {
    hitStop: boolean;
    hitTarget: boolean;
    stopFillPriceUsd: number;
    targetFillPriceUsd: number;
    firstHit: 'STOP' | 'TARGET' | 'NONE';
  } {
    const hitStop = candle.low <= stopLossPriceUsd;
    const hitTarget = candle.high >= takeProfitPriceUsd;

    // Conservative gap fill handling: if open gapped past level, fill at open; otherwise fill at exact level
    const stopFillPriceUsd = candle.open < stopLossPriceUsd ? candle.open : stopLossPriceUsd;
    const targetFillPriceUsd = candle.open > takeProfitPriceUsd ? candle.open : takeProfitPriceUsd;

    let firstHit: 'STOP' | 'TARGET' | 'NONE' = 'NONE';

    if (hitStop && hitTarget) {
      // If both were hit within the same candle wick, check candle opening bias:
      // If candle opened closer to low, evaluate stop first (risk-first conservative principle)
      const distToLow = Math.abs(candle.open - candle.low);
      const distToHigh = Math.abs(candle.open - candle.high);
      firstHit = distToLow <= distToHigh ? 'STOP' : 'TARGET';
    } else if (hitStop) {
      firstHit = 'STOP';
    } else if (hitTarget) {
      firstHit = 'TARGET';
    }

    return {
      hitStop,
      hitTarget,
      stopFillPriceUsd: Number(stopFillPriceUsd.toFixed(8)),
      targetFillPriceUsd: Number(targetFillPriceUsd.toFixed(8)),
      firstHit
    };
  }
}

export class AdaptiveTPSLEngine {
  /**
   * Computes dynamic TP/SL levels tailored to ATR, realized volatility,
   * pool liquidity, EV and signal confidence.
   */
  public static computeLevels(params: AdaptiveTPSLParams): AdaptiveTPSLResult {
    const {
      atrPercent,
      realizedVolatility,
      poolLiquidityUsd,
      netEvPercent,
      signalConfidence,
      currentPriceUsd,
      regime
    } = params;

    // Baseline Volatility Metric
    const vol = Math.max(0.01, realizedVolatility);
    const atr = atrPercent ? (atrPercent / 100) : vol;

    // 1. Adaptive Stop Loss
    // Base stop: 1.5x ATR/Vol
    let slMultiplier = 1.5;
    if (regime === 'HIGH_VOL' || regime === 'MEME_EUPHORIA') {
      slMultiplier = 2.0; // Wider stops in wild regimes to avoid shakeouts
    } else if (regime === 'LOW_VOL' || regime === 'RANGE') {
      slMultiplier = 1.2; // Tighter stops in low volatility
    }

    let rawSlPercent = Math.max(1.5, Math.min(10.0, atr * slMultiplier * 100));

    // High confidence & high EV allow tighter precision
    if (signalConfidence > 0.70 && netEvPercent > 1.0) {
      rawSlPercent = Math.max(1.2, rawSlPercent * 0.85);
    }

    // 2. Adaptive Take Profit
    // Maintain minimum 2.0 Risk/Reward ratio
    const minRewardRatio = 2.0;
    let rawTpPercent = rawSlPercent * minRewardRatio;

    if (regime === 'TREND_UP' || regime === 'MEME_EUPHORIA') {
      rawTpPercent = Math.max(rawTpPercent, rawSlPercent * 2.8); // Let winners run in trends
    }

    const recommendedStopLossPercent = Number(rawSlPercent.toFixed(2));
    const recommendedTakeProfitPercent = Number(rawTpPercent.toFixed(2));

    const hardStopPriceUsd = Number((currentPriceUsd * (1 - recommendedStopLossPercent / 100)).toFixed(8));
    const takeProfitPriceUsd = Number((currentPriceUsd * (1 + recommendedTakeProfitPercent / 100)).toFixed(8));

    // 3. Staged Targets (TP1: 33%, TP2: 33%, TP3: 34%)
    const tp1Percent = Number((recommendedTakeProfitPercent * 0.50).toFixed(2));
    const tp2Percent = Number((recommendedTakeProfitPercent * 0.85).toFixed(2));
    const tp3Percent = recommendedTakeProfitPercent;

    const stagedTargets: StagedTarget[] = [
      {
        level: 1,
        targetPercent: tp1Percent,
        targetPriceUsd: Number((currentPriceUsd * (1 + tp1Percent / 100)).toFixed(8)),
        portionToExit: 0.33,
        isHit: false
      },
      {
        level: 2,
        targetPercent: tp2Percent,
        targetPriceUsd: Number((currentPriceUsd * (1 + tp2Percent / 100)).toFixed(8)),
        portionToExit: 0.33,
        isHit: false
      },
      {
        level: 3,
        targetPercent: tp3Percent,
        targetPriceUsd: Number((currentPriceUsd * (1 + tp3Percent / 100)).toFixed(8)),
        portionToExit: 0.34,
        isHit: false
      }
    ];

    // Trailing Stop parameters
    const trailingActivationPercent = Number((tp1Percent * 0.80).toFixed(2));
    const trailingDistancePercent = Number((recommendedStopLossPercent * 0.70).toFixed(2));

    const rationale = `SL ${recommendedStopLossPercent}% (x${slMultiplier} ATR/Vol) / TP ${recommendedTakeProfitPercent}% (RR ${(recommendedTakeProfitPercent / recommendedStopLossPercent).toFixed(1)}x) for ${regime}`;

    return {
      recommendedStopLossPercent,
      recommendedTakeProfitPercent,
      hardStopPriceUsd,
      takeProfitPriceUsd,
      trailingActivationPercent,
      trailingDistancePercent,
      stagedTargets,
      rationale
    };
  }
}

export class ExitEngine {
  /**
   * Evaluates the full 10-rule exit hierarchy for an active position:
   * 1. EMERGENCY_EXIT
   * 2. HARD_STOP
   * 3. VOLATILITY_ATR_STOP
   * 4. LIQUIDITY_SECURITY_DETERIORATION
   * 5. THESIS_INVALIDATION
   * 6. SIGNAL_REVERSAL
   * 7. ADAPTIVE_TRAILING_STOP
   * 8. PARTIAL_TAKE_PROFIT
   * 9. TIME_STOP
   * 10. REGIME_EXIT
   */
  public static evaluateExit(
    position: TrackedPosition,
    marketData: {
      currentPriceUsd: number;
      candle?: IntrabarCandle;
      securityScore?: number;
      poolLiquidityUsd?: number;
      currentRegime?: MarketRegime;
      realizedVolatility?: number;
      signalDirection?: 'LONG' | 'SHORT' | 'FLAT';
      isEmergencyStop?: boolean;
    }
  ): ExitTrigger {
    const {
      currentPriceUsd,
      candle,
      securityScore,
      poolLiquidityUsd,
      currentRegime,
      realizedVolatility,
      signalDirection,
      isEmergencyStop
    } = marketData;

    // 1. Emergency Exit Rule
    if (isEmergencyStop) {
      return {
        rule: 'EMERGENCY_EXIT',
        shouldExit: true,
        exitType: 'FULL',
        portion: 1.0,
        triggerPriceUsd: currentPriceUsd,
        reason: 'Circuit breaker HALTED or explicit emergency stop received'
      };
    }

    // 2. Intrabar or Spot Hard Stop
    if (candle) {
      const intrabar = IntrabarEvaluator.evaluateIntrabar(
        candle,
        position.stop.stopLossPriceUsd,
        position.targets[position.targets.length - 1]?.targetPriceUsd || (currentPriceUsd * 2)
      );

      if (intrabar.hitStop) {
        return {
          rule: 'HARD_STOP',
          shouldExit: true,
          exitType: 'FULL',
          portion: 1.0,
          triggerPriceUsd: intrabar.stopFillPriceUsd,
          reason: `Intrabar low ($${candle.low.toFixed(6)}) breached hard stop ($${position.stop.stopLossPriceUsd.toFixed(6)})`,
          hitIntrabar: true
        };
      }
    } else if (currentPriceUsd <= position.stop.stopLossPriceUsd) {
      return {
        rule: 'HARD_STOP',
        shouldExit: true,
        exitType: 'FULL',
        portion: 1.0,
        triggerPriceUsd: currentPriceUsd,
        reason: `Current price ($${currentPriceUsd.toFixed(6)}) breached hard stop ($${position.stop.stopLossPriceUsd.toFixed(6)})`
      };
    }

    // 3. Volatility / ATR Stop (Sudden explosion of adverse volatility)
    if (realizedVolatility && realizedVolatility > 0.15 && position.unrealizedPnlPercent < -2.0) {
      return {
        rule: 'VOLATILITY_ATR_STOP',
        shouldExit: true,
        exitType: 'FULL',
        portion: 1.0,
        triggerPriceUsd: currentPriceUsd,
        reason: `Volatility spike (${(realizedVolatility * 100).toFixed(1)}%) with negative PnL (${position.unrealizedPnlPercent.toFixed(1)}%)`
      };
    }

    // 4. Liquidity / Security Deterioration
    if (securityScore !== undefined && securityScore < 60) {
      return {
        rule: 'LIQUIDITY_SECURITY_DETERIORATION',
        shouldExit: true,
        exitType: 'FULL',
        portion: 1.0,
        triggerPriceUsd: currentPriceUsd,
        reason: `Security score degraded dangerously (${securityScore}/100)`
      };
    }

    // 5. Thesis Invalidation (e.g. price drops below initial stop level or explicit thesis flag)
    if (position.invalidationReason) {
      return {
        rule: 'THESIS_INVALIDATION',
        shouldExit: true,
        exitType: 'FULL',
        portion: 1.0,
        triggerPriceUsd: currentPriceUsd,
        reason: `Thesis invalidated: ${position.invalidationReason}`
      };
    }

    // 6. Signal Reversal (Core strategy turns SHORT or FLAT with high conviction)
    if (signalDirection === 'SHORT') {
      return {
        rule: 'SIGNAL_REVERSAL',
        shouldExit: true,
        exitType: 'FULL',
        portion: 1.0,
        triggerPriceUsd: currentPriceUsd,
        reason: 'Signal reversed from LONG to SHORT'
      };
    }

    // 7. Adaptive Trailing Stop
    if (position.trailingState.isActive && position.trailingState.dynamicStopPriceUsd > 0) {
      if (currentPriceUsd <= position.trailingState.dynamicStopPriceUsd) {
        return {
          rule: 'ADAPTIVE_TRAILING_STOP',
          shouldExit: true,
          exitType: 'FULL',
          portion: 1.0,
          triggerPriceUsd: position.trailingState.dynamicStopPriceUsd,
          reason: `Trailing stop triggered at $${position.trailingState.dynamicStopPriceUsd.toFixed(6)} after peak $${position.trailingState.highestPriceUsd.toFixed(6)}`
        };
      }
    }

    // 8. Principal Recovery (Sell 50% to recover initial capital if up 100%)
    if (!position.isPrincipalRecovered && position.unrealizedPnlPercent >= 100.0) {
      return {
        rule: 'PRINCIPAL_RECOVERY',
        shouldExit: true,
        exitType: 'PARTIAL',
        portion: 0.5,
        triggerPriceUsd: currentPriceUsd,
        reason: `Principal Recovery: +100% reached ($${currentPriceUsd.toFixed(6)}). Selling 50% to secure risk capital.`
      };
    }

    // 9. Partial Take Profit (Staged Targets)
    for (const target of position.targets) {
      if (!target.isHit && currentPriceUsd >= target.targetPriceUsd) {
        return {
          rule: 'PARTIAL_TAKE_PROFIT',
          shouldExit: true,
          exitType: 'PARTIAL',
          portion: target.portionToExit,
          triggerPriceUsd: target.targetPriceUsd,
          reason: `Take Profit Level ${target.level} reached (+${target.targetPercent}% target at $${target.targetPriceUsd.toFixed(6)})`
        };
      }
    }

    // 9. Time Stop (Trade open > 2.5x expected horizon with stagnant PnL)
    const horizonMsMap: Record<string, number> = {
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      'scalp': 10 * 60 * 1000,
      'short': 30 * 60 * 1000,
      'intraday': 120 * 60 * 1000,
      'swing': 360 * 60 * 1000
    };
    const maxHorizonMs = (horizonMsMap[position.expectedHorizon] || 30 * 60 * 1000) * 2.5;
    if (position.timeInTradeMs > maxHorizonMs && position.unrealizedPnlPercent < 1.0) {
      return {
        rule: 'TIME_STOP',
        shouldExit: true,
        exitType: 'FULL',
        portion: 1.0,
        triggerPriceUsd: currentPriceUsd,
        reason: `Time stop reached (${Math.round(position.timeInTradeMs / 60000)}m in trade, max ${Math.round(maxHorizonMs / 60000)}m)`
      };
    }

    // 10. Regime Exit (e.g. regime flipped to PANIC or LIQUIDITY_STRESS)
    if (currentRegime === 'PANIC' || currentRegime === 'LIQUIDITY_STRESS') {
      return {
        rule: 'REGIME_EXIT',
        shouldExit: true,
        exitType: 'FULL',
        portion: 1.0,
        triggerPriceUsd: currentPriceUsd,
        reason: `Adverse market regime flip to ${currentRegime}`
      };
    }

    return {
      rule: 'HARD_STOP',
      shouldExit: false,
      exitType: 'FULL',
      portion: 0,
      triggerPriceUsd: currentPriceUsd,
      reason: 'No exit condition triggered'
    };
  }
}

import { OnlineLearningEngine } from './learning';

export class AdvancedPortfolioEngine {
  private positions: Map<string, TrackedPosition> = new Map();
  private learningEngine?: OnlineLearningEngine;

  constructor(private db?: BattleTradeDB) {
    if (db) {
      this.learningEngine = new OnlineLearningEngine(db);
    }
  }

  /**
   * Opens and records a new tracked position with comprehensive audit state.
   */
  public openPosition(params: {
    id: string;
    tokenAddress: string;
    chainId: ChainId;
    symbol: string;
    name: string;
    thesis: string;
    strategy: string;
    signalId: string;
    signalSnapshot?: Record<string, any>;
    regime: MarketRegime;
    fillResult: PaperExecutionResult;
    stopLossPercent: number;
    stagedTargets: StagedTarget[];
    trailingActivationPercent: number;
    trailingDistancePercent: number;
    expectedHorizon: string;
    isSimulation: boolean;
  }): TrackedPosition {
    const {
      id,
      tokenAddress,
      chainId,
      symbol,
      name,
      thesis,
      strategy,
      signalId,
      signalSnapshot,
      regime,
      fillResult,
      stopLossPercent,
      stagedTargets,
      trailingActivationPercent,
      trailingDistancePercent,
      expectedHorizon,
      isSimulation
    } = params;

    const entryPrice = fillResult.executionPriceUsd;
    const stopLossPrice = Number((entryPrice * (1 - stopLossPercent / 100)).toFixed(8));

    const position: TrackedPosition = {
      id,
      tokenAddress,
      chainId,
      symbol,
      name,
      thesis,
      strategy,
      signalId,
      signalSnapshot,
      regime,
      entry: {
        timestamp: fillResult.executionTimestamp,
        initialSizeUsd: fillResult.filledSizeUsd,
        initialTokens: fillResult.filledTokens,
        initialPriceUsd: entryPrice
      },
      size: {
        currentSizeUsd: fillResult.filledSizeUsd,
        currentTokens: fillResult.filledTokens
      },
      averagePriceUsd: entryPrice,
      accumulatedFeesUsd: fillResult.totalCostUsd,
      stop: {
        stopLossPriceUsd: stopLossPrice,
        stopLossPercent,
        initialStopPriceUsd: stopLossPrice
      },
      targets: stagedTargets,
      trailingState: {
        isActive: false,
        activationThresholdPercent: trailingActivationPercent,
        trailingDistancePercent,
        highestPriceUsd: entryPrice,
        dynamicStopPriceUsd: 0
      },
      mfe: {
        mfePercent: 0,
        mfeUsd: 0,
        highestPriceUsd: entryPrice,
        highestPriceTimestamp: fillResult.executionTimestamp
      },
      mae: {
        maePercent: 0,
        maeUsd: 0,
        lowestPriceUsd: entryPrice,
        lowestPriceTimestamp: fillResult.executionTimestamp
      },
      timeInTradeMs: 0,
      expectedHorizon,
      isSimulation,
      status: 'OPEN',
      currentPriceUsd: entryPrice,
      unrealizedPnlUsd: 0,
      unrealizedPnlPercent: 0,
      realizedPnlUsd: 0,
      lastUpdateTimestamp: fillResult.executionTimestamp,
      isStaleValuation: false,
      isPrincipalRecovered: false
    };

    this.positions.set(position.id, position);

    // Double-entry accounting: Update ledger in DB if present
    if (this.db) {
      const balanceId = isSimulation ? 'SIM_USD' : 'LIVE_USD';
      const balance = this.db.getBalance(balanceId);
      this.db.updateBalance(
        balanceId,
        balance.amount - fillResult.filledSizeUsd,
        balance.allocated_to_trades + fillResult.filledSizeUsd
      );

      this.db.savePosition({
        id: position.id,
        token_address: position.tokenAddress,
        chain_id: position.chainId,
        name: position.name,
        symbol: position.symbol,
        buy_price_usd: position.entry.initialPriceUsd,
        current_price_usd: position.currentPriceUsd,
        size_usd: position.size.currentSizeUsd,
        amount_tokens: position.size.currentTokens,
        buy_timestamp: position.entry.timestamp,
        last_update_timestamp: position.lastUpdateTimestamp,
        highest_price_usd: position.mfe.highestPriceUsd,
        is_principal_recovered: 0,
        target_take_profit_percent: stagedTargets[0]?.targetPercent || 5.0,
        stop_loss_percent: stopLossPercent,
        trailing_stop_percent: trailingDistancePercent,
        is_simulation: isSimulation ? 1 : 0,
        pnl_usd: 0,
        pnl_percent: 0,
        regime_at_entry: regime,
        setup_pattern: 'VELOCITY_BREAKOUT',
        status: 'OPEN'
      });
    }

    return position;
  }

  /**
   * Updates real-time mark-to-market valuation, tracking freshness, MFE, MAE,
   * dynamic trailing stop activations, and time in trade.
   */
  public updateMarkToMarket(
    positionId: string,
    currentPriceUsd: number,
    quoteTimestamp: number
  ): TrackedPosition | undefined {
    const pos = this.positions.get(positionId);
    if (!pos || pos.status === 'CLOSED') return undefined;

    const now = Date.now();
    // Freshness check: if quote is older than 60s, flag as stale valuation
    pos.isStaleValuation = (now - quoteTimestamp) > 60000;
    pos.currentPriceUsd = currentPriceUsd;
    pos.lastUpdateTimestamp = now;
    pos.timeInTradeMs = now - pos.entry.timestamp;

    // Unrealized PnL based on current average price (VWAP)
    const pnlPercent = ((currentPriceUsd - pos.averagePriceUsd) / pos.averagePriceUsd) * 100;
    const pnlUsd = (currentPriceUsd - pos.averagePriceUsd) * pos.size.currentTokens;
    pos.unrealizedPnlPercent = Number(pnlPercent.toFixed(2));
    pos.unrealizedPnlUsd = Number(pnlUsd.toFixed(2));

    // Update MFE (Maximum Favorable Excursion)
    if (pnlPercent > pos.mfe.mfePercent) {
      pos.mfe.mfePercent = Number(pnlPercent.toFixed(2));
      pos.mfe.mfeUsd = Number(pnlUsd.toFixed(2));
      pos.mfe.highestPriceUsd = currentPriceUsd;
      pos.mfe.highestPriceTimestamp = now;
    }

    // Update MAE (Maximum Adverse Excursion)
    if (pnlPercent < pos.mae.maePercent) {
      pos.mae.maePercent = Number(pnlPercent.toFixed(2));
      pos.mae.maeUsd = Number(pnlUsd.toFixed(2));
      pos.mae.lowestPriceUsd = currentPriceUsd;
      pos.mae.lowestPriceTimestamp = now;
    }

    // Trailing Stop State Machine
    if (pnlPercent >= pos.trailingState.activationThresholdPercent) {
      pos.trailingState.isActive = true;
    }

    if (pos.trailingState.isActive) {
      pos.trailingState.highestPriceUsd = Math.max(pos.trailingState.highestPriceUsd, currentPriceUsd);
      const calculatedDynamicStop = pos.trailingState.highestPriceUsd * (1 - pos.trailingState.trailingDistancePercent / 100);
      // Trailing stop can only ratched upwards, never down
      pos.trailingState.dynamicStopPriceUsd = Math.max(
        pos.trailingState.dynamicStopPriceUsd,
        calculatedDynamicStop
      );
    }

    return pos;
  }

  /**
   * Executes an exit (full or partial staged TP) and reconciles the accounting ledger.
   */
  public executeExit(
    positionId: string,
    trigger: ExitTrigger,
    exitFill: PaperExecutionResult
  ): { position: TrackedPosition; isFullyClosed: boolean; realizedPnlThisExit: number } {
    const pos = this.positions.get(positionId);
    if (!pos) throw new Error(`Position ${positionId} not found`);

    const portion = Math.min(1.0, Math.max(0.01, trigger.portion));
    const tokensToSell = pos.size.currentTokens * portion;
    const sizeUsdSold = pos.size.currentSizeUsd * portion;

    const revenueUsd = tokensToSell * exitFill.executionPriceUsd;
    const costBasisUsd = tokensToSell * pos.averagePriceUsd;
    const realizedPnlThisExit = revenueUsd - costBasisUsd - exitFill.totalCostUsd;

    pos.realizedPnlUsd += Number(realizedPnlThisExit.toFixed(2));
    pos.accumulatedFeesUsd += exitFill.totalCostUsd;

    // Double-entry accounting balance updates
    if (this.db) {
      const balanceId = pos.isSimulation ? 'SIM_USD' : 'LIVE_USD';
      const balance = this.db.getBalance(balanceId);
      const returnedCash = revenueUsd - exitFill.totalCostUsd;
      const newAllocated = Math.max(0, balance.allocated_to_trades - sizeUsdSold);
      this.db.updateBalance(balanceId, balance.amount + returnedCash, newAllocated);
    }

    if (portion >= 0.99 || trigger.exitType === 'FULL') {
      // Full position exit
      pos.status = 'CLOSED';
      pos.size.currentSizeUsd = 0;
      pos.size.currentTokens = 0;
      pos.unrealizedPnlUsd = 0;
      pos.unrealizedPnlPercent = 0;
      pos.invalidationReason = trigger.reason;

      if (this.db) {
        this.db.deletePosition(pos.id);
        const trade = {
          id: pos.id,
          tokenAddress: pos.tokenAddress,
          chainId: pos.chainId,
          name: pos.name,
          symbol: pos.symbol,
          buyPriceUsd: pos.entry.initialPriceUsd,
          sellPriceUsd: exitFill.executionPriceUsd,
          sizeUsd: pos.entry.initialSizeUsd,
          buyTimestamp: pos.entry.timestamp,
          sellTimestamp: exitFill.executionTimestamp,
          pnlUsd: pos.realizedPnlUsd,
          pnlPercent: Number(((pos.realizedPnlUsd / pos.entry.initialSizeUsd) * 100).toFixed(2)),
          exitReason: trigger.rule === 'HARD_STOP' ? 'STOP_LOSS' : trigger.rule === 'ADAPTIVE_TRAILING_STOP' ? 'TRAILING_STOP' : 'TAKE_PROFIT',
          isSimulation: pos.isSimulation,
          regimeAtEntry: pos.regime,
          setupPattern: pos.strategy || 'VELOCITY_BREAKOUT'
        };
        this.db.saveHistoricalTrade(trade as any);

        if (this.learningEngine) {
          try {
            this.learningEngine.onTradeClosed(trade as any);
          } catch (e) {
            console.warn("Learning engine error", e);
          }
        }
      }

      return { position: pos, isFullyClosed: true, realizedPnlThisExit };
    } else {
      // Staged partial exit
      pos.status = 'PARTIALLY_CLOSED';
      pos.size.currentTokens -= tokensToSell;
      pos.size.currentSizeUsd -= sizeUsdSold;

      if (trigger.rule === 'PRINCIPAL_RECOVERY') {
        pos.isPrincipalRecovered = true;
      }

      // Mark the corresponding target level as hit
      for (const target of pos.targets) {
        if (!target.isHit && Math.abs(target.portionToExit - portion) < 0.05) {
          target.isHit = true;
          target.hitTimestamp = exitFill.executionTimestamp;
          break;
        }
      }

      return { position: pos, isFullyClosed: false, realizedPnlThisExit };
    }
  }

  public getPosition(id: string): TrackedPosition | undefined {
    return this.positions.get(id);
  }

  public getActivePositions(): TrackedPosition[] {
    return Array.from(this.positions.values()).filter(p => p.status !== 'CLOSED');
  }

  public getPortfolioSummary(): {
    totalEquityUsd: number;
    cashBalanceUsd: number;
    allocatedToTradesUsd: number;
    dailyRealizedPnlUsd: number;
    openPositionsCount: number;
    totalUnrealizedPnlUsd: number;
  } {
    const isSim = true;
    const balance = this.db ? this.db.getBalance(isSim ? 'SIM_USD' : 'LIVE_USD') : { amount: 1000, allocated_to_trades: 0 };
    const active = this.getActivePositions();
    const unrealized = active.reduce((acc, p) => acc + p.unrealizedPnlUsd, 0);
    const trades = this.db ? this.db.getHistoricalTrades() : [];
    const oneDayAgo = Date.now() - 24 * 3600 * 1000;
    const dailyPnl = trades.filter(t => (t.sellTimestamp || 0) >= oneDayAgo).reduce((acc, t) => acc + t.pnlUsd, 0);

    return {
      totalEquityUsd: (balance?.amount || 0) + (balance?.allocated_to_trades || 0) + unrealized,
      cashBalanceUsd: balance?.amount || 0,
      allocatedToTradesUsd: balance?.allocated_to_trades || 0,
      dailyRealizedPnlUsd: dailyPnl,
      openPositionsCount: active.length,
      totalUnrealizedPnlUsd: unrealized
    };
  }

  /**
   * Safe restart recovery: restores open positions from the database on startup.
   */
  public restoreFromDatabase(): number {
    if (!this.db) return 0;
    const dbPositions = this.db.getPositions();
    let restoredCount = 0;

    for (const p of dbPositions) {
      if (!this.positions.has(p.id)) {
        const restored: TrackedPosition = {
          id: p.id,
          tokenAddress: p.token_address,
          chainId: p.chain_id,
          symbol: p.symbol,
          name: p.name,
          thesis: 'Restored from persistent storage on restart',
          strategy: 'RECOVERED',
          signalId: `sig_restored_${p.id}`,
          regime: p.regime_at_entry,
          entry: {
            timestamp: p.buy_timestamp,
            initialSizeUsd: p.size_usd,
            initialTokens: p.amount_tokens,
            initialPriceUsd: p.buy_price_usd
          },
          size: {
            currentSizeUsd: p.size_usd,
            currentTokens: p.amount_tokens
          },
          averagePriceUsd: p.buy_price_usd,
          accumulatedFeesUsd: 0,
          stop: {
            stopLossPriceUsd: p.buy_price_usd * (1 - p.stop_loss_percent / 100),
            stopLossPercent: p.stop_loss_percent,
            initialStopPriceUsd: p.buy_price_usd * (1 - p.stop_loss_percent / 100)
          },
          targets: [
            {
              level: 1,
              targetPriceUsd: p.buy_price_usd * (1 + p.target_take_profit_percent / 100),
              targetPercent: p.target_take_profit_percent,
              portionToExit: 0.50,
              isHit: p.is_principal_recovered === 1
            }
          ],
          trailingState: {
            isActive: p.is_principal_recovered === 1,
            activationThresholdPercent: 5.0,
            trailingDistancePercent: p.trailing_stop_percent,
            highestPriceUsd: p.highest_price_usd,
            dynamicStopPriceUsd: p.highest_price_usd * (1 - p.trailing_stop_percent / 100)
          },
          mfe: {
            mfePercent: p.pnl_percent,
            mfeUsd: p.pnl_usd,
            highestPriceUsd: p.highest_price_usd,
            highestPriceTimestamp: p.last_update_timestamp
          },
          mae: {
            maePercent: 0,
            maeUsd: 0,
            lowestPriceUsd: p.buy_price_usd,
            lowestPriceTimestamp: p.buy_timestamp
          },
          timeInTradeMs: Date.now() - p.buy_timestamp,
          expectedHorizon: 'short',
          isSimulation: p.is_simulation === 1,
          status: 'OPEN',
          currentPriceUsd: p.current_price_usd,
          unrealizedPnlUsd: p.pnl_usd,
          unrealizedPnlPercent: p.pnl_percent,
          realizedPnlUsd: 0,
          lastUpdateTimestamp: p.last_update_timestamp,
          isStaleValuation: false
        };

        this.positions.set(restored.id, restored);
        restoredCount++;
      }
    }

    return restoredCount;
  }
}

/**
 * LiveExecutionAdapter:
 * FÍSICAMENTE BLOQUEADO por defecto para máxima seguridad de capital.
 */
export class LiveExecutionAdapter implements ILiveExecutionAdapter {
  private static readonly IS_LOCKED = true;

  public isLiveAllowed(): boolean {
    return false;
  }

  public async executeLiveOrder(order: PaperExecutionOrder): Promise<PaperExecutionResult> {
    if (LiveExecutionAdapter.IS_LOCKED) {
      throw new Error(
        'LIVE_EXECUTION_BLOCKED: Live on-chain execution is physically locked by Battle Trade core safety architecture. Only paper simulation mode is authorized.'
      );
    }
    throw new Error('Unreachable code: Live execution physically disabled.');
  }
}
