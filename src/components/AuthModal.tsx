import React, { useState, useEffect } from 'react';
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
  const staffList = staffAuth.getStaffList();
  const currentUser = staffAuth.getCurrentUser();

  const [tab, setTab] = useState<'switch' | 'changePin'>(initialTab);
  const [pin, setPin] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>(currentUser.id);

  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedStaffId(staffAuth.getCurrentUser().id);
      setPin('');
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
      setError('');
      setSuccess('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSwitchUser = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = staffAuth.switchUser(pin, selectedStaffId || undefined);
    if (res.success && res.user) {
      soundService.cashRegister();
      onUserChanged(res.user);
      onClose();
    } else {
      soundService.errorTone();
      setError(res.message || 'Invalid PIN for selected staff member');
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
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm">Staff Access & Security</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-200 text-xs font-bold">
          <button
            type="button"
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
            <UserCheck className="w-3.5 h-3.5 inline mr-1" />
            Switch Staff User
          </button>
          <button
            type="button"
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
            <KeyRound className="w-3.5 h-3.5 inline mr-1" />
            Change Security PIN
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {tab === 'switch' && (
            <form onSubmit={handleSwitchUser} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">Select Staff Member:</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {staffList.map((staff) => (
                    <div
                      key={staff.id}
                      onClick={() => {
                        setSelectedStaffId(staff.id);
                        setError('');
                      }}
                      className={`p-2.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                        selectedStaffId === staff.id
                          ? 'border-emerald-500 bg-emerald-50/60'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                          {staff.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{staff.name}</p>
                          <p className="text-[11px] text-slate-500 capitalize">{staff.role}</p>
                        </div>
                      </div>
                      {currentUser.id === staff.id && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          Active Now
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Enter Security PIN:</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full text-center tracking-widest text-lg font-mono px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
                >
                  Confirm Switch
                </button>
              </div>
            </form>
          )}

          {tab === 'changePin' && (
            <form onSubmit={handleChangePin} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Current PIN:</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value)}
                  placeholder="Enter current PIN"
                  className="w-full text-center tracking-widest text-sm font-mono px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">New PIN (4-6 digits):</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="Enter new 4-6 digit PIN"
                  className="w-full text-center tracking-widest text-sm font-mono px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Confirm New PIN:</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="Re-enter new PIN"
                  className="w-full text-center tracking-widest text-sm font-mono px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
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
