import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  ArrowDownLeft, 
  ArrowUpRight, 
  CheckCircle2, 
  CreditCard, 
  DollarSign, 
  Calendar,
  X,
  AlertCircle
} from 'lucide-react';
import { CustomerKhata } from '../types/pharmacy';
import { syncEngine } from '../services/syncEngine';
import { soundService } from '../services/soundAlerts';
import { formatDate } from '../utils/dates';

interface CreditKhataViewProps {
  customers: CustomerKhata[];
  onCustomerUpdated?: () => void;
}

export const CreditKhataView: React.FC<CreditKhataViewProps> = ({
  customers,
  onCustomerUpdated,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customers[0]?.id || ''
  );

  // Record payment form states
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  // New Customer Modal
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newOpeningBalance, setNewOpeningBalance] = useState('');
  const [newCustomerError, setNewCustomerError] = useState('');

  // Filter customers by search
  const filteredCustomers = customers.filter((c) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.address && c.address.toLowerCase().includes(q))
    );
  });

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || filteredCustomers[0];
  const totalOutstanding = syncEngine.getTotalOutstandingKhata();

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) return;

    setIsRecordingPayment(true);
    try {
      await syncEngine.recordKhataPayment(selectedCustomer.id, amount, paymentMethod, paymentNote);
      soundService.cashRegister();
      setPaymentAmount('');
      setPaymentNote('');
      onCustomerUpdated?.();
    } catch (err) {
      soundService.errorTone();
      alert('Failed to record payment');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewCustomerError('');

    if (!newName.trim()) {
      setNewCustomerError('Customer name is required');
      return;
    }
    if (!newPhone.trim()) {
      setNewCustomerError('Customer phone is required');
      return;
    }

    try {
      const created = await syncEngine.addKhataCustomer({
        name: newName,
        phone: newPhone,
        address: newAddress,
        initialBalance: parseFloat(newOpeningBalance) || 0,
      });

      soundService.cashRegister();
      setSelectedCustomerId(created.id);
      setShowNewCustomerModal(false);
      setNewName('');
      setNewPhone('');
      setNewAddress('');
      setNewOpeningBalance('');
      onCustomerUpdated?.();
    } catch (err: any) {
      soundService.errorTone();
      setNewCustomerError(err?.message || 'Failed to create customer');
    }
  };

  return (
    <div className="space-y-6">
      {/* Title Header and Outstanding Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-emerald-800 tracking-wide uppercase">
            Customer accounts
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
            Credit khata
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Keep each credit sale, partial payment, and remaining balance together.
          </p>
        </div>

        {/* Total Outstanding Card (from Screenshot 2) */}
        <div className="flex items-center gap-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 shadow-2xs min-w-[200px]">
          <div className="w-10 h-10 rounded-xl bg-amber-100/90 text-amber-800 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-amber-900/70">Total outstanding</div>
            <div className="text-xl font-black text-slate-900 font-mono tracking-tight">
              Rs {totalOutstanding.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Split: Customer List & Detail Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Customers List (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-700" />
              <h3 className="font-bold text-slate-900 text-sm">
                Customers <span className="font-mono text-xs text-slate-500 font-normal ml-0.5">{customers.length}</span>
              </h3>
            </div>

            <button
              onClick={() => setShowNewCustomerModal(true)}
              className="px-3 py-1.5 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>New customer</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Find by name or phone"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50/50"
              />
            </div>
          </div>

          {/* Customer list */}
          <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
            {filteredCustomers.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No customers found matching search.
              </div>
            ) : (
              filteredCustomers.map((cust) => {
                const isSelected = selectedCustomer?.id === cust.id;
                const hasDue = cust.balanceDue > 0;

                return (
                  <div
                    key={cust.id}
                    onClick={() => {
                      setSelectedCustomerId(cust.id);
                      soundService.click();
                    }}
                    className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer transition ${
                      isSelected
                        ? 'bg-emerald-50/60 border-l-4 border-l-emerald-600'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0">
                        {cust.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">
                          {cust.name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {cust.phone}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-bold text-xs sm:text-sm font-mono text-slate-900">
                        Rs {cust.balanceDue.toLocaleString()}
                      </div>
                      <div className="text-[10px] font-semibold mt-0.5">
                        {hasDue ? (
                          <span className="text-amber-700">Due</span>
                        ) : (
                          <span className="text-emerald-700">Clear</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Customer Ledger & Record Payment (7 Cols) */}
        {selectedCustomer ? (
          <div className="lg:col-span-7 space-y-4">
            {/* Customer Details Top Bar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-base flex items-center justify-center shrink-0">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{selectedCustomer.name}</h2>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    {selectedCustomer.phone} {selectedCustomer.address && `· ${selectedCustomer.address}`}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-slate-500 block">Balance due</span>
                <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                  Rs {selectedCustomer.balanceDue.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Record a Payment Form (Screenshot 2) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-emerald-700" />
                <span>Record a payment</span>
              </h3>

              <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Amount received (Rs)
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="Enter amount"
                      required
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Payment method
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="Cash">Cash</option>
                      <option value="EasyPaisa">EasyPaisa</option>
                      <option value="JazzCash">JazzCash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Note (optional, e.g. Part payment, Advance)"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    className="flex-1 w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={!paymentAmount || isRecordingPayment}
                    className="w-full sm:w-auto px-5 py-2 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isRecordingPayment ? 'Recording...' : 'Record payment'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Account History (Screenshot 2) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-4">
                <Calendar className="w-4 h-4 text-emerald-700" />
                <span>Account history</span>
                <span className="text-xs text-slate-500 font-normal">
                  {selectedCustomer.history.length} entries
                </span>
              </h3>

              <div className="space-y-3">
                {selectedCustomer.history.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    No transactions recorded for this customer yet.
                  </div>
                ) : (
                  selectedCustomer.history.map((entry) => {
                    const isPayment = entry.type === 'payment';

                    return (
                      <div
                        key={entry.id}
                        className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isPayment
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {isPayment ? (
                              <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
                            )}
                          </div>

                          <div>
                            <div className="font-bold text-slate-900 text-xs sm:text-sm">
                              {entry.description}
                            </div>
                            <div className="text-[11px] text-slate-500 font-sans mt-0.5">
                              {formatDate(entry.date)}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div
                            className={`font-black font-mono text-xs sm:text-sm ${
                              isPayment ? 'text-emerald-700' : 'text-amber-800'
                            }`}
                          >
                            {isPayment ? `-Rs ${entry.amount.toLocaleString()}` : `+Rs ${entry.amount.toLocaleString()}`}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            <Users className="w-12 h-12 mx-auto mb-2 text-slate-300 stroke-1" />
            <p className="text-sm font-semibold text-slate-700">No Customer Selected</p>
            <p className="text-xs text-slate-400 mt-1">Select or create a customer to view their Khata ledger.</p>
          </div>
        )}
      </div>

      {/* New Customer Modal */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-700" />
                <h3 className="font-bold text-slate-900 text-base">Register New Khata Customer</h3>
              </div>
              <button
                onClick={() => setShowNewCustomerModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="p-5 space-y-3.5 text-xs">
              {newCustomerError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{newCustomerError}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Customer Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Nadeem Ahmed"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Phone / WhatsApp <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 0300 123 4567"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Address / Village</label>
                <input
                  type="text"
                  placeholder="e.g. Ghazipur Jalalpur Pirwala"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Initial Balance Due (Optional)
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={newOpeningBalance}
                  onChange={(e) => setNewOpeningBalance(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-[#083322] hover:bg-[#0c432d] text-white font-bold shadow-xs"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
