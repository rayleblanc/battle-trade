import React, { useState } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  AlertOctagon, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  ShieldAlert, 
  Clock, 
  DollarSign, 
  Layers, 
  Activity,
  Terminal
} from 'lucide-react';
import { AutonomousSystemState } from '../backend/modules/watchdogs';

interface ControlHeaderProps {
  totalEquityUsd?: number;
  cashUsd?: number;
  pnlUsd?: number;
  pnlPercent?: number;
  maxDrawdownPercent?: number;
  exposureUsd?: number;
  openPositionsCount?: number;
  marketRegime?: string;
  systemState?: AutonomousSystemState;
  dataFreshnessSeconds?: number;
  isSimulation?: boolean;
  isRunning?: boolean;
  onControlAction?: (action: 'RUN' | 'PAUSE_ENTRIES' | 'RESUME' | 'CLOSE_ALL' | 'EMERGENCY_STOP') => Promise<void>;
  onOpenTelegramConsole?: () => void;
  onRefresh?: () => void;
}

export const ControlHeader: React.FC<ControlHeaderProps> = ({
  totalEquityUsd = 100,
  cashUsd = 100,
  pnlUsd = 0,
  pnlPercent = 0,
  maxDrawdownPercent = 0,
  exposureUsd = 0,
  openPositionsCount = 0,
  marketRegime = 'MOMENTUM',
  systemState = 'NORMAL',
  dataFreshnessSeconds = 0,
  isSimulation = true,
  isRunning = true,
  onControlAction,
  onOpenTelegramConsole,
  onRefresh
}) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmKill, setConfirmKill] = useState(false);

  const handleAction = async (action: 'RUN' | 'PAUSE_ENTRIES' | 'RESUME' | 'CLOSE_ALL' | 'EMERGENCY_STOP') => {
    setLoadingAction(action);
    try {
      if (onControlAction) {
        await onControlAction(action);
      }
    } finally {
      setLoadingAction(null);
      setConfirmKill(false);
    }
  };

  const getStateBadge = (state?: AutonomousSystemState | string) => {
    switch (state) {
      case 'NORMAL':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60">NORMAL</span>;
      case 'CAUTION':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-950 text-amber-300 border border-amber-800/60">CAUTION (50% Size)</span>;
      case 'DEFENSIVE':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-950 text-orange-300 border border-orange-800/60">DEFENSIVE (25% Size)</span>;
      case 'FREEZE_ENTRIES':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-950 text-blue-300 border border-blue-800/60">ENTRIES FROZEN</span>;
      case 'HALTED':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-950 text-rose-300 border border-rose-800/60">HALTED (Breaker)</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60">NORMAL</span>;
    }
  };

  const isPositivePnl = (pnlUsd ?? 0) >= 0;

  const safeEquity = Number(totalEquityUsd || 0);
  const safeCash = Number(cashUsd || 0);
  const safePnlUsd = Number(pnlUsd || 0);
  const safePnlPercent = Number(pnlPercent || 0);
  const safeDrawdown = Number(maxDrawdownPercent || 0);
  const safeExposure = Number(exposureUsd || 0);
  const safeFreshness = Number(dataFreshnessSeconds || 0);
  const safePositionsCount = Number(openPositionsCount || 0);

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 p-3 sm:p-4 sticky top-0 z-30 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col gap-3">
        {/* Top row: Branding, state status, mode, live refresh */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                BATTLE TRADE <span className="text-xs px-2 py-0.5 font-normal bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 rounded">24/7 AUTONOMOUS</span>
              </h1>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              {getStateBadge(systemState)}
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${isSimulation ? 'bg-amber-900/40 text-amber-200 border border-amber-700/40' : 'bg-rose-900/40 text-rose-200 border border-rose-700/40'}`}>
                {isSimulation ? '🛡️ PAPER EXECUTION' : '⚡ LIVE ARMED'}
              </span>
            </div>
          </div>

          {/* Quick Remote Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenTelegramConsole}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/50 rounded-md flex items-center gap-1.5 transition-colors"
              title="Abrir Terminal Telegram"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Telegram Bot</span>
            </button>

            {isRunning ? (
              <button
                onClick={() => handleAction('PAUSE_ENTRIES')}
                disabled={loadingAction !== null}
                className="px-2.5 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded-md flex items-center gap-1 transition-colors shadow-sm disabled:opacity-50"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>PAUSE</span>
              </button>
            ) : (
              <button
                onClick={() => handleAction('RESUME')}
                disabled={loadingAction !== null}
                className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md flex items-center gap-1 transition-colors shadow-sm disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>RESUME</span>
              </button>
            )}

            <button
              onClick={() => handleAction('CLOSE_ALL')}
              disabled={loadingAction !== null || safePositionsCount === 0}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-800/40 rounded-md flex items-center gap-1 transition-colors disabled:opacity-40"
              title="Cerrar todas las posiciones abiertas a precio de mercado"
            >
              <Square className="w-3.5 h-3.5" />
              <span className="hidden md:inline">CLOSE ALL</span>
            </button>

            {confirmKill ? (
              <button
                onClick={() => handleAction('EMERGENCY_STOP')}
                disabled={loadingAction !== null}
                className="px-2.5 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-md flex items-center gap-1 animate-pulse"
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>CONFIRM KILL</span>
              </button>
            ) : (
              <button
                onClick={() => setConfirmKill(true)}
                className="px-2.5 py-1.5 text-xs font-medium bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/60 rounded-md flex items-center gap-1 transition-colors"
                title="Parada de emergencia total"
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">KILL</span>
              </button>
            )}

            <button
              onClick={onRefresh}
              className="p-1.5 text-slate-400 hover:text-slate-100 bg-slate-800 rounded-md transition-colors"
              title="Refrescar datos"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Metric Bar: Mobile-friendly scannable grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-1 border-t border-slate-800/80 text-xs">
          <div className="bg-slate-800/50 p-2 rounded border border-slate-700/40">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total Equity</span>
            <span className="text-sm font-bold text-white tracking-tight">${safeEquity.toFixed(2)}</span>
          </div>

          <div className="bg-slate-800/50 p-2 rounded border border-slate-700/40">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Available Cash</span>
            <span className="text-sm font-bold text-emerald-400 tracking-tight">${safeCash.toFixed(2)}</span>
          </div>

          <div className="bg-slate-800/50 p-2 rounded border border-slate-700/40">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Total PnL</span>
            <span className={`text-sm font-bold flex items-center gap-0.5 tracking-tight ${isPositivePnl ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isPositivePnl ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {isPositivePnl ? '+' : ''}${safePnlUsd.toFixed(2)} ({isPositivePnl ? '+' : ''}{safePnlPercent.toFixed(1)}%)
            </span>
          </div>

          <div className="bg-slate-800/50 p-2 rounded border border-slate-700/40">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Max Drawdown</span>
            <span className="text-sm font-bold text-amber-400 tracking-tight">-{safeDrawdown.toFixed(1)}%</span>
          </div>

          <div className="bg-slate-800/50 p-2 rounded border border-slate-700/40">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Active Exposure</span>
            <span className="text-sm font-bold text-cyan-300 tracking-tight">${safeExposure.toFixed(2)} ({safePositionsCount} pos)</span>
          </div>

          <div className="bg-slate-800/50 p-2 rounded border border-slate-700/40">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Market Regime</span>
            <span className="text-sm font-bold text-indigo-300 truncate block">{marketRegime || 'UNKNOWN'}</span>
          </div>

          <div className="bg-slate-800/50 p-2 rounded border border-slate-700/40 col-span-2 sm:col-span-1">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Data Freshness</span>
            <span className={`text-sm font-bold flex items-center gap-1 ${safeFreshness < 30 ? 'text-emerald-400' : 'text-amber-400'}`}>
              <Clock className="w-3 h-3" />
              {safeFreshness.toFixed(0)}s ago
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
