import React, { useState } from 'react';
import { Wifi, WifiOff, RefreshCw, HardDrive, Server, ShieldCheck, Check } from 'lucide-react';
import { ConnectionStatus } from '../types/pharmacy';
import { syncEngine } from '../services/syncEngine';
import { soundService } from '../services/soundAlerts';

interface OfflineIndicatorProps {
  status: ConnectionStatus;
  onRefreshHealth: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  status,
  onRefreshHealth,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const pendingCount = syncEngine.getOutboxCount();

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncEngine.syncWithPocketBase();
      if (res.synced > 0) {
        soundService.cashRegister();
        setSyncResult(`Synced ${res.synced} pending actions to PocketBase successfully!`);
      } else if (res.failed > 0) {
        setSyncResult(`PocketBase offline. ${res.failed} actions kept safely in local queue.`);
      } else {
        setSyncResult('Local storage and PocketBase are completely up to date.');
      }
    } catch {
      setSyncResult('Sync attempt failed. Local data remains safe.');
    } finally {
      setIsSyncing(false);
      onRefreshHealth();
    }
  };

  return (
    <>
      {/* Pill Badge in Navbar */}
      <button
        onClick={() => setShowModal(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
          status.isPocketBaseLive
            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
            : pendingCount > 0
            ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
            : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
        }`}
        title="View PocketBase Connection & Local Storage Status"
      >
        <span
          className={`w-2 h-2 rounded-full ${
            status.isPocketBaseLive
              ? 'bg-emerald-500 animate-pulse'
              : pendingCount > 0
              ? 'bg-amber-500'
              : 'bg-slate-400'
          }`}
        />
        <span className="hidden sm:inline">
          {status.isPocketBaseLive ? 'PocketBase Live' : 'Offline Local Storage'}
        </span>
        <span className="sm:hidden">
          {status.isPocketBaseLive ? 'Live' : 'Offline'}
        </span>
        {pendingCount > 0 && (
          <span className="bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
            {pendingCount}
          </span>
        )}
      </button>

      {/* Connection Info Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-emerald-700" />
                <h3 className="font-bold text-slate-900 text-base">Backend & Local Storage Engine</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                &times;
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              {/* PocketBase Status Box */}
              <div className={`p-3 rounded-xl border flex items-start gap-3 ${
                status.isPocketBaseLive ? 'bg-emerald-50/60 border-emerald-300 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <div className="mt-0.5">
                  {status.isPocketBaseLive ? (
                    <Wifi className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <WifiOff className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <div>
                  <div className="font-bold text-sm">
                    {status.isPocketBaseLive ? 'PocketBase Instance Active' : 'Operating in Standalone Offline Mode'}
                  </div>
                  <p className="mt-0.5 text-[11px] opacity-90 leading-relaxed">
                    {status.isPocketBaseLive
                      ? 'Local PocketBase server is responding to real-time events and database operations.'
                      : 'Zero internet or backend required! Sales and stock changes are saved safely to local browser storage and will synchronize when PocketBase boots.'}
                  </p>
                </div>
              </div>

              {/* Architecture Details */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">API Endpoint:</span>
                  <span className="font-semibold text-slate-900">{status.origin}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">SDK Initialization:</span>
                  <span className="text-emerald-700 font-bold">new PocketBase() [Zero-URL]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Host Folder:</span>
                  <span className="text-slate-800">C:\pocketbase\pb_public</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Pending Outbox Items:</span>
                  <span className="font-bold text-amber-700">{pendingCount} actions queued</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Last Verified:</span>
                  <span className="text-slate-700">{status.lastChecked}</span>
                </div>
              </div>

              {syncResult && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{syncResult}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing Outbox...' : 'Sync Now'}</span>
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
