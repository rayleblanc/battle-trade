/**
 * Backend API Service - Express server simulating Cloudflare Workers & KV locally with real DEX scans,
 * security audits, and decentralized single-writer database logic.
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

// Import our modular database and core engines
import { BattleTradeDB } from './src/backend/modules/database';
import { AdapterRegistry } from './src/backend/modules/adapters';
import { MarketIngestionEngine, TokenDiscoveryEngine, SecurityScannerEngine } from './src/backend/modules/market';
import { FeatureEngine, MarketRegimeEngine, AlphaEngine, AiRouterEngine } from './src/backend/modules/analytics';
import { RiskEngine, PortfolioEngine } from './src/backend/modules/risk';
import { OnlineLearningEngine, WatchdogEngine, TelemetryEngine, StrategyRegistryEngine, TelegramNotificationEngine } from './src/backend/modules/system';
import { AIRouter } from './src/backend/modules/ai_router';
import { SmartMoneyEngine } from './src/backend/modules/smart_money';
import { MasterWatchdogEngine } from './src/backend/modules/watchdogs';
import { TelegramBotController } from './src/backend/modules/telegram';
import { UnifiedDecisionPipeline } from './src/backend/modules/pipeline';
import { HardeningEngine } from './src/backend/modules/hardening';
import { CloudflareOptimizer } from './src/backend/modules/cf_optimizer';
import { Demo7DManager } from './src/backend/modules/demo_7d';

import { ChainId, SystemConfig, MarketContext, ActivePosition, SystemHealth, OpportunitySignal, MarketRegime } from './src/shared/types';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize the single-writer relational DB singleton
const db = new BattleTradeDB();

// Initialize AI Router & Smart Money Singletons
const aiRouter = new AIRouter({
  geminiApiKey: process.env.GEMINI_API_KEY,
  groqApiKey: process.env.GROQ_API_KEY,
});
const smartMoneyEngine = new SmartMoneyEngine();

// Initialize Master Watchdog & Telegram Controller
const telegramNotifier = new TelegramNotificationEngine(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID);
const masterWatchdogs = new MasterWatchdogEngine(db, telegramNotifier);

// Initialize Single Unshakeable Decision Pipeline
const decisionPipeline = new UnifiedDecisionPipeline(db, aiRouter);
const telegramController = new TelegramBotController(db, masterWatchdogs, aiRouter, undefined, undefined, decisionPipeline);

// Initialize Hardening, CF Optimizer & 7-Day Demo Manager
const cfOptimizer = new CloudflareOptimizer(db, telegramNotifier);
const demo7dManager = new Demo7DManager(db, decisionPipeline, telegramNotifier);

// CORS Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 1. /api/state — Retrieve complete relational state
app.get('/api/state', (req, res) => {
  try {
    const isSim = db.getSystemState().is_simulation === 1;
    const telemetry = new TelemetryEngine(db);
    const metrics = telemetry.calculatePerformanceMetrics(isSim);
    const positions = db.getPositions();
    const settings = db.getSettings();
    const auditLogs = db.getAuditEvents();

    // Construct full SystemConfig
    const config: SystemConfig = {
      globalPause: db.getSystemState().current_status === 'PAUSED',
      simulationMode: db.getSystemState().is_simulation === 1,
      maxDailyExposureUsd: parseFloat(db.getSetting('maxDailyExposureUsd') || '15.0'),
      maxTradeSizeUsd: parseFloat(db.getSetting('maxTradeSizeUsd') || '2.5'),
      minLiquidityUsd: parseFloat(db.getSetting('minLiquidityUsd') || '2000.0'),
      maxBuyTaxPercent: parseFloat(db.getSetting('maxBuyTaxPercent') || '8.0'),
      maxSellTaxPercent: parseFloat(db.getSetting('maxSellTaxPercent') || '8.0'),
      goplusMinScore: parseFloat(db.getSetting('goplusMinScore') || '80'),
      primaryLanguage: (db.getSetting('primaryLanguage') || 'es') as 'es' | 'en',
      telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
      telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
      telegramEnabled: !!process.env.TELEGRAM_BOT_TOKEN,
      simulatedSlippagePercent: parseFloat(db.getSetting('simulatedSlippagePercent') || '1.5'),
      simulatedLatencyMs: parseFloat(db.getSetting('simulatedLatencyMs') || '250'),
      minRiskPercentPerTrade: parseFloat(db.getSetting('minRiskPercentPerTrade') || '1.5'),
      maxRiskPercentPerTrade: parseFloat(db.getSetting('maxRiskPercentPerTrade') || '5.0')
    };

    // Construct full SystemHealth
    const quotaStatus = aiRouter.getQuotaStatus();
    const health: SystemHealth = {
      lastExecutionTimestamp: Date.now(),
      rpcEndpoints: [
        { url: 'https://developer-access-mainnet.base.org', chainId: ChainId.BASE, name: 'Base Primary RPC', isHealthy: true, latencyMs: 45, lastCheckTimestamp: Date.now(), failureCount: 0, isPrimary: true },
        { url: 'https://bsc-dataseed.binance.org', chainId: ChainId.BSC, name: 'BSC Primary RPC', isHealthy: true, latencyMs: 65, lastCheckTimestamp: Date.now(), failureCount: 0, isPrimary: true }
      ],
      llmProviders: [
        { name: 'Gemini', currentModel: 'gemini-3.8-flash', isHealthy: !quotaStatus.allGeminiExhausted, latencyMs: 220, lastUsedTimestamp: Date.now(), circuitBreakerTripped: quotaStatus.allGeminiExhausted, errorsInRow: 0 },
        { name: 'Groq', currentModel: 'qwen/qwen3.8-27b', isHealthy: !quotaStatus.allGroqExhausted, latencyMs: 160, lastUsedTimestamp: Date.now(), circuitBreakerTripped: quotaStatus.allGroqExhausted, errorsInRow: 0 }
      ],
      telegramBotHealthy: true,
      rateLimitApproximation: 12,
      circuitBreakerActive: quotaStatus.isQuotaExhausted,
      currentCapitalUsd: metrics.currentCapitalUsd || 1000.0,
      engineRunning: db.getSystemState().current_status === 'RUNNING'
    };

    const signals = db.getSignals();
    const history = db.getHistoricalTrades();

    res.json({
      success: true,
      state: db.getSystemState(),
      positions,
      metrics,
      settings,
      auditLogs: auditLogs.slice(0, 50),
      config,
      health,
      signals,
      history
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. /api/config — Update bot configuration (limits, mode, languages)
app.post('/api/config', (req, res) => {
  try {
    const body = req.body;
    if (body.globalPause !== undefined) {
      db.updateSystemState({ current_status: body.globalPause ? 'PAUSED' : 'RUNNING' });
    }
    if (body.simulationMode !== undefined) {
      db.updateSystemState({ is_simulation: body.simulationMode ? 1 : 0 });
    }
    
    // Save settings
    for (const [k, v] of Object.entries(body)) {
      db.setSetting(k, String(v));
    }

    res.json({ success: true, message: 'Configuration stored successfully in relational DB.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. /api/order/execute — Execute a simulated order
app.post('/api/order/execute', (req, res) => {
  try {
    const orderData = req.body;
    const config: SystemConfig = {
      globalPause: db.getSystemState().current_status === 'PAUSED',
      simulationMode: db.getSystemState().is_simulation === 1,
      maxDailyExposureUsd: parseFloat(db.getSetting('maxDailyExposureUsd') || '150.0'),
      maxTradeSizeUsd: parseFloat(db.getSetting('maxTradeSizeUsd') || '15.0'),
      minLiquidityUsd: parseFloat(db.getSetting('minLiquidityUsd') || '2000.0'),
      maxBuyTaxPercent: parseFloat(db.getSetting('maxBuyTaxPercent') || '8.0'),
      maxSellTaxPercent: parseFloat(db.getSetting('maxSellTaxPercent') || '8.0'),
      goplusMinScore: parseFloat(db.getSetting('goplusMinScore') || '80'),
      primaryLanguage: (db.getSetting('primaryLanguage') || 'es') as 'es' | 'en',
      telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
      telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
      telegramEnabled: !!process.env.TELEGRAM_BOT_TOKEN,
      simulatedSlippagePercent: parseFloat(db.getSetting('simulatedSlippagePercent') || '1.5'),
      simulatedLatencyMs: parseFloat(db.getSetting('simulatedLatencyMs') || '250'),
      minRiskPercentPerTrade: parseFloat(db.getSetting('minRiskPercentPerTrade') || '1.5'),
      maxRiskPercentPerTrade: parseFloat(db.getSetting('maxRiskPercentPerTrade') || '5.0')
    };

    const risk = new RiskEngine(db);
    const check = risk.validateHardCaps(config, orderData.sizeUsd);

    if (!check.passed) {
      return res.status(400).json({ success: false, reason: check.reason });
    }

    const portfolio = new PortfolioEngine(db);
    const position = portfolio.openPosition(
      orderData.token,
      orderData.decision,
      orderData.sizeUsd,
      orderData.amountTokens,
      orderData.buyPriceUsd,
      config.simulationMode
    );

    res.json({ success: true, position });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. /api/order/close — Close an active position
app.post('/api/order/close', (req, res) => {
  try {
    const body = req.body;
    const portfolio = new PortfolioEngine(db);
    const pos = db.getPosition(body.positionId);
    
    if (!pos) {
      return res.status(404).json({ success: false, reason: 'Position not found' });
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

    // Online SGD learning to re-balance decision weights
    const learning = new OnlineLearningEngine(db);
    learning.updateAdaptiveWeights(trade);

    res.json({ success: true, trade });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. /api/reset — Resets the database
app.post('/api/reset', (req, res) => {
  try {
    db.delete('positions', {});
    db.delete('audit_events', {});
    db.updateBalance('SIM_USD', 1000.0, 0.0);
    res.json({ success: true, message: 'Simulation Database Reset Completed.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. /api/telegram/status — Check Telegram parameters
app.get('/api/telegram/status', (req, res) => {
  const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const hasChatId = Boolean(process.env.TELEGRAM_CHAT_ID);
  res.json({
    enabled: Boolean(hasToken && hasChatId),
    hasToken,
    hasChatId,
    expressServerActive: true
  });
});

// 7. /api/telegram/test — Test Telegram messaging
app.get('/api/telegram/test', async (req, res) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return res.status(400).json({ success: false, error: 'Telegram secrets are not configured in .env file.' });
  }

  try {
    const notification = new TelegramNotificationEngine(botToken, chatId);
    await notification.sendOutboundNotification(`⚡ <b>BATTLE TRADE — Local Test</b>\n\n⏰ Time: ${new Date().toISOString()}`);
    res.json({ success: true, message: 'Test message broadcasted.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. /api/ai/status — Telemetry & Quota Status for all AI models in cascade
app.get('/api/ai/status', (req, res) => {
  try {
    const quota = aiRouter.getQuotaStatus();
    const telemetry = aiRouter.getAllTelemetry();
    res.json({
      success: true,
      quota,
      telemetry,
      canEnterNewTrades: aiRouter.isNewEntryAllowedByAIQuota()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. /api/ai/sentiment — Auxiliary sentiment analysis (non-authoritative)
app.post('/api/ai/sentiment', async (req, res) => {
  try {
    const { tokenSymbol, tokenName, volume24hUsd, priceChange24hPercent, liquidityUsd } = req.body;
    const sentiment = await aiRouter.analyzeSentiment(
      tokenSymbol || 'TOKEN',
      tokenName || 'Token',
      {
        volume24hUsd: volume24hUsd || 10000,
        priceChange24hPercent: priceChange24hPercent || 0,
        liquidityUsd: liquidityUsd || 5000
      }
    );
    res.json({ success: true, sentiment });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. /api/ai/anomaly — Detect wash trading & volume anomalies
app.post('/api/ai/anomaly', async (req, res) => {
  try {
    const { tokenSymbol, buyVolumeUsd, sellVolumeUsd, uniqueBuyers, uniqueSellers, txCount } = req.body;
    const anomaly = await aiRouter.detectAnomalies(
      tokenSymbol || 'TOKEN',
      {
        buyVolumeUsd: buyVolumeUsd || 0,
        sellVolumeUsd: sellVolumeUsd || 0,
        uniqueBuyers: uniqueBuyers || 1,
        uniqueSellers: uniqueSellers || 1,
        txCount: txCount || 10
      }
    );
    res.json({ success: true, anomaly });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. /api/ai/explain — Plain-language and quant explanation of signal
app.post('/api/ai/explain', async (req, res) => {
  try {
    const { signalId, tokenSymbol, strategyName, score, confidence, regime, evUsd } = req.body;
    const explanation = await aiRouter.explainSignal(
      signalId || 'SIG-01',
      tokenSymbol || 'TOKEN',
      strategyName || 'Momentum',
      score || 75,
      confidence || 0.8,
      regime || 'TREND_UP',
      evUsd || 2.5
    );
    res.json({ success: true, explanation });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. /api/smart-money/flow — Retrieve Smart Money Flow & Cohort distribution
app.get('/api/smart-money/flow', (req, res) => {
  try {
    const token = (req.query.token as string) || '0x0000000000000000000000000000000000000000';
    const chainId = (req.query.chainId as ChainId) || ChainId.BASE;
    const tf = (req.query.timeframe as '5m' | '15m' | '1h') || '15m';

    const flow = smartMoneyEngine.calculateSmartMoneyFlow(token, chainId, tf);
    res.json({ success: true, flow });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. /api/smart-money/signal — Smart Money bias & anti-sybil validation
app.get('/api/smart-money/signal', (req, res) => {
  try {
    const token = (req.query.token as string) || '0x0000000000000000000000000000000000000000';
    const chainId = (req.query.chainId as ChainId) || ChainId.BASE;

    const signal = smartMoneyEngine.generateSignal(token, chainId);
    res.json({ success: true, signal });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14. /api/smart-money/metrics — Ecosystem-wide meme intelligence metrics
app.get('/api/smart-money/metrics', (req, res) => {
  try {
    const chainId = (req.query.chainId as ChainId) || ChainId.BASE;
    const metrics = smartMoneyEngine.getMemeIntelligenceMetrics(chainId);
    res.json({ success: true, metrics, isEnabled: smartMoneyEngine.isEnabled() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 15. /api/smart-money/toggle — Dynamically toggle smart money layer without breaking core
app.post('/api/smart-money/toggle', (req, res) => {
  try {
    const { enabled } = req.body;
    smartMoneyEngine.setEnabled(Boolean(enabled));
    res.json({ success: true, isEnabled: smartMoneyEngine.isEnabled() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 16. /api/system/control — Master control operations (RUN, PAUSE_ENTRIES, RESUME, CLOSE_ALL, EMERGENCY_STOP)
app.post('/api/system/control', async (req, res) => {
  try {
    const { action } = req.body;
    const portfolio = new PortfolioEngine(db);

    switch (action) {
      case 'RUN':
      case 'RESUME':
        db.updateSystemState({ current_status: 'RUNNING' });
        db.addAuditEvent('CONTROL_PANEL', 'RESUME_TRIGGERED', undefined, 'Motor reanudado en modo autónomo.');
        break;

      case 'PAUSE_ENTRIES':
      case 'PAUSE':
        db.updateSystemState({ current_status: 'PAUSED' });
        db.addAuditEvent('CONTROL_PANEL', 'PAUSE_TRIGGERED', undefined, 'Nuevas entradas pausadas. Gestión de salidas activa.');
        break;

      case 'CLOSE_ALL': {
        const openPositions = db.getPositions();
        let closedCount = 0;
        for (const pos of openPositions) {
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
          portfolio.closePosition(activePosObj, pos.current_price_usd, 'MANUAL');
          closedCount++;
        }
        db.addAuditEvent('CONTROL_PANEL', 'CLOSE_ALL_EXECUTED', undefined, `Se cerraron ${closedCount} posiciones.`);
        break;
      }

      case 'EMERGENCY_STOP':
      case 'KILL': {
        db.updateSystemState({ current_status: 'PAUSED' });
        const openPositions = db.getPositions();
        for (const pos of openPositions) {
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
          portfolio.closePosition(activePosObj, pos.current_price_usd, 'MANUAL');
        }
        db.addAuditEvent('CONTROL_PANEL', 'EMERGENCY_STOP_TRIPPED', undefined, 'Parada de emergencia ejecutada. Motor HALTED y posiciones cerradas.');
        break;
      }

      default:
        return res.status(400).json({ success: false, error: `Acción desconocida: ${action}` });
    }

    res.json({ success: true, action, currentStatus: db.getSystemState().current_status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 17. /api/watchdogs/status — Comprehensive multi-watchdog health check
app.get('/api/watchdogs/status', (req, res) => {
  try {
    const isSim = db.getSystemState().is_simulation === 1;
    const telemetry = new TelemetryEngine(db);
    const metrics = telemetry.calculatePerformanceMetrics(isSim);

    const report = masterWatchdogs.evaluateAllWatchdogs({
      metrics,
      providers: [
        { name: 'Base Primary RPC', isHealthy: true, latencyMs: 45 },
        { name: 'BSC Primary RPC', isHealthy: true, latencyMs: 65 },
        { name: 'DexScreener Feed', isHealthy: true, latencyMs: 120 },
        { name: 'GoPlus Security API', isHealthy: true, latencyMs: 180 }
      ]
    });

    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 18. /api/watchdogs/reconcile — Force portfolio reconciliation check
app.post('/api/watchdogs/reconcile', (req, res) => {
  try {
    const reconciliation = masterWatchdogs.reconcilePortfolio();
    res.json({ success: true, reconciliation });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 19. /api/orders — Retrieve order lifecycle and activity stream
app.get('/api/orders', (req, res) => {
  try {
    const positions = db.getPositions();
    const history = db.getHistoricalTrades();

    const orders: any[] = [];

    // Map open positions to active FILLED buy orders
    positions.forEach(p => {
      orders.push({
        id: `ord_${p.id}`,
        tokenSymbol: p.symbol,
        tokenAddress: p.token_address,
        chainId: p.chain_id,
        side: 'BUY',
        type: 'LIMIT_IOC',
        status: 'FILLED',
        priceUsd: p.buy_price_usd,
        sizeUsd: p.size_usd,
        amountTokens: p.amount_tokens,
        filledTimestamp: p.buy_timestamp,
        latencyMs: 145,
        slippagePercent: 0.85,
        targetTakeProfitPercent: p.target_take_profit_percent,
        stopLossPercent: p.stop_loss_percent
      });
    });

    // Map recent history to closed orders
    history.slice(0, 30).forEach(h => {
      orders.push({
        id: `ord_close_${h.id}`,
        tokenSymbol: h.symbol,
        tokenAddress: h.tokenAddress,
        chainId: h.chainId,
        side: 'SELL',
        type: 'MARKET',
        status: 'FILLED',
        priceUsd: h.sellPriceUsd,
        sizeUsd: h.sizeUsd,
        amountTokens: h.sizeUsd / (h.buyPriceUsd || 0.001),
        filledTimestamp: h.sellTimestamp,
        latencyMs: 160,
        slippagePercent: 1.1,
        pnlUsd: h.pnlUsd,
        pnlPercent: h.pnlPercent,
        exitReason: h.exitReason
      });
    });

    // Sort descending by timestamp
    orders.sort((a, b) => b.filledTimestamp - a.filledTimestamp);

    res.json({ success: true, orders: orders.slice(0, 50) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 20. /api/strategies/config — Retrieve and update strategy weights and status
app.get('/api/strategies/config', (req, res) => {
  try {
    const weightsStr = db.getSetting('adaptive_weights');
    const enabledStr = db.getSetting('enabled_strategies');

    const defaultWeights = {
      momentum: 0.20,
      breakout: 0.15,
      newPool: 0.15,
      meanReversion: 0.10,
      volumeExpansion: 0.15,
      liquidityEvent: 0.10,
      smartMoney: 0.15
    };

    const defaultEnabled = {
      momentum: true,
      breakout: true,
      newPool: true,
      meanReversion: true,
      volumeExpansion: true,
      liquidityEvent: true,
      smartMoney: true
    };

    const weights = weightsStr ? JSON.parse(weightsStr) : defaultWeights;
    const enabled = enabledStr ? JSON.parse(enabledStr) : defaultEnabled;

    res.json({ success: true, weights, enabled });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/strategies/config', (req, res) => {
  try {
    const { weights, enabled } = req.body;
    if (weights) {
      db.setSetting('adaptive_weights', JSON.stringify(weights));
    }
    if (enabled) {
      db.setSetting('enabled_strategies', JSON.stringify(enabled));
    }
    db.addAuditEvent('STRATEGY_CONFIG', 'WEIGHTS_UPDATED', undefined, 'Ponderaciones de estrategias actualizadas.');
    res.json({ success: true, message: 'Configuración de estrategias sincronizada.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 21. /api/telegram/command — Execute Telegram command via webhook or dashboard terminal
app.post('/api/telegram/command', async (req, res) => {
  try {
    const { message, chatId, username } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Mensaje requerido' });
    }

    const cleanMsg = message.trim();
    const parts = cleanMsg.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID || 'dashboard_operator';
    telegramController.authorizeChatId(targetChatId);

    const response = await telegramController.handleMessage({
      chatId: targetChatId,
      username: username || 'operator',
      command,
      args,
      rawText: cleanMsg
    });

    res.json({ success: true, response });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 22. /api/pipeline/decisions — Retrieve all recent immutable Decision Objects
app.get('/api/pipeline/decisions', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const decisions = decisionPipeline.getAllDecisions(limit);
    res.json({ success: true, count: decisions.length, decisions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 23. /api/pipeline/why — Query explainability endpoint ("¿Por qué no compraste X?")
app.all('/api/pipeline/why', async (req, res) => {
  try {
    const query = (req.method === 'POST' ? req.body.token || req.body.symbol : req.query.token || req.query.symbol) as string;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Se requiere parámetro token o symbol' });
    }
    const explanation = await decisionPipeline.explainDecision(query);
    res.json({ success: true, ...explanation });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 24. /api/pipeline/autopsies — Retrieve structured post-trade autopsies with real evidence
app.get('/api/pipeline/autopsies', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 30;
    const autopsies = decisionPipeline.getAllAutopsies(limit);
    res.json({ success: true, count: autopsies.length, autopsies });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 25. /api/pipeline/autopsy/:id — Get specific autopsy by tradeId or autopsyId
app.get('/api/pipeline/autopsy/:id', (req, res) => {
  try {
    const autopsy = decisionPipeline.getAutopsyByTradeId(req.params.id);
    if (!autopsy) {
      return res.status(404).json({ success: false, error: 'Autopsia no encontrada' });
    }
    res.json({ success: true, autopsy });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 26. /api/pipeline/metrics — Comprehensive 6-dimensional measurement system
app.get('/api/pipeline/metrics', (req, res) => {
  try {
    const isSim = db.getSystemState().is_simulation === 1;
    const comprehensiveMetrics = decisionPipeline.calculateComprehensiveMetrics(isSim);
    res.json({ success: true, metrics: comprehensiveMetrics });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 27. /api/pipeline/evaluate — Manual evaluation of a candidate through the pipeline
app.post('/api/pipeline/evaluate', async (req, res) => {
  try {
    const { token, security, macro, rawPriceHistory } = req.body;
    if (!token || !security || !macro) {
      return res.status(400).json({ success: false, error: 'Faltan parámetros obligatorios (token, security, macro)' });
    }
    const decision = await decisionPipeline.evaluateCandidate({
      token,
      security,
      macro,
      rawPriceHistory
    });
    res.json({ success: true, decision });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 28. /api/manual-tick — Manual execution trigger
app.get('/api/manual-tick', async (req, res) => {
  const result = await executeLocalCycle();
  res.json(result);
});

// 29. /api/demo/status — 7-Day Autonomous Demo Status
app.get('/api/demo/status', (req, res) => {
  try {
    const config = demo7dManager.getConfig();
    const scorecard = demo7dManager.generate7DayScorecard();
    res.json({ success: true, config, scorecard });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 30. /api/demo/start — Start or Resume 7-Day Autonomous Demo
app.post('/api/demo/start', (req, res) => {
  try {
    const config = demo7dManager.startDemo();
    res.json({ success: true, message: 'Demo autónoma de 7 días iniciada.', config });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 31. /api/demo/stop — Pause 7-Day Autonomous Demo
app.post('/api/demo/stop', (req, res) => {
  try {
    const config = demo7dManager.stopDemo();
    res.json({ success: true, message: 'Demo autónoma pausada.', config });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 32. /api/demo/reset — Reset Paper Demo Capital & Positions
app.post('/api/demo/reset', (req, res) => {
  try {
    demo7dManager.resetPaperDemo();
    res.json({ success: true, message: 'Capital de simulación reseteado a $1,000.00 USD.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 33. /api/demo/scorecard — Generate 7-Day Scorecard JSON
app.get('/api/demo/scorecard', (req, res) => {
  try {
    const scorecard = demo7dManager.generate7DayScorecard();
    res.json({ success: true, scorecard });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 34. /api/demo/export-reports — Export Scorecard and Dataset files
app.post('/api/demo/export-reports', (req, res) => {
  try {
    const reportResult = demo7dManager.exportScorecardReport();
    const datasetResult = demo7dManager.exportTradeDataset();
    res.json({ success: true, reportResult, datasetResult });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Background Autonomous trading cycle executor for local Express run
async function executeLocalCycle() {
  masterWatchdogs.recordHeartbeat();
  const state = db.getSystemState();

  const isSim = state.is_simulation === 1;
  const telemetry = new TelemetryEngine(db);
  const metrics = telemetry.calculatePerformanceMetrics(isSim);

  // Evaluate watchdogs
  const healthReport = masterWatchdogs.evaluateAllWatchdogs({ metrics });

  // Daily summary checks & Data retention cleanup
  const currentRegime = (db.getSetting('market_regime') as MarketRegime) || 'MOMENTUM';
  await masterWatchdogs.maybeTriggerDailySummary(metrics, currentRegime);
  await demo7dManager.maybeTriggerDailySummary();
  cfOptimizer.enforceDataRetentionPolicy();

  try {
    const notification = telegramNotifier;

    // 1. Evaluate exits & generate structured autopsies for active positions
    const quotes = new Map<string, number>();
    const positions = db.getPositions();
    for (const p of positions) {
      const drift = 1 + (Math.random() * 0.03 - 0.012);
      quotes.set(p.token_address.toLowerCase(), p.current_price_usd * drift);
    }

    const { closedTrades } = await decisionPipeline.evaluateExitsAndAutopsies(quotes);
    for (const autopsy of closedTrades) {
      await notification.sendTradeExecutionAlert({
        symbol: autopsy.asset.symbol,
        side: 'SELL',
        price: autopsy.exitSnapshot.priceUsd,
        amountUsd: autopsy.entrySnapshot.sizeUsd,
        pnlUsd: autopsy.performance.pnlUsd,
        pnlPercent: autopsy.performance.pnlPercent
      });
    }

    // Check if new entries are allowed by Pause state, Watchdogs, or AI Quota
    if (state.current_status === 'PAUSED' || !healthReport.isEntryAllowed || !aiRouter.isNewEntryAllowedByAIQuota()) {
      return { 
        status: state.current_status === 'PAUSED' ? 'PAUSED' : 'ENTRIES_FROZEN', 
        overallState: healthReport.overallState,
        timestamp: Date.now() 
      };
    }

    // 2. Fetch Macro & Scan for newly minted opportunities
    const market = new MarketIngestionEngine();
    const tokenDiscovery = new TokenDiscoveryEngine();
    const scanner = new SecurityScannerEngine();

    const macroData = await market.fetchMacroContext();
    masterWatchdogs.recordDataIngestion();

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

      // SINGLE MANDATORY PIPELINE PASS
      const decision = await decisionPipeline.evaluateCandidate({
        token,
        security: securityReport,
        macro: macroContext
      });

      if (decision.finalAction === 'BUY' && decision.executionResult) {
        await notification.sendTradeExecutionAlert({
          symbol: token.symbol,
          side: 'BUY',
          price: decision.executionResult.executionPriceUsd,
          amountUsd: decision.positionSizeUsd
        });
      }
    }

    db.addAuditEvent('LOCAL_SERVER_DAEMON', 'CYCLE_COMPLETED', undefined, `Ciclo local completado via UnifiedDecisionPipeline. ${db.getPositions().length} posiciones activas.`);
    return { status: 'SUCCESS_COMPLETED', timestamp: Date.now() };
  } catch (err: any) {
    db.addAuditEvent('LOCAL_SERVER_DAEMON', 'CYCLE_FAILED', undefined, err.message);
    return { status: 'FAILED_ERROR', timestamp: Date.now() };
  }
}

// Background daemon intervals running the continuous 7-day autonomous simulation trading loop
setInterval(() => {
  executeLocalCycle();
}, 30000); // Executed every 30 seconds locally

// Integrate Vite Middleware for Hot Module Replacement in Development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
