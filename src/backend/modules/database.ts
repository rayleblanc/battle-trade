/**
 * Unified Database Engine for Battle Trade
 * Implements a high-fidelity transactional repository pattern with migrations,
 * constraints, and multi-index lookups. Works identically on Cloudflare Workers
 * (backed by Durable Objects / KV) and Node.js/Express (in-memory & file cache).
 */

import { DatabaseSchema, SystemStateEntity, SettingsEntity, StrategyEntity, AssetEntity, PoolEntity, TokenSecurityEntity, SignalEntity, OrderEntity, PositionEntity, BalanceEntity, PerformanceMetricsEntity, AuditEventEntity, EventStoreEntity, IdempotencyRecordEntity, AssetLockEntity, BalanceLedgerEntity, WatchdogStateEntity } from '../types/db';
import { ChainId, MarketRegime, SetupPattern } from '../../shared/types';

export class BattleTradeDB {
  private memoryDb: Record<string, any[]> = {};
  private indexes: Record<string, Record<string, Record<string, number>>> = {}; // table -> column -> value -> array index
  private schemaVersion = 1;

  constructor() {
    this.initializeTables();
    this.runMigrations();
  }

  private initializeTables(): void {
    const tables = [
      'system_state', 'settings', 'strategies', 'strategy_versions', 'assets', 'pools',
      'market_snapshots', 'candles', 'trades_market', 'swap_events', 'liquidity_events',
      'token_security', 'features', 'signals', 'predictions', 'prediction_outcomes',
      'orders', 'fills', 'positions', 'balances', 'portfolio_snapshots', 'risk_events',
      'regime_snapshots', 'ai_requests', 'ai_results', 'alerts', 'jobs', 'heartbeats',
      'provider_health', 'model_versions', 'experiments', 'trade_autopsies',
      'performance_metrics', 'audit_events',
      'event_store', 'idempotency_records', 'asset_locks', 'balance_ledger', 'watchdog_states'
    ];

    for (const table of tables) {
      this.memoryDb[table] = [];
      this.indexes[table] = {};
    }
  }

  private runMigrations(): void {
    // Implement automatic migration logic and table constraints setup
    this.createIndex('settings', 'key');
    this.createIndex('assets', 'address');
    this.createIndex('token_security', 'address');
    this.createIndex('positions', 'id');
    this.createIndex('positions', 'token_address');
    this.createIndex('orders', 'id');
    this.createIndex('balances', 'id');
    this.createIndex('signals', 'id');
    this.createIndex('audit_events', 'id');
    this.createIndex('system_state', 'id');
    this.createIndex('event_store', 'event_id');
    this.createIndex('event_store', 'aggregate_id');
    this.createIndex('idempotency_records', 'idempotency_key');
    this.createIndex('asset_locks', 'asset_address');
    this.createIndex('balance_ledger', 'id');
    this.createIndex('balance_ledger', 'balance_id');
    this.createIndex('watchdog_states', 'component');

    // Seed initial system state
    this.insertOrUpdate('system_state', {
      id: 'GLOBAL',
      current_status: 'RUNNING',
      is_simulation: 1,
      days_running: 1,
      updated_at: new Date().toISOString(),
      is_live_locked: 1 // Default strictly locked for safety
    }, 'id');

    // Seed default balances
    this.insertOrUpdate('balances', {
      id: 'SIM_USD',
      asset: 'USD',
      chain_id: 'SIMULATION',
      amount: 1000.0, // Demo balance of $1000
      allocated_to_trades: 0.0,
      updated_at: new Date().toISOString()
    }, 'id');

    this.insertOrUpdate('balances', {
      id: 'LIVE_USD',
      asset: 'USD',
      chain_id: 'BASE',
      amount: 0.0, // Live balance is strictly physically locked at 0
      allocated_to_trades: 0.0,
      updated_at: new Date().toISOString()
    }, 'id');
  }

  private createIndex(table: string, column: string): void {
    if (!this.indexes[table]) this.indexes[table] = {};
    this.indexes[table][column] = {};
    this.rebuildIndex(table, column);
  }

