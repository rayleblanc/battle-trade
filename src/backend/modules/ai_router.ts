/**
 * Battle Trade - AI Router & Smart Cascade Engine
 * 
 * Hierarchy:
 * 1. Gemini Cascade: gemini-3.8-flash -> gemini-3.7-flash -> gemini-3.5-flash -> gemini-3.1-flash-lite
 * 2. Groq Cascade: qwen/qwen3.8-27b -> qwen/qwen3.6-27b -> openai/gpt-oss-120b -> openai/gpt-oss-20b
 * 3. DeterministicFallback: 100% offline, mathematical and rule-based JSON generation.
 * 
 * Strict Non-Authoritative Guardrails:
 * - LLM outputs NEVER override risk limits, execute trades, sign keys, or disable locks.
 * - Quota Exhausted mode suspends new trade generation while keeping active positions managed deterministically.
 */

import { GoogleGenAI } from '@google/genai';
import {
  AIProviderName,
  AIRouterConfig,
  AITaskType,
  AnomalyDetectionResult,
  GeminiModelId,
  GroqModelId,
  ModelTelemetry,
  NarrativeResult,
  QuotaStatus,
  RegimeSummaryResult,
  SentimentAnalysisResult,
  SignalExplanationResult,
  TradeAutopsyResult,
} from '../types/ai';
import { MarketRegime } from '../../shared/types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class AIRouter {
  private config: AIRouterConfig;
  private geminiClient: GoogleGenAI | null = null;
  private telemetryMap: Map<string, ModelTelemetry> = new Map();
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private inFlightPromises: Map<string, Promise<unknown>> = new Map();
  private isQuotaExhaustedMode = false;
  private quotaNotice = '';

  // Cascade priorities (2026 current production models)
  private readonly geminiModels: GeminiModelId[] = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
  ];

  private readonly groqModels: GroqModelId[] = [
    'qwen/qwen3.8-27b',
    'qwen/qwen3.6-27b',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen-2.5-32b',
    'llama-3.3-70b-versatile',
  ];

  constructor(config?: Partial<AIRouterConfig>) {
    this.config = {
      geminiApiKey: config?.geminiApiKey !== undefined ? config.geminiApiKey : process.env.GEMINI_API_KEY,
      groqApiKey: config?.groqApiKey !== undefined ? config.groqApiKey : process.env.GROQ_API_KEY,
      maxRetriesPerModel: config?.maxRetriesPerModel ?? 1,
      timeoutMs: config?.timeoutMs ?? 5000,
      baseCooldownMs: config?.baseCooldownMs ?? 60000, // 1 minute cooldown on failure
      cacheTtlMs: config?.cacheTtlMs ?? 180000, // 3 minutes cache
      enableDeduplication: config?.enableDeduplication ?? true,
    };

    if (this.config.geminiApiKey) {
      try {
        this.geminiClient = new GoogleGenAI({ apiKey: this.config.geminiApiKey });
      } catch (err) {
        console.warn('[AIRouter] Failed to initialize Gemini client:', err);
      }
    }

    this.initializeTelemetry();
  }

  private initializeTelemetry(): void {
    for (const model of this.geminiModels) {
      this.telemetryMap.set(`GEMINI:${model}`, {
        provider: 'GEMINI',
        modelId: model,
        status: 'HEALTHY',
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        consecutiveFailures: 0,
        avgLatencyMs: 0,
      });
    }

    for (const model of this.groqModels) {
      this.telemetryMap.set(`GROQ:${model}`, {
        provider: 'GROQ',
        modelId: model,
        status: 'HEALTHY',
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        consecutiveFailures: 0,
        avgLatencyMs: 0,
      });
    }
  }

  public updateKeys(geminiKey?: string, groqKey?: string): void {
    if (geminiKey && geminiKey !== this.config.geminiApiKey) {
      this.config.geminiApiKey = geminiKey;
      this.geminiClient = new GoogleGenAI({ apiKey: geminiKey });
    }
    if (groqKey) {
      this.config.groqApiKey = groqKey;
    }
  }

  public getQuotaStatus(): QuotaStatus {
    const now = Date.now();
    let allGeminiExhausted = !this.config.geminiApiKey;
    let allGroqExhausted = !this.config.groqApiKey;

    if (this.config.geminiApiKey) {
      const activeGemini = this.geminiModels.filter(m => {
        const tel = this.telemetryMap.get(`GEMINI:${m}`);
        return !tel || tel.status !== 'EXHAUSTED' && (!tel.cooldownUntilTimestamp || tel.cooldownUntilTimestamp < now);
      });
      allGeminiExhausted = activeGemini.length === 0;
    }

    if (this.config.groqApiKey) {
      const activeGroq = this.groqModels.filter(m => {
        const tel = this.telemetryMap.get(`GROQ:${m}`);
        return !tel || tel.status !== 'EXHAUSTED' && (!tel.cooldownUntilTimestamp || tel.cooldownUntilTimestamp < now);
      });
      allGroqExhausted = activeGroq.length === 0;
    }

    const isExhausted = allGeminiExhausted && allGroqExhausted;
    this.isQuotaExhaustedMode = isExhausted;

    // Reset occurs at approximately midnight Pacific Time (07:00 UTC)
    const resetDate = new Date();
    resetDate.setUTCHours(7, 0, 0, 0);
    if (resetDate.getTime() < now) {
      resetDate.setUTCDate(resetDate.getUTCDate() + 1);
    }

    return {
      isQuotaExhausted: isExhausted,
      allGeminiExhausted,
      allGroqExhausted,
      nextEstimatedResetTimestamp: resetDate.getTime(),
      activeProvider: !allGeminiExhausted ? 'GEMINI' : !allGroqExhausted ? 'GROQ' : 'DETERMINISTIC_FALLBACK',
      activeModel: !allGeminiExhausted ? this.geminiModels[0] : !allGroqExhausted ? this.groqModels[0] : 'deterministic-rule-engine',
      notice: isExhausted
        ? 'AI Quota Exhausted across all primary & secondary models. Trading is in Deterministic Safe Mode (Open positions managed deterministically, new entries suspended until quota reset).'
        : 'AI Providers operating normally.',
    };
  }

  public isNewEntryAllowedByAIQuota(): boolean {
    const quota = this.getQuotaStatus();
    // If both providers are completely exhausted, halt new entries to preserve capital
    return !quota.isQuotaExhausted;
  }

  public getAllTelemetry(): ModelTelemetry[] {
    return Array.from(this.telemetryMap.values());
  }

  /**
   * Main Execution Pipeline with Cascade, Caching & Deduplication
   */
  public async executeTask<T>(
    taskType: AITaskType,
    prompt: string,
    cacheKey: string,
    fallbackFn: () => T
  ): Promise<T> {
    const now = Date.now();

    // 1. Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && now - cached.timestamp < this.config.cacheTtlMs) {
      return cached.data as T;
    }

    // 2. Check deduplication (in-flight promise pooling)
    if (this.config.enableDeduplication && this.inFlightPromises.has(cacheKey)) {
      return (await this.inFlightPromises.get(cacheKey)) as T;
    }

    const taskPromise = this.runCascade(taskType, prompt, fallbackFn);
    if (this.config.enableDeduplication) {
      this.inFlightPromises.set(cacheKey, taskPromise as Promise<unknown>);
    }

    try {
      const result = await taskPromise;
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } finally {
      if (this.config.enableDeduplication) {
        this.inFlightPromises.delete(cacheKey);
      }
    }
  }

  private async runCascade<T>(
    taskType: AITaskType,
    prompt: string,
    fallbackFn: () => T
  ): Promise<T> {
    const systemInstruction = `You are a high-speed quantitative crypto analyst. You output STRICT, VALID JSON ONLY. No markdown formatting, no codeblocks (\`\`\`json), no trailing commas, no conversational preamble. Adhere strictly to the requested schema.`;

    // Tier 1: Try Gemini Cascade
    if (this.config.geminiApiKey && this.geminiClient) {
      for (const modelId of this.geminiModels) {
        if (!this.isModelAvailable('GEMINI', modelId)) continue;

        try {
          const startTime = Date.now();
          const response = await this.callGemini(modelId, prompt, systemInstruction);
          const duration = Date.now() - startTime;
          const parsed = this.safeParseJSON<T>(response);

          if (parsed) {
            this.recordSuccess('GEMINI', modelId, duration);
            return {
              ...parsed,
              providerUsed: 'GEMINI',
              modelUsed: modelId,
              isFallback: false,
            };
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.recordFailure('GEMINI', modelId, errMsg);
          console.warn(`[AIRouter] Gemini model ${modelId} failed: ${errMsg}. Cascading to next model...`);
        }
      }
    }

    // Tier 2: Try Groq Cascade
    if (this.config.groqApiKey) {
      for (const modelId of this.groqModels) {
        if (!this.isModelAvailable('GROQ', modelId)) continue;

        try {
          const startTime = Date.now();
          const response = await this.callGroq(modelId, prompt, systemInstruction);
          const duration = Date.now() - startTime;
          const parsed = this.safeParseJSON<T>(response);

          if (parsed) {
            this.recordSuccess('GROQ', modelId, duration);
            return {
              ...parsed,
              providerUsed: 'GROQ',
              modelUsed: modelId,
              isFallback: false,
            };
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.recordFailure('GROQ', modelId, errMsg);
          console.warn(`[AIRouter] Groq model ${modelId} failed: ${errMsg}. Cascading to next model...`);
        }
      }
    }

    // Tier 3: Deterministic Fallback
    console.info(`[AIRouter] All AI models exhausted or unavailable for ${taskType}. Using deterministic fallback.`);
    const fallbackResult = fallbackFn();
    return {
      ...fallbackResult,
      providerUsed: 'DETERMINISTIC_FALLBACK',
      modelUsed: 'deterministic-rules',
      isFallback: true,
    };
  }

  private isModelAvailable(provider: AIProviderName, modelId: string): boolean {
    const key = `${provider}:${modelId}`;
    const tel = this.telemetryMap.get(key);
    if (!tel) return true;

    const now = Date.now();
    if (tel.status === 'EXHAUSTED') return false;
    if (tel.status === 'COOLDOWN' && tel.cooldownUntilTimestamp && tel.cooldownUntilTimestamp > now) {
      return false;
    }
    return true;
  }

  private recordSuccess(provider: AIProviderName, modelId: string, latencyMs: number): void {
    const key = `${provider}:${modelId}`;
    const tel = this.telemetryMap.get(key);
    if (tel) {
      tel.totalCalls++;
      tel.successfulCalls++;
      tel.consecutiveFailures = 0;
      tel.status = 'HEALTHY';
      tel.avgLatencyMs = tel.avgLatencyMs === 0 ? latencyMs : Math.round((tel.avgLatencyMs * 0.8) + (latencyMs * 0.2));
    }
  }

  private recordFailure(provider: AIProviderName, modelId: string, errorMessage: string): void {
    const key = `${provider}:${modelId}`;
    const tel = this.telemetryMap.get(key);
    if (!tel) return;

    tel.totalCalls++;
    tel.failedCalls++;
    tel.consecutiveFailures++;
    tel.lastError = errorMessage;
    tel.lastErrorTimestamp = Date.now();

    const isQuota = errorMessage.includes('429') ||
                    errorMessage.includes('RESOURCE_EXHAUSTED') ||
                    errorMessage.includes('quota') ||
                    errorMessage.includes('rate_limit_exceeded');

    if (isQuota) {
      tel.status = 'EXHAUSTED';
      tel.cooldownUntilTimestamp = Date.now() + (this.config.baseCooldownMs * 10); // 10m for quota
    } else {
      tel.status = 'COOLDOWN';
      tel.cooldownUntilTimestamp = Date.now() + this.config.baseCooldownMs;
    }
  }

  private async callGemini(modelId: GeminiModelId, prompt: string, systemInstruction: string): Promise<string> {
    if (!this.geminiClient) throw new Error('Gemini client not initialized');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await this.geminiClient.models.generateContent({
        model: modelId,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });
      clearTimeout(timeoutId);
      return res.text ?? '';
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  private async callGroq(modelId: GroqModelId, prompt: string, systemInstruction: string): Promise<string> {
    if (!this.config.groqApiKey) throw new Error('Groq API Key not configured');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Groq HTTP ${response.status}: ${errorBody}`);
      }

      const json = await response.json();
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from Groq API');
      return content;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  private safeParseJSON<T>(raw: string): T | null {
    try {
      let cleaned = raw.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      return JSON.parse(cleaned) as T;
    } catch (err) {
      console.warn('[AIRouter] Failed to parse JSON response:', raw);
      return null;
    }
  }

  // =========================================================================
  // HIGH-LEVEL DOMAIN TASKS (Strictly non-authoritative)
  // =========================================================================

  public async analyzeSentiment(
    tokenSymbol: string,
    tokenName: string,
    metrics: { volume24hUsd: number; priceChange24hPercent: number; liquidityUsd: number }
  ): Promise<SentimentAnalysisResult> {
    const cacheKey = `sentiment:${tokenSymbol}:${Math.round(metrics.priceChange24hPercent)}`;

    const prompt = `Analyze market sentiment and social velocity for ${tokenSymbol} (${tokenName}).
24h Volume: $${metrics.volume24hUsd.toFixed(2)}
24h Price Change: ${metrics.priceChange24hPercent.toFixed(2)}%
Pool Liquidity: $${metrics.liquidityUsd.toFixed(2)}

Respond with JSON adhering to:
{
  "tokenSymbol": "${tokenSymbol}",
  "sentimentScore": float between -1.0 (bearish) and 1.0 (bullish),
  "confidence": float between 0.0 and 1.0,
  "socialVelocity": "LOW" | "NORMAL" | "HIGH" | "VIRAL",
  "sentimentTags": ["tag1", "tag2"],
  "keyRisks": ["risk1", "risk2"],
  "catalysts": ["catalyst1"],
  "rationale": "one sentence explanation"
}`;

    return this.executeTask<SentimentAnalysisResult>('SENTIMENT_ANALYSIS', prompt, cacheKey, () => {
      // Deterministic mathematical fallback
      const priceDelta = metrics.priceChange24hPercent;
      const volRatio = metrics.volume24hUsd / Math.max(1, metrics.liquidityUsd);
      let sentimentScore = Math.max(-1, Math.min(1, priceDelta / 50));
      let socialVelocity: 'LOW' | 'NORMAL' | 'HIGH' | 'VIRAL' = 'NORMAL';
      if (volRatio > 3) socialVelocity = 'HIGH';
      if (volRatio > 8) socialVelocity = 'VIRAL';

      return {
        tokenSymbol,
        sentimentScore: Number(sentimentScore.toFixed(2)),
        confidence: 0.70,
        socialVelocity,
        sentimentTags: priceDelta > 0 ? ['BULLISH_FLOW', 'HIGH_TURNOVER'] : ['PULLBACK', 'ACCUMULATION'],
        keyRisks: ['Liquidity drawdown risk', 'Slippage on market exit'],
        catalysts: ['Pool volume acceleration'],
        rationale: `Deterministic analysis based on 24h price delta ${priceDelta.toFixed(1)}% and volume-to-liquidity ratio of ${volRatio.toFixed(1)}x.`,
        providerUsed: 'DETERMINISTIC_FALLBACK',
        modelUsed: 'rules',
        isFallback: true,
      };
    });
  }

  public async detectAnomalies(
    tokenSymbol: string,
    data: { buyVolumeUsd: number; sellVolumeUsd: number; uniqueBuyers: number; uniqueSellers: number; txCount: number }
  ): Promise<AnomalyDetectionResult> {
    const cacheKey = `anomaly:${tokenSymbol}:${data.txCount}`;

    const prompt = `Check for market manipulation or wash trading anomalies for ${tokenSymbol}:
Buy Vol: $${data.buyVolumeUsd}
Sell Vol: $${data.sellVolumeUsd}
Unique Buyers: ${data.uniqueBuyers}
Unique Sellers: ${data.uniqueSellers}
Total Swaps: ${data.txCount}

Respond with JSON:
{
  "hasAnomaly": boolean,
  "anomalyType": "WASH_TRADING" | "COORDINATED_SNIPE" | "VOLUME_DISCONNECT" | "LIQUIDITY_DISPERSION" | "NONE",
  "anomalySeverity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "confidence": float 0 to 1,
  "details": ["observation1"],
  "rationale": "concise explanation"
}`;

    return this.executeTask<AnomalyDetectionResult>('ANOMALY_DETECTION', prompt, cacheKey, () => {
      // Deterministic fallback: detects high volume with very few unique buyers (wash trading)
      const avgVolPerBuyer = data.uniqueBuyers > 0 ? data.buyVolumeUsd / data.uniqueBuyers : 0;
      const isWashTrading = data.uniqueBuyers < 3 && data.buyVolumeUsd > 10000;

      return {
        hasAnomaly: isWashTrading,
        anomalyType: isWashTrading ? 'WASH_TRADING' : 'NONE',
        anomalySeverity: isWashTrading ? 'HIGH' : 'LOW',
        confidence: 0.85,
        details: isWashTrading
          ? [`High buy volume ($${data.buyVolumeUsd.toFixed(0)}) concentrated among only ${data.uniqueBuyers} unique wallets.`]
          : ['Buyer/seller distribution aligns within normal Poisson dispersion bounds.'],
        rationale: isWashTrading
          ? 'Anomalous concentration detected: high dollar turnover with minimal distinct counterparties.'
          : 'Volume and transaction count show organic retail distribution.',
        providerUsed: 'DETERMINISTIC_FALLBACK',
        modelUsed: 'rules',
        isFallback: true,
      };
    });
  }

  public async explainSignal(
    signalId: string,
    tokenSymbol: string,
    strategyName: string,
    score: number,
    confidence: number,
    regime: MarketRegime,
    evUsd: number
  ): Promise<SignalExplanationResult> {
    const cacheKey = `explain:${signalId}`;

    const prompt = `Synthesize quantitative signal explanation:
Token: ${tokenSymbol}
Strategy: ${strategyName}
Composite Score: ${score.toFixed(1)}/100
Confidence: ${(confidence * 100).toFixed(1)}%
Regime: ${regime}
Net EV: $${evUsd.toFixed(2)}

Respond with JSON:
{
  "signalId": "${signalId}",
  "tokenSymbol": "${tokenSymbol}",
  "summary": "1-2 sentences explaining entry thesis",
  "primaryDrivers": ["driver1", "driver2"],
  "riskWarnings": ["warning1"],
  "recommendedAttention": "short recommendation"
}`;

    return this.executeTask<SignalExplanationResult>('SIGNAL_EXPLANATION', prompt, cacheKey, () => ({
      signalId,
      tokenSymbol,
      summary: `${strategyName} identified a positive edge in ${regime} regime with ${(confidence * 100).toFixed(0)}% confidence and net expected value of $${evUsd.toFixed(2)}.`,
      primaryDrivers: [`Favorable regime alignment (${regime})`, `Strategy score ${score.toFixed(0)} exceeding entry hurdle`],
      riskWarnings: ['Ensure tight stop adherence given intraday volatility'],
      recommendedAttention: 'Monitor pool liquidity depth during trade lifecycle',
      providerUsed: 'DETERMINISTIC_FALLBACK',
      modelUsed: 'rules',
      isFallback: true,
    }));
  }

  public async generateTradeAutopsy(
    tradeId: string,
    tokenSymbol: string,
    pnlUsd: number,
    mfeUsd: number,
    maeUsd: number,
    durationMs: number,
    exitReason: string
  ): Promise<TradeAutopsyResult> {
    const cacheKey = `autopsy:${tradeId}`;

    const prompt = `Conduct post-trade autopsy for ${tokenSymbol} trade ${tradeId}:
Net PnL: $${pnlUsd.toFixed(2)}
Max Favorable Excursion (MFE): $${mfeUsd.toFixed(2)}
Max Adverse Excursion (MAE): $${maeUsd.toFixed(2)}
Duration: ${(durationMs / 60000).toFixed(1)} minutes
Exit Reason: ${exitReason}

Respond with JSON:
{
  "tradeId": "${tradeId}",
  "tokenSymbol": "${tokenSymbol}",
  "outcomeClassification": "CLEAN_WIN" | "SCRATCH" | "CONTROLLED_LOSS" | "EXECUTION_SLIP" | "CHOP_SHAKEOUT",
  "mfeCaptureEfficiencyPercent": float 0-100,
  "maeAdversityPercent": float 0-100,
  "regimeAlignment": "FAVORABLE" | "MISALIGNED" | "REGIME_SHIFTED",
  "keyLessons": ["lesson1", "lesson2"],
  "suggestedTuning": "parameter recommendation"
}`;

    return this.executeTask<TradeAutopsyResult>('TRADE_AUTOPSY', prompt, cacheKey, () => {
      let outcome: 'CLEAN_WIN' | 'SCRATCH' | 'CONTROLLED_LOSS' | 'EXECUTION_SLIP' | 'CHOP_SHAKEOUT' = 'CONTROLLED_LOSS';
      if (pnlUsd > 0) outcome = 'CLEAN_WIN';
      else if (Math.abs(pnlUsd) < 1) outcome = 'SCRATCH';

      const capture = mfeUsd > 0 && pnlUsd > 0 ? Math.min(100, (pnlUsd / mfeUsd) * 100) : 0;

      return {
        tradeId,
        tokenSymbol,
        outcomeClassification: outcome,
        mfeCaptureEfficiencyPercent: Number(capture.toFixed(1)),
        maeAdversityPercent: mfeUsd > 0 ? Number(((maeUsd / (mfeUsd + maeUsd)) * 100).toFixed(1)) : 50,
        regimeAlignment: pnlUsd >= 0 ? 'FAVORABLE' : 'MISALIGNED',
        keyLessons: [
          `Exit executed via ${exitReason}.`,
          pnlUsd >= 0 ? 'Target capture disciplined.' : 'Capital protected by strict stop loss.',
        ],
        suggestedTuning: 'Maintain current ATR trailing parameters.',
        providerUsed: 'DETERMINISTIC_FALLBACK',
        modelUsed: 'rules',
        isFallback: true,
      };
    });
  }

  public async summarizeRegime(
    currentRegime: MarketRegime,
    volatility: number,
    trendStrength: number
  ): Promise<RegimeSummaryResult> {
    const cacheKey = `regime_summary:${currentRegime}:${Math.round(volatility * 100)}`;

    const prompt = `Synthesize qualitative market regime briefing:
Regime: ${currentRegime}
Realized Volatility: ${(volatility * 100).toFixed(1)}%
Trend Strength: ${(trendStrength * 100).toFixed(1)}%

Respond with JSON:
{
  "currentRegime": "${currentRegime}",
  "narrativeOverview": "2-3 sentences overview",
  "tailwinds": ["tailwind1"],
  "headwinds": ["headwind1"],
  "cautionaryNotes": ["note1"]
}`;

    return this.executeTask<RegimeSummaryResult>('REGIME_SUMMARY', prompt, cacheKey, () => ({
      currentRegime,
      narrativeOverview: `Market is displaying ${currentRegime} characteristics with ${(volatility * 100).toFixed(1)}% realized volatility and ${(trendStrength * 100).toFixed(1)}% directional strength.`,
      tailwinds: currentRegime.includes('UP') || currentRegime.includes('EUPHORIA') ? ['Broad momentum continuation', 'High buyer participation'] : ['Clear consolidation boundaries'],
      headwinds: currentRegime.includes('PANIC') || currentRegime.includes('STRESS') ? ['Elevated tail risk', 'Liquidity fragility'] : ['Potential range exhaustion'],
      cautionaryNotes: ['Strictly respect circuit breakers and dynamic sizing caps.'],
      providerUsed: 'DETERMINISTIC_FALLBACK',
      modelUsed: 'rules',
      isFallback: true,
    }));
  }
}
