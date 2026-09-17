export type FeatureTimeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h';

export interface PriceFeatures {
  returnSimple: number;
  returnLog: number;
  velocity: number;
  acceleration: number;
  momentum: number;
  emaDistance9: number;
  emaDistance21: number;
  emaDistance50: number;
  vwapDistance: number;
  breakoutDistance20: number;
  localDrawdown: number;
  recoveryStrength: number;
}

export interface TechnicalFeatures {
  sma20: number;
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  macd: { macd: number; signal: number; histogram: number };
  atr14: number;
  bollingerBands: { upper: number; middle: number; lower: number; bandwidth: number; percentB: number };
  adx14: number;
  stochastic: { k: number; d: number };
  roc12: number;
  realizedVolatility: number;
  rangeExpansion: number;
  trendStrength: number;
}

export interface VolumeFeatures {
  volume: number;
  volumeChangePercent: number;
  relativeVolume: number;
  volumeZScore: number;
  volumeAcceleration: number;
  buyVolume: number;
  sellVolume: number;
  buySellRatio: number;
  volumeToMarketCap: number;
  volumeToLiquidity: number;
}

export interface FlowFeatures {
  swapCount: number;
  buyCount: number;
  sellCount: number;
  avgTradeSizeUsd: number;
  whaleBuyCount: number;
  whaleSellCount: number;
  netFlowUsd: number;
  flowAcceleration: number;
  largeTradeRatio: number;
  uniqueTraderCount: number;
}

export interface LiquidityFeatures {
  liquidityUsd: number;
  liquidityChangePercent: number;
  liquidityVelocity: number;
  depthApproximation: number;
  priceImpact1kUsd: number;
  reserveImbalance: number;
  lpNetFlowUsd: number;
  liquidityToVolumeRatio: number;
  liquidityToMarketCapRatio: number;
}

export interface MicrostructureFeatures {
  syntheticOrderBookImbalance: number; // -1.0 to 1.0 based on swap flow & reserve dynamics
  syntheticSpreadBps: number;
  tradeSizeRelativePoolRatio: number;
  buySellSequenceRatio: number; // run length / persistence of buy orders vs sell
  priceImpactPerThousandUsd: number;
  poolStateHealth: 'BALANCED' | 'IMBALANCED' | 'DRAINING' | 'VOLATILE';
  timingInterArrivalMsAvg: number;
}

export interface SmartMoneyCohort {
  cohortName: 'INSIDERS' | 'SNIPERS' | 'SWEEPERS' | 'DIAMOND_HANDS' | 'WHALES';
  walletCount: number;
  profitabilityPercent: number;
  hitRatePercent: number;
  avgHoldingDurationMin: number;
  netFlowUsd24h: number;
  earlyEntryRatio: number;
}

export interface SmartMoneyFeatures {
  topSmartMoneyNetFlowUsd: number;
  smartMoneyDominanceRatio: number;
  avgSmartMoneyProfitability: number;
  earlyEntryClusterDetected: boolean;
  cohorts: SmartMoneyCohort[];
}

export interface MacroFeatures {
  btcReturn24h: number;
  btcVolatility24h: number;
  ethReturn24h: number;
  ethVolatility24h?: number;
  bnbReturn24h: number;
  solReturn24h: number;
  dexGlobalVolume24h: number;
  chainActivityIndex: number;
  gasPriceGwei: number;
  relativeStrengthVsBtc: number;
  relativeStrengthVsEth?: number;
  betaToBtc: number;
  correlationToBtc: number;
  correlationToEth?: number;
  marketBreadthScore: number;
}

export interface MemeFeatures {
  newPoolCount24h: number;
  newPoolVelocity?: number;
  memeVolumeIndex: number;
  volumeAcceleration?: number;
  memeMomentumBreadth: number;
  memeLiquidityBreadth: number;
  memeFailureRatePercent: number;
}

export interface FeatureVector {
  feature_schema_version: string;
  tokenAddress: string;
  chainId: string;
  timeframe: FeatureTimeframe;
  calculationTimestamp: number;
  sourceTimestamps: {
    candlesTimestamp: number;
    swapsTimestamp: number;
    macroTimestamp: number;
  };
  horizonMin: number;
  confidence: number;
  freshness: number;
  missingnessRatio: number;
  
  price: PriceFeatures;
  technical: TechnicalFeatures;
  volume: VolumeFeatures;
  flow: FlowFeatures;
  liquidity: LiquidityFeatures;
  microstructure: MicrostructureFeatures;
  smartMoney: SmartMoneyFeatures;
  macro: MacroFeatures;
  meme: MemeFeatures;

  // Normalized versions (e.g. z-scores, percentiles)
  normalized: {
    rsi14_percentile: number;
    volume_zscore: number;
    momentum_winsorized: number;
    overall_alpha_score: number; // 0 - 100
  };
}
