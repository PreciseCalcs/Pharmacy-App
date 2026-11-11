import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Shield, AlertCircle, Delete, KeyRound, CheckCircle2 } from 'lucide-react';
import { staffAuth } from '../services/staffAuth';
import { syncEngine } from '../services/syncEngine';
import { UserAccount } from '../types/pharmacy';
import { soundService } from '../services/soundAlerts';
import { ZahidLogo } from './ZahidLogo';

interface LockScreenProps {
  onUnlock: (user: UserAccount) => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<'credentials' | 'recovery_key'>('credentials');
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [recoveryLicenceOrNtn, setRecoveryLicenceOrNtn] = useState('');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [recoveryNewPin, setRecoveryNewPin] = useState('7788');
  const [recoverySuccess, setRecoverySuccess] = useState('');

  const currentUser = staffAuth.getCurrentUser();

  const attemptUnlock = useCallback(
    (candidatePin: string) => {
      const res = staffAuth.unlock(candidatePin);
      if (res.success && res.user) {
        soundService.cashRegister();
        onUnlock(res.user);
      } else if (candidatePin.length >= 4) {
        soundService.errorTone();
        setError(res.message || 'Incorrect PIN. Try again.');
        setPin('');
      }
    },
    [onUnlock]
  );

  const handleKeyPress = useCallback(
    (digit: string) => {
      soundService.click();
      setError('');
      setPin((prev) => {
        if (prev.length >= 6) return prev;
        const nextPin = prev + digit;
        if (nextPin.length >= 4) {
          setTimeout(() => attemptUnlock(nextPin), 0);
        }
        return nextPin;
      });
    },
    [attemptUnlock]
  );

  const handleDelete = useCallback(() => {
    soundService.click();
    setPin((prev) => prev.slice(0, -1));
    setError('');
  }, []);

  const handleClear = useCallback(() => {
    soundService.click();
    setPin('');
    setError('');
  }, []);

  useEffect(() => {
    if (showRecovery) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showRecovery, handleKeyPress, handleDelete, handleClear]);

  const handleRecoverSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRecoverySuccess('');

    const details = syncEngine.getPharmacyDetails();
    const res = staffAuth.recoverOwnerPin(
      {
        mode: recoveryMode,
        phoneInput: recoveryPhone,
        licenceOrNtnOrEmail: recoveryLicenceOrNtn,
        recoveryKey: recoveryKeyInput,
        newPin: recoveryNewPin,
      },
      details
    );

    if (res.success && res.user) {
      soundService.cashRegister();
      setRecoverySuccess(res.message);
      setTimeout(() => {
        onUnlock(res.user!);
      }, 900);
    } else {
      soundService.errorTone();
      setError(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center space-y-5">
        {/* Logo and Store Badge */}
        <div className="flex flex-col items-center gap-2">
          <ZahidLogo size="lg" variant="icon-only" />
          <div>
            <h2 className="text-lg font-extrabold text-white tracking-tight">Zahid Medical Store</h2>
            <p className="text-xs text-emerald-400 font-medium flex items-center justify-center gap-1 mt-0.5">
              {showRecovery ? (
                <>
                  <KeyRound className="w-3.5 h-3.5" /> Owner PIN Recovery
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" /> Dispense Register Locked
                </>
              )}
            </p>
          </div>
        </div>

        {!showRecovery ? (
          <>
            {/* Current User Card */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-left">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold flex items-center justify-center text-sm">
                  {currentUser.name.charAt(0)}
                </div>
                <div>
                  <p className="text-xs font-bold text-white">{currentUser.name}</p>
                  <p className="text-[11px] text-slate-400 capitalize">{currentUser.role}</p>
                </div>
              </div>
              <Shield className="w-4 h-4 text-emerald-400" />
            </div>

            {/* PIN Dots */}
            <div className="flex items-center justify-center gap-3 py-2">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full border transition-all ${
                    pin.length > idx
                      ? 'bg-emerald-400 border-emerald-300 scale-110 shadow-sm shadow-emerald-400/50'
                      : 'bg-slate-800 border-slate-700'
                  }`}
                />
              ))}
            </div>

            {error && (
              <div className="px-3 py-2 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Touch Keypad */}
            <div className="grid grid-cols-3 gap-2.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleKeyPress(digit)}
                  className="h-14 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-white text-xl font-bold border border-slate-700/60 active:scale-95 transition flex items-center justify-center shadow-xs cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="h-14 rounded-2xl bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-bold border border-slate-800 active:scale-95 transition flex items-center justify-center cursor-pointer"
              >
                CLEAR
              </button>
              <button
                type="button"
                onClick={() => handleKeyPress('0')}
                className="h-14 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-white text-xl font-bold border border-slate-700/60 active:scale-95 transition flex items-center justify-center shadow-xs cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="h-14 rounded-2xl bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 active:scale-95 transition flex items-center justify-center cursor-pointer"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            <div className="pt-1 space-y-2">
              <p className="text-[11px] text-slate-500">
                Enter your authorized 4–6 digit staff PIN to unlock register
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowRecovery(true);
                  setError('');
                  setRecoverySuccess('');
                }}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Forgot Owner PIN? Recover &amp; Unlock</span>
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleRecoverSubmit} className="space-y-3 text-left text-xs">
            {error && (
              <div className="px-3 py-2 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {recoverySuccess && (
              <div className="px-3 py-2 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{recoverySuccess}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-800 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode('credentials');
                  setError('');
                }}
                className={`py-1.5 px-2 rounded-lg transition cursor-pointer ${
                  recoveryMode === 'credentials'
                    ? 'bg-slate-700 text-white shadow-2xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Licence &amp; Phone
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode('recovery_key');
                  setError('');
                }}
                className={`py-1.5 px-2 rounded-lg transition cursor-pointer ${
                  recoveryMode === 'recovery_key'
                    ? 'bg-slate-700 text-white shadow-2xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Master Key
              </button>
            </div>

            {recoveryMode === 'credentials' ? (
              <div className="space-y-2.5">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Owner / Store Phone (or last 4 digits)
                  </label>
                  <input
                    type="text"
                    required
                    value={recoveryPhone}
                    onChange={(e) => setRecoveryPhone(e.target.value)}
                    placeholder="e.g. 03067617080 or 7080"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Drug Licence # (or last 6 chars) or NTN #
                  </label>
                  <input
                    type="text"
                    required
                    value={recoveryLicenceOrNtn}
                    onChange={(e) => setRecoveryLicenceOrNtn(e.target.value)}
                    placeholder="e.g. 139936M or 04-361-0047-139936M"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-300">
                  Owner Master Recovery Key
                </label>
                <input
                  type="text"
                  required
                  value={recoveryKeyInput}
                  onChange={(e) => setRecoveryKeyInput(e.target.value)}
                  placeholder="e.g. ZMS-7788-RECOVERY"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-xs uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[10px] text-slate-400">
                  Default key: <code className="font-mono text-emerald-300">ZMS-7788-RECOVERY</code>
                </p>
              </div>
            )}

            <div className="pt-1 border-t border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-300">Set New Owner PIN (4–6 digits)</label>
                <button
                  type="button"
                  onClick={() => setRecoveryNewPin('7788')}
                  className="text-[11px] font-bold text-emerald-400 hover:underline cursor-pointer"
                >
                  Default (7788)
                </button>
              </div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={recoveryNewPin}
                onChange={(e) => setRecoveryNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="4 to 6 digits"
                className="w-full text-center text-base font-mono font-bold tracking-widest px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowRecovery(false);
                  setError('');
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
              >
                Back to Keypad
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm cursor-pointer"
              >
                Reset &amp; Unlock
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
