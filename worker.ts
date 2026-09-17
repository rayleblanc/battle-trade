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
import { AIRouter } from './src/backend/modules/ai_router';
import { SmartMoneyEngine } from './src/backend/modules/smart_money';
import { MasterWatchdogEngine } from './src/backend/modules/watchdogs';
import { UnifiedDecisionPipeline } from './src/backend/modules/pipeline';
import { HardeningEngine } from './src/backend/modules/hardening';
import { CloudflareOptimizer } from './src/backend/modules/cf_optimizer';
import { Demo7DManager } from './src/backend/modules/demo_7d';

export interface Env {
  TRADING_KV: any;
  STATE_DO?: any; // Bound SQLite-backed Durable Object for single-writer state authority
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

// Relational SQLite-backed Durable Object authority
export class BattleTradeStateDO {
  private db: BattleTradeDB;
  private aiRouter: AIRouter;
  private decisionPipeline: UnifiedDecisionPipeline;
  private masterWatchdogs: MasterWatchdogEngine;
  private demo7dManager: Demo7DManager;
  private telegramNotifier: TelegramNotificationEngine;
  
  constructor(private state: any, private env: Env) {
    // Initialize BattleTradeDB with SQLite storage from Durable Object State
    this.db = new BattleTradeDB(this.state.storage?.sql, this.state.storage);
    this.telegramNotifier = new TelegramNotificationEngine(this.env.TELEGRAM_BOT_TOKEN, this.env.TELEGRAM_CHAT_ID);
    this.aiRouter = new AIRouter({
      geminiApiKey: this.env.GEMINI_API_KEY,
      groqApiKey: this.env.GROQ_API_KEY
    });
    this.decisionPipeline = new UnifiedDecisionPipeline(this.db, this.aiRouter);
    this.masterWatchdogs = new MasterWatchdogEngine(this.db, this.telegramNotifier);
    this.demo7dManager = new Demo7DManager(this.db, this.decisionPipeline, this.telegramNotifier);

    // Clean recovery check on startup inside Durable Object blockConcurrencyWhile
    if (this.state.blockConcurrencyWhile) {
      this.state.blockConcurrencyWhile(async () => {
        try {
          this.db.performRecoveryCycle();
        } catch (e) {
          console.error('Error during DO recovery cycle:', e);
        }
      });
    }
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

    try {
      // 1. /api/state
      if (url.pathname === '/api/state') {
        const isSim = this.db.getSystemState().is_simulation === 1;
        const telemetry = new TelemetryEngine(this.db);
        const metrics = telemetry.calculatePerformanceMetrics(isSim);
        const positions = this.db.getPositions();
        const settings = this.db.getSettings();
        const auditLogs = this.db.getAuditEvents();
        const signals = this.db.getSignals();
        const history = this.db.getHistoricalTrades();

        const config: SystemConfig = {
          globalPause: this.db.getSystemState().current_status === 'PAUSED',
          simulationMode: this.db.getSystemState().is_simulation === 1,
          maxDailyExposureUsd: parseFloat(this.db.getSetting('maxDailyExposureUsd') || '15.0'),
          maxTradeSizeUsd: parseFloat(this.db.getSetting('maxTradeSizeUsd') || '2.5'),
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

        return new Response(JSON.stringify({
          success: true,
          state: this.db.getSystemState(),
          positions,
          metrics,
          settings,
          auditLogs: auditLogs.slice(0, 50),
          config,
          signals,
          history
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 2. /api/config
      if (url.pathname === '/api/config' && request.method === 'POST') {
        const body = await request.json() as any;
        if (body.globalPause !== undefined) {
          this.db.updateSystemState({ current_status: body.globalPause ? 'PAUSED' : 'RUNNING' });
        }
        if (body.simulationMode !== undefined) {
          this.db.updateSystemState({ is_simulation: body.simulationMode ? 1 : 0 });
        }
        for (const [k, v] of Object.entries(body)) {
          this.db.setSetting(k, String(v));
        }

        return new Response(JSON.stringify({ success: true, message: 'Configuration stored inside Durable Object SQLite authority.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 3. /api/order/execute
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

        return new Response(JSON.stringify({ success: true, position }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 4. /api/order/close
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

        const learning = new OnlineLearningEngine(this.db);
        learning.updateAdaptiveWeights(trade);

        return new Response(JSON.stringify({ success: true, trade }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 5. /api/system/control
      if (url.pathname === '/api/system/control' && request.method === 'POST') {
        const { action } = await request.json() as any;
        const portfolio = new PortfolioEngine(this.db);

        switch (action) {
          case 'RUN':
          case 'RESUME':
            this.db.updateSystemState({ current_status: 'RUNNING' });
            this.db.addAuditEvent('CONTROL_PANEL', 'RESUME_TRIGGERED', undefined, 'Motor reanudado.');
            break;
          case 'PAUSE_ENTRIES':
          case 'PAUSE':
            this.db.updateSystemState({ current_status: 'PAUSED' });
            this.db.addAuditEvent('CONTROL_PANEL', 'PAUSE_TRIGGERED', undefined, 'Nuevas entradas pausadas.');
            break;
          case 'CLOSE_ALL': {
            const openPositions = this.db.getPositions();
            for (const pos of openPositions) {
              portfolio.closePosition({
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
              }, pos.current_price_usd, 'MANUAL');
            }
            break;
          }
          case 'EMERGENCY_STOP':
          case 'KILL': {
            this.db.updateSystemState({ current_status: 'PAUSED' });
            const openPositions = this.db.getPositions();
            for (const pos of openPositions) {
              portfolio.closePosition({
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
              }, pos.current_price_usd, 'MANUAL');
            }
            break;
          }
        }

        return new Response(JSON.stringify({ success: true, action, currentStatus: this.db.getSystemState().current_status }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 6. /api/manual-tick
      if (url.pathname === '/api/manual-tick' || url.pathname === '/api/tick') {
        const result = await this.executeCycle();
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 7. /api/reset
      if (url.pathname === '/api/reset' && request.method === 'POST') {
        this.db.delete('positions', {});
        this.db.delete('audit_events', {});
        this.db.updateBalance('SIM_USD', 1000.0, 0.0);
        return new Response(JSON.stringify({ success: true, message: 'Database reset inside Durable Object SQLite authority.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 8. /api/pipeline/decisions
      if (url.pathname === '/api/pipeline/decisions') {
        const decisions = this.decisionPipeline.getAllDecisions(50);
        return new Response(JSON.stringify({ success: true, count: decisions.length, decisions }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 9. /api/pipeline/autopsies
      if (url.pathname === '/api/pipeline/autopsies') {
        const autopsies = this.decisionPipeline.getAllAutopsies(30);
        return new Response(JSON.stringify({ success: true, count: autopsies.length, autopsies }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 10. /api/demo/status
      if (url.pathname === '/api/demo/status') {
        const config = this.demo7dManager.getConfig();
        const scorecard = this.demo7dManager.generate7DayScorecard();
        return new Response(JSON.stringify({ success: true, config, scorecard }), {
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

  public async executeCycle(): Promise<{ status: string; timestamp: number }> {
    this.masterWatchdogs.recordHeartbeat();
    const state = this.db.getSystemState();
    if (state.current_status === 'PAUSED') {
      return { status: 'PAUSED', timestamp: Date.now() };
    }

    try {
      const isSim = state.is_simulation === 1;
      const telemetry = new TelemetryEngine(this.db);
      const metrics = telemetry.calculatePerformanceMetrics(isSim);

      const quotes = new Map<string, number>();
      const positions = this.db.getPositions();
      for (const p of positions) {
        const drift = 1 + (Math.random() * 0.03 - 0.012);
        quotes.set(p.token_address.toLowerCase(), p.current_price_usd * drift);
      }

      const { closedTrades } = await this.decisionPipeline.evaluateExitsAndAutopsies(quotes);
      for (const autopsy of closedTrades) {
        await this.telegramNotifier.sendTradeExecutionAlert({
          symbol: autopsy.asset.symbol,
          side: 'SELL',
          price: autopsy.exitSnapshot.priceUsd,
          amountUsd: autopsy.entrySnapshot.sizeUsd,
          pnlUsd: autopsy.performance.pnlUsd,
          pnlPercent: autopsy.performance.pnlPercent
        });
      }

      const market = new MarketIngestionEngine();
      const tokenDiscovery = new TokenDiscoveryEngine(this.db);
      const scanner = new SecurityScannerEngine(this.db);

      const macroData = await market.fetchMacroContext();
      this.masterWatchdogs.recordDataIngestion();

      const macroContext: MarketContext = {
        ...macroData,
        macroClimate: macroData.btcTrend === 'DUMPING' ? 'RISK_OFF' : 'RISK_ON',
        memecoinSectorHeat: 'WARM',
        macroMultiplier: macroData.btcTrend === 'BULLISH' ? 1.25 : (macroData.btcTrend === 'DUMPING' ? 0.5 : 1.0),
        tradePermission: macroData.btcTrend === 'DUMPING' ? 'HALTED_MACRO_RISK' : 'PERMITTED',
        rationaleEs: `Análisis de Bitcoin completado con éxito.`,
        rationaleEn: `Bitcoin analysis completed successfully.`,
        lastUpdated: Date.now(),
        source: 'Coinbase/Kraken'
      };

      const tokens = await tokenDiscovery.discoverPairs();
      for (const token of tokens) {
        const securityReport = await scanner.scanToken(token.address, token.chainId);
        const decision = await this.decisionPipeline.evaluateCandidate({
          token,
          security: securityReport,
          macro: macroContext
        });

        if (decision.finalAction === 'BUY' && decision.executionResult) {
          await this.telegramNotifier.sendTradeExecutionAlert({
            symbol: token.symbol,
            side: 'BUY',
            price: decision.executionResult.executionPriceUsd,
            amountUsd: decision.positionSizeUsd
          });
        }
      }

      this.db.addAuditEvent('DO_AUTHORITY', 'CYCLE_COMPLETED', undefined, `Ciclo en Durable Object SQLite completado. ${this.db.getPositions().length} posiciones activas.`);
      return { status: 'SUCCESS_COMPLETED', timestamp: Date.now() };
    } catch (err: any) {
      this.db.addAuditEvent('DO_AUTHORITY', 'CYCLE_FAILED', undefined, err.message);
      return { status: 'FAILED_ERROR', timestamp: Date.now() };
    }
  }
}

let localDbFallback: BattleTradeDB | null = null;
function getLocalDb(): BattleTradeDB {
  if (!localDbFallback) {
    localDbFallback = new BattleTradeDB();
  }
  return localDbFallback;
}

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

    if (env.STATE_DO) {
      const id = env.STATE_DO.idFromName('BATTLE_TRADE_GLOBAL_STATE');
      const stub = env.STATE_DO.get(id);
      return stub.fetch(request);
    }

    // Fallback mode when running locally without DO binding
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

    if (url.pathname === '/api/manual-tick') {
      const doObj = new BattleTradeStateDO({ storage: {} }, env);
      const result = await doObj.executeCycle();
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('BATTLE TRADE Serverless Worker Active (Fallback)', { 
      status: 200, 
      headers: corsHeaders 
    });
  },

  async scheduled(event: any, env: Env, ctx: any): Promise<void> {
    if (env.STATE_DO) {
      const id = env.STATE_DO.idFromName('BATTLE_TRADE_GLOBAL_STATE');
      const stub = env.STATE_DO.get(id);
      ctx.waitUntil(stub.fetch('http://do/api/manual-tick'));
    } else {
      const doObj = new BattleTradeStateDO({ storage: {} }, env);
      ctx.waitUntil(doObj.executeCycle());
    }
  }
};