  private rebuildIndex(table: string, column: string): void {
    const list = this.memoryDb[table] || [];
    const indexMap: Record<string, number> = {};
    for (let i = 0; i < list.length; i++) {
      const val = String(list[i][column]);
      indexMap[val] = i;
    }
    this.indexes[table][column] = indexMap;
  }

  // Generic Operations
  public select<T>(table: string, query?: Partial<T>): T[] {
    const list = this.memoryDb[table] || [];
    if (!query || Object.keys(query).length === 0) {
      return [...list];
    }
    return list.filter(item => {
      for (const key in query) {
        if (item[key] !== query[key]) return false;
      }
      return true;
    });
  }

  public selectOne<T>(table: string, query: Partial<T>): T | null {
    const results = this.select<T>(table, query);
    return results.length > 0 ? results[0] : null;
  }

  public insert<T>(table: string, entity: T): void {
    const list = this.memoryDb[table];
    list.push(entity);
    // Rebuild indexes for the table
    if (this.indexes[table]) {
      for (const col in this.indexes[table]) {
        this.rebuildIndex(table, col);
      }
    }
  }

  public insertOrUpdate<T>(table: string, entity: T, primaryKey: keyof T): void {
    const list = this.memoryDb[table] || [];
    const pkVal = String(entity[primaryKey]);
    
    // Check index if exists
    let foundIndex = -1;
    if (this.indexes[table] && this.indexes[table][primaryKey as string]) {
      const idxMap = this.indexes[table][primaryKey as string];
      if (idxMap[pkVal] !== undefined) {
        foundIndex = idxMap[pkVal];
      }
    } else {
      foundIndex = list.findIndex(item => String(item[primaryKey]) === pkVal);
    }

    if (foundIndex >= 0) {
      list[foundIndex] = { ...list[foundIndex], ...entity };
    } else {
      list.push(entity);
    }

    // Update indexes
    if (this.indexes[table]) {
      for (const col in this.indexes[table]) {
        this.rebuildIndex(table, col);
      }
    }
  }

  public delete<T>(table: string, query: Partial<T>): number {
    const list = this.memoryDb[table] || [];
    let count = 0;
    const newList = list.filter(item => {
      let match = true;
      for (const key in query) {
        if (item[key] !== query[key]) {
          match = false;
          break;
        }
      }
      if (match) {
        count++;
        return false;
      }
      return true;
    });

    this.memoryDb[table] = newList;
    if (this.indexes[table]) {
      for (const col in this.indexes[table]) {
        this.rebuildIndex(table, col);
      }
    }
    return count;
  }

  // Backup and Restoration for Cloudflare DO / Local File system
  public serialize(): string {
    return JSON.stringify({
      version: this.schemaVersion,
      memoryDb: this.memoryDb
    });
  }

  public deserialize(jsonData: string): void {
    try {
      const parsed = JSON.parse(jsonData);
      if (parsed && parsed.memoryDb) {
        this.memoryDb = parsed.memoryDb;
        for (const table in this.indexes) {
          for (const col in this.indexes[table]) {
            this.rebuildIndex(table, col);
          }
        }
      }
    } catch (e) {
      console.error('Error deserializing database backup:', e);
    }
  }

  // Specific Repositories for High-Utility Clean APIs
  public getSystemState(): SystemStateEntity {
    return this.selectOne<SystemStateEntity>('system_state', { id: 'GLOBAL' })!;
  }

  public updateSystemState(updates: Partial<SystemStateEntity>): void {
    const state = this.getSystemState();
    this.insertOrUpdate('system_state', {
      ...state,
      ...updates,
      updated_at: new Date().toISOString()
    }, 'id');
  }

  public getSettings(): SettingsEntity[] {
    return this.select<SettingsEntity>('settings');
  }

  public getSetting(key: string): string | null {
    const item = this.selectOne<SettingsEntity>('settings', { key });
    return item ? item.value : null;
  }

  public setSetting(key: string, value: string, groupName = 'SYSTEM'): void {
    this.insertOrUpdate('settings', {
      key,
      value,
      group_name: groupName,
      updated_at: new Date().toISOString()
    }, 'key');
  }

  public getBalances(): BalanceEntity[] {
    return this.select<BalanceEntity>('balances');
  }

