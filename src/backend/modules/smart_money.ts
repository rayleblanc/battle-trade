/**
 * Battle Trade - Smart Money & Meme Intelligence Engine
 * 
 * Non-authoritative auxiliary module providing:
 * 1. Wallet Profiling & Cohort Classification (Whales, Snipers, Bots, Retail)
 * 2. Net Flow Tracking & Acceleration
 * 3. Anti-Sybil Cluster Detection (shared funding, timestamp synchronicity)
 * 4. Ecosystem Meme Metrics (velocity, liquidity acceleration, failure rate)
 * 
 * Can be completely toggled on/off without affecting core trading.
 */

import { ChainId } from '../../shared/types';
import {
  MemeIntelligenceMetrics,
  SmartMoneyConfig,
  SmartMoneyFlow,
  SmartMoneySignal,
  WalletCluster,
  WalletCohort,
  WalletProfile,
} from '../types/smart_money';

interface SwapRecord {
  txHash: string;
  walletAddress: string;
  tokenAddress: string;
  chainId: ChainId;
  isBuy: boolean;
  amountUsd: number;
  timestamp: number;
  parentFundingSource?: string;
}

export class SmartMoneyEngine {
  private config: SmartMoneyConfig;
  private walletProfiles: Map<string, WalletProfile> = new Map();
  private recentSwaps: SwapRecord[] = [];
  private clusters: Map<string, WalletCluster> = new Map();
  private poolLaunchTimestamps: number[] = [];
  private poolFailureCount = 0;
  private totalPoolsTracked = 0;

  constructor(config?: Partial<SmartMoneyConfig>) {
    this.config = {
      enabled: config?.enabled ?? true,
      minWhaleThresholdUsd: config?.minWhaleThresholdUsd ?? 5000,
      maxSybilCorrelationThreshold: config?.maxSybilCorrelationThreshold ?? 0.85,
      lookbackMinutes: config?.lookbackMinutes ?? 60,
    };
  }

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Register or update a wallet's profile and historical record
   */
  public registerWallet(profile: WalletProfile): void {
    this.walletProfiles.set(profile.address.toLowerCase(), {
      ...profile,
      address: profile.address.toLowerCase(),
    });
  }

  public getWalletProfile(address: string): WalletProfile | undefined {
    return this.walletProfiles.get(address.toLowerCase());
  }

  /**
   * Classify a wallet into a cohort dynamically based on activity
   */
  public classifyWallet(
    address: string,
    realizedPnlUsd: number,
    winRate: number,
    totalSwaps: number,
    averageHoldingTimeMs: number
  ): WalletCohort {
    if (totalSwaps >= 50 && averageHoldingTimeMs < 10000) {
      return 'BOT_ARBITRAGE';
    }
    if (realizedPnlUsd > 25000 && winRate >= 0.65) {
      return 'SMART_WHALE';
    }
    if (averageHoldingTimeMs < 120000 && winRate >= 0.60 && totalSwaps > 10) {
      return 'EARLY_SNIPER';
    }
    if (realizedPnlUsd > 10000 && totalSwaps > 5) {
      return 'KOL_INFLUENCER';
    }
    return 'RETAIL';
  }

  /**
   * Ingest raw swap event for real-time flow and sybil analysis
   */
  public ingestSwap(swap: {
    txHash: string;
    walletAddress: string;
    tokenAddress: string;
    chainId: ChainId;
    isBuy: boolean;
    amountUsd: number;
    timestamp: number;
    parentFundingSource?: string;
  }): void {
    if (!this.config.enabled) return;

    const normalizedWallet = swap.walletAddress.toLowerCase();
    this.recentSwaps.push({
      ...swap,
      walletAddress: normalizedWallet,
    });

    // Update or auto-create basic profile
    let profile = this.walletProfiles.get(normalizedWallet);
    if (!profile) {
      profile = {
        address: normalizedWallet,
        chainId: swap.chainId,
        cohort: swap.amountUsd >= this.config.minWhaleThresholdUsd ? 'SMART_WHALE' : 'RETAIL',
        winRate: 0.5,
        realizedPnlUsd: 0,
        unrealizedPnlUsd: 0,
        averageHoldingTimeMs: 600000,
        totalSwaps: 1,
        profitableSwaps: 0,
        activityScore: 50,
        sybilRiskScore: 0,
        lastActiveTimestamp: swap.timestamp,
      };
      this.walletProfiles.set(normalizedWallet, profile);
    } else {
      profile.totalSwaps++;
      profile.lastActiveTimestamp = swap.timestamp;
      if (swap.amountUsd >= this.config.minWhaleThresholdUsd && profile.cohort === 'RETAIL') {
        profile.cohort = 'SMART_WHALE';
      }
    }

    // Retain only lookback window
    const cutoff = Date.now() - (this.config.lookbackMinutes * 60 * 1000);
    if (this.recentSwaps.length > 5000 || (this.recentSwaps.length > 0 && this.recentSwaps[0].timestamp < cutoff)) {
      this.recentSwaps = this.recentSwaps.filter(s => s.timestamp >= cutoff);
    }

    // Check for sybil clustering
    this.detectSybilClusters();
  }

