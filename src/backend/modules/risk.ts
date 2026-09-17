/**
 * Risk Management, Portfolio, Execution Simulator, and Order Lifecycle.
 * Implements rigid risk boundaries (Hard Caps), anti-tilt, multi-account scaling,
 * execution slippage/latency simulation, and full position lifecycle management.
 */

import { ChainId, ActivePosition, HistoricalTrade, SystemConfig, MultiLayerDecision, MarketData } from '../../shared/types';
import { BattleTradeDB } from './database';

export class RiskEngine {
  constructor(private db: BattleTradeDB) {}

  // Validates hard caps: daily exposure limit and trade sizes
  validateHardCaps(config: SystemConfig, pendingTradeSizeUsd: number): { passed: boolean; reason?: string } {
    const isSim = config.simulationMode;
    const balanceId = isSim ? 'SIM_USD' : 'LIVE_USD';
    const balance = this.db.getBalance(balanceId);

    // Hard Limit on Live trading for absolute safety (LIVE physically locked until explicit confirmation)
    if (!isSim) {
      return { passed: false, reason: 'Live trading is locked. Only Paper/Simulation mode is allowed.' };
    }

    const activePositions = this.db.getPositions({ is_simulation: isSim ? 1 : 0 });
    const currentExposure = activePositions.reduce((sum, pos) => sum + pos.size_usd, 0);

    if (currentExposure + pendingTradeSizeUsd > config.maxDailyExposureUsd) {
      return {
        passed: false,
        reason: `Daily exposure cap reached ($${currentExposure.toFixed(2)} + $${pendingTradeSizeUsd.toFixed(2)} > Max $${config.maxDailyExposureUsd.toFixed(2)})`
      };
    }

    if (pendingTradeSizeUsd > config.maxTradeSizeUsd) {
      return {
        passed: false,
        reason: `Trade size $${pendingTradeSizeUsd.toFixed(2)} exceeds Max configured $${config.maxTradeSizeUsd.toFixed(2)}`
      };
    }

    // Verify sufficient funds
    if (balance.amount < pendingTradeSizeUsd) {
      return {
        passed: false,
        reason: `Insufficient balance ($${balance.amount.toFixed(2)} available, $${pendingTradeSizeUsd.toFixed(2)} requested)`
      };
    }

    return { passed: true };
  }

  // Calculate dynamic position size based on current capital, setup conviction, and streak metrics
  calculateDynamicSize(
    capital: number,
    decision: MultiLayerDecision,
    streak: number,
    config: SystemConfig
  ): number {
    let riskPercent = config.minRiskPercentPerTrade; // e.g. 1.5%

    // Setup conviction scaling
    if (decision.conviction === 'VERY_HIGH') riskPercent = config.maxRiskPercentPerTrade; // e.g. 5.0%
    else if (decision.conviction === 'HIGH') riskPercent = (config.maxRiskPercentPerTrade + config.minRiskPercentPerTrade) / 2;
    else if (decision.conviction === 'MEDIUM') riskPercent = config.minRiskPercentPerTrade * 1.5;

    // Apply streak multiplier
    let streakMultiplier = 1.0;
    if (streak >= 3) {
      streakMultiplier = 1.35; // Compounding positive momentum
    } else if (streak <= -2) {
      streakMultiplier = 0.5; // Defensive anti-tilt reduction
    }

    riskPercent = Math.min(config.maxRiskPercentPerTrade, Math.max(config.minRiskPercentPerTrade, riskPercent * streakMultiplier));
    const calculatedSize = capital * (riskPercent / 100);

    // Limit position size to configured bounds
    return Math.min(config.maxTradeSizeUsd, Math.max(5.0, calculatedSize));
  }
}

// Portfolio Engine: Tracks positions, partial principal recovery, and historical trades
export class PortfolioEngine {
  constructor(private db: BattleTradeDB) {}

