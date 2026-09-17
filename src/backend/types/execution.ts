import { ChainId, MarketRegime } from '../../shared/types';

export interface AMMQuote {
  inputAmountUsd: number;
  poolLiquidityUsd: number;
  poolReserveQuoteUsd: number;
  poolReserveBaseTokens: number;
  spotPriceUsd: number;
  effectivePriceUsd: number;
  priceImpactBps: number;
  priceImpactPercent: number;
  tokensOut: number;
  dexFeeUsd: number;
  gasFeeUsd: number;
  maxSafeSizeUsd: number;
  isPartialFill: boolean;
  filledSizeUsd: number;
  residualSizeUsd: number;
}

export interface PaperExecutionOrder {
  orderId: string;
  positionId: string;
  tokenAddress: string;
  tokenSymbol: string;
  chainId: ChainId;
  side: 'BUY' | 'SELL';
  requestedSizeUsd: number;
  observedPriceUsd: number;
  decisionTimestamp: number;
  maxSlippageBps: number;
  deadlineTimestamp: number;
  poolLiquidityUsd: number;
  realizedVolatility?: number;
}

export interface PaperExecutionResult {
  orderId: string;
  positionId: string;
  status: 'FILLED' | 'PARTIALLY_FILLED' | 'REJECTED' | 'EXPIRED';
  observedPriceUsd: number;
  executionPriceUsd: number;
  filledSizeUsd: number;
  filledTokens: number;
  residualSizeUsd: number;
  priceImpactBps: number;
  slippageBps: number;
  dexFeeUsd: number;
  gasFeeUsd: number;
  totalCostUsd: number;
  decisionTimestamp: number;
  executionTimestamp: number;
  executionLatencyMs: number;
  rejectionReason?: string;
}

export interface IntrabarCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export interface StagedTarget {
  level: number; // 1, 2, 3
  targetPriceUsd: number;
  targetPercent: number;
  portionToExit: number; // e.g. 0.33, 0.50
  isHit: boolean;
  hitTimestamp?: number;
}

export interface TrackedPosition {
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
  entry: {
    timestamp: number;
    initialSizeUsd: number;
    initialTokens: number;
    initialPriceUsd: number;
  };
  size: {
    currentSizeUsd: number;
    currentTokens: number;
  };
  averagePriceUsd: number; // VWAP across entries
  accumulatedFeesUsd: number;
  stop: {
    stopLossPriceUsd: number;
    stopLossPercent: number;
    initialStopPriceUsd: number;
  };
  targets: StagedTarget[];
  trailingState: {
    isActive: boolean;
    activationThresholdPercent: number;
    trailingDistancePercent: number;
    highestPriceUsd: number;
    dynamicStopPriceUsd: number;
  };
  mfe: {
    mfePercent: number;
    mfeUsd: number;
    highestPriceUsd: number;
    highestPriceTimestamp: number;
  };
  mae: {
    maePercent: number; // negative or zero
    maeUsd: number;
    lowestPriceUsd: number;
    lowestPriceTimestamp: number;
  };
  timeInTradeMs: number;
  expectedHorizon: string;
  invalidationReason?: string;
  isSimulation: boolean;
  status: 'OPEN' | 'PARTIALLY_CLOSED' | 'CLOSED';
  currentPriceUsd: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPercent: number;
  realizedPnlUsd: number;
  lastUpdateTimestamp: number;
  isStaleValuation: boolean;
  isPrincipalRecovered?: boolean;
}

export type ExitRuleType =
  | 'HARD_STOP'
  | 'VOLATILITY_ATR_STOP'
  | 'THESIS_INVALIDATION'
  | 'LIQUIDITY_SECURITY_DETERIORATION'
  | 'SIGNAL_REVERSAL'
  | 'PARTIAL_TAKE_PROFIT'
  | 'PRINCIPAL_RECOVERY'
  | 'ADAPTIVE_TRAILING_STOP'
  | 'TIME_STOP'
  | 'REGIME_EXIT'
  | 'EMERGENCY_EXIT';

export interface ExitTrigger {
  rule: ExitRuleType;
  shouldExit: boolean;
  exitType: 'FULL' | 'PARTIAL';
  portion: number; // 1.0 for full, e.g. 0.33 or 0.50
  triggerPriceUsd: number;
  reason: string;
  hitIntrabar?: boolean;
}

export interface AdaptiveTPSLParams {
  atrUsd?: number;
  atrPercent?: number;
  realizedVolatility: number;
  poolLiquidityUsd: number;
  netEvPercent: number;
  signalConfidence: number;
  currentPriceUsd: number;
  regime: MarketRegime;
}

export interface AdaptiveTPSLResult {
  recommendedStopLossPercent: number;
  recommendedTakeProfitPercent: number;
  hardStopPriceUsd: number;
  takeProfitPriceUsd: number;
  trailingActivationPercent: number;
  trailingDistancePercent: number;
  stagedTargets: StagedTarget[];
  rationale: string;
}

export interface ILiveExecutionAdapter {
  isLiveAllowed(): boolean;
  executeLiveOrder(order: PaperExecutionOrder): Promise<PaperExecutionResult>;
}
