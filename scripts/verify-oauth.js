/**
 * Google OAuth Redirect URI Verification
 *
 * Reads the frontend .env and backend Google auth config to verify
 * the registered redirect URIs match what the app uses.
 *
 * Run: node scripts/verify-oauth.js
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

function loadEnv(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return {};
  const env = {};
  fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([\w._-]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2];
  });
  return env;
}

const frontendEnv = loadEnv('frontend/.env');
const backendEnv = loadEnv('backend/.env');

const clientId = frontendEnv.VITE_GOOGLE_CLIENT_ID || backendEnv.GOOGLE_CLIENT_ID;
const apiUrl = frontendEnv.VITE_API_URL || 'http://localhost:5000/api';
const frontendUrl = backendEnv.FRONTEND_URL || 'http://localhost:5173';

console.log('\n=== Google OAuth Redirect URI Verification ===\n');
console.log(`Google Client ID:     ${clientId || 'NOT SET'}`);
console.log(`Frontend URL:         ${frontendUrl}`);
console.log(`Backend API URL:      ${apiUrl}`);

const backendOrigin = apiUrl.replace(/\/api.*$/, '');
const backendRedirectUri = `${backendOrigin}/auth/google/callback`;

console.log(`\nURIs to register in Google Cloud Console:`);
console.log(`  Authorized JavaScript origins:`);
console.log(`    • ${frontendUrl.replace(/\/+$/, '')}`);
console.log(`    • ${backendOrigin.replace(/\/+$/, '')}`);
console.log(`  Authorized redirect URIs:`);
console.log(`    • ${backendRedirectUri}`);

console.log(`\n⚠️  These must match exactly in https://console.cloud.google.com`);
console.log(`   → APIs & Services → Credentials → OAuth 2.0 Client IDs\n`);
