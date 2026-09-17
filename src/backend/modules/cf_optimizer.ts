/**
 * OPTIMIZACIÓN Y LÍMITES PARA CLOUDFLARE WORKERS FREE + DURABLE OBJECTS
 * Control de subrequests, TTL cache con deduplicación, purga de retención de datos y congelamiento defensivo.
 */

import { BattleTradeDB } from './database';
import { TelegramNotificationEngine } from './system';

export interface WorkerInvocationMetrics {
  subrequestCount: number;
  maxSubrequests: number;
  startTimeMs: number;
  cpuTimeMs: number;
  maxCpuMs: number;
}

export class CloudflareOptimizer {
  private cache: Map<string, { value: any; expiresAt: number }> = new Map();
  private subrequestCount = 0;
  private readonly MAX_SUBREQUESTS_FREE = 45; // Below 50 limit
  private readonly MAX_CPU_MS_FREE = 45;      // Below 50ms limit

  constructor(
    private db?: BattleTradeDB,
    private telegramNotifier?: TelegramNotificationEngine
  ) {}

  /**
   * Reset tracking for current worker invocation
   */
  public beginInvocation(): void {
    this.subrequestCount = 0;
  }

  /**
   * Record a subrequest and check if approaching Cloudflare limits
   */
  public trackSubrequest(count: number = 1): boolean {
    this.subrequestCount += count;
    return this.subrequestCount <= this.MAX_SUBREQUESTS_FREE;
  }

  public getSubrequestCount(): number {
    return this.subrequestCount;
  }

  /**
   * Subsecond / Short TTL Cache to prevent duplicate external HTTP subrequests
   */
  public getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  public setCache<T>(key: string, value: T, ttlMs: number = 3000): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  /**
   * Fetch with automatic caching & subrequest accounting
   */
  public async cachedFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number = 5000
  ): Promise<T> {
    const cached = this.getCached<T>(key);
    if (cached !== null) {
      return cached;
    }

    if (!this.trackSubrequest(1)) {
      throw new Error(`CF_LIMIT_REACHED: Subrequests limit (${this.MAX_SUBREQUESTS_FREE}) reached for this cycle.`);
    }

    const value = await fetcher();
    this.setCache(key, value, ttlMs);
    return value;
  }

  /**
   * Data Retention Policy: Auto-purges raw ticks and old audit logs > 7 days
   * keeps database size well within Cloudflare KV / DO storage caps (1GB free / 100k DO ops)
   */
  public enforceDataRetentionPolicy(): { purgedAuditsCount: number; purgedHistoryCount: number } {
    if (!this.db) return { purgedAuditsCount: 0, purgedHistoryCount: 0 };

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const cutoffTimestamp = Date.now() - SEVEN_DAYS_MS;

    try {
      // Clean up old audit events older than 7 days
      const auditEvents = this.db.getAuditEvents();
      let purgedAudits = 0;
      auditEvents.forEach(e => {
        if (e.timestamp < cutoffTimestamp) {
          this.db!.delete('audit_events', { id: e.id });
          purgedAudits++;
        }
      });

      // Clean up old historical trades if dataset grows excessively
      const history = this.db.getHistoricalTrades();
      let purgedHistory = 0;
      if (history.length > 500) {
        const toKeep = history.slice(0, 300);
        this.db.delete('historical_trades', {});
        toKeep.forEach(t => this.db!.insert('historical_trades', t as any));
        purgedHistory = history.length - toKeep.length;
      }

      return {
        purgedAuditsCount: purgedAudits,
        purgedHistoryCount: purgedHistory
      };
    } catch (err: any) {
      console.warn(`[CFOptimizer] Data retention cleanup warning: ${err.message}`);
      return { purgedAuditsCount: 0, purgedHistoryCount: 0 };
    }
  }

  /**
   * Limit-Reached Circuit Breaker
   * Triggers DEFENSIVE state, freezes new entries, keeps existing positions monitored, and dispatches alert
   */
  public async triggerLimitReachedDefense(reason: string): Promise<void> {
    if (!this.db) return;

    // Freeze entries
    this.db.updateSystemState({ current_status: 'PAUSED' });
    this.db.addAuditEvent('WATCHDOG_LIMIT', 'FREEZE_ENTRIES_CF_LIMIT', undefined, `Límite de Cloudflare alcanzado: ${reason}. Entradas congeladas.`);

    if (this.telegramNotifier) {
      await this.telegramNotifier.sendOutboundNotification(
        `🚨 <b>BATTLE TRADE — LÍMITE ALCANZADO (DEFENSIVE STATE)</b>\n\n` +
        `⚠️ Razón: <code>${reason}</code>\n` +
        `🛡️ Acción: Nuevas entradas congeladas automáticamente. Las posiciones abiertas siguen siendo monitoreadas para salidas de emergencia.\n` +
        `⏰ Timestamp: ${new Date().toISOString()}`
      );
    }
  }
}
