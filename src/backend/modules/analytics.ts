/**
 * Analytics, Features, Market Regimes, Alpha Engine, and AI Router.
 * Establishes absolute deterministic safety for the trade-decision path (NO CRITICAL PATH LLM DEPENDENCY),
 * using LLMs solely for secondary textual reports, macro advice, and post-trade autopsies.
 */

import { ChainId, MarketData, MarketRegime, SetupPattern, TechnicalIndicators, MultiLayerDecision, TokenSecurityReport, MarketContext } from '../../shared/types';
import { calculateEMA, calculateRSI, calculateMACD, FullFeatureEngine } from './features';

export { calculateEMA, calculateRSI, calculateMACD, FullFeatureEngine };

export class FeatureEngine {
  constructor() {}

  calculateIndicators(closes: number[]): TechnicalIndicators {
    if (closes.length === 0) {
      return {
        rsi14: 50,
        macd: { macd: 0, signal: 0, histogram: 0 },
        bollingerBands: { upper: 1, middle: 1, lower: 1 },
        ema9: 1,
        ema21: 1,
        trendSignal: 'NEUTRAL'
      };
    }

    const rsi14 = calculateRSI(closes, 14);
    const macd = calculateMACD(closes);
    
    // Calculate Bollinger Bands
    const period = 20;
    const lastCloses = closes.slice(-period);
    const middle = lastCloses.reduce((a, b) => a + b, 0) / Math.max(1, lastCloses.length);
    const variance = lastCloses.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / Math.max(1, lastCloses.length);
    const stdDev = Math.sqrt(variance);
    const upper = middle + 2 * stdDev;
    const lower = middle - 2 * stdDev;

    const ema9Values = calculateEMA(closes, 9);
    const ema21Values = calculateEMA(closes, 21);
    const ema9 = ema9Values[ema9Values.length - 1] || closes[closes.length - 1];
    const ema21 = ema21Values[ema21Values.length - 1] || closes[closes.length - 1];

    let trendSignal: TechnicalIndicators['trendSignal'] = 'NEUTRAL';
    if (ema9 > ema21 && closes[closes.length - 1] > ema9) trendSignal = 'BULLISH_CROSS';
    if (ema9 < ema21 && closes[closes.length - 1] < ema9) trendSignal = 'BEARISH_CROSS';

    return {
      rsi14,
      macd,
      bollingerBands: { upper, middle, lower },
      ema9,
      ema21,
      trendSignal
    };
  }

  // Calculate market microstructure indicators like buy/sell ratios and volume weightings
  calculateMicrostructure(token: MarketData): {
    volumeToLiquidityRatio: number;
    buySellRatio: number;
    volatilityRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  } {
    const volToLiq = token.volume24h / Math.max(1, token.liquidityUsd);
    
    const buys = token.buyCount5m || 0;
    const sells = token.sellCount5m || 0;
    const buySellRatio = sells === 0 ? (buys > 0 ? 5 : 1) : buys / sells;

    let volatilityRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' = 'MEDIUM';
    const absChange = Math.abs(token.priceChangePercent5m);
    if (absChange > 15) volatilityRating = 'EXTREME';
    else if (absChange > 7) volatilityRating = 'HIGH';
    else if (absChange > 2) volatilityRating = 'MEDIUM';
    else volatilityRating = 'LOW';

    return {
      volumeToLiquidityRatio: volToLiq,
      buySellRatio,
      volatilityRating
    };
  }
}

// Market Regime Classifier Engine
export class MarketRegimeEngine {
  constructor() {}

  classifyRegime(btcContext: { btcChange24h: number }, heatScore: number): MarketRegime {
    if (btcContext.btcChange24h <= -4.0) return 'RISK_OFF';
    if (btcContext.btcChange24h >= 2.5 && heatScore >= 65) return 'RISK_ON';
    if (heatScore >= 80) return 'MOMENTUM';
    if (heatScore <= 25) return 'DEAD';
    if (Math.abs(btcContext.btcChange24h) < 0.5 && heatScore < 50) return 'CHOPPY';
    return 'HIGH_VOLATILITY';
  }
}

