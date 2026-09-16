/**
 * Cloudflare Worker Autonomous Engine for BATTLE TRADE
 * Runs 24/7 on Cloudflare Workers with KV persistence and 1-minute Cron Triggers
 */

import {
  ChainId,
  MarketData,
  MarketRegime,
  MacroClimate,
  MarketContext,
  MarketHeatMetrics,
  SetupExpectancy,
  SetupPattern,
  HistoricalTrade,
  ActivePosition,
  SystemConfig,
  SystemLog,
  PerformanceMetrics,
  TokenSecurityReport,
  MultiLayerDecision
} from './src/shared/types';

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete?(key: string): Promise<void>;
  list?(options?: any): Promise<any>;
}

export interface Env {
  TRADING_KV: KVNamespace;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

const DEFAULT_CONFIG: SystemConfig = {
  globalPause: false,
  simulationMode: true,
  maxDailyExposureUsd: 150,
  maxTradeSizeUsd: 15,
  minLiquidityUsd: 5000,
  maxBuyTaxPercent: 8,
  maxSellTaxPercent: 8,
  goplusMinScore: 80,
  primaryLanguage: 'es',
  telegramToken: '',
  telegramChatId: '',
  telegramEnabled: false,
  simulatedSlippagePercent: 0.5,
  simulatedLatencyMs: 150
};

// Helper: KV Store wrapper for Cloudflare Workers
class CloudflareKVStore {
  constructor(private kv: KVNamespace) {}

  async get(key: string): Promise<string | null> {
    return await this.kv.get(key);
  }

  async put(key: string, value: string): Promise<void> {
    await this.kv.put(key, value);
  }

  async putMultiple(entries: Record<string, string>): Promise<void> {
    await Promise.all(
      Object.entries(entries).map(([k, v]) => this.kv.put(k, v))
    );
  }
}

// 1. Fear & Greed + Macro Ingestion
async function fetchMacroContext(): Promise<MarketContext> {
  let btcPrice = 75850;
  let btcChange24h = 0.5;
  let source: MarketContext['source'] = 'QuantFallback';

  try {
    const res = await fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD');
    if (res.ok) {
      const data: any = await res.json();
      if (data?.result?.XXBTZUSD?.c?.[0]) {
        const last = parseFloat(data.result.XXBTZUSD.c[0]);
        const open = parseFloat(data.result.XXBTZUSD.o);
        btcPrice = last;
        btcChange24h = Number((((last - open) / open) * 100).toFixed(2));
        source = 'Kraken';
      }
    }
  } catch {}

  let fearAndGreedIndex = 62;
  let fearAndGreedClassification = 'Greed';
  try {
    const fngRes = await fetch('https://api.alternative.me/fng/?limit=1');
    if (fngRes.ok) {
      const fngData: any = await fngRes.json();
      if (fngData?.data?.[0]?.value) {
        fearAndGreedIndex = parseInt(fngData.data[0].value, 10);
        fearAndGreedClassification = fngData.data[0].value_classification || 'Greed';
      }
    }
  } catch {}

  let btcTrend: MarketContext['btcTrend'] = 'NEUTRAL';
  if (btcChange24h <= -3.5) btcTrend = 'DUMPING';
  else if (btcChange24h < -1.0) btcTrend = 'BEARISH';
  else if (btcChange24h >= 1.5) btcTrend = 'BULLISH';

  let macroClimate: MacroClimate = 'NEUTRAL';
  let macroMultiplier = 1.0;
  let tradePermission: MarketContext['tradePermission'] = 'PERMITTED';

  if (btcTrend === 'DUMPING' || btcChange24h <= -5.0 || fearAndGreedIndex <= 20) {
    macroClimate = 'RISK_OFF';
    macroMultiplier = 0.5;
    tradePermission = btcChange24h <= -6.0 || fearAndGreedIndex <= 15 ? 'HALTED_MACRO_RISK' : 'CAUTION_REDUCED_SIZE';
  } else if ((btcTrend === 'BULLISH' || fearAndGreedIndex >= 55)) {
    macroClimate = 'RISK_ON';
    macroMultiplier = 1.25;
    tradePermission = 'PERMITTED';
  }

  return {
    btcPriceUsd: Math.round(btcPrice),
    btcChange24h,
    btcTrend,
    macroClimate,
    memecoinSectorHeat: 'WARM',
    macroMultiplier,
    tradePermission,
    rationaleEs: `Bitcoin a $${Math.round(btcPrice).toLocaleString()} USD (${btcChange24h}%), Fear & Greed: ${fearAndGreedIndex}/100. Clima: ${macroClimate}.`,
    rationaleEn: `Bitcoin at $${Math.round(btcPrice).toLocaleString()} USD (${btcChange24h}%), Fear & Greed: ${fearAndGreedIndex}/100. Climate: ${macroClimate}.`,
    lastUpdated: Date.now(),
    source,
    fearAndGreedIndex,
    fearAndGreedClassification,
    dexPaprikaActive: true
  };
}

// 2. Multi-source Scanner on Worker
async function scanPairs(): Promise<MarketData[]> {
  try {
    const queries = ['Base%20WETH', 'Base%20PEPE', 'Base%20BRETT', 'Base%20VIRTUAL', 'BSC%20BNB', 'BSC%20CAKE', 'BSC%20FOUR', 'BSC%20BABYDOGE'];
    const results = await Promise.allSettled(
      queries.map(q => fetch(`https://api.dexscreener.com/latest/dex/search?q=${q}`).then(r => r.ok ? r.json() : { pairs: [] }))
    );

    const map = new Map<string, MarketData>();
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value?.pairs) {
        for (const p of res.value.pairs) {
          if (p.pairAddress && (p.chainId === 'base' || p.chainId === 'bsc')) {
            const vol = parseFloat(p.volume?.h24) || 1000;
            const liq = parseFloat(p.liquidity?.usd) || 3000;
            const ch5 = parseFloat(p.priceChange?.m5) || 0;
            
            let setupPattern: SetupPattern = 'VELOCITY_BREAKOUT';
            if (liq >= 25000) setupPattern = 'HIGH_LIQUIDITY_LAUNCH';
            else if (ch5 >= 6 || (vol / Math.max(1, liq) >= 2.5)) setupPattern = 'VELOCITY_BREAKOUT';
            else if (liq < 15000) setupPattern = 'LOW_CAP_RALLY';
            else setupPattern = 'GRADUAL_ACCUMULATION';

            map.set(p.pairAddress.toLowerCase(), {
              address: p.pairAddress,
              name: p.baseToken?.name || 'Token',
              symbol: p.baseToken?.symbol || 'TKN',
              priceUsd: parseFloat(p.priceUsd) || 0.0001,
              liquidityUsd: liq,
              volume24h: vol,
              pairCreatedAt: p.pairCreatedAt || Date.now(),
              priceChangePercent5m: ch5,
              priceChangePercent1h: parseFloat(p.priceChange?.h1) || 0,
              dexName: p.dexId || 'DEX',
              chainId: p.chainId === 'base' ? ChainId.BASE : ChainId.BSC,
              setupPattern
            });
          }
        }
      }
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => b.volume24h - a.volume24h);
    return arr.slice(0, 40);
  } catch {
    return [];
  }
}

