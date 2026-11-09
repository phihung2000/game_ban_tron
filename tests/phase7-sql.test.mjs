import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Giai đoạn 7: RLS reports, quota thật, kick, checkpoint, phục hồi riêng tư và fencing host', async () => {
  const db = new PGlite();
  const users = [1, 2, 3].map(n => `20000000-0000-4000-8000-00000000000${n}`);
  const peers = [1, 2, 3].map(n => `30000000-0000-4000-8000-00000000000${n}`);
  async function asUser(i, sql, params = []) {
    await db.exec('set role authenticated');
    try { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[i]]); return await db.query(sql, params); }
    finally { await db.exec('reset role'); }
  }
  async function call(i, name, values) {
    const result = (await asUser(i, `select public.${name}(${values.map((_, j) => `$${j + 1}`).join(',')}) as data`, values)).rows[0].data;
    if (result?._error) throw Object.assign(new Error(result._error.message), { code: result._error.code });
    return result;
  }
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated; create publication supabase_realtime;`);
    for (const stage of [2, 4, 7]) await db.exec(await readFile(new URL(`../supabase/phase${stage}.sql`, import.meta.url), 'utf8'));
    for (let i = 0; i < 3; i++) {
      await db.query('insert into auth.users values($1)', [users[i]]);
      await asUser(i, 'insert into public.profiles(id,display_name) values($1,$2)', [users[i], `User ${i}`]);
    }
    await assert.rejects(asUser(0, "update public.profiles set rate_state='{}'"), /permission denied/);
    await assert.rejects(asUser(0, 'select recovery_keys from public.rooms'), /permission denied/);
    const made = await call(0, 'create_room', ['Private', true, 12, peers[0]]), room = made.room.id;
    assert.match(made.recovery_token, /^[a-f0-9]{32}$/); assert.equal(made.room.recovery_keys, undefined);
    const joined = await call(1, 'join_room', [peers[1], null, made.invite_code]);
    await call(2, 'join_room', [peers[2], null, made.invite_code]);
    await assert.rejects(call(1, 'join_room', [crypto.randomUUID(), room, null]), /mã mời/);
    await assert.rejects(call(2, 'resume_room', [room, peers[1], joined.recovery_token]), /không hợp lệ/);
    await assert.rejects(call(1, 'resume_room', [room, peers[1], 'wrong']), /không hợp lệ/);
    const report = await call(1, 'submit_report', [room, peers[1], peers[2], 'spam', 'Spam nhiều lần']);
    assert.ok(report.id); assert.equal((await asUser(1, 'select * from public.reports')).rows.length, 1);
    assert.equal((await asUser(2, 'select * from public.reports')).rows.length, 0);
    assert.equal((await asUser(0, 'select * from public.reports')).rows.length, 0);
    await assert.rejects(asUser(1, 'insert into public.reports(room_id) values($1)', [room]), /permission denied/);
    await assert.rejects(call(1, 'kick_member', [room, peers[1], 1, peers[2]]), /host/);
    const pose = { x: 4, z: 6, yaw: 1, animation: 'idle' };
    const checkpoint = await call(0, 'save_checkpoint', [room, peers[0], 1, JSON.stringify({ [peers[1]]: pose })]);
    assert.deepEqual(checkpoint.checkpoint.poses[peers[1]], pose);
    assert.equal(checkpoint.checkpoint.snapshot.revision, checkpoint.snapshot.revision);
    await assert.rejects(call(1, 'save_checkpoint', [room, peers[1], 1, '{}']), /Host/);
    await assert.rejects(call(0, 'save_checkpoint', [room, peers[0], 1, JSON.stringify({ [peers[1]]: { ...pose, x: 100 } })]), /không hợp lệ/);
    const kicked = await call(0, 'kick_member', [room, peers[0], 1, peers[2]]);
    assert.equal(kicked.members[peers[2]], undefined);
    await assert.rejects(call(2, 'join_room', [crypto.randomUUID(), null, made.invite_code]), /mời khỏi/);
    await assert.rejects(call(2, 'sync_room', [room, peers[2], false]), /mời khỏi/);
    await db.query("update public.rooms set members=jsonb_set(members,array[$2,'expires_at'],to_jsonb(extract(epoch from clock_timestamp())-1)) where id=$1", [room, peers[0]]);
    const promoted = await call(1, 'sync_room', [room, peers[1], false]);
    assert.equal(promoted.host_peer_id, peers[1]); assert.equal(promoted.host_epoch, 2);
    assert.deepEqual(promoted.checkpoint.poses[peers[1]], pose);
    await assert.rejects(call(0, 'save_checkpoint', [room, peers[0], 1, '{}']), /Host/);
    const resumed = await call(0, 'resume_room', [room, peers[0], made.recovery_token]);
    assert.equal(resumed.room.host_peer_id, peers[1]);
    assert.ok(resumed.room.members[peers[0]].join_order > resumed.room.members[peers[1]].join_order);
    // Chạy lại migration giữ báo cáo và checkpoint, không bọc lại hàm thành vòng đệ quy.
    await db.exec(await readFile(new URL('../supabase/phase7.sql', import.meta.url), 'utf8'));
    assert.equal((await db.query('select count(*)::integer as n from public.reports')).rows[0].n, 1);
    await call(0, 'sync_room', [room, peers[0], true]);
    await assert.rejects(call(0, 'resume_room', [room, peers[0], made.recovery_token]), /không hợp lệ/);
    // Thử mã sai vẫn tiêu quota. Không thể xóa bộ đếm bằng client.
    for (let i = 0; i < 15; i++) await assert.rejects(call(2, 'join_room', [crypto.randomUUID(), null, 'bad-code']));
    const quota = (await db.query("select rate_state->'join' as quota from public.profiles where id=$1", [users[2]])).rows[0].quota;
    assert.ok(quota.tokens < 1);
    await assert.rejects(call(2, 'join_room', [crypto.randomUUID(), null, 'bad-code']), /quá nhanh/);
  } finally { await db.close(); }
});
