import React, { useState } from 'react';
import { 
  Shield, 
  TrendingUp, 
  Globe, 
  Brain, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Gauge, 
  Activity, 
  Layers,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Sliders,
  Radio
} from 'lucide-react';
import { 
  MarketContext, 
  OpportunitySignal, 
  MultiLayerDecision, 
  MarketHeatMetrics, 
  SetupExpectancy 
} from './shared/types';

interface MultiLayerBrainViewProps {
  marketContext: MarketContext | null;
  marketHeat: MarketHeatMetrics | null;
  signals: OpportunitySignal[];
  setupExpectancies: SetupExpectanciesProps[];
  lang: 'es' | 'en';
}

type SetupExpectanciesProps = SetupExpectancy;

export const MultiLayerBrainView: React.FC<MultiLayerBrainViewProps> = ({
  marketContext,
  marketHeat,
  signals,
  setupExpectancies,
  lang
}) => {
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(
    signals.length > 0 ? signals[0].id : null
  );

  const selectedSignal = signals.find(s => s.id === selectedSignalId) || (signals.length > 0 ? signals[0] : null);
  const ml: MultiLayerDecision | undefined = selectedSignal?.multiLayer;

  const t = (es: string, en: string) => (lang === 'es' ? es : en);

  const getConvictionColor = (conviction?: string) => {
    switch (conviction) {
      case 'VERY_HIGH': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'HIGH': return 'text-lime-400 bg-lime-500/10 border-lime-500/30';
      case 'MEDIUM': return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'LOW': return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
    }
  };

  const getClimateBadge = (climate?: string) => {
    switch (climate) {
      case 'RISK_ON': return { label: t('RISK-ON (APETITO ACTIVO)', 'RISK-ON (HIGH APPETITE)'), color: 'text-lime-400 bg-lime-500/10 border-lime-500/30' };
      case 'RISK_OFF': return { label: t('RISK-OFF (DEFENSIVO)', 'RISK-OFF (DEFENSIVE)'), color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' };
      case 'HIGH_VOLATILITY': return { label: t('ALTA VOLATILIDAD', 'HIGH VOLATILITY'), color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
      default: return { label: t('NEUTRAL', 'NEUTRAL'), color: 'text-slate-300 bg-slate-800 border-slate-700' };
    }
  };

  const climateInfo = getClimateBadge(marketContext?.macroClimate);

  return (
    <div className="space-y-6 font-mono">
      
      {/* MACRO CLIMATE & BITCOIN COMPASS */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-lime-500/10 border border-lime-500/20 rounded text-lime-400">
                <Globe className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-bold text-slate-100 tracking-wide">
                {t('BRÚJULA MACRO & INGESTA BITCOIN EN TIEMPO REAL', 'REAL-TIME MACRO COMPASS & BITCOIN INGESTION')}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Fuente: {marketContext?.source || 'Kraken/Coinbase'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-sans mt-1.5">
              {marketContext ? (lang === 'es' ? marketContext.rationaleEs : marketContext.rationaleEn) : t('Sincronizando clima de mercado institucional...', 'Synchronizing institutional market climate...')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className={`px-3 py-1 rounded-full border text-xs font-bold flex items-center gap-1.5 ${climateInfo.color}`}>
              <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
              {climateInfo.label}
            </div>

            <div className="px-3 py-1 rounded-full border border-slate-700 bg-slate-800/80 text-xs text-slate-300 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-lime-400" />
              <span>{t('Multiplicador Tamaño:', 'Size Multiplier:')} <strong className="text-lime-400">{marketContext?.macroMultiplier ?? 1.0}x</strong></span>
            </div>
          </div>
        </div>

        {/* Macro KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          {/* BTC Price */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-sans">
              {t('Bitcoin Spot (USD)', 'Bitcoin Spot (USD)')}
            </span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-xl font-black text-slate-100">
                ${marketContext?.btcPriceUsd ? marketContext.btcPriceUsd.toLocaleString() : '75,850'}
              </span>
              <span className={`text-xs font-bold flex items-center ${
                (marketContext?.btcChange24h ?? 0) >= 0 ? 'text-lime-400' : 'text-rose-400'
              }`}>
                {(marketContext?.btcChange24h ?? 0) >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {marketContext?.btcChange24h ? `${marketContext.btcChange24h}%` : '+0.5%'}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-sans block mt-1">
              Tendencia: <strong className="text-slate-300">{marketContext?.btcTrend || 'NEUTRAL'}</strong>
            </span>
          </div>

          {/* Fear & Greed Index */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-sans">
              {t('Fear & Greed Index', 'Fear & Greed Index')}
            </span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-xl font-black text-amber-400">
                {marketContext?.fearAndGreedIndex ?? 62}/100
              </span>
              <span className="text-[11px] font-bold text-amber-300">
                {marketContext?.fearAndGreedClassification || 'Greed'}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-sans block mt-1">
              Fuente: <strong className="text-slate-300">Alternative.me</strong>
            </span>
          </div>

          {/* Sector Memecoin Heat */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-sans">
              {t('Calor Sector Memecoins', 'Memecoin Sector Heat')}
            </span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-xl font-black text-amber-400">
                {marketHeat?.heatLevel || 'WARM'}
              </span>
              <span className="text-xs text-slate-400 font-sans">
                {marketHeat?.heatScore || 45}/100
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-sans block mt-1">
              {t('Volumen DEX 5m:', 'DEX 5m Vol:')} <strong className="text-slate-300">${Math.round(marketHeat?.aggregatedVolume5m || 12000).toLocaleString()}</strong>
            </span>
          </div>

          {/* Trading Permission */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-sans">
              {t('Permiso Cuantitativo', 'Trade Permission')}
            </span>
            <div className="flex items-center gap-2 mt-1.5">
              {marketContext?.tradePermission === 'HALTED_MACRO_RISK' ? (
                <span className="text-sm font-bold text-rose-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-rose-400" />
                  {t('COMPRAS PAUSADAS', 'BUYS HALTED')}
                </span>
              ) : marketContext?.tradePermission === 'CAUTION_REDUCED_SIZE' ? (
                <span className="text-sm font-bold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  {t('PRECAUCIÓN', 'CAUTION')}
                </span>
              ) : (
                <span className="text-sm font-bold text-lime-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-lime-400" />
                  {t('AUTORIZADA', 'PERMITTED')}
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-500 font-sans block mt-1">
              Filtro Macro: <strong className="text-slate-300">{marketContext?.tradePermission || 'PERMITTED'}</strong>
            </span>
          </div>

          {/* Sizing Multiplier */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-sans">
              {t('Multiplicador Asignación', 'Allocation Factor')}
            </span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-xl font-black text-lime-400">
                {marketContext?.macroMultiplier ? `${marketContext.macroMultiplier}x` : '1.0x'}
              </span>
              <span className="text-xs text-slate-500 font-sans">
                {marketContext?.macroMultiplier && marketContext.macroMultiplier > 1 ? '+25% bonus' : 'Base risk'}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-sans block mt-1">
              {t('Modulación adaptativa de capital', 'Adaptive risk modulation')}
            </span>
          </div>
        </div>
      </section>

      {/* 4-LAYER DECISION ENGINE ARCHITECTURE */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-lime-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              {t('ARQUITECTURA DE DECISIÓN MULTI-CAPA INSTITUCIONAL', 'INSTITUTIONAL MULTI-LAYER DECISION ARCHITECTURE')}
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-sans">
            {t('Ponderación: 25% Seg | 35% Mom | 20% Macro | 20% Memoria', 'Weights: 25% Sec | 35% Mom | 20% Macro | 20% Memory')}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Layer 1: Security */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 flex flex-col justify-between space-y-3 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                {t('CAPA 1: SEGURIDAD', 'LAYER 1: SECURITY')}
              </span>
              <span className="text-[10px] px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded">
                25% Alpha
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              {t('Filtro duro inviolable: Verificación on-chain de Honeypot, LP Lock ≥ 70%, impuestos ≤ 5%, concentración top-holders y score GoPlus.', 
                'Inviolable hard filter: On-chain honeypot check, LP Lock ≥ 70%, taxes ≤ 5%, holder concentration, and GoPlus audit score.')}
            </p>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>{t('Honeypot Veto:', 'Honeypot Veto:')}</span>
              <strong className="text-rose-400 font-mono">Score = 0</strong>
            </div>
          </div>

          {/* Layer 2: Momentum */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 flex flex-col justify-between space-y-3 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-lime-400" />
                {t('CAPA 2: MOMENTUM', 'LAYER 2: MOMENTUM')}
              </span>
              <span className="text-[10px] px-2 py-0.5 bg-lime-500/10 border border-lime-500/30 text-lime-400 rounded">
                35% Alpha
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              {t('Micro-estructura del par: Velocidad de precio 5m, aceleración 1h, y ratio volumen/liquidez (RVol) para detectar ignición real y evitar trampas.', 
                'Pair micro-structure: 5m price velocity, 1h acceleration, and volume-to-liquidity ratio (RVol) to catch true breakouts and dodge traps.')}
            </p>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>{t('Umbral Mínimo:', 'Minimum Hurdle:')}</span>
              <strong className="text-lime-400 font-mono">≥ 60/100</strong>
            </div>
          </div>

          {/* Layer 3: Macro Context */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 flex flex-col justify-between space-y-3 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-400" />
                {t('CAPA 3: MACRO & BTC', 'LAYER 3: MACRO & BTC')}
              </span>
              <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded">
                20% Alpha
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              {t('Contexto de mercado: Ingesta de Bitcoin spot (Kraken/Coinbase), correlación con DEXs y determinación de régimen Risk-On vs Risk-Off.', 
                'Market context: Ingests Bitcoin spot (Kraken/Coinbase), DEX correlation, and sets Risk-On vs Risk-Off climate.')}
            </p>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>{t('Pérdidas Macro:', 'Macro Halt:')}</span>
              <strong className="text-amber-400 font-mono">Halt &lt; -6%</strong>
            </div>
          </div>

          {/* Layer 4: Memory & Expectancy */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 flex flex-col justify-between space-y-3 hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" />
                {t('CAPA 4: MEMORIA', 'LAYER 4: MEMORY')}
              </span>
              <span className="text-[10px] px-2 py-0.5 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded">
                20% Alpha
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              {t('Aprendizaje bayesiano: Expectativa matemática por patrón de setup, racha de la cartera (+rachas incrementan tamaño, pérdidas reducen).', 
                'Bayesian learning: Math expectancy per setup pattern, portfolio streak feedback (+streak expands size, loss streaks throttle).')}
            </p>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>{t('Setups Bloqueados:', 'Blocked Setups:')}</span>
              <strong className="text-rose-400 font-mono">Pena -45 pts</strong>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE OPPORTUNITY MULTI-LAYER INSPECTOR */}
      <section className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-lime-400 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-lime-400" />
              {t('INSPECTOR MULTI-CAPA DE OPORTUNIDADES ESCANEADAS', 'LIVE MULTI-LAYER OPPORTUNITY INSPECTOR')}
            </h3>
            <p className="text-xs text-slate-400 font-sans mt-1">
              {t('Selecciona cualquier oportunidad detectada para auditar el desglose de los 4 filtros cuantitativos y su Alpha Score compuesto.', 
                'Select any detected pair to audit the breakdown across all 4 quantitative filters and its composite Alpha Score.')}
            </p>
          </div>

          {/* Signal selector dropdown / selector */}
          {signals.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-sans">{t('Par a inspeccionar:', 'Inspecting pair:')}</span>
              <select 
                value={selectedSignalId || ''} 
                onChange={e => setSelectedSignalId(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded focus:outline-none focus:border-lime-400"
              >
                {signals.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.token.symbol} ({s.setupPattern || 'BREAKOUT'}) - Score: {s.compositeAlphaScore || s.decision.score} - {s.decision.action}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {selectedSignal && ml ? (
          <div className="space-y-6">
            {/* Header of selected candidate */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-950/60 p-4 rounded-lg border border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center font-bold text-lime-400 text-sm">
                  {selectedSignal.token.symbol.slice(0, 3)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-slate-100">{selectedSignal.token.name}</span>
                    <span className="text-xs text-slate-400 font-sans">({selectedSignal.token.symbol})</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-sans">
                      {selectedSignal.token.chainId.toUpperCase()}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-400 border border-lime-500/30">
                      {selectedSignal.setupPattern || 'VELOCITY_BREAKOUT'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono block mt-0.5">
                    {selectedSignal.token.address}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Composite Alpha Score */}
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-sans">
                    COMPOSITE ALPHA SCORE
                  </span>
                  <div className="flex items-baseline gap-1 justify-end">
                    <span className={`text-2xl font-black ${
                      ml.compositeAlphaScore >= 68 ? 'text-lime-400' : 'text-slate-400'
                    }`}>
                      {ml.compositeAlphaScore}
                    </span>
                    <span className="text-xs text-slate-500 font-sans">/100</span>
                  </div>
                </div>

                {/* Conviction Badge */}
                <div className={`px-3 py-1.5 rounded border text-xs font-black ${getConvictionColor(ml.conviction)}`}>
                  {ml.conviction} CONVICTION
                </div>

                {/* Decision Action */}
                <div className={`px-3 py-1.5 rounded border text-xs font-black ${
                  ml.action === 'BUY' 
                    ? 'bg-lime-500/10 border-lime-500/30 text-lime-400' 
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}>
                  {ml.action === 'BUY' ? t('COMPRA AUTORIZADA', 'BUY AUTHORIZED') : t('OMITIDO', 'SKIPPED')}
                </div>
              </div>
            </div>

            {/* 4 Layer Score Meter Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Layer 1: Security Meter */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    Capa 1: Seguridad
                  </span>
                  <span className="text-xs font-black text-cyan-300">
                    {ml.layer1Security.score}/100
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-cyan-400 h-full rounded-full transition-all" 
                    style={{ width: `${ml.layer1Security.score}%` }}
                  />
                </div>
                <div className="space-y-1 text-[11px] font-sans text-slate-400 pt-1">
                  <div className="flex justify-between">
                    <span>GoPlus Score:</span>
                    <strong className="text-slate-200">{selectedSignal.security.goplusScore}/100</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>LP Locked:</span>
                    <strong className="text-slate-200">{ml.layer1Security.lpLockedPercent}%</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Impuestos (B/S):</span>
                    <strong className="text-slate-200">{ml.layer1Security.buyTax}% / {ml.layer1Security.sellTax}%</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Top Holders:</span>
                    <strong className="text-slate-200">{ml.layer1Security.topHoldersPercent}%</strong>
                  </div>
                </div>
              </div>

              {/* Layer 2: Momentum Meter */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-lime-400 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Capa 2: Momentum
                  </span>
                  <span className="text-xs font-black text-lime-400">
                    {ml.layer2Momentum.score}/100
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-lime-400 h-full rounded-full transition-all" 
                    style={{ width: `${ml.layer2Momentum.score}%` }}
                  />
                </div>
                <div className="space-y-1 text-[11px] font-sans text-slate-400 pt-1">
                  <div className="flex justify-between">
                    <span>Velocidad 5m:</span>
                    <strong className="text-slate-200">+{ml.layer2Momentum.priceVelocity5m}%</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Aceleración 1h:</span>
                    <strong className="text-slate-200">+{ml.layer2Momentum.priceAcceleration1h}%</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Ratio Vol/Liq:</span>
                    <strong className="text-slate-200">{ml.layer2Momentum.volumeToLiquidityRatio}x</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>RVol Grado:</span>
                    <strong className="text-lime-400">{ml.layer2Momentum.relativeVolumeGrade}</strong>
                  </div>
                </div>
              </div>

              {/* Layer 3: Macro Context Meter */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    Capa 3: Clima Macro
                  </span>
                  <span className="text-xs font-black text-blue-300">
                    {ml.layer3Macro.score}/100
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-blue-400 h-full rounded-full transition-all" 
                    style={{ width: `${ml.layer3Macro.score}%` }}
                  />
                </div>
                <div className="space-y-1 text-[11px] font-sans text-slate-400 pt-1">
                  <div className="flex justify-between">
                    <span>Clima Macro:</span>
                    <strong className="text-slate-200">{ml.layer3Macro.macroClimate}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Tendencia BTC:</span>
                    <strong className="text-slate-200">{ml.layer3Macro.btcTrend}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Sector Heat:</span>
                    <strong className="text-slate-200">{ml.layer3Macro.sectorHeatLevel}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Factor Tamaño:</span>
                    <strong className="text-blue-400">{ml.layer3Macro.sizingMultiplier}x</strong>
                  </div>
                </div>
              </div>

              {/* Layer 4: Memory & Expectancy Meter */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5" />
                    Capa 4: Memoria
                  </span>
                  <span className="text-xs font-black text-purple-300">
                    {ml.layer4Learning.score}/100
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-purple-400 h-full rounded-full transition-all" 
                    style={{ width: `${ml.layer4Learning.score}%` }}
                  />
                </div>
                <div className="space-y-1 text-[11px] font-sans text-slate-400 pt-1">
                  <div className="flex justify-between">
                    <span>Patrón Setup:</span>
                    <strong className="text-slate-200">{ml.layer4Learning.patternType}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Estado Histórico:</span>
                    <strong className={`${
                      ml.layer4Learning.expectancyStatus === 'PREFERRED' ? 'text-lime-400' : 'text-slate-200'
                    }`}>
                      {ml.layer4Learning.expectancyStatus}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Win Rate Setup:</span>
                    <strong className="text-slate-200">{ml.layer4Learning.patternWinRate}%</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Racha de Cartera:</span>
                    <strong className="text-purple-400">
                      {ml.layer4Learning.recentStreak > 0 ? `+${ml.layer4Learning.recentStreak} Wins` : `${ml.layer4Learning.recentStreak} Losses`}
                    </strong>
                  </div>
                </div>
              </div>

            </div>

            {/* Tactical Rationale */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-sans">
                {t('DICTAMEN CUANTITATIVO MULTI-CAPA', 'MULTI-LAYER QUANTITATIVE VERDICT')}
              </span>
              <p className="text-xs text-slate-300 font-mono mt-1 leading-relaxed">
                {lang === 'es' ? ml.reasonEs : ml.reasonEn}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-sans pt-2 border-t border-slate-900 text-slate-400">
                <span>{t('Tamaño sugerido:', 'Recommended size:')} <strong className="text-lime-400 font-mono">${ml.recommendedSizeUsd} USD</strong> ({ml.sizingMultiplier}x)</span>
                <span>{t('Take Profit:', 'Take Profit:')} <strong className="text-lime-400 font-mono">+{ml.targetTakeProfitPercent}%</strong></span>
                <span>{t('Stop Loss:', 'Stop Loss:')} <strong className="text-rose-400 font-mono">-{ml.stopLossPercent}%</strong></span>
                <span>{t('Trailing Stop:', 'Trailing Stop:')} <strong className="text-amber-400 font-mono">{ml.trailingStopPercent}%</strong></span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center bg-slate-950/40 rounded-lg border border-slate-800 text-slate-400">
            <Radio className="w-8 h-8 mx-auto text-slate-600 mb-2 animate-pulse" />
            <p className="text-xs font-sans">
              {t('Esperando señales del escáner en tiempo real para desplegar el análisis multi-capa...', 
                'Waiting for real-time scanner signals to deploy multi-layer analysis...')}
            </p>
          </div>
        )}
      </section>

    </div>
  );
};
