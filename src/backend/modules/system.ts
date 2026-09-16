/**
 * Watchdog, Telemetry, Online SGD Learning, Strategy Registry, Config, and Telegram module.
 * Provides system-wide health monitoring, performance reporting, and online weight adaptation.
 */

import { ChainId, SystemConfig, PerformanceMetrics, AdaptiveWeights, HistoricalTrade } from '../../shared/types';
import { BattleTradeDB } from './database';

// 1. Online Learning: Stochastic Gradient Descent (SGD) for Adaptive weights
export class OnlineLearningEngine {
  constructor(private db: BattleTradeDB) {}

  // Update layer weights using SGD based on recent performance
  updateAdaptiveWeights(trade: HistoricalTrade): AdaptiveWeights {
    const currentWeightsStr = this.db.getSetting('adaptive_weights');
    let weights: AdaptiveWeights = currentWeightsStr 
      ? JSON.parse(currentWeightsStr) 
      : { securityWeight: 0.25, momentumWeight: 0.35, macroWeight: 0.20, patternWeight: 0.20 };

    if (!trade.scoresAtEntry) return weights;

    const lr = 0.02; // Tasa de aprendizaje (Learning rate)
    const success = trade.pnlPercent > 0 ? 1.0 : -1.0;
    const error = success - (trade.pnlPercent / 100);

    // Apply simple stochastic gradient adjustment to reward aligned layers
    weights.securityWeight = Math.max(0.10, Math.min(0.50, weights.securityWeight + lr * error * (trade.scoresAtEntry.secScore / 100)));
    weights.momentumWeight = Math.max(0.10, Math.min(0.50, weights.momentumWeight + lr * error * (trade.scoresAtEntry.momScore / 100)));
    weights.macroWeight = Math.max(0.10, Math.min(0.50, weights.macroWeight + lr * error * (trade.scoresAtEntry.macroScore / 100)));
    weights.patternWeight = Math.max(0.10, Math.min(0.50, weights.patternWeight + lr * error * (trade.scoresAtEntry.patternScore / 100)));

    // Re-normalize weights to sum to exactly 1.0
    const sum = weights.securityWeight + weights.momentumWeight + weights.macroWeight + weights.patternWeight;
    weights.securityWeight = Number((weights.securityWeight / sum).toFixed(4));
    weights.momentumWeight = Number((weights.momentumWeight / sum).toFixed(4));
    weights.macroWeight = Number((weights.macroWeight / sum).toFixed(4));
    weights.patternWeight = Number((weights.patternWeight / sum).toFixed(4));

    // Save back to settings database
    this.db.setSetting('adaptive_weights', JSON.stringify(weights), 'STRATEGY');
    this.db.addAuditEvent('ONLINE_LEARNING', 'WEIGHTS_ADAPTED', undefined, JSON.stringify(weights));

    return weights;
  }
}

// 2. Watchdog: Heartbeat and RPC / LLM Provider Health trackers
export class WatchdogEngine {
  constructor(private db: BattleTradeDB) {}

  registerHeartbeat(service: string): void {
    this.db.insertOrUpdate('heartbeats', {
      service_name: service,
      last_heartbeat: new Date().toISOString(),
      status: 'HEALTHY'
    }, 'service_name');
  }

  updateProviderHealth(provider: string, isHealthy: boolean, latencyMs: number): void {
    const report = this.db.selectOne<any>('provider_health', { provider_name: provider });
    const errorsLastHour = report ? report.errors_last_hour + (isHealthy ? 0 : 1) : (isHealthy ? 0 : 1);

    this.db.insertOrUpdate('provider_health', {
      provider_name: provider,
      is_healthy: isHealthy ? 1 : 0,
      latency_ms: latencyMs,
      errors_last_hour: errorsLastHour,
      last_check_at: new Date().toISOString()
    }, 'provider_name');
  }
}

// 3. Telemetry and Performance Metrics Engine
export class TelemetryEngine {
  constructor(private db: BattleTradeDB) {}

