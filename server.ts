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

import { ChainId, SystemConfig, MarketContext, ActivePosition } from './src/shared/types';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize the single-writer relational DB singleton
const db = new BattleTradeDB();

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

    res.json({
      success: true,
      state: db.getSystemState(),
      positions,
      metrics,
      settings,
      auditLogs: auditLogs.slice(0, 50)
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

// 8. /api/manual-tick — Manual execution trigger
app.get('/api/manual-tick', async (req, res) => {
  const result = await executeLocalCycle();
  res.json(result);
});

// Background Autonomous trading cycle executor for local Express run
async function executeLocalCycle() {
  const state = db.getSystemState();
  if (state.current_status === 'PAUSED') {
    return { status: 'PAUSED', timestamp: Date.now() };
  }

  try {
    const market = new MarketIngestionEngine();
    const tokenDiscovery = new TokenDiscoveryEngine();
    const scanner = new SecurityScannerEngine();
    const alpha = new AlphaEngine();
    const portfolio = new PortfolioEngine(db);
    const notification = new TelegramNotificationEngine(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID);

    const weightsSetting = db.getSetting('adaptive_weights');
    const weights = weightsSetting ? JSON.parse(weightsSetting) : { securityWeight: 0.25, momentumWeight: 0.35, macroWeight: 0.20, patternWeight: 0.20 };

    // 1. Update active positions and trigger stops
    const activePositions = db.getPositions();
    for (const pos of activePositions) {
      const drift = 1 + (Math.random() * 0.04 - 0.018);
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
        
        // Dynamic Online weights update
        const learning = new OnlineLearningEngine(db);
        learning.updateAdaptiveWeights(closedTrade);

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

    // 2. Fetch Macro & Scan for newly minted opportunities
    const macroData = await market.fetchMacroContext();
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
      const alreadyHeld = db.getPositions({ token_address: token.address });
      if (alreadyHeld.length > 0) continue;

      const securityReport = await scanner.scanToken(token.address, token.chainId);
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
          telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
          telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
          telegramEnabled: !!process.env.TELEGRAM_BOT_TOKEN,
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
          portfolio.openPosition(token, decision, dynamicSize, filledTokens, token.priceUsd, true);

          await notification.sendTradeExecutionAlert({
            symbol: token.symbol,
            side: 'BUY',
            price: token.priceUsd,
            amountUsd: dynamicSize
          });
        }
      }
    }

    db.addAuditEvent('LOCAL_SERVER_DAEMON', 'CYCLE_COMPLETED', undefined, `Ciclo local completado. ${db.getPositions().length} posiciones activas.`);
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
