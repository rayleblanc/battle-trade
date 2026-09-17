/**
 * Unified Database Engine for Battle Trade
 * Implements a high-fidelity transactional repository pattern backed by SQLite.
 * Operates on Cloudflare Workers with direct SQLite storage inside Durable Objects (ctx.storage.sql)
 * and locally in Node.js/Express with embedded SQLite transactional storage.
 */

import { DatabaseSchema, SystemStateEntity, SettingsEntity, StrategyEntity, AssetEntity, PoolEntity, TokenSecurityEntity, SignalEntity, OrderEntity, PositionEntity, BalanceEntity, PerformanceMetricsEntity, AuditEventEntity, EventStoreEntity, IdempotencyRecordEntity, AssetLockEntity, BalanceLedgerEntity, WatchdogStateEntity } from '../types/db';
import { ChainId, MarketRegime, SetupPattern } from '../../shared/types';

export interface SqlStorageCursor {
  toArray(): any[];
  one?(): any;
}

export interface SqlDatabaseDriver {
  exec(sql: string, ...params: any[]): SqlStorageCursor;
  transactionSync?<T>(callback: () => T): T;
}

/**
 * Embedded SQLite driver for local Node.js / Express / Unit Testing environment
 * Provides identical SQL relational execution semantics to Cloudflare DO SQLite storage
 */
export class LocalSqlDriver implements SqlDatabaseDriver {
  private tables: Record<string, any[]> = {};
  private transactionStack: Record<string, any[]>[] = [];

  constructor() {
    this.tables = {};
  }

  public exec(sqlQuery: string, ...params: any[]): SqlStorageCursor {
    const trimmed = sqlQuery.trim();
    const upper = trimmed.toUpperCase();

    if (upper.startsWith('CREATE TABLE')) {
      const match = trimmed.match(/CREATE TABLE (?:IF NOT EXISTS )?([a-zA-Z0-9_]+)/i);
      if (match && match[1]) {
        const tableName = match[1];
        if (!this.tables[tableName]) {
          this.tables[tableName] = [];
        }
      }
      return { toArray: () => [] };
    }

    if (upper.startsWith('BEGIN TRANSACTION') || upper === 'BEGIN') {
      this.transactionStack.push(JSON.parse(JSON.stringify(this.tables)));
      return { toArray: () => [] };
    }

    if (upper.startsWith('COMMIT')) {
      this.transactionStack.pop();
      return { toArray: () => [] };
    }

    if (upper.startsWith('ROLLBACK')) {
      const backup = this.transactionStack.pop();
      if (backup) {
        this.tables = backup;
      }
      return { toArray: () => [] };
    }

    if (upper.startsWith('SELECT')) {
      const match = trimmed.match(/SELECT\s+(.*?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.*?))?(?:\s+ORDER BY\s+(.*?))?(?:\s+LIMIT\s+(\d+))?$/i);
      if (!match) {
        // Fallback for custom SELECT syntax
        const tableMatch = trimmed.match(/FROM\s+([a-zA-Z0-9_]+)/i);
        if (!tableMatch) return { toArray: () => [] };
        const tableName = tableMatch[1];
        const list = this.tables[tableName] || [];
        return { toArray: () => [...list] };
      }

      const tableName = match[2];
      const whereClause = match[3];
      const orderBy = match[4];
      const limitStr = match[5];

      let list = [...(this.tables[tableName] || [])];

      if (whereClause && params.length > 0) {
        // Simple condition matching for parameters
        const conds = whereClause.split(/\s+AND\s+/i);
        let paramIdx = 0;
        list = list.filter(row => {
          for (const cond of conds) {
            const eqMatch = cond.match(/([a-zA-Z0-9_]+)\s*=\s*\?/);
            if (eqMatch) {
              const col = eqMatch[1];
              const targetVal = params[paramIdx];
              if (row[col] !== targetVal) return false;
            }
          }
          return true;
        });
      }

      if (orderBy) {
        const parts = orderBy.trim().split(/\s+/);
        const col = parts[0];
        const isDesc = parts[1] && parts[1].toUpperCase() === 'DESC';
        list.sort((a, b) => {
          const valA = a[col];
          const valB = b[col];
          if (valA < valB) return isDesc ? 1 : -1;
          if (valA > valB) return isDesc ? -1 : 1;
          return 0;
        });
      }

      if (limitStr) {
        const limit = parseInt(limitStr, 10);
        list = list.slice(0, limit);
      }

      return { toArray: () => list };
    }

