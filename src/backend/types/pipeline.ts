import { ChainId, MarketRegime, SetupPattern } from '../../shared/types';
import { FeatureVector } from './features';
import { StrategySignal, RegimeAnalysis } from './strategy';
import { MLInferenceResult, MLExpectedValueBreakdown } from './ml';
import { CircuitBreakerState, LimitsConsumedSnapshot } from './risk';
import { PaperExecutionResult, StagedTarget, TrackedPosition, ExitTrigger, ExitRuleType } from './execution';

export type DecisionAction = 'NO_TRADE' | 'BUY' | 'ADD' | 'REDUCE' | 'EXIT' | 'EMERGENCY_EXIT';

export type ReasonCode =
  | 'SECURITY_BLOCK'
  | 'LIQUIDITY_BLOCK'
  | 'DATA_STALE'
  | 'NEGATIVE_EV'
  | 'RISK_LIMIT'
  | 'LOW_CONFIDENCE'
  | 'COST_TOO_HIGH'
  | 'PRICE_IMPACT_TOO_HIGH'
  | 'PROVIDER_FAILURE'
  | 'CIRCUIT_BREAKER_HALTED'
  | 'CIRCUIT_BREAKER_CAUTION'
  | 'CIRCUIT_BREAKER_DEFENSIVE'
  | 'EXPOSURE_CAP_EXCEEDED'
  | 'MAX_POSITIONS_REACHED'
  | 'CONVICTION_BELOW_THRESHOLD'
  | 'DRAWDOWN_DEFENSIVE_MODE'
  | 'COOLDOWN_ACTIVE'
  | 'DAILY_LOSS_LIMIT_REACHED'
  | 'CONSECUTIVE_LOSS_PAUSE'
  | 'INSUFFICIENT_EDGE_AFTER_FEES'
  | 'ALREADY_HELD_MAX_ALLOCATION'
  | 'LOCK_ACQUISITION_FAILED'
  | 'PATTERN_BLOCKED_BY_LEARNING_ENGINE'
  | 'SIZE_BELOW_MINIMUM_AFTER_LEARNING_PENALTY'
  | 'LEARNING_ENGINE_SIZE_REDUCTION_BLOCKED_TRADE'
  | 'APPROVED_STRONG_EDGE'
  | 'EXIT_HARD_STOP_TRIGGERED'
  | 'EXIT_TAKE_PROFIT_TRIGGERED'
  | 'EXIT_TRAILING_STOP_TRIGGERED'
  | 'EXIT_TIME_STOP_TRIGGERED'
  | 'EXIT_THESIS_INVALIDATED'
  | 'EXIT_SECURITY_DETERIORATION'
  | 'EXIT_VOLATILITY_EXPANSION'
  | 'EXIT_REGIME_FLIP'
  | 'EMERGENCY_KILL_SWITCH';

export interface DataFreshnessInfo {
  latencyMs: number;
  lastQuoteAgeMs: number;
  isFresh: boolean;
  dataQualityScore: number; // 0 to 100
  feedSource: string;
}

export interface SecurityEvidenceInfo {
  passed: boolean;
  hardBlock: boolean;
  goplusScore: number;
  isHoneypot: boolean;
  buyTax: number;
  sellTax: number;
  lpLockedPercent: number;
  topHoldersPercent: number;
  isMintable: boolean;
  flags: string[];
  rejectionReason?: string;
}

export interface NetEVInfo {
  evPercent: number;
  evUsd: number;
  evRRatio: number;
  expectedRewardUsd: number;
  expectedLossUsd: number;
  totalFrictionCostUsd: number;
  isPositiveEdge: boolean;
  breakdown: {
    feesUsd: number;
    slippageUsd: number;
    gasUsd: number;
    priceImpactUsd: number;
    latencyCostUsd: number;
  };
}

export interface RiskDecisionInfo {
  allowed: boolean;
  state: CircuitBreakerState;
  recommendedSizeUsd: number;
  sizingMethod: string;
  kellyFractionApplied: number;
  limitsConsumed: LimitsConsumedSnapshot;
  blockedReasons: string[];
}

export interface ImmutableDecisionObject {
  decisionId: string;
  timestamp: number;
  asset: {
    address: string;
    symbol: string;
    name: string;
    decimals?: number;
  };
  chain: ChainId;
  dataFreshness: DataFreshnessInfo;
  securityEvidence: SecurityEvidenceInfo;
  featureVersion: string;
  featuresSummary: {
    rsi14: number;
    velocity5m: number;
    volatility: number;
    volumeToLiquidity: number;
    adx14: number;
  };
  regime: {
    currentRegime: MarketRegime;
    confidence: number;
    drivers: string[];
    isFavorableForEntries: boolean;
  };
  strategySignals: {
    primaryStrategy: string;
    compositeScore: number;
    conviction: 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';
    signalsCount: number;
    signals: StrategySignal[];
    correlationPenaltyApplied: number;
  };
  mlPrediction: {
    pWin: number;
    calibratedProbability: number;
    expectedReturn: number;
    expectedMae: number;
    pSignificantLoss: number;
    modelVersion: string;
    featureVersion: string;
    horizon: string;
  };
  evNetOfCosts: NetEVInfo;
  riskDecision: RiskDecisionInfo;
  positionSizeUsd: number;
  finalAction: DecisionAction;
  reasonCodes: ReasonCode[];
  rationaleEs: string;
  rationaleEn: string;
  executionResult?: PaperExecutionResult;
  pipelineLatencyMs: number;
}