  // Process a newly filled autonomous buy order
  openPosition(
    token: MarketData,
    decision: MultiLayerDecision,
    sizeUsd: number,
    tokensAmount: number,
    buyPriceUsd: number,
    isSimulation: boolean
  ): ActivePosition {
    const balanceId = isSimulation ? 'SIM_USD' : 'LIVE_USD';
    const balance = this.db.getBalance(balanceId);

    // Deduct cash from balance
    this.db.updateBalance(balanceId, balance.amount - sizeUsd, balance.allocated_to_trades + sizeUsd);

    const position: ActivePosition = {
      id: `pos_${Date.now()}_${token.address.slice(2, 6)}`,
      tokenAddress: token.address,
      chainId: token.chainId,
      name: token.name,
      symbol: token.symbol,
      buyPriceUsd,
      currentPriceUsd: buyPriceUsd,
      sizeUsd,
      amountTokens: tokensAmount,
      buyTimestamp: Date.now(),
      lastUpdateTimestamp: Date.now(),
      highestPriceUsd: buyPriceUsd,
      isPrincipalRecovered: false,
      targetTakeProfitPercent: decision.targetTakeProfitPercent,
      stopLossPercent: decision.stopLossPercent,
      trailingStopPercent: decision.trailingStopPercent,
      isSimulation,
      pnlUsd: 0,
      pnlPercent: 0,
      regimeAtEntry: decision.layer3Macro.macroClimate === 'RISK_ON' ? 'RISK_ON' : 'RISK_OFF',
      setupPattern: decision.layer4Learning.patternType,
      scoresAtEntry: {
        secScore: decision.layer1Security.score,
        momScore: decision.layer2Momentum.score,
        macroScore: decision.layer3Macro.score,
        patternScore: decision.layer4Learning.score
      }
    };

    // Save to database
    this.db.savePosition({
      id: position.id,
      token_address: position.tokenAddress,
      chain_id: position.chainId,
      name: position.name,
      symbol: position.symbol,
      buy_price_usd: position.buyPriceUsd,
      current_price_usd: position.currentPriceUsd,
      size_usd: position.sizeUsd,
      amount_tokens: position.amountTokens,
      buy_timestamp: position.buyTimestamp,
      last_update_timestamp: position.lastUpdateTimestamp,
      highest_price_usd: position.highestPriceUsd,
      is_principal_recovered: 0,
      target_take_profit_percent: position.targetTakeProfitPercent,
      stop_loss_percent: position.stopLossPercent,
      trailing_stop_percent: position.trailingStopPercent,
      is_simulation: position.isSimulation ? 1 : 0,
      pnl_usd: position.pnlUsd,
      pnl_percent: position.pnlPercent,
      regime_at_entry: position.regimeAtEntry || 'CHOPPY',
      setup_pattern: position.setupPattern || 'VELOCITY_BREAKOUT'
    });

    this.db.addAuditEvent('SYSTEM_EXECUTOR', 'OPEN_POSITION', undefined, `Posición abierta para ${token.symbol} a $${buyPriceUsd}`);

    return position;
  }

