import React, { useState } from 'react';
import { 
  Server, 
  Trash2, 
  CheckCircle2, 
  Copy, 
  Check, 
  HardDrive, 
  Terminal, 
  Download, 
  Layers, 
  Cpu, 
  FileCode2,
  ExternalLink,
  ShieldCheck,
  FolderTree
} from 'lucide-react';

export const MigrationGuideView: React.FC = () => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2500);
  };

  const nextConfigSnippet = `// next.config.js or next.config.mjs (If using Next.js)
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enables flat static HTML/JS/CSS export into the 'out/' directory
  output: 'export',
  
  // Static export does not support on-demand image optimization server
  images: {
    unoptimized: true,
  },
  
  // Ensures clean relative routing when served from PocketBase pb_public
  trailingSlash: true,
};

module.exports = nextConfig;`;

  const viteConfigSnippet = `// vite.config.ts (Currently configured in your project)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  // CRITICAL: Relative base path ensures assets resolve correctly in pb_public
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});`;

  const pbInitSnippet = `// src/lib/pocketbase.ts
import PocketBase from 'pocketbase';

/**
 * CRITICAL ARCHITECTURE DECISION:
 * Initialize PocketBase without passing any URL string to the constructor!
 * 
 * const pb = new PocketBase();
 * 
 * - When served from 'pb_public', the browser's current origin is used automatically.
 * - Localhost:      http://127.0.0.1:8090 -> /api/...
 * - Pharmacy Wi-Fi: http://192.168.1.100:8090 -> /api/...
 * - Tunnel/Remote:  https://pharmacy.yourdomain.com -> /api/...
 * - ZERO hardcoded IPs, ZERO CORS headers needed!
 */
export const pb = new PocketBase();`;

  const powershellDeployScript = `# scripts/deploy-to-pocketbase.ps1
param(
  [string]$DestinationPath = "C:\\pocketbase\\pb_public"
)

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  PharmaBase -> PocketBase Automated Deploy  " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Compile production bundle
Write-Host "Building frontend with Vite..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed! Aborting." -ForegroundColor Red
  Exit 1
}

# 2. Ensure pb_public folder exists
if (-not (Test-Path -Path $DestinationPath)) {
  Write-Host "Creating $DestinationPath..." -ForegroundColor DarkGray
  New-Item -ItemType Directory -Force -Path $DestinationPath | Out-Null
}

# 3. Clean and copy static assets
Write-Host "Syncing files to $DestinationPath..." -ForegroundColor Yellow
Get-ChildItem -Path $DestinationPath -Recurse | Remove-Item -Force -Recurse
Copy-Item -Path "dist\\*" -Destination $DestinationPath -Recurse -Force

Write-Host "Successfully deployed frontend to PocketBase pb_public!" -ForegroundColor Green
Write-Host "Access locally at: http://127.0.0.1:8090" -ForegroundColor Cyan`;

  const windowsServiceNssm = `# Run PocketBase as an Unattended Windows Background Service using NSSM
# 1. Download NSSM from https://nssm.cc/download and place in C:\\pocketbase

# 2. In Administrator PowerShell:
cd C:\\pocketbase
.\\nssm.exe install PocketBasePharmacy "C:\\pocketbase\\pocketbase.exe" "serve --http=0.0.0.0:8090"

# 3. Start the service
.\\nssm.exe start PocketBasePharmacy

# PocketBase will now auto-boot with Windows and stay online 24/7 on pharmacy LAN!`;

  const schemaJsonSnippet = `[
  {
    "id": "col_medicines",
    "name": "medicines",
    "type": "base",
    "schema": [
      { "name": "name", "type": "text", "required": true },
      { "name": "generic_name", "type": "text", "required": true },
      { "name": "sku", "type": "text", "required": true },
      { "name": "barcode", "type": "text", "required": false },
      { "name": "category", "type": "select", "required": true },
      { "name": "dosage_form", "type": "select", "required": true },
      { "name": "strength", "type": "text", "required": true },
      { "name": "unit_price", "type": "number", "required": true },
      { "name": "cost_price", "type": "number", "required": true },
      { "name": "stock_quantity", "type": "number", "required": true },
      { "name": "min_threshold", "type": "number", "required": true },
      { "name": "expiry_date", "type": "date", "required": true },
      { "name": "batch_number", "type": "text", "required": true },
      { "name": "location_shelf", "type": "text", "required": false },
      { "name": "is_prescription_required", "type": "bool", "required": false }
    ],
    "listRule": "",
    "viewRule": "",
    "createRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.id != ''"
  },
  {
    "id": "col_transactions",
    "name": "transactions",
    "type": "base",
    "schema": [
      { "name": "transaction_number", "type": "text", "required": true },
      { "name": "customer_name", "type": "text", "required": true },
      { "name": "pharmacist_name", "type": "text", "required": true },
      { "name": "payment_method", "type": "select", "required": true },
      { "name": "items", "type": "json", "required": true },
      { "name": "subtotal", "type": "number", "required": true },
      { "name": "tax", "type": "number", "required": true },
      { "name": "total_amount", "type": "number", "required": true }
    ],
    "listRule": "@request.auth.id != ''",
    "viewRule": "@request.auth.id != ''",
    "createRule": ""
  }
]`;

  const downloadSchema = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(schemaJsonSnippet);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "pb_schema.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 sm:p-8 text-white border border-indigo-800/40 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                Migration Architecture Complete
              </span>
              <span className="text-emerald-400 text-xs font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 100% Offline-First Capable
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Supabase &rarr; PocketBase Migration Guide
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              Complete blueprint for running your entire pharmacy management system on a local Windows host machine using a single PocketBase binary serving both static frontend files and the local SQLite database.
            </p>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-xl border border-indigo-500/30 font-mono text-xs space-y-2 min-w-[280px]">
            <div className="text-indigo-400 font-bold flex items-center gap-1.5">
              <HardDrive className="w-4 h-4" />
              Windows PocketBase Directory
            </div>
            <div className="text-slate-300 pl-2 border-l border-slate-700 space-y-1">
              <div>C:\pocketbase\</div>
              <div className="pl-3 text-slate-400">├── pocketbase.exe</div>
              <div className="pl-3 text-slate-400">├── pb_data\ (SQLite)</div>
              <div className="pl-3 text-emerald-400 font-semibold">└── pb_public\ (Your App)</div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1: SUPABASE CLEANUP */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-sm">
            1
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Remove Supabase Configuration & Legacy Instances</h2>
            <p className="text-xs text-slate-500">Decommissioning the cloud-dependent Supabase client and imports</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Trash2 className="w-4 h-4 text-rose-500" />
              Files to Delete / Purge
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1">
              <li><code className="text-rose-700 bg-rose-50 px-1 py-0.5 rounded">src/lib/supabase.ts</code> (Legacy Supabase client)</li>
              <li><code className="text-rose-700 bg-rose-50 px-1 py-0.5 rounded">src/utils/supabaseClient.ts</code> (If present)</li>
              <li>Remove <code className="text-rose-700 bg-rose-50 px-1 py-0.5 rounded">@supabase/supabase-js</code> from package.json</li>
              <li>Remove <code className="text-rose-700 bg-rose-50 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> & <code className="text-rose-700 bg-rose-50 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> from .env</li>
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-blue-500" />
              Grep Command to Locate Lingering Supabase Calls
            </div>
            <p className="text-slate-600">Run this in your terminal to ensure no lingering Supabase references remain:</p>
            <pre className="bg-slate-900 text-slate-100 p-2.5 rounded font-mono text-[11px] overflow-x-auto">
              grep -rnE 'supabase|createClient' src/
            </pre>
          </div>
        </div>
      </div>

      {/* SECTION 2: POCKETBASE ZERO-URL ARCHITECTURE */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">
            2
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Integrate PocketBase SDK with Zero-URL Design</h2>
            <p className="text-xs text-slate-500">Why initializing PocketBase with no arguments is mandatory for offline-first pharmacy LAN setups</p>
          </div>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900 space-y-2">
          <div className="font-bold flex items-center gap-2 text-sm text-emerald-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            The Origin-Neutral Pattern: <code className="bg-emerald-100 px-1.5 py-0.5 rounded font-mono">const pb = new PocketBase();</code>
          </div>
          <p className="leading-relaxed">
            When you call <code className="font-semibold">new PocketBase()</code> without arguments, the SDK defaults the base URL to <code className="font-semibold">'/'</code> (the current browser origin). Because PocketBase serves your built static files directly out of <code className="font-semibold">pb_public</code>, the frontend and the PocketBase REST/SSE API share the <strong>identical host, protocol, and port</strong>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
            <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
              <span className="font-bold block text-slate-800">1. Local Host PC</span>
              <span className="text-slate-500">Target: http://127.0.0.1:8090</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
              <span className="font-bold block text-slate-800">2. Pharmacy LAN Wi-Fi</span>
              <span className="text-slate-500">Target: http://192.168.1.X:8090</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
              <span className="font-bold block text-slate-800">3. Remote Tunnel</span>
              <span className="text-slate-500">Target: https://rx.domain.com</span>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="flex items-center justify-between text-xs bg-slate-800 text-slate-200 px-4 py-2 rounded-t-xl font-mono">
            <span>src/lib/pocketbase.ts</span>
            <button
              onClick={() => copyToClipboard(pbInitSnippet, 'pbInit')}
              className="flex items-center gap-1 hover:text-white"
            >
              {copiedSection === 'pbInit' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSection === 'pbInit' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-b-xl text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800">
            <code>{pbInitSnippet}</code>
          </pre>
        </div>
      </div>

      {/* SECTION 3: STATIC EXPORT & BUILD CONFIGURATION */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
            3
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Static Export Configuration (Vite & Next.js)</h2>
            <p className="text-xs text-slate-500">Compiling frontend into flat static HTML, JS, and CSS files</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Vite Config */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>Vite Configuration (Active in this project)</span>
              <button
                onClick={() => copyToClipboard(viteConfigSnippet, 'viteConfig')}
                className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-[11px]"
              >
                {copiedSection === 'viteConfig' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSection === 'viteConfig' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="bg-slate-900 text-slate-100 p-3.5 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800 max-h-60">
              <code>{viteConfigSnippet}</code>
            </pre>
            <p className="text-[11px] text-slate-500">
              Vite produces pure static files in <code className="font-semibold text-slate-700">dist/</code> when running <code className="font-mono bg-slate-100 px-1 rounded">npm run build</code>.
            </p>
          </div>

          {/* Next.js Config */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>Next.js Configuration (If migrating Next.js)</span>
              <button
                onClick={() => copyToClipboard(nextConfigSnippet, 'nextConfig')}
                className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-[11px]"
              >
                {copiedSection === 'nextConfig' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSection === 'nextConfig' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="bg-slate-900 text-slate-100 p-3.5 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800 max-h-60">
              <code>{nextConfigSnippet}</code>
            </pre>
            <p className="text-[11px] text-slate-500">
              Produces static export files in <code className="font-semibold text-slate-700">out/</code> using <code className="font-mono bg-slate-100 px-1 rounded">next build</code>.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 4: AUTOMATED WINDOWS DEPLOYMENT SCRIPT */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center font-bold text-sm">
            4
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Automated Windows Deploy to C:\pocketbase\pb_public</h2>
            <p className="text-xs text-slate-500">One-command PowerShell script to build and update the pharmacy host</p>
          </div>
        </div>

        <div className="relative">
          <div className="flex items-center justify-between text-xs bg-slate-800 text-slate-200 px-4 py-2 rounded-t-xl font-mono">
            <span>scripts/deploy-to-pocketbase.ps1</span>
            <button
              onClick={() => copyToClipboard(powershellDeployScript, 'psScript')}
              className="flex items-center gap-1 hover:text-white"
            >
              {copiedSection === 'psScript' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSection === 'psScript' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-b-xl text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800 max-h-72">
            <code>{powershellDeployScript}</code>
          </pre>
        </div>

        {/* Windows Service Setup */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-indigo-600" />
              Windows 24/7 Unattended Service Setup (NSSM)
            </span>
            <button
              onClick={() => copyToClipboard(windowsServiceNssm, 'nssm')}
              className="text-xs text-indigo-600 hover:text-indigo-800"
            >
              {copiedSection === 'nssm' ? 'Copied' : 'Copy Commands'}
            </button>
          </div>
          <pre className="bg-slate-900 text-slate-200 p-3 rounded-lg text-[11px] font-mono overflow-x-auto leading-relaxed">
            <code>{windowsServiceNssm}</code>
          </pre>
        </div>
      </div>

      {/* SECTION 5: POCKETBASE COLLECTIONS SCHEMA EXPORT */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-600 flex items-center justify-center font-bold text-sm">
              5
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">PocketBase Collections Schema (JSON)</h2>
              <p className="text-xs text-slate-500">Ready to import into PocketBase Admin UI: Settings &rarr; Export/Import collections</p>
            </div>
          </div>

          <button
            onClick={downloadSchema}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Download pb_schema.json</span>
          </button>
        </div>

        <div className="relative">
          <div className="flex items-center justify-between text-xs bg-slate-800 text-slate-200 px-4 py-2 rounded-t-xl font-mono">
            <span>pocketbase/pb_schema.json</span>
            <button
              onClick={() => copyToClipboard(schemaJsonSnippet, 'schemaJson')}
              className="flex items-center gap-1 hover:text-white"
            >
              {copiedSection === 'schemaJson' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSection === 'schemaJson' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-b-xl text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800 max-h-64">
            <code>{schemaJsonSnippet}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
