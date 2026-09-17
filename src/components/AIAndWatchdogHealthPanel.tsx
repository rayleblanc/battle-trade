import React, { useState } from 'react';
import { 
  Activity, 
  Cpu, 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Server, 
  RefreshCw, 
  Clock, 
  Sparkles,
  Zap
} from 'lucide-react';
import { WatchdogReport, FullSystemHealthReport } from '../backend/modules/watchdogs';

interface AIAndWatchdogHealthPanelProps {
  healthReport?: FullSystemHealthReport | null;
  quotaStatus?: {
    activeProvider: string;
    isQuotaExhausted: boolean;
    allGeminiExhausted: boolean;
    allGroqExhausted: boolean;
  };
  onRefreshHealth: () => Promise<void>;
  onForceReconcile: () => Promise<void>;
}

export const AIAndWatchdogHealthPanel: React.FC<AIAndWatchdogHealthPanelProps> = ({
  healthReport,
  quotaStatus,
  onRefreshHealth,
  onForceReconcile
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reconcileFeedback, setReconcileFeedback] = useState<string | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshHealth();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleReconcile = async () => {
    setIsRefreshing(true);
    try {
      await onForceReconcile();
      setReconcileFeedback('Reconciliación de ledger completada exitosamente.');
      setTimeout(() => setReconcileFeedback(null), 3500);
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'HEALTHY':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'DEGRADED':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'CRITICAL':
      case 'STALE':
        return <XCircle className="w-4 h-4 text-rose-400 shrink-0" />;
      default:
        return <Activity className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. AI Health & Model Cascade */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 shadow-md">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white">AI Router & Model Cascade (2026 Free Tier)</h2>
          </div>
          <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
            quotaStatus?.isQuotaExhausted 
              ? 'bg-rose-950 text-rose-300 border border-rose-800' 
              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
          }`}>
            {quotaStatus?.isQuotaExhausted ? 'Quota Exhausted (Deterministic Mode)' : 'Cascade Operational'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 text-xs">
          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Tier 1: Gemini Free Cascade</span>
            <div className="mt-1 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-white font-mono">gemini-3.8-flash (Primary)</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded ${quotaStatus?.allGeminiExhausted ? 'bg-rose-900/60 text-rose-300' : 'bg-emerald-900/60 text-emerald-300'}`}>
                  {quotaStatus?.allGeminiExhausted ? 'Exhausted' : 'Available'}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 block">Fallback to: 3.7-flash → 3.6-flash → flash-lite</span>
            </div>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Tier 2: Groq High-Speed</span>
            <div className="mt-1 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-white font-mono">qwen/qwen3.8-27b</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded ${quotaStatus?.allGroqExhausted ? 'bg-rose-900/60 text-rose-300' : 'bg-emerald-900/60 text-emerald-300'}`}>
                  {quotaStatus?.allGroqExhausted ? 'Exhausted' : 'Available'}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 block">Fallback to: qwen3.6 → openai/gpt-oss-120b</span>
            </div>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Tier 3: Deterministic Fallback</span>
            <div className="mt-1 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-white font-mono">Quantitative Rules Engine</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-900/60 text-cyan-300">100% Uptime</span>
              </div>
              <span className="text-[10px] text-slate-500 block">0ms Latency • No External API Dependencies</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          * Los modelos de IA proporcionan sentimiento, análisis de anomalías y autopsias de trades. <b>Nunca tienen autoridad directa de compra/venta ni control de claves privadas.</b>
        </p>
      </div>

      {/* 2. Autonomous Watchdogs Subsystems */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 shadow-md">
        <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 mb-3 gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">Watchdogs & Autonomous Invariants</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReconcile}
              disabled={isRefreshing}
              className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/50 rounded transition-colors flex items-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Reconciliar Ledger
            </button>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1 text-slate-400 hover:text-white bg-slate-800 rounded transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {reconcileFeedback && (
          <div className="mb-3 p-2 text-xs bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 rounded">
            {reconcileFeedback}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {healthReport?.watchdogs.map(w => (
            <div 
              key={w.name} 
              className="bg-slate-800/50 p-2.5 rounded-lg border border-slate-700/40 flex items-start gap-2.5 text-xs"
            >
              {getStatusIcon(w.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">{w.name}</span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(w.lastCheckTimestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{w.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
