import React, { useState } from 'react';
import { 
  Zap, 
  Sliders, 
  Check, 
  RotateCcw, 
  Shield, 
  TrendingUp, 
  Layers, 
  Sparkles,
  DollarSign
} from 'lucide-react';

export interface StrategyConfigState {
  weights: Record<string, number>;
  enabled: Record<string, boolean>;
}

interface StrategiesConfigPanelProps {
  initialWeights?: Record<string, number>;
  initialEnabled?: Record<string, boolean>;
  onSaveConfig: (weights: Record<string, number>, enabled: Record<string, boolean>) => Promise<void>;
}

const STRATEGY_DEFINITIONS = [
  { id: 'momentum', name: 'Momentum Scalper', desc: 'Captures accelerated price and volume impulse waves', defaultWeight: 0.20 },
  { id: 'breakout', name: 'Range Breakout', desc: 'Identifies high volatility expansions beyond local resistance', defaultWeight: 0.15 },
  { id: 'newPool', name: 'New Pool / Early Momentum', desc: 'Detects newly initialized pools with clean GoPlus and burned LP', defaultWeight: 0.15 },
  { id: 'meanReversion', name: 'Mean Reversion', desc: 'Buys deep dips on high liquidity tokens with strong support', defaultWeight: 0.10 },
  { id: 'volumeExpansion', name: 'Volume Expansion', desc: 'Flags 5m volume multiples over 24h baseline with buy skew', defaultWeight: 0.15 },
  { id: 'liquidityEvent', name: 'Liquidity Injection Event', desc: 'Capitalizes on substantial LP additions and locked reserves', defaultWeight: 0.10 },
  { id: 'smartMoney', name: 'Smart Money Flow', desc: 'Tracks high win-rate wallet accumulation and net cohort flow', defaultWeight: 0.15 }
];

export const StrategiesConfigPanel: React.FC<StrategiesConfigPanelProps> = ({
  initialWeights,
  initialEnabled,
  onSaveConfig
}) => {
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    if (initialWeights && Object.keys(initialWeights).length > 0) return initialWeights;
    const def: Record<string, number> = {};
    STRATEGY_DEFINITIONS.forEach(s => { def[s.id] = s.defaultWeight; });
    return def;
  });

  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    if (initialEnabled && Object.keys(initialEnabled).length > 0) return initialEnabled;
    const def: Record<string, boolean> = {};
    STRATEGY_DEFINITIONS.forEach(s => { def[s.id] = true; });
    return def;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleToggle = (id: string) => {
    setEnabled(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleWeightChange = (id: string, newWeight: number) => {
    setWeights(prev => ({ ...prev, [id]: newWeight }));
  };

  const normalizeWeights = () => {
    const total = Object.entries(weights)
      .filter(([k]) => enabled[k])
      .reduce((acc: number, [, val]) => acc + Number(val || 0), 0);

    if (total <= 0) return;

    const normalized: Record<string, number> = {};
    for (const [k, val] of Object.entries(weights)) {
      if (enabled[k]) {
        normalized[k] = parseFloat((Number(val || 0) / total).toFixed(3));
      } else {
        normalized[k] = 0;
      }
    }
    setWeights(normalized);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveConfig(weights, enabled);
      setFeedback('Ponderaciones guardadas y sincronizadas.');
      setTimeout(() => setFeedback(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const activeSum = Object.entries(weights)
    .filter(([k]) => enabled[k])
    .reduce((acc: number, [, val]) => acc + Number(val || 0), 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 shadow-md">
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 mb-4 gap-2">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <h2 className="text-base font-bold text-white">Strategy Ensemble & Weights</h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={normalizeWeights}
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors flex items-center gap-1"
            title="Ajustar para que sumen 100%"
          >
            <RotateCcw className="w-3 h-3" />
            Normalizar (100%)
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-3 py-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1 shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            Guardar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        {STRATEGY_DEFINITIONS.map(strat => {
          const isStratEnabled = enabled[strat.id] ?? true;
          const currentWeight = weights[strat.id] ?? strat.defaultWeight;
          const percentage = (currentWeight * 100).toFixed(0);

          return (
            <div 
              key={strat.id} 
              className={`p-3 rounded-lg border transition-all ${
                isStratEnabled 
                  ? 'bg-slate-800/60 border-slate-700/60' 
                  : 'bg-slate-900/40 border-slate-800/60 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isStratEnabled}
                    onChange={() => handleToggle(strat.id)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-200">{strat.name}</span>
                </div>
                <span className="text-xs font-mono font-bold text-amber-400">{percentage}%</span>
              </div>

              <p className="text-[11px] text-slate-400 mb-2 pl-6">{strat.desc}</p>

              {isStratEnabled && (
                <div className="pl-6">
                  <input
                    type="range"
                    min="0"
                    max="0.50"
                    step="0.01"
                    value={currentWeight}
                    onChange={e => handleWeightChange(strat.id, parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-400">
        <span>Suma de pesos activos: <b className="font-mono text-white">{(activeSum * 100).toFixed(1)}%</b></span>
        {feedback && <span className="text-emerald-400 font-semibold">{feedback}</span>}
      </div>
    </div>
  );
};
