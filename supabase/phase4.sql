-- Chạy sau phase2.sql. Có thể chạy lại; không xóa phòng/hồ sơ/ghế hiện có.
begin;
create or replace function app_private.new_table(p_seats jsonb)
returns jsonb language sql volatile set search_path = '' as $$
  select jsonb_build_object('version',1,'owners',p_seats,
    'pot',jsonb_build_object('ml',2400,'heatC',90,'heatedAt',extract(epoch from clock_timestamp())*1000,'busyUntil',0),
    'plate',jsonb_build_object('cake',12,'candy',16),
    'cups',(select jsonb_agg(jsonb_build_object('fromMl',0,'toMl',0,'startedAt',0,'durationMs',0,'heatC',22,'heatedAt',0)) from generate_series(1,8)),
    'hands','[null,null,null,null,null,null,null,null]'::jsonb,'actions','{}'::jsonb,'lastRequests','{}'::jsonb);
$$;

-- Người đổi/rời ghế: dọn ly và đồ cầm của người cũ, giữ nguyên ấm và đĩa.
create or replace function app_private.reseat_snapshot(p_snapshot jsonb,p_seats jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare t jsonb; i integer;
begin
  t := coalesce(p_snapshot->'table',app_private.new_table(p_seats));
  for i in 0..7 loop
    if t->'owners'->i is distinct from p_seats->i then
      t := jsonb_set(t,array['cups',i::text],
        '{"fromMl":0,"toMl":0,"startedAt":0,"durationMs":0,"heatC":22,"heatedAt":0}'::jsonb);
      t := jsonb_set(t,array['hands',i::text],'null'::jsonb);
    end if;
  end loop;
  t := jsonb_set(t,'{owners}',p_seats);
  t := jsonb_set(t,'{actions}',coalesce((select jsonb_object_agg(key,value)
    from jsonb_each(t->'actions') where p_seats @> jsonb_build_array(key)),'{}'::jsonb));
  return jsonb_set(p_snapshot,'{table}',t);
end $$;

alter table public.rooms alter column snapshot set default
  jsonb_build_object('revision',0,'seats','[null,null,null,null,null,null,null,null]'::jsonb,
    'table',app_private.new_table('[null,null,null,null,null,null,null,null]'::jsonb));
update public.rooms set snapshot=app_private.reseat_snapshot(snapshot,snapshot->'seats') where not (snapshot ? 'table');

create or replace function app_private.normalize_room(p_id uuid)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare r public.rooms; live jsonb; chosen uuid; seats jsonb; item jsonb; i integer;
begin
  select * into r from public.rooms where id = p_id for update;
  if not found then raise exception 'Phòng không tồn tại'; end if;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into live
    from jsonb_each(r.members)
    where (value->>'expires_at')::double precision > extract(epoch from clock_timestamp());
  select key::uuid into chosen from jsonb_each(live)
    order by (value->>'join_order')::bigint, key limit 1;
  seats := r.snapshot->'seats';
  for i in 0..7 loop
    item := seats->i;
    if item <> 'null'::jsonb and not (live ? (item #>> '{}')) then
      seats := jsonb_set(seats, array[i::text], 'null');
    end if;
  end loop;
  if seats <> r.snapshot->'seats' then
    r.snapshot := r.snapshot || jsonb_build_object('revision',(r.snapshot->>'revision')::integer+1,'seats',seats);
  end if;
  r.snapshot := app_private.reseat_snapshot(r.snapshot,r.snapshot->'seats');
  r.snapshot := jsonb_set(r.snapshot,'{table,lastRequests}',
    coalesce((select jsonb_object_agg(key,value) from jsonb_each(r.snapshot->'table'->'lastRequests') where live ? key),'{}'::jsonb));
  if chosen is distinct from r.host_peer_id then r.host_epoch := r.host_epoch + 1; end if;
  update public.rooms set members=live, host_peer_id=chosen, host_epoch=r.host_epoch,
    snapshot=r.snapshot where id=p_id returning * into r;
  return r;
end $$;

create or replace function public.commit_seats(p_room uuid,p_peer uuid,p_epoch integer,p_revision integer,p_seats jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.rooms; occupied integer; distinct_occupied integer;
begin
  r := app_private.normalize_room(p_room);
  if not app_private.owns_peer(p_room,p_peer) or r.host_peer_id <> p_peer or r.host_epoch <> p_epoch then
    raise exception 'Host đã thay đổi';
  end if;
  if (r.snapshot->>'revision')::integer <> p_revision then raise exception 'Snapshot đã thay đổi'; end if;
  if jsonb_typeof(p_seats) <> 'array' or jsonb_array_length(p_seats) <> 8 then raise exception 'Sai số ghế'; end if;
  if exists(select 1 from jsonb_array_elements(p_seats) v
    where v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string' or not (r.members ? (v #>> '{}')))) then
    raise exception 'Ghế chứa peer không hợp lệ';
  end if;
  select count(*),count(distinct v) into occupied,distinct_occupied
    from jsonb_array_elements(p_seats) v where v <> 'null'::jsonb;
  if occupied <> distinct_occupied then raise exception 'Một người chỉ được một ghế'; end if;
  update public.rooms set snapshot=app_private.reseat_snapshot(r.snapshot || jsonb_build_object('revision',p_revision+1,'seats',p_seats),p_seats)
    where id=p_room returning * into r;
  return app_private.room_view(r);
end $$;

create or replace function app_private.room_view(r public.rooms)
returns jsonb language sql volatile set search_path = '' as $$
  select jsonb_build_object('id',r.id,'name',r.name,'is_private',r.is_private,
    'max_players',r.max_players,'host_peer_id',r.host_peer_id,'host_epoch',r.host_epoch,
    'members',r.members,'snapshot',r.snapshot,'server_time',extract(epoch from clock_timestamp())*1000);
$$;

-- Kiểm tra snapshot trước khi lưu. Chỉ host có quyền gọi commit_table.
create or replace function app_private.valid_table(t jsonb,p_seats jsonb,p_members jsonb)
returns boolean language plpgsql set search_path = '' as $$
declare c jsonb; entry record; field text; amount numeric;
begin
  if t is null or jsonb_typeof(t) <> 'object' or octet_length(t::text)>65536
    or not (t ?& array['version','owners','pot','plate','cups','hands','actions','lastRequests'])
    or t->>'version' <> '1' or t->'owners' <> p_seats
    or jsonb_typeof(t->'cups') <> 'array' or jsonb_array_length(t->'cups') <> 8
    or jsonb_typeof(t->'hands') <> 'array' or jsonb_array_length(t->'hands') <> 8
    or jsonb_typeof(t->'actions') <> 'object' or jsonb_typeof(t->'lastRequests') <> 'object'
    or jsonb_typeof(t->'pot') <> 'object' or jsonb_typeof(t->'plate') <> 'object' then return false; end if;
  if not (t->'pot' ?& array['ml','heatC','heatedAt','busyUntil'])
    or not (t->'plate' ?& array['cake','candy']) then return false; end if;
  foreach field in array array['ml','heatC','heatedAt','busyUntil'] loop
    amount := (t->'pot'->>field)::numeric;
    if amount is null or amount<0 or amount>1e15 or amount='NaN'::numeric then return false; end if;
  end loop;
  if (t->'pot'->>'ml')::numeric>2400 or (t->'pot'->>'heatC')::numeric>95 then return false; end if;
  foreach field in array array['cake','candy'] loop
    amount := (t->'plate'->>field)::numeric;
    if amount is null or amount<0 or amount>(case when field='cake' then 12 else 16 end)
      or amount<>trunc(amount) then return false; end if;
  end loop;
  for c in select value from jsonb_array_elements(t->'cups') loop
    if not (c ?& array['fromMl','toMl','startedAt','durationMs','heatC','heatedAt']) then return false; end if;
    foreach field in array array['fromMl','toMl','startedAt','durationMs','heatC','heatedAt'] loop
      amount := (c->>field)::numeric;
      if amount is null or amount<0 or amount>1e15 or amount='NaN'::numeric then return false; end if;
    end loop;
    if (c->>'fromMl')::numeric>200 or (c->>'toMl')::numeric>200
      or (c->>'durationMs')::numeric>5000 or (c->>'heatC')::numeric>95 then return false; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(t->'hands') v where v not in ('null'::jsonb,'"cake"'::jsonb,'"candy"'::jsonb)) then return false; end if;
  if (select count(*) from jsonb_each(t->'actions'))>30 or (select count(*) from jsonb_each(t->'lastRequests'))>30 then return false; end if;
  for entry in select * from jsonb_each(t->'actions') loop
    c := entry.value;
    if not (p_members ? entry.key) or not (c ?& array['id','peer','kind','seat','targetSeat','startedAt','durationMs','snack'])
      or c->>'id' is null or c->>'peer' is null or c->>'kind' is null
      or c->>'seat' is null or c->>'targetSeat' is null or c->>'startedAt' is null or c->>'durationMs' is null
      or c->>'peer' <> entry.key or length(c->>'id')>64
      or c->>'kind' not in ('pour','offer','drink','dump','take-cake','take-candy','eat','throw')
      or (c->>'seat')::integer not between 0 and 7 or (c->>'targetSeat')::integer not between 0 and 7
      or p_seats->>((c->>'seat')::integer) is distinct from entry.key
      or (c->>'startedAt')::numeric not between 0 and 1e15
      or (c->>'durationMs')::numeric not between 1 and 5000
      or c->'snack' not in ('null'::jsonb,'"cake"'::jsonb,'"candy"'::jsonb) then return false; end if;
  end loop;
  for entry in select * from jsonb_each(t->'lastRequests') loop
    c := entry.value;
    if not (p_members ? entry.key) or not (c ?& array['seq','id','message'])
      or c->>'seq' is null or c->>'id' is null or c->>'message' is null
      or (c->>'seq')::bigint not between 1 and 1000000000000
      or length(c->>'id')>64 or length(c->>'message')>200 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;

create or replace function public.commit_table(p_room uuid,p_peer uuid,p_epoch integer,p_revision integer,p_table jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  r := app_private.normalize_room(p_room);
  if not app_private.owns_peer(p_room,p_peer) or r.host_peer_id<>p_peer or r.host_epoch<>p_epoch then
    raise exception 'Host đã thay đổi'; end if;
  if (r.snapshot->>'revision')::integer<>p_revision then raise exception 'Snapshot đã thay đổi; hãy thử lại'; end if;
  if not app_private.valid_table(p_table,r.snapshot->'seats',r.members) then raise exception 'Trạng thái bàn không hợp lệ'; end if;
  update public.rooms set snapshot=r.snapshot || jsonb_build_object('revision',p_revision+1,'table',p_table)
    where id=p_room returning * into r;
  return app_private.room_view(r);
end $$;
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.commit_table(uuid,uuid,integer,integer,jsonb) from public,anon;
grant execute on function public.commit_table(uuid,uuid,integer,integer,jsonb) to authenticated;
commit;