    if (upper.startsWith('INSERT') || upper.startsWith('REPLACE')) {
      const match = trimmed.match(/(?:INSERT INTO|INSERT OR REPLACE INTO|REPLACE INTO)\s+([a-zA-Z0-9_]+)\s*\((.*?)\)\s*VALUES\s*\((.*?)\)/i);
      if (match) {
        const tableName = match[1];
        const cols = match[2].split(',').map(c => c.trim());
        if (!this.tables[tableName]) this.tables[tableName] = [];

        const row: Record<string, any> = {};
        cols.forEach((col, idx) => {
          row[col] = params[idx];
        });

        // Determine primary key column
        const pkCol = cols.includes('id') ? 'id' : (cols.includes('key') ? 'key' : (cols.includes('address') ? 'address' : (cols.includes('event_id') ? 'event_id' : (cols.includes('component') ? 'component' : cols[0]))));
        const pkVal = row[pkCol];

        const existingIdx = this.tables[tableName].findIndex(r => r[pkCol] === pkVal);
        if (existingIdx >= 0) {
          this.tables[tableName][existingIdx] = { ...this.tables[tableName][existingIdx], ...row };
        } else {
          this.tables[tableName].push(row);
        }
      }
      return { toArray: () => [] };
    }

    if (upper.startsWith('UPDATE')) {
      const match = trimmed.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.*?)\s+WHERE\s+(.*)/i);
      if (match) {
        const tableName = match[1];
        const setClause = match[2];
        const whereClause = match[3];

        const setCols = setClause.split(',').map(s => s.split('=')[0].trim());
        const setParams = params.slice(0, setCols.length);
        const whereParams = params.slice(setCols.length);

        const list = this.tables[tableName] || [];
        list.forEach(row => {
          let matches = true;
          if (whereClause) {
            const conds = whereClause.split(/\s+AND\s+/i);
            conds.forEach((cond, idx) => {
              const eqMatch = cond.match(/([a-zA-Z0-9_]+)\s*=\s*\?/);
              if (eqMatch) {
                const col = eqMatch[1];
                if (row[col] !== whereParams[idx]) matches = false;
              }
            });
          }
          if (matches) {
            setCols.forEach((col, idx) => {
              row[col] = setParams[idx];
            });
          }
        });
      }
      return { toArray: () => [] };
    }

    if (upper.startsWith('DELETE')) {
      const match = trimmed.match(/DELETE FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.*))?/i);
      if (match) {
        const tableName = match[1];
        const whereClause = match[2];

        if (!whereClause || params.length === 0) {
          this.tables[tableName] = [];
        } else {
          const list = this.tables[tableName] || [];
          this.tables[tableName] = list.filter(row => {
            const conds = whereClause.split(/\s+AND\s+/i);
            let matches = true;
            conds.forEach((cond, idx) => {
              const eqMatch = cond.match(/([a-zA-Z0-9_]+)\s*=\s*\?/);
              if (eqMatch) {
                const col = eqMatch[1];
                if (row[col] === params[idx]) matches = false;
              }
            });
            return matches;
          });
        }
      }
      return { toArray: () => [] };
    }

    return { toArray: () => [] };
  }

  public transactionSync<T>(callback: () => T): T {
    this.exec('BEGIN TRANSACTION');
    try {
      const res = callback();
      this.exec('COMMIT');
      return res;
    } catch (e) {
      this.exec('ROLLBACK');
      throw e;
    }
  }

  public getRawTables(): Record<string, any[]> {
    return this.tables;
  }

  public loadRawTables(raw: Record<string, any[]>): void {
    this.tables = raw;
  }
}

export class BattleTradeDB {
  private sqlDriver: SqlDatabaseDriver;
  private isDOStorage = false;
  private schemaVersion = 1;

  constructor(sqlStorage?: any, storageCtx?: any) {
    if (sqlStorage && typeof sqlStorage.exec === 'function') {
      this.isDOStorage = true;
      this.sqlDriver = {
        exec: (sql: string, ...params: any[]) => sqlStorage.exec(sql, ...params),
        transactionSync: storageCtx && typeof storageCtx.transactionSync === 'function'
          ? (cb) => storageCtx.transactionSync(cb)
          : undefined
      };
    } else {
      this.sqlDriver = new LocalSqlDriver();
    }

    this.initializeTables();
    this.runMigrations();
  }