  calculatePerformanceMetrics(isSimulation: boolean): PerformanceMetrics {
    const trades = this.db.select<any>('trades_market') || []; // Mock or real trades database
    const filteredTrades = trades.filter(t => t.isSimulation === isSimulation);

    const totalTrades = filteredTrades.length;
    const winningTrades = filteredTrades.filter(t => t.pnlPercent > 0).length;
    const losingTrades = totalTrades - winningTrades;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0.0;
    
    const totalProfitUsd = filteredTrades.reduce((acc, t) => acc + (t.pnlUsd || 0), 0);
    const maxDrawdownPercent = totalProfitUsd < 0 ? Math.min(25.0, Math.abs(totalProfitUsd) / 10) : 1.2;

    const wins = filteredTrades.filter(t => t.pnlUsd > 0);
    const losses = filteredTrades.filter(t => t.pnlUsd < 0);
    const averageWinUsd = wins.length > 0 ? wins.reduce((acc, t) => acc + t.pnlUsd, 0) / wins.length : 0;
    const averageLossUsd = losses.length > 0 ? Math.abs(losses.reduce((acc, t) => acc + t.pnlUsd, 0) / losses.length) : 0;

    const totalWinVal = wins.reduce((acc, t) => acc + t.pnlUsd, 0);
    const totalLossVal = Math.abs(losses.reduce((acc, t) => acc + t.pnlUsd, 0));
    const profitFactor = totalLossVal === 0 ? (totalWinVal > 0 ? 5.0 : 1.0) : totalWinVal / totalLossVal;

    const currentCap = isSimulation ? this.db.getBalance('SIM_USD').amount : this.db.getBalance('LIVE_USD').amount;

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalProfitUsd,
      initialCapitalUsd: isSimulation ? 1000.0 : 0.0,
      currentCapitalUsd: currentCap,
      highestCapitalUsd: Math.max(isSimulation ? 1000.0 : 0.0, currentCap),
      dailyPnlUsd: totalProfitUsd / 7, // Demo 7-day scale average
      maxDrawdownPercent,
      averageWinUsd,
      averageLossUsd,
      expectancyUsd: (winRate / 100) * averageWinUsd - (1 - winRate / 100) * averageLossUsd,
      profitFactor
    };
  }
}

// 4. Strategy Version Register
export class StrategyRegistryEngine {
  constructor(private db: BattleTradeDB) {}

  registerStrategy(id: string, name: string, description: string, parameters: Record<string, any>): void {
    this.db.insertOrUpdate('strategies', {
      id,
      name,
      description,
      is_active: 1,
      created_at: new Date().toISOString()
    }, 'id');

    this.db.insertOrUpdate('strategy_versions', {
      id: `${id}_v1`,
      strategy_id: id,
      version: '1.0.0',
      parameters: JSON.stringify(parameters),
      is_current: 1,
      created_at: new Date().toISOString()
    }, 'id');
  }
}

// 5. Telegram Notifications and Remote Control Module
export class TelegramNotificationEngine {
  constructor(private botToken?: string, private chatId?: string) {}

  async sendOutboundNotification(text: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      console.log(`[Telegram Broadcast Mock] Message:\n${text}`);
      return false;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: text,
          parse_mode: 'HTML'
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async sendTradeExecutionAlert(trade: {
    symbol: string;
    side: 'BUY' | 'SELL';
    price: number;
    amountUsd: number;
    pnlUsd?: number;
    pnlPercent?: number;
    txHash?: string;
  }): Promise<boolean> {
    const isBuy = trade.side === 'BUY';
    const flag = isBuy ? '🟢' : '🔴';
    const actionStr = isBuy ? 'COMPRA EJECUTADA' : 'VENTA EJECUTADA';
    
    let text = `${flag} <b>BATTLE TRADE — ${actionStr}</b>\n\n`;
    text += `🪙 <b>Activo:</b> ${trade.symbol}\n`;
    text += `💰 <b>Precio:</b> $${trade.price.toFixed(6)} USD\n`;
    text += `💵 <b>Tamaño:</b> $${trade.amountUsd.toFixed(2)} USD\n`;

    if (!isBuy && trade.pnlPercent !== undefined && trade.pnlUsd !== undefined) {
      const pnlFlag = trade.pnlUsd >= 0 ? '📈' : '📉';
      text += `${pnlFlag} <b>Rendimiento:</b> ${trade.pnlPercent.toFixed(2)}% ($${trade.pnlUsd.toFixed(2)} USD)\n`;
    }

    if (trade.txHash) {
      text += `🔗 <b>Tx Hash:</b> <code>${trade.txHash}</code>\n`;
    }

    text += `\n⏰ <b>Timestamp:</b> <i>${new Date().toUTCString()}</i>`;

    return await this.sendOutboundNotification(text);
  }
}