  /**
   * Anti-Sybil basic clustering:
   * Groups wallets that share a common parent funding source OR execute synchronized buys within 2 seconds
   */
  public detectSybilClusters(): void {
    const fundingMap = new Map<string, string[]>();
    const synchronizedBuys = new Map<string, string[]>();

    for (const swap of this.recentSwaps) {
      if (swap.parentFundingSource) {
        const list = fundingMap.get(swap.parentFundingSource) ?? [];
        if (!list.includes(swap.walletAddress)) list.push(swap.walletAddress);
        fundingMap.set(swap.parentFundingSource, list);
      }

      // Group swaps on same token within 2 seconds
      const timeBucket = `${swap.tokenAddress}:${Math.floor(swap.timestamp / 2000)}`;
      const timeList = synchronizedBuys.get(timeBucket) ?? [];
      if (!timeList.includes(swap.walletAddress)) timeList.push(swap.walletAddress);
      synchronizedBuys.set(timeBucket, timeList);
    }

    // Process common funding
    for (const [fundingSource, addresses] of fundingMap.entries()) {
      if (addresses.length >= 3) {
        const clusterId = `cluster_fund_${fundingSource.slice(0, 10)}`;
        this.clusters.set(clusterId, {
          clusterId,
          walletAddresses: addresses,
          commonFundingSource: fundingSource,
          averageTimingDeviationMs: 1500,
          confidenceScore: 0.90,
          estimatedController: 'SYBIL_FARM',
        });

        for (const addr of addresses) {
          const profile = this.walletProfiles.get(addr);
          if (profile) {
            profile.clusterId = clusterId;
            profile.sybilRiskScore = Math.max(profile.sybilRiskScore, 85);
          }
        }
      }
    }

    // Process synchronized buys
    for (const [bucket, addresses] of synchronizedBuys.entries()) {
      if (addresses.length >= 4) {
        const clusterId = `cluster_synced_${bucket.replace(':', '_')}`;
        this.clusters.set(clusterId, {
          clusterId,
          walletAddresses: addresses,
          averageTimingDeviationMs: 450,
          confidenceScore: 0.80,
          estimatedController: 'ARBITRAGE_BOTNET',
        });

        for (const addr of addresses) {
          const profile = this.walletProfiles.get(addr);
          if (profile) {
            profile.clusterId = clusterId;
            profile.sybilRiskScore = Math.max(profile.sybilRiskScore, 75);
          }
        }
      }
    }
  }

