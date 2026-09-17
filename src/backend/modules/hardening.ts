/**
 * HARDENING DE SEGURIDAD Y PRODUCCIÓN - BATTLE TRADE ENGINE
 * Sanitizador de logs/sensibles, validación de entradas, rate limiting y bloqueo físico de LIVE.
 */

import { SystemConfig } from '../../shared/types';

export interface SensitiveRedactionConfig {
  redactKeys: string[];
}

export class HardeningEngine {
  private static readonly SECRET_PATTERNS = [
    /AIzaSy[A-Za-z0-9_-]{33}/g,                 // Gemini API Keys
    /gsk_[A-Za-z0-9]{48,64}/g,                   // Groq API Keys
    /sk-[A-Za-z0-9]{32,64}/g,                    // Generic Secret Keys / OpenAI
    /bot\d+:[A-Za-z0-9_-]{35}/g,                 // Telegram Bot Tokens
    /0x[a-fA-F0-9]{64}/g,                        // EVM Private Keys
    /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,          // Bearer Tokens
  ];

  /**
   * Safe Production Defaults
   */
  public static getProductionDefaults(): Partial<SystemConfig> {
    return {
      globalPause: false,
      simulationMode: true, // Default PAPER = ON
      maxDailyExposureUsd: 150.0,
      maxTradeSizeUsd: 15.0,
      minLiquidityUsd: 2000.0,
      maxBuyTaxPercent: 8.0,
      maxSellTaxPercent: 8.0,
      goplusMinScore: 80,
      simulatedSlippagePercent: 1.5,
      simulatedLatencyMs: 250,
      minRiskPercentPerTrade: 1.5,
      maxRiskPercentPerTrade: 5.0,
    };
  }

  /**
   * Redacts sensitive credentials, private keys, and API tokens from strings or JSON objects.
   */
  public static sanitize(input: string): string;
  public static sanitize<T>(input: T): T;
  public static sanitize(input: any): any {
    if (input === null || input === undefined) return input;

    if (typeof input === 'string') {
      let sanitized = input;
      for (const pattern of this.SECRET_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
      }
      return sanitized;
    }

    if (typeof input === 'object') {
      if (Array.isArray(input)) {
        return input.map(item => this.sanitize(item));
      }

      const copy: Record<string, any> = {};
      const sensitiveKeys = ['key', 'secret', 'token', 'password', 'privatekey', 'authorization', 'bearer', 'telegramtoken', 'groqapikey', 'geminiapikey'];

      for (const [key, value] of Object.entries(input)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(sk => lowerKey.includes(sk)) && typeof value === 'string' && value.length > 0) {
          copy[key] = '[REDACTED_FIELD]';
        } else {
          copy[key] = this.sanitize(value);
        }
      }
      return copy;
    }

    return input;
  }

  /**
   * Physical Lock for Live Execution Mode.
   * Prevents live trading unless all 4 security checks pass simultaneously.
   */
  public static verifyLiveExecutionAllowed(
    isSimulationMode: boolean,
    headersToken?: string,
    envArmingToken?: string
  ): { allowed: boolean; reason: string } {
    // Check 1: Hard Simulation Default Check
    if (isSimulationMode) {
      return {
        allowed: false,
        reason: 'LOCKED: Motor está operando en modo PAPER/Simulación. Live trading desactivado por seguridad.'
      };
    }

    // Check 2: Require Explicit Environment Arming Token
    const requiredToken = envArmingToken || process.env.LIVE_ARMING_TOKEN;
    if (!requiredToken || requiredToken.length < 16) {
      return {
        allowed: false,
        reason: 'LOCKED: LIVE_ARMING_TOKEN no configurado o inválido en Cloudflare Secrets.'
      };
    }

    // Check 3: Header Verification Match
    if (!headersToken || headersToken !== requiredToken) {
      return {
        allowed: false,
        reason: 'LOCKED: Token de armado físico inválido o ausente en los encabezados HTTP (x-live-arming-token).'
      };
    }

    // Check 4: Explicit Environment Flag Check
    if (process.env.LIVE_EXECUTION_UNLOCKED !== 'TRUE') {
      return {
        allowed: false,
        reason: 'LOCKED: La variable de entorno LIVE_EXECUTION_UNLOCKED no está configurada explícitamente en "TRUE".'
      };
    }

    return {
      allowed: true,
      reason: 'ARMED: Modulo Live desbloqueado exitosamente tras verificar los 4 factores de seguridad.'
    };
  }

  /**
   * Validate parameters to prevent malformed data or injection attacks
   */
  public static validateInputParam(
    value: string | number | undefined,
    type: 'address' | 'number' | 'symbol' | 'text',
    opts?: { min?: number; max?: number; required?: boolean }
  ): { valid: boolean; error?: string; cleanValue?: any } {
    if (value === undefined || value === null || String(value).trim() === '') {
      if (opts?.required) {
        return { valid: false, error: 'Parámetro obligatorio ausente' };
      }
      return { valid: true, cleanValue: undefined };
    }

    if (type === 'address') {
      const str = String(value).trim();
      const isEvm = /^0x[a-fA-F0-9]{40}$/.test(str);
      const isSolana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str);
      if (!isEvm && !isSolana) {
        return { valid: false, error: 'Dirección de token o contrato inválida' };
      }
      return { valid: true, cleanValue: str.toLowerCase() };
    }

    if (type === 'number') {
      const num = Number(value);
      if (isNaN(num)) {
        return { valid: false, error: 'Valor numérico inválido' };
      }
      if (opts?.min !== undefined && num < opts.min) {
        return { valid: false, error: `El valor no puede ser menor que ${opts.min}` };
      }
      if (opts?.max !== undefined && num > opts.max) {
        return { valid: false, error: `El valor no puede ser mayor que ${opts.max}` };
      }
      return { valid: true, cleanValue: num };
    }

    if (type === 'symbol') {
      const str = String(value).trim().toUpperCase();
      if (!/^[A-Z0-9_$]{1,16}$/.test(str)) {
        return { valid: false, error: 'Símbolo de token inválido' };
      }
      return { valid: true, cleanValue: str };
    }

    if (type === 'text') {
      const str = String(value).trim().slice(0, 500); // limit length
      return { valid: true, cleanValue: str };
    }

    return { valid: true, cleanValue: value };
  }
}

/**
 * Lightweight In-Memory Sliding Window Rate Limiter
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  constructor(
    private windowMs: number = 60000, // 1 minute
    private maxRequests: number = 60 // 60 req/min
  ) {}

  public isAllowed(identifier: string): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    const timestamps = this.requests.get(identifier) || [];
    
    // Filter timestamps within sliding window
    const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);

    if (validTimestamps.length >= this.maxRequests) {
      const oldest = validTimestamps[0];
      const resetMs = this.windowMs - (now - oldest);
      return { allowed: false, remaining: 0, resetMs };
    }

    validTimestamps.push(now);
    this.requests.set(identifier, validTimestamps);

    return {
      allowed: true,
      remaining: this.maxRequests - validTimestamps.length,
      resetMs: this.windowMs
    };
  }

  public cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter(ts => now - ts < this.windowMs);
      if (valid.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, valid);
      }
    }
  }
}
