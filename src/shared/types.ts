// Types shared between Frontend, Express Backend and Cloudflare Workers
// Tipos compartidos entre Frontend, Express Backend y Cloudflare Workers

export enum ChainId {
  BASE = 'base',
  BSC = 'bsc'
}

export type MarketRegime = 'HIGH_VOLATILITY' | 'MOMENTUM' | 'DEAD' | 'CHOPPY';

export type SetupPattern = 'HIGH_LIQUIDITY_LAUNCH' | 'VELOCITY_BREAKOUT' | 'LOW_CAP_RALLY' | 'GRADUAL_ACCUMULATION';

export interface MarketHeatMetrics {
  newPairsCount5m: number;
  avgLiquidityUsd: number;
  gainerRatio: number; // 0.0 to 1.0 (% of green pairs)
  aggregatedVolume5m: number;
  heatLevel: 'COLD' | 'WARM' | 'HOT' | 'OVERHEATED';
  heatScore: number; // 0 to 100
}

export interface SetupExpectancy {
  patternType: SetupPattern;
  nameEs: string;
  nameEn: string;
  totalTrades: number;
  winningTrades: number;
  winRate: number; // 0 to 100
  avgWinPercent: number;
  avgLossPercent: number;
  expectancyPercent: number; // (winRate * avgWin) - (lossRate * avgLoss)
  status: 'PREFERRED' | 'NEUTRAL' | 'PENALIZED' | 'BLOCKED';
  allocationMultiplier: number; // 0.0 to 1.4x
}

export interface Eip7702SessionConfig {
  isEnabled: boolean;
  sessionKeyAddress: string;
  sessionPublicKey: string;
  targetDexRouter: string;
  maxDailyUsdSpend: number;
  currentUsdSpent: number;
  expiresAt: number;
  status: 'ACTIVE' | 'EXPIRED' | 'NOT_PROVISIONED';
}

export interface TokenSecurityReport {
  isHoneypot: boolean;
  buyTax: number; // percentage
  sellTax: number; // percentage
  isMintable: boolean;
  isOwnerRenounced: boolean;
  lpLockedPercent: number;
  topHoldersPercent: number; // concentration
  goplusScore: number; // 0 to 100 (100 = safe)
  errorMessage?: string;
  source: 'GoPlus' | 'Honeypot' | 'OnChainSimulation' | 'OnChainAuditor' | 'Fallback';
}

export interface MarketData {
  address: string;
  name: string;
  symbol: string;
  priceUsd: number;
  liquidityUsd: number;
  volume24h: number;
  pairCreatedAt: number;
  priceChangePercent5m: number;
  priceChangePercent1h: number;
  dexName: string;
  chainId: ChainId;
  setupPattern?: SetupPattern;
}

export interface LLMDecision {
  score: number; // 0 to 100
  action: 'BUY' | 'SKIP';
  reasonEs: string;
  reasonEn: string;
  recommendedSizeUsd: number;
  targetTakeProfitPercent: number;
  stopLossPercent: number;
  trailingStopPercent: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  providerUsed: 'Gemini' | 'Groq' | 'DeterministicFallback';
  latencyMs: number;
}

export interface OpportunitySignal {
  id: string;
  timestamp: number;
  token: MarketData;
  security: TokenSecurityReport;
  decision: LLMDecision;
  regimeAtEntry?: MarketRegime;
  setupPattern?: SetupPattern;
}

export interface ActivePosition {
  id: string; // matches opportunity id or token address
  tokenAddress: string;
  chainId: ChainId;
  name: string;
  symbol: string;
  buyPriceUsd: number;
  currentPriceUsd: number;
  sizeUsd: number; // Initial size
  amountTokens: number;
  buyTimestamp: number;
  lastUpdateTimestamp: number;
  highestPriceUsd: number; // For trailing stop calculation
  isPrincipalRecovered: boolean; // True if we sold 50% on 2x
  targetTakeProfitPercent: number;
  stopLossPercent: number;
  trailingStopPercent: number;
  isSimulation: boolean;
  pnlUsd: number;
  pnlPercent: number;
  regimeAtEntry?: MarketRegime;
  setupPattern?: SetupPattern;
  partialTakeLevel?: number; // 0: none, 1: 50% principal, 2: partial take
}

export interface HistoricalTrade {
  id: string;
  tokenAddress: string;
  chainId: ChainId;
  name: string;
  symbol: string;
  buyPriceUsd: number;
  sellPriceUsd: number;
  sizeUsd: number;
  buyTimestamp: number;
  sellTimestamp: number;
  pnlUsd: number;
  pnlPercent: number;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP' | 'LIQUIDITY_DROP' | 'MANUAL' | 'TIMEOUT';
  isSimulation: boolean;
  regimeAtEntry?: MarketRegime;
  setupPattern?: SetupPattern;
}

export interface RpcEndpoint {
  url: string;
  chainId: ChainId;
  name: string;
  isHealthy: boolean;
  latencyMs: number;
  lastCheckTimestamp: number;
  failureCount: number;
  isPrimary?: boolean;
}

export interface LLMProviderStatus {
  name: 'Gemini' | 'Groq';
  currentModel?: string;
  isHealthy: boolean;
  latencyMs: number;
  lastUsedTimestamp: number;
  circuitBreakerTripped: boolean;
  errorsInRow: number;
}

export interface ModelStatus {
  modelId: string;
  provider: 'Gemini' | 'Groq';
  isHealthy: boolean;
  errorsInRow: number;
  lastUsedTimestamp: number;
  exhaustedUntil: number; // 0 if not exhausted, otherwise UTC timestamp when it can be retried
}

export interface SystemHealth {
  lastExecutionTimestamp: number;
  rpcEndpoints: RpcEndpoint[];
  llmProviders: LLMProviderStatus[];
  telegramBotHealthy: boolean;
  rateLimitApproximation: number; // requests last 1 hour
  circuitBreakerActive: boolean;
  quotaExhaustedMode?: boolean;
  quotaResetTime?: number;
}

export interface SystemConfig {
  globalPause: boolean;
  simulationMode: boolean;
  maxDailyExposureUsd: number;
  maxTradeSizeUsd: number;
  minLiquidityUsd: number;
  maxBuyTaxPercent: number;
  maxSellTaxPercent: number;
  goplusMinScore: number;
  primaryLanguage: 'es' | 'en';
  telegramToken: string;
  telegramChatId: string;
  telegramEnabled: boolean;
  simulatedSlippagePercent: number;
  simulatedLatencyMs: number;
}

export interface SystemLog {
  id: string;
  timestamp: number;
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'TRADE';
  module: 'RPC' | 'SCANNER' | 'SECURITY' | 'LLM' | 'RISK' | 'EXECUTOR' | 'SYSTEM';
  messageEs: string;
  messageEn: string;
}

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number; // 0 to 100
  totalProfitUsd: number;
  initialCapitalUsd: number;
  currentCapitalUsd: number;
  highestCapitalUsd: number;
  dailyPnlUsd: number;
  maxDrawdownPercent: number;
  averageWinUsd: number;
  averageLossUsd: number;
  expectancyUsd: number;
  profitFactor: number;
}
