import assert from 'node:assert';
import { BattleTradeDB } from '../modules/database';
import { OrderEntity, PositionEntity, BalanceLedgerEntity } from '../types/db';
import { AdapterRegistry } from '../modules/adapters';
import { MarketIngestionEngine, TokenDiscoveryEngine, CandidateRankingEngine } from '../modules/market';
import { SecurityEngine } from '../modules/security';
import { ChainId } from '../../shared/types';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateBollingerBands,
  calculateADX,
  calculateStochastic,
  calculateReturns,
  calculateRealizedVolatility,
  calculateVWAP,
  calculateZScore,
  calculatePearsonCorrelation,
  calculatePercentile,
  winsorize,
  FullFeatureEngine,
  FEATURE_SCHEMA_VERSION
} from '../modules/features';
import {
  DeterministicRegimeEngine,
  StrategyEngine,
  MetaEnsembleEngine,
  BacktestStrategyRunner
} from '../modules/strategy';
import {
  MLFeatureExtractor,
  MLModelRunner,
  LightMLEngine,
  MLDatasetStore,
  ChampionChallengerRouter,
  createDefaultLogisticModel,
  createDefaultBoostedTreesModel,
  ML_FEATURE_NAMES,
  ML_HORIZON_PARAMS
} from '../modules/ml';
import { MLHorizon } from '../types/ml';
import {
  PositionSizer,
  CircuitBreakerEngine,
  RiskEngine,
  CAPITAL_MODE_PRESETS
} from '../modules/risk';
import {
  CapitalMode,
  PositionSizingMethod,
  CircuitBreakerState,
  RiskLimitsConfig,
  RiskCheckInput
} from '../types/risk';
import {
  AMMExecutionModel,
  PaperExecutionEngine,
  IntrabarEvaluator,
  AdaptiveTPSLEngine,
  ExitEngine,
  AdvancedPortfolioEngine,
  LiveExecutionAdapter
} from '../modules/execution';
import {
  PaperExecutionOrder,
  IntrabarCandle,
  AdaptiveTPSLParams
} from '../types/execution';
import { AIRouter } from '../modules/ai_router';
import { SmartMoneyEngine } from '../modules/smart_money';
import { UnifiedDecisionPipeline } from '../modules/pipeline';
import { HardeningEngine } from '../modules/hardening';
import { CloudflareOptimizer } from '../modules/cf_optimizer';
import { Demo7DManager } from '../modules/demo_7d';
import { ImmutableDecisionObject, StructuredAutopsy, ComprehensiveSystemMetrics } from '../types/pipeline';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('====================================================');
console.log('🌟 STARTING BATTLE TRADE TRANSACTIONAL TEST SUITE 🌟');
console.log('====================================================\n');

const db = new BattleTradeDB();

// 1. EVENT STORE APPEND-ONLY TESTS
function testEventStore() {
  console.log('🧪 Running Event Store tests...');
  
  const initialEvents = db.getEvents();
  
  const event = db.appendEvent({
    event_type: 'order_event',
    aggregate_type: 'ORDER',
    aggregate_id: 'ord_123',
    sequence: 1,
    payload: JSON.stringify({ price: 2.5, size: 100 }),
    source: 'TEST_RUNNER',
    correlation_id: 'corr_xyz',
    causation_id: 'caus_abc',
    schema_version: 1
  });

  assert.strictEqual(typeof event.event_id, 'string', 'Should generate string event_id');
  assert.strictEqual(event.event_type, 'order_event');
  assert.strictEqual(event.aggregate_id, 'ord_123');
  
  const postEvents = db.getEvents('ord_123');
  assert.strictEqual(postEvents.length, 1, 'Should find 1 event for ord_123');
  assert.strictEqual(postEvents[0].correlation_id, 'corr_xyz');
  
  console.log('✅ Event Store tests passed!');
}

// 2. IDEMPOTENCIA TESTS
function testIdempotency() {
  console.log('🧪 Running Idempotency tests...');
  
  const key = `key_${Date.now()}_${Math.random()}`;
  
  const firstCheck = db.checkAndRegisterIdempotency(key, '{"status":"ok"}');
  assert.strictEqual(firstCheck.duplicate, false, 'First check should not be a duplicate');

  const secondCheck = db.checkAndRegisterIdempotency(key, '{"status":"failed"}');
  assert.strictEqual(secondCheck.duplicate, true, 'Second check should detect duplicate');
  assert.strictEqual(secondCheck.savedPayload, '{"status":"ok"}', 'Should return original payload');

  console.log('✅ Idempotency tests passed!');
}

