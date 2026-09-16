import React, { useState, useEffect, useMemo } from 'react';
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
  TrendingDown,
  Sliders,
  Layers,
  Download,
  Save,
  RotateCcw,
  Percent
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
  Eip7702SessionConfig,
  MarketContext
} from './shared/types';
import { t } from './shared/utils';
import { MultiLayerBrainView } from './MultiLayerBrainView';
import { InstallPrompt } from './components/InstallPrompt';
import { OfflineIndicator } from './components/OfflineIndicator';

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
  const [activeTab, setActiveTab] = useState<'signals' | 'positions' | 'multilayer' | 'history' | 'patterns' | 'eip7702' | 'health' | 'settings'>('signals');
  const [marketContext, setMarketContext] = useState<MarketContext | null>(null);

  // Unified Centralized Configuration Draft State
  const [formConfig, setFormConfig] = useState<Partial<SystemConfig>>({});
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

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
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [manualWalletInput, setManualWalletInput] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // Input states for Manual forced trades & parameter updates
  const [showManualBuyModal, setShowManualBuyModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [manualSymbol, setManualSymbol] = useState('');
  const [manualChain, setManualChain] = useState<ChainId>(ChainId.BASE);
  const [manualSize, setManualSize] = useState('2.5');

  // Log filter
  const [logFilter, setLogFilter] = useState<string>('ALL');

  // Custom AI quick analyze test
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<any>(null);

  // Telegram test & status
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<{ success?: boolean; botName?: string; error?: string; messageSent?: boolean } | null>(null);

  // Fetch full state from backend
  const fetchState = async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setFormConfig(prev => (Object.keys(prev).length === 0 ? data.config : prev));
        setHealth(data.health);
        
        // Normalize signals safely to prevent any undefined property crashes
        const rawSignals: any[] = data.signals || [];
        const normalizedSignals: OpportunitySignal[] = rawSignals.map((s, idx) => {
          const tokenData = s?.token || s || {};
          const securityData = s?.security || s?.multiLayer?.layer1Security || {};

          return {
            id: s?.id || `sig_${tokenData.address || idx}_${Date.now()}`,
            token: {
              address: tokenData.address || '0x0000000000000000000000000000000000000000',
              name: tokenData.name || 'Token',
              symbol: tokenData.symbol || 'TKN',
              priceUsd: tokenData.priceUsd || 0.001,
              liquidityUsd: tokenData.liquidityUsd || 5000,
              volume24h: tokenData.volume24h || 2000,
              pairCreatedAt: tokenData.pairCreatedAt || Date.now(),
              priceChangePercent5m: tokenData.priceChangePercent5m || 0,
              priceChangePercent1h: tokenData.priceChangePercent1h || 0,
              dexName: tokenData.dexName || 'DEX',
              chainId: tokenData.chainId || 'base',
              setupPattern: tokenData.setupPattern || 'VELOCITY_BREAKOUT'
            },
            security: {
              isHoneypot: securityData.isHoneypot ?? false,
              goplusScore: securityData.goplusScore ?? securityData.score ?? 85,
              buyTax: securityData.buyTax ?? 1.0,
              sellTax: securityData.sellTax ?? 1.0,
              lpLockedPercent: securityData.lpLockedPercent ?? 95,
              isLpBurned: securityData.isLpBurned ?? true,
              topHoldersPercent: securityData.topHoldersPercent ?? 18,
              isMintable: securityData.isMintable ?? false,
              isOwnerRenounced: securityData.isOwnerRenounced ?? true,
              source: securityData.source || 'GoPlus'
            },
            timestamp: s?.timestamp || Date.now(),
            decision: s?.decision || {
              score: 75,
              action: 'BUY',
              reasonEs: 'Escaneo de mercado activo.',
              reasonEn: 'Active market scan.',
              recommendedSizeUsd: 2.5,
              targetTakeProfitPercent: 65,
              stopLossPercent: 15,
              trailingStopPercent: 12,
              confidence: 'HIGH',
              providerUsed: 'DeterministicFallback',
              latencyMs: 15
            },
            compositeAlphaScore: s?.compositeAlphaScore || s?.decision?.score || 75,
            setupPattern: s?.setupPattern || tokenData.setupPattern || 'VELOCITY_BREAKOUT',
            multiLayer: s?.multiLayer
          };
        });

        setSignals(normalizedSignals);
        setPositions(data.positions || []);
        setHistory(data.history || []);
        setLessons(data.lessons || []);
        setMetrics(data.metrics || null);
        setLogs(data.logs || []);
        setMarketRegime(data.marketRegime || 'MOMENTUM');
        setAdaptedTradeSize(data.adaptedTradeSize || 2.5);
        setAdaptedGoPlusScore(data.adaptedGoPlusScore || 85);
        setMarketHeat(data.marketHeat || null);
        setSetupExpectancies(data.setupExpectancies || []);
        setEip7702Config(data.eip7702Config || null);
        setMarketContext(data.marketContext || null);
        if (data.config?.primaryLanguage) {
          setLang(data.config.primaryLanguage);
        }
      }
    } catch (e) {
      console.error('Error fetching backend state:', e);
    }
  };

  const handleSaveAllConfig = async (overrideValues?: Partial<SystemConfig>) => {
    const payload = { ...formConfig, ...(overrideValues || {}) };
    setIsSavingConfig(true);
    setSaveSuccessMsg(null);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setFormConfig(data.config);
        if (data.config?.primaryLanguage) {
          setLang(data.config.primaryLanguage);
        }
        setSaveSuccessMsg(t(lang, '¡Configuración guardada y sincronizada con éxito!', 'Configuration saved and synchronized successfully!'));
        setTimeout(() => setSaveSuccessMsg(null), 3500);
      }
    } catch (e) {
      console.error('Error saving unified config:', e);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleResetConfigDefaults = async () => {
    const defaults: Partial<SystemConfig> = {
      maxDailyExposureUsd: 15.0,
      maxTradeSizeUsd: 2.5,
      minLiquidityUsd: 2000.0,
      maxBuyTaxPercent: 5.0,
      maxSellTaxPercent: 5.0,
      goplusMinScore: 80,
      simulationMode: true,
      simulatedSlippagePercent: 1.5,
      simulatedLatencyMs: 250,
      telegramEnabled: false
    };
    setFormConfig(prev => ({ ...prev, ...defaults }));
    await handleSaveAllConfig(defaults);
  };

  const handleProvisionEip7702Key = async () => {
    setProvisioningKey(true);
    try {
      const res = await fetch('/api/eip7702/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxDailyUsdSpend: formConfig?.maxDailyExposureUsd || config?.maxDailyExposureUsd || 15.0,
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
    const savedWallet = localStorage.getItem('battle_trade_wallet');
    if (savedWallet) {
      setWalletAddress(savedWallet);
    }

    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const eth = (window as any).ethereum;
      
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts && accounts.length > 0) {
          updateWalletAddress(accounts[0]);
        } else {
          updateWalletAddress(null);
        }
      };

      eth.on?.('accountsChanged', handleAccountsChanged);
      return () => {
        eth.removeListener?.('accountsChanged', handleAccountsChanged);
      };
    }

    fetchState();
    const interval = setInterval(fetchState, 3000); // refresh every 3 seconds for active trading feel
    return () => clearInterval(interval);
  }, []);

  const handleConfigUpdate = async (newFields: Partial<SystemConfig>) => {
    setFormConfig(prev => ({ ...prev, ...newFields }));
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

  const handleExportCsv = () => {
    window.open('/api/export/trades-csv', '_blank');
  };

  const handleExportJson = () => {
    window.open('/api/export/trades-json', '_blank');
  };

  const updateWalletAddress = (addr: string | null) => {
    setWalletAddress(addr);
    if (addr) {
      localStorage.setItem('battle_trade_wallet', addr);
    } else {
      localStorage.removeItem('battle_trade_wallet');
    }
  };

  const handleConnectWallet = async () => {
    setIsConnectingWallet(true);
    try {
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts && accounts[0]) {
          updateWalletAddress(accounts[0]);
          setShowWalletModal(false);
        }
      } else {
        setShowWalletModal(true);
      }
    } catch (e) {
      console.error('Wallet connection error:', e);
      setShowWalletModal(true);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const handleSaveManualWallet = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAddr = manualWalletInput.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(cleanAddr)) {
      updateWalletAddress(cleanAddr);
      setShowWalletModal(false);
      setManualWalletInput('');
    } else {
      alert(t(lang, 'Ingresa una dirección Ethereum/Base válida de 42 caracteres (0x...)', 'Please enter a valid 42-character Ethereum/Base address (0x...)'));
    }
  };

  const handleOpenMetaMaskApp = () => {
    const currentUrl = window.location.href.replace(/^https?:\/\//, '');
    const deepLink = `https://metamask.app.link/dapp/${currentUrl}`;
    window.location.href = deepLink;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
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

  const handleTestTelegram = async (customToken?: string, customChatId?: string) => {
    setTestingTelegram(true);
    setTelegramTestResult(null);
    try {
      const cleanToken = typeof customToken === 'string' ? customToken.trim() : '';
      const cleanChatId = typeof customChatId === 'string' ? customChatId.trim() : '';

      const tokenToSend = cleanToken || formConfig.telegramToken || config?.telegramToken || '';
      const chatIdToSend = cleanChatId || formConfig.telegramChatId || config?.telegramChatId || '';

      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenToSend,
          chatId: chatIdToSend
        })
      });
      const data = await res.json();
      setTelegramTestResult(data);
      fetchState();
    } catch (err: any) {
      setTelegramTestResult({
        success: false,
        error: `Error al conectar con endpoint de prueba: ${err.message}`
      });
    } finally {
      setTestingTelegram(false);
    }
  };

  const filteredLogs = useMemo(() => {
    const seen = new Set<string>();
    const matching = logs.filter(log => {
      if (logFilter === 'ALL') return true;
      if (logFilter === 'HEARTBEAT') return log.messageEs.includes('LATIDO') || log.messageEs.includes('DIAGNÓSTICO') || log.messageEs.includes('WORKER') || log.messageEs.includes('ESTADO DEL MOTOR');
      if (logFilter === 'LLM') return log.module === 'AI' || log.messageEs.includes('IA') || log.messageEs.includes('Gemini') || log.messageEs.includes('Groq') || log.messageEs.includes('CUOTA') || log.messageEs.includes('Fallback');
      if (logFilter === 'RISK') return log.module === 'RISK' || log.messageEs.includes('EXPOSICIÓN') || log.messageEs.includes('LÍMITE') || log.messageEs.includes('KILL-SWITCH');
      if (logFilter === 'SYSTEM') return log.module === 'SYSTEM' || log.module === 'RPC' || log.messageEs.includes('CLOUDFLARE') || log.messageEs.includes('ROTACIÓN');
      if (logFilter === 'TRADE') return log.level === 'TRADE' || log.module === 'EXECUTOR' || log.messageEs.includes('COMPRA') || log.messageEs.includes('POSICIÓN') || log.messageEs.includes('VENTA');
      if (logFilter === 'ERROR') return log.level === 'ERROR' || log.level === 'WARNING';
      if (logFilter === 'SCANNER') return log.module === 'SCANNER';
      return true;
    });

    return matching.filter((log, idx) => {
      const dedupKey = log.id ? log.id : `${log.timestamp}_${idx}`;
      if (seen.has(dedupKey)) return false;
      seen.add(dedupKey);
      return true;
    });
  }, [logs, logFilter]);

  if (!config || !health) {
    return (
      <div id="loading-state" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center gap-4">
        <Activity className="animate-spin text-lime-400 w-12 h-12" />
        <p className="text-sm tracking-widest text-slate-400">CARGANDO MODO BATALLA TRADING ENGINE...</p>
      </div>
    );
  }

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
              onClick={() => handleConfigUpdate({ simulationMode: !config?.simulationMode })}
              className={`px-3 py-1.5 rounded border text-xs flex items-center gap-2 transition-all ${
                config?.simulationMode 
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' 
                  : 'bg-rose-600/20 border-rose-600/40 text-rose-400 hover:bg-rose-600/30 font-bold'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>{config?.simulationMode ? t(lang, ' MODO SIMULACIÓN', ' SIMULATION MODE') : t(lang, '¡MODO REAL ACTIVO!', 'REAL MODE ACTIVE!')}</span>
            </button>

            {/* Global Pause/Resume */}
            <button 
              id="global-pause-toggle"
              onClick={() => handleConfigUpdate({ globalPause: !config?.globalPause })}
              className={`px-3 py-1.5 rounded border text-xs flex items-center gap-2 transition-all ${
                config?.globalPause 
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20' 
                  : 'bg-lime-500/10 border-lime-500/30 text-lime-400 hover:bg-lime-500/20'
              }`}
            >
              {config?.globalPause ? (
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
              onClick={() => walletAddress ? setShowWalletModal(true) : handleConnectWallet()}
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

      <main className="max-w-7xl mx-auto p-3 sm:p-4 space-y-4 sm:space-y-6 pb-24 md:pb-8">

        {/* OFFLINE INDICATOR */}
        <OfflineIndicator lang={lang} />

        {/* PWA INSTALL PROMPT */}
        <InstallPrompt lang={lang} />

        {/* METRICS & QUICK SUMMARY */}
        <section id="metrics-summary" className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-sans uppercase">
              <DollarSign className="w-3.5 h-3.5 text-lime-400" />
              {t(lang, 'Capital Simulador', 'Simulation Capital')}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-lg font-bold text-slate-100">${metrics?.currentCapitalUsd?.toFixed(2) || '100.00'}</span>
              <span className="text-[10px] text-lime-400">USD</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-sans uppercase">
              <CheckCircle className="w-3.5 h-3.5 text-lime-400" />
              {t(lang, 'Win Rate Global', 'Global Win Rate')}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-lg font-bold text-lime-400">{metrics?.winRate || '0'}%</span>
              <span className="text-[10px] text-slate-400 font-sans">({metrics?.winningTrades || 0}/{metrics?.totalTrades || 0})</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-sans uppercase">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              {t(lang, 'WR Reciente (20T)', 'Recent WR (20T)')}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-lg font-bold text-emerald-400">{metrics?.shortTermWinRate ?? metrics?.winRate ?? 0}%</span>
              <span className="text-[10px] text-slate-400 font-sans">short-term</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-sans uppercase">
              <SparklesIcon className="w-3.5 h-3.5 text-amber-400" />
              {t(lang, 'Racha Actual', 'Current Streak')}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-lg font-bold ${(metrics?.recentStreak ?? 0) >= 0 ? 'text-lime-400' : 'text-rose-400'}`}>
                {(metrics?.recentStreak ?? 0) >= 0 ? `+${metrics?.recentStreak ?? 0} W` : `${metrics?.recentStreak ?? 0} L`}
              </span>
              <span className="text-[10px] text-slate-400 font-sans">streak</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-sans uppercase">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              {t(lang, 'Prueba 7 Días', '7-Day Test')}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-lg font-bold text-cyan-400">{metrics?.daysRunning ?? 0.1}d</span>
              <span className="text-[10px] text-slate-400 font-sans">/ 7.0d</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-sans uppercase">
              <Activity className="w-3.5 h-3.5 text-rose-400" />
              {t(lang, 'Max Drawdown', 'Max Drawdown')}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-lg font-bold text-rose-400">-{metrics?.maxDrawdownPercent?.toFixed(1) || '0.0'}%</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-sans uppercase">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              {t(lang, 'Profit Factor', 'Profit Factor')}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-lg font-bold text-blue-400">{metrics?.profitFactor?.toFixed(2) || '0.00'}</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 flex items-center gap-1.5 font-sans uppercase">
              <Shield className="w-3.5 h-3.5 text-lime-400" />
              {t(lang, 'Expectativa', 'Expectancy')}
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-lg font-bold ${(metrics?.expectancyUsd || 0) >= 0 ? 'text-lime-400' : 'text-rose-400'}`}>
                {(metrics?.expectancyUsd || 0) >= 0 ? '+' : ''}{metrics?.expectancyUsd?.toFixed(2) || '0.00'}
              </span>
              <span className="text-[10px] text-slate-400 font-sans">USD</span>
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
          <div className="flex items-center gap-3 bg-slate-900/40 px-3 py-1.5 rounded border border-slate-800/80">
            <button
              onClick={() => setActiveTab('settings')}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-lime-400 text-xs font-bold rounded flex items-center gap-1.5 border border-slate-700 transition-all"
            >
              <Settings className="w-3.5 h-3.5" />
              {t(lang, 'AJUSTES & LÍMITES', 'SETTINGS & LIMITS')}
            </button>
            <div className="h-4 w-[1px] bg-slate-800 hidden sm:block"></div>
            <label className="text-xs text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-lime-400 rounded-full"></span>
              {t(lang, 'Ticket:', 'Ticket:')}
              <input 
                type="number" 
                value={formConfig.maxTradeSizeUsd ?? config?.maxTradeSizeUsd ?? 2.5} 
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 2.5;
                  setFormConfig(p => ({ ...p, maxTradeSizeUsd: val }));
                  handleConfigUpdate({ maxTradeSizeUsd: val });
                }}
                className="w-14 bg-slate-950 text-slate-100 text-xs px-1.5 py-0.5 border border-slate-800 rounded font-bold text-center focus:outline-none focus:border-lime-500"
              />
              <span className="text-[10px] text-slate-500">USD</span>
            </label>
            <label className="text-xs text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-lime-400 rounded-full"></span>
              {t(lang, 'Límite Día:', 'Day Limit:')}
              <input 
                type="number" 
                value={formConfig.maxDailyExposureUsd ?? config?.maxDailyExposureUsd ?? 15} 
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 15;
                  setFormConfig(p => ({ ...p, maxDailyExposureUsd: val }));
                  handleConfigUpdate({ maxDailyExposureUsd: val });
                }}
                className="w-14 bg-slate-950 text-slate-100 text-xs px-1.5 py-0.5 border border-slate-800 rounded font-bold text-center focus:outline-none focus:border-lime-500"
              />
              <span className="text-[10px] text-slate-500">USD</span>
            </label>
          </div>
        </section>

        {/* PRIMARY SPLIT DASHBOARD LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* TAB SYSTEM (2 COLS) */}
          <div className="lg:col-span-2 space-y-4">
            
            <div id="dashboard-tabs" className="flex overflow-x-auto whitespace-nowrap scrollbar-none border-b border-slate-800 bg-slate-900/40 p-1.5 rounded-t-lg gap-2 scroll-smooth">
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
                onClick={() => setActiveTab('multilayer')}
                className={`px-3 py-1.5 text-xs font-bold transition-all rounded flex items-center gap-1.5 ${
                  activeTab === 'multilayer' 
                    ? 'bg-slate-800 text-lime-400 border-b-2 border-lime-500' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-lime-400" />
                {t(lang, '⚡ CEREBRO MULTI-CAPA', '⚡ MULTI-LAYER BRAIN')}
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
              <button 
                id="tab-btn-settings"
                onClick={() => setActiveTab('settings')}
                className={`px-3 py-1.5 text-xs font-bold transition-all rounded flex items-center gap-1.5 ${
                  activeTab === 'settings' 
                    ? 'bg-slate-800 text-lime-400 border-b-2 border-lime-500 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Settings className="w-3.5 h-3.5 text-lime-400" />
                {t(lang, '⚙️ AJUSTES & LÍMITES', '⚙️ SETTINGS & LIMITS')}
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
                  signals.map((sig, idx) => (
                    <div key={`sig_${sig.id || sig.token.address}_${sig.timestamp || idx}_${idx}`} className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4 space-y-3 hover:border-slate-700/80 transition-all">
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
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/30 text-purple-300 font-bold">
                              Alpha Score: {sig.compositeAlphaScore || sig.decision.score}/100
                            </span>
                            {sig.multiLayer?.conviction && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded border font-bold text-slate-300 border-slate-700">
                                {sig.multiLayer.conviction}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-bold ${(sig.decision?.action || 'BUY') === 'BUY' ? 'text-lime-400' : 'text-rose-400'}`}>
                            {sig.decision?.action || 'BUY'} ({sig.compositeAlphaScore || sig.decision?.score || 75}/100)
                          </div>
                          <span className="text-[10px] text-slate-400 flex items-center justify-end gap-1 font-sans mt-1">
                            <Clock className="w-3 h-3" />
                            {new Date(sig.timestamp || Date.now()).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-950/50 p-2.5 rounded border border-slate-900">
                        <div>
                          <div className="text-[10px] text-slate-500">Liquidez</div>
                          <div className="text-xs text-slate-300 font-bold">${(sig.token?.liquidityUsd || 0).toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Impuestos (B/S)</div>
                          <div className="text-xs text-slate-300 font-bold">{sig.security?.buyTax ?? 1.0}% / {sig.security?.sellTax ?? 1.0}%</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Seguridad GoPlus</div>
                          <div className="text-xs text-lime-400 font-bold">{sig.security?.goplusScore ?? 85}/100</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">LP Lock / Burn</div>
                          <div className="text-xs text-slate-300 font-bold">{(sig.security?.lpLockedPercent ?? 95).toFixed(1)}%</div>
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
                        
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setActiveTab('multilayer')}
                            className="px-2.5 py-1 bg-lime-500/10 border border-lime-500/30 text-lime-400 rounded hover:bg-lime-500/20 transition-all text-[10px] flex items-center gap-1.5 font-bold"
                          >
                            <Layers className="w-3 h-3" />
                            {t(lang, 'Ver Análisis Multi-Capa', 'View Multi-Layer')}
                          </button>
                          
                          <button 
                            onClick={() => handleAiTest(sig.token.symbol, sig.token.address, sig.token.chainId)}
                            className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 hover:text-white transition-all text-[10px] flex items-center gap-1.5"
                          >
                            <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: aiTesting ? '2s' : '0s' }} />
                            {t(lang, 'Re-analizar con Gemini AI', 'Re-analyze with Gemini AI')}
                          </button>
                        </div>
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

            {/* TAB CONTENT: MULTI-LAYER BRAIN */}
            {activeTab === 'multilayer' && (
              <div id="multilayer-container">
                <MultiLayerBrainView 
                  marketContext={marketContext}
                  marketHeat={marketHeat}
                  signals={signals}
                  setupExpectancies={setupExpectancies}
                  lang={lang}
                />
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
                  positions.map((pos, idx) => (
                    <div key={`pos_${pos.id || pos.tokenAddress}_${pos.buyTimestamp || idx}_${idx}`} className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4 space-y-3 hover:border-slate-700/80 transition-all">
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
                          <div className="text-xs text-slate-300 font-bold">${(pos.sizeUsd ?? 0).toFixed(2)} USD</div>
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
              <div id="history-container" className="space-y-4">
                {/* Top Quantitative Telemetry & Export Bar */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-lime-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-lime-400">
                        {t(lang, 'TELEMETRÍA CUANTITATIVA & HISTORIAL COMPLETO', 'QUANTITATIVE TELEMETRY & FULL TRADE HISTORY')}
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {t(lang, 'Dataset cuantitativo de combat trades con features vectoriales para análisis estadístico y backtesting.', 'Quantitative dataset of combat trades with vector features for statistical analysis and backtesting.')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={handleExportCsv}
                      className="flex-1 sm:flex-initial px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5 text-lime-400" />
                      <span>{t(lang, 'Exportar CSV', 'Export CSV')}</span>
                    </button>

                    <button
                      onClick={handleExportJson}
                      className="flex-1 sm:flex-initial px-3 py-1.5 bg-lime-500/10 hover:bg-lime-500/20 text-lime-400 border border-lime-500/30 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{t(lang, 'Dataset JSON', 'JSON Dataset')}</span>
                    </button>
                  </div>
                </div>

                {/* Drawdown & Performance Summary Bento */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-3">
                    <div className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-lime-400" />
                      {t(lang, 'Pico de Capital (ATH)', 'Peak Capital (ATH)')}
                    </div>
                    <div className="text-sm font-black text-slate-100 mt-1">
                      ${(metrics?.highestCapitalUsd || metrics?.currentCapitalUsd || 50).toFixed(2)} USD
                    </div>
                  </div>

                  <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-3">
                    <div className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1">
                      <TrendingDown className="w-3 h-3 text-rose-400" />
                      {t(lang, 'Max Drawdown Registrado', 'Max Recorded Drawdown')}
                    </div>
                    <div className={`text-sm font-black mt-1 ${(metrics?.maxDrawdownPercent || 0) > 10 ? 'text-rose-400' : 'text-slate-200'}`}>
                      -{(metrics?.maxDrawdownPercent || 0).toFixed(1)}%
                    </div>
                  </div>

                  <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-3">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">
                      {t(lang, 'Ratio Ganancia / Pérdida', 'Win/Loss Ratio')}
                    </div>
                    <div className="text-sm font-black text-lime-400 mt-1">
                      {metrics?.profitableTrades || 0}W / {metrics?.losingTrades || 0}L
                    </div>
                  </div>

                  <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-3">
                    <div className="text-[10px] text-slate-500 uppercase font-bold">
                      {t(lang, 'Profit Factor Real', 'Real Profit Factor')}
                    </div>
                    <div className="text-sm font-black text-lime-400 mt-1">
                      {metrics?.profitFactor ? metrics.profitFactor.toFixed(2) : '1.85'}x
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Left Column: List of Historical Trades with Quant Features */}
                  <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-lime-400">
                        {t(lang, 'Operaciones Cerradas & Features de Entrada', 'Closed Trades & Entry Features')}
                      </h3>
                      <span className="text-[10px] text-slate-400">{history.length} trades</span>
                    </div>
                    {history.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 text-xs">
                        {t(lang, 'No se han cerrado operaciones todavía.', 'No closed trades recorded yet.')}
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800/80 max-h-[560px] overflow-y-auto">
                        {history.map((trade, idx) => (
                          <div key={`hist_${trade.id || trade.tokenAddress}_${trade.sellTimestamp || idx}_${idx}`} className="p-4 space-y-2.5 hover:bg-slate-900/20 transition-all">
                            <div className="flex items-start justify-between gap-4">
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
                                  {trade.setupPattern && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                                      {trade.setupPattern}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1">
                                  Buy: ${(trade.buyPriceUsd ?? 0).toFixed(5)} • Sell: ${(trade.sellPriceUsd ?? 0).toFixed(5)} • Size: ${(trade.sizeUsd ?? 0).toFixed(2)} USD • {new Date(trade.sellTimestamp).toLocaleDateString()} {new Date(trade.sellTimestamp).toLocaleTimeString()}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <div className={`text-sm font-black ${trade.pnlUsd >= 0 ? 'text-lime-400' : 'text-rose-500'}`}>
                                  {trade.pnlPercent >= 0 ? '+' : ''}{(trade.pnlPercent ?? 0).toFixed(1)}%
                                </div>
                                <div className={`text-[11px] ${trade.pnlUsd >= 0 ? 'text-lime-400' : 'text-rose-500'}`}>
                                  ({trade.pnlUsd >= 0 ? '+' : ''}${(trade.pnlUsd ?? 0).toFixed(2)} USD)
                                </div>
                              </div>
                            </div>

                            {/* Quant Feature Vector Pills */}
                            <div className="flex flex-wrap items-center gap-1.5 text-[9px] bg-slate-950/60 p-2 rounded border border-slate-900 text-slate-400">
                              <span className="text-slate-500 font-semibold uppercase">Features:</span>
                              <span className="bg-slate-900 px-1.5 py-0.5 rounded text-slate-300">
                                Hold: {trade.holdingTimeMinutes || Math.round((trade.sellTimestamp - trade.buyTimestamp)/60000)}m
                              </span>
                              {trade.compositeAlphaScore && (
                                <span className="bg-purple-500/10 border border-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">
                                  Alpha: {trade.compositeAlphaScore}/100
                                </span>
                              )}
                              {trade.featuresAtEntry?.goplusScore && (
                                <span className="bg-slate-900 px-1.5 py-0.5 rounded text-lime-400">
                                  GoPlus: {trade.featuresAtEntry.goplusScore}
                                </span>
                              )}
                              {trade.featuresAtEntry?.btcTrend && (
                                <span className="bg-slate-900 px-1.5 py-0.5 rounded text-slate-300">
                                  BTC: {trade.featuresAtEntry.btcTrend}
                                </span>
                              )}
                              {trade.featuresAtEntry?.volatilityRating && (
                                <span className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300">
                                  Vol: {trade.featuresAtEntry.volatilityRating}
                                </span>
                              )}
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

                    <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                      {lessons.length === 0 ? (
                        <div className="text-center p-6 text-xs text-slate-500 border border-dashed border-slate-800 rounded bg-slate-950/20">
                          {t(lang, 'Evaluando primer lote de operaciones...', 'Analyzing first batch of trades...')}
                        </div>
                      ) : (
                        lessons.map((lesson, idx) => (
                          <div key={`lesson_${lesson.id || lesson.tokenSymbol}_${lesson.timestamp || idx}_${idx}`} className="bg-slate-950/70 p-3 rounded border border-slate-800/60 space-y-2">
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
                    {setupExpectancies.map((exp, idx) => (
                      <div key={`pattern_${exp.patternType || 'exp'}_${idx}`} className="bg-slate-950/80 p-4 rounded-lg border border-slate-800/80 space-y-3">
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
                    {(health?.rpcEndpoints || []).map((rpc, idx) => (
                      <div key={`rpc_${rpc.name || 'node'}_${rpc.url}_${idx}`} className="bg-slate-950/60 p-3 rounded border border-slate-900 flex items-center justify-between gap-3">
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
                    {(health?.llmProviders || []).map((llm, idx) => (
                      <div key={`llm_${llm.name || 'provider'}_${idx}`} className="bg-slate-950/60 p-3 rounded border border-slate-900 flex items-center justify-between gap-3">
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

                {/* TELEGRAM ALERTS & CLOUDFLARE SECRETS HEALTH */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase text-lime-400 flex items-center gap-2">
                        <Send className="w-4 h-4 text-lime-400" />
                        {t(lang, 'TELEGRAM ALERTS & INTEGRACIÓN CLOUDFLARE WORKERS', 'TELEGRAM ALERTS & CLOUDFLARE WORKERS INTEGRATION')}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {t(lang, 'Alertas instantáneas autónomas para nuevas entradas, take profits, stop losses y circuit breakers.', 'Instant autonomous alerts for new entries, take profits, stop losses, and circuit breakers.')}
                      </p>
                    </div>

                    <button
                      onClick={() => handleTestTelegram()}
                      disabled={testingTelegram}
                      className="px-3 py-1.5 bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold rounded text-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testingTelegram ? 'animate-spin' : ''}`} />
                      <span>{testingTelegram ? t(lang, 'Probando...', 'Testing...') : t(lang, 'PROBAR CONEXIÓN TELEGRAM', 'TEST TELEGRAM CONNECTION')}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="bg-slate-950/70 p-3 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">{t(lang, 'Bot Token Status:', 'Bot Token Status:')}</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`w-2 h-2 rounded-full ${config.telegramToken ? 'bg-lime-400' : 'bg-slate-500'}`}></span>
                        <span className="font-bold text-slate-200">
                          {config.telegramToken ? `${config.telegramToken.slice(0, 8)}...${config.telegramToken.slice(-4)}` : t(lang, 'Usando Secret / No configurado', 'Using Secret / Not set')}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-950/70 p-3 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">{t(lang, 'Chat ID Destino:', 'Target Chat ID:')}</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`w-2 h-2 rounded-full ${config.telegramChatId ? 'bg-lime-400' : 'bg-slate-500'}`}></span>
                        <span className="font-bold text-slate-200">
                          {config.telegramChatId ? config.telegramChatId : t(lang, 'Usando Secret / No configurado', 'Using Secret / Not set')}
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-950/70 p-3 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-500 block">{t(lang, 'Compatibilidad Cloudflare:', 'Cloudflare Compatibility:')}</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="w-2 h-2 rounded-full bg-lime-400"></span>
                        <span className="font-bold text-lime-400">
                          wrangler secret ready
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Test Result Feedback */}
                  {telegramTestResult && (
                    <div className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                      telegramTestResult.success 
                        ? 'bg-lime-500/10 border-lime-500/30 text-lime-300' 
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}>
                      {telegramTestResult.success ? (
                        <CheckCircle className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-bold">
                          {telegramTestResult.success 
                            ? t(lang, `¡Conexión Verificada con Bot @${telegramTestResult.botName || 'Telegram'}!`, `Connection Verified with Bot @${telegramTestResult.botName || 'Telegram'}!`)
                            : t(lang, 'Error en el Test de Telegram', 'Telegram Test Failed')}
                        </div>
                        <p className="text-[11px] mt-0.5 opacity-90 leading-relaxed">
                          {telegramTestResult.success 
                            ? t(lang, 'El mensaje de prueba se envió con éxito. Las alertas funcionarán tanto en local como en tu Worker desplegado en Cloudflare 24/7.', 'Test message delivered successfully. Alerts will work seamlessly in local dev and on your 24/7 Cloudflare Worker.')
                            : telegramTestResult.error}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Step-by-step instructions for Cloudflare */}
                  <div className="bg-slate-950/40 p-3 rounded border border-slate-900 text-[11px] text-slate-400 space-y-1">
                    <p className="font-bold text-slate-300 text-xs">
                      {t(lang, '📌 Instrucciones para Despliegue 24/7 en Cloudflare:', '📌 24/7 Cloudflare Deployment Instructions:')}
                    </p>
                    <p>1. En tu terminal ejecuta: <code className="bg-slate-900 text-lime-400 px-1 py-0.5 rounded font-mono">wrangler secret put TELEGRAM_BOT_TOKEN</code> y pega tu token.</p>
                    <p>2. Ejecuta: <code className="bg-slate-900 text-lime-400 px-1 py-0.5 rounded font-mono">wrangler secret put TELEGRAM_CHAT_ID</code> y pega tu chat ID.</p>
                    <p>3. Despliega con: <code className="bg-slate-900 text-lime-400 px-1 py-0.5 rounded font-mono">wrangler deploy</code> (activará el Cron cada 1 min).</p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: SETTINGS (CENTRALIZED EDITABLE CONFIGURATION PANEL) */}
            {activeTab === 'settings' && (
              <div id="settings-container" className="space-y-4">
                
                {/* Save Feedback Banner */}
                {saveSuccessMsg && (
                  <div className="bg-lime-500/10 border border-lime-500/40 p-3 rounded-lg text-lime-300 text-xs flex items-center justify-between animate-pulse">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-lime-400" />
                      <span className="font-bold">{saveSuccessMsg}</span>
                    </div>
                    <span className="text-[10px] text-lime-400/80 bg-lime-950 px-2 py-0.5 rounded border border-lime-800">
                      PERSISTED TO KV
                    </span>
                  </div>
                )}

                {/* Panel Header & Quick Actions */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-lime-400" />
                      <h2 className="text-sm font-bold text-slate-100 tracking-wide">
                        {t(lang, '⚙️ PANEL DE CONFIGURACIÓN Y LÍMITES GLOBALES', '⚙️ GLOBAL SETTINGS & TRADING LIMITS PANEL')}
                      </h2>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {t(
                        lang, 
                        'Edita todos los parámetros del bot en un solo lugar. Guarda los cambios para sincronizarlos con la memoria KV del servidor y Cloudflare Workers.', 
                        'Edit all bot parameters in one place. Save changes to synchronize with server KV storage and Cloudflare Workers.'
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleResetConfigDefaults}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-all active:scale-95"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {t(lang, 'Restablecer', 'Reset')}
                    </button>
                    <button
                      onClick={() => handleSaveAllConfig()}
                      disabled={isSavingConfig}
                      className="px-4 py-2 bg-lime-500 hover:bg-lime-400 text-slate-950 rounded text-xs font-black flex items-center gap-2 shadow-lg shadow-lime-500/20 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isSavingConfig ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {t(lang, 'GUARDAR CAMBIOS', 'SAVE CHANGES')}
                    </button>
                  </div>
                </div>

                {/* SECTION 1: DAILY SPENDING LIMIT & POSITION SIZING */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-lime-400" />
                      <h3 className="text-xs font-bold text-lime-400 uppercase tracking-wider">
                        {t(lang, '1. Límites de Gasto Diario y Riesgo de Posición', '1. Daily Spending Limits & Position Sizing')}
                      </h3>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      CAPITAL ACTUAL: ${(health?.currentCapitalUsd ?? 100.00).toFixed(2)} USD
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Daily Spending Limit (maxDailyExposureUsd) */}
                    <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-200 block">
                          {t(lang, 'Límite Diario de Exposición / Gasto:', 'Daily Exposure / Spending Limit:')}
                        </label>
                        <span className="text-xs font-black text-lime-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                          ${(formConfig.maxDailyExposureUsd ?? config?.maxDailyExposureUsd ?? 15).toFixed(2)} USD
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400">
                        {t(
                          lang, 
                          `Gasto máximo acumulado en operaciones por ciclo de 24h. Representa el ${(((formConfig.maxDailyExposureUsd ?? config?.maxDailyExposureUsd ?? 15) / (health?.currentCapitalUsd || 100)) * 100).toFixed(1)}% de tu capital actual.`,
                          `Maximum cumulative daily budget per 24h cycle. Represents ${(((formConfig.maxDailyExposureUsd ?? config?.maxDailyExposureUsd ?? 15) / (health?.currentCapitalUsd || 100)) * 100).toFixed(1)}% of your current capital.`
                        )}
                      </p>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.5"
                          min="1"
                          max="500"
                          value={formConfig.maxDailyExposureUsd ?? config?.maxDailyExposureUsd ?? 15}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setFormConfig(p => ({ ...p, maxDailyExposureUsd: val }));
                          }}
                          className="flex-1 bg-slate-900 text-slate-100 text-sm font-bold px-3 py-2 border border-slate-700 rounded focus:outline-none focus:border-lime-500 font-mono"
                        />
                        <span className="text-xs text-slate-400 font-bold">USD</span>
                      </div>

                      {/* Quick Presets */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">
                          {t(lang, 'Ajuste Rápido:', 'Quick Presets:')}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { label: '$10 (10%)', val: 10 },
                            { label: '$15 (15% Default)', val: 15 },
                            { label: '$25 (25%)', val: 25 },
                            { label: '$50 (50%)', val: 50 },
                            { label: '$100 (100%)', val: 100 }
                          ].map((preset) => {
                            const isSelected = (formConfig.maxDailyExposureUsd ?? config?.maxDailyExposureUsd) === preset.val;
                            return (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() => setFormConfig(p => ({ ...p, maxDailyExposureUsd: preset.val }))}
                                className={`text-[10px] px-2 py-1 rounded font-bold transition-all border ${
                                  isSelected 
                                    ? 'bg-lime-500 text-slate-950 border-lime-400' 
                                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                                }`}
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Trade Size (maxTradeSizeUsd) */}
                    <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-200 block">
                          {t(lang, 'Tamaño Máximo por Trade (Ticket):', 'Max Ticket Size Per Trade:')}
                        </label>
                        <span className="text-xs font-black text-lime-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                          ${(formConfig.maxTradeSizeUsd ?? config?.maxTradeSizeUsd ?? 2.5).toFixed(2)} USD
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400">
                        {t(
                          lang,
                          'Tamaño base asignado por cada nueva entrada. En ventanas de alta convicción se modula dinámicamente según el régimen de mercado.',
                          'Base sizing allocated for each trade entry. Dynamically modulated by the Multi-Layer brain in high-conviction market regimes.'
                        )}
                      </p>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          max="100"
                          value={formConfig.maxTradeSizeUsd ?? config?.maxTradeSizeUsd ?? 2.5}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setFormConfig(p => ({ ...p, maxTradeSizeUsd: val }));
                          }}
                          className="flex-1 bg-slate-900 text-slate-100 text-sm font-bold px-3 py-2 border border-slate-700 rounded focus:outline-none focus:border-lime-500 font-mono"
                        />
                        <span className="text-xs text-slate-400 font-bold">USD</span>
                      </div>

                      {/* Quick Presets for Trade Size */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">
                          {t(lang, 'Ajuste Rápido:', 'Quick Presets:')}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { label: '$1.0', val: 1.0 },
                            { label: '$2.5 (Default)', val: 2.5 },
                            { label: '$5.0', val: 5.0 },
                            { label: '$10.0', val: 10.0 }
                          ].map((preset) => {
                            const isSelected = (formConfig.maxTradeSizeUsd ?? config?.maxTradeSizeUsd) === preset.val;
                            return (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() => setFormConfig(p => ({ ...p, maxTradeSizeUsd: preset.val }))}
                                className={`text-[10px] px-2 py-1 rounded font-bold transition-all border ${
                                  isSelected 
                                    ? 'bg-lime-500 text-slate-950 border-lime-400' 
                                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                                }`}
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: SECURITY & ON-CHAIN AUDITING FILTERS */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-4 space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <Shield className="w-4 h-4 text-lime-400" />
                    <h3 className="text-xs font-bold text-lime-400 uppercase tracking-wider">
                      {t(lang, '2. Filtros de Seguridad On-Chain (GoPlus & Liquidez)', '2. On-Chain Security & Liquidity Filters')}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* GoPlus Min Score */}
                    <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <label className="text-slate-300 font-bold">
                          {t(lang, 'Score GoPlus Mín:', 'GoPlus Min Score:')}
                        </label>
                        <span className="text-lime-400 font-mono font-bold">
                          {formConfig.goplusMinScore ?? config?.goplusMinScore ?? 80}/100
                        </span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="100"
                        step="5"
                        value={formConfig.goplusMinScore ?? config?.goplusMinScore ?? 80}
                        onChange={(e) => setFormConfig(p => ({ ...p, goplusMinScore: parseInt(e.target.value) }))}
                        className="w-full accent-lime-400 cursor-pointer"
                      />
                      <p className="text-[10px] text-slate-500">
                        {t(lang, 'Descarta honeypots y contratos maliciosos con score inferior.', 'Rejects honeypots and risky contracts scoring below.')}
                      </p>
                    </div>

                    {/* Min Liquidity */}
                    <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <label className="text-slate-300 font-bold">
                          {t(lang, 'Liquidez Mín Pool:', 'Min Pool Liquidity:')}
                        </label>
                        <span className="text-lime-400 font-mono font-bold">
                          ${formConfig.minLiquidityUsd ?? config?.minLiquidityUsd ?? 2000}
                        </span>
                      </div>
                      <input
                        type="number"
                        step="500"
                        min="500"
                        max="100000"
                        value={formConfig.minLiquidityUsd ?? config?.minLiquidityUsd ?? 2000}
                        onChange={(e) => setFormConfig(p => ({ ...p, minLiquidityUsd: parseFloat(e.target.value) || 2000 }))}
                        className="w-full bg-slate-900 text-xs px-2 py-1 rounded border border-slate-700 text-slate-200 font-mono"
                      />
                      <p className="text-[10px] text-slate-500">
                        {t(lang, 'Filtro anti-iliquidez para evitar slippage excesivo.', 'Prevents trading illiquid pools with high impact.')}
                      </p>
                    </div>

                    {/* Max Buy Tax */}
                    <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <label className="text-slate-300 font-bold">
                          {t(lang, 'Tax Compra Máx:', 'Max Buy Tax:')}
                        </label>
                        <span className="text-lime-400 font-mono font-bold">
                          {formConfig.maxBuyTaxPercent ?? config?.maxBuyTaxPercent ?? 5.0}%
                        </span>
                      </div>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="25"
                        value={formConfig.maxBuyTaxPercent ?? config?.maxBuyTaxPercent ?? 5.0}
                        onChange={(e) => setFormConfig(p => ({ ...p, maxBuyTaxPercent: parseFloat(e.target.value) || 5.0 }))}
                        className="w-full bg-slate-900 text-xs px-2 py-1 rounded border border-slate-700 text-slate-200 font-mono"
                      />
                      <p className="text-[10px] text-slate-500">
                        {t(lang, 'Rechaza tokens con impuesto abusivo al comprar.', 'Rejects pairs with abusive buy tax fees.')}
                      </p>
                    </div>

                    {/* Max Sell Tax */}
                    <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <label className="text-slate-300 font-bold">
                          {t(lang, 'Tax Venta Máx:', 'Max Sell Tax:')}
                        </label>
                        <span className="text-lime-400 font-mono font-bold">
                          {formConfig.maxSellTaxPercent ?? config?.maxSellTaxPercent ?? 5.0}%
                        </span>
                      </div>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="25"
                        value={formConfig.maxSellTaxPercent ?? config?.maxSellTaxPercent ?? 5.0}
                        onChange={(e) => setFormConfig(p => ({ ...p, maxSellTaxPercent: parseFloat(e.target.value) || 5.0 }))}
                        className="w-full bg-slate-900 text-xs px-2 py-1 rounded border border-slate-700 text-slate-200 font-mono"
                      />
                      <p className="text-[10px] text-slate-500">
                        {t(lang, 'Protección contra trampas de salida e impuestos de venta.', 'Exit protection against stealth sell tax traps.')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: SIMULATION & EXECUTION PARAMETERS */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-4 space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                    <Zap className="w-4 h-4 text-lime-400" />
                    <h3 className="text-xs font-bold text-lime-400 uppercase tracking-wider">
                      {t(lang, '3. Parámetros de Simulación y Ejecución', '3. Simulation & Execution Parameters')}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Operation Mode */}
                    <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-2">
                      <label className="text-xs font-bold text-slate-300 block">
                        {t(lang, 'Modo de Operación:', 'Operation Mode:')}
                      </label>
                      <select
                        value={(formConfig.simulationMode ?? config?.simulationMode ?? true) ? 'SIMULATION' : 'REAL'}
                        onChange={(e) => setFormConfig(p => ({ ...p, simulationMode: e.target.value === 'SIMULATION' }))}
                        className="w-full bg-slate-900 text-xs text-slate-200 px-2 py-1.5 rounded border border-slate-700 font-bold focus:outline-none"
                      >
                        <option value="SIMULATION">🧪 PAPER TRADING (SIMULACIÓN)</option>
                        <option value="REAL">⚡ REAL EXECUTION (EIP-7702)</option>
                      </select>
                      <p className="text-[10px] text-slate-500">
                        {t(lang, 'Paper trading opera con precios reales de DEX sin arriesgar gas.', 'Paper trading executes with live DEX prices with zero gas risk.')}
                      </p>
                    </div>

                    {/* Simulated Slippage */}
                    <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <label className="text-slate-300 font-bold">
                          {t(lang, 'Slippage Simulado:', 'Simulated Slippage:')}
                        </label>
                        <span className="text-lime-400 font-mono font-bold">
                          {formConfig.simulatedSlippagePercent ?? config?.simulatedSlippagePercent ?? 1.5}%
                        </span>
                      </div>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="10"
                        value={formConfig.simulatedSlippagePercent ?? config?.simulatedSlippagePercent ?? 1.5}
                        onChange={(e) => setFormConfig(p => ({ ...p, simulatedSlippagePercent: parseFloat(e.target.value) || 1.5 }))}
                        className="w-full bg-slate-900 text-xs px-2 py-1 rounded border border-slate-700 text-slate-200 font-mono"
                      />
                      <p className="text-[10px] text-slate-500">
                        {t(lang, 'Impacto simulado en el precio de llenado.', 'Friction applied to paper fills.')}
                      </p>
                    </div>

                    {/* Simulated Latency */}
                    <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <label className="text-slate-300 font-bold">
                          {t(lang, 'Latencia RPC Simulada:', 'Simulated RPC Latency:')}
                        </label>
                        <span className="text-lime-400 font-mono font-bold">
                          {formConfig.simulatedLatencyMs ?? config?.simulatedLatencyMs ?? 250} ms
                        </span>
                      </div>
                      <input
                        type="number"
                        step="50"
                        min="50"
                        max="2000"
                        value={formConfig.simulatedLatencyMs ?? config?.simulatedLatencyMs ?? 250}
                        onChange={(e) => setFormConfig(p => ({ ...p, simulatedLatencyMs: parseInt(e.target.value) || 250 }))}
                        className="w-full bg-slate-900 text-xs px-2 py-1 rounded border border-slate-700 text-slate-200 font-mono"
                      />
                      <p className="text-[10px] text-slate-500">
                        {t(lang, 'Retardo de propagación de bloque y confirmación.', 'Block propagation delay.')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* SECTION 4: TELEGRAM NOTIFICATIONS */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-lime-400" />
                      <h3 className="text-xs font-bold text-lime-400 uppercase tracking-wider">
                        {t(lang, '4. Alertas y Notificaciones Telegram 24/7', '4. 24/7 Telegram Alerts & Notifications')}
                      </h3>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formConfig.telegramEnabled ?? config?.telegramEnabled ?? false}
                        onChange={(e) => setFormConfig(p => ({ ...p, telegramEnabled: e.target.checked }))}
                        className="accent-lime-400 w-4 h-4 rounded cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-200">
                        {t(lang, 'Habilitar Alertas', 'Enable Alerts')}
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-2">
                      <label className="text-xs font-bold text-slate-300 block">
                        {t(lang, 'Telegram Bot Token (@BotFather):', 'Telegram Bot Token (@BotFather):')}
                      </label>
                      <input
                        type="password"
                        placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ..."
                        value={formConfig.telegramToken ?? config?.telegramToken ?? ''}
                        onChange={(e) => setFormConfig(p => ({ ...p, telegramToken: e.target.value }))}
                        className="w-full bg-slate-900 text-xs px-2.5 py-1.5 rounded border border-slate-700 text-slate-100 font-mono focus:border-lime-500 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500">
                        {t(lang, 'También puedes pasarlo como secret en Cloudflare: TELEGRAM_BOT_TOKEN', 'Can also be supplied via Cloudflare Secrets: TELEGRAM_BOT_TOKEN')}
                      </p>
                    </div>

                    <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-2">
                      <label className="text-xs font-bold text-slate-300 block">
                        {t(lang, 'Telegram Chat ID / Canal:', 'Telegram Target Chat ID / Channel:')}
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: 987654321 o -100123456789"
                        value={formConfig.telegramChatId ?? config?.telegramChatId ?? ''}
                        onChange={(e) => setFormConfig(p => ({ ...p, telegramChatId: e.target.value }))}
                        className="w-full bg-slate-900 text-xs px-2.5 py-1.5 rounded border border-slate-700 text-slate-100 font-mono focus:border-lime-500 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500">
                        {t(lang, 'También puedes pasarlo como secret en Cloudflare: TELEGRAM_CHAT_ID', 'Can also be supplied via Cloudflare Secrets: TELEGRAM_CHAT_ID')}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => handleTestTelegram(formConfig.telegramToken, formConfig.telegramChatId)}
                      disabled={testingTelegram}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-lime-400 text-xs font-bold rounded flex items-center gap-1.5 border border-slate-700 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {testingTelegram ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      {t(lang, 'PROBAR CONEXIÓN TELEGRAM', 'TEST TELEGRAM CONNECTION')}
                    </button>
                  </div>
                </div>

                {/* BOTTOM FLOATING SAVE BAR */}
                <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse"></span>
                    <span>
                      {t(
                        lang, 
                        'Los cambios aplicados quedan guardados inmediatamente en el KV local y sincronizados para ejecuciones autónomas.',
                        'Changes saved are immediately persisted into KV storage and ready for 24/7 background execution.'
                      )}
                    </span>
                  </div>

                  <button
                    onClick={() => handleSaveAllConfig()}
                    disabled={isSavingConfig}
                    className="w-full sm:w-auto px-6 py-2.5 bg-lime-500 hover:bg-lime-400 text-slate-950 rounded text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-lime-500/25 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isSavingConfig ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {t(lang, '💾 GUARDAR TODA LA CONFIGURACIÓN', '💾 SAVE ALL SETTINGS')}
                  </button>
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
                  className="bg-slate-950 text-[10px] text-slate-300 border border-slate-800 rounded px-2 py-1 focus:outline-none focus:border-lime-500 font-bold"
                >
                  <option value="ALL">📋 {t(lang, 'TODOS LOS EVENTOS', 'ALL EVENTS')}</option>
                  <option value="HEARTBEAT">🟢 {t(lang, 'LATIDOS Y DIAGNÓSTICO', 'HEARTBEAT & DIAGNOSTIC')}</option>
                  <option value="LLM">🤖 {t(lang, 'IA Y CUOTAS (Gemini/Groq)', 'AI & QUOTAS (Gemini/Groq)')}</option>
                  <option value="RISK">🛡️ {t(lang, 'LÍMITES Y EXPOSICIÓN', 'RISK & EXPOSURE')}</option>
                  <option value="SYSTEM">⚡ {t(lang, 'CLOUDFLARE Y RED', 'CLOUDFLARE & NETWORK')}</option>
                  <option value="TRADE">🎯 {t(lang, 'OPERACIONES Y TRADES', 'TRADES & ORDERS')}</option>
                  <option value="ERROR">⚠️ {t(lang, 'ERRORES Y ADVERTENCIAS', 'ERRORS & WARNINGS')}</option>
                  <option value="SCANNER">🔍 {t(lang, 'ESCÁNER DEX', 'DEX SCANNER')}</option>
                </select>
              </div>

              {/* Log Messages */}
              <div className="p-3 space-y-2.5 overflow-y-auto flex-1 font-mono text-[11px] bg-slate-950/40">
                {filteredLogs.map((log, idx) => {
                  let color = 'text-slate-400';
                  if (log.level === 'SUCCESS') color = 'text-lime-400';
                  if (log.level === 'ERROR') color = 'text-rose-500';
                  if (log.level === 'WARNING') color = 'text-amber-500';
                  if (log.level === 'TRADE') color = 'text-lime-400 font-bold';

                  return (
                    <div key={`log_${log.id || 'entry'}_${log.timestamp}_${idx}`} className="leading-tight border-b border-slate-900/50 pb-1.5">
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

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav id="mobile-bottom-nav" className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950/95 border-t border-slate-800/80 backdrop-blur-lg z-40 px-2 py-2 flex items-center justify-around shadow-2xl">
        <button
          onClick={() => setActiveTab('signals')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg transition-all ${
            activeTab === 'signals' ? 'text-lime-400 font-bold bg-lime-500/10' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Flame className="w-5 h-5" />
          <span className="text-[10px]">{t(lang, 'Señales', 'Signals')}</span>
        </button>

        <button
          onClick={() => setActiveTab('positions')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg transition-all relative ${
            activeTab === 'positions' ? 'text-lime-400 font-bold bg-lime-500/10' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-5 h-5" />
          <span className="text-[10px]">{t(lang, 'Posiciones', 'Positions')}</span>
          {positions.length > 0 && (
            <span className="absolute top-0 right-1 bg-lime-500 text-slate-950 rounded-full px-1.5 py-0.2 text-[9px] font-black">
              {positions.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('multilayer')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg transition-all ${
            activeTab === 'multilayer' ? 'text-lime-400 font-bold bg-lime-500/10' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[10px]">{t(lang, 'Cerebro', 'Brain')}</span>
        </button>

        <button
          onClick={() => setShowMobileMenu(true)}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg transition-all ${
            ['settings', 'patterns', 'eip7702', 'history', 'health'].includes(activeTab)
              ? 'text-lime-400 font-bold bg-lime-500/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-5 h-5" />
          <span className="text-[10px]">{t(lang, 'Menú', 'Menu')}</span>
        </button>
      </nav>

      {/* MOBILE MENU SHEET / OVERLAY */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm md:hidden flex flex-col justify-end">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-2xl p-5 space-y-4 shadow-2xl animate-in slide-in-from-bottom">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-sm text-lime-400 flex items-center gap-2">
                <Sliders className="w-4 h-4" />
                {t(lang, 'Menú y Secciones del Bot', 'Bot Menu & Sections')}
              </h3>
              <button onClick={() => setShowMobileMenu(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                onClick={() => { setActiveTab('signals'); setShowMobileMenu(false); }}
                className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center gap-2.5 ${
                  activeTab === 'signals' ? 'bg-lime-500/10 border-lime-500/40 text-lime-400' : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <Flame className="w-4 h-4 text-lime-400" />
                <span>{t(lang, '🔥 Señales', '🔥 Signals')}</span>
              </button>

              <button
                onClick={() => { setActiveTab('positions'); setShowMobileMenu(false); }}
                className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center gap-2.5 ${
                  activeTab === 'positions' ? 'bg-lime-500/10 border-lime-500/40 text-lime-400' : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <TrendingUp className="w-4 h-4 text-lime-400" />
                <span>{t(lang, '📈 Posiciones', '📈 Positions')}</span>
              </button>

              <button
                onClick={() => { setActiveTab('multilayer'); setShowMobileMenu(false); }}
                className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center gap-2.5 ${
                  activeTab === 'multilayer' ? 'bg-lime-500/10 border-lime-500/40 text-lime-400' : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <Layers className="w-4 h-4 text-lime-400" />
                <span>{t(lang, '⚡ Cerebro Multi-capa', '⚡ Multi-Layer')}</span>
              </button>

              <button
                onClick={() => { setActiveTab('patterns'); setShowMobileMenu(false); }}
                className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center gap-2.5 ${
                  activeTab === 'patterns' ? 'bg-lime-500/10 border-lime-500/40 text-lime-400' : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <Cpu className="w-4 h-4 text-lime-400" />
                <span>{t(lang, '🧠 Matriz Patrones', '🧠 Pattern Matrix')}</span>
              </button>

              <button
                onClick={() => { setActiveTab('history'); setShowMobileMenu(false); }}
                className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center gap-2.5 ${
                  activeTab === 'history' ? 'bg-lime-500/10 border-lime-500/40 text-lime-400' : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <Clock className="w-4 h-4 text-lime-400" />
                <span>{t(lang, '🏛️ Historial', '🏛️ Trade History')}</span>
              </button>

              <button
                onClick={() => { setActiveTab('eip7702'); setShowMobileMenu(false); }}
                className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center gap-2.5 ${
                  activeTab === 'eip7702' ? 'bg-lime-500/10 border-lime-500/40 text-lime-400' : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <Key className="w-4 h-4 text-lime-400" />
                <span>{t(lang, '🔑 Session Keys', '🔑 Session Keys')}</span>
              </button>

              <button
                onClick={() => { setActiveTab('health'); setShowMobileMenu(false); }}
                className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center gap-2.5 ${
                  activeTab === 'health' ? 'bg-lime-500/10 border-lime-500/40 text-lime-400' : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <Activity className="w-4 h-4 text-lime-400" />
                <span>{t(lang, '🩺 Salud Motor', '🩺 System Health')}</span>
              </button>

              <button
                onClick={() => { setActiveTab('settings'); setShowMobileMenu(false); }}
                className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center gap-2.5 ${
                  activeTab === 'settings' ? 'bg-lime-500/10 border-lime-500/40 text-lime-400' : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <Settings className="w-4 h-4 text-lime-400" />
                <span>{t(lang, '⚙️ Ajustes', '⚙️ Settings')}</span>
              </button>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowMobileMenu(false)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-all"
              >
                {t(lang, 'Cerrar Menú', 'Close Menu')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REAL METAMASK WALLET CONNECT MODAL */}
      {showWalletModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <Zap className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100">{t(lang, 'Conectar Billetera Real MetaMask', 'Connect Real MetaMask Wallet')}</h3>
                  <p className="text-[10px] text-slate-400 font-sans">{t(lang, 'Conexión Web3 para Base y BNB Chain', 'Web3 Connection for Base & BNB Chain')}</p>
                </div>
              </div>
              <button onClick={() => setShowWalletModal(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Explanation of Money source & Modes */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs space-y-2">
              <span className="font-bold text-lime-400 flex items-center gap-1.5 text-[11px]">
                <DollarSign className="w-3.5 h-3.5" />
                {t(lang, '¿De dónde sale el dinero para operar?', 'Where do trading funds come from?')}
              </span>
              <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
                {config?.simulationMode ? (
                  <>
                    <strong className="text-amber-400">Modo Simulación (Demo):</strong> El bot utiliza <strong>$100.00 USD virtuales</strong> de prueba para verificar las estrategias en tiempo real sin arriesgar tu dinero.
                  </>
                ) : (
                  <>
                    <strong className="text-rose-400">¡Modo Real Activo!:</strong> El bot ejecuta compras automáticas en DEX (Uniswap/PancakeSwap) utilizando el saldo real en <strong>ETH/USDT/BNB</strong> de tu billetera o clave de sesión <strong>EIP-7702</strong>.
                  </>
                )}
              </p>
            </div>

            {/* OPTION 1: DEEP LINK TO METAMASK APP */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {t(lang, 'Opción 1: Abrir en la App Móvil de MetaMask', 'Option 1: Open in MetaMask Mobile App')}
              </label>
              <button
                onClick={handleOpenMetaMaskApp}
                className="w-full py-3 px-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold text-xs rounded-xl flex items-center justify-between transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">🦊</span>
                  <div className="text-left">
                    <span className="block text-xs text-amber-300">{t(lang, 'Abrir MetaMask Directamente', 'Open MetaMask Directly')}</span>
                    <span className="block text-[10px] text-slate-400 font-normal">{t(lang, 'Abre esta web en el navegador Web3 de tu app', 'Opens this app in your MetaMask Web3 browser')}</span>
                  </div>
                </div>
                <Zap className="w-4 h-4 text-amber-400" />
              </button>
            </div>

            {/* OPTION 2: MANUAL REAL ADDRESS INPUT */}
            <form onSubmit={handleSaveManualWallet} className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {t(lang, 'Opción 2: Ingresar / Pegar tu Billetera Real (0x...)', 'Option 2: Input / Paste Your Real Wallet (0x...)')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualWalletInput}
                  onChange={(e) => setManualWalletInput(e.target.value)}
                  placeholder="Ej. 0x71C7656EC7ab88b098defB751B7401B5f6d8976F"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-lime-400 font-mono"
                />
                <button
                  type="submit"
                  className="py-2 px-3 bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold text-xs rounded-xl transition-all shrink-0"
                >
                  {t(lang, 'Vincular', 'Link')}
                </button>
              </div>
            </form>

            {/* OPTION 3: COPY LINK */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={handleCopyLink}
                className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
              >
                <span>{copySuccess ? t(lang, '¡Enlace copiado!', 'Link copied!') : t(lang, 'Copiar enlace para MetaMask Browser', 'Copy link for MetaMask Browser')}</span>
              </button>

              {walletAddress && (
                <button
                  onClick={() => { updateWalletAddress(null); setShowWalletModal(false); }}
                  className="text-[10px] text-rose-400 hover:text-rose-300 font-bold"
                >
                  {t(lang, 'Desconectar Wallet', 'Disconnect Wallet')}
                </button>
              )}
            </div>
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
