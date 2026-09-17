/**
 * Battle Trade - Smart Money & Meme Intelligence Types
 * 
 * Modular layer for wallet profiling, net flows, clustering,
 * anti-sybil filtering, and ecosystem-wide meme velocity metrics.
 */

import { ChainId } from '../../shared/types';

export type WalletCohort =
  | 'SMART_WHALE'
  | 'EARLY_SNIPER'
  | 'KOL_INFLUENCER'
  | 'BOT_ARBITRAGE'
  | 'DEV_INSIDER'
  | 'RETAIL'
  | 'UNKNOWN';

export interface WalletProfile {
  address: string;
  chainId: ChainId;
  cohort: WalletCohort;
  winRate: number; // 0.0 to 1.0
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  averageHoldingTimeMs: number;
  totalSwaps: number;
  profitableSwaps: number;
  activityScore: number; // 0 to 100
  sybilRiskScore: number; // 0 to 100 (high = likely bot/sybil)
  clusterId?: string;
  lastActiveTimestamp: number;
  knownLabel?: string;
}

export interface WalletCluster {
  clusterId: string;
  walletAddresses: string[];
  commonFundingSource?: string;
  averageTimingDeviationMs: number;
  confidenceScore: number;
  estimatedController: 'INDIVIDUAL' | 'SYBIL_FARM' | 'ARBITRAGE_BOTNET';
}

export interface SmartMoneyFlow {
  tokenAddress: string;
  chainId: ChainId;
  timeframe: '5m' | '15m' | '1h';
  netFlowUsd: number; // Positive = accumulation, Negative = distribution
  inflowUsd: number;
  outflowUsd: number;
  activeWhalesCount: number;
  activeSnipersCount: number;
  flowAcceleration: number; // Rate of change in flow vs previous window
  cohortBreakdown: Record<WalletCohort, { inflowUsd: number; outflowUsd: number; netUsd: number }>;
  timestamp: number;
}

export interface MemeIntelligenceMetrics {
  chainId: ChainId;
  timestamp: number;
  newPoolVelocityPerHour: number; // Number of newly deployed pools per hour
  volumeAcceleration: number; // % change in ecosystem trading volume
  liquidityAcceleration: number; // % change in overall pool liquidity
  holderGrowthRatePerHour: number; // Net new holders across top memecoins
  buySellImbalanceRatio: number; // > 1.0 means net buyer dominance
  poolFailureRatePercent: number; // % of new pools that fail / rug within 24h
  ecosystemHeatIndex: number; // 0 to 100 composite index
  trendingThemes: string[];
}

export interface SmartMoneySignal {
  tokenAddress: string;
  chainId: ChainId;
  smartMoneyBias: 'STRONG_ACCUMULATION' | 'MODERATE_ACCUMULATION' | 'NEUTRAL' | 'DISTRIBUTION' | 'HEAVY_DUMP';
  smartScore: number; // 0 to 100
  whaleCountInvolved: number;
  isSybilManipulated: boolean;
  sybilConfidence: number;
  netFlow5mUsd: number;
  summary: string;
}

export interface SmartMoneyConfig {
  enabled: boolean;
  minWhaleThresholdUsd: number;
  maxSybilCorrelationThreshold: number;
  lookbackMinutes: number;
}
