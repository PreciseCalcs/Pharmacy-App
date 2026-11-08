import React, { useState } from 'react';
import { X, KeyRound, UserCheck, Shield, AlertCircle, CheckCircle2 } from 'lucide-react';
import { staffAuth } from '../services/staffAuth';
import { UserAccount } from '../types/pharmacy';
import { soundService } from '../services/soundAlerts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserChanged: (user: UserAccount) => void;
  initialTab?: 'switch' | 'changePin';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onUserChanged,
  initialTab = 'switch',
}) => {
  const [tab, setTab] = useState<'switch' | 'changePin'>(initialTab);
  const [pin, setPin] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const staffList = staffAuth.getStaffList();
  const currentUser = staffAuth.getCurrentUser();

  const handleSwitchUser = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = staffAuth.switchUser(pin);
    if (res.success && res.user) {
      soundService.cashRegister();
      onUserChanged(res.user);
      onClose();
    } else {
      soundService.errorTone();
      setError(res.message || 'Invalid PIN');
    }
  };

  const handleChangePin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPin !== confirmPin) {
      setError('New PIN and confirmation do not match');
      return;
    }

    const res = staffAuth.changePin(currentUser.id, oldPin, newPin);
    if (res.success) {
      soundService.cashRegister();
      setSuccess('PIN changed successfully');
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      soundService.errorTone();
      setError(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-700" />
            <h3 className="font-bold text-slate-900 text-base">Staff Access & Security</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-200 text-xs font-semibold">
          <button
            onClick={() => {
              setTab('switch');
              setError('');
              setSuccess('');
            }}
            className={`flex-1 py-3 text-center border-b-2 transition ${
              tab === 'switch'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/30'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Switch Staff User
          </button>
          <button
            onClick={() => {
              setTab('changePin');
              setError('');
              setSuccess('');
            }}
            className={`flex-1 py-3 text-center border-b-2 transition ${
              tab === 'changePin'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/30'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Change Security PIN
          </button>
        </div>

        <div className="p-5">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {tab === 'switch' && (
            <form onSubmit={handleSwitchUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Select Staff Member:
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {staffList.map((staff) => (
                    <label
                      key={staff.id}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer text-xs transition ${
                        selectedStaffId === staff.id || (selectedStaffId === '' && currentUser.id === staff.id)
                          ? 'border-emerald-500 bg-emerald-50/50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                      onClick={() => setSelectedStaffId(staff.id)}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
                          {staff.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{staff.name}</div>
                          <div className="text-[10px] text-slate-500 capitalize">{staff.role}</div>
                        </div>
                      </div>
                      {currentUser.id === staff.id && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          Active Now
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Enter Security PIN:
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="&bull;&bull;&bull;&bull;"
                  className="w-full text-center tracking-widest text-lg font-mono px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!pin}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  Confirm Switch
                </button>
              </div>
            </form>
          )}

          {tab === 'changePin' && (
            <form onSubmit={handleChangePin} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Current PIN:
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value)}
                  placeholder="Enter current PIN"
                  className="w-full text-center tracking-widest text-sm font-mono px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New PIN (4-6 digits):
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="Enter new 4-6 digit PIN"
                  className="w-full text-center tracking-widest text-sm font-mono px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New PIN:
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="Re-enter new PIN"
                  className="w-full text-center tracking-widest text-sm font-mono px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!oldPin || !newPin || !confirmPin}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  Update PIN
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