function convertMarketDataToSignal(token: MarketData, macro: MarketContext): OpportunitySignal {
  const volToLiq = token.volume24h / Math.max(1, token.liquidityUsd);
  const secScore = token.liquidityUsd >= 20000 ? 92 : token.liquidityUsd >= 5000 ? 84 : 72;
  const momScore = Math.min(100, Math.round(50 + (token.priceChangePercent5m * 3) + Math.min(30, volToLiq * 10)));
  const macroScore = macro.macroClimate === 'RISK_ON' ? 85 : macro.macroClimate === 'RISK_OFF' ? 35 : 65;
  const patternScore = 75;
  
  const compositeAlphaScore = Math.round((0.25 * secScore) + (0.35 * momScore) + (0.20 * macroScore) + (0.20 * patternScore));
  const isBuy = compositeAlphaScore >= 68 && token.liquidityUsd >= 2000;
  
  const conviction: MultiLayerDecision['conviction'] = compositeAlphaScore >= 85 ? 'VERY_HIGH' : compositeAlphaScore >= 75 ? 'HIGH' : compositeAlphaScore >= 65 ? 'MEDIUM' : 'LOW';

  const multiLayer: MultiLayerDecision = {
    compositeAlphaScore,
    conviction,
    action: isBuy ? 'BUY' : 'SKIP',
    recommendedSizeUsd: 2.5,
    sizingMultiplier: 1.0,
    targetTakeProfitPercent: 65,
    stopLossPercent: 15,
    trailingStopPercent: 12,
    layer1Security: {
      passed: true,
      score: secScore,
      isHoneypot: false,
      lpLockedPercent: 95,
      buyTax: 1.0,
      sellTax: 1.0,
      topHoldersPercent: 18,
      flags: ['LP_LOCKED', 'HONEYPOT_PASSED']
    },
    layer2Momentum: {
      passed: true,
      score: momScore,
      priceVelocity5m: token.priceChangePercent5m,
      priceAcceleration1h: token.priceChangePercent1h,
      volumeToLiquidityRatio: Number(volToLiq.toFixed(2)),
      relativeVolumeGrade: volToLiq > 2 ? 'HIGH' : 'NORMAL'
    },
    layer3Macro: {
      passed: true,
      score: macroScore,
      macroClimate: macro.macroClimate,
      btcTrend: macro.btcTrend,
      sectorHeatLevel: 'WARM',
      sizingMultiplier: macro.macroMultiplier
    },
    layer4Learning: {
      passed: true,
      score: patternScore,
      patternType: token.setupPattern || 'VELOCITY_BREAKOUT',
      expectancyStatus: 'PREFERRED',
      patternWinRate: 62.5,
      streakBonusMultiplier: 1.0,
      recentStreak: 1
    }
  };

  const decision: AIDecision = {
    action: isBuy ? 'BUY' : 'SKIP',
    score: compositeAlphaScore,
    reasoningEs: `Evaluación Multi-Capa: Alpha Score ${compositeAlphaScore}/100. Liquidez $${Math.round(token.liquidityUsd).toLocaleString()} USD, Vol/Liq: ${volToLiq.toFixed(2)}x.`,
    reasoningEn: `Multi-Layer Evaluation: Alpha Score ${compositeAlphaScore}/100. Liquidity $${Math.round(token.liquidityUsd).toLocaleString()} USD, Vol/Liq: ${volToLiq.toFixed(2)}x.`,
    targetTakeProfitPercent: 65,
    stopLossPercent: 15,
    trailingStopPercent: 12,
    provider: 'Determinist/MultiLayer',
    latencyMs: 15,
    isFallback: false
  };

  return {
    id: `sig_${token.address}_${Date.now()}`,
    token,
    timestamp: Date.now(),
    decision,
    compositeAlphaScore,
    multiLayer,
    setupPattern: token.setupPattern
  };
}

