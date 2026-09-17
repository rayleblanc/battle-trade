// Types shared between Frontend, Express Backend and Cloudflare Workers
// Tipos compartidos entre Frontend, Express Backend y Cloudflare Workers

export enum ChainId {
  BASE = 'base',
  BSC = 'bsc'
}

export type MarketRegime = 
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'RANGE'
  | 'HIGH_VOL'
  | 'LOW_VOL'
  | 'PANIC'
  | 'EUPHORIA'
  | 'MEME_EUPHORIA'
  | 'MEME_PANIC'
  | 'LIQUIDITY_STRESS'
  | 'DATA_STRESS'
  | 'UNKNOWN'
  | 'RISK_ON'
  | 'RISK_OFF'
  | 'HIGH_VOLATILITY'
  | 'MOMENTUM'
  | 'DEAD'
  | 'CHOPPY';

export type MacroClimate = 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' | 'HIGH_VOLATILITY';

export type TradePermission = 'PERMITTED' | 'CAUTION_REDUCED_SIZE' | 'HALTED_MACRO_RISK';

export interface MarketContext {
  btcPriceUsd: number;
  btcChange24h: number;
  btcTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'DUMPING';
  macroClimate: MacroClimate;
  memecoinSectorHeat: 'COLD' | 'WARM' | 'HOT' | 'OVERHEATED';
  macroMultiplier: number; // 0.5 to 1.25x
  tradePermission: TradePermission;
  rationaleEs: string;
  rationaleEn: string;
  lastUpdated: number;
  source: 'Kraken' | 'Coinbase' | 'QuantFallback' | 'Coinbase/Kraken';
  fearAndGreedIndex?: number; // 0-100 from Alternative.me
  fearAndGreedClassification?: string; // Extreme Fear, Fear, Neutral, Greed, Extreme Greed
  dexPaprikaActive?: boolean;
  sectorBtcCorrelation?: number; // Pearson correlation between memecoins and BTC (-1 to 1)
  btcReturn24h?: number;
  btcVolatility24h?: number;
  ethReturn24h?: number;
  ethVolatility24h?: number;
}

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
  flags?: string[];
  honeypotIsConfirmed?: boolean;
  isLpBurned?: boolean;
  errorMessage?: string;
  source: 'GoPlus' | 'Honeypot' | 'OnChainSimulation' | 'OnChainAuditor' | 'Fallback';
}

export interface TechnicalIndicators {
  rsi14: number;
  macd: { macd: number; signal: number; histogram: number };
  bollingerBands: { upper: number; middle: number; lower: number };
  ema9: number;
  ema21: number;
  trendSignal: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'NEUTRAL';
}

export interface MarketData {
  address: string;
  name: string;
  symbol: string;
  priceUsd: number;
  liquidityUsd: number;
  volume24h: number;
  volume24hUsd?: number;
  marketCapUsd?: number;
  pairCreatedAt: number;
  priceChangePercent5m: number;
  priceChangePercent1h: number;
  dexName: string;
  chainId: ChainId;
  setupPattern?: SetupPattern;
  buyCount5m?: number;
  sellCount5m?: number;
  buyCount1h?: number;
  sellCount1h?: number;
  buyCount24h?: number;
  sellCount24h?: number;
  buySellRatio5m?: number;
  technicalIndicators?: TechnicalIndicators;
}

export interface Layer1SecurityReport {
  passed: boolean;
  score: number; // 0-100
  isHoneypot: boolean;
  lpLockedPercent: number;
  buyTax: number;
  sellTax: number;
  topHoldersPercent: number;
  flags: string[];
}

export interface Layer2MomentumReport {
  passed: boolean;
  score: number; // 0-100
  priceVelocity5m: number;
  priceAcceleration1h: number;
  volumeToLiquidityRatio: number;
  relativeVolumeGrade: 'ELITE' | 'STRONG' | 'MODERATE' | 'WEAK' | 'HIGH' | 'NORMAL';
}

export interface Layer3MacroReport {
  passed: boolean;
  score: number; // 0-100
  macroClimate: MacroClimate;
  btcTrend: string;
  sectorHeatLevel: string;
  sizingMultiplier: number;
}

export interface Layer4LearningReport {
  passed: boolean;
  score: number; // 0-100
  patternType: SetupPattern;
  expectancyStatus: 'PREFERRED' | 'NEUTRAL' | 'PENALIZED' | 'BLOCKED';
  patternWinRate: number;
  streakBonusMultiplier: number;
  recentStreak: number;
}

export interface MultiLayerDecision {
  compositeAlphaScore: number; // 0-100
  conviction: 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';
  action: 'BUY' | 'SKIP';
  recommendedSizeUsd: number;
  sizingMultiplier: number;
  targetTakeProfitPercent: number;
  stopLossPercent: number;
  trailingStopPercent: number;
  layer1Security: Layer1SecurityReport;
  layer2Momentum: Layer2MomentumReport;
  layer3Macro: Layer3MacroReport;
  layer4Learning: Layer4LearningReport;
  reasonEs: string;
  reasonEn: string;
  providerUsed: 'Gemini' | 'Groq' | 'DeterministicFallback';
  latencyMs: number;
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
  multiLayer?: MultiLayerDecision;
  compositeAlphaScore?: number;
}

export interface TradeFeatures {
  volumeToLiquidityRatio: number;
  priceVelocity5m: number;
  priceAcceleration1h: number;
  fearAndGreedScore: number;
  goplusScore: number;
  lpLockedPercent: number;
  btcPriceUsd: number;
  btcTrend: 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'DUMPING';
  holdingTimeMinutes?: number;
  compositeAlphaScore: number;
  liquidityUsd: number;
  volume24hUsd: number;
  volatilityRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
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
  compositeAlphaScore?: number;
  macroClimateAtEntry?: MacroClimate;
  featuresAtEntry?: TradeFeatures;
  volatilityRating?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  scoresAtEntry?: { secScore: number; momScore: number; macroScore: number; patternScore: number; };
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
  compositeAlphaScore?: number;
  macroClimateAtEntry?: MacroClimate;
  featuresAtEntry?: TradeFeatures;
  holdingTimeMinutes?: number;
  scoresAtEntry?: { secScore: number; momScore: number; macroScore: number; patternScore: number; };
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
  currentCapitalUsd?: number;
  engineRunning?: boolean;
}

export interface AdaptiveWeights {
  securityWeight: number;    // secScore weight (default 0.25)
  momentumWeight: number;    // momScore weight (default 0.35)
  macroWeight: number;       // macroScore weight (default 0.20)
  patternWeight: number;     // patternScore weight (default 0.20)
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
  minRiskPercentPerTrade: number;
  maxRiskPercentPerTrade: number;
}

export interface SystemLog {
  id: string;
  timestamp: number;
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'TRADE';
  module: 'RPC' | 'SCANNER' | 'SECURITY' | 'LLM' | 'RISK' | 'EXECUTOR' | 'SYSTEM' | 'MACRO';
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
  shortTermWinRate?: number; // Win rate in last 10-15 trades (0-100)
  recentStreak?: number; // Positive for wins (+3), negative for losses (-2)
  consecutiveWins?: number;
  consecutiveLosses?: number;
  daysRunning?: number; // Days active in 7-day marathon
}