// 3. ORDER STATE MACHINE TESTS
function testOrderStateMachine() {
  console.log('🧪 Running Order State Machine tests...');

  const orderId = 'ord_sm_test';
  const order: OrderEntity = {
    id: orderId,
    position_id: 'pos_1',
    token_address: '0x123',
    chain_id: 'base' as any,
    side: 'BUY',
    order_type: 'MARKET',
    status: 'CREATED',
    size_usd: 50,
    price_usd: 1.2,
    idempotency_key: 'idem_order_sm',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  db.saveOrder(order);

  // Transition to VALIDATING (allowed)
  db.transitionOrder(orderId, 'VALIDATING');
  const updated = db.selectOne<OrderEntity>('orders', { id: orderId });
  assert.strictEqual(updated?.status, 'VALIDATING');

  // Attempt transition directly to FILLED from VALIDATING (not allowed)
  assert.throws(() => {
    db.transitionOrder(orderId, 'FILLED');
  }, /Invalid order state transition/, 'Should reject invalid transition to FILLED');

  // Transition to APPROVED (allowed)
  db.transitionOrder(orderId, 'APPROVED');
  const updatedApproved = db.selectOne<OrderEntity>('orders', { id: orderId });
  assert.strictEqual(updatedApproved?.status, 'APPROVED');

  console.log('✅ Order State Machine tests passed!');
}

// 4. POSITION STATE MACHINE TESTS
function testPositionStateMachine() {
  console.log('🧪 Running Position State Machine tests...');

  const positionId = 'pos_sm_test';
  const position: PositionEntity = {
    id: positionId,
    token_address: '0x123',
    chain_id: 'base' as any,
    name: 'Test Token',
    symbol: 'TEST',
    buy_price_usd: 1.0,
    current_price_usd: 1.0,
    size_usd: 100,
    amount_tokens: 100,
    buy_timestamp: Date.now(),
    last_update_timestamp: Date.now(),
    highest_price_usd: 1.0,
    is_principal_recovered: 0,
    target_take_profit_percent: 200,
    stop_loss_percent: 10,
    trailing_stop_percent: 5,
    is_simulation: 1,
    pnl_usd: 0,
    pnl_percent: 0,
    regime_at_entry: 'RISK_ON',
    setup_pattern: 'VELOCITY_BREAKOUT',
    status: 'FLAT'
  };

  db.savePosition(position);

  // Transition to OPENING (allowed)
  db.transitionPosition(positionId, 'OPENING');
  const updated = db.getPosition(positionId);
  assert.strictEqual(updated?.status, 'OPENING');

  // Transition directly to CLOSED from OPENING (not allowed)
  assert.throws(() => {
    db.transitionPosition(positionId, 'CLOSED');
  }, /Invalid position state transition/, 'Should reject invalid transition to CLOSED');

  // Transition to OPEN (allowed)
  db.transitionPosition(positionId, 'OPEN');
  const updatedOpen = db.getPosition(positionId);
  assert.strictEqual(updatedOpen?.status, 'OPEN');

  console.log('✅ Position State Machine tests passed!');
}

// 5. ATOMICITY TRANSACTION TESTS
function testAtomicity() {
  console.log('🧪 Running Atomicity transaction tests...');

  const originalBalance = db.getBalance('SIM_USD').amount;

  // Transaction with standard success
  db.runInTransaction(() => {
    db.updateBalance('SIM_USD', 500, 0);
  });
  assert.strictEqual(db.getBalance('SIM_USD').amount, 500, 'Balance should update on success');

  // Transaction with rollback
  assert.throws(() => {
    db.runInTransaction(() => {
      db.updateBalance('SIM_USD', 12345, 0);
      throw new Error('Failing transaction intentionally');
    });
  }, /Failing transaction intentionally/);

  assert.strictEqual(db.getBalance('SIM_USD').amount, 500, 'Balance should roll back to pre-transaction value!');

  // Cleanup/Restore SIM_USD balance
  db.updateBalance('SIM_USD', originalBalance, 0);
  console.log('✅ Atomicity tests passed!');
}

// 6. ASSET LOCKS TESTS
async function testLocks() {
  console.log('🧪 Running Asset Lock tests...');

  const asset = '0xLOCK_TEST';
  
  const lockAcquired = db.acquireLock(asset, 'BUY', 50);
  assert.strictEqual(lockAcquired, true, 'Should acquire lock first time');

  const secondAcquired = db.acquireLock(asset, 'BUY', 50);
  assert.strictEqual(secondAcquired, false, 'Should fail to acquire already locked asset');

  db.releaseLock(asset);
  const thirdAcquired = db.acquireLock(asset, 'BUY', 50);
  assert.strictEqual(thirdAcquired, true, 'Should re-acquire after release');

  // Stale TTL Recovery
  await sleep(60);
  const fourthAcquired = db.acquireLock(asset, 'BUY', 100);
  assert.strictEqual(fourthAcquired, true, 'Should auto-recover lock after TTL expiry');

  db.releaseLock(asset);
  console.log('✅ Asset Lock tests passed!');
}

// 7. BALANCE LEDGER TESTS
function testBalanceLedger() {
  console.log('🧪 Running Balance Ledger tests...');

  const initialBalance = db.getBalance('SIM_USD');

  db.recordLedgerEntry({
    balance_id: 'SIM_USD',
    asset: 'USD',
    entry_type: 'DEPOSIT',
    cash: 5000,
    reserved: 100,
    available: 4900,
    quantity: 0,
    realized_pnl: 0,
    unrealized_pnl: 0,
    fees: 0,
    gas: 0,
    slippage: 0,
    price_impact: 0
  });

  const updatedBalance = db.getBalance('SIM_USD');
  assert.strictEqual(updatedBalance.amount, 5000, 'Balance amount should match ledger entry cash value');
  assert.strictEqual(updatedBalance.allocated_to_trades, 100, 'Balance allocated amount should match ledger entry reserved value');

  const rebuilt = db.rebuildBalanceFromLedger('SIM_USD');
  assert.strictEqual(rebuilt.cash, 5000);
  assert.strictEqual(rebuilt.reserved, 100);

  // Restore
  db.updateBalance('SIM_USD', initialBalance.amount, initialBalance.allocated_to_trades);
  console.log('✅ Balance Ledger tests passed!');
}

// 8. RECONCILIATION TESTS
function testReconciliation() {
  console.log('🧪 Running Reconciliation tests...');

  // Clear any dangling test positions/orders
  db.delete('positions', {});
  db.delete('orders', {});

  const initialStatus = db.getSystemState().current_status;

  // Reconcile is clean on setup
  const cleanRecon = db.reconcileSystemState();
  assert.strictEqual(cleanRecon.success, true);

  // Intentionally corrupt balance mismatching actual active positions
  const simBal = db.getBalance('SIM_USD');
  db.updateBalance('SIM_USD', simBal.amount, 999999); // Impossible reserved amount

  const badRecon = db.reconcileSystemState();
  assert.strictEqual(badRecon.success, false, 'Should fail reconciliation on mismatch');
  assert.strictEqual(db.getSystemState().current_status, 'HALTED', 'Should halt system on failed reconciliation');

  // Restore
  db.updateBalance('SIM_USD', simBal.amount, simBal.allocated_to_trades);
  db.updateSystemState({ current_status: initialStatus });
  console.log('✅ Reconciliation tests passed!');
}

// 9. EVENT BUS TESTS
function testEventBus() {
  console.log('🧪 Running Event Bus tests...');

  let callbackCalled = false;
  let receivedPayload: any = null;

  const unsubscribe = db.subscribe('order_event', (evt) => {
    callbackCalled = true;
    receivedPayload = evt;
  });

  db.appendEvent({
    event_type: 'order_event',
    aggregate_type: 'ORDER',
    aggregate_id: 'ord_event_bus',
    sequence: Date.now(),
    payload: '{"test":true}',
    source: 'EVENT_BUS_TEST',
    correlation_id: 'corr_bus',
    causation_id: 'caus_bus',
    schema_version: 1
  });

  assert.strictEqual(callbackCalled, true, 'Event Bus listener should be triggered');
  assert.strictEqual(JSON.parse(receivedPayload.payload).test, true, 'Should receive correct event payload');

  unsubscribe();
  console.log('✅ Event Bus tests passed!');
}

// 10. DATA RETENTION TESTS
function testDataRetention() {
  console.log('🧪 Running Data Retention tests...');

  // Seed sample candle
  db.insert('candles', {
    id: 'candle_old',
    asset_address: '0x123',
    chain_id: 'base',
    interval_min: 1,
    timestamp: 10, // ancient
    open: 1, high: 1, low: 1, close: 1, volume: 1
  });

  db.insert('candles', {
    id: 'candle_fresh',
    asset_address: '0x123',
    chain_id: 'base',
    interval_min: 1,
    timestamp: Math.floor(Date.now() / 1000) - 10, // fresh
    open: 1, high: 1, low: 1, close: 1, volume: 1
  });

  const pruned = db.pruneHighFrequencyData(60000); // anything older than 1 minute
  assert.strictEqual(pruned, 1, 'Should prune exactly the old candle');

  const candlesLeft = db.select<any>('candles');
  assert.ok(candlesLeft.some(c => c.id === 'candle_fresh'));
  assert.ok(!candlesLeft.some(c => c.id === 'candle_old'));

  console.log('✅ Data Retention tests passed!');
}

// 11. WATCHDOG TESTS
function testWatchdog() {
  console.log('🧪 Running Watchdog tests...');

  db.touchWatchdogComponent('DB');
  db.touchWatchdogComponent('execution');

  const freshness = db.getWatchdogFreshness(60000);
  assert.ok(freshness.some(f => f.component === 'DB' && f.is_fresh === 1));
  assert.ok(freshness.some(f => f.component === 'execution' && f.is_fresh === 1));

  console.log('✅ Watchdog tests passed!');
}

// 12. RECOVERY TESTS
function testRecovery() {
  console.log('🧪 Running System Recovery tests...');

  // Seed standard status
  db.updateSystemState({ current_status: 'RUNNING' });

  // Seed a pending order
  const order: OrderEntity = {
    id: 'ord_recovery_test',
    position_id: 'pos_rec',
    token_address: '0xabc',
    chain_id: 'simulation' as any,
    side: 'BUY',
    order_type: 'MARKET',
    status: 'SUBMITTED',
    size_usd: 10,
    price_usd: 1,
    idempotency_key: 'idem_rec',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.saveOrder(order);

  // Acquire a lock
  db.acquireLock('0xabc', 'BUY', 50000);

  // Run recovery cycle
  const recoveryResult = db.performRecoveryCycle();
  assert.strictEqual(recoveryResult.success, true);
  assert.ok(recoveryResult.canceledOrdersCount >= 1);

  // Check order updated to FAILED
  const updatedOrder = db.selectOne<OrderEntity>('orders', { id: 'ord_recovery_test' });
  assert.strictEqual(updatedOrder?.status, 'FAILED');

  // Check lock is released
  const locks = db.select<any>('asset_locks');
  assert.strictEqual(locks.length, 0, 'Locks must be cleared after recovery');

  console.log('✅ System Recovery tests passed!');
}

async function testMarketAndAdapters() {
  console.log('🧪 Running Market Data and Adapters tests...');

  const registry = new AdapterRegistry();
  const baseAdapter = registry.getChainAdapter('base');
  const bscAdapter = registry.getChainAdapter('bsc');
  
  assert.strictEqual(baseAdapter.getChainId(), 'base');
  assert.strictEqual(bscAdapter.getChainId(), 'bsc');

  const provider = registry.getMarketDataProvider();
  assert.ok(provider.getProviderName() === 'DexScreener' || provider.getProviderName() === 'GeckoTerminal');

  const ingestion = new MarketIngestionEngine();
  const macro = await ingestion.fetchMacroContext();
  assert.ok(macro.btcPriceUsd > 0);
  assert.ok(macro.fearAndGreedIndex > 0);

  const discoverer = new TokenDiscoveryEngine();
  const pairs = await discoverer.discoverPairs();
  assert.ok(pairs.length > 0, 'Should discover at least a few pairs');

  const ranking = CandidateRankingEngine.rankCandidates([], [], new Map(), new Map());
  assert.strictEqual(ranking.length, 0, 'Empty candidate ranking should be empty');

  console.log('✅ Market Data and Adapters tests passed!');
}

async function testSecurityEngine() {
  console.log('🧪 Running Security & Tradability Engine tests...');
  const db = new BattleTradeDB();
  const security = new SecurityEngine(db);

  const testToken = '0x4200000000000000000000000000000000000006'; // WETH on Base
  const report = await security.evaluateTradability(testToken, ChainId.BASE, 100);

  assert.ok(report, 'Security report should be returned');
  assert.strictEqual(typeof report.hardBlocked, 'boolean');
  assert.ok(report.securityScore >= 0 && report.securityScore <= 100, 'securityScore in 0-100');
  assert.ok(report.liquidityScore >= 0 && report.liquidityScore <= 100, 'liquidityScore in 0-100');
  assert.ok(report.tradabilityScore >= 0 && report.tradabilityScore <= 100, 'tradabilityScore in 0-100');
  assert.ok(report.concentrationScore >= 0 && report.concentrationScore <= 100, 'concentrationScore in 0-100');
  assert.ok(report.executionScore >= 0 && report.executionScore <= 100, 'executionScore in 0-100');
  assert.ok(report.contractAnalysis);
  assert.ok(report.sellability);
  assert.ok(report.liquidity);

  // Test Mandatory Recheck Before Entry
  const recheckEntry = await security.recheckBeforeEntry(testToken, ChainId.BASE, 100);
  assert.ok(recheckEntry.report, 'Recheck before entry report should be present');

  // Test Mandatory Recheck Before Position Increase
  const recheckIncrease = await security.recheckBeforePositionIncrease(testToken, ChainId.BASE, 50, 100);
  assert.ok(recheckIncrease.report, 'Recheck position increase report should be present');

  // Test Liquidity Shock Recheck
  const recheckShock = await security.recheckOnLiquidityEvent(testToken, ChainId.BASE, 2000, 100);
  assert.strictEqual(recheckShock.passed, false, 'Liquidity drop < $5000 must trigger a hard block');
  assert.ok(recheckShock.reason?.includes('Liquidity shock'), 'Shock reason must be reported');

  // Test Conversion to TokenSecurityReport
  const tokenSecReport = security.toTokenSecurityReport(report);
  assert.strictEqual(typeof tokenSecReport.isHoneypot, 'boolean');
  assert.strictEqual(typeof tokenSecReport.goplusScore, 'number');

  console.log('✅ Security & Tradability Engine tests passed!');
}

function testFeatureEngineMath() {
  console.log('🧪 Running Feature Engine Mathematical tests...');

  // 1. SMA & EMA tests
  const prices = [10, 11, 12, 13, 14, 15];
  const sma3 = calculateSMA(prices, 3);
  assert.strictEqual(sma3.length, 6);
  assert.strictEqual(Number(sma3[sma3.length - 1].toFixed(2)), 14.0); // (13+14+15)/3 = 14

  const ema3 = calculateEMA(prices, 3);
  assert.strictEqual(ema3.length, 6);
  assert.ok(ema3[ema3.length - 1] > 13.5, 'EMA should weight recent prices higher');

  // 2. RSI test (All-gains vs All-losses vs oscillating)
  const rsiClosesUp = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38];
  const rsiValUp = calculateRSI(rsiClosesUp, 14);
  assert.strictEqual(rsiValUp, 100, 'Consistently rising series should yield RSI 100');

  const rsiClosesDown = [38, 36, 34, 32, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10];
  const rsiValDown = calculateRSI(rsiClosesDown, 14);
  assert.strictEqual(rsiValDown, 0, 'Consistently falling series should yield RSI 0');

  // 3. MACD test
  const macdSeries = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36];
  const macdResult = calculateMACD(macdSeries, 12, 26, 9);
  assert.ok(macdResult.macd > 0, 'Uptrend should yield positive MACD line');
  assert.strictEqual(typeof macdResult.signal, 'number');
  assert.strictEqual(typeof macdResult.histogram, 'number');

  // 4. ATR test
  const highs = [10, 11, 12, 13, 14];
  const lows = [8, 9, 10, 11, 12];
  const closes = [9, 10, 11, 12, 13];
  const atr = calculateATR(highs, lows, closes, 3);
  assert.ok(atr > 0, 'ATR must be positive');

  // 5. Bollinger Bands test
  const bbCloses = [10, 10.5, 10.2, 10.8, 11.0, 10.4, 10.6, 10.9, 11.2, 11.5, 11.1, 10.8, 11.0, 11.4, 11.3, 11.6, 11.8, 12.0, 11.7, 12.2];
  const bb = calculateBollingerBands(bbCloses, 20, 2);
  assert.ok(bb.upper > bb.middle && bb.middle > bb.lower, 'Upper > Middle > Lower');
  assert.ok(bb.bandwidth > 0, 'Bandwidth must be positive');
  assert.ok(bb.percentB >= 0 && bb.percentB <= 1.5, '%B should be within realistic envelope');

  // 6. ADX & Stochastic test
  const adxHighs = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
  const adxLows = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const adxCloses = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
  const adx = calculateADX(adxHighs, adxLows, adxCloses, 14);
  assert.ok(adx >= 0 && adx <= 100, 'ADX must be between 0 and 100');

  const stoch = calculateStochastic(adxHighs, adxLows, adxCloses, 14, 3);
  assert.ok(stoch.k >= 0 && stoch.k <= 100, 'Stochastic %K must be between 0 and 100');

  // 7. Returns & Volatility test
  const rets = calculateReturns([100, 110]);
  assert.strictEqual(Number(rets.simple.toFixed(2)), 0.10);
  assert.strictEqual(Number(rets.log.toFixed(4)), Number(Math.log(1.1).toFixed(4)));

  const vol = calculateRealizedVolatility([10, 10.5, 10.2, 10.8, 10.4], 5);
  assert.ok(vol > 0, 'Realized volatility must be positive for fluctuating prices');

  // 8. VWAP test
  const candles = [
    { high: 105, low: 95, close: 100, volume: 1000 },
    { high: 115, low: 105, close: 110, volume: 2000 }
  ];
  const vwap = calculateVWAP(candles);
  assert.ok(vwap > 100 && vwap < 112, 'VWAP should sit between weighted prices');

  // 9. Z-Score, Pearson Correlation, Percentile & Winsorize tests
  const history = [10, 10, 10, 10, 10, 20];
  const zScore = calculateZScore(20, history);
  assert.ok(zScore > 1.5, 'Value far above mean should yield positive z-score');

  const corrPerfect = calculatePearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
  assert.strictEqual(Number(corrPerfect.toFixed(2)), 1.0, 'Perfect positive correlation should be 1.0');

  const corrInverse = calculatePearsonCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
  assert.strictEqual(Number(corrInverse.toFixed(2)), -1.0, 'Perfect negative correlation should be -1.0');

  const pct = calculatePercentile(15, [10, 12, 14, 16, 18, 20]);
  assert.strictEqual(pct, 50, 'Median value should sit at 50th percentile');

  const win = winsorize(150, -100, 100);
  assert.strictEqual(win, 100, 'Winsorize should clamp extremes');

  // 10. Full Feature Vector test (No Data Leakage & Missing Data check)
  const engine = new FullFeatureEngine();
  const testCandles = [
    { source: 'test', timestamp: 1000, chain: 'base', confidence: 1, freshness: 1, tokenAddress: '0x123', intervalMin: 1, open: 1, high: 1.1, low: 0.9, close: 1.0, volume: 100 },
    { source: 'test', timestamp: 2000, chain: 'base', confidence: 1, freshness: 1, tokenAddress: '0x123', intervalMin: 1, open: 1.0, high: 1.2, low: 0.95, close: 1.1, volume: 150 }
  ];
  const vector = engine.generateFeatureVector(
    '0x123',
    'base',
    '1m',
    testCandles,
    [
      {
        source: 'test',
        timestamp: 1500,
        chain: 'base',
        confidence: 1,
        freshness: 1,
        txHash: '0xabc',
        sender: '0xwallet1',
        tokenInAddress: '0xeth',
        tokenOutAddress: '0x123',
        amountIn: '1000',
        amountOut: '1000',
        amountInUsd: 1200,
        amountOutUsd: 1200
      }
    ],
    { source: 'test', timestamp: 2000, chain: 'base', confidence: 1, freshness: 1, tokenAddress: '0x123', priceUsd: 1.1, liquidityUsd: 50000, volume24h: 10000, priceChange24h: 10 },
    { btcReturn24h: 1.5, btcVolatility24h: 0.02, ethReturn24h: 1.2, bnbReturn24h: 0.5, solReturn24h: 3.0, dexGlobalVolume24h: 1e9, chainActivityIndex: 85, gasPriceGwei: 0.1, marketBreadthScore: 70 }
  );

  assert.strictEqual(vector.feature_schema_version, FEATURE_SCHEMA_VERSION);
  assert.strictEqual(vector.tokenAddress, '0x123');
  assert.strictEqual(vector.timeframe, '1m');
  assert.ok(vector.missingnessRatio > 0, 'Missingness ratio should be positive for short 2-candle history');
  assert.ok(vector.confidence < 1.0, 'Confidence must be degraded when missing history');
  assert.strictEqual(typeof vector.price.emaDistance50, 'number');
  assert.strictEqual(typeof vector.technical.rsi14, 'number');
  assert.strictEqual(typeof vector.macro.correlationToBtc, 'number');
  assert.strictEqual(typeof vector.microstructure.syntheticOrderBookImbalance, 'number');

  console.log('✅ Feature Engine Mathematical tests passed!');
}

