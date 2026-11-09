import React, { useState } from 'react';
import { X, Users, UserPlus, Trash2, Key, Shield, Check, AlertCircle } from 'lucide-react';
import { staffAuth } from '../services/staffAuth';
import { UserAccount, UserRole } from '../types/pharmacy';
import { ROLE_INFO } from '../utils/permissions';
import { soundService } from '../services/soundAlerts';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStaffUpdated: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  onStaffUpdated,
}) => {
  const [staffList, setStaffList] = useState<UserAccount[]>(staffAuth.getStaffList());
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('cashier');
  const [pin, setPin] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const refreshList = () => {
    setStaffList(staffAuth.getStaffList());
    onStaffUpdated();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!name.trim()) {
      setError('Staff member name is required');
      return;
    }

    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must be 4 to 6 numeric digits');
      return;
    }

    const res = await staffAuth.addStaff({
      name: name.trim(),
      role,
      pin,
      phone: phone.trim() || undefined,
      isActive: true,
    });

    if (res.success) {
      soundService.cashRegister();
      setSuccess('Staff member account created');
      setName('');
      setPin('');
      setPhone('');
      setShowAddForm(false);
      refreshList();
    } else {
      soundService.errorTone();
      setError(res.message || 'Failed to create user');
    }
  };

  const handleDelete = (userId: string) => {
    if (!confirm('Are you sure you want to remove this staff account?')) return;
    const res = staffAuth.deleteStaff(userId);
    if (res.success) {
      soundService.click();
      refreshList();
    } else {
      soundService.errorTone();
      alert(res.message || 'Cannot delete staff');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-700" />
            <div>
              <h3 className="font-bold text-slate-900 text-base">Pharmacy Staff & RBAC Management</h3>
              <p className="text-xs text-slate-500">Configure role permissions, security PINs, and counter staff</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Top Action Bar */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Active Authorized Staff ({staffList.length})
            </span>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{showAddForm ? 'Cancel New Staff' : 'Add New Staff'}</span>
            </button>
          </div>

          {/* Add Staff Form Drawer */}
          {showAddForm && (
            <form onSubmit={handleCreate} className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3 text-xs">
              <h4 className="font-bold text-slate-900 text-sm">Create Authorized Staff Profile</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Full Name & Title</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Asad Ali, Dispenser"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Role & Permissions</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="owner">Chief Pharmacist / Owner (Full Access)</option>
                    <option value="pharmacist">Registered Pharmacist (Dispense & Reports)</option>
                    <option value="cashier">Counter Cashier (POS Dispensing Only)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Security PIN (4-6 digits)</label>
                  <input
                    type="password"
                    maxLength={6}
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="&bull;&bull;&bull;&bull;"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono tracking-widest text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number (Optional)</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0300-1234567"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  Save Profile
                </button>
              </div>
            </form>
          )}

          {/* Staff List Table */}
          <div className="space-y-2">
            {staffList.map((staff) => {
              const roleDetail = ROLE_INFO[staff.role];
              return (
                <div
                  key={staff.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm">
                      {staff.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{staff.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${roleDetail.badgeColor}`}>
                          {roleDetail.label}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3">
                        <span>PIN: <code className="font-mono text-slate-700">&bull;&bull;&bull;&bull;</code></span>
                        {staff.phone && <span>Phone: {staff.phone}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => handleDelete(staff.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Delete Staff"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
