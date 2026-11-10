import React, { useEffect, useState, useMemo } from 'react';
import QRCode from 'qrcode';

interface BarcodeGeneratorProps {
  value: string;
  type?: 'code128' | 'qrcode' | 'both';
  width?: number;
  height?: number;
  showText?: boolean;
  className?: string;
}

/**
 * Official ISO/IEC 15417 Code-128 pattern table (values 0..106).
 * Each symbol 0..105 is 11 modules wide (3 bars, 3 spaces).
 * Stop symbol (106) is 13 modules wide (4 bars, 3 spaces including final 2-module termination bar).
 */
const CODE128_PATTERNS: readonly string[] = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '1100011101011',
];

const START_CODE_B = 104;
const STOP_CODE = 106;
const QUIET_ZONE = '0000000000'; // 10-module quiet zone on each side

export type BarcodeFormatPreset = 'ean13_pk' | 'short_8' | 'zms_sku';

/**
 * Computes the official GS1 Modulo-10 check digit for a 12-digit numeric prefix.
 */
export function calculateEAN13CheckDigit(digits12: string): string {
  const clean = digits12.replace(/\D/g, '').padEnd(12, '0').slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(clean[i], 10) || 0;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const remainder = sum % 10;
  const checkDigit = remainder === 0 ? 0 : 10 - remainder;
  return String(checkDigit);
}

/**
 * Generates a unique, scanner-ready barcode string that does not collide with existing inventory codes.
 * - 'ean13_pk': 13-digit GS1 Pakistan prefix (8964...) with valid Modulo-10 check digit
 * - 'short_8': Compact 8-digit store barcode (20XXXXXX) for narrow labels & loose strips
 * - 'zms_sku': Alphanumeric store barcode (ZMS-XXXXXX) for unpacked surgical/herbal/custom kits
 */
export function generateSmartBarcode(
  format: BarcodeFormatPreset = 'ean13_pk',
  existingCodes?: Set<string>,
  skuHint?: string
): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let candidate = '';
    if (format === 'ean13_pk') {
      const random8 = String(Math.floor(10000000 + Math.random() * 90000000));
      const base12 = `8964${random8}`;
      candidate = `${base12}${calculateEAN13CheckDigit(base12)}`;
    } else if (format === 'short_8') {
      const random6 = String(Math.floor(100000 + Math.random() * 900000));
      candidate = `20${random6}`;
    } else {
      const cleanHint = (skuHint || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 3);
      const randomDigits = String(Math.floor(1000 + Math.random() * 9000));
      candidate = cleanHint ? `ZMS-${cleanHint}${randomDigits}` : `ZMS-${Math.floor(100000 + Math.random() * 900000)}`;
    }

    if (!existingCodes || !existingCodes.has(candidate)) {
      return candidate;
    }
  }
  return `8964${Date.now().toString().slice(-8)}0`;
}

export function isCustomOrMissingBarcode(barcode?: string): {
  isMissing: boolean;
  isStoreGenerated: boolean;
} {
  const clean = (barcode || '').trim();
  if (!clean || clean.length < 4) {
    return { isMissing: true, isStoreGenerated: false };
  }
  const isStoreGenerated =
    clean.startsWith('ZMS-') ||
    clean.startsWith('20') ||
    clean.startsWith('896499') ||
    clean.startsWith('MED-');
  return { isMissing: false, isStoreGenerated };
}

/**
 * Encodes an ASCII string into valid Code-128B bars (with Start Code B, Modulo-103 Checksum, and Stop Pattern)
 */
export function encodeCode128B(rawInput: string): Array<{ width: number; isBlack: boolean }> {
  const clean = (rawInput || '0000000000').trim() || '0000000000';
  let checksum = START_CODE_B;
  const symbolPatterns: string[] = [QUIET_ZONE, CODE128_PATTERNS[START_CODE_B]];

  for (let i = 0; i < clean.length; i++) {
    const codePoint = clean.charCodeAt(i);
    // Code-128B supports ASCII 32..126 (values 0..94). Clamp out-of-range characters safely to '?' (31)
    const symbolVal = codePoint >= 32 && codePoint <= 126 ? codePoint - 32 : 31;
    checksum += symbolVal * (i + 1);
    symbolPatterns.push(CODE128_PATTERNS[symbolVal]);
  }

  const checksumSymbol = checksum % 103;
  symbolPatterns.push(CODE128_PATTERNS[checksumSymbol]);
  symbolPatterns.push(CODE128_PATTERNS[STOP_CODE]);
  symbolPatterns.push(QUIET_ZONE);

  const bitString = symbolPatterns.join('');
  const bars: Array<{ width: number; isBlack: boolean }> = [];

  let i = 0;
  while (i < bitString.length) {
    const currentBit = bitString[i];
    let runLength = 1;
    while (i + runLength < bitString.length && bitString[i + runLength] === currentBit) {
      runLength++;
    }
    bars.push({
      width: runLength,
      isBlack: currentBit === '1',
    });
    i += runLength;
  }

  return bars;
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
      QRCode.toDataURL(value || '0000000000', {
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

  const bars = useMemo(() => encodeCode128B(value || '0000000000'), [value]);
  const totalBarUnits = useMemo(
    () => bars.reduce((sum, b) => sum + b.width, 0),
    [bars]
  );

  const renderCode128Svg = () => (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${totalBarUnits} 40`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
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
                fill="#000000"
              />
            );
          }
          acc.x += bar.width;
          return acc;
        },
        { elements: [] as React.ReactNode[], x: 0 }
      ).elements}
    </svg>
  );

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {type === 'code128' && (
        <div className="flex flex-col items-center bg-white p-2 rounded-lg border border-slate-200">
          {renderCode128Svg()}
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
            {renderCode128Svg()}
            {showText && (
              <span className="font-mono text-xs font-semibold tracking-wider text-slate-700 mt-1">
                {value}
              </span>
            )}
          </div>
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt={`QR: ${value}`}
              className="w-16 h-16 object-contain border border-slate-100 rounded"
            />
          )}
        </div>
      )}
    </div>
  );
};