export interface StructuredAutopsy {
  autopsyId: string;
  tradeId: string;
  decisionId: string;
  timestamp: number;
  asset: {
    address: string;
    symbol: string;
    chain: ChainId;
  };
  strategy: string;
  regimeAtEntry: MarketRegime;
  regimeAtExit: MarketRegime;
  entrySnapshot: {
    timestamp: number;
    priceUsd: number;
    sizeUsd: number;
    expectedEvUsd: number;
    expectedWinProb: number;
    expectedMaePercent: number;
  };
  exitSnapshot: {
    timestamp: number;
    priceUsd: number;
    exitRule: ExitRuleType;
    exitReason: string;
  };
  performance: {
    pnlUsd: number;
    pnlPercent: number;
    timeInTradeMinutes: number;
    mfePercent: number;
    maePercent: number;
    actualSlippageBps: number;
    totalFrictionPaidUsd: number;
  };
  rootCause: 
    | 'PREDICTED_SL'
    | 'PREDICTED_TP'
    | 'THESIS_INVALIDATED'
    | 'PREMATURE_TRAILING'
    | 'VOLATILITY_EXPANSION'
    | 'SECURITY_DEGRADATION'
    | 'REGIME_FLIP'
    | 'UNEXPECTED_SPREAD'
    | 'MANUAL_INTERVENTION'
    | 'TIME_DECAY';
  evidenceAnalysis: {
    maeExceededExpected: boolean;
    slippageHigherThanEstimate: boolean;
    regimeShiftedAdversely: boolean;
    holdingTimeExceededHorizon: boolean;
    keyObservations: string[];
  };
  aiExplanation?: {
    summary: string;
    lessonsLearned: string[];
    actionableAdjustment: string;
  };
}

export interface PortfolioMetricsDetail {
  roiPercent: number;
  totalProfitUsd: number;
  initialCapitalUsd: number;
  currentCapitalUsd: number;
  highestCapitalUsd: number;
  maxDrawdownPercent: number;
  recoveryFactor: number;
  cvar95Percent: number; // Conditional Value at Risk (Expected Shortfall)
  sharpeRatioEstimate: number;
  equityCurve: { timestamp: number; equityUsd: number; drawdownPercent: number }[];
}

export interface TradingMetricsDetail {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  scratchTrades: number;
  winRatePercent: number;
  expectancyUsd: number;
  expectancyPercent: number;
  profitFactor: number;
  payoffRatio: number; // Avg Win / Avg Loss
  averageWinUsd: number;
  averageLossUsd: number;
  averageHoldingTimeMinutes: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
}

export interface ExecutionMetricsDetail {
  totalOrders: number;
  filledOrders: number;
  rejectedOrders: number;
  fillRatePercent: number;
  averageSlippageBps: number;
  averagePriceImpactBps: number;
  averageExecutionLatencyMs: number;
  totalFeesPaidUsd: number;
  totalGasPaidUsd: number;
  totalFrictionCostUsd: number;
}

export interface ModelMetricsDetail {
  totalPredictions: number;
  evaluatedPredictions: number;
  brierScore: number;
  calibrationErrorPercent: number;
  reliabilityBins: {
    binStart: number;
    binEnd: number;
    predictedProbMean: number;
    empiricalWinRate: number;
    sampleCount: number;
  }[];
  accuracyPercent: number;
  currentChampionModel: string;
}

export interface StrategyPerformanceMetrics {
  strategyName: string;
  tradeCount: number;
  winRatePercent: number;
  totalPnlUsd: number;
  profitFactor: number;
  averageReturnPercent: number;
  expectancyUsd: number;
}

export interface RegimePerformanceMetrics {
  regime: MarketRegime;
  tradeCount: number;
  winRatePercent: number;
  totalPnlUsd: number;
  profitFactor: number;
  averageHoldingTimeMinutes: number;
}

export interface ComprehensiveSystemMetrics {
  portfolio: PortfolioMetricsDetail;
  trading: TradingMetricsDetail;
  execution: ExecutionMetricsDetail;
  model: ModelMetricsDetail;
  strategyBreakdown: Record<string, StrategyPerformanceMetrics>;
  regimeBreakdown: Record<string, RegimePerformanceMetrics>;
  lastUpdatedTimestamp: number;
}