function testStrategyBrainAndRegime() {
  console.log('🧪 Running Strategy Brain & Regime Detection tests...');

  const featureEngine = new FullFeatureEngine();
  const regimeEngine = new DeterministicRegimeEngine();
  const strategyEngine = new StrategyEngine();
  const metaEngine = new MetaEnsembleEngine();
  const backtestRunner = new BacktestStrategyRunner();

  const testCandles = [
    { source: 'test', timestamp: 1000, chain: 'base', confidence: 1, freshness: 1, tokenAddress: '0x123', intervalMin: 1, open: 1, high: 1.1, low: 0.9, close: 1.0, volume: 100 },
    { source: 'test', timestamp: 2000, chain: 'base', confidence: 1, freshness: 1, tokenAddress: '0x123', intervalMin: 1, open: 1.0, high: 1.2, low: 0.95, close: 1.15, volume: 500 }
  ];

  const fv = featureEngine.generateFeatureVector(
    '0x123',
    'base',
    '1m',
    testCandles,
    [],
    { source: 'test', timestamp: 2000, chain: 'base', confidence: 1, freshness: 1, tokenAddress: '0x123', priceUsd: 1.15, liquidityUsd: 50000, volume24h: 10000, priceChange24h: 15 },
    { btcReturn24h: 2.5, btcVolatility24h: 0.02, ethReturn24h: 2.0, bnbReturn24h: 1.0, solReturn24h: 4.0, dexGlobalVolume24h: 1e9, chainActivityIndex: 85, gasPriceGwei: 0.1, marketBreadthScore: 75 }
  );

  // 1. Regime Detection
  const regimeAnalysis = regimeEngine.classifyRegime(fv);
  assert.ok(regimeAnalysis.primaryRegime, 'Regime must be classified');
  assert.ok(regimeAnalysis.confidence > 0, 'Regime confidence must be positive');

  // 2. 8 Individual Strategies Evaluation
  const signals = strategyEngine.evaluateAllStrategies(fv, 1.15);
  assert.strictEqual(signals.length, 8, 'Must evaluate exactly 8 strategies');
  for (const sig of signals) {
    assert.ok(sig.strategyName);
    assert.ok(['LONG', 'SHORT', 'FLAT'].includes(sig.direction));
    assert.ok(sig.score >= 0 && sig.score <= 100);
    assert.ok(['scalp', 'short', 'intraday', 'swing'].includes(sig.expectedHorizon));
  }

  // 3. Meta-Ensemble Synthesis (Standard Mode)
  const metaSignal = metaEngine.synthesizeMetaSignal(
    '0x123',
    'base',
    fv,
    1.15,
    { aggressiveMode: false, minMetaScoreToTrade: 60, maxRiskPerTradePercent: 1.0, minConfidence: 0.5, allowShorts: false, correlationDeductionFactor: 0.5 },
    true
  );
  assert.ok(metaSignal.signal_id);
  assert.strictEqual(typeof metaSignal.isNoTrade, 'boolean');

  // 4. Hard Security Block -> Forced NO TRADE
  const blockedMetaSignal = metaEngine.synthesizeMetaSignal(
    '0x123',
    'base',
    fv,
    1.15,
    { aggressiveMode: true, minMetaScoreToTrade: 50, maxRiskPerTradePercent: 2.0, minConfidence: 0.5, allowShorts: false, correlationDeductionFactor: 0.5 },
    false,
    'Honeypot contract detected'
  );
  assert.strictEqual(blockedMetaSignal.isNoTrade, true, 'Security failure MUST force NO TRADE');
  assert.strictEqual(blockedMetaSignal.direction, 'FLAT');
  assert.ok(blockedMetaSignal.noTradeReason?.includes('Honeypot'));

  // 4b. Regime Detection Diversity Tests
  const fvDataStress = { ...fv, missingnessRatio: 0.5, confidence: 0.3 };
  assert.strictEqual(regimeEngine.classifyRegime(fvDataStress).primaryRegime, 'DATA_STRESS');

  const fvLiqStress = { ...fv, missingnessRatio: 0, confidence: 0.9, freshness: 0.9, liquidity: { ...fv.liquidity, liquidityUsd: 2000, reserveImbalance: 0.5 } };
  assert.strictEqual(regimeEngine.classifyRegime(fvLiqStress).primaryRegime, 'LIQUIDITY_STRESS');

  const fvMemePanic = { ...fv, missingnessRatio: 0, confidence: 0.9, freshness: 0.9, meme: { ...fv.meme, memeFailureRatePercent: 45 }, flow: { ...fv.flow, netFlowUsd: -25000 } };
  assert.strictEqual(regimeEngine.classifyRegime(fvMemePanic).primaryRegime, 'MEME_PANIC');

  const fvMemeEuphoria = { ...fv, missingnessRatio: 0, confidence: 0.9, freshness: 0.9, meme: { ...fv.meme, memeMomentumBreadth: 85 }, volume: { ...fv.volume, buySellRatio: 2.5, volumeZScore: 2.0 }, flow: { ...fv.flow, netFlowUsd: 30000 } };
  assert.strictEqual(regimeEngine.classifyRegime(fvMemeEuphoria).primaryRegime, 'MEME_EUPHORIA');

  const fvPanic = { ...fv, missingnessRatio: 0, confidence: 0.9, freshness: 0.9, macro: { ...fv.macro, btcReturn24h: -8.0 }, price: { ...fv.price, localDrawdown: -0.25 } };
  assert.strictEqual(regimeEngine.classifyRegime(fvPanic).primaryRegime, 'PANIC');

  // 4c. Aggressive Mode Safety Lock Test
  const aggressiveDisarmedSignal = metaEngine.synthesizeMetaSignal(
    '0x123',
    'base',
    fv,
    1.15,
    { aggressiveMode: true, minMetaScoreToTrade: 50, maxRiskPerTradePercent: 2.0, minConfidence: 0.5, allowShorts: false, correlationDeductionFactor: 0.5 },
    true,
    undefined,
    60, // securityScore < 75 -> Must disarm aggressive mode
    80
  );
  assert.strictEqual(aggressiveDisarmedSignal.aggressiveModeActive, false, 'Aggressive mode MUST be disarmed if securityScore < 75');

  // 4d. Cost Model & Net EV Verification
  const fvHealthy = { ...fv, missingnessRatio: 0, confidence: 0.9, freshness: 0.9 };
  const highCostSignal = metaEngine.synthesizeMetaSignal(
    '0x123',
    'base',
    fvHealthy,
    1.15,
    { aggressiveMode: false, minMetaScoreToTrade: 30, maxRiskPerTradePercent: 1.0, minConfidence: 0.3, allowShorts: false, correlationDeductionFactor: 0.5, minEvThreshold: 0.05 },
    true,
    undefined,
    100,
    100,
    { feeBps: 200, slippageBps: 300, priceImpactBps: 500, notionalUsd: 10 } // Massive costs
  );
  assert.strictEqual(highCostSignal.isNoTrade, true, 'Prohibitive execution costs must force NO_TRADE');
  assert.ok(highCostSignal.noTradeReason?.includes('net EV after costs'), `Must state insufficient net EV (got: ${highCostSignal.noTradeReason})`);

  // 5. Backtesting Tick Execution
  const backtestResult = backtestRunner.runBacktestTick(
    {
      timestamp: 2000,
      featureVector: fv,
      securityPassed: true,
      currentPriceUsd: 1.15,
      accountBalanceUsd: 1000,
      activePositionsCount: 0
    },
    { aggressiveMode: false, minMetaScoreToTrade: 60, maxRiskPerTradePercent: 1.0, minConfidence: 0.5, allowShorts: false, correlationDeductionFactor: 0.5 }
  );
  assert.ok(backtestResult, 'Backtest tick should produce valid meta signal');

  console.log('✅ Strategy Brain & Regime Detection tests passed!');
}

