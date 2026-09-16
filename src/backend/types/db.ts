/**
 * Database schema definitions, constraints, indexes, and interfaces
 * for the Battle Trade High-Frequency Autonomous trading engine.
 * Supports SQLite and custom Durable Object SQL Storage mapping.
 */

import { ChainId, MarketRegime, MacroClimate, SetupPattern } from '../../shared/types';

export interface DatabaseSchema {
  version: number;
  tables: string[];
}

// 1. system_state
export interface SystemStateEntity {
  id: string; // e.g., "GLOBAL"
  current_status: 'RUNNING' | 'PAUSED' | 'HALTED' | 'MAINTENANCE';
  is_simulation: number; // 0 or 1
  days_running: number;
  updated_at: string; // ISO UTC
  is_live_locked: number; // 1 = locked, 0 = unlocked
}

// 2. settings
export interface SettingsEntity {
  key: string;
  value: string;
  group_name: string;
  updated_at: string;
}

// 3. strategies
export interface StrategyEntity {
  id: string;
  name: string;
  description: string;
  is_active: number;
  created_at: string;
}

// 4. strategy_versions
export interface StrategyVersionEntity {
  id: string;
  strategy_id: string;
  version: string;
  parameters: string; // JSON
  is_current: number;
  created_at: string;
}

// 5. assets
export interface AssetEntity {
  address: string;
  chain_id: ChainId;
  name: string;
  symbol: string;
  decimals: number;
  is_active: number;
  discovered_at: string;
}

// 6. pools
export interface PoolEntity {
  address: string;
  chain_id: ChainId;
  token0: string;
  token1: string;
  fee: number;
  dex_name: string;
  liquidity_usd: number;
  created_at: string;
}

// 7. market_snapshots
export interface MarketSnapshotEntity {
  id: string;
  timestamp: number;
  btc_price_usd: number;
  btc_change_24h: number;
  fear_greed_index: number;
  sentiment_score: number;
  global_volume_24h: number;
}

