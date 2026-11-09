import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Shield, AlertCircle, Delete } from 'lucide-react';
import { staffAuth } from '../services/staffAuth';
import { UserAccount } from '../types/pharmacy';
import { soundService } from '../services/soundAlerts';
import { ZahidLogo } from './ZahidLogo';

interface LockScreenProps {
  onUnlock: (user: UserAccount) => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
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
  }, [handleKeyPress, handleDelete, handleClear]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center space-y-5">
        {/* Logo and Store Badge */}
        <div className="flex flex-col items-center gap-2">
          <ZahidLogo size="lg" variant="icon-only" />
          <div>
            <h2 className="text-lg font-extrabold text-white tracking-tight">Zahid Medical Store</h2>
            <p className="text-xs text-emerald-400 font-medium flex items-center justify-center gap-1 mt-0.5">
              <Lock className="w-3.5 h-3.5" /> Dispense Register Locked
            </p>
          </div>
        </div>

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
              className="h-14 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-white text-xl font-bold border border-slate-700/60 active:scale-95 transition flex items-center justify-center shadow-xs"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-14 rounded-2xl bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-bold border border-slate-800 active:scale-95 transition flex items-center justify-center"
          >
            CLEAR
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            className="h-14 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-white text-xl font-bold border border-slate-700/60 active:scale-95 transition flex items-center justify-center shadow-xs"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="h-14 rounded-2xl bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 active:scale-95 transition flex items-center justify-center"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <p className="text-[11px] text-slate-500 pt-1">
          Enter your authorized 4–6 digit staff PIN to unlock register
        </p>
      </div>
    </div>
  );
};
