import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadEnv } from 'vite';

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const url = new URL(env.VITE_SUPABASE_URL || 'https://invalid.example');
assert.ok(url.protocol === 'https:' && url.hostname !== 'invalid.example', 'Cần URL Supabase HTTPS hợp lệ.');
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
let publicKey = key.startsWith('sb_publishable_');
if (key.split('.').length === 3) {
  try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { /* Khóa không hợp lệ. */ }
}
assert.ok(publicKey, 'Chỉ dùng publishable key hoặc JWT anon; không đưa service_role/secret key vào web/app.');
const capacitor = await readFile('capacitor.config.ts', 'utf8');
assert.ok(!/server\s*:\s*\{[^}]*\burl\s*:/s.test(capacitor), 'Bản native phải đóng gói dist, không dùng live-reload server.url.');
const manifest = await readFile('android/app/src/main/AndroidManifest.xml', 'utf8');
assert.ok(manifest.includes('android.permission.RECORD_AUDIO'));
assert.ok(manifest.includes('android:usesCleartextTraffic="false"'));
const plist = await readFile('ios/App/App/Info.plist', 'utf8');
assert.match(plist, /NSMicrophoneUsageDescription/);
assert.ok(!plist.includes('NSAllowsArbitraryLoads'));
console.log('PASS: cấu hình public Supabase, bundle native, quyền mic và HTTPS. Không in khóa.');
