/**
 * Cloudflare Worker Autonomous Engine for BATTLE TRADE
 * Reconstructed 24/7 Serverless Router with SQLite-backed Durable Object Authority
 */

import { ChainId, MarketData, MarketRegime, SetupPattern, OpportunitySignal, ActivePosition, HistoricalTrade, SystemConfig, SystemLog, PerformanceMetrics, MarketContext } from './src/shared/types';
import { BattleTradeDB } from './src/backend/modules/database';
import { AdapterRegistry } from './src/backend/modules/adapters';
import { MarketIngestionEngine, TokenDiscoveryEngine, SecurityScannerEngine } from './src/backend/modules/market';
import { FeatureEngine, MarketRegimeEngine, AlphaEngine, AiRouterEngine } from './src/backend/modules/analytics';
import { RiskEngine, PortfolioEngine } from './src/backend/modules/risk';
import { OnlineLearningEngine, WatchdogEngine, TelemetryEngine, StrategyRegistryEngine, TelegramNotificationEngine } from './src/backend/modules/system';
import { HardeningEngine } from './src/backend/modules/hardening';
import { CloudflareOptimizer } from './src/backend/modules/cf_optimizer';
import { Demo7DManager } from './src/backend/modules/demo_7d';

export interface Env {
  TRADING_KV: any;
  STATE_DO?: any; // Bound Durable Object for relational single-writer state authority
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

// Relational SQLite-backed Durable Object authority
export class BattleTradeStateDO {
  private db: BattleTradeDB;
  
