import React from 'react';
import { 
  Pill, 
  ShoppingCart, 
  ReceiptText, 
  Code2, 
  Server, 
  Wifi, 
  RefreshCw,
  AlertTriangle,
  HardDrive
} from 'lucide-react';
import { ConnectionStatus } from '../lib/pocketbase';

interface NavbarProps {
  activeTab: 'inventory' | 'pos' | 'transactions' | 'playground' | 'migration';
  setActiveTab: (tab: 'inventory' | 'pos' | 'transactions' | 'playground' | 'migration') => void;
  connectionStatus: ConnectionStatus;
  onRefreshHealth: () => void;
  lowStockCount: number;
  totalMedicines: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  connectionStatus,
  onRefreshHealth,
  lowStockCount,
  totalMedicines,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-lg">
      {/* Top Status & Architecture Banner */}
      <div className="bg-slate-950 px-4 py-1.5 border-b border-slate-800/80 text-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-slate-400">Architecture:</span>
            <span className="text-emerald-400 font-semibold">Unified PocketBase pb_public</span>
          </div>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <div className="flex items-center gap-1.5 text-slate-300 font-mono hidden md:flex">
            <HardDrive className="w-3.5 h-3.5 text-blue-400" />
            <span>Target Host: <strong className="text-blue-300">C:\pocketbase\pb_public</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-0.5 rounded border border-slate-700/60 font-mono">
            <Wifi className="w-3 h-3 text-cyan-400" />
            <span className="text-slate-400">Origin:</span>
            <span className="text-cyan-300 font-medium truncate max-w-[140px] sm:max-w-none">{connectionStatus.origin}</span>
          </div>

          <button
            onClick={onRefreshHealth}
            title="Recheck PocketBase connection"
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3 h-3 text-slate-400" />
            <span className="text-[11px]">Recheck</span>
          </button>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('inventory')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-500/20 ring-2 ring-emerald-400/30">
              <Pill className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-200">
                  PharmaBase
                </span>
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded">
                  Local-First
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Offline-First Pharmacy System &bull; PocketBase Native
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'inventory'
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Pill className="w-4 h-4" />
              <span className="hidden sm:inline">Inventory</span>
              <span className="text-xs bg-slate-900/60 px-1.5 py-0.2 rounded font-mono">
                {totalMedicines}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('pos')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'pos'
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">POS Dispense</span>
            </button>

            <button
              onClick={() => setActiveTab('transactions')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'transactions'
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <ReceiptText className="w-4 h-4" />
              <span className="hidden md:inline">Transactions</span>
            </button>

            <button
              onClick={() => setActiveTab('playground')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'playground'
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Code2 className="w-4 h-4" />
              <span className="hidden lg:inline">PB Query Console</span>
              <span className="lg:hidden">Queries</span>
            </button>

            <button
              onClick={() => setActiveTab('migration')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'migration'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-indigo-300 bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-700/40'
              }`}
            >
              <Server className="w-4 h-4 text-indigo-400" />
              <span className="font-semibold">Migration Hub</span>
            </button>
          </nav>

          {/* Low Stock Warning Pill */}
          {lowStockCount > 0 && (
            <div 
              onClick={() => setActiveTab('inventory')}
              className="cursor-pointer hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/20 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>{lowStockCount} Low Stock Alerts</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