function testLightMLEngine() {
  console.log('🧪 Running Light ML Engine & Expected Value tests...');

  const featureEngine = new FullFeatureEngine();
  const mlEngine = new LightMLEngine();
  const datasetStore = new MLDatasetStore(100); // 100 sample capacity for test
  const ccRouter = new ChampionChallengerRouter(mlEngine, datasetStore);

  const testCandles = [
    { source: 'test', timestamp: 1000, chain: 'base', confidence: 1, freshness: 1, tokenAddress: '0x123', intervalMin: 1, open: 1, high: 1.1, low: 0.9, close: 1.0, volume: 100 },
    { source: 'test', timestamp: 2000, chain: 'base', confidence: 1, freshness: 1, tokenAddress: '0x123', intervalMin: 1, open: 1.0, high: 1.2, low: 0.95, close: 1.15, volume: 500 }
  ];

  const fv = featureEngine.generateFeatureVector(
    '0x123',
    'base',
    '1m',
    testCandles,
    [],
    { source: 'test', timestamp: 2000, chain: 'base', confidence: 1, freshness: 1, tokenAddress: '0x123', priceUsd: 1.15, liquidityUsd: 50000, volume24h: 10000, priceChange24h: 15 },
    { btcReturn24h: 2.5, btcVolatility24h: 0.02, ethReturn24h: 2.0, bnbReturn24h: 1.0, solReturn24h: 4.0, dexGlobalVolume24h: 1e9, chainActivityIndex: 85, gasPriceGwei: 0.1, marketBreadthScore: 75 }
  );

  const healthyFv = { ...fv, missingnessRatio: 0, confidence: 0.95, freshness: 0.95 };

  // 1. Feature Extraction (34 numeric features, zero NaN/Inf)
  const features = MLFeatureExtractor.extractFeatureArray({
    featureVector: healthyFv,
    regime: 'TREND_UP',
    securityScore: 92,
    liquidityScore: 85
  });

  assert.strictEqual(features.length, ML_FEATURE_NAMES.length, `Features length must be exactly ${ML_FEATURE_NAMES.length}`);
  for (let i = 0; i < features.length; i++) {
    assert.strictEqual(typeof features[i], 'number');
    assert.ok(!Number.isNaN(features[i]), `Feature ${ML_FEATURE_NAMES[i]} must not be NaN`);
    assert.ok(Number.isFinite(features[i]), `Feature ${ML_FEATURE_NAMES[i]} must be finite`);
  }

  // 2. Logistic Regression Baseline & Platt Scaling
  const logModel = createDefaultLogisticModel('15m');
  const rawLogProb = MLModelRunner.predictLogisticRegression(features, logModel);
  assert.ok(rawLogProb >= 0.0 && rawLogProb <= 1.0, 'Raw logistic probability must be in [0, 1]');

  const calLogProb = MLModelRunner.calibrateProbability(rawLogProb, logModel.calibration);
  assert.ok(calLogProb >= 0.0 && calLogProb <= 1.0, 'Calibrated probability must be in [0, 1]');

  // 3. Boosted Trees Portable Model
  const treeModel = createDefaultBoostedTreesModel('15m');
  const rawTreeProb = MLModelRunner.predictBoostedTrees(features, treeModel);
  assert.ok(rawTreeProb >= 0.0 && rawTreeProb <= 1.0, 'Raw boosted tree probability must be in [0, 1]');

  // 4. Multi-Target Predictions Across 4 Horizons (5m, 15m, 30m, 1h)
  const horizons: MLHorizon[] = ['5m', '15m', '30m', '1h'];
  for (const h of horizons) {
    const res = mlEngine.predict(
      {
        featureVector: healthyFv,
        regime: 'TREND_UP',
        securityScore: 90,
        liquidityScore: 80
      },
      h
    );

    assert.strictEqual(res.horizon, h);
    assert.ok(res.p_tp_before_sl >= 0.0 && res.p_tp_before_sl <= 1.0, 'P(TP before SL) must be in [0, 1]');
    assert.strictEqual(typeof res.expected_return_percent, 'number');
    assert.ok(res.expected_adverse_excursion_percent <= 0, 'MAE must be non-positive');
    assert.ok(res.prob_significant_loss >= 0.0 && res.prob_significant_loss <= 1.0, 'P(sig loss) in [0, 1]');

    // Separated audit fields
    assert.ok(typeof res.model_probability === 'number', 'Must separate model_probability');
    assert.ok(typeof res.calibrated_probability === 'number', 'Must separate calibrated_probability');
    assert.ok(typeof res.data_quality === 'number', 'Must separate data_quality');
    assert.ok(res.model_version.length > 0, 'Must include model_version');
    assert.ok(res.feature_version.length > 0, 'Must include feature_version');

    // Expected Value & Cost breakdown
    const ev = res.expected_value;
    assert.ok(ev.costs.fees_percent >= 0, 'Fees must be non-negative');
    assert.ok(ev.costs.slippage_percent >= 0, 'Slippage must be non-negative');
    assert.ok(ev.costs.gas_percent >= 0, 'Gas must be non-negative');
    assert.ok(ev.costs.price_impact_percent >= 0, 'Price impact must be non-negative');
    assert.ok(ev.costs.latency_cost_percent >= 0, 'Latency cost must be non-negative');

    // Formula verification: Net EV = Gross EV - Total Costs
    const expectedNetEv = Number((ev.gross_ev_percent - ev.costs.total_cost_percent).toFixed(3));
    assert.strictEqual(ev.net_ev_percent, expectedNetEv, 'Net EV must equal Gross EV minus Total Costs');

    // EV/R verification: EV/R = Net EV / Loss
    const expectedEvOverRisk = Number((ev.net_ev_percent / ev.loss_percent).toFixed(3));
    assert.strictEqual(ev.ev_over_risk, expectedEvOverRisk, 'EV/R must match net_ev / loss');
  }

  // 5. Cost Sensitivity & NO_TRADE when costs destroy edge
  const highImpactResult = mlEngine.predict(
    {
      featureVector: healthyFv,
      regime: 'TREND_UP',
      securityScore: 90,
      liquidityScore: 80
    },
    '5m',
    { feeBps: 150, slippageBps: 200, priceImpactBps: 400, latencyMs: 800 } // Huge costs
  );
  assert.strictEqual(highImpactResult.recommended_action, 'NO_TRADE', 'Destructive costs must force NO_TRADE');
  assert.strictEqual(highImpactResult.expected_value.is_positive_ev, false, 'Must flag non-positive net EV');
  assert.ok(highImpactResult.action_reason.includes('net EV after costs') || highImpactResult.action_reason.includes('Insufficient edge'));

  // 6. Security & Significant Loss Hard Gating
  const insecureResult = mlEngine.predict(
    {
      featureVector: healthyFv,
      regime: 'TREND_UP',
      securityScore: 40, // Low security
      liquidityScore: 50
    },
    '15m'
  );
  assert.strictEqual(insecureResult.recommended_action, 'NO_TRADE', 'Low security score must force NO_TRADE');
  assert.ok(insecureResult.action_reason.includes('security score') || insecureResult.action_reason.includes('significant loss'));

  // 7. Dataset Accumulation & Outcome Resolution
  const sampleId = datasetStore.recordSample('0x123', 'base', '15m', {
    featureVector: healthyFv,
    regime: 'TREND_UP',
    securityScore: 90,
    liquidityScore: 80
  });
  assert.strictEqual(typeof sampleId, 'string');
  assert.strictEqual(datasetStore.getSampleCount(), 1);

  const resolved = datasetStore.resolveOutcome(sampleId, {
    resolved_timestamp: Date.now() + 900000,
    hit_tp: true,
    hit_sl: false,
    realized_return_percent: 5.2,
    realized_mae_percent: -1.2,
    significant_loss_occurred: false
  });
  assert.strictEqual(resolved, true);
  assert.strictEqual(datasetStore.getResolvedSamples().length, 1);

  // 8. Champion / Challenger Evaluation & Rollback Simulation
  // Populate 15 resolved test samples (some wins, some losses)
  for (let i = 0; i < 15; i++) {
    const sid = datasetStore.recordSample('0x123', 'base', '15m', {
      featureVector: healthyFv,
      regime: 'TREND_UP',
      securityScore: 90,
      liquidityScore: 80
    });
    datasetStore.resolveOutcome(sid, {
      resolved_timestamp: Date.now() + i * 1000,
      hit_tp: i % 2 === 0,
      hit_sl: i % 2 !== 0,
      realized_return_percent: i % 2 === 0 ? 5.0 : -2.5,
      realized_mae_percent: -1.5,
      significant_loss_occurred: false
    });
  }

  const evalStatus = ccRouter.evaluateModels('15m');
  assert.strictEqual(evalStatus.total_eval_samples, 16);
  assert.ok(evalStatus.champion_brier_score > 0, 'Champion Brier score must be calculated');
  assert.ok(evalStatus.challenger_brier_score > 0, 'Challenger Brier score must be calculated');

  console.log('✅ Light ML Engine & Expected Value tests passed!');
}

function testRiskEngine() {
  console.log('🧪 Running Risk Engine & Position Sizing tests...');

  // 1. MATHEMATICAL POSITION SIZING TESTS
  const config1000 = CAPITAL_MODE_PRESETS['1000']; // $1,000 equity, max trade $150, max cap 15%
  const equity = 1000;

  // A. Fixed Fractional
  // 10% of $1,000 = $100 -> below max $150 -> $100
  const fixedSize = PositionSizer.calculateFixedFractional(equity, 0.10, config1000);
  assert.strictEqual(fixedSize, 100);

  // 25% of $1,000 = $250 -> capped to maxTradeSizeUsd ($150)
  const fixedCapped = PositionSizer.calculateFixedFractional(equity, 0.25, config1000);
  assert.strictEqual(fixedCapped, 150);

  // B. Volatility-Adjusted
  // size = (equity * targetRisk) / vol
  // equity = 1000, targetRisk = 1.0% ($10 risk), realizedVol = 0.10 (10%) -> $10 / 0.10 = $100
  const volAdjustedSize = PositionSizer.calculateVolatilityAdjusted(equity, 0.10, 1.0, config1000);
  assert.strictEqual(volAdjustedSize, 100);

  // When volatility is very low (e.g. 0.01), size = $10 / 0.01 = $1,000 -> must cap at 15% ($150)
  const volLowCapped = PositionSizer.calculateVolatilityAdjusted(equity, 0.01, 1.0, config1000);
  assert.strictEqual(volLowCapped, 150);

  // C. Risk-Per-Trade
  // size = (equity * riskPercent) / (stopLossPercent / 100)
  // equity = 1000, riskPercent = 1.0% ($10 risk), stopLoss = 10% (0.10) -> size = $100
  const rptSize = PositionSizer.calculateRiskPerTrade(equity, 1.0, 10.0, config1000);
  assert.strictEqual(rptSize, 100);

  // stopLoss = 2.0% (0.02) -> raw size = $10 / 0.02 = $500 -> must cap at $150
  const rptCapped = PositionSizer.calculateRiskPerTrade(equity, 1.0, 2.0, config1000);
  assert.strictEqual(rptCapped, 150);

  // D. Fractional Kelly (with safety cap)
  // p = 0.60, reward = 5.0%, risk = 2.5% -> b = 5.0 / 2.5 = 2.0
  // full Kelly: f* = (p*b - q)/b = (0.60 * 2 - 0.40) / 2 = 0.80 / 2 = 0.40 (40%)
  // Quarter-Kelly (k = 0.25): f_frac = 0.40 * 0.25 = 0.10 (10%)
  // On $1,000 equity: size = $1,000 * 0.10 = $100
  const kellyPositive = PositionSizer.calculateFractionalKelly(equity, 0.60, 5.0, 2.5, config1000);
  assert.strictEqual(kellyPositive.fullKellyFraction, 0.4);
  assert.strictEqual(kellyPositive.fractionalKellyFraction, 0.1);
  assert.strictEqual(kellyPositive.sizeUsd, 100);

  // Negative Expectancy Kelly: p = 0.30, b = 1.0 -> f* = (0.3*1 - 0.7)/1 = -0.4 < 0 -> size = 0
  const kellyNegative = PositionSizer.calculateFractionalKelly(equity, 0.30, 2.5, 2.5, config1000);
  assert.strictEqual(kellyNegative.sizeUsd, 0);
  assert.strictEqual(kellyNegative.fractionalKellyFraction, 0);

  // 2. CAPITAL MODES CONFIGURATION TESTS ($5 to $10,000)
  const modes: CapitalMode[] = ['5', '10', '50', '100', '500', '1000', '10000'];
  for (const m of modes) {
    const cfg = CAPITAL_MODE_PRESETS[m];
    assert.ok(cfg, `Capital mode preset ${m} must exist`);
    assert.strictEqual(cfg.mode, m);
    assert.ok(cfg.startingCapitalUsd > 0);
    assert.ok(cfg.maxTradeSizeUsd > 0);
    assert.ok(cfg.minTradeSizeUsd > 0);
    assert.ok(cfg.maxTradeSizeUsd >= cfg.minTradeSizeUsd);
    assert.ok(cfg.maxDailyLossPercent > 0 && cfg.maxDailyLossPercent <= 30);
    assert.ok(cfg.maxPortfolioDrawdownPercent > 0 && cfg.maxPortfolioDrawdownPercent <= 30);
    assert.ok(cfg.minLiquidityUsd > 0);
    assert.ok(cfg.kellyFraction > 0 && cfg.kellyFraction <= 0.5);
  }

  // 3. CIRCUIT BREAKER ENGINE TESTS
  const baseLimits: RiskLimitsConfig = {
    capitalMode: '1000',
    portfolioEquityUsd: 1000,
    cashBalanceUsd: 800,
    highWaterMarkUsd: 1000,
    realizedPnl24hUsd: 0,
    consecutiveLossStreak: 0,
    maxLossStreakLimit: 3,
    cooldownMinutesAfterLossStreak: 30,
    activePositions: []
  };

  // State: NORMAL
  const cbNormal = CircuitBreakerEngine.evaluateBreakers(baseLimits, config1000);
  assert.strictEqual(cbNormal.state, 'NORMAL');
  assert.strictEqual(cbNormal.sizingMultiplier, 1.0);
  assert.strictEqual(cbNormal.canOpenNewPositions, true);
  assert.strictEqual(cbNormal.emergencyExitOnly, false);

  // State: CAUTION (e.g. daily loss at 45% of 5% limit -> -2.25% or -$22.5)
  const cbCaution = CircuitBreakerEngine.evaluateBreakers({
    ...baseLimits,
    realizedPnl24hUsd: -25 // 2.5% loss on $1,000 is 50% of 5% limit -> CAUTION
  }, config1000);
  assert.strictEqual(cbCaution.state, 'CAUTION');
  assert.strictEqual(cbCaution.sizingMultiplier, 0.75);

  // State: DEFENSIVE (e.g. daily loss at 75% of limit -> -3.8% or -$38, or loss streak = 3)
  const cbDefensive = CircuitBreakerEngine.evaluateBreakers({
    ...baseLimits,
    realizedPnl24hUsd: -38
  }, config1000);
  assert.strictEqual(cbDefensive.state, 'DEFENSIVE');
  assert.strictEqual(cbDefensive.sizingMultiplier, 0.50);

  // State: HALTED (daily loss exceeds max 5% -> -55 USD)
  const cbHaltedDaily = CircuitBreakerEngine.evaluateBreakers({
    ...baseLimits,
    realizedPnl24hUsd: -55
  }, config1000);
  assert.strictEqual(cbHaltedDaily.state, 'HALTED');
  assert.strictEqual(cbHaltedDaily.sizingMultiplier, 0.0);
  assert.strictEqual(cbHaltedDaily.emergencyExitOnly, true);
  assert.strictEqual(cbHaltedDaily.canOpenNewPositions, false);

  // State: HALTED by Drawdown (HWM = 1000, Equity = 890 -> 11% drawdown > 10% limit)
  const cbHaltedDrawdown = CircuitBreakerEngine.evaluateBreakers({
    ...baseLimits,
    portfolioEquityUsd: 890,
    highWaterMarkUsd: 1000
  }, config1000);
  assert.strictEqual(cbHaltedDrawdown.state, 'HALTED');
  assert.ok(cbHaltedDrawdown.activeBreakers.includes('DRAWDOWN_EXCEEDED'));

  // State: HALTED by Stale Data
  const cbHaltedStale = CircuitBreakerEngine.evaluateBreakers(baseLimits, config1000, { isStaleData: true });
  assert.strictEqual(cbHaltedStale.state, 'HALTED');
  assert.ok(cbHaltedStale.activeBreakers.includes('STALE_DATA'));

  // State: HALTED by DB Inconsistency
  const cbHaltedDb = CircuitBreakerEngine.evaluateBreakers(baseLimits, config1000, { isDbInconsistent: true });
  assert.strictEqual(cbHaltedDb.state, 'HALTED');
  assert.ok(cbHaltedDb.activeBreakers.includes('DB_INCONSISTENCY'));

  // State: HALTED by Active Cooldown after loss streak
  const cbHaltedCooldown = CircuitBreakerEngine.evaluateBreakers({
    ...baseLimits,
    consecutiveLossStreak: 3,
    lastLossTimestamp: Date.now() - 5000 // loss was 5 seconds ago, 30 min cooldown active
  }, config1000);
  assert.strictEqual(cbHaltedCooldown.state, 'HALTED');
  assert.ok(cbHaltedCooldown.activeBreakers.includes('LOSS_STREAK_COOLDOWN'));

  // 4. FULL RISK ENGINE PIPELINE EVALUATION
  const riskEngine = new RiskEngine();

  const standardInput: RiskCheckInput = {
    tokenAddress: '0xabc123',
    tokenSymbol: 'TEST',
    chainId: ChainId.BASE,
    strategyName: 'MOMENTUM_EXPANSION',
    currentPriceUsd: 2.50,
    poolLiquidityUsd: 80000,
    securityScore: 92,
    liquidityScore: 88,
    realizedVolatility: 0.04,
    roundTripEstimatedCostBps: 50,
    estimatedPriceImpactBps: 20,
    estimatedGasCostUsd: 0.02,
    stopLossPercent: 2.5,
    targetProfitPercent: 6.0,
    mlPrediction: {
      calibrated_probability: 0.62
    } as any,
    preferredSizingMethod: 'FRACTIONAL_KELLY'
  };

  const decisionAllowed = riskEngine.evaluateRisk(standardInput, baseLimits);
  assert.strictEqual(decisionAllowed.allowed, true);
  assert.strictEqual(decisionAllowed.circuitBreakerState, 'NORMAL');
  assert.ok(decisionAllowed.recommendedSizeUsd > 0);
  assert.ok(decisionAllowed.recommendedSizeTokens > 0);
  assert.strictEqual(decisionAllowed.blockCodes.length, 0);
  assert.ok(decisionAllowed.executionConstraints.hardStopPriceUsd < standardInput.currentPriceUsd);
  assert.ok(decisionAllowed.executionConstraints.takeProfitPriceUsd > standardInput.currentPriceUsd);

  // Verify Limits Consumed Snapshot
  const snap = decisionAllowed.limitsConsumed;
  assert.strictEqual(snap.dailyLossLimitPercent, 5.0);
  assert.strictEqual(snap.maxDrawdownLimitPercent, 10.0);
  assert.strictEqual(snap.activePositionsCount, 0);

  // 5. SMALL CAPITAL ($5) AUTO-NO_TRADE ON EXCESSIVE COSTS
  const smallCapitalLimits: RiskLimitsConfig = {
    capitalMode: '5',
    portfolioEquityUsd: 5.0,
    cashBalanceUsd: 5.0,
    highWaterMarkUsd: 5.0,
    realizedPnl24hUsd: 0,
    consecutiveLossStreak: 0,
    maxLossStreakLimit: 2,
    cooldownMinutesAfterLossStreak: 30,
    activePositions: []
  };

  // High gas on small trade: gas $0.35 on $1.50 size = 2333 bps cost! Destroys edge
  const smallInputHighCost: RiskCheckInput = {
    ...standardInput,
    estimatedGasCostUsd: 0.35,
    roundTripEstimatedCostBps: 150,
    estimatedPriceImpactBps: 80
  };

  const smallDecisionBlocked = riskEngine.evaluateRisk(smallInputHighCost, smallCapitalLimits);
  assert.strictEqual(smallDecisionBlocked.allowed, false, 'Tiny trade with high costs must trigger NO_TRADE');
  assert.ok(smallDecisionBlocked.blockCodes.includes('COST_CRUSHES_EDGE'), 'Must block with COST_CRUSHES_EDGE');
  assert.strictEqual(smallDecisionBlocked.recommendedSizeUsd, 0);

  // 6. POOL LIQUIDITY CAP (Max 2% of pool depth)
  const lowLiquidityInput: RiskCheckInput = {
    ...standardInput,
    poolLiquidityUsd: 2000 // 2% of $2,000 = $40
  };
  const lowLiqDecision = riskEngine.evaluateRisk(lowLiquidityInput, {
    ...baseLimits,
    customOverrides: { minLiquidityUsd: 1000 } // lower min for this specific check
  });
  assert.ok(lowLiqDecision.recommendedSizeUsd <= 40, 'Position size cannot exceed 2% of pool liquidity');

  // 7. MAX SIMULTANEOUS POSITIONS BLOCK
  const fullPositionsLimits: RiskLimitsConfig = {
    ...baseLimits,
    activePositions: Array(6).fill(null).map((_, i) => ({
      id: `p_${i}`,
      tokenAddress: `0x${i}`,
      chainId: ChainId.BASE,
      strategyName: 'TEST',
      sizeUsd: 100,
      entryPriceUsd: 1,
      currentPriceUsd: 1,
      stopLossPercent: 2,
      takeProfitPercent: 5,
      unrealizedPnlUsd: 0
    }))
  };
  const maxPosDecision = riskEngine.evaluateRisk(standardInput, fullPositionsLimits);
  assert.strictEqual(maxPosDecision.allowed, false);
  assert.ok(maxPosDecision.blockCodes.includes('MAX_POSITIONS_REACHED'));

  console.log('✅ Risk Engine & Position Sizing tests passed!');
}

