import React, { useState } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  DollarSign, 
  Sliders, 
  Zap, 
  Lock, 
  CheckCircle2, 
  Gauge, 
  Activity,
  ChevronRight
} from 'lucide-react';
import { AutonomousSystemState } from '../backend/modules/watchdogs';

interface RiskPanelProps {
  currentCapitalUsd: number;
  maxDailyExposureUsd: number;
  currentDailyExposureUsd: number;
  maxTradeSizeUsd: number;
  goplusMinScore: number;
  systemState: AutonomousSystemState;
  maxDrawdownPercent: number;
  consecutiveLosses: number;
  onUpdateCapitalTier: (tierUsd: number) => Promise<void>;
  onUpdateRiskLimits: (maxDaily: number, maxTrade: number, minScore: number) => Promise<void>;
}

export const RiskPanel: React.FC<RiskPanelProps> = ({
  currentCapitalUsd,
  maxDailyExposureUsd,
  currentDailyExposureUsd,
  maxTradeSizeUsd,
  goplusMinScore,
  systemState,
  maxDrawdownPercent,
  consecutiveLosses,
  onUpdateCapitalTier,
  onUpdateRiskLimits
}) => {
  const capitalTiers = [5, 10, 50, 100, 500, 1000, 10000];
  const [selectedTier, setSelectedTier] = useState<number>(1000);
  const [isUpdating, setIsUpdating] = useState(false);

  // Form local state for risk parameters
  const [editMaxDaily, setEditMaxDaily] = useState((maxDailyExposureUsd ?? 15).toString());
  const [editMaxTrade, setEditMaxTrade] = useState((maxTradeSizeUsd ?? 2.5).toString());
  const [editMinScore, setEditMinScore] = useState((goplusMinScore ?? 80).toString());
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const safeCurrentDaily = Number(currentDailyExposureUsd || 0);
  const safeMaxDaily = Number(maxDailyExposureUsd || 1);
  const safeMaxTrade = Number(maxTradeSizeUsd || 0);
  const safeMaxDrawdown = Number(maxDrawdownPercent || 0);
  const safeConsecutiveLosses = Number(consecutiveLosses || 0);

  const exposureConsumedPercent = Math.min(100, (safeCurrentDaily / (safeMaxDaily || 1)) * 100);

  const handleSelectTier = async (tier: number) => {
    setSelectedTier(tier);
    setIsUpdating(true);
    try {
      await onUpdateCapitalTier(tier);
      // Auto-scale parameters safely
      const newTradeSize = Math.max(0.5, tier * 0.025);
      const newDailyExp = Math.max(2.0, tier * 0.15);
      setEditMaxTrade((newTradeSize || 0).toFixed(2));
      setEditMaxDaily((newDailyExp || 0).toFixed(2));
      await onUpdateRiskLimits(newDailyExp, newTradeSize, parseFloat(editMinScore));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      await onUpdateRiskLimits(
        parseFloat(editMaxDaily) || 15.0,
        parseFloat(editMaxTrade) || 2.5,
        parseFloat(editMinScore) || 80
      );
      setSaveFeedback('Límites de riesgo actualizados.');
      setTimeout(() => setSaveFeedback(null), 3000);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 shadow-md">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-bold text-white">Risk Engine & Position Sizing</h2>
        </div>
        <span className="text-xs px-2.5 py-1 bg-slate-800 text-slate-300 rounded-full font-mono border border-slate-700">
          State: <b className="text-emerald-400">{systemState}</b>
        </span>
      </div>

      {/* Capital Tier Selection */}
      <div className="mb-5">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
          Select Capital Tier Mode (Parameter scaling)
        </label>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
          {capitalTiers.map(tier => {
            const isSelected = selectedTier === tier;
            return (
              <button
                key={tier}
                onClick={() => handleSelectTier(tier)}
                disabled={isUpdating}
                className={`py-2 px-1 text-xs font-bold rounded-lg border transition-all text-center ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-400 text-white shadow-sm ring-2 ring-indigo-500/40'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                ${tier >= 1000 ? `${tier / 1000}k` : tier}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">
          El motor reajusta automáticamente límites de gas, slippage y Kelly según el tamaño del capital.
        </p>
      </div>

      {/* Circuit Breakers & Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {/* Daily Exposure Gauge */}
        <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Daily Exposure Cap</span>
            <span className="font-mono text-slate-200">${safeCurrentDaily.toFixed(2)} / ${safeMaxDaily.toFixed(2)}</span>
          </div>
          <div className="w-full bg-slate-700/70 h-2 rounded-full overflow-hidden my-2">
            <div 
              className={`h-full transition-all duration-300 ${exposureConsumedPercent > 85 ? 'bg-rose-500' : exposureConsumedPercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${exposureConsumedPercent}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-400 text-right font-mono">{(exposureConsumedPercent || 0).toFixed(1)}% Consumed</span>
        </div>

        {/* Max Drawdown Circuit Breaker */}
        <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Drawdown Breaker</span>
            <span className="text-amber-400 font-mono font-bold">-{safeMaxDrawdown.toFixed(1)}% / -15.0%</span>
          </div>
          <p className="text-[11px] text-slate-300 mt-2">
            {safeMaxDrawdown >= 15.0 ? (
              <span className="text-rose-400 font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> CIRCUIT BREAKER HALTED</span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Normal Threshold Safe</span>
            )}
          </p>
        </div>

        {/* Consecutive Loss Streak Breaker */}
        <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Loss Streak Protection</span>
            <span className="text-cyan-300 font-mono font-bold">{safeConsecutiveLosses} losses in row</span>
          </div>
          <p className="text-[11px] text-slate-300 mt-2">
            {safeConsecutiveLosses >= 3 ? (
              <span className="text-orange-400 font-bold">DEFENSIVE MODE (25% Size)</span>
            ) : (
              <span className="text-emerald-400">100% Size Allowed (Normal)</span>
            )}
          </p>
        </div>
      </div>

      {/* Position Sizing Mathematical Model Form */}
      <form onSubmit={handleSaveLimits} className="bg-slate-800/40 p-3.5 rounded-lg border border-slate-700/40">
        <h3 className="text-xs font-bold text-slate-300 uppercase mb-3 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          Sizing Limits & Security Thresholds
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Max Ticket / Trade ($ USD)</label>
            <input
              type="number"
              step="0.1"
              value={editMaxTrade}
              onChange={e => setEditMaxTrade(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Max Daily Exposure ($ USD)</label>
            <input
              type="number"
              step="1"
              value={editMaxDaily}
              onChange={e => setEditMaxDaily(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 block mb-1">GoPlus Security Min (0-100)</label>
            <input
              type="number"
              value={editMinScore}
              onChange={e => setEditMinScore(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
          <span className="text-[11px] text-emerald-400">{saveFeedback}</span>
          <button
            type="submit"
            disabled={isUpdating}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold transition-colors disabled:opacity-50"
          >
            Actualizar Parámetros
          </button>
        </div>
      </form>
    </div>
  );
};
