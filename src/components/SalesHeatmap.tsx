import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  TrendingUp,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { SaleTransaction } from '../types/pharmacy';
import { formatPKR } from '../utils/pharmacyHelpers';
import { soundService } from '../services/soundAlerts';

interface SalesHeatmapProps {
  sales: SaleTransaction[];
  canViewProfits: boolean;
  selectedDateKey: string | null;
  onSelectDateKey: (dateKey: string | null) => void;
}

interface DayAnalytics {
  dateKey: string; // YYYY-MM-DD
  dayOfMonth: number;
  fullDateLabel: string;
  revenue: number;
  profit: number;
  transactionCount: number;
  refundedCount: number;
  unitsSold: number;
  peakHourLabel: string;
  peakHourSalesCount: number;
  peakHourRevenue: number;
  topSaleTimeLabel: string;
  topSaleInvoice: string;
  topSaleAmount: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toLocalDateKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatHourRange(hour24: number): string {
  const formatSingle = (h: number) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:00 ${period}`;
  };
  return `${formatSingle(hour24)} – ${formatSingle((hour24 + 1) % 24)}`;
}

export const SalesHeatmap: React.FC<SalesHeatmapProps> = ({
  sales,
  canViewProfits,
  selectedDateKey,
  onSelectDateKey,
}) => {
  // Default to the month of the most recent sale, or current local month
  const initialMonthKey = useMemo(() => {
    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (sales.length === 0) return currentYm;

    const hasCurrentMonthSale = sales.some(
      (s) => s.status !== 'refunded' && toLocalDateKey(s.createdAt).startsWith(currentYm)
    );
    if (hasCurrentMonthSale) return currentYm;

    const latestSale = sales.find((s) => s.status !== 'refunded') || sales[0];
    const latestKey = toLocalDateKey(latestSale.createdAt);
    return latestKey ? latestKey.slice(0, 7) : currentYm;
  }, [sales]);

  const [currentMonthKey, setCurrentMonthKey] = useState<string>(initialMonthKey);
  const [hoveredDay, setHoveredDay] = useState<DayAnalytics | null>(null);

  const todayDateKey = useMemo(() => toLocalDateKey(new Date()), []);

  // Parse active year and 0-indexed month
  const [year, monthIndex] = useMemo(() => {
    const parts = currentMonthKey.split('-');
    const y = parseInt(parts[0], 10) || new Date().getFullYear();
    const m = (parseInt(parts[1], 10) || 1) - 1;
    return [y, m];
  }, [currentMonthKey]);

  const monthTitle = useMemo(() => {
    const d = new Date(year, monthIndex, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [year, monthIndex]);

  // Step 1: Build daily map for all days in the selected month
  const { calendarCells, monthSummary } = useMemo(() => {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const firstDayWeekday = new Date(year, monthIndex, 1).getDay(); // 0 (Sun) - 6 (Sat)

    // Group sales by local YYYY-MM-DD within this month
    const groupedByDate = new Map<string, SaleTransaction[]>();
    const ymPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

    sales.forEach((txn) => {
      const key = toLocalDateKey(txn.createdAt);
      if (key.startsWith(ymPrefix)) {
        if (!groupedByDate.has(key)) {
          groupedByDate.set(key, []);
        }
        groupedByDate.get(key)!.push(txn);
      }
    });

    // First pass: calculate raw revenue for each day to find max daily revenue in month
    let maxDailyRevenue = 0;
    const rawDays: Omit<DayAnalytics, 'intensity'>[] = [];

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateKey = `${ymPrefix}-${String(dayNum).padStart(2, '0')}`;
      const dateObj = new Date(year, monthIndex, dayNum);
      const fullDateLabel = dateObj.toLocaleDateString('en-PK', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      const dayTxns = groupedByDate.get(dateKey) || [];
      const activeTxns = dayTxns.filter((t) => t.status !== 'refunded');
      const refundedCount = dayTxns.length - activeTxns.length;

      const revenue = activeTxns.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
      const profit = activeTxns.reduce((sum, t) => sum + (t.totalProfit || 0), 0);
      const unitsSold = activeTxns.reduce(
        (sum, t) => sum + t.items.reduce((acc, i) => acc + i.quantity, 0),
        0
      );

      if (revenue > maxDailyRevenue) {
        maxDailyRevenue = revenue;
      }

      // Calculate peak sale hour window & largest individual transaction time
      let peakHourLabel = 'No sales recorded';
      let peakHourSalesCount = 0;
      let peakHourRevenue = 0;
      let topSaleTimeLabel = '—';
      let topSaleInvoice = '';
      let topSaleAmount = 0;

      if (activeTxns.length > 0) {
        const hourBuckets = new Map<number, { count: number; rev: number }>();

        activeTxns.forEach((txn) => {
          const d = new Date(txn.createdAt);
          const hr = isNaN(d.getTime()) ? 12 : d.getHours();
          const prev = hourBuckets.get(hr) || { count: 0, rev: 0 };
          hourBuckets.set(hr, {
            count: prev.count + 1,
            rev: prev.rev + (txn.totalAmount || 0),
          });

          if (txn.totalAmount >= topSaleAmount) {
            topSaleAmount = txn.totalAmount;
            topSaleInvoice = txn.invoiceNumber;
            topSaleTimeLabel = isNaN(d.getTime())
              ? '—'
              : d.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
          }
        });

        // Pick peak hour by highest transaction count (tie-breaker: highest revenue)
        let bestHour = 12;
        hourBuckets.forEach((val, hr) => {
          if (
            val.count > peakHourSalesCount ||
            (val.count === peakHourSalesCount && val.rev > peakHourRevenue)
          ) {
            bestHour = hr;
            peakHourSalesCount = val.count;
            peakHourRevenue = val.rev;
          }
        });

        peakHourLabel = formatHourRange(bestHour);
      }

      rawDays.push({
        dateKey,
        dayOfMonth: dayNum,
        fullDateLabel,
        revenue,
        profit,
        transactionCount: activeTxns.length,
        refundedCount,
        unitsSold,
        peakHourLabel,
        peakHourSalesCount,
        peakHourRevenue,
        topSaleTimeLabel,
        topSaleInvoice,
        topSaleAmount,
      });
    }

    // Second pass: assign heatmap intensity 0..4
    const finalizedDays: DayAnalytics[] = rawDays.map((d) => {
      let intensity: 0 | 1 | 2 | 3 | 4 = 0;
      if (d.revenue > 0 && maxDailyRevenue > 0) {
        const ratio = d.revenue / maxDailyRevenue;
        if (ratio >= 0.75) intensity = 4;
        else if (ratio >= 0.5) intensity = 3;
        else if (ratio >= 0.25) intensity = 2;
        else intensity = 1;
      }
      return { ...d, intensity };
    });

    // Build padded 7-column calendar cells
    const cells: Array<DayAnalytics | null> = [];
    for (let i = 0; i < firstDayWeekday; i++) {
      cells.push(null);
    }
    finalizedDays.forEach((d) => cells.push(d));

    // Calculate overall month summary
    const activeDaysCount = finalizedDays.filter((d) => d.transactionCount > 0).length;
    const totalMonthRevenue = finalizedDays.reduce((s, d) => s + d.revenue, 0);
    const totalMonthTxns = finalizedDays.reduce((s, d) => s + d.transactionCount, 0);
    const busiestDay = finalizedDays.reduce<DayAnalytics | null>(
      (best, cur) => (cur.revenue > (best?.revenue || 0) ? cur : best),
      null
    );

    return {
      calendarCells: cells,
      monthSummary: {
        activeDaysCount,
        totalMonthRevenue,
        totalMonthTxns,
        busiestDay,
      },
    };
  }, [year, monthIndex, sales]);

  const handlePrevMonth = () => {
    const d = new Date(year, monthIndex - 1, 1);
    setCurrentMonthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    soundService.click();
  };

  const handleNextMonth = () => {
    const d = new Date(year, monthIndex + 1, 1);
    setCurrentMonthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    soundService.click();
  };

  const getCellStyle = (intensity: 0 | 1 | 2 | 3 | 4, isSelected: boolean) => {
    const ringClass = isSelected ? 'ring-2 ring-slate-900 ring-offset-1' : '';
    switch (intensity) {
      case 4:
        return `bg-[#083322] text-white border-[#06261a] shadow-xs ${ringClass}`;
      case 3:
        return `bg-emerald-600 text-white border-emerald-700 ${ringClass}`;
      case 2:
        return `bg-emerald-200/90 text-emerald-950 border-emerald-300 ${ringClass}`;
      case 1:
        return `bg-emerald-50 text-emerald-950 border-emerald-200 ${ringClass}`;
      default:
        return `bg-slate-50/70 text-slate-500 border-slate-200/70 hover:bg-slate-100/80 ${ringClass}`;
    }
  };

