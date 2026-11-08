import React, { useState, useRef, useEffect } from 'react';
import { Bell, AlertTriangle, AlertOctagon, Volume2, VolumeX, ShieldAlert, Check } from 'lucide-react';
import { StockAlert } from '../types/pharmacy';
import { soundService } from '../services/soundAlerts';
import { requestNotificationPermission } from '../services/notifications';

interface NotificationDropdownProps {
  alerts: StockAlert[];
  onSelectAlert?: (alert: StockAlert) => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  alerts,
  onSelectAlert,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(soundService.getMuted());
  const [browserNotifStatus, setBrowserNotifStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const dropdownRef = useRef<HTMLDivElement>(null);

  const criticalCount = alerts.filter((a) => a.urgency === 'high').length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleMute = () => {
    const muted = soundService.toggleMute();
    setIsMuted(muted);
  };

  const handleEnablePush = async () => {
    const perm = await requestNotificationPermission();
    setBrowserNotifStatus(perm);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
        title="Stock and Expiry Alerts"
      >
        <Bell className="w-5 h-5" />
        {alerts.length > 0 && (
          <span
            className={`absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white rounded-full ${
              criticalCount > 0 ? 'bg-rose-600 animate-pulse' : 'bg-amber-500'
            }`}
          >
            {alerts.length}
          </span>
        )}
      </button>

      {/* Flyout Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-700" />
              <h3 className="font-bold text-slate-900 text-sm">Dispensary Alerts</h3>
              <span className="text-xs bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full font-mono font-semibold">
                {alerts.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Sound Toggle */}
              <button
                onClick={handleToggleMute}
                className={`p-1.5 rounded-md text-xs flex items-center gap-1 transition ${
                  isMuted ? 'text-slate-400 bg-slate-200' : 'text-emerald-700 bg-emerald-100'
                }`}
                title={isMuted ? 'Sound alerts are muted' : 'Sound alerts are enabled'}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>

              {/* Push Permission */}
              {browserNotifStatus !== 'granted' && (
                <button
                  onClick={handleEnablePush}
                  className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded font-medium"
                >
                  Enable Push
                </button>
              )}
            </div>
          </div>

          {/* List of Alerts */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {alerts.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                <Check className="w-8 h-8 mx-auto text-emerald-500 mb-2 stroke-[2.5]" />
                <p className="text-sm font-semibold text-slate-700">All Stock in Healthy State</p>
                <p className="text-xs text-slate-400 mt-0.5">No expired items or low stock thresholds breached.</p>
              </div>
            ) : (
              alerts.map((alert) => {
                const isCrit = alert.urgency === 'high';
                return (
                  <div
                    key={alert.id}
                    onClick={() => {
                      onSelectAlert?.(alert);
                      setIsOpen(false);
                    }}
                    className={`p-3 text-xs flex items-start gap-2.5 hover:bg-slate-50 transition cursor-pointer ${
                      isCrit ? 'bg-rose-50/40' : ''
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {alert.type === 'expired' ? (
                        <AlertOctagon className="w-4 h-4 text-rose-600" />
                      ) : (
                        <AlertTriangle className={`w-4 h-4 ${isCrit ? 'text-rose-500' : 'text-amber-500'}`} />
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">{alert.name}</span>
                        <span
                          className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            alert.type === 'expired'
                              ? 'bg-rose-100 text-rose-800'
                              : alert.type === 'expiring_soon'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {alert.type.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-0.5 text-[11px] leading-snug">{alert.message}</p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-1">
                        <span>Batch: {alert.batchNumber}</span>
                        <span>&bull;</span>
                        <span>Stock: {alert.currentStock} packs</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