  // Monitor and handle exit rules, trailing stops, and principal recovery (50% on 2x)
  updateAndCheckExit(
    position: ActivePosition,
    latestPriceUsd: number
  ): { exit: boolean; reason?: HistoricalTrade['exitReason']; principalRecovered: boolean } {
    let exit = false;
    let reason: HistoricalTrade['exitReason'] | undefined = undefined;
    let principalRecovered = position.isPrincipalRecovered;

    const pnlPercent = ((latestPriceUsd - position.buyPriceUsd) / position.buyPriceUsd) * 100;
    const highestPriceUsd = Math.max(position.highestPriceUsd, latestPriceUsd);
    const dropFromPeakPercent = ((highestPriceUsd - latestPriceUsd) / highestPriceUsd) * 100;

    // Rule A: Principal Recovery (Sell 50% on 2x price increase, i.e., +100% PnL)
    if (pnlPercent >= 100 && !position.isPrincipalRecovered) {
      principalRecovered = true;
      this.db.addAuditEvent('SYSTEM_EXECUTOR', 'PARTIAL_TAKE_PROFIT', undefined, `Recuperado 50% capital en ${position.symbol} por alcanzar +100% de rentabilidad.`);
    }

    // Exit Rule B: Target Take Profit
    if (pnlPercent >= position.targetTakeProfitPercent) {
      exit = true;
      reason = 'TAKE_PROFIT';
    }

    // Exit Rule C: Trailing Stop Loss from Highest Price Peak
    else if (pnlPercent >= 5.0 && dropFromPeakPercent >= position.trailingStopPercent) {
      exit = true;
      reason = 'TRAILING_STOP';
    }

    // Exit Rule D: Hard Stop Loss
    else if (pnlPercent <= -position.stopLossPercent) {
      exit = true;
      reason = 'STOP_LOSS';
    }

    // Save state back to DB
    const dbPos = this.db.getPosition(position.id);
    if (dbPos) {
      this.db.savePosition({
        ...dbPos,
        current_price_usd: latestPriceUsd,
        highest_price_usd: highestPriceUsd,
        is_principal_recovered: principalRecovered ? 1 : 0,
        pnl_usd: (latestPriceUsd - position.buyPriceUsd) * position.amountTokens,
        pnl_percent: pnlPercent,
        last_update_timestamp: Date.now()
      });
    }

    return { exit, reason, principalRecovered };
  }

  // Handle actual closing of a trading position
  closePosition(
    position: ActivePosition,
    sellPriceUsd: number,
    reason: HistoricalTrade['exitReason']
  ): HistoricalTrade {
    const balanceId = position.isSimulation ? 'SIM_USD' : 'LIVE_USD';
    const balance = this.db.getBalance(balanceId);

    // Calculate actual return
    let finalAmountTokens = position.amountTokens;
    let finalSizeUsd = position.sizeUsd;

    if (position.isPrincipalRecovered) {
      // 50% was already sold at +100% price (2 * initial price)
      // Half-tokens sold, return of full principal is already credited.
      finalAmountTokens = position.amountTokens / 2;
      finalSizeUsd = position.sizeUsd / 2;
    }

    const revenue = finalAmountTokens * sellPriceUsd;
    const pnlUsd = revenue - finalSizeUsd;
    const pnlPercent = ((sellPriceUsd - position.buyPriceUsd) / position.buyPriceUsd) * 100;

    // Credit balance
    const returnedCash = position.isPrincipalRecovered ? (revenue + position.sizeUsd) : revenue;
    const newAllocated = Math.max(0, balance.allocated_to_trades - position.sizeUsd);
    this.db.updateBalance(balanceId, balance.amount + returnedCash, newAllocated);

    // Delete active position from db
    this.db.deletePosition(position.id);

    const trade: HistoricalTrade = {
      id: position.id,
      tokenAddress: position.tokenAddress,
      chainId: position.chainId,
      name: position.name,
      symbol: position.symbol,
      buyPriceUsd: position.buyPriceUsd,
      sellPriceUsd,
      sizeUsd: position.sizeUsd,
      buyTimestamp: position.buyTimestamp,
      sellTimestamp: Date.now(),
      pnlUsd,
      pnlPercent,
      exitReason: reason,
      isSimulation: position.isSimulation,
      regimeAtEntry: position.regimeAtEntry,
      setupPattern: position.setupPattern,
      scoresAtEntry: position.scoresAtEntry
    };

    // Record into Audit logs
    this.db.addAuditEvent('SYSTEM_EXECUTOR', 'CLOSE_POSITION', undefined, `Posición cerrada para ${position.symbol} via ${reason} con PnL: $${pnlUsd.toFixed(2)} (${pnlPercent.toFixed(1)}%)`);

    // Save historical trade
    this.db.saveHistoricalTrade(trade);

    return trade;
  }
}