async function testPaperExecutionAndPortfolio() {
  console.log('🧪 Running Paper Execution & Portfolio Management tests...');

  // 1. AMM Constant Product Model tests
  const ammQuoteNormal = AMMExecutionModel.quoteSwap(500, 100000, 2.00, ChainId.BASE);
  assert.strictEqual(ammQuoteNormal.isPartialFill, false);
  assert.strictEqual(ammQuoteNormal.filledSizeUsd, 500);
  assert.strictEqual(ammQuoteNormal.residualSizeUsd, 0);
  assert.strictEqual(ammQuoteNormal.poolReserveQuoteUsd, 50000);
  assert.strictEqual(ammQuoteNormal.poolReserveBaseTokens, 25000);
  assert.strictEqual(ammQuoteNormal.dexFeeUsd, 1.5); // 0.30% of 500
  assert.ok(ammQuoteNormal.tokensOut > 0);
  assert.ok(ammQuoteNormal.effectivePriceUsd > 2.00, 'AMM Buy must have execution price higher than spot price');
  assert.ok(ammQuoteNormal.priceImpactBps > 0);
  assert.strictEqual(ammQuoteNormal.gasFeeUsd, 0.015);

  // Partial fill on oversized order (> 2.5% of $100k pool = $2,500 max depth)
  const ammQuoteOversized = AMMExecutionModel.quoteSwap(5000, 100000, 2.00, ChainId.BSC);
  assert.strictEqual(ammQuoteOversized.isPartialFill, true);
  assert.strictEqual(ammQuoteOversized.filledSizeUsd, 2500);
  assert.strictEqual(ammQuoteOversized.residualSizeUsd, 2500);
  assert.strictEqual(ammQuoteOversized.gasFeeUsd, 0.08);

  // 2. Realistic Paper Execution tests
  const validOrder: PaperExecutionOrder = {
    orderId: 'ord_exec_1',
    positionId: 'pos_exec_1',
    tokenAddress: '0x1111222233334444555566667777888899990000',
    tokenSymbol: 'PAPER',
    chainId: ChainId.BASE,
    side: 'BUY',
    requestedSizeUsd: 200,
    observedPriceUsd: 1.50,
    decisionTimestamp: Date.now() - 50,
    maxSlippageBps: 200,
    deadlineTimestamp: Date.now() + 60000,
    poolLiquidityUsd: 50000,
    realizedVolatility: 0.03
  };

  const execResult = PaperExecutionEngine.executeOrder(validOrder);
  assert.strictEqual(execResult.status, 'FILLED');
  assert.ok(execResult.executionPriceUsd > validOrder.observedPriceUsd);
  assert.ok(execResult.executionLatencyMs >= 80, 'Must simulate realistic Base latency >= 80ms');
  assert.strictEqual(execResult.filledSizeUsd, 200);
  assert.ok(execResult.filledTokens > 0);
  assert.ok(execResult.totalCostUsd > 0);

  // Expiration check
  const expiredOrder: PaperExecutionOrder = {
    ...validOrder,
    deadlineTimestamp: Date.now() - 500
  };
  const expiredResult = PaperExecutionEngine.executeOrder(expiredOrder);
  assert.strictEqual(expiredResult.status, 'EXPIRED');
  assert.strictEqual(expiredResult.filledSizeUsd, 0);

  // Slippage guard rejection
  const tightSlippageOrder: PaperExecutionOrder = {
    ...validOrder,
    maxSlippageBps: 2 // impossible tight tolerance vs 3% vol + pool impact
  };
  const rejectedResult = PaperExecutionEngine.executeOrder(tightSlippageOrder);
  assert.strictEqual(rejectedResult.status, 'REJECTED');
  assert.ok(rejectedResult.rejectionReason?.includes('exceeded limit'));

  // 3. Intrabar Evaluator tests
  const candle: IntrabarCandle = {
    open: 2.00,
    high: 2.30,
    low: 1.80,
    close: 2.10,
    volume: 15000,
    timestamp: Date.now()
  };

  // Stop loss hit intrabar
  const resStop = IntrabarEvaluator.evaluateIntrabar(candle, 1.85, 2.50);
  assert.strictEqual(resStop.hitStop, true);
  assert.strictEqual(resStop.hitTarget, false);
  assert.strictEqual(resStop.stopFillPriceUsd, 1.85);
  assert.strictEqual(resStop.firstHit, 'STOP');

  // Take profit hit intrabar
  const resTarget = IntrabarEvaluator.evaluateIntrabar(candle, 1.70, 2.25);
  assert.strictEqual(resTarget.hitStop, false);
  assert.strictEqual(resTarget.hitTarget, true);
  assert.strictEqual(resTarget.targetFillPriceUsd, 2.25);
  assert.strictEqual(resTarget.firstHit, 'TARGET');

  // Gap opening past stop
  const gapCandle: IntrabarCandle = {
    open: 1.80,
    high: 1.82,
    low: 1.75,
    close: 1.78,
    volume: 8000,
    timestamp: Date.now()
  };
  const resGap = IntrabarEvaluator.evaluateIntrabar(gapCandle, 1.90, 2.40);
  assert.strictEqual(resGap.hitStop, true);
  assert.strictEqual(resGap.stopFillPriceUsd, 1.80, 'Must fill at gap open price when market opens below stop');

  // 4. Adaptive TP/SL Engine tests
  const highVolParams: AdaptiveTPSLParams = {
    realizedVolatility: 0.08,
    poolLiquidityUsd: 80000,
    netEvPercent: 1.5,
    signalConfidence: 0.65,
    currentPriceUsd: 5.00,
    regime: 'HIGH_VOL'
  };
  const highVolLevels = AdaptiveTPSLEngine.computeLevels(highVolParams);
  assert.ok(highVolLevels.recommendedStopLossPercent >= 4.0, 'High vol regime must expand stop loss');
  assert.ok(highVolLevels.recommendedTakeProfitPercent >= highVolLevels.recommendedStopLossPercent * 2.0);
  assert.strictEqual(highVolLevels.stagedTargets.length, 3);
  assert.strictEqual(highVolLevels.stagedTargets[0].portionToExit, 0.33);
  assert.strictEqual(highVolLevels.stagedTargets[1].portionToExit, 0.33);
  assert.strictEqual(highVolLevels.stagedTargets[2].portionToExit, 0.34);

  // 5. Exit Engine Rule Evaluation tests
  const mockBasePosition = {
    id: 'pos_exit_test',
    tokenAddress: '0xabc',
    chainId: ChainId.BASE,
    symbol: 'MOCK',
    name: 'Mock Token',
    thesis: 'Momentum expansion breakout',
    strategy: 'MOMENTUM_EXPANSION',
    signalId: 'sig_1',
    regime: 'TREND_UP' as const,
    entry: {
      timestamp: Date.now() - 3600000,
      initialSizeUsd: 100,
      initialTokens: 50,
      initialPriceUsd: 2.00
    },
    size: {
      currentSizeUsd: 100,
      currentTokens: 50
    },
    averagePriceUsd: 2.00,
    accumulatedFeesUsd: 0.40,
    stop: {
      stopLossPriceUsd: 1.90,
      stopLossPercent: 5.0,
      initialStopPriceUsd: 1.90
    },
    targets: [
      { level: 1, targetPriceUsd: 2.10, targetPercent: 5.0, portionToExit: 0.33, isHit: false },
      { level: 2, targetPriceUsd: 2.20, targetPercent: 10.0, portionToExit: 0.33, isHit: false },
      { level: 3, targetPriceUsd: 2.30, targetPercent: 15.0, portionToExit: 0.34, isHit: false }
    ],
    trailingState: {
      isActive: true,
      activationThresholdPercent: 5.0,
      trailingDistancePercent: 3.0,
      highestPriceUsd: 2.25,
      dynamicStopPriceUsd: 2.1825 // 2.25 * (1 - 0.03)
    },
    mfe: { mfePercent: 12.5, mfeUsd: 12.5, highestPriceUsd: 2.25, highestPriceTimestamp: Date.now() - 1000 },
    mae: { maePercent: -1.0, maeUsd: -1.0, lowestPriceUsd: 1.98, lowestPriceTimestamp: Date.now() - 2000 },
    timeInTradeMs: 3600000,
    expectedHorizon: '5m',
    isSimulation: true,
    status: 'OPEN' as const,
    currentPriceUsd: 2.00,
    unrealizedPnlUsd: 0,
    unrealizedPnlPercent: 0,
    realizedPnlUsd: 0,
    lastUpdateTimestamp: Date.now(),
    isStaleValuation: false
  };

  // Rule 1: Emergency Stop
  const emergencyExit = ExitEngine.evaluateExit(mockBasePosition, {
    currentPriceUsd: 2.00,
    isEmergencyStop: true
  });
  assert.strictEqual(emergencyExit.rule, 'EMERGENCY_EXIT');
  assert.strictEqual(emergencyExit.shouldExit, true);

  // Rule 2: Hard Stop
  const hardStopExit = ExitEngine.evaluateExit(mockBasePosition, {
    currentPriceUsd: 1.88
  });
  assert.strictEqual(hardStopExit.rule, 'HARD_STOP');
  assert.strictEqual(hardStopExit.shouldExit, true);

  // Rule 4: Security Deterioration
  const securityExit = ExitEngine.evaluateExit(mockBasePosition, {
    currentPriceUsd: 2.05,
    securityScore: 40
  });
  assert.strictEqual(securityExit.rule, 'LIQUIDITY_SECURITY_DETERIORATION');
  assert.strictEqual(securityExit.shouldExit, true);

  // Rule 6: Signal Reversal
  const signalExit = ExitEngine.evaluateExit(mockBasePosition, {
    currentPriceUsd: 2.05,
    signalDirection: 'SHORT'
  });
  assert.strictEqual(signalExit.rule, 'SIGNAL_REVERSAL');
  assert.strictEqual(signalExit.shouldExit, true);

  // Rule 7: Adaptive Trailing Stop Trigger
  const trailingExit = ExitEngine.evaluateExit(mockBasePosition, {
    currentPriceUsd: 2.15 // below 2.1825 dynamic stop
  });
  assert.strictEqual(trailingExit.rule, 'ADAPTIVE_TRAILING_STOP');
  assert.strictEqual(trailingExit.shouldExit, true);

  // Rule 8: Partial Take Profit
  const mockUntrailedPosition = {
    ...mockBasePosition,
    trailingState: { ...mockBasePosition.trailingState, isActive: false, dynamicStopPriceUsd: 0 }
  };
  const partialTpExit = ExitEngine.evaluateExit(mockUntrailedPosition, {
    currentPriceUsd: 2.12
  });
  assert.strictEqual(partialTpExit.rule, 'PARTIAL_TAKE_PROFIT');
  assert.strictEqual(partialTpExit.shouldExit, true);
  assert.strictEqual(partialTpExit.exitType, 'PARTIAL');
  assert.strictEqual(partialTpExit.portion, 0.33);

  // Rule 9: Time Stop (5m horizon trade open for 1 hour with 0% PnL)
  const timeStopExit = ExitEngine.evaluateExit(mockUntrailedPosition, {
    currentPriceUsd: 2.00
  });
  assert.strictEqual(timeStopExit.rule, 'TIME_STOP');
  assert.strictEqual(timeStopExit.shouldExit, true);

  // 6. Advanced Portfolio Engine & Double-Entry Ledger tests
  const testDb = new BattleTradeDB();
  const portfolio = new AdvancedPortfolioEngine(testDb);

  const initialSimBalance = testDb.getBalance('SIM_USD');
  const initialCash = initialSimBalance.amount;
  const initialAllocated = initialSimBalance.allocated_to_trades;

  const openedPos = portfolio.openPosition({
    id: 'pos_portfolio_test_1',
    tokenAddress: '0x999888777666555444333222111000aabbccdde',
    chainId: ChainId.BASE,
    symbol: 'TESTPORT',
    name: 'Portfolio Test Token',
    thesis: 'Momentum consolidation breakout',
    strategy: 'MOMENTUM_EXPANSION',
    signalId: 'sig_port_1',
    regime: 'TREND_UP',
    fillResult: {
      orderId: 'ord_1',
      positionId: 'pos_portfolio_test_1',
      status: 'FILLED',
      observedPriceUsd: 1.00,
      executionPriceUsd: 1.02,
      filledSizeUsd: 100,
      filledTokens: 98.039215,
      residualSizeUsd: 0,
      priceImpactBps: 20,
      slippageBps: 20,
      dexFeeUsd: 0.30,
      gasFeeUsd: 0.015,
      totalCostUsd: 0.315,
      decisionTimestamp: Date.now() - 100,
      executionTimestamp: Date.now(),
      executionLatencyMs: 90
    },
    stopLossPercent: 4.0,
    stagedTargets: [
      { level: 1, targetPriceUsd: 1.08, targetPercent: 6.0, portionToExit: 0.33, isHit: false },
      { level: 2, targetPriceUsd: 1.15, targetPercent: 12.0, portionToExit: 0.33, isHit: false },
      { level: 3, targetPriceUsd: 1.25, targetPercent: 22.0, portionToExit: 0.34, isHit: false }
    ],
    trailingActivationPercent: 5.0,
    trailingDistancePercent: 3.0,
    expectedHorizon: '15m',
    isSimulation: true
  });

  assert.strictEqual(openedPos.status, 'OPEN');
  assert.strictEqual(openedPos.averagePriceUsd, 1.02);

  // Check ledger updated after open: cash deducted, allocated increased
  const afterOpenBalance = testDb.getBalance('SIM_USD');
  assert.strictEqual(afterOpenBalance.amount, initialCash - 100);
  assert.strictEqual(afterOpenBalance.allocated_to_trades, initialAllocated + 100);

  // Mark-to-market valuation with freshness check
  const staleQuoteTime = Date.now() - 75000; // 75 seconds ago
  const mtmStale = portfolio.updateMarkToMarket(openedPos.id, 1.06, staleQuoteTime);
  assert.strictEqual(mtmStale?.isStaleValuation, true, 'Quotes older than 60s must be marked stale');

  const freshQuoteTime = Date.now() - 5000; // 5 seconds ago
  const mtmFresh = portfolio.updateMarkToMarket(openedPos.id, 1.10, freshQuoteTime);
  assert.strictEqual(mtmFresh?.isStaleValuation, false);
  assert.strictEqual(mtmFresh?.unrealizedPnlPercent, 7.84);
  assert.ok(mtmFresh!.trailingState.isActive, 'Trailing must activate past threshold');
  assert.strictEqual(mtmFresh?.mfe.highestPriceUsd, 1.10);

  // Staged partial exit (TP1 33%)
  const partialExitResult = portfolio.executeExit(
    openedPos.id,
    {
      rule: 'PARTIAL_TAKE_PROFIT',
      shouldExit: true,
      exitType: 'PARTIAL',
      portion: 0.33,
      triggerPriceUsd: 1.08,
      reason: 'TP1 Hit'
    },
    {
      orderId: 'ord_exit_1',
      positionId: openedPos.id,
      status: 'FILLED',
      observedPriceUsd: 1.08,
      executionPriceUsd: 1.08,
      filledSizeUsd: 33,
      filledTokens: 32.3529,
      residualSizeUsd: 0,
      priceImpactBps: 10,
      slippageBps: 10,
      dexFeeUsd: 0.10,
      gasFeeUsd: 0.015,
      totalCostUsd: 0.115,
      decisionTimestamp: Date.now(),
      executionTimestamp: Date.now(),
      executionLatencyMs: 85
    }
  );

  assert.strictEqual(partialExitResult.isFullyClosed, false);
  assert.strictEqual(partialExitResult.position.status, 'PARTIALLY_CLOSED');
  assert.strictEqual(partialExitResult.position.targets[0].isHit, true);
  assert.ok(partialExitResult.realizedPnlThisExit > 0);

  // Full exit on hard stop
  const fullExitResult = portfolio.executeExit(
    openedPos.id,
    {
      rule: 'HARD_STOP',
      shouldExit: true,
      exitType: 'FULL',
      portion: 1.0,
      triggerPriceUsd: 0.98,
      reason: 'Hard stop hit'
    },
    {
      orderId: 'ord_exit_2',
      positionId: openedPos.id,
      status: 'FILLED',
      observedPriceUsd: 0.98,
      executionPriceUsd: 0.98,
      filledSizeUsd: 67,
      filledTokens: 65.6863,
      residualSizeUsd: 0,
      priceImpactBps: 10,
      slippageBps: 10,
      dexFeeUsd: 0.20,
      gasFeeUsd: 0.015,
      totalCostUsd: 0.215,
      decisionTimestamp: Date.now(),
      executionTimestamp: Date.now(),
      executionLatencyMs: 85
    }
  );

  assert.strictEqual(fullExitResult.isFullyClosed, true);
  assert.strictEqual(fullExitResult.position.status, 'CLOSED');
  assert.strictEqual(fullExitResult.position.size.currentSizeUsd, 0);

  // Safe restart recovery verification
  const newPortfolioInstance = new AdvancedPortfolioEngine(testDb);
  // Add a position directly to db to simulate persistence before restart
  testDb.savePosition({
    id: 'pos_persisted_restart_1',
    token_address: '0x123',
    chain_id: ChainId.BASE,
    name: 'Restored Token',
    symbol: 'RESTORE',
    buy_price_usd: 1.50,
    current_price_usd: 1.55,
    size_usd: 50,
    amount_tokens: 33.333333,
    buy_timestamp: Date.now() - 100000,
    last_update_timestamp: Date.now() - 5000,
    highest_price_usd: 1.60,
    is_principal_recovered: 0,
    target_take_profit_percent: 10.0,
    stop_loss_percent: 4.0,
    trailing_stop_percent: 3.0,
    is_simulation: 1,
    pnl_usd: 1.66,
    pnl_percent: 3.33,
    regime_at_entry: 'TREND_UP',
    setup_pattern: 'VELOCITY_BREAKOUT',
    status: 'OPEN'
  });

  const restoredCount = newPortfolioInstance.restoreFromDatabase();
  assert.ok(restoredCount >= 1, 'Must recover active positions from database upon restart');
  const recoveredPos = newPortfolioInstance.getPosition('pos_persisted_restart_1');
  assert.strictEqual(recoveredPos?.symbol, 'RESTORE');
  assert.strictEqual(recoveredPos?.status, 'OPEN');

  // 7. LiveExecutionAdapter Physical Lock Verification
  const liveAdapter = new LiveExecutionAdapter();
  assert.strictEqual(liveAdapter.isLiveAllowed(), false, 'Live execution must be disabled');
  await assert.rejects(
    async () => {
      await liveAdapter.executeLiveOrder(validOrder);
    },
    (err: Error) => {
      assert.ok(err.message.includes('LIVE_EXECUTION_BLOCKED'));
      return true;
    },
    'Live execution must throw LIVE_EXECUTION_BLOCKED'
  );

  console.log('✅ Paper Execution & Portfolio Management tests passed!');
}