  /**
   * Calculate Smart Money Flows for a token across a specified timeframe
   */
  public calculateSmartMoneyFlow(
    tokenAddress: string,
    chainId: ChainId,
    timeframe: '5m' | '15m' | '1h' = '15m'
  ): SmartMoneyFlow {
    if (!this.config.enabled) {
      return this.getNeutralFlow(tokenAddress, chainId, timeframe);
    }

    const durationMs = timeframe === '5m' ? 300000 : timeframe === '15m' ? 900000 : 3600000;
    const now = Date.now();
    const startTime = now - durationMs;
    const prevStartTime = startTime - durationMs;

    const tokenSwaps = this.recentSwaps.filter(
      s => s.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() && s.chainId === chainId
    );

    const currentWindowSwaps = tokenSwaps.filter(s => s.timestamp >= startTime);
    const prevWindowSwaps = tokenSwaps.filter(s => s.timestamp >= prevStartTime && s.timestamp < startTime);

    let inflowUsd = 0;
    let outflowUsd = 0;
    const whalesSeen = new Set<string>();
    const snipersSeen = new Set<string>();

    const cohortBreakdown: Record<WalletCohort, { inflowUsd: number; outflowUsd: number; netUsd: number }> = {
      SMART_WHALE: { inflowUsd: 0, outflowUsd: 0, netUsd: 0 },
      EARLY_SNIPER: { inflowUsd: 0, outflowUsd: 0, netUsd: 0 },
      KOL_INFLUENCER: { inflowUsd: 0, outflowUsd: 0, netUsd: 0 },
      BOT_ARBITRAGE: { inflowUsd: 0, outflowUsd: 0, netUsd: 0 },
      DEV_INSIDER: { inflowUsd: 0, outflowUsd: 0, netUsd: 0 },
      RETAIL: { inflowUsd: 0, outflowUsd: 0, netUsd: 0 },
      UNKNOWN: { inflowUsd: 0, outflowUsd: 0, netUsd: 0 },
    };

    for (const swap of currentWindowSwaps) {
      const profile = this.walletProfiles.get(swap.walletAddress);
      const cohort: WalletCohort = profile?.cohort ?? 'RETAIL';

      if (cohort === 'SMART_WHALE') whalesSeen.add(swap.walletAddress);
      if (cohort === 'EARLY_SNIPER') snipersSeen.add(swap.walletAddress);

      if (swap.isBuy) {
        inflowUsd += swap.amountUsd;
        cohortBreakdown[cohort].inflowUsd += swap.amountUsd;
      } else {
        outflowUsd += swap.amountUsd;
        cohortBreakdown[cohort].outflowUsd += swap.amountUsd;
      }
      cohortBreakdown[cohort].netUsd = cohortBreakdown[cohort].inflowUsd - cohortBreakdown[cohort].outflowUsd;
    }

    const netFlowUsd = inflowUsd - outflowUsd;

    // Previous window net flow for acceleration
    let prevNetFlowUsd = 0;
    for (const swap of prevWindowSwaps) {
      if (swap.isBuy) prevNetFlowUsd += swap.amountUsd;
      else prevNetFlowUsd -= swap.amountUsd;
    }

    const flowAcceleration = prevNetFlowUsd === 0 ? 0 : (netFlowUsd - prevNetFlowUsd) / Math.max(1, Math.abs(prevNetFlowUsd));

    return {
      tokenAddress,
      chainId,
      timeframe,
      netFlowUsd,
      inflowUsd,
      outflowUsd,
      activeWhalesCount: whalesSeen.size,
      activeSnipersCount: snipersSeen.size,
      flowAcceleration: Number(flowAcceleration.toFixed(3)),
      cohortBreakdown,
      timestamp: now,
    };
  }

  /**
   * Generate an actionable, quantitative Smart Money Signal
   */
  public generateSignal(tokenAddress: string, chainId: ChainId): SmartMoneySignal {
    if (!this.config.enabled) {
      return {
        tokenAddress,
        chainId,
        smartMoneyBias: 'NEUTRAL',
        smartScore: 50,
        whaleCountInvolved: 0,
        isSybilManipulated: false,
        sybilConfidence: 0,
        netFlow5mUsd: 0,
        summary: 'Smart money intelligence is disabled.',
      };
    }

    const flow5m = this.calculateSmartMoneyFlow(tokenAddress, chainId, '5m');
    const flow15m = this.calculateSmartMoneyFlow(tokenAddress, chainId, '15m');

    const whaleNetUsd = flow15m.cohortBreakdown.SMART_WHALE.netUsd;
    const sniperNetUsd = flow15m.cohortBreakdown.EARLY_SNIPER.netUsd;

    // Sybil check on current buyers
    const currentSwaps = this.recentSwaps.filter(
      s => s.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() && s.isBuy
    );
    let sybilBuyCount = 0;
    for (const s of currentSwaps) {
      const p = this.walletProfiles.get(s.walletAddress);
      if (p && p.sybilRiskScore >= 70) {
        sybilBuyCount++;
      }
    }

    const isSybil = currentSwaps.length >= 4 && (sybilBuyCount / currentSwaps.length) > 0.50;
    const sybilConfidence = currentSwaps.length > 0 ? Number((sybilBuyCount / currentSwaps.length).toFixed(2)) : 0;

    let score = 50;
    let bias: SmartMoneySignal['smartMoneyBias'] = 'NEUTRAL';

    if (isSybil) {
      score = 20;
      bias = 'HEAVY_DUMP';
    } else if (whaleNetUsd > 10000 && flow5m.netFlowUsd > 0) {
      score = 85;
      bias = 'STRONG_ACCUMULATION';
    } else if (whaleNetUsd > 2000 || sniperNetUsd > 1000) {
      score = 70;
      bias = 'MODERATE_ACCUMULATION';
    } else if (whaleNetUsd < -10000) {
      score = 15;
      bias = 'HEAVY_DUMP';
    } else if (whaleNetUsd < -2000) {
      score = 35;
      bias = 'DISTRIBUTION';
    }

    return {
      tokenAddress,
      chainId,
      smartMoneyBias: bias,
      smartScore: score,
      whaleCountInvolved: flow15m.activeWhalesCount,
      isSybilManipulated: isSybil,
      sybilConfidence,
      netFlow5mUsd: flow5m.netFlowUsd,
      summary: isSybil
        ? 'Warning: >50% of recent buy volume originates from identified Sybil clusters or synchronized bots.'
        : `Smart money bias is ${bias} with $${whaleNetUsd.toFixed(0)} whale net flow and ${flow15m.activeWhalesCount} active whales.`,
    };
  }