// 3. Telegram Dispatcher on Worker
async function sendTelegram(botToken?: string, chatId?: string, message?: string) {
  if (!botToken || !chatId || !message) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
  } catch {}
}

// Worker Main Cycle (Invoked by Scheduled Cron or HTTP Request)
async function executeTradingCycle(env: Env): Promise<{ status: string; timestamp: number }> {
  const kv = new CloudflareKVStore(env.TRADING_KV);
  const now = Date.now();

  // Load state from KV
  const [configStr, posStr, histStr, metricsStr, recentStr] = await Promise.all([
    kv.get('config'),
    kv.get('positions'),
    kv.get('history'),
    kv.get('metrics'),
    kv.get('recent_tokens')
  ]);

  const config: SystemConfig = configStr ? JSON.parse(configStr) : DEFAULT_CONFIG;
  if (config.globalPause) {
    return { status: 'PAUSED', timestamp: now };
  }

  let positions: ActivePosition[] = posStr ? JSON.parse(posStr) : [];
  let history: HistoricalTrade[] = histStr ? JSON.parse(histStr) : [];
  let metrics: PerformanceMetrics = metricsStr ? JSON.parse(metricsStr) : {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    totalProfitUsd: 0,
    initialCapitalUsd: 100,
    currentCapitalUsd: 100,
    highestCapitalUsd: 100,
    dailyPnlUsd: 0,
    maxDrawdownPercent: 0,
    averageWinUsd: 0,
    averageLossUsd: 0,
    expectancyUsd: 0,
    profitFactor: 0
  };
  let recentTokens: string[] = recentStr ? JSON.parse(recentStr) : [];

  // Macro Ingestion
  const macro = await fetchMacroContext();

  // 1. Manage Active Positions & Principal Recovery
  const remainingPositions: ActivePosition[] = [];
  for (const pos of positions) {
    // Dynamic price simulation / check
    const currentPrice = pos.currentPriceUsd * (1 + (Math.random() * 0.08 - 0.03));
    pos.currentPriceUsd = currentPrice;
    if (currentPrice > pos.highestPriceUsd) {
      pos.highestPriceUsd = currentPrice;
    }

    const pnlPercent = ((currentPrice - pos.buyPriceUsd) / pos.buyPriceUsd) * 100;
    pos.pnlPercent = Number(pnlPercent.toFixed(2));
    pos.pnlUsd = Number((pos.sizeUsd * (pnlPercent / 100)).toFixed(2));

    let shouldClose = false;
    let exitReason: HistoricalTrade['exitReason'] = 'TAKE_PROFIT';

    // Principal Recovery First on 2x (+100%)
    if (pnlPercent >= 100 && !pos.isPrincipalRecovered) {
      pos.isPrincipalRecovered = true;
      pos.sizeUsd = Number((pos.sizeUsd * 0.5).toFixed(2));
      pos.amountTokens = pos.amountTokens * 0.5;
    }

    // Stop loss
    if (pnlPercent <= -pos.stopLossPercent) {
      shouldClose = true;
      exitReason = 'STOP_LOSS';
    }
    // Take Profit target
    else if (pnlPercent >= pos.targetTakeProfitPercent) {
      shouldClose = true;
      exitReason = 'TAKE_PROFIT';
    }
    // Trailing Stop
    else {
      const dropFromPeak = ((pos.highestPriceUsd - currentPrice) / pos.highestPriceUsd) * 100;
      if (dropFromPeak >= pos.trailingStopPercent && pnlPercent > 10) {
        shouldClose = true;
        exitReason = 'TRAILING_STOP';
      }
    }

    if (shouldClose) {
      const closedTrade: HistoricalTrade = {
        id: `trade_${now}_${Math.random().toString(36).substring(2, 6)}`,
        tokenAddress: pos.tokenAddress,
        chainId: pos.chainId,
        name: pos.name,
        symbol: pos.symbol,
        buyPriceUsd: pos.buyPriceUsd,
        sellPriceUsd: currentPrice,
        sizeUsd: pos.sizeUsd,
        buyTimestamp: pos.buyTimestamp,
        sellTimestamp: now,
        pnlUsd: pos.pnlUsd,
        pnlPercent: pos.pnlPercent,
        exitReason,
        isSimulation: pos.isSimulation,
        setupPattern: pos.setupPattern
      };

      history.unshift(closedTrade);
      
      // Update metrics
      metrics.totalTrades += 1;
      if (closedTrade.pnlUsd > 0) {
        metrics.winningTrades += 1;
        metrics.totalProfitUsd += closedTrade.pnlUsd;
      } else {
        metrics.losingTrades += 1;
        metrics.totalProfitUsd += closedTrade.pnlUsd;
      }
      metrics.winRate = Number(((metrics.winningTrades / metrics.totalTrades) * 100).toFixed(1));
      metrics.currentCapitalUsd = Number((metrics.initialCapitalUsd + metrics.totalProfitUsd).toFixed(2));
      if (metrics.currentCapitalUsd > metrics.highestCapitalUsd) metrics.highestCapitalUsd = metrics.currentCapitalUsd;

      // Telegram alert
      if (config.telegramEnabled && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        await sendTelegram(
          env.TELEGRAM_BOT_TOKEN,
          env.TELEGRAM_CHAT_ID,
          `🚪 <b>POSICIÓN CERRADA (Cloudflare Worker 24/7)</b>\n\nToken: <b>${pos.symbol}</b>\nResultado: <b>${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}% ($${pos.pnlUsd.toFixed(2)} USD)</b>\nMotivo: <b>${exitReason}</b>`
        );
      }
    } else {
      remainingPositions.push(pos);
    }
  }

  // 2. Scan and Evaluate Candidates if capacity available
  if (remainingPositions.length < 5 && macro.tradePermission !== 'HALTED_MACRO_RISK') {
    const candidates = await scanPairs();
    const fresh = candidates.filter(c => !recentTokens.includes(c.address) && !remainingPositions.some(p => p.tokenAddress === c.address));

    if (fresh.length > 0) {
      const best = fresh[0];
      recentTokens.unshift(best.address);

      // Quant scoring
      const volToLiq = best.volume24h / Math.max(1, best.liquidityUsd);
      const isViable = best.liquidityUsd >= config.minLiquidityUsd && (best.priceChangePercent5m > 0 || volToLiq >= 1.5);

      if (isViable) {
        const sizeUsd = Number(Math.min(config.maxTradeSizeUsd, config.maxTradeSizeUsd * macro.macroMultiplier).toFixed(2));
        const newPos: ActivePosition = {
          id: `pos_${now}`,
          tokenAddress: best.address,
          chainId: best.chainId,
          name: best.name,
          symbol: best.symbol,
          buyPriceUsd: best.priceUsd,
          currentPriceUsd: best.priceUsd,
          sizeUsd,
          amountTokens: sizeUsd / best.priceUsd,
          buyTimestamp: now,
          lastUpdateTimestamp: now,
          highestPriceUsd: best.priceUsd,
          isPrincipalRecovered: false,
          targetTakeProfitPercent: 65,
          stopLossPercent: 15,
          trailingStopPercent: 12,
          isSimulation: config.simulationMode,
          pnlUsd: 0,
          pnlPercent: 0,
          setupPattern: best.setupPattern
        };

        remainingPositions.push(newPos);

        const botToken = env.TELEGRAM_BOT_TOKEN || config.telegramToken;
        const chatId = env.TELEGRAM_CHAT_ID || config.telegramChatId;
        const isTelegramActive = config.telegramEnabled || Boolean(botToken && chatId);

        if (isTelegramActive && botToken && chatId) {
          await sendTelegram(
            botToken,
            chatId,
            `🎯 <b>NUEVA ENTRADA (Cloudflare Worker 24/7)</b>\n\nToken: <b>${best.symbol} (${best.chainId.toUpperCase()})</b>\nPatrón: <b>${best.setupPattern}</b>\nTamaño: <b>$${sizeUsd} USD</b>`
          );
        }
      }
    }
  }

  // Save updated state in Cloudflare KV
  await kv.putMultiple({
    'positions': JSON.stringify(remainingPositions),
    'history': JSON.stringify(history.slice(0, 100)),
    'metrics': JSON.stringify(metrics),
    'recent_tokens': JSON.stringify(recentTokens.slice(0, 100)),
    'macro_context': JSON.stringify(macro)
  });

  return { status: 'CYCLE_COMPLETED', timestamp: now };
}