async function testAiRouterAndSmartMoney() {
  console.log('🧪 Running AI Router & Smart Money tests...');

  // ==========================================
  // 1. AI Router & Cascade Verification
  // ==========================================
  const router = new AIRouter({
    // Running without keys in test mode to verify deterministic fallback robustness
    geminiApiKey: '',
    groqApiKey: '',
    maxRetriesPerModel: 1,
    timeoutMs: 1000,
    baseCooldownMs: 2000,
    cacheTtlMs: 5000,
    enableDeduplication: true,
  });

  // Check Quota Status
  const quota = router.getQuotaStatus();
  assert.ok(quota.isQuotaExhausted, 'Without keys, quota status should report exhausted/fallback');
  assert.strictEqual(quota.activeProvider, 'DETERMINISTIC_FALLBACK');
  assert.ok(quota.nextEstimatedResetTimestamp > Date.now(), 'Reset timestamp must be in future');

  // Verify Sentiment Analysis (Deterministic fallback returns valid typed JSON)
  const sentiment = await router.analyzeSentiment('PEPE', 'Pepe Token', {
    volume24hUsd: 150000,
    priceChange24hPercent: 25.5,
    liquidityUsd: 25000,
  });
  assert.strictEqual(sentiment.tokenSymbol, 'PEPE');
  assert.ok(sentiment.sentimentScore > 0, 'Positive price change should yield positive sentiment score');
  assert.strictEqual(sentiment.isFallback, true);
  assert.strictEqual(sentiment.providerUsed, 'DETERMINISTIC_FALLBACK');
  assert.ok(Array.isArray(sentiment.keyRisks));

  // Verify Cache hit on duplicate request
  const sentimentCached = await router.analyzeSentiment('PEPE', 'Pepe Token', {
    volume24hUsd: 150000,
    priceChange24hPercent: 25.5,
    liquidityUsd: 25000,
  });
  assert.strictEqual(sentimentCached.sentimentScore, sentiment.sentimentScore);

  // Verify Anomaly Detection
  const washTradingAnomaly = await router.detectAnomalies('WASH', {
    buyVolumeUsd: 50000,
    sellVolumeUsd: 2000,
    uniqueBuyers: 1, // Only 1 buyer doing $50,000
    uniqueSellers: 10,
    txCount: 40,
  });
  assert.strictEqual(washTradingAnomaly.hasAnomaly, true, 'Wash trading must be flagged');
  assert.strictEqual(washTradingAnomaly.anomalyType, 'WASH_TRADING');
  assert.strictEqual(washTradingAnomaly.anomalySeverity, 'HIGH');

  const normalVolume = await router.detectAnomalies('ORGANIC', {
    buyVolumeUsd: 20000,
    sellVolumeUsd: 18000,
    uniqueBuyers: 45,
    uniqueSellers: 40,
    txCount: 150,
  });
  assert.strictEqual(normalVolume.hasAnomaly, false, 'Organic volume should have no anomaly');

  // Verify Signal Explanation
  const explanation = await router.explainSignal(
    'SIG-123',
    'DOGE',
    'Momentum',
    82.5,
    0.85,
    'TREND_UP',
    3.85
  );
  assert.strictEqual(explanation.signalId, 'SIG-123');
  assert.ok(explanation.summary.includes('Momentum'));
  assert.ok(explanation.primaryDrivers.length > 0);

  // Verify Trade Autopsy
  const winAutopsy = await router.generateTradeAutopsy('TR-001', 'DOGE', 15.2, 20.0, 2.0, 1800000, 'TAKE_PROFIT');
  assert.strictEqual(winAutopsy.outcomeClassification, 'CLEAN_WIN');
  assert.ok(winAutopsy.mfeCaptureEfficiencyPercent > 0);

  const lossAutopsy = await router.generateTradeAutopsy('TR-002', 'SHIB', -5.0, 1.0, 5.0, 900000, 'HARD_STOP');
  assert.strictEqual(lossAutopsy.outcomeClassification, 'CONTROLLED_LOSS');

  // Verify Telemetry List contains both Gemini and Groq models
  const telemetry = router.getAllTelemetry();
  assert.ok(telemetry.some(t => t.modelId === 'gemini-3.8-flash'), 'gemini-3.8-flash must be present in telemetry');
  assert.ok(telemetry.some(t => t.modelId === 'qwen/qwen3.8-27b'), 'qwen/qwen3.8-27b must be present in telemetry');

  // ==========================================
  // 2. Smart Money & Meme Intelligence
  // ==========================================
  const sm = new SmartMoneyEngine({
    enabled: true,
    minWhaleThresholdUsd: 5000,
    maxSybilCorrelationThreshold: 0.85,
    lookbackMinutes: 60,
  });

  // Verify Cohort Classification
  assert.strictEqual(sm.classifyWallet('0x1', 50000, 0.75, 20, 3600000), 'SMART_WHALE');
  assert.strictEqual(sm.classifyWallet('0x2', 15000, 0.70, 15, 60000), 'EARLY_SNIPER');
  assert.strictEqual(sm.classifyWallet('0x3', 2000, 0.50, 100, 5000), 'BOT_ARBITRAGE');
  assert.strictEqual(sm.classifyWallet('0x4', 500, 0.45, 8, 86400000), 'RETAIL');

  // Register a Known Smart Whale
  sm.registerWallet({
    address: '0xWhale1',
    chainId: ChainId.BASE,
    cohort: 'SMART_WHALE',
    winRate: 0.82,
    realizedPnlUsd: 120000,
    unrealizedPnlUsd: 5000,
    averageHoldingTimeMs: 7200000,
    totalSwaps: 40,
    profitableSwaps: 33,
    activityScore: 85,
    sybilRiskScore: 5,
    lastActiveTimestamp: Date.now(),
  });

  const now = Date.now();
  // Ingest Whale Swaps into Token A
  sm.ingestSwap({
    txHash: '0xhash1',
    walletAddress: '0xWhale1',
    tokenAddress: '0xTokenA',
    chainId: ChainId.BASE,
    isBuy: true,
    amountUsd: 15000,
    timestamp: now - 60000,
  });

  // Ingest Retail Buy into Token A
  sm.ingestSwap({
    txHash: '0xhash2',
    walletAddress: '0xRetail1',
    tokenAddress: '0xTokenA',
    chainId: ChainId.BASE,
    isBuy: true,
    amountUsd: 500,
    timestamp: now - 30000,
  });

  // Calculate Flow for Token A
  const flowA = sm.calculateSmartMoneyFlow('0xTokenA', ChainId.BASE, '15m');
  assert.strictEqual(flowA.netFlowUsd, 15500);
  assert.strictEqual(flowA.cohortBreakdown.SMART_WHALE.netUsd, 15000);
  assert.strictEqual(flowA.activeWhalesCount, 1);

  // Generate Signal for Token A (Strong Whale Accumulation)
  const signalA = sm.generateSignal('0xTokenA', ChainId.BASE);
  assert.strictEqual(signalA.smartMoneyBias, 'STRONG_ACCUMULATION');
  assert.ok(signalA.smartScore >= 80);
  assert.strictEqual(signalA.isSybilManipulated, false);

  // Ingest Sybil Farm cluster into Token B (common parent funder)
  const sybilFunder = '0xDarkMixerFunder';
  for (let i = 0; i < 5; i++) {
    sm.ingestSwap({
      txHash: `0xsybil_${i}`,
      walletAddress: `0xSybilWallet_${i}`,
      tokenAddress: '0xTokenB',
      chainId: ChainId.BASE,
      isBuy: true,
      amountUsd: 800,
      timestamp: now - (i * 500),
      parentFundingSource: sybilFunder,
    });
  }

  // Generate Signal for Token B (Should detect Sybil Manipulation)
  const signalB = sm.generateSignal('0xTokenB', ChainId.BASE);
  assert.strictEqual(signalB.isSybilManipulated, true, 'Sybil cluster must be detected');
  assert.strictEqual(signalB.smartMoneyBias, 'HEAVY_DUMP', 'Sybil-manipulated token should have HEAVY_DUMP bias');
  assert.ok(signalB.smartScore <= 30);

  // Test Ecosystem Meme Intelligence
  for (let i = 0; i < 6; i++) {
    sm.recordPoolDeployment(now - (i * 300000));
  }
  sm.recordPoolFailure();

  const memeMetrics = sm.getMemeIntelligenceMetrics(ChainId.BASE);
  assert.strictEqual(memeMetrics.newPoolVelocityPerHour, 6);
  assert.ok(memeMetrics.ecosystemHeatIndex >= 0 && memeMetrics.ecosystemHeatIndex <= 100);

  // Test Dynamic Layer Disable Toggle (Graceful Passthrough)
  sm.setEnabled(false);
  assert.strictEqual(sm.isEnabled(), false);
  const disabledFlow = sm.calculateSmartMoneyFlow('0xTokenA', ChainId.BASE);
  assert.strictEqual(disabledFlow.netFlowUsd, 0, 'Disabled engine must return zero flow');
  const disabledSignal = sm.generateSignal('0xTokenA', ChainId.BASE);
  assert.strictEqual(disabledSignal.smartMoneyBias, 'NEUTRAL');
  assert.strictEqual(disabledSignal.smartScore, 50);

  // Re-enable
  sm.setEnabled(true);
  assert.strictEqual(sm.isEnabled(), true);

  console.log('✅ AI Router & Smart Money tests passed!');
}

