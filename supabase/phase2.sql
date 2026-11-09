-- Chạy một lần trong SQL Editor của một dự án Supabase mới.
begin;
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 32)
);
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  is_private boolean not null,
  max_players integer not null check (max_players between 2 and 30),
  invite_hash text not null unique,
  host_peer_id uuid,
  host_epoch integer not null default 0,
  next_order bigint not null default 1,
  members jsonb not null default '{}',
  snapshot jsonb not null default '{"revision":0,"seats":[null,null,null,null,null,null,null,null]}',
  created_at timestamptz not null default now()
);
create table public.signals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  from_peer uuid not null,
  to_peer uuid not null,
  payload jsonb not null check (
    payload ? 'kind' and payload->>'kind' in ('offer','answer','candidate')
    and jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) <= 65536
  ),
  created_at timestamptz not null default now(),
  check (from_peer <> to_peer)
);
create index signals_inbox on public.signals(to_peer, created_at);
create index signals_room on public.signals(room_id);

-- Khóa hàng rooms là trọng tài duy nhất cho thành viên, sức chứa và nhiệm kỳ host.
create function app_private.normalize_room(p_id uuid)
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
    r.snapshot := jsonb_build_object('revision',(r.snapshot->>'revision')::integer+1,'seats',seats);
  end if;
  if chosen is distinct from r.host_peer_id then r.host_epoch := r.host_epoch + 1; end if;
  update public.rooms set members=live, host_peer_id=chosen, host_epoch=r.host_epoch,
    snapshot=r.snapshot where id=p_id returning * into r;
  return r;
end $$;

create function app_private.room_view(r public.rooms)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',r.id,'name',r.name,'is_private',r.is_private,
    'max_players',r.max_players,'host_peer_id',r.host_peer_id,'host_epoch',r.host_epoch,
    'members',r.members,'snapshot',r.snapshot);
$$;

create function app_private.owns_peer(p_room uuid,p_peer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.rooms r where r.id=p_room
    and r.members->p_peer::text->>'user_id'=auth.uid()::text
    and (r.members->p_peer::text->>'expires_at')::double precision > extract(epoch from now()));
$$;

