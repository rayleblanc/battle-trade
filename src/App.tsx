import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Settings, 
  Terminal, 
  Play, 
  Pause, 
  Activity, 
  FileText, 
  Volume2, 
  AlertTriangle, 
  CheckCircle, 
  Zap, 
  Clock, 
  Globe, 
  Plus, 
  DollarSign, 
  X,
  Languages,
  Cpu,
  RefreshCw,
  Send,
  Flame,
  Key,
  BarChart3,
  TrendingUp,
  Sliders,
  Layers
} from 'lucide-react';
import { 
  ChainId, 
  SystemConfig, 
  SystemHealth, 
  OpportunitySignal, 
  ActivePosition, 
  HistoricalTrade, 
  PerformanceMetrics, 
  SystemLog,
  MarketHeatMetrics,
  SetupExpectancy,
  Eip7702SessionConfig
} from './shared/types';
import { t } from './shared/utils';

interface LessonLearned {
  id: string;
  timestamp: number;
  tokenSymbol: string;
  pnlPercent: number;
  aiSuggestedAdjustment: string;
  confidenceFactor: number;
}

export default function App() {
  // Config & State
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [signals, setSignals] = useState<OpportunitySignal[]>([]);
  const [positions, setPositions] = useState<ActivePosition[]>([]);
  const [history, setHistory] = useState<HistoricalTrade[]>([]);
  const [lessons, setLessons] = useState<LessonLearned[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [lang, setLang] = useState<'es' | 'en'>('es');
  const [activeTab, setActiveTab] = useState<'signals' | 'positions' | 'history' | 'patterns' | 'eip7702' | 'health'>('signals');

  const [marketRegime, setMarketRegime] = useState<string>('MOMENTUM');
  const [adaptedTradeSize, setAdaptedTradeSize] = useState<number>(2.5);
  const [adaptedGoPlusScore, setAdaptedGoPlusScore] = useState<number>(85);
  
  const [marketHeat, setMarketHeat] = useState<MarketHeatMetrics | null>(null);
  const [setupExpectancies, setSetupExpectancies] = useState<SetupExpectancy[]>([]);
  const [eip7702Config, setEip7702Config] = useState<Eip7702SessionConfig | null>(null);
  const [provisioningKey, setProvisioningKey] = useState(false);

  // Web3 MetaMask states (Wagmi/Viem ready)
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);

  // Input states for Manual forced trades & parameter updates
  const [showManualBuyModal, setShowManualBuyModal] = useState(false);
  const [manualSymbol, setManualSymbol] = useState('');
  const [manualChain, setManualChain] = useState<ChainId>(ChainId.BASE);
  const [manualSize, setManualSize] = useState('2.5');

  // Log filter
  const [logFilter, setLogFilter] = useState<string>('ALL');

  // Custom AI quick analyze test
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<any>(null);

  // Fetch full state from backend
  const fetchState = async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setHealth(data.health);
        setSignals(data.signals);
        setPositions(data.positions);
        setHistory(data.history);
        setLessons(data.lessons || []);
        setMetrics(data.metrics);
        setLogs(data.logs);
        setMarketRegime(data.marketRegime || 'MOMENTUM');
        setAdaptedTradeSize(data.adaptedTradeSize || 2.5);
        setAdaptedGoPlusScore(data.adaptedGoPlusScore || 85);
        setMarketHeat(data.marketHeat || null);
        setSetupExpectancies(data.setupExpectancies || []);
        setEip7702Config(data.eip7702Config || null);
        if (data.config?.primaryLanguage) {
          setLang(data.config.primaryLanguage);
        }
      }
    } catch (e) {
      console.error('Error fetching backend state:', e);
    }
  };

  const handleProvisionEip7702Key = async () => {
    setProvisioningKey(true);
    try {
      const res = await fetch('/api/eip7702/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxDailyUsdSpend: config?.maxDailyExposureUsd || 20.0,
          routerAddress: '0x2626664c2603f2297d79d1dec4ec9780414cc22a'
        })
      });
      if (res.ok) {
        await fetchState();
      }
    } catch (e) {
      console.error('Error provisioning EIP-7702 key:', e);
    } finally {
      setProvisioningKey(false);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000); // refresh every 3 seconds for active trading feel
    return () => clearInterval(interval);
  }, []);

  const handleConfigUpdate = async (newFields: Partial<SystemConfig>) => {
    if (!config) return;
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFields),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        if (newFields.primaryLanguage) {
          setLang(newFields.primaryLanguage);
        }
      }
    } catch (e) {
      console.error('Error updating config:', e);
    }
  };

  const handleManualBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSymbol.trim()) return;
    try {
      const res = await fetch('/api/manual-buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: manualSymbol.toUpperCase(),
          chainId: manualChain,
          sizeUsd: parseFloat(manualSize) || 2.5
        }),
      });
      if (res.ok) {
        setShowManualBuyModal(false);
        setManualSymbol('');
        fetchState();
      }
    } catch (e) {
      console.error('Error executing manual trade:', e);
    }
  };

  const handleClosePosition = async (id: string) => {
    try {
      const res = await fetch('/api/manual-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId: id }),
      });
      if (res.ok) {
        fetchState();
      }
    } catch (e) {
      console.error('Error closing position:', e);
    }
  };

  const handleConnectWallet = async () => {
    setIsConnectingWallet(true);
    try {
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts && accounts[0]) {
          setWalletAddress(accounts[0]);
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 800));
        setWalletAddress('0x4b78ec775de6f6cc5d90df81e01f2f3d53e3f9c2');
      }
    } catch (e) {
      console.error('Wallet connection error:', e);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleAiTest = async (symbol: string, address: string, chain: ChainId) => {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenSymbol: symbol,
          tokenAddress: address,
          chainId: chain
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setAiTestResult(result);
      }
    } catch (e) {
      console.error('Error in Quick AI check:', e);
    } finally {
      setAiTesting(false);
    }
  };

  if (!config || !health) {
    return (
      <div id="loading-state" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center gap-4">
        <Activity className="animate-spin text-lime-400 w-12 h-12" />
        <p className="text-sm tracking-widest text-slate-400">CARGANDO MODO BATALLA TRADING ENGINE...</p>
      </div>
    );
  }

  const filteredLogs = logs.filter(log => {
    if (logFilter === 'ALL') return true;
    if (logFilter === 'TRADE') return log.level === 'TRADE' || log.module === 'EXECUTOR';
    if (logFilter === 'ERROR') return log.level === 'ERROR' || log.level === 'WARNING';
    if (logFilter === 'SCANNER') return log.module === 'SCANNER';
    return true;
  });

  return (
    <div id="app-root" className="min-h-screen bg-slate-950 text-slate-100 font-mono text-sm leading-relaxed antialiased selection:bg-lime-500 selection:text-slate-950">
      
      {/* HEADER / CONTROL BAR */}
      <header id="main-header" className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="p-2 bg-lime-500/10 border border-lime-500/20 rounded">
              <Zap className="text-lime-400 animate-pulse w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-lime-400 flex items-center gap-2">
                BATTLE TRADE <span className="text-xs px-2 py-0.5 bg-lime-500/10 text-lime-400 border border-lime-500/30 rounded uppercase">Base Priority</span>
              </h1>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                {t(lang, 'Sistema Autónomo de Trading de Memecoins', 'Autonomous Memecoin Trading System')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Simulation mode indicator */}
            <button 
              id="sim-mode-toggle"
              onClick={() => handleConfigUpdate({ simulationMode: !config.simulationMode })}
              className={`px-3 py-1.5 rounded border text-xs flex items-center gap-2 transition-all ${
                config.simulationMode 
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' 
                  : 'bg-rose-600/20 border-rose-600/40 text-rose-400 hover:bg-rose-600/30 font-bold'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>{config.simulationMode ? t(lang, ' MODO SIMULACIÓN', ' SIMULATION MODE') : t(lang, '¡MODO REAL ACTIVO!', 'REAL MODE ACTIVE!')}</span>
            </button>

            {/* Global Pause/Resume */}
            <button 
              id="global-pause-toggle"
              onClick={() => handleConfigUpdate({ globalPause: !config.globalPause })}
              className={`px-3 py-1.5 rounded border text-xs flex items-center gap-2 transition-all ${
                config.globalPause 
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20' 
                  : 'bg-lime-500/10 border-lime-500/30 text-lime-400 hover:bg-lime-500/20'
              }`}
            >
              {config.globalPause ? (
                <>
                  <Play className="w-4 h-4 text-rose-400 fill-rose-400/20" />
                  <span>{t(lang, 'REANUDAR', 'RESUME')}</span>
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 text-lime-400 fill-lime-400/20" />
                  <span>{t(lang, 'PAUSAR MOTOR', 'PAUSE ENGINE')}</span>
                </>
              )}
            </button>

            {/* MetaMask Wallet Connection */}
            <button 
              id="metamask-connect"
              onClick={handleConnectWallet}
              disabled={isConnectingWallet}
              className={`px-3 py-1.5 rounded border text-xs flex items-center gap-2 transition-all ${
                walletAddress 
                  ? 'bg-lime-500/10 border-lime-500/30 text-lime-400 font-bold' 
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${walletAddress ? 'bg-lime-400 animate-pulse' : 'bg-slate-600'}`}></span>
              <span>
                {isConnectingWallet 
                  ? t(lang, 'Conectando...', 'Connecting...') 
                  : walletAddress 
                    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` 
                    : t(lang, 'Conectar MetaMask', 'Connect MetaMask')}
              </span>
            </button>

            {/* Language Switch */}
            <button 
              id="lang-switch"
              onClick={() => handleConfigUpdate({ primaryLanguage: lang === 'es' ? 'en' : 'es' })}
              className="p-2 border border-slate-800 rounded bg-slate-900 hover:bg-slate-800 text-slate-300"
              title="Cambiar idioma / Switch Language"
            >
              <Languages className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">

        {/* METRICS & QUICK SUMMARY */}
        <section id="metrics-summary" className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-sans uppercase">
              <DollarSign className="w-3.5 h-3.5 text-lime-400" />
              {t(lang, 'Capital Simulador', 'Simulation Capital')}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-100">${metrics?.currentCapitalUsd?.toFixed(2) || '100.00'}</span>
              <span className="text-[10px] text-lime-400">USD</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-sans uppercase">
              <CheckCircle className="w-3.5 h-3.5 text-lime-400" />
              {t(lang, 'Win Rate Global', 'Global Win Rate')}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold text-lime-400">{metrics?.winRate || '0'}%</span>
              <span className="text-[10px] text-slate-400 font-sans">({metrics?.winningTrades || 0}/{metrics?.totalTrades || 0})</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-sans uppercase">
              <Activity className="w-3.5 h-3.5 text-rose-400" />
              {t(lang, 'Max Drawdown', 'Max Drawdown')}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold text-rose-400">-{metrics?.maxDrawdownPercent?.toFixed(1) || '0.0'}%</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-sans uppercase">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              {t(lang, 'Profit Factor', 'Profit Factor')}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold text-blue-400">{metrics?.profitFactor?.toFixed(2) || '0.00'}</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-sans uppercase">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              {t(lang, 'Expectativa (USD)', 'Expectancy (USD)')}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-xl font-bold ${(metrics?.expectancyUsd || 0) >= 0 ? 'text-lime-400' : 'text-rose-400'}`}>
                {(metrics?.expectancyUsd || 0) >= 0 ? '+' : ''}{metrics?.expectancyUsd?.toFixed(2) || '0.00'}
              </span>
              <span className="text-[10px] text-slate-400 font-sans">per trade</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-sans uppercase">
              <Activity className="w-3.5 h-3.5 text-lime-400" />
              {t(lang, 'Posiciones Activas', 'Active Positions')}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-100">{positions.length}</span>
              <span className="text-[10px] text-slate-400 font-sans">/ {config.maxDailyExposureUsd / config.maxTradeSizeUsd} {t(lang, 'max', 'max')}</span>
            </div>
          </div>
        </section>

        {/* ADAPTIVE LEARNING & MARKET REGIME PANEL */}
        <section id="adaptive-learning-panel" className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-4 space-y-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-3 border-b border-slate-800/60">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-lime-400 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-lime-400 animate-pulse" />
                {t(lang, 'PANEL ADAPTATIVO DE APRENDIZAJE Y REGIMEN', 'ADAPTIVE LEARNING & MARKET REGIME PANEL')}
              </h2>
              <p className="text-[11px] text-slate-400 font-sans mt-1">
                {t(lang, 'El motor evalúa las rachas de pérdidas y la liquidez global de DEX Screener para reajustar los límites de riesgo de forma autónoma.', 'The engine evaluates loss streaks and DEX Screener global liquidity to adjust risk limits autonomously.')}
              </p>
            </div>
            
            {/* Market Regime Badge */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-sans">{t(lang, 'Régimen Activo:', 'Active Regime:')}</span>
              <span className={`text-xs font-black px-2 py-0.5 rounded border ${
                marketRegime === 'HIGH_VOLATILITY' 
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse'
                  : marketRegime === 'MOMENTUM'
                    ? 'bg-lime-500/10 border-lime-500/30 text-lime-400'
                    : marketRegime === 'CHOPPY'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-slate-500/10 border-slate-500/30 text-slate-400'
              }`}>
                {marketRegime === 'HIGH_VOLATILITY' && t(lang, '🚀 VOLATILIDAD EXTREMA', '🚀 HIGH VOLATILITY')}
                {marketRegime === 'MOMENTUM' && t(lang, '📈 TRENDING MOMENTUM', '📈 TRENDING MOMENTUM')}
                {marketRegime === 'CHOPPY' && t(lang, '🌪️ MERCADO PICADO (CHOPPY)', '🌪️ CHOPPY MARKET')}
                {marketRegime === 'DEAD' && t(lang, '💤 MERCADO APÁTICO / SIN VOLUMEN', '💤 DEAD / APATHETIC MARKET')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Metric 1: Adaptive position size */}
            <div className="bg-slate-950/40 p-3 rounded border border-slate-800/60 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-sans block">{t(lang, 'TAMAÑO DE TICKET ADAPTADO', 'ADAPTED TICKET SIZE')}</span>
                <span className="text-lg font-black text-slate-200 mt-1 block">${adaptedTradeSize.toFixed(2)} <span className="text-xs text-slate-500">USD</span></span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-500 block">{t(lang, 'Configurado original:', 'Original config:')}</span>
                <span className="text-xs font-bold text-slate-400 block">${config.maxTradeSizeUsd.toFixed(2)}</span>
                {adaptedTradeSize < config.maxTradeSizeUsd && (
                  <span className="text-[9px] text-rose-400 font-bold bg-rose-500/10 border border-rose-500/20 px-1 py-0.2 rounded mt-1 block inline-block">Defensa Activa</span>
                )}
              </div>
            </div>

            {/* Metric 2: Adaptive GoPlus security */}
            <div className="bg-slate-950/40 p-3 rounded border border-slate-800/60 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-sans block">{t(lang, 'SCORE DE AUDITORÍA REQUERIDO', 'ADAPTED SECURITY SCORE')}</span>
                <span className="text-lg font-black text-slate-200 mt-1 block">{adaptedGoPlusScore} <span className="text-xs text-slate-500">/ 100</span></span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-500 block">{t(lang, 'Configurado original:', 'Original config:')}</span>
                <span className="text-xs font-bold text-slate-400 block">{config.goplusMinScore}</span>
                {adaptedGoPlusScore > config.goplusMinScore && (
                  <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded mt-1 block inline-block">Filtros Exigentes</span>
                )}
              </div>
            </div>

            {/* Metric 3: Expectancy & Streak */}
            <div className="bg-slate-950/40 p-3 rounded border border-slate-800/60 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-sans block">{t(lang, 'MEMORIA DE PATRONES', 'PATTERN MEMORY STATE')}</span>
                <span className="text-xs font-bold text-slate-200 mt-1 block flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse"></span>
                  {t(lang, 'Estabilidad de Setups: ÓPTIMA', 'Setup expectancy: OPTIMAL')}
                </span>
                <p className="text-[9px] text-slate-500 mt-1">
                  {marketRegime === 'DEAD' 
                    ? t(lang, 'Evitando tokens ilíquidos en mercado apático.', 'Avoiding illiquid pairs in dead markets.') 
                    : t(lang, 'Evaluando velocidad y lp locked en vivo.', 'Evaluating live velocity & lp locked.')}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-500 block">{t(lang, 'Racha global:', 'Global streak:')}</span>
                <span className={`text-xs font-black block ${
                  history.length > 0 && history[0].pnlPercent < 0 ? 'text-rose-400' : 'text-lime-400'
                }`}>
                  {history.length > 0 && history[0].pnlPercent < 0 ? 'DEFENSIVA (1-Loss)' : 'ACRECIENTE (Normal)'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* CONTROLS & MANUAL EXECUTIONS */}
        <section id="tactical-actions" className="flex flex-wrap gap-3 items-center">
          <button 
            id="manual-buy-btn"
            onClick={() => setShowManualBuyModal(true)}
            className="px-4 py-2 bg-lime-500 text-slate-950 font-bold rounded hover:bg-lime-400 active:scale-95 transition-all text-xs flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t(lang, 'COMPRAR PAR MANUALMENTE', 'BUY PAIR MANUALLY')}
          </button>
          
          <div className="h-6 w-[1px] bg-slate-800 hidden md:block"></div>

          {/* Quick Config Toggles */}
          <div className="flex items-center gap-4 bg-slate-900/40 px-4 py-1.5 rounded border border-slate-800/80">
            <label className="text-xs text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-lime-400 rounded-full"></span>
              Max Trade Usd:
              <input 
                type="number" 
                value={config.maxTradeSizeUsd} 
                onChange={(e) => handleConfigUpdate({ maxTradeSizeUsd: parseFloat(e.target.value) || 2.5 })}
                className="w-14 bg-slate-950 text-slate-100 text-xs px-1.5 py-0.5 border border-slate-800 rounded font-bold text-center focus:outline-none focus:border-lime-500"
              />
            </label>
            <label className="text-xs text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-lime-400 rounded-full"></span>
              Exposure Limit:
              <input 
                type="number" 
                value={config.maxDailyExposureUsd} 
                onChange={(e) => handleConfigUpdate({ maxDailyExposureUsd: parseFloat(e.target.value) || 15 })}
                className="w-14 bg-slate-950 text-slate-100 text-xs px-1.5 py-0.5 border border-slate-800 rounded font-bold text-center focus:outline-none focus:border-lime-500"
              />
            </label>
          </div>
        </section>

        {/* PRIMARY SPLIT DASHBOARD LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* TAB SYSTEM (2 COLS) */}
          <div className="lg:col-span-2 space-y-4">
            
            <div id="dashboard-tabs" className="flex flex-wrap border-b border-slate-800 bg-slate-900/30 p-1 rounded-t-lg gap-2">
              <button 
                onClick={() => setActiveTab('signals')}
                className={`px-3 py-1.5 text-xs font-bold transition-all rounded ${
                  activeTab === 'signals' 
                    ? 'bg-slate-800 text-lime-400 border-b-2 border-lime-500' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t(lang, '🔥 SEÑALES / PROPUESTAS', '🔥 SIGNALS / PROPOSALS')}
              </button>
              <button 
                onClick={() => setActiveTab('positions')}
                className={`px-3 py-1.5 text-xs font-bold transition-all rounded relative ${
                  activeTab === 'positions' 
                    ? 'bg-slate-800 text-lime-400 border-b-2 border-lime-500' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t(lang, '📈 POSICIONES ABIERTAS', '📈 ACTIVE POSITIONS')}
                {positions.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-lime-500 text-slate-950 rounded-full px-1.5 py-0.2 text-[10px] font-black animate-pulse">
                    {positions.length}
                  </span>
                )}
              </button>
              <button 
                onClick={() => setActiveTab('patterns')}
                className={`px-3 py-1.5 text-xs font-bold transition-all rounded ${
                  activeTab === 'patterns' 
                    ? 'bg-slate-800 text-lime-400 border-b-2 border-lime-500' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t(lang, '🧠 MATRIZ DE PATRONES', '🧠 PATTERN MATRIX')}
              </button>
              <button 
                onClick={() => setActiveTab('eip7702')}
                className={`px-3 py-1.5 text-xs font-bold transition-all rounded ${
                  activeTab === 'eip7702' 
                    ? 'bg-slate-800 text-lime-400 border-b-2 border-lime-500' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t(lang, '🔑 SESSION KEYS EIP-7702', '🔑 SESSION KEYS EIP-7702')}
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 text-xs font-bold transition-all rounded ${
                  activeTab === 'history' 
                    ? 'bg-slate-800 text-lime-400 border-b-2 border-lime-500' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t(lang, '🏛️ HISTORIAL', '🏛️ TRADE HISTORY')}
              </button>
              <button 
                onClick={() => setActiveTab('health')}
                className={`px-3 py-1.5 text-xs font-bold transition-all rounded ${
                  activeTab === 'health' 
                    ? 'bg-slate-800 text-lime-400 border-b-2 border-lime-500' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t(lang, '🩺 SALUD DEL MOTOR', '🩺 SYSTEM HEALTH')}
              </button>
            </div>

            {/* TAB CONTENT: SIGNALS */}
            {activeTab === 'signals' && (
              <div id="signals-container" className="space-y-4">
                {signals.length === 0 ? (
                  <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-12 text-center">
                    <Activity className="mx-auto w-8 h-8 text-slate-600 mb-3 animate-pulse" />
                    <p className="text-slate-500 text-xs tracking-wider">
                      {t(lang, 'BUSCANDO NUEVAS OPORTUNIDADES EN BASE/BSC...', 'SEARCHING FOR NEW OPPORTUNITIES ON BASE/BSC...')}
                    </p>
                  </div>
                ) : (
                  signals.map((sig) => (
                    <div key={sig.id} className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4 space-y-3 hover:border-slate-700/80 transition-all">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-100">${sig.token.symbol}</span>
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                              {sig.token.chainId.toUpperCase()}
                            </span>
                            <span className="text-[10px] bg-slate-800 text-lime-400 px-2 py-0.5 rounded border border-lime-500/20">
                              {sig.token.dexName}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">{sig.token.name} • {sig.token.address.slice(0, 10)}...</p>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-bold ${sig.decision.action === 'BUY' ? 'text-lime-400' : 'text-rose-400'}`}>
                            {sig.decision.action} ({sig.decision.score}/100)
                          </div>
                          <span className="text-[10px] text-slate-400 flex items-center justify-end gap-1 font-sans mt-1">
                            <Clock className="w-3 h-3" />
                            {new Date(sig.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-950/50 p-2.5 rounded border border-slate-900">
                        <div>
                          <div className="text-[10px] text-slate-500">Liquidez</div>
                          <div className="text-xs text-slate-300 font-bold">${sig.token.liquidityUsd.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Impuestos (B/S)</div>
                          <div className="text-xs text-slate-300 font-bold">{sig.security.buyTax}% / {sig.security.sellTax}%</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Seguridad GoPlus</div>
                          <div className="text-xs text-lime-400 font-bold">{sig.security.goplusScore}/100</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">LP Lock / Burn</div>
                          <div className="text-xs text-slate-300 font-bold">{sig.security.lpLockedPercent.toFixed(1)}%</div>
                        </div>
                      </div>

                      <div className="text-xs bg-slate-950/40 border border-slate-900 p-2.5 rounded-lg flex items-start gap-2">
                        <Cpu className="w-4 h-4 text-lime-400 mt-0.5 shrink-0" />
                        <div>
                          <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider">AI Rationale ({sig.decision.providerUsed}):</span>
                          <p className="text-slate-300 mt-0.5">{t(lang, sig.decision.reasonEs, sig.decision.reasonEn)}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <span className="text-[10px] text-slate-500">
                          {t(lang, `Motor: ${sig.decision.providerUsed}`, `Engine: ${sig.decision.providerUsed}`)}
                        </span>
                        
                        <button 
                          onClick={() => handleAiTest(sig.token.symbol, sig.token.address, sig.token.chainId)}
                          className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 hover:text-white transition-all text-[10px] flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: aiTesting ? '2s' : '0s' }} />
                          {t(lang, 'Re-analizar con Gemini AI', 'Re-analyze with Gemini AI')}
                        </button>
                      </div>

                      {/* Display quick Gemini live results */}
                      {aiTestResult && sig.token.address === aiTestResult.address && (
                        <div className="p-3 bg-lime-500/5 border border-lime-500/20 rounded mt-2">
                          <div className="text-[10px] text-lime-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                            <SparklesIcon className="w-3.5 h-3.5" />
                            Live Gemini Analysis Output:
                          </div>
                          <p className="text-xs text-slate-200 mt-1">{t(lang, aiTestResult.reasonEs, aiTestResult.reasonEn)}</p>
                          <div className="text-[10px] text-slate-400 mt-1">Suggested Size: ${aiTestResult.recommendedSizeUsd} | Target: +{aiTestResult.targetTakeProfitPercent}%</div>
                        </div>
                      )}

                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB CONTENT: POSITIONS */}
            {activeTab === 'positions' && (
              <div id="positions-container" className="space-y-4">
                {positions.length === 0 ? (
                  <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-12 text-center">
                    <CheckCircle className="mx-auto w-8 h-8 text-lime-500 mb-3" />
                    <p className="text-slate-400 text-xs">
                      {t(lang, 'No hay posiciones de trading abiertas en este momento.', 'No active trading positions currently open.')}
                    </p>
                  </div>
                ) : (
                  positions.map((pos) => (
                    <div key={pos.id} className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4 space-y-3 hover:border-slate-700/80 transition-all">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-100">${pos.symbol}</span>
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                              {pos.chainId.toUpperCase()}
                            </span>
                            <span className="text-[10px] bg-lime-500/10 text-lime-400 px-1.5 py-0.2 rounded border border-lime-500/30 font-bold uppercase">
                              Active Track
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">{pos.name} • {pos.tokenAddress.slice(0, 10)}...</p>
                        </div>
                        <div className="text-right">
                          <div className={`text-base font-black ${pos.pnlUsd >= 0 ? 'text-lime-400' : 'text-rose-500'}`}>
                            {pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%
                          </div>
                          <div className={`text-xs ${pos.pnlUsd >= 0 ? 'text-lime-400' : 'text-rose-500'}`}>
                            ({pos.pnlUsd >= 0 ? '+' : ''}${pos.pnlUsd.toFixed(2)} USD)
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-950/50 p-2.5 rounded border border-slate-900">
                        <div>
                          <div className="text-[10px] text-slate-500">Costo Entrada</div>
                          <div className="text-xs text-slate-300 font-bold">${pos.buyPriceUsd.toFixed(5)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Precio Actual</div>
                          <div className="text-xs text-slate-300 font-bold">${pos.currentPriceUsd.toFixed(5)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Monto Comprado</div>
                          <div className="text-xs text-slate-300 font-bold">${pos.sizeUsd.toFixed(2)} USD</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Tiempo Abierto</div>
                          <div className="text-xs text-slate-300 font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3 text-lime-400" />
                            {Math.round((Date.now() - pos.buyTimestamp) / 60000)} min
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 bg-slate-950/30 p-2.5 rounded border border-slate-900 text-[10px] text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-lime-400"></span>
                          Take Profit: +{pos.targetTakeProfitPercent}%
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          Stop Loss: -{pos.stopLossPercent}%
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                          Trailing Stop: {pos.trailingStopPercent}%
                        </div>
                        <div className="ml-auto flex items-center gap-1 text-lime-400 font-bold uppercase">
                          {pos.isPrincipalRecovered ? '¡Costo Base Recuperado!' : 'Principal Pendiente'}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <span className="text-[10px] text-slate-500">
                          {pos.isSimulation ? '• SIMULATION ACTIVE •' : '• REAL CONTRACT ACTIVE •'}
                        </span>
                        
                        <button 
                          onClick={() => handleClosePosition(pos.id)}
                          className="px-3 py-1 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded hover:bg-rose-500/20 transition-all text-xs font-bold"
                        >
                          {t(lang, 'VENDER / CERRAR POSICIÓN', 'SELL / CLOSE POSITION')}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB CONTENT: HISTORY */}
            {activeTab === 'history' && (
              <div id="history-container" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left Column: List of Historical Trades */}
                <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-lime-400">{t(lang, 'Historial de Operaciones', 'Historical Trades')}</h3>
                    <span className="text-[10px] text-slate-400">Max 50 trades</span>
                  </div>
                  {history.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      {t(lang, 'No se han cerrado operaciones todavía.', 'No closed trades recorded yet.')}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/80">
                      {history.map((trade) => (
                        <div key={trade.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-900/20 transition-all">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-100">${trade.symbol}</span>
                              <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded">
                                {trade.chainId.toUpperCase()}
                              </span>
                              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase border ${
                                trade.exitReason === 'TAKE_PROFIT' 
                                  ? 'bg-lime-500/10 border-lime-500/30 text-lime-400' 
                                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                              }`}>
                                {trade.exitReason}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">
                              Buy: ${trade.buyPriceUsd.toFixed(5)} • Sell: ${trade.sellPriceUsd.toFixed(5)} • {new Date(trade.sellTimestamp).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-black ${trade.pnlUsd >= 0 ? 'text-lime-400' : 'text-rose-500'}`}>
                              {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(1)}%
                            </div>
                            <div className={`text-[11px] ${trade.pnlUsd >= 0 ? 'text-lime-400' : 'text-rose-500'}`}>
                              ({trade.pnlUsd >= 0 ? '+' : ''}${trade.pnlUsd.toFixed(2)} USD)
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Column: AI Auto-Improvement (Lessons Learned) */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-4 space-y-4">
                  <div>
                    <h3 className="text-xs font-bold uppercase text-lime-400 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-lime-400" />
                      {t(lang, 'AUTO-MEJORA CON IA (Lessons Learned)', 'AI AUTO-IMPROVEMENT (Lessons Learned)')}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {t(lang, 'El motor evalúa automáticamente los trades previos para reajustar umbrales del LLM.', 'The engine automatically reviews past trades to fine-tune LLM criteria.')}
                    </p>
                  </div>

                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {lessons.length === 0 ? (
                      <div className="text-center p-6 text-xs text-slate-500 border border-dashed border-slate-800 rounded bg-slate-950/20">
                        {t(lang, 'Evaluando primer lote de operaciones...', 'Analyzing first batch of trades...')}
                      </div>
                    ) : (
                      lessons.map((lesson) => (
                        <div key={lesson.id} className="bg-slate-950/70 p-3 rounded border border-slate-800/60 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-xs text-slate-200">${lesson.tokenSymbol}</span>
                            <span className={`text-[10px] font-bold ${lesson.pnlPercent >= 0 ? 'text-lime-400' : 'text-rose-400'}`}>
                              PnL: {lesson.pnlPercent >= 0 ? '+' : ''}{lesson.pnlPercent.toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-300 leading-relaxed italic">
                            "{lesson.aiSuggestedAdjustment}"
                          </p>
                          <div className="flex items-center justify-between text-[9px] text-slate-500 pt-1 border-t border-slate-900">
                            <span>Confianza: {lesson.confidenceFactor}%</span>
                            <span>{new Date(lesson.timestamp).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: PATTERNS */}
            {activeTab === 'patterns' && (
              <div id="patterns-container" className="space-y-4">
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4 space-y-4">
                  <div>
                    <h3 className="text-xs font-bold uppercase text-lime-400 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-lime-400" />
                      {t(lang, 'MEMORIA DE PATRONES Y MATRIZ DE EXPECTATIVA MATEMÁTICA', 'PATTERN MEMORY & MATHEMATICAL EXPECTANCY MATRIX')}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {t(lang, 'El motor clasifica cada oportunidad en un patrón histórico y ajusta el tamaño de posición automáticamente. Los patrones con expectancy negativa son BLOQUEADOS.', 'The engine classifies candidates into historical patterns and adapts position sizing automatically. Setups with negative expectancy are BLOCKED.')}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {setupExpectancies.map((exp) => (
                      <div key={exp.patternType} className="bg-slate-950/80 p-4 rounded-lg border border-slate-800/80 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-xs font-bold text-slate-100 block">{lang === 'es' ? exp.nameEs : exp.nameEn}</span>
                            <span className="text-[10px] text-slate-500 font-mono">{exp.patternType}</span>
                          </div>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase ${
                            exp.status === 'PREFERRED' 
                              ? 'bg-lime-500/10 border-lime-500/30 text-lime-400'
                              : exp.status === 'NEUTRAL'
                                ? 'bg-slate-800 border-slate-700 text-slate-300'
                                : exp.status === 'PENALIZED'
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse'
                          }`}>
                            {exp.status} ({exp.allocationMultiplier}x)
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-900 text-center">
                          <div>
                            <span className="text-[9px] text-slate-500 block">{t(lang, 'Win Rate:', 'Win Rate:')}</span>
                            <span className="text-xs font-black text-lime-400">{exp.winRate}%</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-500 block">{t(lang, 'Trades:', 'Trades:')}</span>
                            <span className="text-xs font-bold text-slate-200">{exp.totalTrades}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-500 block">{t(lang, 'Expectancy:', 'Expectancy:')}</span>
                            <span className={`text-xs font-black ${exp.expectancyPercent >= 0 ? 'text-lime-400' : 'text-rose-400'}`}>
                              {exp.expectancyPercent >= 0 ? '+' : ''}{exp.expectancyPercent}%
                            </span>
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-400 bg-slate-900/50 p-2 rounded">
                          {exp.status === 'BLOCKED' && t(lang, '⚠️ Desactivado automáticamente. El bot descarta estas entradas hasta que cambien las condiciones.', '⚠️ Automatically disabled. The bot skips these entries until market conditions change.')}
                          {exp.status === 'PREFERRED' && t(lang, '✨ Máxima prioridad. El bot amplía el capital asignado a este setup (+30%).', '✨ High priority. The bot boosts allocation for this setup (+30%).')}
                          {exp.status === 'PENALIZED' && t(lang, '⚠️ Exposición reducida (-50%) debido a resultados recientes irregulares.', '⚠️ Reduced exposure (-50%) due to inconsistent recent results.')}
                          {exp.status === 'NEUTRAL' && t(lang, '⚖️ Operación estándar con tamaño de ticket base adaptativo.', '⚖️ Standard trading with baseline adaptive ticket sizing.')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: EIP-7702 SESSION KEYS */}
            {activeTab === 'eip7702' && (
              <div id="eip7702-container" className="space-y-4">
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4 space-y-4">
                  <div>
                    <h3 className="text-xs font-bold uppercase text-lime-400 flex items-center gap-2">
                      <Key className="w-4 h-4 text-lime-400" />
                      {t(lang, 'SIMULADOR & PROVISIONAMIENTO DE DELEGACIÓN EIP-7702', 'EIP-7702 DELEGATION PROVISIONING & SIMULATOR')}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {t(lang, 'EIP-7702 permite convertir EOA (MetaMask) en Smart Accounts temporales sin migrar fondos, otorgando Session Keys con límites de gasto diario estrictos.', 'EIP-7702 converts EOAs (MetaMask) into temporary Smart Accounts without migrating funds, granting Session Keys with daily spending limits.')}
                    </p>
                  </div>

                  {/* Provisioning Status Box */}
                  <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">{t(lang, 'Estado de Session Key EIP-7702', 'EIP-7702 Session Key Status')}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {eip7702Config?.sessionKeyAddress || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'}
                        </span>
                      </div>

                      <button 
                        onClick={handleProvisionEip7702Key}
                        disabled={provisioningKey}
                        className="px-3 py-1.5 bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold rounded text-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${provisioningKey ? 'animate-spin' : ''}`} />
                        <span>{provisioningKey ? t(lang, 'Generando Clave...', 'Generating Key...') : t(lang, 'PROVISIONAR NUEVA CLAVE EIP-7702', 'PROVISION NEW EIP-7702 KEY')}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-900 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block">{t(lang, 'Estado:', 'Status:')}</span>
                        <span className={`font-bold ${eip7702Config?.status === 'ACTIVE' ? 'text-lime-400' : 'text-slate-400'}`}>
                          {eip7702Config?.status || 'NOT_PROVISIONED'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">{t(lang, 'Límite Diario Usd:', 'Daily Usd Limit:')}</span>
                        <span className="font-bold text-slate-100">${eip7702Config?.maxDailyUsdSpend || 20.0} USD</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">{t(lang, 'Gastado Hoy:', 'Spent Today:')}</span>
                        <span className="font-bold text-slate-100">${eip7702Config?.currentUsdSpent || 0.0} USD</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">{t(lang, 'Router Objetivo:', 'Target Router:')}</span>
                        <span className="font-mono text-[10px] text-slate-400 truncate block">
                          {eip7702Config?.targetDexRouter?.slice(0, 10) || '0x2626...22a'}...
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Execution Parameters Simulator */}
                  <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-lime-400" />
                      {t(lang, 'Parámetros de Simulación de Ejecución en Vivo', 'Live Execution Simulation Parameters')}
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1.5">
                        <label className="text-slate-400 block text-[11px] flex justify-between">
                          <span>{t(lang, 'Slippage Simulado (%):', 'Simulated Slippage (%):')}</span>
                          <span className="font-bold text-lime-400">{config?.simulatedSlippagePercent || 1.5}%</span>
                        </label>
                        <input 
                          type="range" 
                          min="0.5" 
                          max="5.0" 
                          step="0.1" 
                          value={config?.simulatedSlippagePercent || 1.5}
                          onChange={(e) => handleConfigUpdate({ simulatedSlippagePercent: parseFloat(e.target.value) })}
                          className="w-full accent-lime-400 bg-slate-900 rounded"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-slate-400 block text-[11px] flex justify-between">
                          <span>{t(lang, 'Latencia de Enrutado RPC (ms):', 'RPC Routing Latency (ms):')}</span>
                          <span className="font-bold text-lime-400">{config?.simulatedLatencyMs || 250} ms</span>
                        </label>
                        <input 
                          type="range" 
                          min="50" 
                          max="1000" 
                          step="25" 
                          value={config?.simulatedLatencyMs || 250}
                          onChange={(e) => handleConfigUpdate({ simulatedLatencyMs: parseInt(e.target.value) })}
                          className="w-full accent-lime-400 bg-slate-900 rounded"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'health' && (
              <div id="health-container" className="space-y-4">
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4">
                  <h3 className="text-xs font-bold uppercase text-lime-400 mb-4 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-lime-400" />
                    {t(lang, 'ESTADO DE ENDPOINTS RPC (Auto-Rotación)', 'RPC ENDPOINTS HEALTH (Auto-Rotation)')}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {health.rpcEndpoints.map((rpc, idx) => (
                      <div key={idx} className="bg-slate-950/60 p-3 rounded border border-slate-900 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-200 truncate">{rpc.name}</div>
                          <div className="text-[10px] text-slate-500 truncate">{rpc.url}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            rpc.isHealthy ? 'bg-lime-500/10 text-lime-400' : 'bg-rose-500/10 text-rose-400'
                          }`}>
                            {rpc.isHealthy ? 'Healthy' : 'Error'}
                          </span>
                          <div className="text-[10px] text-slate-400 font-mono mt-1">~120ms</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4">
                  <h3 className="text-xs font-bold uppercase text-lime-400 mb-4 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-lime-400" />
                    {t(lang, 'SALUD DE PROVEEDORES LLM (Failsafe)', 'LLM PROVIDERS STATUS (Failsafe)')}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {health.llmProviders.map((llm, idx) => (
                      <div key={idx} className="bg-slate-950/60 p-3 rounded border border-slate-900 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold text-slate-200">{llm.name}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Model: {llm.currentModel && (
                                (llm.name === 'Gemini' && llm.currentModel.includes('gemini')) || 
                                (llm.name === 'Groq' && !llm.currentModel.includes('gemini'))
                              ) 
                              ? llm.currentModel 
                              : (llm.name === 'Gemini' ? 'gemini-3.8-flash' : 'llama-3.3-70b-versatile')}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            llm.circuitBreakerTripped 
                              ? 'bg-rose-500/10 text-rose-400'
                              : !llm.isHealthy
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-lime-500/10 text-lime-400'
                          }`}>
                            {llm.circuitBreakerTripped ? 'Cooldown' : !llm.isHealthy ? 'Degraded' : 'Active'}
                          </span>
                          <div className="text-[10px] text-slate-400 font-mono mt-1">
                            {llm.latencyMs > 0 ? `${llm.latencyMs}ms` : 'Ready'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* SYSTEM SIDE LOGS & TACTICAL CONSOLE (1 COL) */}
          <div className="space-y-4">
            <div id="tactical-logs-console" className="bg-slate-900/60 border border-slate-800/80 rounded-lg overflow-hidden flex flex-col h-[520px]">
              
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
                <span className="text-xs font-bold tracking-wider text-lime-400 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-lime-400" />
                  BATTLE LOGS
                </span>
                
                {/* Filter Log Selector */}
                <select 
                  value={logFilter} 
                  onChange={(e) => setLogFilter(e.target.value)}
                  className="bg-slate-950 text-[10px] text-slate-400 border border-slate-800 rounded px-1.5 py-0.5 focus:outline-none"
                >
                  <option value="ALL">ALL EVENTS</option>
                  <option value="TRADE">ONLY TRADES</option>
                  <option value="ERROR">ERRORS/WARNINGS</option>
                  <option value="SCANNER">SCANNER ONLY</option>
                </select>
              </div>

              {/* Log Messages */}
              <div className="p-3 space-y-2.5 overflow-y-auto flex-1 font-mono text-[11px] bg-slate-950/40">
                {filteredLogs.map((log) => {
                  let color = 'text-slate-400';
                  if (log.level === 'SUCCESS') color = 'text-lime-400';
                  if (log.level === 'ERROR') color = 'text-rose-500';
                  if (log.level === 'WARNING') color = 'text-amber-500';
                  if (log.level === 'TRADE') color = 'text-lime-400 font-bold';

                  return (
                    <div key={log.id} className="leading-tight border-b border-slate-900/50 pb-1.5">
                      <span className="text-slate-600 mr-1.5">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      <span className={`text-[10px] uppercase font-bold mr-1.5 px-1 bg-slate-900 border border-slate-800 text-slate-400 rounded`}>
                        {log.module}
                      </span>
                      <span className={color}>{t(lang, log.messageEs, log.messageEn)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 border-t border-slate-800 bg-slate-900/40">
                <p className="text-[10px] text-slate-500 text-center uppercase tracking-wider">
                  {t(lang, 'CONSOLA TÁCTICA DEL MOTOR EN VIVO', 'LIVE ENGINE TACTICAL CONSOLE')}
                </p>
              </div>

            </div>
          </div>

        </div>

      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950 py-8 px-4 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-sans">
          <p>© 2026 Base Memecoin Battle Trading Engine. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#README" className="hover:text-slate-300">README</a>
            <span className="text-slate-800">•</span>
            <span className="text-rose-500 font-bold uppercase tracking-wider">High risk warning</span>
          </div>
        </div>
      </footer>

      {/* MANUAL BUY MODAL */}
      {showManualBuyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 max-w-md w-full rounded-lg overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-lime-400">{t(lang, 'FORZAR COMPRA MANUAL', 'FORCE MANUAL BUY')}</h3>
              <button onClick={() => setShowManualBuyModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualBuy} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Símbolo del Token</label>
                <input 
                  type="text" 
                  value={manualSymbol}
                  onChange={(e) => setManualSymbol(e.target.value)}
                  placeholder="e.g. MIAU"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded p-2 text-xs focus:outline-none focus:border-lime-500 font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Cadena (Blockchain)</label>
                <select 
                  value={manualChain}
                  onChange={(e) => setManualChain(e.target.value as ChainId)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded p-2 text-xs focus:outline-none focus:border-lime-500"
                >
                  <option value={ChainId.BASE}>Base Network</option>
                  <option value={ChainId.BSC}>BNB Smart Chain</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Monto de Entrada (USD)</label>
                <input 
                  type="number" 
                  value={manualSize}
                  onChange={(e) => setManualSize(e.target.value)}
                  step="0.1"
                  min="0.5"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded p-2 text-xs focus:outline-none focus:border-lime-500 font-bold"
                  required
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit" 
                  className="w-full py-2 bg-lime-500 text-slate-950 font-bold rounded hover:bg-lime-400 transition-all text-xs"
                >
                  {t(lang, 'EJECUTAR COMPRA SIMULADA', 'EXECUTE SIMULATED BUY')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// Sparkles fallback icon
function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="m5 3 1 2.5L8.5 6 6 7 5 9.5 4 7 1.5 6 4 5.5z" />
      <path d="m19 17 1 2.5 2.5.5-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" />
    </svg>
  );
}