// 20. UNIFIED DECISION PIPELINE, DECISION OBJECTS, AUTOPSIES & METRICS (PROMPT 07)
async function testUnifiedDecisionPipeline() {
  console.log('🧪 Running Unified Decision Pipeline & Explainability & Metrics tests...');

  const pipelineDb = new BattleTradeDB();
  const testAiRouter = new AIRouter({
    geminiApiKey: '',
    groqApiKey: '',
    timeoutMs: 1000,
    baseCooldownMs: 1000
  });
  const pipeline = new UnifiedDecisionPipeline(pipelineDb, testAiRouter);

  // Set running state
  pipelineDb.updateSystemState({ current_status: 'RUNNING', is_simulation: 1 });
  pipelineDb.updateBalance('SIM_USD', 1000.0, 0.0);

  const baseMacro = {
    btcTrend: 'BULLISH' as const,
    btcPriceUsd: 95000,
    btcChange24h: 2.5,
    ethPriceUsd: 3400,
    fearAndGreedIndex: 72,
    macroClimate: 'RISK_ON' as const,
    memecoinSectorHeat: 'WARM' as const,
    macroMultiplier: 1.25,
    tradePermission: 'PERMITTED' as const,
    rationaleEs: 'Contexto macro favorable',
    rationaleEn: 'Favorable macro context',
    lastUpdated: Date.now(),
    source: 'Coinbase/Kraken' as const
  };

  // Test 1: Honeypot Security Block -> NO_TRADE
  const honeypotCandidate = {
    token: {
      address: '0xHoneypotToken',
      symbol: 'HONEY',
      name: 'Honey Scam',
      chainId: ChainId.BASE,
      priceUsd: 1.5,
      volume24hUsd: 50000,
      volume24h: 50000,
      liquidityUsd: 15000,
      marketCapUsd: 150000,
      priceChange24hPercent: 25.0,
      pairCreatedAt: Date.now() - 3600000,
      priceChangePercent5m: 2.0,
      priceChangePercent1h: 10.0,
      dexName: 'Uniswap',
      buyCount24h: 120,
      sellCount24h: 0,
      holdersCount: 80,
      ageHours: 2,
      lastUpdated: Date.now()
    },
    security: {
      tokenAddress: '0xHoneypotToken',
      chainId: ChainId.BASE,
      isHoneypot: true,
      buyTax: 99.0,
      sellTax: 99.0,
      lpLockedPercent: 0,
      topHoldersPercent: 85,
      isMintable: true,
      isOwnerRenounced: false,
      source: 'GoPlus' as const,
      hasBlacklist: true,
      goplusScore: 10,
      flags: ['HONEYPOT', 'HIGH_TAX'],
      lastScanTimestamp: Date.now()
    },
    macro: baseMacro
  };

  const decHoneypot = await pipeline.evaluateCandidate(honeypotCandidate);
  assert.strictEqual(decHoneypot.finalAction, 'NO_TRADE', 'Honeypot token must be blocked');
  assert.ok(decHoneypot.reasonCodes.includes('SECURITY_BLOCK'), 'Reason codes must include SECURITY_BLOCK');
  assert.strictEqual(decHoneypot.securityEvidence.hardBlock, true);
  assert.strictEqual(decHoneypot.positionSizeUsd, 0);

  // Test 2: Stale Data Token -> NO_TRADE + DATA_STALE reason code
  const staleCandidate = {
    token: {
      address: '0xStaleToken',
      symbol: 'STALE',
      name: 'Stale Token',
      chainId: ChainId.BASE,
      priceUsd: 0.10,
      volume24hUsd: 20000,
      volume24h: 20000,
      liquidityUsd: 8000,
      marketCapUsd: 80000,
      priceChange24hPercent: 5.0,
      pairCreatedAt: Date.now() - 3600000,
      priceChangePercent5m: 0.5,
      priceChangePercent1h: 2.0,
      dexName: 'Uniswap',
      buyCount24h: 30,
      sellCount24h: 20,
      holdersCount: 50,
      ageHours: 12,
      lastUpdated: Date.now() - 120000 // 2 minutes old quote
    },
    security: {
      tokenAddress: '0xStaleToken',
      chainId: ChainId.BASE,
      isHoneypot: false,
      buyTax: 1.0,
      sellTax: 1.0,
      lpLockedPercent: 90,
      topHoldersPercent: 20,
      isMintable: false,
      isOwnerRenounced: true,
      source: 'GoPlus' as const,
      hasBlacklist: false,
      goplusScore: 92,
      flags: [],
      lastScanTimestamp: Date.now()
    },
    macro: baseMacro,
    feedTimestamp: Date.now() - 120000
  };

  const decStale = await pipeline.evaluateCandidate(staleCandidate);
  assert.ok(decStale.reasonCodes.includes('DATA_STALE'), 'Stale candidate must have DATA_STALE reason code');

  // Test 3: Valid High-Conviction Opportunity -> BUY with Paper Execution
  const validCandidate = {
    token: {
      address: '0xValidAlphaToken',
      symbol: 'ALPHA',
      name: 'Alpha Token',
      chainId: ChainId.BASE,
      priceUsd: 0.50,
      volume24hUsd: 120000,
      volume24h: 120000,
      liquidityUsd: 85000,
      marketCapUsd: 500000,
      priceChange24hPercent: 18.5,
      pairCreatedAt: Date.now() - 3600000,
      priceChangePercent5m: 3.5,
      priceChangePercent1h: 12.0,
      dexName: 'Uniswap',
      buyCount24h: 350,
      sellCount24h: 120,
      holdersCount: 220,
      ageHours: 6,
      lastUpdated: Date.now()
    },
    security: {
      tokenAddress: '0xValidAlphaToken',
      chainId: ChainId.BASE,
      isHoneypot: false,
      buyTax: 1.5,
      sellTax: 1.5,
      lpLockedPercent: 95,
      topHoldersPercent: 18,
      isMintable: false,
      isOwnerRenounced: true,
      source: 'GoPlus' as const,
      hasBlacklist: false,
      goplusScore: 95,
      flags: [],
      lastScanTimestamp: Date.now()
    },
    macro: baseMacro,
    rawPriceHistory: [
      0.35, 0.355, 0.36, 0.365, 0.37, 0.375, 0.38, 0.385, 0.39, 0.395,
      0.40, 0.405, 0.41, 0.415, 0.42, 0.425, 0.43, 0.435, 0.44, 0.445,
      0.45, 0.455, 0.46, 0.465, 0.47, 0.475, 0.48, 0.485, 0.49, 0.50
    ],
    feedTimestamp: Date.now()
  };

  const decValid = await pipeline.evaluateCandidate(validCandidate);
  assert.strictEqual(decValid.finalAction, 'BUY', 'Valid opportunity with positive edge must trigger BUY');
  assert.ok(decValid.positionSizeUsd > 0, 'Position size must be greater than 0');
  assert.ok(decValid.executionResult !== undefined, 'Execution result must be populated');
  assert.strictEqual(decValid.executionResult?.status, 'FILLED');
  assert.ok(decValid.evNetOfCosts.evPercent > 0, 'Net EV must be positive');
  assert.ok(decValid.mlPrediction.calibratedProbability >= 0.5, 'Calibrated probability must be calculated');

  // Verify Immutable Decision Object fields
  assert.ok(decValid.decisionId.startsWith('dec_'));
  assert.strictEqual(decValid.asset.symbol, 'ALPHA');
  assert.strictEqual(decValid.chain, ChainId.BASE);
  assert.strictEqual(decValid.featureVersion, 'v2.1.0_EDGE');
  assert.ok(decValid.featuresSummary.rsi14 >= 0 && decValid.featuresSummary.rsi14 <= 100);
  assert.ok(decValid.strategySignals.compositeScore >= 0);
  assert.ok(decValid.riskDecision.allowed === true);

  // Test 4: Explainability ("¿Por qué no compraste HONEY?")
  const explanationHoney = await pipeline.explainDecision('HONEY');
  assert.strictEqual(explanationHoney.found, true);
  assert.strictEqual(explanationHoney.decision?.finalAction, 'NO_TRADE');
  assert.ok(explanationHoney.structuredExplanation.includes('SECURITY_BLOCK'));
  assert.ok(explanationHoney.structuredExplanation.includes('Honey Scam') || explanationHoney.structuredExplanation.includes('HONEY'));

  // Explainability for ALPHA
  const explanationAlpha = await pipeline.explainDecision('ALPHA');
  assert.strictEqual(explanationAlpha.found, true);
  assert.strictEqual(explanationAlpha.decision?.finalAction, 'BUY');

  // Test 5: Exit Monitoring & Structured Autopsies
  const quotes = new Map<string, number>();
  // Simulate +15% surge triggering TP partials/target
  quotes.set('0xvalidalphatoken', 0.50 * 1.15);

  const { closedTrades } = await pipeline.evaluateExitsAndAutopsies(quotes);
  // Verify autopsies were created or positions updated
  const allAutopsies = pipeline.getAllAutopsies();
  const allDecisions = pipeline.getAllDecisions();
  assert.ok(allDecisions.length >= 3, 'All candidate evaluations must produce logged Decision Objects');

  // Test 6: 6-Dimensional Comprehensive System Metrics
  const comprehensiveMetrics = pipeline.calculateComprehensiveMetrics(true);
  assert.ok(comprehensiveMetrics.portfolio !== undefined);
  assert.ok(comprehensiveMetrics.trading !== undefined);
  assert.ok(comprehensiveMetrics.execution !== undefined);
  assert.ok(comprehensiveMetrics.model !== undefined);
  assert.ok(comprehensiveMetrics.strategyBreakdown !== undefined);
  assert.ok(comprehensiveMetrics.regimeBreakdown !== undefined);

  // Validate math constraints
  assert.ok(typeof comprehensiveMetrics.portfolio.roiPercent === 'number');
  assert.ok(typeof comprehensiveMetrics.portfolio.cvar95Percent === 'number');
  assert.ok(comprehensiveMetrics.trading.winRatePercent >= 0 && comprehensiveMetrics.trading.winRatePercent <= 100);
  assert.ok(comprehensiveMetrics.model.brierScore >= 0 && comprehensiveMetrics.model.brierScore <= 1);
  assert.ok(comprehensiveMetrics.model.reliabilityBins.length > 0);
  assert.ok(comprehensiveMetrics.strategyBreakdown['Momentum'] !== undefined);
  assert.ok(comprehensiveMetrics.regimeBreakdown['TREND_UP'] !== undefined);

  console.log('✅ Unified Decision Pipeline & Autopsies & Metrics tests passed!');
}

