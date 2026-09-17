import { MarketRegime } from '../../shared/types';
import { FeatureVector } from './features';
import { MLInferenceResult } from './ml';

export type SignalDirection = 'LONG' | 'SHORT' | 'FLAT';
export type TimeHorizon = 'scalp' | 'short' | 'intraday' | 'swing';

export interface StrategySignal {
  strategyName: string;
  direction: SignalDirection;
  score: number; // 0 to 100
  confidence: number; // 0.0 to 1.0
  expectedHorizon: TimeHorizon;
  entryZone: { minPrice: number; maxPrice: number };
  invalidation: number; // stop loss price level
  targetZone: { minPrice: number; maxPrice: number };
  stopLogic: string;
  structuredRationale: string;
  requiredFeatures: string[];
  generatedTimestamp: number;
}

export interface HorizonConfig {
  horizon: TimeHorizon;
  minHoldingPeriodSec: number;
  maxHoldingPeriodSec: number;
  typicalStopLossPercent: number;
  typicalTakeProfitPercent: number;
  expectedSlippageBps: number;
  riskBudgetMultiplier: number;
}

export interface RegimeAnalysis {
  primaryRegime: MarketRegime;
  secondaryRegime?: MarketRegime;
  confidence: number; // 0.0 to 1.0
  regimeRationale: string;
  keyDrivers: string[];
  calculatedTimestamp: number;
}

export interface MetaEnsembleSignal {
  signal_id: string;
  tokenAddress: string;
  chainId: string;
  direction: SignalDirection;
  signal_score: number; // 0 to 100
  signal_confidence: number; // 0.0 to 1.0
  signal_quality: number; // 0.0 to 1.0
  signal_age: number; // milliseconds since creation
  signal_decay: number; // 0.0 to 1.0 decay multiplier
  selectedHorizon: TimeHorizon;
  entryZone: { minPrice: number; maxPrice: number };
  invalidation: number;
  targetZone: { minPrice: number; maxPrice: number };
  stopLogic: string;
  expectedValueUsdPerDollar: number; // Net EV per $1 traded after gas and slippage
  netExpectedReturnPercent?: number;
  estimatedCostBps?: number;
  correlationPenaltyApplied?: number;
  securityScore?: number;
  liquidityScore?: number;
  regime: MarketRegime;
  contributingStrategies: { name: string; weight: number; score: number; direction: SignalDirection }[];
  isNoTrade: boolean;
  noTradeReason?: string;
  aggressiveModeActive: boolean;
  ml_prediction?: MLInferenceResult;
  calculatedTimestamp: number;
}

export interface StrategyEngineConfig {
  aggressiveMode: boolean;
  minMetaScoreToTrade: number; // e.g. 60 normal, 50 aggressive
  maxRiskPerTradePercent: number; // e.g. 1.0% normal, 2.0% aggressive
  minConfidence: number; // e.g. 0.65
  allowShorts: boolean;
  correlationDeductionFactor: number; // 0.5 to reduce double counted signals
  minEvThreshold?: number; // e.g. 0.0 (must have positive net EV after costs)
  defaultTradeSizeUsd?: number;
}

export interface BacktestTickInput {
  timestamp: number;
  featureVector: FeatureVector;
  securityPassed: boolean;
  securityScore?: number;
  liquidityScore?: number;
  securityBlockReason?: string;
  currentPriceUsd: number;
  accountBalanceUsd: number;
  activePositionsCount: number;
}