create function public.create_room(p_name text,p_private boolean,p_max integer,p_peer uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.rooms; code text; label text;
begin
  if auth.uid() is null then raise exception 'Cần đăng nhập'; end if;
  select display_name into label from public.profiles where id=auth.uid();
  if label is null then raise exception 'Cần lưu hồ sơ trước'; end if;
  code := replace(gen_random_uuid()::text,'-','');
  insert into public.rooms(name,is_private,max_players,invite_hash,host_peer_id,host_epoch,next_order,members)
    values(btrim(p_name),p_private,p_max,md5(code),p_peer,1,2,
      jsonb_build_object(p_peer::text,jsonb_build_object('user_id',auth.uid(),'display_name',label,
        'join_order',1,'expires_at',extract(epoch from clock_timestamp())+20))) returning * into r;
  return jsonb_build_object('room',app_private.room_view(r),'invite_code',code);
end $$;

create function public.join_room(p_peer uuid,p_room uuid default null,p_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.rooms; target uuid; label text;
begin
  if auth.uid() is null then raise exception 'Cần đăng nhập'; end if;
  select display_name into label from public.profiles where id=auth.uid();
  if label is null then raise exception 'Cần lưu hồ sơ trước'; end if;
  if p_code is not null then
    select id into target from public.rooms where invite_hash=md5(lower(btrim(p_code)));
  else target := p_room;
  end if;
  if target is null then raise exception 'Mã mời không hợp lệ'; end if;
  r := app_private.normalize_room(target);
  if r.is_private and (p_code is null or r.invite_hash <> md5(lower(btrim(p_code)))) then
    raise exception 'Phòng riêng cần mã mời';
  end if;
  if r.members ? p_peer::text then raise exception 'Peer đã tồn tại'; end if;
  if (select count(*) from jsonb_each(r.members)) >= r.max_players then raise exception 'Phòng đã đầy'; end if;
  r.members := r.members || jsonb_build_object(p_peer::text,
    jsonb_build_object('user_id',auth.uid(),'display_name',label,'join_order',r.next_order,
      'expires_at',extract(epoch from clock_timestamp())+20));
  update public.rooms set members=r.members,next_order=next_order+1 where id=target;
  r := app_private.normalize_room(target);
  return jsonb_build_object('room',app_private.room_view(r),'invite_code',p_code);
end $$;

create function public.sync_room(p_room uuid,p_peer uuid,p_leave boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  r := app_private.normalize_room(p_room);
  if not app_private.owns_peer(p_room,p_peer) then raise exception 'Phiên phòng hết hạn; hãy vào lại'; end if;
  if p_leave then r.members := r.members - p_peer::text;
  else r.members := jsonb_set(r.members,array[p_peer::text,'expires_at'],
    to_jsonb(extract(epoch from clock_timestamp())+20));
  end if;
  update public.rooms set members=r.members where id=p_room;
  r := app_private.normalize_room(p_room);
  delete from public.signals where room_id=p_room and created_at < now()-interval '2 minutes';
  return app_private.room_view(r);
end $$;

create function public.commit_seats(p_room uuid,p_peer uuid,p_epoch integer,p_revision integer,p_seats jsonb)
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
  update public.rooms set snapshot=jsonb_build_object('revision',p_revision+1,'seats',p_seats)
    where id=p_room returning * into r;
  return app_private.room_view(r);
end $$;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.signals enable row level security;
revoke all on public.profiles,public.rooms,public.signals from anon,authenticated;
grant select,insert,update on public.profiles to authenticated;
grant select(id,name,is_private,max_players,host_peer_id,created_at) on public.rooms to authenticated;
grant select,insert,delete on public.signals to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated with check(id=auth.uid());
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy rooms_read on public.rooms for select to authenticated using(not is_private);

-- Hàm kiểm tra không nhận user_id từ client, luôn dùng auth.uid().
create function public.can_signal(p_room uuid,p_from uuid,p_to uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.owns_peer(p_room,p_from) and exists(select 1 from public.rooms r where r.id=p_room
    and r.members ? p_to::text
    and (r.members->p_to::text->>'expires_at')::double precision > extract(epoch from now()));
$$;
create function public.owns_signal_peer(p_room uuid,p_peer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.owns_peer(p_room,p_peer);
$$;
create policy signals_insert on public.signals for insert to authenticated with check(
  public.can_signal(room_id,from_peer,to_peer) and created_at between now()-interval '10 seconds' and now()+interval '10 seconds');
create policy signals_read on public.signals for select to authenticated using(
  public.owns_signal_peer(room_id,to_peer));
create policy signals_delete on public.signals for delete to authenticated using(
  public.owns_signal_peer(room_id,to_peer));

revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.create_room(text,boolean,integer,uuid) from public,anon;
revoke all on function public.join_room(uuid,uuid,text) from public,anon;
revoke all on function public.sync_room(uuid,uuid,boolean) from public,anon;
revoke all on function public.commit_seats(uuid,uuid,integer,integer,jsonb) from public,anon;
revoke all on function public.can_signal(uuid,uuid,uuid) from public,anon;
revoke all on function public.owns_signal_peer(uuid,uuid) from public,anon;
grant execute on function public.create_room(text,boolean,integer,uuid) to authenticated;
grant execute on function public.join_room(uuid,uuid,text) to authenticated;
grant execute on function public.sync_room(uuid,uuid,boolean) to authenticated;
grant execute on function public.commit_seats(uuid,uuid,integer,integer,jsonb) to authenticated;
grant execute on function public.can_signal(uuid,uuid,uuid) to authenticated;
grant execute on function public.owns_signal_peer(uuid,uuid) to authenticated;

-- Chỉ signals được đưa vào Realtime, không publish rooms/profiles/vị trí.
alter publication supabase_realtime add table public.signals;
commit;
