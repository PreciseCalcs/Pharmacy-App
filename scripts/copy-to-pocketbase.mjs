#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Default target: C:\pocketbase\pb_public on Windows or customizable via env/arg
const defaultPbPublic = process.platform === 'win32'
  ? 'C:\\pocketbase\\pb_public'
  : path.resolve(projectRoot, 'pocketbase', 'pb_public');

const targetDir = process.argv[2] || process.env.POCKETBASE_PUBLIC_DIR || defaultPbPublic;
const sourceDir = path.resolve(projectRoot, 'dist');

console.log('----------------------------------------------------');
console.log('🚀 PocketBase Static Frontend Deployer');
console.log('----------------------------------------------------');
console.log(`Source (Vite build output): ${sourceDir}`);
console.log(`Destination (PocketBase):   ${targetDir}`);
console.log('----------------------------------------------------\n');

if (!fs.existsSync(sourceDir)) {
  console.error(`❌ Build folder '${sourceDir}' does not exist!`);
  console.error('Please run "npm run build" first to generate the static files.');
  process.exit(1);
}

try {
  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    console.log(`📁 Creating directory: ${targetDir}`);
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Clear existing files in targetDir to prevent stale chunks
  console.log('🧹 Cleaning old static files in pb_public...');
  const existingFiles = fs.readdirSync(targetDir);
  for (const file of existingFiles) {
    const filePath = path.join(targetDir, file);
    fs.rmSync(filePath, { recursive: true, force: true });
  }

  // Copy dist folder contents into targetDir
  console.log('📦 Copying compiled static assets...');
  copyFolderRecursive(sourceDir, targetDir);

  console.log('\n✅ Successfully deployed frontend to PocketBase pb_public!');
  console.log(`✨ PocketBase will now serve your pharmacy app at:`);
  console.log(`   - Local:    http://127.0.0.1:8090/`);
  console.log(`   - LAN WiFi: http://<your-local-ip>:8090/`);
  console.log(`   - Admin UI: http://127.0.0.1:8090/_/`);
  console.log('----------------------------------------------------');
} catch (error) {
  console.error('❌ Failed to copy build files:', error);
  process.exit(1);
}

function copyFolderRecursive(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyFolderRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