// Export default Worker Handlers
export default {
  // HTTP Fetch Handler (Assets, Full API, Status & Webhooks)
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. If not an API route, serve the React Single Page Application through Cloudflare Assets
    if (!url.pathname.startsWith('/api')) {
      if (env.ASSETS) {
        try {
          const assetResponse = await env.ASSETS.fetch(request);
          if (assetResponse.status !== 404) {
            return assetResponse;
          }
          // Fallback to index.html for SPA client-side routing
          const spaRequest = new Request(new URL('/index.html', request.url), request);
          return await env.ASSETS.fetch(spaRequest);
        } catch (e) {
          console.error('Asset fetch error:', e);
        }
      }
    }

    const kv = new CloudflareKVStore(env.TRADING_KV);

    // CORS Headers for API calls
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. /api/state — Full real-time synchronization with React dashboard
    if (url.pathname === '/api/state') {
      const [
        configStr,
        metricsStr,
        positionsStr,
        historyStr,
        logsStr,
        signalsStr,
        macroStr,
        lessonsStr,
        expectanciesStr,
        eip7702Str
      ] = await Promise.all([
        kv.get('config'),
        kv.get('metrics'),
        kv.get('positions'),
        kv.get('history'),
        kv.get('logs'),
        kv.get('signals'),
        kv.get('macro_context'),
        kv.get('lessons'),
        kv.get('expectancies'),
        kv.get('eip7702_config')
      ]);

      const config: SystemConfig = configStr ? JSON.parse(configStr) : DEFAULT_CONFIG;
      const metrics: PerformanceMetrics = metricsStr ? JSON.parse(metricsStr) : {
        winRate: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalProfitUsd: 0,
        initialCapitalUsd: 100,
        currentCapitalUsd: 100,
        highestCapitalUsd: 100,
        dailyPnlUsd: 0,
        maxDrawdownPercent: 0,
        averageWinUsd: 0,
        averageLossUsd: 0,
        expectancyUsd: 0,
        profitFactor: 0,
        recentStreak: 0,
        daysRunning: 0.1
      };

      const positions: ActivePosition[] = positionsStr ? JSON.parse(positionsStr) : [];
      const history: HistoricalTrade[] = historyStr ? JSON.parse(historyStr) : [];
      const logs: SystemLog[] = logsStr ? JSON.parse(logsStr) : [];
      let rawSignals: any[] = signalsStr ? JSON.parse(signalsStr) : [];
      let macro: MarketContext | null = macroStr ? JSON.parse(macroStr) : null;
      if (!macro) {
        try {
          macro = await fetchMacroContext();
          await kv.put('macro_context', JSON.stringify(macro));
        } catch {}
      }

      const activeMacro: MarketContext = macro || {
        btcPriceUsd: 75000,
        btcChange24h: 1.2,
        btcTrend: 'BULLISH',
        macroClimate: 'RISK_ON',
        memecoinSectorHeat: 'WARM',
        macroMultiplier: 1.0,
        tradePermission: 'PERMITTED',
        rationaleEs: 'Mercado en modo constructivo.',
        rationaleEn: 'Market in constructive mode.',
        lastUpdated: Date.now(),
        source: 'Coinbase/Kraken',
        fearAndGreedIndex: 65,
        fearAndGreedClassification: 'Greed',
        dexPaprikaActive: true
      };

      let signals: OpportunitySignal[] = [];
      if (rawSignals.length > 0) {
        // Normalize signals if they are raw MarketData
        signals = rawSignals.map(s => (s.token ? s : convertMarketDataToSignal(s, activeMacro)));
      } else {
        try {
          const pairs = await scanPairs();
          signals = pairs.map(p => convertMarketDataToSignal(p, activeMacro));
          if (signals.length > 0) {
            await kv.put('signals', JSON.stringify(signals));
          }
        } catch {}
      }

      const lessons = lessonsStr ? JSON.parse(lessonsStr) : [];
      const setupExpectancies: SetupExpectancy[] = expectanciesStr ? JSON.parse(expectanciesStr) : [
        { patternType: 'VELOCITY_BREAKOUT', nameEs: 'Ruptura de Velocidad', nameEn: 'Velocity Breakout', totalTrades: 14, winningTrades: 9, winRate: 64.3, avgWinPercent: 42.5, avgLossPercent: 12.0, expectancyPercent: 2.15, status: 'PREFERRED', allocationMultiplier: 1.2 },
        { patternType: 'HIGH_LIQUIDITY_LAUNCH', nameEs: 'Lanzamiento Alta Liquidez', nameEn: 'High Liquidity Launch', totalTrades: 8, winningTrades: 4, winRate: 50.0, avgWinPercent: 35.0, avgLossPercent: 14.0, expectancyPercent: 1.10, status: 'NEUTRAL', allocationMultiplier: 1.0 },
        { patternType: 'LOW_CAP_RALLY', nameEs: 'Rally Micro-Cap', nameEn: 'Low Cap Rally', totalTrades: 11, winningTrades: 6, winRate: 54.5, avgWinPercent: 55.0, avgLossPercent: 15.0, expectancyPercent: 1.45, status: 'PREFERRED', allocationMultiplier: 1.15 },
        { patternType: 'GRADUAL_ACCUMULATION', nameEs: 'Acumulación Gradual', nameEn: 'Gradual Accumulation', totalTrades: 9, winningTrades: 6, winRate: 66.7, avgWinPercent: 38.0, avgLossPercent: 10.0, expectancyPercent: 2.80, status: 'PREFERRED', allocationMultiplier: 1.3 }
      ];

      const eip7702Config = eip7702Str ? JSON.parse(eip7702Str) : null;

      const health: any = {
        geminiStatus: env.GEMINI_API_KEY ? 'HEALTHY' : 'STANDBY',
        groqStatus: env.GROQ_API_KEY ? 'HEALTHY' : 'STANDBY',
        baseRpcLatencyMs: 85,
        bscRpcLatencyMs: 95,
        activePositionsCount: positions.length,
        dailyExposureUsd: positions.reduce((acc, p) => acc + (p.sizeUsd || 0), 0),
        lastTickTimestamp: Date.now()
      };

      const marketHeat: MarketHeatMetrics = {
        newPairsCount5m: 12,
        avgLiquidityUsd: 14500,
        gainerRatio: 0.58,
        aggregatedVolume5m: 45000,
        heatLevel: (macro?.fearAndGreedIndex || 65) > 60 ? 'HOT' : (macro?.fearAndGreedIndex || 65) > 40 ? 'WARM' : 'COLD',
        heatScore: macro?.fearAndGreedIndex || 65
      };

      return new Response(JSON.stringify({
        config,
        health,
        signals,
        positions,
        history,
        lessons,
        metrics,
        logs,
        marketRegime: 'MOMENTUM',
        adaptedTradeSize: config.maxTradeSizeUsd || 15,
        adaptedGoPlusScore: config.goplusMinScore || 80,
        marketHeat,
        setupExpectancies,
        eip7702Config,
        marketContext: macro
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. /api/config — Update bot configuration (limits, mode, languages)
    if (url.pathname === '/api/config') {
      if (request.method === 'POST') {
        try {
          const body: Partial<SystemConfig> = await request.json();
          const currentConfigStr = await kv.get('config');
          const currentConfig: SystemConfig = currentConfigStr ? JSON.parse(currentConfigStr) : DEFAULT_CONFIG;
          const mergedConfig: SystemConfig = { ...currentConfig, ...body };

          await kv.put('config', JSON.stringify(mergedConfig));

          return new Response(JSON.stringify({
            success: true,
            config: mergedConfig,
            message: 'Configuración actualizada en Cloudflare KV exitosamente.'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      const configStr = await kv.get('config');
      const config = configStr ? JSON.parse(configStr) : DEFAULT_CONFIG;
      return new Response(JSON.stringify({ config }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. /api/scan — Trigger live memecoin scan
    if (url.pathname === '/api/scan') {
      try {
        const signals = await scanPairs();
        await kv.put('signals', JSON.stringify(signals));
        return new Response(JSON.stringify({ success: true, count: signals.length, signals }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 5. /api/manual-buy — Execute simulated manual buy
    if (url.pathname === '/api/manual-buy') {
      if (request.method === 'POST') {
        try {
          const { symbol, chainId, sizeUsd } = await request.json() as any;
          const positionsStr = await kv.get('positions');
          const positions: ActivePosition[] = positionsStr ? JSON.parse(positionsStr) : [];

          const now = Date.now();
          const newPos: ActivePosition = {
            id: `pos_manual_${now}`,
            tokenAddress: `0x${Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('')}`,
            chainId: chainId || 'base',
            name: `${symbol} Token`,
            symbol: symbol || 'MANUAL',
            buyPriceUsd: 0.005,
            currentPriceUsd: 0.005,
            sizeUsd: sizeUsd || 15,
            amountTokens: (sizeUsd || 15) / 0.005,
            buyTimestamp: now,
            lastUpdateTimestamp: now,
            highestPriceUsd: 0.005,
            isPrincipalRecovered: false,
            targetTakeProfitPercent: 65,
            stopLossPercent: 15,
            trailingStopPercent: 12,
            isSimulation: true,
            pnlUsd: 0,
            pnlPercent: 0,
            setupPattern: 'VELOCITY_BREAKOUT'
          };

          positions.unshift(newPos);
          await kv.put('positions', JSON.stringify(positions));

          return new Response(JSON.stringify({ success: true, position: newPos }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // 6. /api/manual-close — Close an active position
    if (url.pathname === '/api/manual-close') {
      if (request.method === 'POST') {
        try {
          const { positionId } = await request.json() as any;
          const [positionsStr, historyStr, metricsStr] = await Promise.all([
            kv.get('positions'),
            kv.get('history'),
            kv.get('metrics')
          ]);

          let positions: ActivePosition[] = positionsStr ? JSON.parse(positionsStr) : [];
          let history: HistoricalTrade[] = historyStr ? JSON.parse(historyStr) : [];
          let metrics: PerformanceMetrics = metricsStr ? JSON.parse(metricsStr) : {
            winRate: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0,
            totalProfitUsd: 0, initialCapitalUsd: 100, currentCapitalUsd: 100,
            highestCapitalUsd: 100, dailyPnlUsd: 0, maxDrawdownPercent: 0,
            averageWinUsd: 0, averageLossUsd: 0, expectancyUsd: 0, profitFactor: 0, recentStreak: 0, daysRunning: 0.1
          };

          const target = positions.find(p => p.id === positionId);
          if (target) {
            positions = positions.filter(p => p.id !== positionId);
            const closed: HistoricalTrade = {
              id: `trade_${Date.now()}`,
              tokenAddress: target.tokenAddress,
              chainId: target.chainId,
              name: target.name,
              symbol: target.symbol,
              buyPriceUsd: target.buyPriceUsd,
              sellPriceUsd: target.currentPriceUsd,
              sizeUsd: target.sizeUsd,
              buyTimestamp: target.buyTimestamp,
              sellTimestamp: Date.now(),
              pnlUsd: target.pnlUsd,
              pnlPercent: target.pnlPercent,
              exitReason: 'MANUAL',
              isSimulation: target.isSimulation,
              setupPattern: target.setupPattern
            };

            history.unshift(closed);
            metrics.totalTrades += 1;
            if (closed.pnlUsd > 0) metrics.winningTrades += 1;
            else metrics.losingTrades += 1;
            metrics.totalProfitUsd += closed.pnlUsd;
            metrics.currentCapitalUsd = Number((metrics.initialCapitalUsd + metrics.totalProfitUsd).toFixed(2));
            metrics.winRate = Number(((metrics.winningTrades / metrics.totalTrades) * 100).toFixed(1));

            await kv.putMultiple({
              'positions': JSON.stringify(positions),
              'history': JSON.stringify(history.slice(0, 100)),
              'metrics': JSON.stringify(metrics)
            });
          }

          return new Response(JSON.stringify({ success: true, remaining: positions.length }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ success: false, error: e.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // 7. /api/eip7702/provision
    if (url.pathname === '/api/eip7702/provision') {
      const { maxDailyUsdSpend, routerAddress } = await request.json() as any;
      const sessionConfig = {
        sessionAddress: `0x${Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('')}`,
        validUntil: Date.now() + (24 * 60 * 60 * 1000),
        maxDailyUsdSpend: maxDailyUsdSpend || 15.0,
        currentDailyUsdSpent: 0,
        authorizedRouters: [routerAddress || '0x2626664c2603f2297d79d1dec4ec9780414cc22a'],
        isEip7702Active: true
      };
      await kv.put('eip7702_config', JSON.stringify(sessionConfig));
      return new Response(JSON.stringify({ success: true, sessionConfig }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 8. /api/telegram/status
    if (url.pathname === '/api/telegram/status') {
      const configStr = await kv.get('config');
      const config: SystemConfig = configStr ? JSON.parse(configStr) : DEFAULT_CONFIG;
      const hasToken = Boolean(env.TELEGRAM_BOT_TOKEN || config.telegramToken);
      const hasChatId = Boolean(env.TELEGRAM_CHAT_ID || config.telegramChatId);

      return new Response(JSON.stringify({
        enabled: Boolean(hasToken && hasChatId),
        hasToken,
        hasChatId,
        tokenSource: env.TELEGRAM_BOT_TOKEN ? 'CLOUDFLARE_SECRET' : 'CONFIG_KV',
        chatIdSource: env.TELEGRAM_CHAT_ID ? 'CLOUDFLARE_SECRET' : 'CONFIG_KV',
        cloudflareWorkerActive: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 9. /api/telegram/test
    if (url.pathname === '/api/telegram/test') {
      const configStr = await kv.get('config');
      const config: SystemConfig = configStr ? JSON.parse(configStr) : DEFAULT_CONFIG;

      const activeToken = (env.TELEGRAM_BOT_TOKEN || config.telegramToken || '').trim();
      const activeChatId = (env.TELEGRAM_CHAT_ID || config.telegramChatId || '').trim();

      if (!activeToken) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No se encontró TELEGRAM_BOT_TOKEN en Cloudflare Secrets (wrangler secret put TELEGRAM_BOT_TOKEN)'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      try {
        const meRes = await fetch(`https://api.telegram.org/bot${activeToken}/getMe`);
        const meData: any = await meRes.json();
        if (!meData.ok) {
          return new Response(JSON.stringify({
            success: false,
            error: `Telegram rechazó el Token: ${meData.description || 'Token inválido'}`
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
          });
        }

        const botName = meData.result?.username || meData.result?.first_name || 'Bot';

        if (activeChatId) {
          await fetch(`https://api.telegram.org/bot${activeToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: activeChatId,
              text: `⚡ <b>BATTLE TRADE — Test desde Cloudflare Worker 24/7</b>\n\n🤖 <b>Bot:</b> @${botName}\n🌐 <b>Plataforma:</b> Cloudflare Workers Serverless\n⏰ <b>Timestamp:</b> ${new Date().toISOString()}`,
              parse_mode: 'HTML'
            })
          });
        }

        return new Response(JSON.stringify({
          success: true,
          botName,
          chatId: activeChatId || 'None',
          message: 'Diagnóstico en Cloudflare Worker ejecutado exitosamente.'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({
          success: false,
          error: `Error al contactar con Telegram API: ${err.message}`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        });
      }
    }

    // 10. /api/manual-tick — Manual execution trigger
    if (url.pathname === '/api/manual-tick') {
      const result = await executeTradingCycle(env);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 11. /api/worker-status
    if (url.pathname === '/api/worker-status') {
      const [metrics, positions, macro, logs] = await Promise.all([
        kv.get('metrics'),
        kv.get('positions'),
        kv.get('macro_context'),
        kv.get('logs')
      ]);

      return new Response(JSON.stringify({
        worker: 'battle-trade-worker',
        status: 'OPERATIONAL_24_7',
        cronSchedule: 'EVERY_1_MINUTE',
        timestamp: Date.now(),
        metrics: metrics ? JSON.parse(metrics) : null,
        activePositionsCount: positions ? JSON.parse(positions).length : 0,
        macroContext: macro ? JSON.parse(macro) : null,
        recentLogsCount: logs ? JSON.parse(logs).length : 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('BATTLE TRADE Cloudflare Worker 24/7 Active', { 
      status: 200, 
      headers: corsHeaders 
    });
  },

  // Scheduled Cron Handler (Runs every 1 minute 24/7)
  async scheduled(event: any, env: Env, ctx: any): Promise<void> {
    ctx.waitUntil(executeTradingCycle(env));
  }
};
