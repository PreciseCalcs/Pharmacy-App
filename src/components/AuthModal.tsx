import React, { useState, useEffect } from 'react';
import { X, KeyRound, UserCheck, Shield, AlertCircle, CheckCircle2, LifeBuoy } from 'lucide-react';
import { staffAuth } from '../services/staffAuth';
import { syncEngine } from '../services/syncEngine';
import { UserAccount } from '../types/pharmacy';
import { soundService } from '../services/soundAlerts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserChanged: (user: UserAccount) => void;
  initialTab?: 'switch' | 'changePin' | 'recoverPin';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onUserChanged,
  initialTab = 'switch',
}) => {
  const staffList = staffAuth.getStaffList();
  const currentUser = staffAuth.getCurrentUser();

  const [tab, setTab] = useState<'switch' | 'changePin' | 'recoverPin'>(initialTab);
  const [pin, setPin] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>(currentUser.id);

  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Owner PIN Recovery state
  const [recoveryMode, setRecoveryMode] = useState<'credentials' | 'recovery_key'>('credentials');
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [recoveryLicenceOrNtn, setRecoveryLicenceOrNtn] = useState('');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [recoveryNewPin, setRecoveryNewPin] = useState('7788');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedStaffId(staffAuth.getCurrentUser().id);
      setPin('');
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
      setRecoveryPhone('');
      setRecoveryLicenceOrNtn('');
      setRecoveryKeyInput('');
      setRecoveryNewPin('7788');
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

  const handleRecoverOwnerPin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

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
      setSuccess(res.message);
      onUserChanged(res.user);
      setTimeout(() => {
        onClose();
      }, 1100);
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
            <h3 className="font-bold text-sm">Staff Access &amp; Security</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
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
            className={`flex-1 py-3 text-center border-b-2 transition cursor-pointer ${
              tab === 'switch'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/30'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 inline mr-1" />
            Switch Staff
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('changePin');
              setError('');
              setSuccess('');
            }}
            className={`flex-1 py-3 text-center border-b-2 transition cursor-pointer ${
              tab === 'changePin'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/30'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 inline mr-1" />
            Change PIN
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('recoverPin');
              setError('');
              setSuccess('');
            }}
            className={`flex-1 py-3 text-center border-b-2 transition cursor-pointer ${
              tab === 'recoverPin'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/30'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <LifeBuoy className="w-3.5 h-3.5 inline mr-1" />
            Recover PIN
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
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">Enter Security PIN:</label>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('recoverPin');
                      setError('');
                      setSuccess('');
                    }}
                    className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Forgot Owner PIN?
                  </button>
                </div>
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
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Confirm Switch
                </button>
              </div>
            </form>
          )}

          {tab === 'changePin' && (
            <form onSubmit={handleChangePin} className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">Current PIN:</label>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('recoverPin');
                      setError('');
                      setSuccess('');
                    }}
                    className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Forgot Owner PIN?
                  </button>
                </div>
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
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Update PIN
                </button>
              </div>
            </form>
          )}

          {tab === 'recoverPin' && (
            <form onSubmit={handleRecoverOwnerPin} className="space-y-3 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                Verify your <strong>Pharmacy Licence / NTN &amp; Phone</strong> or your <strong>Master Recovery Key</strong> to reset the Owner PIN and switch to the Owner account.
              </div>

              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMode('credentials');
                    setError('');
                  }}
                  className={`py-1.5 px-2 rounded-lg transition cursor-pointer ${
                    recoveryMode === 'credentials'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
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
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Master Recovery Key
                </button>
              </div>

              {recoveryMode === 'credentials' ? (
                <div className="space-y-2.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Registered Owner / Store Phone (or last 4 digits)
                    </label>
                    <input
                      type="text"
                      required
                      value={recoveryPhone}
                      onChange={(e) => setRecoveryPhone(e.target.value)}
                      placeholder="e.g. 03067617080 or 7080"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Drug Licence # (or last 6 chars), NTN #, or Owner Email
                    </label>
                    <input
                      type="text"
                      required
                      value={recoveryLicenceOrNtn}
                      onChange={(e) => setRecoveryLicenceOrNtn(e.target.value)}
                      placeholder="e.g. 139936M or 04-361-0047-139936M"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-700">
                    Owner Master Recovery Key
                  </label>
                  <input
                    type="text"
                    required
                    value={recoveryKeyInput}
                    onChange={(e) => setRecoveryKeyInput(e.target.value)}
                    placeholder="e.g. ZMS-7788-RECOVERY"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[11px] text-slate-500">
                    Default recovery key: <code className="font-mono font-bold text-slate-700">ZMS-7788-RECOVERY</code>
                  </p>
                </div>
              )}

              <div className="pt-1 border-t border-slate-100 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700">Set New Owner PIN (4–6 digits)</label>
                  <button
                    type="button"
                    onClick={() => setRecoveryNewPin('7788')}
                    className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Use Default (7788)
                  </button>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={recoveryNewPin}
                  onChange={(e) => setRecoveryNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="4 to 6 digits (e.g. 7788)"
                  className="w-full text-center text-base font-mono font-bold tracking-widest px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Reset Owner PIN &amp; Login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