// 8. candles
export interface CandleEntity {
  id: string;
  asset_address: string;
  chain_id: ChainId;
  interval_min: number; // e.g. 1, 5, 15, 60
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 9. trades_market
export interface TradesMarketEntity {
  id: string;
  pool_address: string;
  timestamp: number;
  side: 'BUY' | 'SELL';
  amount_usd: number;
  amount_tokens: number;
  price_usd: number;
  maker_address: string;
}

// 10. swap_events
export interface SwapEventEntity {
  id: string;
  tx_hash: string;
  pool_address: string;
  sender: string;
  recipient: string;
  amount0_in: number;
  amount1_in: number;
  amount0_out: number;
  amount1_out: number;
  timestamp: number;
}

// 11. liquidity_events
export interface LiquidityEventEntity {
  id: string;
  tx_hash: string;
  pool_address: string;
  event_type: 'MINT' | 'BURN';
  provider: string;
  amount0: number;
  amount1: number;
  timestamp: number;
}

// 12. token_security
export interface TokenSecurityEntity {
  address: string;
  chain_id: ChainId;
  is_honeypot: number;
  buy_tax: number;
  sell_tax: number;
  is_mintable: number;
  lp_locked_percent: number;
  top_holders_percent: number;
  goplus_score: number;
  last_scan_at: string;
}

// 13. features
export interface FeaturesEntity {
  id: string;
  token_address: string;
  timestamp: number;
  rsi_14: number;
  macd_val: number;
  macd_signal: number;
  vol_to_liq_ratio: number;
  velocity_5m: number;
  acceleration_1h: number;
  volatility_rating: string;
}

// 14. signals
export interface SignalEntity {
  id: string;
  timestamp: number;
  token_address: string;
  chain_id: ChainId;
  composite_alpha_score: number;
  conviction: string;
  action: 'BUY' | 'SKIP';
  recommended_size_usd: number;
  setup_pattern: SetupPattern;
}

// 15. predictions
export interface PredictionEntity {
  id: string;
  signal_id: string;
  token_address: string;
  predicted_direction: 'UP' | 'DOWN';
  predicted_gain_percent: number;
  confidence_score: number;
  model_id: string;
  created_at: string;
}

// 16. prediction_outcomes
export interface PredictionOutcomeEntity {
  prediction_id: string;
  actual_gain_percent: number;
  is_correct: number;
  holding_time_minutes: number;
  evaluated_at: string;
}

// 17. orders
export interface OrderEntity {
  id: string;
  position_id: string;
  token_address: string;
  chain_id: ChainId;
  side: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT';
  status: 'CREATED' | 'VALIDATING' | 'REJECTED' | 'APPROVED' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCEL_REQUESTED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
  size_usd: number;
  price_usd: number;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

// 18. fills
export interface FillEntity {
  id: string;
  order_id: string;
  tx_hash: string;
  gas_usd: number;
  amount_tokens: number;
  filled_price_usd: number;
  filled_at: string;
}

// 19. positions
export interface PositionEntity {
  id: string;
  token_address: string;
  chain_id: ChainId;
  name: string;
  symbol: string;
  buy_price_usd: number;
  current_price_usd: number;
  size_usd: number;
  amount_tokens: number;
  buy_timestamp: number;
  last_update_timestamp: number;
  highest_price_usd: number;
  is_principal_recovered: number;
  target_take_profit_percent: number;
  stop_loss_percent: number;
  trailing_stop_percent: number;
  is_simulation: number;
  pnl_usd: number;
  pnl_percent: number;
  regime_at_entry: MarketRegime;
  setup_pattern: SetupPattern;
  status?: 'FLAT' | 'OPENING' | 'OPEN' | 'REDUCING' | 'CLOSING' | 'CLOSED' | 'ERROR';
}

// 20. balances
export interface BalanceEntity {
  id: string; // e.g., "SIM_USD", "LIVE_USD"
  asset: string; // e.g., "USD"
  chain_id: string; // e.g., "SIMULATION", "BASE", "BSC"
  amount: number;
  allocated_to_trades: number;
  updated_at: string;
}

// 21. portfolio_snapshots
export interface PortfolioSnapshotEntity {
  id: string;
  timestamp: number;
  total_value_usd: number;
  cash_balance_usd: number;
  allocated_balance_usd: number;
  unrealized_pnl_usd: number;
}

// 22. risk_events
export interface RiskEventEntity {
  id: string;
  timestamp: number;
  event_type: 'DAILY_EXPOSURE_LIMIT' | 'MAX_POSITION_SIZE_VIOLATION' | 'ANTI_TILT_TRIGGER' | 'CIRCUIT_BREAKER' | 'LIQUIDITY_CRISIS';
  severity: 'WARNING' | 'CRITICAL';
  details: string;
}

// 23. regime_snapshots
export interface RegimeSnapshotEntity {
  id: string;
  timestamp: number;
  regime: MarketRegime;
  macro_climate: MacroClimate;
  heat_score: number;
  active_pairs_count: number;
}

// 24. ai_requests
export interface AiRequestEntity {
  id: string;
  provider: 'Gemini' | 'Groq';
  prompt_type: 'MACRO' | 'SIGNAL' | 'AUTOPSY';
  raw_prompt: string;
  created_at: string;
}

// 25. ai_results
export interface AiResultEntity {
  request_id: string;
  raw_response: string;
  parsed_action: 'BUY' | 'SKIP' | 'HOLD';
  parsed_score: number;
  latency_ms: number;
  created_at: string;
}

// 26. alerts
export interface AlertEntity {
  id: string;
  timestamp: number;
  channel: 'TELEGRAM' | 'EMAIL' | 'FRONTEND';
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  sent_status: 'SENT' | 'FAILED' | 'PENDING';
}

// 27. jobs
export interface JobEntity {
  id: string;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  last_run: string;
  next_run: string;
  error_message?: string;
}

// 28. heartbeats
export interface HeartbeatEntity {
  service_name: string;
  last_heartbeat: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
}

// 29. provider_health
export interface ProviderHealthEntity {
  provider_name: string; // e.g., "RPC_BASE_0", "GEMINI_API"
  is_healthy: number;
  latency_ms: number;
  errors_last_hour: number;
  last_check_at: string;
}

// 30. model_versions
export interface ModelVersionEntity {
  model_id: string;
  provider: 'Gemini' | 'Groq';
  is_active: number;
  accuracy_rate: number;
  last_trained_at: string;
}

// 31. experiments
export interface ExperimentEntity {
  id: string;
  name: string;
  hypothesis: string;
  parameters: string; // JSON
  status: 'DRAFT' | 'ACTIVE' | 'CONCLUDED';
  created_at: string;
}

// 32. trade_autopsies
export interface TradeAutopsyEntity {
  trade_id: string;
  ai_analysis: string;
  emotional_rating: string;
  market_coherence: number; // 0-100
  lesson_learned: string;
  created_at: string;
}

// 33. performance_metrics
export interface PerformanceMetricsEntity {
  id: string; // e.g., "7_DAY_MARATHON"
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_profit_usd: number;
  max_drawdown_percent: number;
  profit_factor: number;
  updated_at: string;
}

// 34. audit_events
export interface AuditEventEntity {
  id: string;
  timestamp: number;
  actor: string; // e.g., "SYSTEM_CRON", "ADMIN_0"
  event_name: string; // e.g., "LIVE_TRADING_LOCKED", "WITHDRAWAL"
  old_value?: string;
  new_value?: string;
  ip_address?: string;
}

// 35. event_store
export interface EventStoreEntity {
  event_id: string;
  event_type: 'market_event' | 'feature_event' | 'signal_event' | 'risk_event' | 'order_event' | 'fill_event' | 'position_event' | 'system_event';
  aggregate_type: string;
  aggregate_id: string;
  sequence: number;
  timestamp: number;
  payload: string; // JSON
  source: string;
  correlation_id: string;
  causation_id: string;
  schema_version: number;
}

// 36. idempotency_records
export interface IdempotencyRecordEntity {
  idempotency_key: string;
  response_payload: string; // JSON or success
  timestamp: number;
}

// 37. asset_locks
export interface AssetLockEntity {
  asset_address: string;
  lock_type: 'BUY' | 'SELL' | 'UPDATE';
  acquired_at: number;
  expire_at: number;
}

// 38. balance_ledger
export interface BalanceLedgerEntity {
  id: string;
  balance_id: string;
  asset: string;
  entry_type: 'DEPOSIT' | 'WITHDRAWAL' | 'RESERVE_TRADE' | 'RELEASE_RESERVE' | 'REALIZED_PNL' | 'FEE' | 'GAS' | 'SLIPPAGE' | 'PRICE_IMPACT' | 'RECONCILIATION_ADJUSTMENT';
  cash: number;
  reserved: number;
  available: number;
  quantity: number;
  realized_pnl: number;
  unrealized_pnl: number;
  fees: number;
  gas: number;
  slippage: number;
  price_impact: number;
  timestamp: number;
}

// 39. watchdog_states
export interface WatchdogStateEntity {
  component: 'market_data' | 'features' | 'strategy' | 'execution' | 'risk' | 'AI' | 'DB' | 'frontend_control';
  last_updated: number;
  is_fresh: number; // 0 or 1;
}