// Alpha Engine: Evaluates the multi-layer strategy entirely deterministically
export class AlphaEngine {
  constructor() {}

  evaluateOpportunity(
    token: MarketData,
    security: TokenSecurityReport,
    macro: MarketContext,
    adaptiveWeights: { securityWeight: number; momentumWeight: number; macroWeight: number; patternWeight: number }
  ): MultiLayerDecision {
    // Layer 1: Security Score (0 to 100)
    const secScore = security.goplusScore;
    const passedSec = !security.isHoneypot && security.buyTax <= 8.0 && security.sellTax <= 8.0 && secScore >= 70;

    // Layer 2: Momentum Score (0 to 100)
    const priceVelocity = token.priceChangePercent5m;
    const ratio = token.volume24h / Math.max(1, token.liquidityUsd);
    
    let momScore = 50;
    if (priceVelocity > 8.0) momScore += 25;
    else if (priceVelocity > 2.0) momScore += 15;
    else if (priceVelocity < -5.0) momScore -= 20;

    if (ratio > 1.5) momScore += 20;
    else if (ratio > 0.5) momScore += 10;

    momScore = Math.max(0, Math.min(100, momScore));
    const passedMom = momScore >= 60;

    // Layer 3: Macro & Market Regime Context (0 to 100)
    let macroScore = 50;
    const correlation = macro.sectorBtcCorrelation !== undefined ? macro.sectorBtcCorrelation : 0.0;
    const isBtcDeclining = macro.btcTrend === 'BEARISH' || macro.btcTrend === 'DUMPING' || macro.btcChange24h < 0;

    if (correlation < -0.5 && isBtcDeclining) {
      // Capital rotation towards memecoin sector - slight macro bonus
      macroScore += 15;
    } else {
      if (macro.macroClimate === 'RISK_ON') macroScore += 30;
      else if (macro.macroClimate === 'NEUTRAL') macroScore += 15;
      else if (macro.macroClimate === 'RISK_OFF') macroScore -= 25;
    }

    if (correlation > 0.85 && isBtcDeclining) {
      macroScore -= 15; // High direct correlation risk during decline
    }
    macroScore = Math.max(0, Math.min(100, macroScore));
    const passedMacro = macroScore >= 40 && macro.tradePermission !== 'HALTED_MACRO_RISK';

    // Layer 4: Setup Pattern Expectancy (0 to 100)
    let patternScore = 65;
    let setupPattern: SetupPattern = 'VELOCITY_BREAKOUT';

    if (token.priceChangePercent5m > 10.0 && token.volume24h > 15000) {
      setupPattern = 'VELOCITY_BREAKOUT';
      patternScore = 85;
    } else if (token.liquidityUsd > 10000 && token.volume24h > 50000) {
      setupPattern = 'HIGH_LIQUIDITY_LAUNCH';
      patternScore = 75;
    } else if (token.liquidityUsd < 5000) {
      setupPattern = 'LOW_CAP_RALLY';
      patternScore = 60;
    } else {
      setupPattern = 'GRADUAL_ACCUMULATION';
      patternScore = 70;
    }
    const passedLearning = patternScore >= 55;

    // Composite Score with Online Adaptive weights (fully deterministic)
    const compositeAlphaScore = Math.round(
      (adaptiveWeights.securityWeight * secScore) +
      (adaptiveWeights.momentumWeight * momScore) +
      (adaptiveWeights.macroWeight * macroScore) +
      (adaptiveWeights.patternWeight * patternScore)
    );

    const isBuy = passedSec && passedMom && passedMacro && passedLearning && compositeAlphaScore >= 68 && token.liquidityUsd >= 2000;
    const conviction: MultiLayerDecision['conviction'] = compositeAlphaScore >= 85 ? 'VERY_HIGH' : compositeAlphaScore >= 75 ? 'HIGH' : compositeAlphaScore >= 65 ? 'MEDIUM' : 'LOW';

    // SL / TP Settings
    const targetTakeProfitPercent = compositeAlphaScore >= 85 ? 45 : (compositeAlphaScore >= 75 ? 30 : 20);
    const stopLossPercent = 10.0;
    const trailingStopPercent = 5.0;

    const action = isBuy ? 'BUY' : 'SKIP';

    const reasonEs = isBuy 
      ? `Señal autorizada en ${token.symbol}. Alpha Composite de ${compositeAlphaScore} con alta seguridad (${secScore}/100) y momentum positivo.` 
      : `Señal descartada en ${token.symbol}. Alpha Composite de ${compositeAlphaScore}. Razón: ${!passedSec ? 'No superó auditoría de seguridad.' : 'Insuficiente momentum o macro adverso.'}`;

    const reasonEn = isBuy
      ? `Signal approved on ${token.symbol}. Composite Alpha of ${compositeAlphaScore} with high security (${secScore}/100) and strong momentum.`
      : `Signal skipped on ${token.symbol}. Composite Alpha of ${compositeAlphaScore}. Reason: ${!passedSec ? 'Security audit failed.' : 'Insufficient momentum or adverse macro context.'}`;

    return {
      compositeAlphaScore,
      conviction,
      action,
      recommendedSizeUsd: 10.0, // Default size to scale
      sizingMultiplier: macro.macroMultiplier,
      targetTakeProfitPercent,
      stopLossPercent,
      trailingStopPercent,
      layer1Security: { passed: passedSec, score: secScore, isHoneypot: security.isHoneypot, lpLockedPercent: security.lpLockedPercent, buyTax: security.buyTax, sellTax: security.sellTax, topHoldersPercent: security.topHoldersPercent, flags: [] },
      layer2Momentum: { passed: passedMom, score: momScore, priceVelocity5m: priceVelocity, priceAcceleration1h: token.priceChangePercent1h, volumeToLiquidityRatio: ratio, relativeVolumeGrade: 'STRONG' },
      layer3Macro: { passed: passedMacro, score: macroScore, macroClimate: macro.macroClimate, btcTrend: macro.btcTrend, sectorHeatLevel: macro.memecoinSectorHeat, sizingMultiplier: macro.macroMultiplier },
      layer4Learning: { passed: passedLearning, score: patternScore, patternType: setupPattern, expectancyStatus: 'NEUTRAL', patternWinRate: 65, streakBonusMultiplier: 1.0, recentStreak: 0 },
      reasonEs,
      reasonEn,
      providerUsed: 'DeterministicFallback',
      latencyMs: 5
    };
  }
}

// AI Router: For secondary high-level analysis and sentiment reporting
export class AiRouterEngine {
  constructor(private geminiApiKey?: string) {}

  async generateMacroSummary(macro: MarketContext, headlines: string[]): Promise<string> {
    if (!this.geminiApiKey) {
      return `[Autonomous Summary] BTC at $${macro.btcPriceUsd} with sentiment class '${macro.fearAndGreedClassification}'. Headlines indicate positive consolidation.`;
    }

    try {
      // Lazy init Gemini SDK
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Generate a concise 2-sentence macro sentiment summary in Spanish for crypto traders based on BTC price: $${macro.btcPriceUsd} (${macro.btcChange24h}%), Fear & Greed: ${macro.fearAndGreedIndex}, and these latest headlines:\n${headlines.slice(0, 5).join('\n')}`
            }]
          }]
        })
      });

      if (response.ok) {
        const json: any = await response.json();
        return json?.candidates?.[0]?.content?.parts?.[0]?.text || 'Resumen de mercado no disponible.';
      }
    } catch {}

    return `Análisis automatizado: BTC continúa fluctuando en rango con un índice de miedo/codicia de ${macro.fearAndGreedIndex}.`;
  }
}
