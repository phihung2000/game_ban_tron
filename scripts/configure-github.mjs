// Chỉ đưa hai giá trị public của frontend lên repository variables, không ghi .env/token GitHub.
import { loadEnv } from 'vite';
import { spawnSync } from 'node:child_process';
await import('./check-release.mjs');
const repo = process.argv[2] || 'phihung2000/game_ban_tron';
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Repository không hợp lệ');
const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) {
  const result = spawnSync('gh', ['variable', 'set', name, '--repo', repo], { input: env[name], encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Không lưu được repository variable ${name}; kiểm tra gh auth status.`);
  console.log(`Đã cấu hình ${name}; không in giá trị.`);
}
if (process.argv.includes('--pages')) {
  const existing = spawnSync('gh', ['api', `repos/${repo}/pages`], { encoding: 'utf8' });
  if (existing.status !== 0) {
    const made = spawnSync('gh', ['api', `repos/${repo}/pages`, '--method', 'POST', '--input', '-'],
      { input: JSON.stringify({ build_type: 'workflow' }), encoding: 'utf8' });
    if (made.status !== 0) throw new Error('Không bật được GitHub Pages; kiểm tra Settings → Pages → GitHub Actions.');
  } else if (JSON.parse(existing.stdout).build_type !== 'workflow') {
    const changed = spawnSync('gh', ['api', `repos/${repo}/pages`, '--method', 'PUT', '--input', '-'],
      { input: JSON.stringify({ build_type: 'workflow' }), encoding: 'utf8' });
    if (changed.status !== 0) throw new Error('Không chuyển được Pages sang GitHub Actions.');
  }
  console.log(`Pages đã dùng GitHub Actions: https://${repo.split('/')[0]}.github.io/${repo.split('/')[1]}/`);
}