async function testHardeningAndDemo7D() {
  console.log('\n--- Testing Security Hardening, CF Optimizer & 7-Day Autonomous Demo ---');

  // Test 1: Hardening & Secret Redactor
  const rawLogWithKeys = {
    geminiKey: 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6',
    groqKey: 'gsk_1234567890abcdef1234567890abcdef1234567890abcdef',
    telegramToken: 'bot123456789:ABCdefGHIjklMNOpqrSTUvwxYZ123456789',
    user: 'operator'
  };

  const sanitized = HardeningEngine.sanitize(rawLogWithKeys);
  assert.strictEqual(sanitized.geminiKey, '[REDACTED_FIELD]');
  assert.strictEqual(sanitized.groqKey, '[REDACTED_FIELD]');
  assert.strictEqual(sanitized.telegramToken, '[REDACTED_FIELD]');

  // Test 2: Physical Live Lock Verification
  const lockedCheck = HardeningEngine.verifyLiveExecutionAllowed(true);
  assert.strictEqual(lockedCheck.allowed, false);
  assert.ok(lockedCheck.reason.includes('PAPER/Simulación'));

  // Test 3: Input Validation
  const validAddr = HardeningEngine.validateInputParam('0x1234567890123456789012345678901234567890', 'address');
  assert.strictEqual(validAddr.valid, true);

  const invalidAddr = HardeningEngine.validateInputParam('invalid_address', 'address');
  assert.strictEqual(invalidAddr.valid, false);

  // Test 4: Cloudflare Optimizer Subrequest & Caching
  const cfOptimizer = new CloudflareOptimizer(db);
  cfOptimizer.beginInvocation();
  assert.strictEqual(cfOptimizer.getSubrequestCount(), 0);

  const cachedResult = await cfOptimizer.cachedFetch('test_key', async () => 'hello_world', 1000);
  assert.strictEqual(cachedResult, 'hello_world');
  assert.strictEqual(cfOptimizer.getSubrequestCount(), 1);

  // Second call should hit cache without incrementing subrequests
  const cacheHit = await cfOptimizer.cachedFetch('test_key', async () => 'new_value', 1000);
  assert.strictEqual(cacheHit, 'hello_world');
  assert.strictEqual(cfOptimizer.getSubrequestCount(), 1);

  // Data retention policy check
  const retentionResult = cfOptimizer.enforceDataRetentionPolicy();
  assert.ok(typeof retentionResult.purgedAuditsCount === 'number');

  // Test 5: 7-Day Autonomous Demo Manager
  const demoManager = new Demo7DManager(db);
  const demoConfig = demoManager.startDemo();
  assert.strictEqual(demoConfig.mode, 'PAPER');
  assert.strictEqual(demoConfig.durationDays, 7);
  assert.strictEqual(demoConfig.live, false);
  assert.strictEqual(demoConfig.isRunning, true);

  // Generate Scorecard
  const scorecard = demoManager.generate7DayScorecard();
  assert.ok(scorecard.demoOverview.completionPercent >= 0);
  assert.strictEqual(scorecard.capitalAndPnl.startingCapitalUsd, 1000.0);
  assert.ok(scorecard.robustnessScore.score >= 0 && scorecard.robustnessScore.score <= 100);
  assert.ok(scorecard.disclaimer.includes('PAPER'));

  // Export reports & datasets
  const reportExport = demoManager.exportScorecardReport();
  assert.ok(reportExport.mdPath.includes('SCORECARD_7D.md'));

  const datasetExport = demoManager.exportTradeDataset();
  assert.ok(datasetExport.csvPath.includes('DATASET_TRADES_7D.csv'));

  console.log('✅ Security Hardening, CF Optimizer & 7-Day Autonomous Demo tests passed!');
}

async function runAll() {
  try {
    testEventStore();
    testIdempotency();
    testOrderStateMachine();
    testPositionStateMachine();
    testAtomicity();
    await testLocks();
    testBalanceLedger();
    testReconciliation();
    testEventBus();
    testDataRetention();
    testWatchdog();
    testRecovery();
    await testMarketAndAdapters();
    await testSecurityEngine();
    testFeatureEngineMath();
    testStrategyBrainAndRegime();
    testLightMLEngine();
    testRiskEngine();
    await testPaperExecutionAndPortfolio();
    await testAiRouterAndSmartMoney();
    await testUnifiedDecisionPipeline();
    await testHardeningAndDemo7D();

    console.log('\n====================================================');
    console.log('🎉 ALL BATTLE TRADE TRANSACTIONAL TESTS PASSED GREEN 🎉');
    console.log('====================================================');
  } catch (err: any) {
    console.error('\n❌ TEST SUITE FAILED ❌');
    console.error(err);
    process.exit(1);
  }
}

runAll();
