import React, { useState } from 'react';
import { 
  Code2, 
  Play, 
  Copy, 
  Check, 
  Terminal, 
  Database, 
  Layers, 
  ShieldAlert, 
  Zap,
  Sparkles
} from 'lucide-react';
import { pb, checkPocketBaseHealth } from '../lib/pocketbase';
import { pharmacyService } from '../services/pharmacyService';
import { MedicineRecord } from '../types/pharmacy';

interface QueryPlaygroundViewProps {
  medicines: MedicineRecord[];
  onDataChanged: () => void;
}

export const QueryPlaygroundView: React.FC<QueryPlaygroundViewProps> = ({
  medicines,
  onDataChanged,
}) => {
  const [selectedOp, setSelectedOp] = useState<'fetch_all' | 'update_stock' | 'secure_filter' | 'create_txn'>('fetch_all');
  const [isExecuting, setIsExecuting] = useState(false);
  const [queryOutput, setQueryOutput] = useState<unknown>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Playground parameters
  const [searchParam, setSearchParam] = useState('Amox');
  const [categoryParam, setCategoryParam] = useState('Antibiotics');
  const [targetMedId, setTargetMedId] = useState(medicines[0]?.id || 'med_amox500');
  const [stockDelta, setStockDelta] = useState(5);

  const getOperationDetails = () => {
    switch (selectedOp) {
      case 'fetch_all':
        return {
          title: '1. Fetching Entire Medicine Inventory / Stock Levels',
          description: 'Fetches all medicine records sorted alphabetically by name. Uses PocketBase getFullList which handles batching automatically.',
          supabaseCode: `// Legacy Supabase Query\nconst { data, error } = await supabase\n  .from('medicines')\n  .select('*')\n  .order('name', { ascending: true });`,
          pocketBaseCode: `// Official PocketBase SDK Syntax\nimport { pb } from '@/lib/pocketbase';\n\nconst medicines = await pb.collection('medicines').getFullList<MedicineRecord>({\n  sort: 'name',\n  requestKey: null, // disables auto-cancellation for reliable UI hydration\n});`,
          execute: async () => {
            const res = await pharmacyService.fetchInventory();
            return {
              dataSource: res.source,
              totalRecords: res.data.length,
              sampleRecords: res.data.slice(0, 3),
            };
          }
        };

      case 'update_stock':
        return {
          title: '2. Updating Medicine Remaining Stock on Transaction',
          description: 'Decrements or adjusts stock for a target medicine in PocketBase and creates an audit entry.',
          supabaseCode: `// Legacy Supabase Update\nconst { data, error } = await supabase\n  .from('medicines')\n  .update({ stock_quantity: newStock })\n  .eq('id', medicineId)\n  .select();`,
          pocketBaseCode: `// Official PocketBase SDK Syntax\nimport { pb } from '@/lib/pocketbase';\n\n// 1. Fetch current on-hand stock\nconst med = await pb.collection('medicines').getOne<MedicineRecord>('${targetMedId}');\n\n// 2. Validate availability & decrement\nconst newStock = Math.max(0, med.stock_quantity - ${stockDelta});\nconst updated = await pb.collection('medicines').update('${targetMedId}', {\n  stock_quantity: newStock,\n});`,
          execute: async () => {
            const med = medicines.find(m => m.id === targetMedId) || medicines[0];
            const newStock = Math.max(0, med.stock_quantity - stockDelta);
            const res = await pharmacyService.adjustStock(
              med.id, 
              newStock, 
              'Sale', 
              'POS Dispenser'
            );
            onDataChanged();
            return {
              updatedRecordId: res.id,
              medicineName: res.name,
              previousStock: med.stock_quantity,
              deductedUnits: stockDelta,
              newStockLevel: res.stock_quantity,
              timestamp: new Date().toISOString()
            };
          }
        };

      case 'secure_filter':
        return {
          title: '3. Secure Parameterized Querying',
          description: 'PocketBase provides injection-safe parameter substitution via pb.filter(...) with strongly-typed values.',
          supabaseCode: `// Legacy Supabase ilike & gte\nconst { data } = await supabase\n  .from('medicines')\n  .select('*')\n  .ilike('name', '%${searchParam}%')\n  .eq('category', '${categoryParam}')\n  .gt('stock_quantity', 0);`,
          pocketBaseCode: `// Official PocketBase SDK Syntax\nimport { pb } from '@/lib/pocketbase';\n\n// Uses secure parameter substitution {:param}\nconst filter = pb.filter(\n  'stock_quantity > {:min} && category = {:cat} && (name ~ {:q} || generic_name ~ {:q})',\n  {\n    min: 0,\n    cat: '${categoryParam}',\n    q: '${searchParam}',\n  }\n);\n\nconst results = await pb.collection('medicines').getFullList<MedicineRecord>({\n  filter,\n  sort: 'name',\n});`,
          execute: async () => {
            const res = await pharmacyService.searchMedicines(searchParam, categoryParam, false);
            return {
              matchedCount: res.length,
              filterApplied: `category = "${categoryParam}" && query = "${searchParam}"`,
              matches: res.map(m => ({
                id: m.id,
                name: m.name,
                category: m.category,
                stock_quantity: m.stock_quantity,
                unit_price: m.unit_price,
              }))
            };
          }
        };

      case 'create_txn':
        return {
          title: '4. Recording Completed Pharmacy Dispense Receipt',
          description: 'Saves full transaction receipt containing nested items JSON and payment details in PocketBase.',
          supabaseCode: `// Legacy Supabase Insert\nconst { data } = await supabase\n  .from('transactions')\n  .insert([payload])\n  .select();`,
          pocketBaseCode: `// Official PocketBase SDK Syntax\nimport { pb } from '@/lib/pocketbase';\n\nconst record = await pb.collection('transactions').create({\n  transaction_number: 'TXN-901842',\n  customer_name: 'John Doe',\n  pharmacist_name: 'Dr. Sarah Miller, RPh',\n  payment_method: 'Cash',\n  items: [\n    { medicine_id: 'med_amox500', quantity: 2, unit_price: 12.50, subtotal: 25.00 }\n  ],\n  subtotal: 25.00,\n  tax: 1.25,\n  total_amount: 26.25,\n});`,
          execute: async () => {
            const med = medicines[0];
            const res = await pharmacyService.processTransaction(
              [{
                medicine_id: med.id,
                medicine_name: med.name,
                generic_name: med.generic_name,
                batch_number: med.batch_number,
                quantity: 1,
                unit_price: med.unit_price,
                subtotal: med.unit_price,
              }],
              'Playground Test Patient',
              '+1 555-TEST',
              'Cash',
              'Query Tester'
            );
            onDataChanged();
            return {
              createdTransaction: res.transaction,
              source: res.source,
            };
          }
        };
    }
  };

  const op = getOperationDetails();

  const handleRunQuery = async () => {
    setIsExecuting(true);
    const start = performance.now();
    try {
      const output = await op.execute();
      setQueryOutput(output);
      setExecutionTime(Math.round(performance.now() - start));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setQueryOutput({ error: msg });
      setExecutionTime(Math.round(performance.now() - start));
    } finally {
      setIsExecuting(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Code2 className="w-6 h-6 text-emerald-600" />
          Interactive PocketBase Query Console & Code Refactor
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Direct side-by-side translation from Supabase to official PocketBase SDK queries. Test and execute live queries directly against your pharmacy data.
        </p>

        {/* Operation Tabs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
          {[
            { id: 'fetch_all', label: '1. Fetch Inventory', icon: Database },
            { id: 'update_stock', label: '2. Update Stock', icon: Zap },
            { id: 'secure_filter', label: '3. Secure Filters', icon: ShieldAlert },
            { id: 'create_txn', label: '4. Create Transaction', icon: Layers },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setSelectedOp(tab.id as typeof selectedOp);
                setQueryOutput(null);
              }}
              className={`flex items-center gap-2 p-3 rounded-xl border text-left transition font-medium text-xs sm:text-sm ${
                selectedOp === tab.id
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
              }`}
            >
              <tab.icon className={`w-4 h-4 ${selectedOp === tab.id ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Sandbox Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Code Translation & Parameters */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-base">{op.title}</h2>
              <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold px-2 py-0.5 rounded">
                Type-Safe TypeScript
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2 mb-4">{op.description}</p>

            {/* Parameter Inputs if applicable */}
            {selectedOp === 'secure_filter' && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Search Term</label>
                  <input
                    type="text"
                    value={searchParam}
                    onChange={(e) => setSearchParam(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={categoryParam}
                    onChange={(e) => setCategoryParam(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white"
                  >
                    <option value="Antibiotics">Antibiotics</option>
                    <option value="Analgesics & Antipyretics">Analgesics & Antipyretics</option>
                    <option value="Cardiovascular">Cardiovascular</option>
                    <option value="Respiratory">Respiratory</option>
                  </select>
                </div>
              </div>
            )}

            {selectedOp === 'update_stock' && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Select Medicine</label>
                  <select
                    value={targetMedId}
                    onChange={(e) => setTargetMedId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white"
                  >
                    {medicines.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.stock_quantity} left)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Deduct Quantity (Units)</label>
                  <input
                    type="number"
                    min="1"
                    value={stockDelta}
                    onChange={(e) => setStockDelta(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white"
                  />
                </div>
              </div>
            )}

            {/* Code Comparison */}
            <div className="space-y-3">
              {/* PocketBase (New) */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 bg-emerald-50/80 px-3 py-1.5 rounded-t-lg border-t border-x border-emerald-200">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    POCKETBASE REWRITTEN SYNTAX (Official SDK)
                  </span>
                  <button
                    onClick={() => copyCode(op.pocketBaseCode)}
                    className="flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="bg-slate-900 text-slate-100 p-4 rounded-b-lg text-xs font-mono overflow-x-auto leading-relaxed border-b border-x border-slate-800">
                  <code>{op.pocketBaseCode}</code>
                </pre>
              </div>

              {/* Supabase (Old) */}
              <div>
                <div className="text-xs font-semibold text-rose-800 bg-rose-50 px-3 py-1.5 rounded-t-lg border-t border-x border-rose-200">
                  <span>LEGACY SUPABASE CODE (REMOVED)</span>
                </div>
                <pre className="bg-slate-900/90 text-slate-400 p-3 rounded-b-lg text-xs font-mono overflow-x-auto leading-relaxed line-through decoration-rose-500/60 border-b border-x border-slate-800">
                  <code>{op.supabaseCode}</code>
                </pre>
              </div>
            </div>

            {/* Execute Button */}
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Runs live against local PocketBase client instance
              </span>
              <button
                onClick={handleRunQuery}
                disabled={isExecuting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm shadow-emerald-600/30 transition disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>{isExecuting ? 'Running Query...' : 'Execute Live in Console'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Output Terminal */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-950 rounded-xl shadow-lg border border-slate-800 p-5 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>SDK Response Output</span>
              </div>
              {executionTime !== null && (
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                  {executionTime} ms
                </span>
              )}
            </div>

            {queryOutput ? (
              <pre className="text-xs font-mono text-emerald-300 max-h-[480px] overflow-y-auto overflow-x-auto p-2 bg-slate-900/80 rounded border border-slate-800 leading-relaxed">
                <code>{JSON.stringify(queryOutput, null, 2)}</code>
              </pre>
            ) : (
              <div className="py-20 text-center text-slate-500 text-xs font-mono">
                <Terminal className="w-8 h-8 mx-auto text-slate-700 mb-2 stroke-1" />
                <p>Click "Execute Live in Console" to inspect live response</p>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Client: PocketBase JS v0.28</span>
              <span className="font-mono text-slate-500">Origin: Auto-inherited</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
