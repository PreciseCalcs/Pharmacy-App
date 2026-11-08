import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, Flashlight, RefreshCw, AlertCircle, CheckCircle2, Keyboard } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { soundService } from '../services/soundAlerts';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (scannedCode: string) => void;
  title?: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Scan Medicine Barcode or QR Code',
}) => {
  const [manualCode, setManualCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'zahid-qr-reader-container';

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    // Initialize camera listing
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back camera (environment) if available
          const backCam = devices.find((d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
          startCamera(backCam ? backCam.id : devices[0].id);
        } else {
          setErrorMessage('No camera devices detected on this computer or tablet.');
        }
      })
      .catch((err) => {
        console.warn('Camera access denied or unavailable:', err);
        setErrorMessage('Camera access was denied. You can enter the barcode manually below.');
      });

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async (cameraId: string) => {
    try {
      if (html5QrCodeRef.current) {
        await stopCamera();
      }

      const scanner = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
        verbose: false,
      });

      html5QrCodeRef.current = scanner;

      await scanner.start(
        cameraId,
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          soundService.scanSuccess();
          stopCamera();
          onScan(decodedText);
          onClose();
        },
        () => {
          // Frame error (safe to ignore)
        }
      );

      setIsCameraActive(true);
      setErrorMessage('');
    } catch (err: any) {
      console.warn('Failed to start Html5Qrcode scanner:', err);
      setIsCameraActive(false);
      setErrorMessage(err?.message || 'Could not start camera. Enter barcode manually.');
    }
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (e) {
        // Safe ignore
      }
      html5QrCodeRef.current = null;
      setIsCameraActive(false);
    }
  };

  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !isCameraActive) return;
    try {
      const nextTorch = !torchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as any],
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch not supported on this device', e);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    soundService.scanSuccess();
    stopCamera();
    onScan(manualCode.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-700" />
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">{title}</h3>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Camera Viewport */}
          <div className="relative bg-slate-950 rounded-xl overflow-hidden aspect-square flex items-center justify-center border-2 border-slate-800">
            <div id={scannerContainerId} className="w-full h-full" />

            {!isCameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                <Camera className="w-12 h-12 stroke-1 mb-2 text-slate-500" />
                <p className="text-xs">{errorMessage || 'Initializing video feed...'}</p>
              </div>
            )}

            {/* Target Reticle Overlay */}
            {isCameraActive && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-60 h-60 border-2 border-emerald-400/80 rounded-2xl relative">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg"></div>
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg"></div>
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg"></div>
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg"></div>
                  <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-0.5 bg-rose-500/80 animate-pulse"></div>
                </div>
              </div>
            )}

            {/* Camera Floating Controls */}
            {isCameraActive && (
              <div className="absolute bottom-3 right-3 flex items-center gap-2 z-10">
                <button
                  onClick={toggleTorch}
                  className={`p-2 rounded-full backdrop-blur-md shadow-md text-white transition ${
                    torchOn ? 'bg-amber-500' : 'bg-slate-900/70 hover:bg-slate-900'
                  }`}
                  title="Toggle Torch / Flashlight"
                >
                  <Flashlight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Camera Switcher */}
          {cameras.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Camera:</span>
              <select
                value={selectedCameraId}
                onChange={(e) => {
                  setSelectedCameraId(e.target.value);
                  startCamera(e.target.value);
                }}
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label || `Camera ${c.id.slice(0, 5)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Manual Entry Fallback Form */}
          <form onSubmit={handleManualSubmit} className="pt-2 border-t border-slate-200">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Keyboard className="w-3.5 h-3.5 text-slate-500" />
              <span>Or Type Barcode / GTIN Code Manually:</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="e.g. 896400010001"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
              >
                Submit Code
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
