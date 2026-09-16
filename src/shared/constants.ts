// Constantes del sistema y listas de failover para RPCs, Agregadores, etc.
// System constants and failover list configurations for RPCs, Aggregators, etc.

import { ChainId, RpcEndpoint, SystemConfig } from './types';

export const DEFAULT_RPC_ENDPOINTS: RpcEndpoint[] = [
  // Base endpoints
  {
    url: 'https://mainnet.base.org',
    chainId: ChainId.BASE,
    name: 'Base Org Official',
    isHealthy: true,
    latencyMs: 0,
    lastCheckTimestamp: 0,
    failureCount: 0
  },
  {
    url: 'https://base.publicnode.com',
    chainId: ChainId.BASE,
    name: 'Base PublicNode',
    isHealthy: true,
    latencyMs: 0,
    lastCheckTimestamp: 0,
    failureCount: 0
  },
  {
    url: 'https://base-pokt.nodies.app',
    chainId: ChainId.BASE,
    name: 'Pocket Network Base',
    isHealthy: true,
    latencyMs: 0,
    lastCheckTimestamp: 0,
    failureCount: 0
  },
  {
    url: 'https://base.drpc.org',
    chainId: ChainId.BASE,
    name: 'dRPC Base',
    isHealthy: true,
    latencyMs: 0,
    lastCheckTimestamp: 0,
    failureCount: 0
  },
  // BSC endpoints
  {
    url: 'https://binance.llamarpc.com',
    chainId: ChainId.BSC,
    name: 'LlamaRPC BSC',
    isHealthy: true,
    latencyMs: 0,
    lastCheckTimestamp: 0,
    failureCount: 0
  },
  {
    url: 'https://bsc-dataseed.binance.org',
    chainId: ChainId.BSC,
    name: 'BSC Dataseed Official',
    isHealthy: true,
    latencyMs: 0,
    lastCheckTimestamp: 0,
    failureCount: 0
  },
  {
    url: 'https://bsc.publicnode.com',
    chainId: ChainId.BSC,
    name: 'BSC PublicNode',
    isHealthy: true,
    latencyMs: 0,
    lastCheckTimestamp: 0,
    failureCount: 0
  },
  {
    url: 'https://bsc.drpc.org',
    chainId: ChainId.BSC,
    name: 'dRPC BSC',
    isHealthy: true,
    latencyMs: 0,
    lastCheckTimestamp: 0,
    failureCount: 0
  }
];

export const DEFAULT_CONFIG: SystemConfig = {
  globalPause: false,
  simulationMode: true, // Por defecto en Simulación (Paper trading) por seguridad
  maxDailyExposureUsd: 15.0, // Capital extremadamente defensivo para simulación/pruebas
  maxTradeSizeUsd: 2.5, // Micro posiciones de $2.5 USD
  minLiquidityUsd: 2000.0, // Mínimo de liquidez para reducir tirones de alfombra inmediatos
  maxBuyTaxPercent: 5.0, // Impuestos de compra máximos aceptados
  maxSellTaxPercent: 5.0, // Impuestos de venta máximos aceptados
  goplusMinScore: 80, // Score mínimo de seguridad en GoPlus
  primaryLanguage: 'es', // Bilingüe, predeterminado Español
  telegramToken: '',
  telegramChatId: '',
  telegramEnabled: false,
  simulatedSlippagePercent: 1.5,
  simulatedLatencyMs: 250
};
