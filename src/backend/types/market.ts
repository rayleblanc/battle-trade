export interface NormalizedData {
  source: string;
  timestamp: number;
  chain: string; // 'base' | 'bsc' | etc.
  dex?: string;
  pool?: string;
  blockNumber?: number;
  confidence: number; // 0.0 to 1.0
  freshness: number;  // 0.0 to 1.0
}

export interface Asset extends NormalizedData {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply?: string;
}

export interface Pool extends NormalizedData {
  address: string;
  token0Address: string;
  token1Address: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  reserve0: string;
  reserve1: string;
  liquidityUsd: number;
}

export interface MarketSnapshot extends NormalizedData {
  tokenAddress: string;
  priceUsd: number;
  liquidityUsd: number;
  volume24h: number;
  priceChange24h: number;
  buyCount24h?: number;
  sellCount24h?: number;
}

export interface SwapEvent extends NormalizedData {
  txHash: string;
  sender: string;
  tokenInAddress: string;
  tokenOutAddress: string;
  amountIn: string;
  amountOut: string;
  amountInUsd: number;
  amountOutUsd: number;
}

export interface LiquidityEvent extends NormalizedData {
  txHash: string;
  type: 'ADD' | 'REMOVE';
  provider: string;
  token0Amount: string;
  token1Amount: string;
  amountUsd: number;
}

export interface Candle extends NormalizedData {
  tokenAddress: string;
  intervalMin: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
