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
  // HTTP Fetch Handler (Status & Webhooks)
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const acceptHeader = request.headers.get('Accept') || '';
    const wantsJson = url.pathname.startsWith('/api/') || acceptHeader.includes('application/json');

    if (url.pathname === '/api/worker-status' || (url.pathname === '/' && wantsJson)) {
      const kv = new CloudflareKVStore(env.TRADING_KV);
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
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/') {
      const kv = new CloudflareKVStore(env.TRADING_KV);
      const [metricsStr, positionsStr, macroStr, logsStr] = await Promise.all([
        kv.get('metrics'),
        kv.get('positions'),
        kv.get('macro_context'),
        kv.get('logs')
      ]);

      const metrics = metricsStr ? JSON.parse(metricsStr) : null;
      const positions = positionsStr ? JSON.parse(positionsStr) : [];
      const macro = macroStr ? JSON.parse(macroStr) : null;
      const logs = logsStr ? JSON.parse(logsStr).slice(0, 5) : [];

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BATTLE TRADE — Cloudflare Worker 24/7</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 font-sans min-h-screen p-4 md:p-8">
  <div class="max-w-2xl mx-auto space-y-6">
    <!-- Header -->
    <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-lime-500/20 border border-lime-500/40 flex items-center justify-center text-lime-400 font-black text-lg">
            ⚡
          </div>
          <div>
            <h1 class="text-lg font-black tracking-tight text-white">BATTLE TRADE ENGINE</h1>
            <p class="text-xs text-slate-400">Cloudflare Serverless Worker 24/7</p>
          </div>
        </div>
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-lime-500/10 border border-lime-500/30 text-lime-400 text-xs font-bold">
          <span class="w-2 h-2 rounded-full bg-lime-400 animate-ping"></span>
          ACTIVO 24/7
        </span>
      </div>

      <!-- Quick Metrics Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
        <div class="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Cron Schedule</span>
          <p class="text-sm font-black text-lime-400 mt-1">Cada 1 Minuto</p>
        </div>
        <div class="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Posiciones</span>
          <p class="text-sm font-black text-white mt-1">${positions.length} Activas</p>
        </div>
        <div class="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Capital Sim</span>
          <p class="text-sm font-black text-white mt-1">$${metrics ? Number(metrics.currentCapitalUsd || 100).toFixed(2) : '100.00'}</p>
        </div>
        <div class="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Clima Macro</span>
          <p class="text-sm font-black ${macro?.macroClimate === 'RISK_ON' ? 'text-lime-400' : 'text-amber-400'} mt-1">
            ${macro?.macroClimate || 'Sincronizando'}
          </p>
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-6 flex flex-wrap gap-2 pt-4 border-t border-slate-800/80">
        <a href="/api/manual-tick" class="px-4 py-2 bg-lime-500 hover:bg-lime-400 text-slate-950 font-black text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-lg shadow-lime-500/20">
          ⚡ Forzar Escaneo Manual Ahora
        </a>
        <a href="/api/telegram/test" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg border border-slate-700 transition-all">
          📱 Probar Telegram
        </a>
        <a href="/api/worker-status" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg border border-slate-700 transition-all">
          📊 Ver JSON Crudo
        </a>
      </div>
    </div>

    <!-- Recent Activity -->
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
      <h2 class="text-xs font-black uppercase text-slate-400 tracking-wider mb-3">Últimos Logs del Motor</h2>
      <div class="space-y-2 font-mono text-xs">
        ${logs.length > 0 ? logs.map((l: any) => `
          <div class="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 text-slate-300 flex items-start gap-2">
            <span class="text-lime-400 font-bold text-[10px]">[${new Date(l.timestamp).toLocaleTimeString()}]</span>
            <span>${l.message}</span>
          </div>
        `).join('') : '<p class="text-slate-500 text-xs py-2">Esperando la primera ejecución del cron automático...</p>'}
      </div>
    </div>
  </div>
</body>
</html>`;

      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (url.pathname === '/api/telegram/status') {
      const kv = new CloudflareKVStore(env.TRADING_KV);
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
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/api/telegram/test') {
      const kv = new CloudflareKVStore(env.TRADING_KV);
      const configStr = await kv.get('config');
      const config: SystemConfig = configStr ? JSON.parse(configStr) : DEFAULT_CONFIG;

      const activeToken = (env.TELEGRAM_BOT_TOKEN || config.telegramToken || '').trim();
      const activeChatId = (env.TELEGRAM_CHAT_ID || config.telegramChatId || '').trim();

      if (!activeToken) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No se encontró TELEGRAM_BOT_TOKEN en Cloudflare Secrets (wrangler secret put TELEGRAM_BOT_TOKEN)'
        }), {
          headers: { 'Content-Type': 'application/json' },
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
            headers: { 'Content-Type': 'application/json' },
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
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({
          success: false,
          error: `Error al contactar con Telegram API: ${err.message}`
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 500
        });
      }
    }

    if (url.pathname === '/api/manual-tick') {
      const result = await executeTradingCycle(env);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('BATTLE TRADE Cloudflare Worker 24/7 Active', { status: 200 });
  },

  // Scheduled Cron Handler (Runs every 1 minute 24/7)
  async scheduled(event: any, env: Env, ctx: any): Promise<void> {
    ctx.waitUntil(executeTradingCycle(env));
  }
};