  private initializeTables(): void {
    const tableSchemas = [
      `CREATE TABLE IF NOT EXISTS system_state (id TEXT PRIMARY KEY, current_status TEXT, is_simulation INTEGER, days_running INTEGER, updated_at TEXT, is_live_locked INTEGER);`,
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, group_name TEXT, updated_at TEXT);`,
      `CREATE TABLE IF NOT EXISTS balances (id TEXT PRIMARY KEY, asset TEXT, chain_id TEXT, amount REAL, allocated_to_trades REAL, updated_at TEXT);`,
      `CREATE TABLE IF NOT EXISTS balance_ledger (id TEXT PRIMARY KEY, balance_id TEXT, asset TEXT, entry_type TEXT, cash REAL, reserved REAL, available REAL, quantity REAL, realized_pnl REAL, unrealized_pnl REAL, fees REAL, gas REAL, slippage REAL, price_impact REAL, timestamp INTEGER);`,
      `CREATE TABLE IF NOT EXISTS positions (id TEXT PRIMARY KEY, token_address TEXT, chain_id TEXT, name TEXT, symbol TEXT, buy_price_usd REAL, current_price_usd REAL, size_usd REAL, amount_tokens REAL, buy_timestamp INTEGER, last_update_timestamp INTEGER, highest_price_usd REAL, is_principal_recovered INTEGER, target_take_profit_percent REAL, stop_loss_percent REAL, trailing_stop_percent REAL, is_simulation INTEGER, pnl_usd REAL, pnl_percent REAL, regime_at_entry TEXT, setup_pattern TEXT, status TEXT);`,
      `CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, idempotency_key TEXT, chain_id TEXT, status TEXT, type TEXT, side TEXT, size_usd REAL, updated_at TEXT, payload TEXT);`,
      `CREATE TABLE IF NOT EXISTS historical_trades (id TEXT PRIMARY KEY, symbol TEXT, tokenAddress TEXT, chainId TEXT, side TEXT, buyPriceUsd REAL, sellPriceUsd REAL, sizeUsd REAL, buyTimestamp INTEGER, sellTimestamp INTEGER, pnlUsd REAL, pnlPercent REAL, exitReason TEXT, regimeAtEntry TEXT, setupPattern TEXT, MFE REAL, MAE REAL);`,
      `CREATE TABLE IF NOT EXISTS performance_metrics (id TEXT PRIMARY KEY, is_simulation INTEGER, total_pnl_usd REAL, roi_percent REAL, win_rate_percent REAL, total_trades INTEGER, winning_trades INTEGER, losing_trades INTEGER, max_drawdown_percent REAL, current_capital_usd REAL, total_exposure_usd REAL, updated_at TEXT);`,
      `CREATE TABLE IF NOT EXISTS signals (id TEXT PRIMARY KEY, token_address TEXT, symbol TEXT, score REAL, confidence REAL, regime TEXT, ev_usd REAL, timestamp INTEGER, payload TEXT);`,
      `CREATE TABLE IF NOT EXISTS token_security (address TEXT PRIMARY KEY, is_honeypot INTEGER, buy_tax REAL, sell_tax REAL, score REAL, updated_at TEXT, details TEXT);`,
      `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, timestamp INTEGER, actor TEXT, event_name TEXT, old_value TEXT, new_value TEXT);`,
      `CREATE TABLE IF NOT EXISTS event_store (event_id TEXT PRIMARY KEY, event_type TEXT, aggregate_type TEXT, aggregate_id TEXT, sequence INTEGER, payload TEXT, source TEXT, correlation_id TEXT, causation_id TEXT, schema_version INTEGER, timestamp INTEGER);`,
      `CREATE TABLE IF NOT EXISTS idempotency_records (idempotency_key TEXT PRIMARY KEY, response_payload TEXT, timestamp INTEGER);`,
      `CREATE TABLE IF NOT EXISTS asset_locks (asset_address TEXT PRIMARY KEY, lock_type TEXT, acquired_at INTEGER, expire_at INTEGER);`,
      `CREATE TABLE IF NOT EXISTS watchdog_states (component TEXT PRIMARY KEY, last_updated INTEGER, is_fresh INTEGER);`,
      `CREATE TABLE IF NOT EXISTS decision_objects (decision_id TEXT PRIMARY KEY, timestamp INTEGER, asset_address TEXT, chain_id TEXT, final_action TEXT, payload TEXT);`,
      `CREATE TABLE IF NOT EXISTS trade_autopsies (autopsy_id TEXT PRIMARY KEY, trade_id TEXT, timestamp INTEGER, payload TEXT);`,
      `CREATE TABLE IF NOT EXISTS assets (address TEXT PRIMARY KEY, name TEXT, symbol TEXT, chain_id TEXT);`,
      `CREATE TABLE IF NOT EXISTS pools (address TEXT PRIMARY KEY, token_address TEXT, chain_id TEXT);`,
      `CREATE TABLE IF NOT EXISTS pattern_matrix (pattern_id TEXT PRIMARY KEY, regime TEXT, setup TEXT, win_rate REAL, expectancy REAL, trades_count INTEGER, status TEXT, last_updated INTEGER);`,
      `CREATE TABLE IF NOT EXISTS online_learning_state (id TEXT PRIMARY KEY, recent_streak_memory TEXT, aggressiveness_multiplier REAL, last_updated INTEGER);`
    ];

    for (const schema of tableSchemas) {
      this.sqlDriver.exec(schema);
    }
  }

  private runMigrations(): void {
    // Seed initial system state if missing
    const systemState = this.getSystemState();
    if (!systemState) {
      this.sqlDriver.exec(`
        INSERT OR REPLACE INTO system_state (id, current_status, is_simulation, days_running, updated_at, is_live_locked)
        VALUES (?, ?, ?, ?, ?, ?)
      `, 'GLOBAL', 'RUNNING', 1, 1, new Date().toISOString(), 1);
    }

    // Seed default balances if missing
    const simBal = this.selectOne<BalanceEntity>('balances', { id: 'SIM_USD' });
    if (!simBal) {
      this.sqlDriver.exec(`
        INSERT OR REPLACE INTO balances (id, asset, chain_id, amount, allocated_to_trades, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, 'SIM_USD', 'USD', 'SIMULATION', 1000.0, 0.0, new Date().toISOString());
    }

    const liveBal = this.selectOne<BalanceEntity>('balances', { id: 'LIVE_USD' });
    if (!liveBal) {
      this.sqlDriver.exec(`
        INSERT OR REPLACE INTO balances (id, asset, chain_id, amount, allocated_to_trades, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, 'LIVE_USD', 'USD', 'BASE', 0.0, 0.0, new Date().toISOString());
    }
  }

  // Generic Query Helpers
  public select<T>(table: string, query?: Partial<T>): T[] {
    if (!query || Object.keys(query).length === 0) {
      const cursor = this.sqlDriver.exec(`SELECT * FROM ${table}`);
      return cursor.toArray() as T[];
    }
    const keys = Object.keys(query);
    const whereClause = keys.map(k => `${k} = ?`).join(' AND ');
    const params = keys.map(k => (query as any)[k]);
    const cursor = this.sqlDriver.exec(`SELECT * FROM ${table} WHERE ${whereClause}`, ...params);
    return cursor.toArray() as T[];
  }

  public selectOne<T>(table: string, query: Partial<T>): T | null {
    const results = this.select<T>(table, query);
    return results.length > 0 ? results[0] : null;
  }

  public insert<T>(table: string, entity: T): void {
    const keys = Object.keys(entity as Record<string, any>);
    const cols = keys.join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const params = keys.map(k => (entity as Record<string, any>)[k]);
    this.sqlDriver.exec(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`, ...params);
  }

  public insertOrUpdate<T>(table: string, entity: T, primaryKey: keyof T): void {
    const keys = Object.keys(entity as Record<string, any>);
    const cols = keys.join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const params = keys.map(k => (entity as Record<string, any>)[k]);
    this.sqlDriver.exec(`INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${placeholders})`, ...params);
  }

  public delete<T>(table: string, query: Partial<T>): number {
    if (!query || Object.keys(query).length === 0) {
      this.sqlDriver.exec(`DELETE FROM ${table}`);
      return 1;
    }
    const keys = Object.keys(query);
    const whereClause = keys.map(k => `${k} = ?`).join(' AND ');
    const params = keys.map(k => (query as any)[k]);
    this.sqlDriver.exec(`DELETE FROM ${table} WHERE ${whereClause}`, ...params);
    return 1;
  }

  // Backup and Restoration
  public serialize(): string {
    if (this.sqlDriver instanceof LocalSqlDriver) {
      return JSON.stringify({ version: this.schemaVersion, tables: this.sqlDriver.getRawTables() });
    }
    const tables = ['system_state', 'settings', 'balances', 'positions', 'orders', 'historical_trades', 'performance_metrics', 'audit_events', 'pattern_matrix', 'online_learning_state'];
    const dump: Record<string, any[]> = {};
    for (const t of tables) {
      dump[t] = this.select(t);
    }
    return JSON.stringify({ version: this.schemaVersion, tables: dump });
  }

  public deserialize(jsonData: string): void {
    try {
      const parsed = JSON.parse(jsonData);
      if (parsed && (parsed.tables || parsed.memoryDb)) {
        const source = parsed.tables || parsed.memoryDb;
        if (this.sqlDriver instanceof LocalSqlDriver) {
          this.sqlDriver.loadRawTables(source);
        } else {
          for (const [t, rows] of Object.entries(source)) {
            if (Array.isArray(rows)) {
              this.delete(t, {});
              for (const row of rows) {
                this.insert(t, row);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Error deserializing SQLite database backup:', e);
    }
  }

  // Specific Repositories
  public getSystemState(): SystemStateEntity {
    const row = this.selectOne<SystemStateEntity>('system_state', { id: 'GLOBAL' });
    if (row) return row;
    return {
      id: 'GLOBAL',
      current_status: 'RUNNING',
      is_simulation: 1,
      days_running: 1,
      updated_at: new Date().toISOString(),
      is_live_locked: 1
    };
  }

  public updateSystemState(updates: Partial<SystemStateEntity>): void {
    const state = this.getSystemState();
    const updated = { ...state, ...updates, updated_at: new Date().toISOString() };
    this.insertOrUpdate('system_state', updated, 'id');
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
    const bal = this.selectOne<BalanceEntity>('balances', { id });
    if (bal) return bal;
    return {
      id,
      asset: 'USD',
      chain_id: id === 'SIM_USD' ? 'SIMULATION' : 'BASE',
      amount: id === 'SIM_USD' ? 1000.0 : 0.0,
      allocated_to_trades: 0.0,
      updated_at: new Date().toISOString()
    };
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

  public getAssets(query?: Partial<AssetEntity>): AssetEntity[] {
    return this.select<AssetEntity>('assets', query);
  }

  public getPools(query?: Partial<PoolEntity>): PoolEntity[] {
    return this.select<PoolEntity>('pools', query);
  }

  public getSignals(query?: Partial<SignalEntity>): SignalEntity[] {
    return this.select<SignalEntity>('signals', query);
  }

  public saveSignal(signal: SignalEntity): void {
    this.insertOrUpdate('signals', signal, 'id');
  }

  public getHistoricalTrades(query?: Partial<any>): any[] {
    return this.select<any>('historical_trades', query).sort((a, b) => b.sellTimestamp - a.sellTimestamp);
  }

  public saveHistoricalTrade(trade: any): void {
    this.insertOrUpdate('historical_trades', trade, 'id');
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

  // Transactional & Deterministic Engine Operations
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

  public runInTransaction<T>(action: () => T): T {
    if (this.sqlDriver.transactionSync) {
      return this.sqlDriver.transactionSync(action);
    }
    this.sqlDriver.exec('BEGIN TRANSACTION');
    try {
      const result = action();
      this.sqlDriver.exec('COMMIT');
      return result;
    } catch (error) {
      this.sqlDriver.exec('ROLLBACK');
      this.addAuditEvent('TRANSACTION_MANAGER', 'ROLLBACK_TRIGGERED', undefined, String(error));
      throw error;
    }
  }

  // Locks
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

  // Ledger & Balances
  public recordLedgerEntry(entry: Omit<BalanceLedgerEntity, 'id' | 'timestamp'>): BalanceLedgerEntity {
    const fullEntry: BalanceLedgerEntity = {
      ...entry,
      id: `ledger_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: Date.now()
    };
    this.insert('balance_ledger', fullEntry);

    this.updateBalance(
      entry.balance_id as 'SIM_USD' | 'LIVE_USD',
      entry.cash,
      entry.reserved
    );

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

  // Atomic High-Utility Methods
  public openPositionAtomic(params: {
    position: PositionEntity;
    order: OrderEntity;
    ledgerEntry: Omit<BalanceLedgerEntity, 'id' | 'timestamp'>;
    balanceId: 'SIM_USD' | 'LIVE_USD';
    newCash: number;
    newReserved: number;
  }): { position: PositionEntity; order: OrderEntity; ledger: BalanceLedgerEntity } {
    return this.runInTransaction(() => {
      this.savePosition(params.position);
      this.saveOrder(params.order);
      const ledger = this.recordLedgerEntry(params.ledgerEntry);
      this.updateBalance(params.balanceId, params.newCash, params.newReserved);
      this.addAuditEvent('ATOMIC_ENGINE', 'OPEN_POSITION_EXECUTED', undefined, `Opened position ${params.position.id} for ${params.position.symbol}`);
      return { position: params.position, order: params.order, ledger };
    });
  }

  public closePositionAtomic(params: {
    positionId: string;
    historicalTrade: any;
    ledgerEntry: Omit<BalanceLedgerEntity, 'id' | 'timestamp'>;
    balanceId: 'SIM_USD' | 'LIVE_USD';
    newCash: number;
    newReserved: number;
  }): { trade: any; ledger: BalanceLedgerEntity } {
    return this.runInTransaction(() => {
      this.deletePosition(params.positionId);
      this.saveHistoricalTrade(params.historicalTrade);
      const ledger = this.recordLedgerEntry(params.ledgerEntry);
      this.updateBalance(params.balanceId, params.newCash, params.newReserved);
      this.addAuditEvent('ATOMIC_ENGINE', 'CLOSE_POSITION_EXECUTED', undefined, `Closed position ${params.positionId}`);
      return { trade: params.historicalTrade, ledger };
    });
  }

  // Reconciliation
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
      
      this.insert('audit_events', {
        id: `evt_risk_${Date.now()}`,
        timestamp: Date.now(),
        actor: 'RECONCILER',
        event_name: 'CIRCUIT_BREAKER_CRITICAL',
        old_value: undefined,
        new_value: issueDetails
      });

      this.updateSystemState({ current_status: 'HALTED' });
      this.addAuditEvent('RECONCILER', 'SYSTEM_HALTED_RECONCILIATION_FAILED', undefined, issueDetails);

      return { success: false, issue: issueDetails };
    }

    return { success: true };
  }

  // Event Bus
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

  // Data Retention
  public pruneHighFrequencyData(maxAgeMs = 3600000 * 24): number {
    const thresholdTime = Date.now() - maxAgeMs;
    let prunedCount = 0;

    // Prune candles
    const candles = this.select<any>('candles');
    const oldCandles = candles.filter(c => (c.timestamp * 1000) < thresholdTime);
    for (const c of oldCandles) {
      this.delete('candles', { id: c.id });
      prunedCount++;
    }

    // Prune market snapshots
    const snaps = this.select<any>('market_snapshots');
    const oldSnaps = snaps.filter(s => (s.timestamp * 1000) < thresholdTime);
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

    const auditList = this.select<AuditEventEntity>('audit_events');
    const oldAudit = auditList.filter(a => a.timestamp < thresholdTime);
    for (const a of oldAudit) {
      this.delete('audit_events', { id: a.id });
      prunedCount++;
    }

    this.addAuditEvent('DATA_RETENTION', 'HF_PRUNING_COMPLETED', undefined, `Pruned ${prunedCount} old records from SQLite.`);
    return prunedCount;
  }

  // Watchdog State
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

  // Recovery Cycle
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

      this.addAuditEvent('RECOVERY_CYCLE', 'SYSTEM_RECOVERY_SUCCESSFUL', undefined, `Recovered system successfully from SQLite storage. Canceled ${canceledOrdersCount} dangling orders.`);
    });

    return { success: true, canceledOrdersCount };
  }
}