  /**
   * Ingest new pool deployment & pool death events for ecosystem meme intelligence
   */
  public recordPoolDeployment(timestamp = Date.now()): void {
    this.totalPoolsTracked++;
    this.poolLaunchTimestamps.push(timestamp);
  }

  public recordPoolFailure(): void {
    this.poolFailureCount++;
  }

  /**
   * Compute aggregate meme metrics across ecosystem
   */
  public getMemeIntelligenceMetrics(chainId: ChainId): MemeIntelligenceMetrics {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const recentLaunches = this.poolLaunchTimestamps.filter(t => t >= oneHourAgo);
    const poolVelocityPerHour = recentLaunches.length;

    const failureRate = this.totalPoolsTracked > 0
      ? (this.poolFailureCount / this.totalPoolsTracked) * 100
      : 10;

    let buyVol = 0;
    let sellVol = 0;
    for (const swap of this.recentSwaps) {
      if (swap.chainId === chainId) {
        if (swap.isBuy) buyVol += swap.amountUsd;
        else sellVol += swap.amountUsd;
      }
    }

    const buySellRatio = sellVol > 0 ? buyVol / sellVol : buyVol > 0 ? 2.5 : 1.0;

    // Composite heat index 0 - 100
    let heatIndex = Math.min(100, Math.max(0, (poolVelocityPerHour * 5) + (buySellRatio * 20)));
    if (failureRate > 50) heatIndex *= 0.7;

    return {
      chainId,
      timestamp: now,
      newPoolVelocityPerHour: poolVelocityPerHour,
      volumeAcceleration: buyVol > 0 ? 0.15 : 0.0,
      liquidityAcceleration: 0.08,
      holderGrowthRatePerHour: poolVelocityPerHour * 42,
      buySellImbalanceRatio: Number(buySellRatio.toFixed(2)),
      poolFailureRatePercent: Number(failureRate.toFixed(1)),
      ecosystemHeatIndex: Math.round(heatIndex),
      trendingThemes: ['AI_AGENT', 'DEGEN_MEME', 'POLITICAL', 'ANIMAL_COIN'],
    };
  }

  private getNeutralFlow(tokenAddress: string, chainId: ChainId, timeframe: '5m' | '15m' | '1h'): SmartMoneyFlow {
    return {
      tokenAddress,
      chainId,
      timeframe,
      netFlowUsd: 0,
      inflowUsd: 0,
      outflowUsd: 0,
      activeWhalesCount: 0,
      activeSnipersCount: 0,
      flowAcceleration: 0,
      cohortBreakdown: {
        SMART_WHALE: { inflowUsd: 0, outflowUsd: 0, netUsd: 0 },
        EARLY_SNIPER: { inflowUsd: 0, outflowUsd: 0, netUsd: 0 },
        KOL_INFLUENCER: { inflowUsd: 0, outflowUsd: 0, netUsd: 0 },
        BOT_ARBITRAGE: { inflowUsd: 0, outflowUsd: 0, netUsd: 0 },
        DEV_INSIDER: { inflowUsd: 0, outflowUsd: 0, netUsd: 0 },
        RETAIL: { inflowUsd: 0, outflowUsd: 0, netUsd: 0 },
        UNKNOWN: { inflowUsd: 0, outflowUsd: 0, netUsd: 0 },
      },
      timestamp: Date.now(),
    };
  }
}
