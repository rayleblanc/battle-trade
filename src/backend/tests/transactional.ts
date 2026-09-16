import assert from 'node:assert';
import { BattleTradeDB } from '../modules/database';
import { OrderEntity, PositionEntity, BalanceLedgerEntity } from '../types/db';
import { AdapterRegistry } from '../modules/adapters';
import { MarketIngestionEngine, TokenDiscoveryEngine, CandidateRankingEngine } from '../modules/market';
import { SecurityEngine } from '../modules/security';
import { ChainId } from '../../shared/types';
import {
  calculateEMA,
  calculateRSI,
  calculateATR,
  calculateReturns,
  calculateRealizedVolatility,
  calculateVWAP,
  calculateZScore,
  FullFeatureEngine,
  FEATURE_SCHEMA_VERSION
} from '../modules/features';
import {
  DeterministicRegimeEngine,
  StrategyEngine,
  MetaEnsembleEngine,
  BacktestStrategyRunner
} from '../modules/strategy';

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
  assert.ok(report.compositeScore >= 0 && report.compositeScore <= 100);
  assert.ok(report.contractAnalysis);
  assert.ok(report.sellability);
  assert.ok(report.liquidity);

  console.log('✅ Security & Tradability Engine tests passed!');
}

function testFeatureEngineMath() {
  console.log('🧪 Running Feature Engine Mathematical tests...');

  // 1. EMA test
  const prices = [10, 11, 12, 13, 14, 15];
  const ema3 = calculateEMA(prices, 3);
  assert.strictEqual(ema3.length, 6);
  assert.ok(ema3[ema3.length - 1] > 13.5, 'EMA should weight recent prices higher');

  // 2. RSI test
  const rsiCloses = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38];
  const rsiVal = calculateRSI(rsiCloses, 14);
  assert.strictEqual(rsiVal, 100, 'Consistently rising series should yield RSI 100');

  // 3. ATR test
  const highs = [10, 11, 12, 13, 14];
  const lows = [8, 9, 10, 11, 12];
  const closes = [9, 10, 11, 12, 13];
  const atr = calculateATR(highs, lows, closes, 3);
  assert.ok(atr > 0, 'ATR must be positive');

  // 4. Returns & Volatility test
  const rets = calculateReturns([100, 110]);
  assert.strictEqual(Number(rets.simple.toFixed(2)), 0.10);
  assert.strictEqual(Number(rets.log.toFixed(4)), Number(Math.log(1.1).toFixed(4)));

  const vol = calculateRealizedVolatility([10, 10.5, 10.2, 10.8, 10.4], 5);
  assert.ok(vol > 0, 'Realized volatility must be positive for fluctuating prices');

  // 5. VWAP test
  const candles = [
    { high: 105, low: 95, close: 100, volume: 1000 },
    { high: 115, low: 105, close: 110, volume: 2000 }
  ];
  const vwap = calculateVWAP(candles);
  assert.ok(vwap > 100 && vwap < 112, 'VWAP should sit between weighted prices');

  // 6. Z-Score test
  const history = [10, 10, 10, 10, 10, 20];
  const zScore = calculateZScore(20, history);
  assert.ok(zScore > 1.5, 'Value far above mean should yield positive z-score');

  // 7. Full Feature Vector test (No Data Leakage check)
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
    [],
    { source: 'test', timestamp: 2000, chain: 'base', confidence: 1, freshness: 1, tokenAddress: '0x123', priceUsd: 1.1, liquidityUsd: 50000, volume24h: 10000, priceChange24h: 10 },
    { btcReturn24h: 1.5, btcVolatility24h: 0.02, ethReturn24h: 1.2, bnbReturn24h: 0.5, solReturn24h: 3.0, dexGlobalVolume24h: 1e9, chainActivityIndex: 85, gasPriceGwei: 0.1, marketBreadthScore: 70 }
  );

  assert.strictEqual(vector.feature_schema_version, FEATURE_SCHEMA_VERSION);
  assert.strictEqual(vector.tokenAddress, '0x123');
  assert.ok(vector.price);
  assert.ok(vector.technical);
  assert.ok(vector.volume);
  assert.ok(vector.flow);
  assert.ok(vector.liquidity);
  assert.ok(vector.microstructure);
  assert.ok(vector.smartMoney);
  assert.ok(vector.macro);
  assert.ok(vector.meme);
  assert.ok(vector.normalized);

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
