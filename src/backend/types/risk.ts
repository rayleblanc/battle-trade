import { ChainId, MarketRegime } from '../../shared/types';
import { MLInferenceResult } from './ml';
import { MetaEnsembleSignal } from './strategy';

export type CapitalMode = '5' | '10' | '50' | '100' | '500' | '1000' | '10000';

export type PositionSizingMethod =
  | 'FIXED_FRACTIONAL'
  | 'VOLATILITY_ADJUSTED'
  | 'RISK_PER_TRADE'
  | 'FRACTIONAL_KELLY';

export type CircuitBreakerState = 'NORMAL' | 'CAUTION' | 'DEFENSIVE' | 'HALTED';

export interface CapitalModeConfig {
  mode: CapitalMode;
  startingCapitalUsd: number;
  maxTradeSizeUsd: number;
  minTradeSizeUsd: number;
  maxSimultaneousPositions: number;
  maxDailyLossPercent: number;
  maxPortfolioDrawdownPercent: number;
  maxTokenExposurePercent: number;
  maxStrategyExposurePercent: number;
  maxChainExposurePercent: number;
  maxSlippageBps: number;
  maxPriceImpactBps: number;
  minLiquidityUsd: number;
  minEvThreshold: number; // minimum net EV after costs required
  minConfidence: number;
  kellyFraction: number; // e.g. 0.25 (Quarter-Kelly)
  maxPositionSizeCapPercent: number; // hard ceiling for Kelly / Vol sizing
  gasCostSensitivityMultiplier: number;
}

export interface RiskLimitsConfig {
  capitalMode: CapitalMode;
  portfolioEquityUsd: number;
  cashBalanceUsd: number;
  highWaterMarkUsd: number;
  realizedPnl24hUsd: number;
  consecutiveLossStreak: number;
  maxLossStreakLimit: number;
  cooldownMinutesAfterLossStreak: number;
  lastLossTimestamp?: number;
  activePositions: RiskTrackedPosition[];
  customOverrides?: Partial<CapitalModeConfig>;
}

export interface RiskTrackedPosition {
  id: string;
  tokenAddress: string;
  chainId: ChainId;
  strategyName: string;
  sizeUsd: number;
  entryPriceUsd: number;
  currentPriceUsd: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  unrealizedPnlUsd: number;
}

export interface CircuitBreakerEvaluation {
  state: CircuitBreakerState;
  activeBreakers: string[];
  reasons: string[];
  emergencyExitOnly: boolean;
  canOpenNewPositions: boolean;
  sizingMultiplier: number; // 1.0 (NORMAL), 0.75 (CAUTION), 0.50 (DEFENSIVE), 0.0 (HALTED)
}

export interface LimitsConsumedSnapshot {
  dailyLossUsd: number;
  dailyLossPercent: number;
  dailyLossLimitPercent: number;
  currentDrawdownPercent: number;
  maxDrawdownLimitPercent: number;
  activePositionsCount: number;
  maxSimultaneousPositionsLimit: number;
  tokenExposurePercent: number;
  maxTokenExposureLimitPercent: number;
  strategyExposurePercent: number;
  maxStrategyExposureLimitPercent: number;
  chainExposurePercent: number;
  maxChainExposureLimitPercent: number;
  consecutiveLossStreak: number;
  maxLossStreakLimit: number;
  cooldownRemainingSec: number;
}

export interface RiskCheckInput {
  tokenAddress: string;
  tokenSymbol: string;
  chainId: ChainId;
  strategyName: string;
  currentPriceUsd: number;
  poolLiquidityUsd: number;
  securityScore: number;
  liquidityScore: number;
  realizedVolatility: number;
  roundTripEstimatedCostBps: number;
  estimatedPriceImpactBps: number;
  estimatedGasCostUsd: number;
  metaSignal?: MetaEnsembleSignal;
  mlPrediction?: MLInferenceResult;
  preferredSizingMethod?: PositionSizingMethod;
  stopLossPercent?: number;
  targetProfitPercent?: number;
  isStaleData?: boolean;
  isDbInconsistent?: boolean;
  isSecurityIncident?: boolean;
  isLiquidityShock?: boolean;
  isAbnormalSlippage?: boolean;
}

export interface RiskDecision {
  allowed: boolean;
  circuitBreakerState: CircuitBreakerState;
  recommendedSizeUsd: number;
  recommendedSizeTokens: number;
  sizingMethodUsed: PositionSizingMethod;
  reasons: string[];
  blockCodes: string[];
  warnings: string[];
  limitsConsumed: LimitsConsumedSnapshot;
  executionConstraints: {
    maxSlippageBps: number;
    maxPriceImpactBps: number;
    hardStopPriceUsd: number;
    takeProfitPriceUsd: number;
    stopLossPercent: number;
    takeProfitPercent: number;
  };
  capitalMode: CapitalMode;
  timestamp: number;
}
