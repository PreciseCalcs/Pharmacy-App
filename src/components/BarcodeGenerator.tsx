import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface BarcodeGeneratorProps {
  value: string;
  type?: 'code128' | 'qrcode' | 'both';
  width?: number;
  height?: number;
  showText?: boolean;
  className?: string;
}

export const BarcodeGenerator: React.FC<BarcodeGeneratorProps> = ({
  value,
  type = 'code128',
  width = 180,
  height = 50,
  showText = true,
  className = '',
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (type === 'qrcode' || type === 'both') {
      QRCode.toDataURL(value, {
        width: 140,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.warn('QR code generation error:', err));
    }
  }, [value, type]);

  // Procedural deterministic SVG 1D barcode generator (Code 128 style pattern)
  const generateBarcodeBars = (code: string) => {
    // Generate deterministic bar widths based on char codes
    const bars: Array<{ width: number; isBlack: boolean }> = [];
    // Start quiet zone & start guard
    bars.push({ width: 4, isBlack: false });
    bars.push({ width: 2, isBlack: true });
    bars.push({ width: 1, isBlack: false });
    bars.push({ width: 2, isBlack: true });

    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      hash = (hash << 5) - hash + code.charCodeAt(i);
      hash |= 0;
      const charCode = code.charCodeAt(i);
      const w1 = (charCode % 3) + 1;
      const w2 = ((charCode >> 2) % 3) + 1;
      const w3 = ((charCode >> 4) % 3) + 1;
      bars.push({ width: w1, isBlack: true });
      bars.push({ width: w2, isBlack: false });
      bars.push({ width: w3, isBlack: true });
      bars.push({ width: 1, isBlack: false });
    }

    // Stop guard
    bars.push({ width: 2, isBlack: true });
    bars.push({ width: 1, isBlack: false });
    bars.push({ width: 3, isBlack: true });
    bars.push({ width: 4, isBlack: false });

    return bars;
  };

  const bars = generateBarcodeBars(value || '0000000000');
  const totalBarUnits = bars.reduce((sum, b) => sum + b.width, 0);

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {type === 'code128' && (
        <div className="flex flex-col items-center bg-white p-2 rounded-lg border border-slate-200">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${totalBarUnits} 40`}
            preserveAspectRatio="none"
            className="w-full h-auto block"
          >
            {bars.reduce(
              (acc, bar) => {
                if (bar.isBlack) {
                  acc.elements.push(
                    <rect
                      key={acc.x}
                      x={acc.x}
                      y="0"
                      width={bar.width}
                      height="40"
                      fill="#0f172a"
                    />
                  );
                }
                acc.x += bar.width;
                return acc;
              },
              { elements: [] as React.ReactNode[], x: 0 }
            ).elements}
          </svg>
          {showText && (
            <span className="font-mono text-xs font-semibold tracking-wider text-slate-700 mt-1">
              {value}
            </span>
          )}
        </div>
      )}

      {type === 'qrcode' && qrDataUrl && (
        <div className="flex flex-col items-center bg-white p-2 rounded-lg border border-slate-200">
          <img src={qrDataUrl} alt={`QR Code: ${value}`} className="w-24 h-24 object-contain" />
          {showText && (
            <span className="font-mono text-[11px] text-slate-600 mt-1 max-w-[120px] truncate text-center">
              {value}
            </span>
          )}
        </div>
      )}

      {type === 'both' && (
        <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200">
          <div className="flex flex-col items-center">
            <svg
              width={width}
              height={height}
              viewBox={`0 0 ${totalBarUnits} 40`}
              preserveAspectRatio="none"
              className="w-full h-auto block"
            >
              {bars.reduce(
                (acc, bar) => {
                  if (bar.isBlack) {
                    acc.elements.push(
                      <rect
                        key={acc.x}
                        x={acc.x}
                        y="0"
                        width={bar.width}
                        height="40"
                        fill="#0f172a"
                      />
                    );
                  }
                  acc.x += bar.width;
                  return acc;
                },
                { elements: [] as React.ReactNode[], x: 0 }
              ).elements}
            </svg>
            {showText && (
              <span className="font-mono text-xs font-semibold tracking-wider text-slate-700 mt-1">
                {value}
              </span>
            )}
          </div>
          {qrDataUrl && (
            <img src={qrDataUrl} alt={`QR: ${value}`} className="w-16 h-16 object-contain border border-slate-100 rounded" />
          )}
        </div>
      )}
    </div>
  );
};
