import React from 'react';
import { Calendar, RotateCcw } from 'lucide-react';
import { SaleTransaction } from '../types/pharmacy';
import { soundService } from '../services/soundAlerts';

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'this_month'
  | 'all_time'
  | 'custom';

export interface DashboardDateRangeState {
  preset: DateRangePreset;
  customStart: string; // YYYY-MM-DD
  customEnd: string;   // YYYY-MM-DD
}

interface DateRangePickerProps {
  value: DashboardDateRangeState;
  onChange: (next: DashboardDateRangeState) => void;
}

export function toLocalDateKey(dateObj: Date): string {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDateRangeMetadata(range: DashboardDateRangeState): {
  label: string;
  possessiveLabel: string;
  startDate: Date | null;
  endDate: Date | null;
  dayCount: number;
} {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (range.preset === 'today') {
    return {
      label: 'Today',
      possessiveLabel: "Today's",
      startDate: todayStart,
      endDate: todayEnd,
      dayCount: 1,
    };
  }

  if (range.preset === 'yesterday') {
    const yStart = new Date(todayStart);
    yStart.setDate(yStart.getDate() - 1);
    const yEnd = new Date(todayEnd);
    yEnd.setDate(yEnd.getDate() - 1);
    return {
      label: 'Yesterday',
      possessiveLabel: "Yesterday's",
      startDate: yStart,
      endDate: yEnd,
      dayCount: 1,
    };
  }

  if (range.preset === 'last_7_days') {
    const start7 = new Date(todayStart);
    start7.setDate(start7.getDate() - 6);
    return {
      label: 'Last 7 Days',
      possessiveLabel: 'Last 7 Days',
      startDate: start7,
      endDate: todayEnd,
      dayCount: 7,
    };
  }

  if (range.preset === 'this_month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const daysSoFar = Math.max(1, now.getDate());
    return {
      label: 'This Month',
      possessiveLabel: "This Month's",
      startDate: monthStart,
      endDate: todayEnd,
      dayCount: daysSoFar,
    };
  }

  if (range.preset === 'custom') {
    const startParts = (range.customStart || toLocalDateKey(todayStart)).split('-').map(Number);
    const endParts = (range.customEnd || toLocalDateKey(todayEnd)).split('-').map(Number);

    const cStart = new Date(
      startParts[0] || now.getFullYear(),
      (startParts[1] || 1) - 1,
      startParts[2] || 1,
      0,
      0,
      0,
      0
    );
    const cEnd = new Date(
      endParts[0] || now.getFullYear(),
      (endParts[1] || 1) - 1,
      endParts[2] || 1,
      23,
      59,
      59,
      999
    );

    const actualStart = cStart <= cEnd ? cStart : cEnd;
    const actualEnd = cStart <= cEnd ? cEnd : cStart;
    const diffDays = Math.max(
      1,
      Math.round((actualEnd.getTime() - actualStart.getTime()) / (1000 * 60 * 60 * 24))
    );

    const fmtShort = (d: Date) =>
      d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

    return {
      label: `${fmtShort(actualStart)} – ${fmtShort(actualEnd)}`,
      possessiveLabel: `${fmtShort(actualStart)} – ${fmtShort(actualEnd)}`,
      startDate: actualStart,
      endDate: actualEnd,
      dayCount: diffDays,
    };
  }

  // 'all_time'
  return {
    label: 'All Time',
    possessiveLabel: 'All-Time',
    startDate: null,
    endDate: null,
    dayCount: 30,
  };
}

export function filterSalesByDateRange(
  sales: SaleTransaction[],
  range: DashboardDateRangeState
): SaleTransaction[] {
  const { startDate, endDate } = getDateRangeMetadata(range);
  if (!startDate || !endDate) return sales;

  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  return sales.filter((s) => {
    const d = new Date(s.createdAt);
    const t = d.getTime();
    if (isNaN(t)) return false;
    return t >= startMs && t <= endMs;
  });
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({ value, onChange }) => {
  const presets: { id: DateRangePreset; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'last_7_days', label: 'Last 7 Days' },
    { id: 'this_month', label: 'This Month' },
    { id: 'all_time', label: 'All Time' },
    { id: 'custom', label: 'Custom Range' },
  ];

  const handleSelectPreset = (preset: DateRangePreset) => {
    soundService.click();
    if (preset === 'custom' && (!value.customStart || !value.customEnd)) {
      const todayStr = toLocalDateKey(new Date());
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      onChange({
        preset: 'custom',
        customStart: toLocalDateKey(sevenDaysAgo),
        customEnd: todayStr,
      });
      return;
    }
    onChange({
      ...value,
      preset,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white border border-slate-200 shadow-2xs text-xs">
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-slate-500 font-bold border-r border-slate-100">
          <Calendar className="w-3.5 h-3.5 text-emerald-700" />
          <span>Period:</span>
        </div>

        {presets.map((p) => {
          const isActive = value.preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelectPreset(p.id)}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-[#072418] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Custom Start & End Date Inputs */}
      {value.preset === 'custom' && (
        <div className="inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs animate-in fade-in duration-150">
          <input
            type="date"
            value={value.customStart}
            onChange={(e) =>
              onChange({
                ...value,
                preset: 'custom',
                customStart: e.target.value,
              })
            }
            className="px-2 py-1 rounded-lg border border-emerald-300 bg-white font-mono text-[11px] font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
          <span className="text-emerald-800 font-bold">to</span>
          <input
            type="date"
            value={value.customEnd}
            onChange={(e) =>
              onChange({
                ...value,
                preset: 'custom',
                customEnd: e.target.value,
              })
            }
            className="px-2 py-1 rounded-lg border border-emerald-300 bg-white font-mono text-[11px] font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
          <button
            type="button"
            onClick={() => handleSelectPreset('today')}
            className="p-1 rounded-lg text-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
            title="Reset to Today"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