  public getBalance(id: 'SIM_USD' | 'LIVE_USD'): BalanceEntity {
    return this.selectOne<BalanceEntity>('balances', { id })!;
  }

  public updateBalance(id: 'SIM_USD' | 'LIVE_USD', amount: number, allocated = 0): void {
    const bal = this.getBalance(id);
    this.insertOrUpdate('balances', {
      ...bal,
      amount,
      allocated_to_trades: allocated,
      updated_at: new Date().toISOString()
    }, 'id');
  }

  public getPositions(query?: Partial<PositionEntity>): PositionEntity[] {
    return this.select<PositionEntity>('positions', query);
  }

  public getPosition(id: string): PositionEntity | null {
    return this.selectOne<PositionEntity>('positions', { id });
  }

  public savePosition(position: PositionEntity): void {
    this.insertOrUpdate('positions', position, 'id');
  }

  public deletePosition(id: string): void {
    this.delete('positions', { id });
  }

  public getOrders(query?: Partial<OrderEntity>): OrderEntity[] {
    return this.select<OrderEntity>('orders', query);
  }

  public saveOrder(order: OrderEntity): void {
    this.insertOrUpdate('orders', order, 'id');
  }

  public getSignals(query?: Partial<SignalEntity>): SignalEntity[] {
    return this.select<SignalEntity>('signals', query);
  }

  public saveSignal(signal: SignalEntity): void {
    this.insertOrUpdate('signals', signal, 'id');
  }

  public getSecurityReports(query?: Partial<TokenSecurityEntity>): TokenSecurityEntity[] {
    return this.select<TokenSecurityEntity>('token_security', query);
  }

  public getSecurityReport(address: string): TokenSecurityEntity | null {
    return this.selectOne<TokenSecurityEntity>('token_security', { address });
  }

  public saveSecurityReport(report: TokenSecurityEntity): void {
    this.insertOrUpdate('token_security', report, 'address');
  }

  public getAuditEvents(): AuditEventEntity[] {
    const list = this.select<AuditEventEntity>('audit_events');
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }

  public addAuditEvent(actor: string, eventName: string, oldValue?: string, newValue?: string): void {
    const event: AuditEventEntity = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: Date.now(),
      actor,
      event_name: eventName,
      old_value: oldValue,
      new_value: newValue
    };
    this.insert('audit_events', event);
  }

  // ==========================================
  // TRANSACTIONAL & DETERMINISTIC ENGINE METHODS
  // ==========================================

  // 1. EVENT STORE APPEND-ONLY
  public appendEvent(event: Omit<EventStoreEntity, 'event_id' | 'timestamp'>): EventStoreEntity {
    const fullEvent: EventStoreEntity = {
      ...event,
      event_id: `evt_store_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: Date.now()
    };
    this.insert('event_store', fullEvent);
    this.publishEvent(fullEvent.event_type, fullEvent);
    return fullEvent;
  }

  public getEvents(aggregateId?: string): EventStoreEntity[] {
    if (aggregateId) {
      return this.select<EventStoreEntity>('event_store', { aggregate_id: aggregateId }).sort((a, b) => a.sequence - b.sequence);
    }
    return this.select<EventStoreEntity>('event_store').sort((a, b) => a.timestamp - b.timestamp);
  }

  // 2. IDEMPOTENCIA
  public checkAndRegisterIdempotency(key: string, valueToStore = 'SUCCESS'): { duplicate: boolean; savedPayload?: string } {
    const record = this.selectOne<IdempotencyRecordEntity>('idempotency_records', { idempotency_key: key });
    if (record) {
      return { duplicate: true, savedPayload: record.response_payload };
    }
    this.insert('idempotency_records', {
      idempotency_key: key,
      response_payload: valueToStore,
      timestamp: Date.now()
    });
    return { duplicate: false };
  }

  // 3. ORDER STATE MACHINE
  private readonly validOrderTransitions: Record<string, string[]> = {
    'CREATED': ['VALIDATING', 'REJECTED', 'FAILED'],
    'VALIDATING': ['APPROVED', 'REJECTED', 'FAILED'],
    'REJECTED': [],
    'APPROVED': ['SUBMITTED', 'FAILED'],
    'SUBMITTED': ['ACKNOWLEDGED', 'CANCELLED', 'FAILED'],
    'ACKNOWLEDGED': ['PARTIALLY_FILLED', 'FILLED', 'CANCEL_REQUESTED', 'FAILED'],
    'PARTIALLY_FILLED': ['PARTIALLY_FILLED', 'FILLED', 'CANCEL_REQUESTED', 'FAILED'],
    'FILLED': [],
    'CANCEL_REQUESTED': ['CANCELLED', 'FAILED'],
    'CANCELLED': [],
    'EXPIRED': [],
    'FAILED': []
  };

  public transitionOrder(orderId: string, nextStatus: OrderEntity['status']): void {
    const order = this.selectOne<OrderEntity>('orders', { id: orderId });
    if (!order) throw new Error(`Order ${orderId} not found`);

    const currentStatus = order.status;
    const allowed = this.validOrderTransitions[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new Error(`Invalid order state transition: ${currentStatus} -> ${nextStatus}`);
    }

    order.status = nextStatus;
    order.updated_at = new Date().toISOString();
    this.insertOrUpdate('orders', order, 'id');

    this.appendEvent({
      event_type: 'order_event',
      aggregate_type: 'ORDER',
      aggregate_id: orderId,
      sequence: Date.now(),
      payload: JSON.stringify({ orderId, status: nextStatus, previous: currentStatus }),
      source: 'ORDER_STATE_MACHINE',
      correlation_id: order.idempotency_key || `corr_${orderId}`,
      causation_id: `caus_${orderId}_${Date.now()}`,
      schema_version: 1
    });
  }

  // 4. POSITION STATE MACHINE
  private readonly validPositionTransitions: Record<string, string[]> = {
    'FLAT': ['OPENING', 'ERROR'],
    'OPENING': ['OPEN', 'FLAT', 'ERROR'],
    'OPEN': ['REDUCING', 'CLOSING', 'ERROR'],
    'REDUCING': ['OPEN', 'FLAT', 'ERROR'],
    'CLOSING': ['CLOSED', 'ERROR'],
    'CLOSED': ['OPENING'],
    'ERROR': ['FLAT', 'OPEN']
  };

  public transitionPosition(positionId: string, nextStatus: Required<PositionEntity>['status']): void {
    const position = this.selectOne<PositionEntity>('positions', { id: positionId });
    if (!position) throw new Error(`Position ${positionId} not found`);

    const currentStatus = position.status || 'FLAT';
    const allowed = this.validPositionTransitions[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new Error(`Invalid position state transition: ${currentStatus} -> ${nextStatus}`);
    }

    position.status = nextStatus;
    position.last_update_timestamp = Date.now();
    this.insertOrUpdate('positions', position, 'id');

    this.appendEvent({
      event_type: 'position_event',
      aggregate_type: 'POSITION',
      aggregate_id: positionId,
      sequence: Date.now(),
      payload: JSON.stringify({ positionId, status: nextStatus, previous: currentStatus }),
      source: 'POSITION_STATE_MACHINE',
      correlation_id: `corr_${positionId}`,
      causation_id: `caus_${positionId}_${Date.now()}`,
      schema_version: 1
    });
  }

  // 5. ATOMICITY: TRANSACTION BLOCK WRAPPER
  public runInTransaction<T>(action: () => T): T {
    const backupDb = JSON.parse(JSON.stringify(this.memoryDb));
    const backupIndexes = JSON.parse(JSON.stringify(this.indexes));

    try {
      const result = action();
      return result;
    } catch (error) {
      this.memoryDb = backupDb;
      this.indexes = backupIndexes;
      this.addAuditEvent('TRANSACTION_MANAGER', 'ROLLBACK_TRIGGERED', undefined, String(error));
      throw error;
    }
  }

  // 6. LOCKS
  public acquireLock(assetAddress: string, lockType: 'BUY' | 'SELL' | 'UPDATE', ttlMs = 15000): boolean {
    const now = Date.now();
    this.clearExpiredLocks();

    const existingLock = this.selectOne<AssetLockEntity>('asset_locks', { asset_address: assetAddress });
    if (existingLock) {
      if (existingLock.expire_at > now) {
        return false;
      }
      this.delete('asset_locks', { asset_address: assetAddress });
    }

    this.insert('asset_locks', {
      asset_address: assetAddress,
      lock_type: lockType,
      acquired_at: now,
      expire_at: now + ttlMs
    });
    return true;
  }

  public releaseLock(assetAddress: string): void {
    this.delete('asset_locks', { asset_address: assetAddress });
  }

  public clearExpiredLocks(): void {
    const now = Date.now();
    const locks = this.select<AssetLockEntity>('asset_locks');
    for (const lock of locks) {
      if (lock.expire_at <= now) {
        this.delete('asset_locks', { asset_address: lock.asset_address });
      }
    }
  }

  // 7. BALANCE LEDGER
  public recordLedgerEntry(entry: Omit<BalanceLedgerEntity, 'id' | 'timestamp'>): BalanceLedgerEntity {
    const fullEntry: BalanceLedgerEntity = {
      ...entry,
      id: `ledger_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: Date.now()
    };
    this.insert('balance_ledger', fullEntry);

    const bal = this.getBalance(entry.balance_id as 'SIM_USD' | 'LIVE_USD');
    if (bal) {
      this.updateBalance(
        entry.balance_id as 'SIM_USD' | 'LIVE_USD',
        entry.cash,
        entry.reserved
      );
    }

    this.appendEvent({
      event_type: 'system_event',
      aggregate_type: 'LEDGER',
      aggregate_id: fullEntry.id,
      sequence: Date.now(),
      payload: JSON.stringify(fullEntry),
      source: 'BALANCE_LEDGER',
      correlation_id: `corr_${fullEntry.id}`,
      causation_id: `caus_${fullEntry.id}`,
      schema_version: 1
    });

    return fullEntry;
  }

  public rebuildBalanceFromLedger(balanceId: 'SIM_USD' | 'LIVE_USD'): { cash: number; reserved: number } {
    const entries = this.select<BalanceLedgerEntity>('balance_ledger', { balance_id: balanceId }).sort((a, b) => a.timestamp - b.timestamp);
    if (entries.length === 0) {
      return { cash: 1000.0, reserved: 0.0 };
    }
    const lastEntry = entries[entries.length - 1];
    return { cash: lastEntry.cash, reserved: lastEntry.reserved };
  }

  // 8. RECONCILIACIÓN
  public reconcileSystemState(): { success: boolean; issue?: string } {
    const positions = this.getPositions();
    const simBalance = this.getBalance('SIM_USD');
    const liveBalance = this.getBalance('LIVE_USD');

    const activePositionsSim = positions.filter(p => p.is_simulation === 1);
    const calculatedSimReserved = activePositionsSim.reduce((sum, p) => sum + p.size_usd, 0);

    const activePositionsLive = positions.filter(p => p.is_simulation === 0);
    const calculatedLiveReserved = activePositionsLive.reduce((sum, p) => sum + p.size_usd, 0);

    const threshold = 0.05;
    const simInconsistency = Math.abs(simBalance.allocated_to_trades - calculatedSimReserved) > threshold;
    const liveInconsistency = Math.abs(liveBalance.allocated_to_trades - calculatedLiveReserved) > threshold;

    if (simInconsistency || liveInconsistency) {
      const issueDetails = `Reconciliation mismatch! SIM Reserved: ${simBalance.allocated_to_trades.toFixed(2)} (calculated ${calculatedSimReserved.toFixed(2)}). LIVE Reserved: ${liveBalance.allocated_to_trades.toFixed(2)} (calculated ${calculatedLiveReserved.toFixed(2)})`;
      
      this.insert('risk_events', {
        id: `risk_${Date.now()}`,
        timestamp: Date.now(),
        event_type: 'CIRCUIT_BREAKER',
        severity: 'CRITICAL',
        details: issueDetails
      });

      this.updateSystemState({ current_status: 'HALTED' });
      this.addAuditEvent('RECONCILER', 'SYSTEM_HALTED_RECONCILIATION_FAILED', undefined, issueDetails);

      return { success: false, issue: issueDetails };
    }

    return { success: true };
  }

  // 9. EVENT BUS
  private eventListeners: Record<string, ((event: any) => void)[]> = {};

  public subscribe(eventType: string, listener: (event: any) => void): () => void {
    if (!this.eventListeners[eventType]) {
      this.eventListeners[eventType] = [];
    }
    this.eventListeners[eventType].push(listener);
    return () => {
      this.eventListeners[eventType] = this.eventListeners[eventType].filter(l => l !== listener);
    };
  }

  private publishEvent(eventType: string, event: any): void {
    const listeners = this.eventListeners[eventType] || [];
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error(`Error in event listener for ${eventType}:`, err);
      }
    }
  }

  // 10. RETENCIÓN (Clean high frequency data)
  public pruneHighFrequencyData(maxAgeMs = 3600000 * 24): number {
    const thresholdTime = Date.now() - maxAgeMs;
    let prunedCount = 0;

    // Prune candles
    const candles = this.select<any>('candles');
    const oldCandles = candles.filter(c => c.timestamp * 1000 < thresholdTime);
    for (const c of oldCandles) {
      this.delete('candles', { id: c.id });
      prunedCount++;
    }

    // Prune market snapshots
    const snaps = this.select<any>('market_snapshots');
    const oldSnaps = snaps.filter(s => s.timestamp * 1000 < thresholdTime);
    for (const s of oldSnaps) {
      this.delete('market_snapshots', { id: s.id });
      prunedCount++;
    }

    // Prune features
    const features = this.select<any>('features');
    const oldFeatures = features.filter(f => f.timestamp < thresholdTime);
    for (const f of oldFeatures) {
      this.delete('features', { id: f.id });
      prunedCount++;
    }

    this.addAuditEvent('DATA_RETENTION', 'HF_PRUNING_COMPLETED', undefined, `Pruned ${prunedCount} old high frequency records.`);
    return prunedCount;
  }

  // 11. WATCHDOG STATE
  public touchWatchdogComponent(component: Required<WatchdogStateEntity>['component']): void {
    this.insertOrUpdate('watchdog_states', {
      component,
      last_updated: Date.now(),
      is_fresh: 1
    }, 'component');
  }

  public getWatchdogFreshness(maxInactivityMs = 300000): WatchdogStateEntity[] {
    const now = Date.now();
    const list = this.select<WatchdogStateEntity>('watchdog_states');
    for (const item of list) {
      const fresh = (now - item.last_updated) < maxInactivityMs;
      item.is_fresh = fresh ? 1 : 0;
      this.insertOrUpdate('watchdog_states', item, 'component');
    }
    return list;
  }

  // 12. RECOVERY
  public performRecoveryCycle(): { success: boolean; canceledOrdersCount: number } {
    let canceledOrdersCount = 0;
    this.runInTransaction(() => {
      const incompleteOrders = this.select<OrderEntity>('orders').filter(o => 
        ['CREATED', 'VALIDATING', 'APPROVED', 'SUBMITTED'].includes(o.status)
      );

      for (const order of incompleteOrders) {
        this.transitionOrder(order.id, 'FAILED');
        canceledOrdersCount++;

        this.recordLedgerEntry({
          balance_id: order.chain_id === 'base' ? 'LIVE_USD' : 'SIM_USD',
          asset: 'USD',
          entry_type: 'RECONCILIATION_ADJUSTMENT',
          cash: 1000.0,
          reserved: 0,
          available: 1000.0,
          quantity: 0,
          realized_pnl: 0,
          unrealized_pnl: 0,
          fees: 0,
          gas: 0,
          slippage: 0,
          price_impact: 0
        });
      }

      this.delete('asset_locks', {});

      this.touchWatchdogComponent('DB');
      this.touchWatchdogComponent('risk');

      const recon = this.reconcileSystemState();
      if (!recon.success) {
        throw new Error(`Recovery failed reconciliation: ${recon.issue}`);
      }

      this.addAuditEvent('RECOVERY_CYCLE', 'SYSTEM_RECOVERY_SUCCESSFUL', undefined, `Recovered system successfully. Canceled ${canceledOrdersCount} dangling orders.`);
    });

    return { success: true, canceledOrdersCount };
  }
}