  constructor(private state: any, private env: Env) {
    this.db = new BattleTradeDB();
    // Rehydrate database from durable storage on startup if available
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get('db_state');
      if (stored) {
        this.db.deserialize(stored);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Single-writer API endpoints for critical state
    try {
      if (url.pathname === '/api/state') {
        const isSim = this.db.getSystemState().is_simulation === 1;
        const telemetry = new TelemetryEngine(this.db);
        const metrics = telemetry.calculatePerformanceMetrics(isSim);
        const positions = this.db.getPositions();
        const settings = this.db.getSettings();
        const auditLogs = this.db.getAuditEvents();

        return new Response(JSON.stringify({
          success: true,
          state: this.db.getSystemState(),
          positions,
          metrics,
          settings,
          auditLogs: auditLogs.slice(0, 50)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname === '/api/config' && request.method === 'POST') {
        const body = await request.json() as any;
        if (body.globalPause !== undefined) {
          this.db.updateSystemState({ current_status: body.globalPause ? 'PAUSED' : 'RUNNING' });
        }
        if (body.simulationMode !== undefined) {
          this.db.updateSystemState({ is_simulation: body.simulationMode ? 1 : 0 });
        }
        
        // Save back to settings
        for (const [k, v] of Object.entries(body)) {
          this.db.setSetting(k, String(v));
        }

        await this.state.storage.put('db_state', this.db.serialize());
        return new Response(JSON.stringify({ success: true, message: 'Configuration stored inside Durable Object SQLite authority.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname === '/api/order/execute' && request.method === 'POST') {
        const orderData = await request.json() as any;
        const config: SystemConfig = {
          globalPause: this.db.getSystemState().current_status === 'PAUSED',
          simulationMode: this.db.getSystemState().is_simulation === 1,
          maxDailyExposureUsd: parseFloat(this.db.getSetting('maxDailyExposureUsd') || '150.0'),
          maxTradeSizeUsd: parseFloat(this.db.getSetting('maxTradeSizeUsd') || '15.0'),
          minLiquidityUsd: parseFloat(this.db.getSetting('minLiquidityUsd') || '2000.0'),
          maxBuyTaxPercent: parseFloat(this.db.getSetting('maxBuyTaxPercent') || '8.0'),
          maxSellTaxPercent: parseFloat(this.db.getSetting('maxSellTaxPercent') || '8.0'),
          goplusMinScore: parseFloat(this.db.getSetting('goplusMinScore') || '80'),
          primaryLanguage: (this.db.getSetting('primaryLanguage') || 'es') as 'es' | 'en',
          telegramToken: this.env.TELEGRAM_BOT_TOKEN || '',
          telegramChatId: this.env.TELEGRAM_CHAT_ID || '',
          telegramEnabled: !!this.env.TELEGRAM_BOT_TOKEN,
          simulatedSlippagePercent: parseFloat(this.db.getSetting('simulatedSlippagePercent') || '1.5'),
          simulatedLatencyMs: parseFloat(this.db.getSetting('simulatedLatencyMs') || '250'),
          minRiskPercentPerTrade: parseFloat(this.db.getSetting('minRiskPercentPerTrade') || '1.5'),
          maxRiskPercentPerTrade: parseFloat(this.db.getSetting('maxRiskPercentPerTrade') || '5.0')
        };

        const risk = new RiskEngine(this.db);
        const check = risk.validateHardCaps(config, orderData.sizeUsd);

        if (!check.passed) {
          return new Response(JSON.stringify({ success: false, reason: check.reason }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const portfolio = new PortfolioEngine(this.db);
        const position = portfolio.openPosition(
          orderData.token,
          orderData.decision,
          orderData.sizeUsd,
          orderData.amountTokens,
          orderData.buyPriceUsd,
          config.simulationMode
        );

        await this.state.storage.put('db_state', this.db.serialize());
        return new Response(JSON.stringify({ success: true, position }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname === '/api/order/close' && request.method === 'POST') {
        const body = await request.json() as any;
        const portfolio = new PortfolioEngine(this.db);
        const pos = this.db.getPosition(body.positionId);
        
        if (!pos) {
          return new Response(JSON.stringify({ success: false, reason: 'Position not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const activePosition: ActivePosition = {
          id: pos.id,
          tokenAddress: pos.token_address,
          chainId: pos.chain_id,
          name: pos.name,
          symbol: pos.symbol,
          buyPriceUsd: pos.buy_price_usd,
          currentPriceUsd: pos.current_price_usd,
          sizeUsd: pos.size_usd,
          amountTokens: pos.amount_tokens,
          buyTimestamp: pos.buy_timestamp,
          lastUpdateTimestamp: pos.last_update_timestamp,
          highestPriceUsd: pos.highest_price_usd,
          isPrincipalRecovered: pos.is_principal_recovered === 1,
          targetTakeProfitPercent: pos.target_take_profit_percent,
          stopLossPercent: pos.stop_loss_percent,
          trailingStopPercent: pos.trailing_stop_percent,
          isSimulation: pos.is_simulation === 1,
          pnlUsd: pos.pnl_usd,
          pnlPercent: pos.pnl_percent,
          regimeAtEntry: pos.regime_at_entry,
          setupPattern: pos.setup_pattern
        };

        const trade = portfolio.closePosition(activePosition, body.sellPriceUsd, body.reason || 'MANUAL');

        // Apply online SGD learning to weights
        const learning = new OnlineLearningEngine(this.db);
        learning.updateAdaptiveWeights(trade);

        await this.state.storage.put('db_state', this.db.serialize());
        return new Response(JSON.stringify({ success: true, trade }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname === '/api/reset' && request.method === 'POST') {
        this.db = new BattleTradeDB();
        await this.state.storage.put('db_state', this.db.serialize());
        return new Response(JSON.stringify({ success: true, message: 'Database reset completed inside Durable Object authority.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: false, error: 'Not Found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
}

// Global state fallback singleton when running locally or on a free CF plan without DO config
let localDbFallback: BattleTradeDB | null = null;
function getLocalDb(): BattleTradeDB {
  if (!localDbFallback) {
    localDbFallback = new BattleTradeDB();
  }
  return localDbFallback;
}

// Main HTTP worker entry point
export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Intercept and Route API to Durable Object Authority if bound
    if (url.pathname.startsWith('/api/state') || 
        url.pathname.startsWith('/api/config') || 
        url.pathname.startsWith('/api/order') || 
        url.pathname.startsWith('/api/reset')) {
      
      if (env.STATE_DO) {
        const id = env.STATE_DO.idFromName('BATTLE_TRADE_GLOBAL_STATE');
        const stub = env.STATE_DO.get(id);
        return stub.fetch(request);
      } else {
        // Fallback proxy to local DB when DO is absent
        const db = getLocalDb();
        if (url.pathname === '/api/state') {
          const isSim = db.getSystemState().is_simulation === 1;
          const telemetry = new TelemetryEngine(db);
          const metrics = telemetry.calculatePerformanceMetrics(isSim);
          const positions = db.getPositions();
          const settings = db.getSettings();
          const auditLogs = db.getAuditEvents();

          return new Response(JSON.stringify({
            success: true,
            state: db.getSystemState(),
            positions,
            metrics,
            settings,
            auditLogs: auditLogs.slice(0, 50)
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (url.pathname === '/api/config' && request.method === 'POST') {
          const body = await request.json() as any;
          if (body.globalPause !== undefined) {
            db.updateSystemState({ current_status: body.globalPause ? 'PAUSED' : 'RUNNING' });
          }
          if (body.simulationMode !== undefined) {
            db.updateSystemState({ is_simulation: body.simulationMode ? 1 : 0 });
          }
          for (const [k, v] of Object.entries(body)) {
            db.setSetting(k, String(v));
          }
          return new Response(JSON.stringify({ success: true, message: 'Config saved to fallback.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (url.pathname === '/api/reset' && request.method === 'POST') {
          localDbFallback = new BattleTradeDB();
          return new Response(JSON.stringify({ success: true, message: 'Reset done.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // Outbound News testing & health status endpoints
    if (url.pathname === '/api/telegram/status') {
      const db = env.STATE_DO ? null : getLocalDb();
      const hasToken = Boolean(env.TELEGRAM_BOT_TOKEN);
      const hasChatId = Boolean(env.TELEGRAM_CHAT_ID);

      return new Response(JSON.stringify({
        enabled: Boolean(hasToken && hasChatId),
        hasToken,
        hasChatId,
        cloudflareWorkerActive: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/api/telegram/test') {
      const activeToken = (env.TELEGRAM_BOT_TOKEN || '').trim();
      const activeChatId = (env.TELEGRAM_CHAT_ID || '').trim();

      if (!activeToken) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No se encontró TELEGRAM_BOT_TOKEN en Cloudflare Secrets.'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        });
      }

      try {
        const bot = new TelegramNotificationEngine(activeToken, activeChatId);
        await bot.sendOutboundNotification(`⚡ <b>BATTLE TRADE — Test de Cloudflare Worker 24/7</b>\n\n⏰ Timestamp: ${new Date().toISOString()}`);
        return new Response(JSON.stringify({ success: true, message: 'Test notification dispatched.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        });
      }
    }

    if (url.pathname === '/api/manual-tick') {
      const result = await executeTradingCycle(env);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/api/worker-status') {
      return new Response(JSON.stringify({
        worker: 'battle-trade-worker-v2',
        status: 'OPERATIONAL_24_7',
        cronSchedule: 'EVERY_3_MINUTES',
        timestamp: Date.now()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Default Asset handling or fallback greeting
    return new Response('BATTLE TRADE Reconstructed Worker Active', { 
      status: 200, 
      headers: corsHeaders 
    });
  },

  // Continuous Scheduled Cron Execution (Every 3 minutes)
  async scheduled(event: any, env: Env, ctx: any): Promise<void> {
    ctx.waitUntil(executeTradingCycle(env));
  }
};

// 24/7 Core Trading Loop Engine (Runs fully serverless on Cron)
async function executeTradingCycle(env: Env): Promise<{ status: string; timestamp: number }> {
  // Always query our reliable relational database authority
  const db = env.STATE_DO ? null : getLocalDb();
  if (!db) return { status: 'DELEGATED_TO_DO', timestamp: Date.now() };

  const state = db.getSystemState();
  if (state.current_status === 'PAUSED') {
    return { status: 'PAUSED', timestamp: Date.now() };
  }

  try {
    const registry = new AdapterRegistry();
    const market = new MarketIngestionEngine();
    const tokenDiscovery = new TokenDiscoveryEngine();
    const scanner = new SecurityScannerEngine();
    const analyticFeatures = new FeatureEngine();
    const alpha = new AlphaEngine();
    const portfolio = new PortfolioEngine(db);
    const notification = new TelegramNotificationEngine(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);

    // Dynamic Online Adaptive weights loading
    const weightsSetting = db.getSetting('adaptive_weights');
    const weights = weightsSetting ? JSON.parse(weightsSetting) : { securityWeight: 0.25, momentumWeight: 0.35, macroWeight: 0.20, patternWeight: 0.20 };

    // Update active positions & exits
    const activePositions = db.getPositions();
    for (const pos of activePositions) {
      // Simulate real-time price updates with randomized drift
      const drift = 1 + (Math.random() * 0.04 - 0.018); // slight bullish drift
      const latestPrice = pos.current_price_usd * drift;

      const activePosObj: ActivePosition = {
        id: pos.id,
        tokenAddress: pos.token_address,
        chainId: pos.chain_id,
        name: pos.name,
        symbol: pos.symbol,
        buyPriceUsd: pos.buy_price_usd,
        currentPriceUsd: pos.current_price_usd,
        sizeUsd: pos.size_usd,
        amountTokens: pos.amount_tokens,
        buyTimestamp: pos.buy_timestamp,
        lastUpdateTimestamp: pos.last_update_timestamp,
        highestPriceUsd: pos.highest_price_usd,
        isPrincipalRecovered: pos.is_principal_recovered === 1,
        targetTakeProfitPercent: pos.target_take_profit_percent,
        stopLossPercent: pos.stop_loss_percent,
        trailingStopPercent: pos.trailing_stop_percent,
        isSimulation: pos.is_simulation === 1,
        pnlUsd: pos.pnl_usd,
        pnlPercent: pos.pnl_percent,
        regimeAtEntry: pos.regime_at_entry,
        setupPattern: pos.setup_pattern
      };

      const monitor = portfolio.updateAndCheckExit(activePosObj, latestPrice);
      if (monitor.exit && monitor.reason) {
        const closedTrade = portfolio.closePosition(activePosObj, latestPrice, monitor.reason);
        
        // Dynamic Online weights update via SGD
        const learning = new OnlineLearningEngine(db);
        learning.updateAdaptiveWeights(closedTrade);

        // Notify over Telegram
        await notification.sendTradeExecutionAlert({
          symbol: pos.symbol,
          side: 'SELL',
          price: latestPrice,
          amountUsd: pos.size_usd,
          pnlUsd: closedTrade.pnlUsd,
          pnlPercent: closedTrade.pnlPercent
        });
      }
    }

    // Fetch macro environment
    const macroData = await market.fetchMacroContext();
    const macroContext: MarketContext = {
      ...macroData,
      macroClimate: macroData.btcTrend === 'DUMPING' ? 'RISK_OFF' : 'RISK_ON',
      memecoinSectorHeat: 'WARM',
      macroMultiplier: macroData.btcTrend === 'BULLISH' ? 1.25 : (macroData.btcTrend === 'DUMPING' ? 0.5 : 1.0),
      tradePermission: macroData.btcTrend === 'DUMPING' ? 'HALTED_MACRO_RISK' : 'PERMITTED',
      rationaleEs: `Análisis global completado exitosamente para Bitcoin.`,
      rationaleEn: `Global analysis completed successfully for Bitcoin.`,
      lastUpdated: Date.now(),
      source: 'Coinbase/Kraken'
    };

    // Auto-discover and scan newly minted memecoin opportunities
    const tokens = await tokenDiscovery.discoverPairs();
    for (const token of tokens) {
      // Avoid duplicate holdings of same token
      const alreadyHeld = db.getPositions({ token_address: token.address });
      if (alreadyHeld.length > 0) continue;

      const securityReport = await scanner.scanToken(token.address, token.chainId);
      
      // Strict deterministic decision path (NO CRITICAL LLM DEPENDENCY)
      const decision = alpha.evaluateOpportunity(token, securityReport, macroContext, weights);

      if (decision.action === 'BUY') {
        const config: SystemConfig = {
          globalPause: false,
          simulationMode: true,
          maxDailyExposureUsd: parseFloat(db.getSetting('maxDailyExposureUsd') || '150.0'),
          maxTradeSizeUsd: parseFloat(db.getSetting('maxTradeSizeUsd') || '15.0'),
          minLiquidityUsd: parseFloat(db.getSetting('minLiquidityUsd') || '2000.0'),
          maxBuyTaxPercent: parseFloat(db.getSetting('maxBuyTaxPercent') || '8.0'),
          maxSellTaxPercent: parseFloat(db.getSetting('maxSellTaxPercent') || '8.0'),
          goplusMinScore: parseFloat(db.getSetting('goplusMinScore') || '80'),
          primaryLanguage: 'es',
          telegramToken: env.TELEGRAM_BOT_TOKEN || '',
          telegramChatId: env.TELEGRAM_CHAT_ID || '',
          telegramEnabled: !!env.TELEGRAM_BOT_TOKEN,
          simulatedSlippagePercent: 1.5,
          simulatedLatencyMs: 250,
          minRiskPercentPerTrade: 1.5,
          maxRiskPercentPerTrade: 5.0
        };

        const risk = new RiskEngine(db);
        const dynamicSize = risk.calculateDynamicSize(1000.0, decision, 0, config);
        const validation = risk.validateHardCaps(config, dynamicSize);

        if (validation.passed) {
          const filledTokens = dynamicSize / token.priceUsd;
          portfolio.openPosition(
            token,
            decision,
            dynamicSize,
            filledTokens,
            token.priceUsd,
            true // Hard paper trading default mode for safety
          );

          await notification.sendTradeExecutionAlert({
            symbol: token.symbol,
            side: 'BUY',
            price: token.priceUsd,
            amountUsd: dynamicSize
          });
        }
      }
    }

    db.addAuditEvent('SYSTEM_WATCHDOG', 'CYCLE_COMPLETED', undefined, `Ciclo autónomo completado. ${db.getPositions().length} posiciones activas.`);
    return { status: 'SUCCESS_COMPLETED', timestamp: Date.now() };
  } catch (err: any) {
    db.addAuditEvent('SYSTEM_WATCHDOG', 'CYCLE_FAILED', undefined, err.message);
    return { status: 'FAILED_ERROR', timestamp: Date.now() };
  }
}
