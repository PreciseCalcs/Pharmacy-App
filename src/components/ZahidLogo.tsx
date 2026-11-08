import React from 'react';

interface ZahidLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'icon-only' | 'monochrome';
  className?: string;
}

export const ZahidLogo: React.FC<ZahidLogoProps> = ({
  size = 'md',
  variant = 'full',
  className = '',
}) => {
  const iconDimensions = {
    sm: { w: 28, h: 28 },
    md: { w: 38, h: 38 },
    lg: { w: 48, h: 48 },
    xl: { w: 64, h: 64 },
  }[size];

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Precision Vector Emblem */}
      <div
        className="relative flex items-center justify-center shrink-0 rounded-xl bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-900 text-white shadow-md shadow-emerald-900/20 p-2"
        style={{ width: iconDimensions.w, height: iconDimensions.h }}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Medical Hexagon Shield */}
          <polygon
            points="50,6 88,28 88,72 50,94 12,72 12,28"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinejoin="round"
            className="text-emerald-300/80"
          />

          {/* Rx Mortar & Pestle Outline */}
          <path
            d="M30 45 C30 65, 70 65, 70 45 L28 45 Z"
            fill="currentColor"
            className="text-white"
          />
          {/* Pestle */}
          <path
            d="M62 25 L45 46"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            className="text-amber-300"
          />

          {/* Medical Center Cross */}
          <rect x="46" y="55" width="8" height="22" rx="2" fill="#10b981" />
          <rect x="39" y="62" width="22" height="8" rx="2" fill="#10b981" />

          {/* Z Emblem Accent */}
          <path
            d="M40 33 L60 33 L40 43 L60 43"
            stroke="#f59e0b"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Live Status indicator dot */}
        <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 border border-slate-900"></span>
        </span>
      </div>

      {variant !== 'icon-only' && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold tracking-tight text-slate-900 text-base sm:text-lg">
              Zahid Medical Store
            </span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
              RPh
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
            <span>Ghazipur Jalalpur Pirwala</span>
            <span>&bull;</span>
            <span className="text-emerald-700 font-mono text-[10px]">Lic: 04-361-0047-139936M</span>
          </div>
        </div>
      )}
    </div>
  );
};
