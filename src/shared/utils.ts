// Utilidades generales de control: exponential backoff, retry, delay, formateo bilingüe
// General control utilities: exponential backoff, retry, delay, bilingual formatting

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes an operation with exponential backoff and jitter
 * Ejecuta una operación con retroceso exponencial y jitter (variación aleatoria)
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  delayMs = 1000,
  factor = 2,
  jitter = true
): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      if (attempt >= retries) {
        throw error;
      }
      const actualDelay = delayMs * Math.pow(factor, attempt - 1);
      const withJitter = jitter ? actualDelay + Math.random() * (actualDelay * 0.3) : actualDelay;
      await delay(withJitter);
    }
  }
  throw new Error('Retry limit reached');
}

/**
 * Formats translation helpers based on language
 * Formateador de textos bilingües
 */
export function t(lang: 'es' | 'en', esText: string, enText: string): string {
  return lang === 'es' ? esText : enText;
}

/**
 * Generate a random mock address for signals/trades
 */
export function generateRandomAddress(prefix = '0x'): string {
  const chars = '0123456789abcdef';
  let address = prefix;
  for (let i = 0; i < 40; i++) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  return address;
}
