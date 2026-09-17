import React, { useState } from 'react';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Layers, 
  Filter, 
  Activity,
  DollarSign
} from 'lucide-react';

export interface OrderItem {
  id: string;
  tokenSymbol: string;
  tokenAddress: string;
  chainId: string;
  side: 'BUY' | 'SELL';
  type: string;
  status: 'FILLED' | 'PENDING' | 'CANCELLED' | 'REJECTED';
  priceUsd: number;
  sizeUsd: number;
  amountTokens: number;
  filledTimestamp: number;
  latencyMs?: number;
  slippagePercent?: number;
  targetTakeProfitPercent?: number;
  stopLossPercent?: number;
  pnlUsd?: number;
  pnlPercent?: number;
  exitReason?: string;
}

interface OrdersLifecycleViewProps {
  orders: OrderItem[];
  isLoading?: boolean;
}

export const OrdersLifecycleView: React.FC<OrdersLifecycleViewProps> = ({ orders, isLoading }) => {
  const [filterSide, setFilterSide] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');

  const filteredOrders = orders.filter(o => {
    if (filterSide === 'ALL') return true;
    return o.side === filterSide;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 shadow-md">
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 mb-4 gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-bold text-white">Orders Lifecycle & Execution Stream</h2>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
          <button
            onClick={() => setFilterSide('ALL')}
            className={`px-2.5 py-1 rounded font-semibold transition-colors ${filterSide === 'ALL' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
          >
            All ({orders.length})
          </button>
          <button
            onClick={() => setFilterSide('BUY')}
            className={`px-2.5 py-1 rounded font-semibold transition-colors ${filterSide === 'BUY' ? 'bg-emerald-800 text-emerald-200' : 'text-slate-400 hover:text-white'}`}
          >
            Buys
          </button>
          <button
            onClick={() => setFilterSide('SELL')}
            className={`px-2.5 py-1 rounded font-semibold transition-colors ${filterSide === 'SELL' ? 'bg-rose-800 text-rose-200' : 'text-slate-400 hover:text-white'}`}
          >
            Sells
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-slate-500 flex items-center justify-center gap-2">
          <Activity className="w-4 h-4 animate-spin text-cyan-400" />
          Cargando flujo de órdenes...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-sm">
          No hay órdenes registradas para el filtro seleccionado.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] font-semibold">
                <th className="py-2.5 px-3">Order / Time</th>
                <th className="py-2.5 px-3">Asset</th>
                <th className="py-2.5 px-3">Side & Type</th>
                <th className="py-2.5 px-3 text-right">Size USD</th>
                <th className="py-2.5 px-3 text-right">Exec Price</th>
                <th className="py-2.5 px-3 text-right">Slippage / Latency</th>
                <th className="py-2.5 px-3 text-right">Status / Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredOrders.map(order => {
                const isBuy = order.side === 'BUY';
                const formattedTime = new Date(order.filledTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                return (
                  <tr key={order.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3">
                      <span className="text-slate-300 font-sans block font-medium">{formattedTime}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{order.id.slice(0, 14)}...</span>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 font-sans font-bold text-white">
                        <span>{order.tokenSymbol}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-normal">
                          {order.chainId.toUpperCase()}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3 font-sans">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                        isBuy ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' : 'bg-rose-950 text-rose-400 border border-rose-800/60'
                      }`}>
                        {isBuy ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                        {order.side} ({order.type})
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-slate-200">
                      ${(order.sizeUsd ?? 0).toFixed(2)}
                    </td>

                    <td className="py-3 px-3 text-right text-slate-300">
                      ${(order.priceUsd ?? 0).toFixed(6)}
                    </td>

                    <td className="py-3 px-3 text-right text-slate-400 text-[11px]">
                      <span>{(order.slippagePercent ?? 0.85).toFixed(2)}% slip</span>
                      <span className="text-slate-500 block text-[10px]">{order.latencyMs || 140}ms</span>
                    </td>

                    <td className="py-3 px-3 text-right">
                      {order.pnlUsd !== undefined && order.pnlUsd !== null ? (
                        <span className={`inline-block font-bold text-xs ${order.pnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {order.pnlUsd >= 0 ? '+' : ''}${(order.pnlUsd ?? 0).toFixed(2)} ({(order.pnlPercent ?? 0).toFixed(1)}%)
                          <span className="block text-[10px] text-slate-500 font-sans font-normal">{order.exitReason || 'TP_REACHED'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-semibold">
                          <CheckCircle className="w-3 h-3" /> FILLED
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
