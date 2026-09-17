/**
 * Battle Trade - AI Router & Model Cascade Types
 * 
 * Non-Authoritative Architecture:
 * LLM models are strictly auxiliary and CANNOT:
 * - Authorize or execute orders directly
 * - Modify risk limits or circuit breakers
 * - Override security hard blocks
 * - Alter position sizing or leverage
 * - Enable live trading mode
 */

import { MarketRegime } from '../../shared/types';

export type AIProviderName = 'GEMINI' | 'GROQ' | 'DETERMINISTIC_FALLBACK';

export type GeminiModelId =
  | 'gemini-3.8-flash'
  | 'gemini-3.7-flash'
  | 'gemini-3.5-flash'
  | 'gemini-3.1-flash-lite'
  | 'gemini-flash-latest';

export type GroqModelId =
  | 'qwen/qwen3.8-27b'
  | 'qwen/qwen3.6-27b'
  | 'openai/gpt-oss-120b'
  | 'openai/gpt-oss-20b'
  | 'qwen/qwen-2.5-32b'
  | 'llama-3.3-70b-versatile';

export type AITaskType =
  | 'SENTIMENT_ANALYSIS'
  | 'NARRATIVE_EXTRACTION'
  | 'ANOMALY_DETECTION'
  | 'SIGNAL_EXPLANATION'
  | 'TRADE_AUTOPSY'
  | 'REGIME_SUMMARY';

export type ModelHealthStatus = 'HEALTHY' | 'DEGRADED' | 'COOLDOWN' | 'EXHAUSTED';

export interface ModelTelemetry {
  provider: AIProviderName;
  modelId: string;
  status: ModelHealthStatus;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  consecutiveFailures: number;
  lastError?: string;
  lastErrorTimestamp?: number;
  cooldownUntilTimestamp?: number;
  avgLatencyMs: number;
}

export interface AIRouterConfig {
  geminiApiKey?: string;
  groqApiKey?: string;
  maxRetriesPerModel: number;
  timeoutMs: number;
  baseCooldownMs: number;
  cacheTtlMs: number;
  enableDeduplication: boolean;
}

export interface SentimentAnalysisResult {
  tokenSymbol: string;
  sentimentScore: number; // -1.0 (extremely bearish) to +1.0 (extremely bullish)
  confidence: number; // 0.0 to 1.0
  socialVelocity: 'LOW' | 'NORMAL' | 'HIGH' | 'VIRAL';
  sentimentTags: string[];
  keyRisks: string[];
  catalysts: string[];
  rationale: string;
  providerUsed: AIProviderName;
  modelUsed: string;
  isFallback: boolean;
}

export interface NarrativeResult {
  dominantNarrative: string;
  memeTheme: string; // e.g. 'AI_AGENT', 'ANIMAL', 'POLITICAL', 'CULTURE'
  viralityPotentialScore: number; // 0 to 100
  ecosystemSynergy: string;
  lifespanEstimate: 'HOURS' | 'DAYS' | 'WEEKS' | 'UNKNOWN';
  rationale: string;
  providerUsed: AIProviderName;
  modelUsed: string;
  isFallback: boolean;
}

export interface AnomalyDetectionResult {
  hasAnomaly: boolean;
  anomalyType?: 'WASH_TRADING' | 'COORDINATED_SNIPE' | 'VOLUME_DISCONNECT' | 'LIQUIDITY_DISPERSION' | 'NONE';
  anomalySeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  details: string[];
  rationale: string;
  providerUsed: AIProviderName;
  modelUsed: string;
  isFallback: boolean;
}

export interface SignalExplanationResult {
  signalId: string;
  tokenSymbol: string;
  summary: string;
  primaryDrivers: string[];
  riskWarnings: string[];
  recommendedAttention: string;
  providerUsed: AIProviderName;
  modelUsed: string;
  isFallback: boolean;
}

export interface TradeAutopsyResult {
  tradeId: string;
  tokenSymbol: string;
  outcomeClassification: 'CLEAN_WIN' | 'SCRATCH' | 'CONTROLLED_LOSS' | 'EXECUTION_SLIP' | 'CHOP_SHAKEOUT';
  mfeCaptureEfficiencyPercent: number;
  maeAdversityPercent: number;
  regimeAlignment: 'FAVORABLE' | 'MISALIGNED' | 'REGIME_SHIFTED';
  keyLessons: string[];
  suggestedTuning?: string;
  providerUsed: AIProviderName;
  modelUsed: string;
  isFallback: boolean;
}

export interface RegimeSummaryResult {
  currentRegime: MarketRegime;
  narrativeOverview: string;
  tailwinds: string[];
  headwinds: string[];
  cautionaryNotes: string[];
  providerUsed: AIProviderName;
  modelUsed: string;
  isFallback: boolean;
}

export interface QuotaStatus {
  isQuotaExhausted: boolean;
  allGeminiExhausted: boolean;
  allGroqExhausted: boolean;
  nextEstimatedResetTimestamp: number;
  activeProvider: AIProviderName;
  activeModel: string;
  notice: string;
}
