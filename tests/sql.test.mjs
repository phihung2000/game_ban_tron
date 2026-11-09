import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('SQL thật: RLS, mã phòng riêng, sức chứa, CAS snapshot và chuyển host', async () => {
  const db = new PGlite();
  const users = [1, 2, 3].map(n => `00000000-0000-4000-8000-00000000000${n}`);
  const peers = [1, 2, 3].map(n => `10000000-0000-4000-8000-00000000000${n}`);
  async function user(index, sql, params = []) {
    await db.exec('set role authenticated');
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[index]]);
      return await db.query(sql, params);
    } finally { await db.exec('reset role'); }
  }
  try {
    // Mô phỏng phần auth/role có sẵn trên Supabase. Toàn bộ phase2.sql chạy nguyên bản.
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      create publication supabase_realtime;
    `);
    await db.exec(await readFile(new URL('../supabase/phase2.sql', import.meta.url), 'utf8'));
    const migration = await readFile(new URL('../supabase/phase4.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    for (let i = 0; i < 3; i++) {
      await db.query('insert into auth.users values($1)', [users[i]]);
      await user(i, 'insert into public.profiles values($1,$2)', [users[i], `User ${i}`]);
    }
    const made = (await user(0, 'select public.create_room($1,true,2,$2) as data', ['Private', peers[0]])).rows[0].data;
    const room = made.room.id;
    assert.equal(made.room.host_peer_id, peers[0]);
    assert.equal((await user(1, 'select id from public.rooms')).rows.length, 0);
    await assert.rejects(user(1, 'select public.join_room($1,$2,null)', [peers[1], room]), /mã mời/);
    await assert.rejects(user(1, 'select public.join_room($1,null,$2)', [peers[1], 'wrong']), /không hợp lệ/);
    await user(1, 'select public.join_room($1,null,$2)', [peers[1], made.invite_code]);
    await assert.rejects(user(2, 'select public.join_room($1,null,$2)', [peers[2], made.invite_code]), /đầy/);
    await assert.rejects(user(1, "update public.rooms set name='hacked' where id=$1", [room]), /permission denied/);
    await assert.rejects(user(1, 'select invite_hash from public.rooms'), /permission denied/);
    assert.equal((await user(1, 'select * from public.profiles where id=$1', [users[0]])).rows.length, 0);
    assert.equal((await user(1, "update public.profiles set display_name='hacked' where id=$1 returning id", [users[0]])).rows.length, 0);
    const payload = JSON.stringify({ kind: 'offer', session: 'test', description: { type: 'offer', sdp: 'test' } });
    await assert.rejects(user(1, 'insert into public.signals(room_id,from_peer,to_peer,payload) values($1,$2,$3,$4)',
      [room, peers[0], peers[1], payload]), /row-level security/);
    await user(0, 'insert into public.signals(room_id,from_peer,to_peer,payload) values($1,$2,$3,$4)', [room, peers[0], peers[1], payload]);
    assert.equal((await user(1, 'select * from public.signals')).rows.length, 1);
    assert.equal((await user(2, 'select * from public.signals')).rows.length, 0);
    const seats = [peers[1], null, null, null, null, null, null, null];
    await assert.rejects(user(1, 'select public.commit_seats($1,$2,1,0,$3)', [room, peers[1], JSON.stringify(seats)]), /Host/);
    await user(0, 'select public.commit_seats($1,$2,1,0,$3)', [room, peers[0], JSON.stringify(seats)]);
    await assert.rejects(user(0, 'select public.commit_seats($1,$2,1,0,$3)', [room, peers[0], JSON.stringify(seats)]), /Snapshot/);
    await assert.rejects(user(0, 'select public.commit_seats($1,$2,1,1,$3)', [room, peers[0], JSON.stringify([peers[1], peers[1], null, null, null, null, null, null])]), /một ghế/);
    const table = (await db.query('select snapshot from public.rooms where id=$1', [room])).rows[0].snapshot.table;
    table.plate.cake = 11; table.hands[0] = 'cake';
    table.cups[0] = { fromMl: 150, toMl: 150, startedAt: 0, durationMs: 0, heatC: 90, heatedAt: 1000 };
    table.lastRequests[peers[1]] = { seq: 1, id: 'request-1', message: 'Đã lấy bánh' };
    await assert.rejects(user(1, 'select public.commit_table($1,$2,1,1,$3)', [room, peers[1], JSON.stringify(table)]), /Host/);
    await user(0, 'select public.commit_table($1,$2,1,1,$3)', [room, peers[0], JSON.stringify(table)]);
    await assert.rejects(user(0, 'select public.commit_table($1,$2,1,1,$3)', [room, peers[0], JSON.stringify(table)]), /Snapshot/);
    const invalid = structuredClone(table); invalid.cups[0].toMl = 500;
    await assert.rejects(user(0, 'select public.commit_table($1,$2,1,2,$3)', [room, peers[0], JSON.stringify(invalid)]), /không hợp lệ/);
    invalid.cups[0].toMl = 150; invalid.plate.cake = -1;
    await assert.rejects(user(0, 'select public.commit_table($1,$2,1,2,$3)', [room, peers[0], JSON.stringify(invalid)]), /không hợp lệ/);
    await db.exec(migration); // Chạy lại migration không làm đầy ấm/đĩa hay mất dữ liệu.
    assert.equal((await db.query('select snapshot from public.rooms where id=$1', [room])).rows[0].snapshot.table.plate.cake, 11);
    // Cho host hết lease bằng đồng hồ DB; peer thứ hai phải giữ ghế và nhận quyền host.
    await db.query("update public.rooms set members=jsonb_set(members,array[$2,'expires_at'],to_jsonb(extract(epoch from now())-1)) where id=$1", [room, peers[0]]);
    const promoted = (await user(1, 'select public.sync_room($1,$2) as data', [room, peers[1]])).rows[0].data;
    assert.equal(promoted.host_peer_id, peers[1]);
    assert.equal(promoted.host_epoch, 2);
    assert.equal(promoted.snapshot.seats[0], peers[1]);
    assert.equal(promoted.snapshot.table.plate.cake, 11);
    assert.equal(promoted.snapshot.table.cups[0].toMl, 150);
    assert.equal(promoted.snapshot.table.hands[0], 'cake');
    assert.equal(promoted.snapshot.table.lastRequests[peers[1]].seq, 1);
    await assert.rejects(user(0, 'select public.commit_seats($1,$2,1,1,$3)', [room, peers[0], JSON.stringify(seats)]), /Host/);
    await assert.rejects(user(0, 'select public.sync_room($1,$2)', [room, peers[0]]), /hết hạn/);
    await user(1, 'select public.sync_room($1,$2,true)', [room, peers[1]]);
    const empty = (await db.query('select host_peer_id,snapshot from public.rooms where id=$1', [room])).rows[0];
    assert.equal(empty.host_peer_id, null);
    assert.ok(empty.snapshot.seats.every(owner => owner === null));
    assert.equal(empty.snapshot.table.cups[0].toMl, 0);
    assert.equal(empty.snapshot.table.hands[0], null);
    assert.equal(empty.snapshot.table.plate.cake, 11);
  } finally { await db.close(); }
});
