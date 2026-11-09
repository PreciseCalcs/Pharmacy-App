import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Bell,
  AlertTriangle,
  AlertOctagon,
  Volume2,
  VolumeX,
  ShieldAlert,
  Check,
  CalendarClock,
  PackageX,
  Clock,
  MapPin,
} from 'lucide-react';
import { StockAlert } from '../types/pharmacy';
import { soundService } from '../services/soundAlerts';
import { requestNotificationPermission } from '../services/notifications';
import { formatPKR } from '../utils/pharmacyHelpers';

interface NotificationDropdownProps {
  alerts: StockAlert[];
  onSelectAlert?: (alert: StockAlert) => void;
}

type AlertTab = 'all' | 'expiry' | 'stock';
type ExpiryFilterWindow = 'all_expiry' | '30_days' | '60_days' | '90_days' | 'expired';

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  alerts,
  onSelectAlert,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AlertTab>('all');
  const [expiryWindowFilter, setExpiryWindowFilter] = useState<ExpiryFilterWindow>('all_expiry');
  const [isMuted, setIsMuted] = useState(soundService.getMuted());
  const [browserNotifStatus, setBrowserNotifStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const dropdownRef = useRef<HTMLDivElement>(null);

  const criticalCount = alerts.filter((a) => a.urgency === 'high').length;

  // Separate Expiry vs Low-Stock alerts
  const expiryAlerts = useMemo(
    () => alerts.filter((a) => a.type === 'expired' || a.type === 'expiring_soon'),
    [alerts]
  );
  const stockAlerts = useMemo(
    () => alerts.filter((a) => a.type === 'out_of_stock' || a.type === 'low_stock'),
    [alerts]
  );

  // Breakdown counts for 30, 60, 90 days & expired
  const expiryCounts = useMemo(() => {
    const expired = expiryAlerts.filter(
      (a) => a.type === 'expired' || (a.daysRemaining !== undefined && a.daysRemaining <= 0)
    ).length;
    const within30 = expiryAlerts.filter(
      (a) =>
        a.expiryWindow === '30_days' ||
        (a.type === 'expiring_soon' &&
          a.daysRemaining !== undefined &&
          a.daysRemaining > 0 &&
          a.daysRemaining <= 30)
    ).length;
    const within60 = expiryAlerts.filter(
      (a) =>
        a.expiryWindow === '60_days' ||
        (a.type === 'expiring_soon' &&
          a.daysRemaining !== undefined &&
          a.daysRemaining > 30 &&
          a.daysRemaining <= 60)
    ).length;
    const within90 = expiryAlerts.filter(
      (a) =>
        a.expiryWindow === '90_days' ||
        (a.type === 'expiring_soon' &&
          a.daysRemaining !== undefined &&
          a.daysRemaining > 60 &&
          a.daysRemaining <= 90)
    ).length;

    return {
      all: expiryAlerts.length,
      expired,
      within30,
      within60,
      within90,
    };
  }, [expiryAlerts]);

  // Filtered alerts displayed in the list
  const visibleAlerts = useMemo(() => {
    let base = alerts;
    if (activeTab === 'expiry') {
      base = expiryAlerts;
    } else if (activeTab === 'stock') {
      return stockAlerts;
    }

    if (activeTab === 'all' && expiryWindowFilter === 'all_expiry') {
      return base;
    }

    // Apply 30 / 60 / 90 / expired filter
    if (expiryWindowFilter !== 'all_expiry') {
      return expiryAlerts.filter((a) => {
        const d = a.daysRemaining ?? 999;
        if (expiryWindowFilter === 'expired') {
          return a.type === 'expired' || d <= 0;
        }
        if (expiryWindowFilter === '30_days') {
          return a.expiryWindow === '30_days' || (d > 0 && d <= 30);
        }
        if (expiryWindowFilter === '60_days') {
          return a.expiryWindow === '60_days' || (d > 30 && d <= 60);
        }
        if (expiryWindowFilter === '90_days') {
          return a.expiryWindow === '90_days' || (d > 60 && d <= 90);
        }
        return true;
      });
    }

    return base;
  }, [alerts, expiryAlerts, stockAlerts, activeTab, expiryWindowFilter]);

  // Total at-risk inventory cost value across currently filtered expiry alerts
  const totalExpiryAtRiskValue = useMemo(() => {
    const targetList =
      activeTab === 'stock'
        ? []
        : visibleAlerts.filter((a) => a.type === 'expired' || a.type === 'expiring_soon');
    return targetList.reduce((sum, a) => sum + (a.atRiskValue || 0), 0);
  }, [visibleAlerts, activeTab]);

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

  const handleSelectExpiryTier = (tier: ExpiryFilterWindow) => {
    soundService.click();
    if (tier === expiryWindowFilter && activeTab === 'expiry') {
      setExpiryWindowFilter('all_expiry');
    } else {
      setActiveTab('expiry');
      setExpiryWindowFilter(tier);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
        title="Near Expiry (30/60/90 Days) & Low Stock Alerts"
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
        <div className="absolute right-0 mt-2 w-[360px] sm:w-[430px] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Top Header */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-700" />
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-slate-900 text-sm">Dispensary &amp; Expiry Alerts</h3>
                  <span className="text-[11px] bg-slate-200 text-slate-800 px-1.5 py-0.2 rounded-full font-mono font-bold">
                    {alerts.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  30 / 60 / 90-day near-expiry watch &amp; low-stock thresholds
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Sound Toggle */}
              <button
                onClick={handleToggleMute}
                className={`p-1.5 rounded-md text-xs flex items-center gap-1 transition cursor-pointer ${
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
                  className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded font-semibold cursor-pointer"
                >
                  Enable Push
                </button>
              )}
            </div>
          </div>

          {/* Primary Category Tabs: All | Near Expiry | Low Stock */}
          <div className="px-3 pt-2.5 pb-2 bg-white border-b border-slate-100 flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('all');
                setExpiryWindowFilter('all_expiry');
                soundService.click();
              }}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'all' && expiryWindowFilter === 'all_expiry'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>All</span>
              <span className="text-[10px] font-mono opacity-80">({alerts.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('expiry');
                setExpiryWindowFilter('all_expiry');
                soundService.click();
              }}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'expiry'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/70'
              }`}
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>Near Expiry</span>
              <span className="text-[10px] font-mono">({expiryAlerts.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('stock');
                setExpiryWindowFilter('all_expiry');
                soundService.click();
              }}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'stock'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/70'
              }`}
            >
              <PackageX className="w-3.5 h-3.5" />
              <span>Low Stock</span>
              <span className="text-[10px] font-mono">({stockAlerts.length})</span>
            </button>
          </div>

          {/* Near-Expiry 30 / 60 / 90 Days Horizon Matrix */}
          {activeTab !== 'stock' && (
            <div className="px-3.5 py-2.5 bg-slate-50/90 border-b border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-600" />
                  <span>Near Expiry Horizon (30 / 60 / 90 Days)</span>
                </span>
                {totalExpiryAtRiskValue > 0 && (
                  <span className="font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                    {formatPKR(totalExpiryAtRiskValue)} at risk
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => handleSelectExpiryTier('30_days')}
                  className={`py-1.5 px-1.5 rounded-lg border text-center transition cursor-pointer ${
                    expiryWindowFilter === '30_days'
                      ? 'bg-rose-600 text-white border-rose-700 shadow-2xs font-extrabold'
                      : 'bg-white hover:bg-rose-50 text-rose-800 border-rose-200 font-semibold'
                  }`}
                  title="Items expiring within 1 to 30 days — Urgent return or markdown"
                >
                  <div className="text-xs font-black font-mono">{expiryCounts.within30}</div>
                  <div className="text-[9px] uppercase tracking-tight">≤ 30 Days</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectExpiryTier('60_days')}
                  className={`py-1.5 px-1.5 rounded-lg border text-center transition cursor-pointer ${
                    expiryWindowFilter === '60_days'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-2xs font-extrabold'
                      : 'bg-white hover:bg-amber-50 text-amber-800 border-amber-200 font-semibold'
                  }`}
                  title="Items expiring within 31 to 60 days — Prioritize FEFO dispensing"
                >
                  <div className="text-xs font-black font-mono">{expiryCounts.within60}</div>
                  <div className="text-[9px] uppercase tracking-tight">31–60 Days</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectExpiryTier('90_days')}
                  className={`py-1.5 px-1.5 rounded-lg border text-center transition cursor-pointer ${
                    expiryWindowFilter === '90_days'
                      ? 'bg-sky-600 text-white border-sky-700 shadow-2xs font-extrabold'
                      : 'bg-white hover:bg-sky-50 text-sky-800 border-sky-200 font-semibold'
                  }`}
                  title="Items expiring within 61 to 90 days — Early expiry watch"
                >
                  <div className="text-xs font-black font-mono">{expiryCounts.within90}</div>
                  <div className="text-[9px] uppercase tracking-tight">61–90 Days</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectExpiryTier('expired')}
                  className={`py-1.5 px-1.5 rounded-lg border text-center transition cursor-pointer ${
                    expiryWindowFilter === 'expired'
                      ? 'bg-slate-900 text-white border-slate-950 shadow-2xs font-extrabold'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 font-semibold'
                  }`}
                  title="Already expired stock — Quarantine immediately"
                >
                  <div className="text-xs font-black font-mono">{expiryCounts.expired}</div>
                  <div className="text-[9px] uppercase tracking-tight">Expired</div>
                </button>
              </div>
            </div>
          )}

          {/* List of Alerts */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {visibleAlerts.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                <Check className="w-8 h-8 mx-auto text-emerald-500 mb-2 stroke-[2.5]" />
                <p className="text-sm font-semibold text-slate-700">No Matching Alerts</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {expiryWindowFilter !== 'all_expiry'
                    ? 'No stock items fall within this expiry window.'
                    : 'No expired items or low stock thresholds breached.'}
                </p>
              </div>
            ) : (
              visibleAlerts.map((alert) => {
                const isCrit = alert.urgency === 'high';
                const isExpiryAlert =
                  alert.type === 'expired' || alert.type === 'expiring_soon';

                // Determine badge label & color for 30 / 60 / 90 day windows
                let badgeText = alert.type.replace('_', ' ');
                let badgeClass = 'bg-red-100 text-red-800';

                if (alert.type === 'expired') {
                  badgeText = 'EXPIRED';
                  badgeClass = 'bg-rose-600 text-white';
                } else if (alert.type === 'expiring_soon') {
                  const d = alert.daysRemaining ?? 90;
                  if (d <= 30) {
                    badgeText = `NEAR EXPIRY · ≤30d (${d}d)`;
                    badgeClass = 'bg-rose-100 text-rose-800 border border-rose-300';
                  } else if (d <= 60) {
                    badgeText = `NEAR EXPIRY · ≤60d (${d}d)`;
                    badgeClass = 'bg-amber-100 text-amber-800 border border-amber-300';
                  } else {
                    badgeText = `NEAR EXPIRY · ≤90d (${d}d)`;
                    badgeClass = 'bg-sky-100 text-sky-800 border border-sky-300';
                  }
                } else if (alert.type === 'out_of_stock') {
                  badgeText = 'OUT OF STOCK';
                  badgeClass = 'bg-rose-100 text-rose-800';
                } else if (alert.type === 'low_stock') {
                  badgeText = 'LOW STOCK';
                  badgeClass = 'bg-amber-100 text-amber-800';
                }

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
                      ) : isExpiryAlert ? (
                        <CalendarClock
                          className={`w-4 h-4 ${
                            (alert.daysRemaining ?? 90) <= 30
                              ? 'text-rose-600'
                              : (alert.daysRemaining ?? 90) <= 60
                              ? 'text-amber-500'
                              : 'text-sky-600'
                          }`}
                        />
                      ) : (
                        <AlertTriangle
                          className={`w-4 h-4 ${isCrit ? 'text-rose-500' : 'text-amber-500'}`}
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-slate-900 truncate">{alert.name}</span>
                        <span
                          className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded whitespace-nowrap shrink-0 ${badgeClass}`}
                        >
                          {badgeText}
                        </span>
                      </div>

                      <p className="text-slate-600 mt-0.5 text-[11px] leading-snug">
                        {alert.message}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500 font-mono mt-1.5">
                        {alert.expiryDate && (
                          <span
                            className={`font-bold ${
                              alert.type === 'expired' || (alert.daysRemaining ?? 99) <= 30
                                ? 'text-rose-700'
                                : (alert.daysRemaining ?? 99) <= 60
                                ? 'text-amber-700'
                                : 'text-slate-700'
                            }`}
                          >
                            Exp: {alert.expiryDate}
                          </span>
                        )}
                        <span>&bull;</span>
                        <span>Batch: {alert.batchNumber}</span>
                        <span>&bull;</span>
                        <span>Stock: {alert.currentStock} packs</span>
                        {alert.shelfLocation && (
                          <>
                            <span>&bull;</span>
                            <span className="inline-flex items-center gap-0.5 text-slate-500">
                              <MapPin className="w-2.5 h-2.5" />
                              {alert.shelfLocation}
                            </span>
                          </>
                        )}
                        {isExpiryAlert && (alert.atRiskValue ?? 0) > 0 && (
                          <span className="ml-auto font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded">
                            {formatPKR(alert.atRiskValue!)} at risk
                          </span>
                        )}
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