  // Active day to inspect in the right-hand / bottom inspector bar (hovered day or selected day or busiest day)
  const inspectedDay = useMemo(() => {
    if (hoveredDay) return hoveredDay;
    if (selectedDateKey) {
      const match = calendarCells.find((c) => c && c.dateKey === selectedDateKey);
      if (match) return match;
    }
    return monthSummary.busiestDay;
  }, [hoveredDay, selectedDateKey, calendarCells, monthSummary.busiestDay]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
      {/* Header & Month Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900">Daily Sales Revenue Heatmap</h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                {monthSummary.activeDaysCount} active trading{' '}
                {monthSummary.activeDaysCount === 1 ? 'day' : 'days'}
              </span>
              {selectedDateKey && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectDateKey(null);
                    soundService.click();
                  }}
                  className="px-2 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center gap-1 hover:bg-slate-700 transition cursor-pointer"
                >
                  <span>Filtered: {selectedDateKey}</span>
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Hover over any calendar date to inspect transaction volume and peak counter sale hours, or click a date to filter the register below.
            </p>
          </div>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 transition cursor-pointer"
            title="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
            <CalendarIcon className="w-3.5 h-3.5 text-emerald-700" />
            <input
              type="month"
              value={currentMonthKey}
              onChange={(e) => e.target.value && setCurrentMonthKey(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 transition cursor-pointer"
            title="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Layout: 7-Column Calendar Grid + Live Hover Inspector Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Calendar Grid (8 cols on large screens) */}
        <div className="lg:col-span-8 space-y-2">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-1"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((cell, idx) => {
              if (!cell) {
                return (
                  <div
                    key={`empty_${idx}`}
                    className="h-16 sm:h-20 rounded-xl bg-slate-50/30 border border-dashed border-slate-100"
                  />
                );
              }

              const isTodayCell = cell.dateKey === todayDateKey;
              const isSelected = selectedDateKey === cell.dateKey;
              const isDarkCell = cell.intensity >= 3;

              return (
                <div
                  key={cell.dateKey}
                  onMouseEnter={() => setHoveredDay(cell)}
                  onMouseLeave={() => setHoveredDay(null)}
                  onClick={() => {
                    soundService.click();
                    onSelectDateKey(isSelected ? null : cell.dateKey);
                  }}
                  className={`group relative h-16 sm:h-20 rounded-xl border p-1.5 sm:p-2 flex flex-col justify-between transition cursor-pointer select-none hover:scale-[1.02] ${getCellStyle(
                    cell.intensity,
                    isSelected
                  )}`}
                >
                  {/* Top row: Day number & Today dot */}
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-[11px] font-extrabold font-mono leading-none ${
                        isDarkCell
                          ? 'text-white'
                          : cell.intensity > 0
                            ? 'text-slate-900'
                            : 'text-slate-400'
                      }`}
                    >
                      {cell.dayOfMonth}
                    </span>

                    {isTodayCell && (
                      <span
                        className={`px-1 py-0.2 rounded text-[8px] font-black uppercase tracking-tighter ${
                          isDarkCell
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-emerald-700 text-white'
                        }`}
                      >
                        Today
                      </span>
                    )}
                  </div>

                  {/* Bottom row: Revenue & Txn count */}
                  {cell.revenue > 0 ? (
                    <div className="space-y-0.5">
                      <div
                        className={`text-[10px] sm:text-[11px] font-black font-mono truncate leading-tight ${
                          isDarkCell ? 'text-white' : 'text-emerald-950'
                        }`}
                      >
                        Rs {cell.revenue.toLocaleString('en-PK')}
                      </div>
                      <div
                        className={`text-[9px] font-semibold truncate hidden sm:block ${
                          isDarkCell ? 'text-emerald-100' : 'text-emerald-800/80'
                        }`}
                      >
                        {cell.transactionCount} {cell.transactionCount === 1 ? 'sale' : 'sales'}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[9px] text-slate-400/70 font-mono">Rs 0</div>
                  )}

                  {/* Floating Hover Tooltip */}
                  <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 p-3 rounded-xl bg-slate-900 text-white shadow-xl border border-slate-700 text-left text-[11px]">
                    <div className="font-bold text-emerald-300 border-b border-slate-700/80 pb-1.5 mb-1.5 flex items-center justify-between">
                      <span>{cell.fullDateLabel}</span>
                      <span className="font-mono text-[10px] text-slate-300">
                        {cell.transactionCount} txns
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Daily Revenue:</span>
                        <span className="font-mono font-bold text-white">
                          {formatPKR(cell.revenue)}
                        </span>
                      </div>

                      {canViewProfits && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Est. Profit:</span>
                          <span className="font-mono font-bold text-emerald-400">
                            {formatPKR(cell.profit)}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Transactions:</span>
                        <span className="font-semibold text-white">
                          {cell.transactionCount} completed
                          {cell.refundedCount > 0 ? ` (${cell.refundedCount} ref)` : ''}
                        </span>
                      </div>

                      <div className="pt-1 mt-1 border-t border-slate-800">
                        <span className="text-[10px] text-amber-300 font-bold block">
                          ⚡ Peak Sale Window:
                        </span>
                        <span className="text-white font-semibold block">
                          {cell.peakHourLabel}
                        </span>
                        {cell.peakHourSalesCount > 0 && (
                          <span className="text-[10px] text-slate-300 block font-mono">
                            {cell.peakHourSalesCount}{' '}
                            {cell.peakHourSalesCount === 1 ? 'sale' : 'sales'} ({formatPKR(cell.peakHourRevenue)})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Heatmap Color Legend */}
          <div className="flex items-center justify-between pt-2 text-[11px] text-slate-500 flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <span>Revenue Intensity:</span>
              <span className="w-3.5 h-3.5 rounded bg-slate-100 border border-slate-200 inline-block" title="Rs 0" />
              <span className="w-3.5 h-3.5 rounded bg-emerald-50 border border-emerald-200 inline-block" title="Low (<25% of peak)" />
              <span className="w-3.5 h-3.5 rounded bg-emerald-200 border border-emerald-300 inline-block" title="Moderate (25-50%)" />
              <span className="w-3.5 h-3.5 rounded bg-emerald-600 inline-block" title="High (50-75%)" />
              <span className="w-3.5 h-3.5 rounded bg-[#083322] inline-block" title="Peak Day (75-100%)" />
              <span className="ml-1 text-[10px] text-slate-400">(Click any date to filter table)</span>
            </div>

            <div className="font-mono text-xs font-bold text-slate-700">
              {monthTitle} Total: <span className="text-emerald-800">{formatPKR(monthSummary.totalMonthRevenue)}</span> ({monthSummary.totalMonthTxns} sales)
            </div>
          </div>
        </div>

        {/* Right Column: Live Date & Peak Sale Time Inspector Card (4 cols on large screens) */}
        <div className="lg:col-span-4 bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                {hoveredDay
                  ? 'Hovering Date Details'
                  : selectedDateKey
                    ? 'Pinned Date Details'
                    : 'Month Peak Day Highlight'}
              </span>
              <h4 className="text-sm font-extrabold text-slate-900 mt-0.5">
                {inspectedDay ? inspectedDay.fullDateLabel : monthTitle}
              </h4>
            </div>
            <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-emerald-700 shadow-2xs">
              <Clock className="w-4 h-4" />
            </div>
          </div>

          {inspectedDay ? (
            <div className="space-y-3 text-xs">
              {/* Revenue & Transactions */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-semibold block">
                    Daily Revenue
                  </span>
                  <span className="text-base font-black text-slate-900 font-mono mt-0.5 block">
                    {formatPKR(inspectedDay.revenue)}
                  </span>
                  {canViewProfits && (
                    <span className="text-[10px] text-emerald-700 font-mono font-semibold">
                      Profit: {formatPKR(inspectedDay.profit)}
                    </span>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-semibold block">
                    Transactions
                  </span>
                  <span className="text-base font-black text-slate-900 font-mono mt-0.5 block">
                    {inspectedDay.transactionCount}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {inspectedDay.unitsSold} units dispensed
                  </span>
                </div>
              </div>

              {/* Peak Sale Window Box */}
              <div className="p-3.5 rounded-xl bg-white border border-emerald-200 space-y-1.5">
                <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Peak Sale Window</span>
                </div>
                <div className="text-sm font-extrabold text-slate-900 font-mono">
                  {inspectedDay.peakHourLabel}
                </div>
                {inspectedDay.peakHourSalesCount > 0 ? (
                  <p className="text-[11px] text-slate-600">
                    <strong>{inspectedDay.peakHourSalesCount}</strong>{' '}
                    {inspectedDay.peakHourSalesCount === 1 ? 'transaction' : 'transactions'} generating{' '}
                    <strong className="font-mono text-emerald-800">
                      {formatPKR(inspectedDay.peakHourRevenue)}
                    </strong>{' '}
                    during this hour.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Hover over a highlighted green date to see peak rush hours.
                  </p>
                )}
              </div>

              {/* Top Invoice of the Day */}
              {inspectedDay.topSaleInvoice && (
                <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Largest Sale Receipt
                    </span>
                    <span className="font-mono font-bold text-slate-900 text-xs">
                      {inspectedDay.topSaleInvoice}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Recorded at {inspectedDay.topSaleTimeLabel}
                    </span>
                  </div>
                  <div className="text-right font-mono font-black text-emerald-700 text-sm">
                    {formatPKR(inspectedDay.topSaleAmount)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              No sales recorded in {monthTitle}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
