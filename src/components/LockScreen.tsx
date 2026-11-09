import React, { useState } from 'react';
import { Lock, Unlock, Shield, AlertCircle, Delete } from 'lucide-react';
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

  const handleKeyPress = (digit: string) => {
    soundService.click();
    setError('');
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      // Auto submit if 4 or 6 digits match
      if (nextPin.length >= 4) {
        attemptUnlock(nextPin);
      }
    }
  };

  const handleDelete = () => {
    soundService.click();
    setPin(pin.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    soundService.click();
    setPin('');
    setError('');
  };

  const attemptUnlock = async (candidatePin: string) => {
    const res = await staffAuth.unlock(candidatePin);
    if (res.success && res.user) {
      soundService.cashRegister();
      onUnlock(res.user);
    } else {
      if (candidatePin.length >= 4) {
        soundService.errorTone();
        setError('Incorrect PIN. Try again.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center flex flex-col items-center">
        {/* Logo and Store Badge */}
        <div className="mb-4">
          <ZahidLogo size="lg" variant="icon-only" className="mx-auto mb-2" />
          <h2 className="text-xl font-extrabold text-white tracking-tight">Zahid Medical Store</h2>
          <p className="text-xs text-emerald-400 font-mono mt-0.5">Dispense Register Locked</p>
        </div>

        {/* Current User Card */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl px-4 py-2.5 mb-5 flex items-center gap-3 w-full justify-center">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
            {currentUser.name.charAt(0)}
          </div>
          <div className="text-left">
            <div className="text-xs font-semibold text-white">{currentUser.name}</div>
            <div className="text-[10px] text-slate-400 capitalize">{currentUser.role}</div>
          </div>
        </div>

        {/* PIN Dots */}
        <div className="flex items-center justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full border transition-all duration-150 ${
                pin.length > idx
                  ? 'bg-emerald-400 border-emerald-300 scale-110 shadow-sm shadow-emerald-400/50'
                  : 'bg-slate-800 border-slate-700'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-rose-400 mb-4 animate-shake">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Touch Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px] mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              onClick={() => handleKeyPress(digit)}
              className="h-14 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-white text-xl font-bold border border-slate-700/60 active:scale-95 transition flex items-center justify-center shadow-xs"
            >
              {digit}
            </button>
          ))}
          <button
            onClick={handleClear}
            className="h-14 rounded-2xl bg-slate-800/50 hover:bg-slate-800 text-slate-400 text-xs font-bold border border-slate-800 active:scale-95 transition flex items-center justify-center"
          >
            CLEAR
          </button>
          <button
            onClick={() => handleKeyPress('0')}
            className="h-14 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-white text-xl font-bold border border-slate-700/60 active:scale-95 transition flex items-center justify-center shadow-xs"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="h-14 rounded-2xl bg-slate-800/50 hover:bg-slate-800 text-slate-400 text-sm font-bold border border-slate-800 active:scale-95 transition flex items-center justify-center"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <div className="text-[11px] text-slate-500 mt-2">
          Default Owner: <code className="text-slate-300 font-mono">7788</code> &bull; Pharmacist: <code className="text-slate-300 font-mono">1234</code> &bull; Cashier: <code className="text-slate-300 font-mono">0000</code>
        </div>
      </div>
    </div>
  );
};
