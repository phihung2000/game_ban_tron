// QA offline: dùng SQL thật + WebRTC thật; mô phỏng API Auth/PostgREST/Realtime.
// Không thay thế bài test với Supabase thật. Không ghi .env hay truy cập tài khoản thật.
import { PGlite } from '@electric-sql/pglite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { runPeerTest } from './peers.mjs';

const db = new PGlite();
const api = 'http://127.0.0.1:54321';
let queue = Promise.resolve();
const qaDirectory = await mkdtemp(join(tmpdir(), 'ban-tron-qa-'));
const server = await createServer({
  configFile: false, envDir: qaDirectory, cacheDir: join(qaDirectory, 'vite-cache'), plugins: [react()],
  server: { host: '127.0.0.1', port: 5175, strictPort: true,
    watch: { ignored: ['**/.env', '**/.env.*', '**/*.zip', '**/GIAI_DOAN_*', '**/android/**', '**/ios/**'] } },
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(api),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('offline-qa-key') },
});

function tokenFor(id) {
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: id, role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600 })}.offline-signature`;
}

async function handle(route) {
  const request = route.request(), url = new URL(request.url());
  const body = request.postDataJSON() ?? {};
  let data, status = 200;
  try {
    if (url.pathname === '/auth/v1/signup') {
      const id = randomUUID();
      await db.query('insert into auth.users values($1)', [id]);
      data = { access_token: tokenFor(id), refresh_token: randomUUID(), expires_in: 3600,
        token_type: 'bearer', user: { id, aud: 'authenticated', role: 'authenticated',
          is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
    } else {
      const bearer = request.headers().authorization?.slice(7);
      const id = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()).sub;
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = url.pathname.split('/').at(-1);
        if (!['create_room', 'join_room', 'sync_room', 'commit_seats', 'commit_table', 'resume_room', 'save_checkpoint', 'kick_member', 'submit_report'].includes(name)) throw new Error('RPC không hợp lệ');
        const keys = Object.keys(body);
        if (keys.some(key => !/^p_[a-z_]+$/.test(key))) throw new Error('Tham số không hợp lệ');
        const values = keys.map(key => body[key] !== null && typeof body[key] === 'object' ? JSON.stringify(body[key]) : body[key]);
        data = (await db.query(`select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')}) as data`, values)).rows[0].data;
      } else if (url.pathname === '/rest/v1/profiles') {
        if (request.method() === 'POST') {
          await db.query('insert into public.profiles values($1,$2) on conflict(id) do update set display_name=excluded.display_name', [body.id, body.display_name]); data = null;
        } else data = (await db.query('select display_name from public.profiles where id=$1', [id])).rows;
      } else if (url.pathname === '/rest/v1/rooms') {
        data = (await db.query('select id,name,is_private,max_players,host_peer_id from public.rooms where not is_private and host_peer_id is not null')).rows;
      } else if (url.pathname === '/rest/v1/signals') {
        if (request.method() === 'POST') {
          await db.query('insert into public.signals(room_id,from_peer,to_peer,payload) values($1,$2,$3,$4)',
            [body.room_id, body.from_peer, body.to_peer, JSON.stringify(body.payload)]);
          data = null; status = 201;
        } else if (request.method() === 'DELETE') {
          await db.query('delete from public.signals where id=$1', [url.searchParams.get('id').slice(3)]);
          data = null;
        } else {
          data = (await db.query('select * from public.signals where room_id=$1 and to_peer=$2 order by created_at',
            [url.searchParams.get('room_id').slice(3), url.searchParams.get('to_peer').slice(3)])).rows;
        }
      } else throw new Error(`API chưa mô phỏng: ${url.pathname}`);
    }
  } catch (error) { status = 400; data = { message: error.message, code: 'QA_ERROR' }; }
  finally { await db.exec('reset role'); }
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
}

try {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create publication supabase_realtime;
  `);
  await db.exec(await readFile(new URL('../supabase/phase2.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/phase4.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/phase7.sql', import.meta.url), 'utf8'));
  await server.listen(); process.env.APP_URL = 'http://127.0.0.1:5175';
  console.log('QA OFFLINE: API mô phỏng, PostgreSQL và WebRTC thật.');
  await runPeerTest(async context => {
    await context.route(`${api}/**`, route => {
      // Một connection PostgreSQL nhúng cần tuần tự hóa SET ROLE giữa các request.
      const pending = queue.then(() => handle(route));
      queue = pending.catch(() => {}); return pending;
    });
    await context.routeWebSocket('**/realtime/v1/**', ws => {
      ws.onMessage(raw => {
        const decoded = JSON.parse(String(raw));
        const packet = Array.isArray(decoded) ? { join_ref: decoded[0], ref: decoded[1],
          topic: decoded[2], event: decoded[3], payload: decoded[4] } : decoded;
        if (['phx_join', 'heartbeat', 'phx_leave'].includes(packet.event)) {
          const changes = packet.payload?.config?.postgres_changes ?? [];
          const reply = { topic: packet.topic, event: 'phx_reply', ref: packet.ref,
            join_ref: packet.join_ref, payload: { status: 'ok', response: {
              postgres_changes: changes.map((filter, i) => ({ ...filter, id: i + 1 })),
            } } };
          ws.send(JSON.stringify(Array.isArray(decoded) ? [reply.join_ref, reply.ref, reply.topic,
            reply.event, reply.payload] : reply));
        }
      });
    });
  });
} finally { await server.close(); await db.close(); await rm(qaDirectory, { recursive: true, force: true }); }
