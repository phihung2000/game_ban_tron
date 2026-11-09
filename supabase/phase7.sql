-- Chạy sau phase2.sql và phase4.sql. Có thể chạy lại, không xóa dữ liệu cũ.
begin;
alter table public.profiles add column if not exists rate_state jsonb not null default '{}';
-- Bộ đếm nội bộ không được đọc/ghi bằng API profiles.
revoke select,insert,update on public.profiles from authenticated;
grant select(id,display_name),insert(id,display_name),update(id,display_name) on public.profiles to authenticated;
alter table public.rooms add column if not exists recovery_keys jsonb not null default '{}';
alter table public.rooms add column if not exists kicked_users jsonb not null default '{}';
alter table public.rooms add column if not exists checkpoint jsonb;
alter table public.rooms add column if not exists checkpoint_saved_at timestamptz;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reporter_peer_id uuid not null,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  target_peer_id uuid not null,
  reason text not null check (reason in ('spam','abuse','harassment','other')),
  details text not null default '' check (length(details)<=500),
  created_at timestamptz not null default now(),
  check (reporter_user_id<>target_user_id)
);
create index if not exists reports_room_date on public.reports(room_id,created_at desc);
alter table public.reports enable row level security;
revoke all on public.reports from anon,authenticated;
grant select on public.reports to authenticated;
drop policy if exists reports_own_read on public.reports;
create policy reports_own_read on public.reports for select to authenticated using(reporter_user_id=auth.uid());

-- Token bucket ở DB: khóa đúng hàng hồ sơ của người gọi, không tạo bảng realtime khác.
create or replace function app_private.quota(p_kind text,p_rate numeric,p_burst numeric)
returns void language plpgsql security definer set search_path='' as $$
declare state jsonb; bucket jsonb; stamp numeric; tokens numeric;
begin
  if auth.uid() is null then raise exception 'Cần đăng nhập'; end if;
  select rate_state into state from public.profiles where id=auth.uid() for update;
  if not found then raise exception 'Cần lưu hồ sơ trước'; end if;
  stamp:=extract(epoch from clock_timestamp()); bucket:=state->p_kind;
  tokens:=least(p_burst,coalesce((bucket->>'tokens')::numeric,p_burst)
    + greatest(0,stamp-coalesce((bucket->>'at')::numeric,stamp))*p_rate);
  if tokens<1 then raise exception using errcode='P7004',message='Thao tác quá nhanh; hãy chờ rồi thử lại'; end if;
  update public.profiles set rate_state=jsonb_set(state,array[p_kind],jsonb_build_object('tokens',tokens-1,'at',stamp)) where id=auth.uid();
end $$;
create or replace function app_private.failure(p_message text,p_code text)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('_error',jsonb_build_object('message',p_message,'code',p_code));
$$;

-- Giữ nguyên các kiểm tra ghế/bàn đã có; bọc thêm quota bên ngoài savepoint.
-- Lỗi nghiệp vụ trả envelope để lần thử sai cũng tiêu quota (RAISE toàn RPC sẽ rollback bộ đếm).
do $$
begin
  if to_regprocedure('app_private.phase7_create_room_base(text,boolean,integer,uuid)') is null then
    alter function public.create_room(text,boolean,integer,uuid) rename to phase7_create_room_base;
    alter function public.phase7_create_room_base(text,boolean,integer,uuid) set schema app_private;
    alter function public.join_room(uuid,uuid,text) rename to phase7_join_room_base;
    alter function public.phase7_join_room_base(uuid,uuid,text) set schema app_private;
    alter function public.sync_room(uuid,uuid,boolean) rename to phase7_sync_room_base;
    alter function public.phase7_sync_room_base(uuid,uuid,boolean) set schema app_private;
    alter function public.commit_seats(uuid,uuid,integer,integer,jsonb) rename to phase7_commit_seats_base;
    alter function public.phase7_commit_seats_base(uuid,uuid,integer,integer,jsonb) set schema app_private;
    alter function public.commit_table(uuid,uuid,integer,integer,jsonb) rename to phase7_commit_table_base;
    alter function public.phase7_commit_table_base(uuid,uuid,integer,integer,jsonb) set schema app_private;
  end if;
end $$;

create or replace function app_private.room_view(r public.rooms)
returns jsonb language sql volatile set search_path='' as $$
  select jsonb_build_object('id',r.id,'name',r.name,'is_private',r.is_private,
    'max_players',r.max_players,'host_peer_id',r.host_peer_id,'host_epoch',r.host_epoch,
    'members',r.members,'snapshot',r.snapshot,'server_time',extract(epoch from clock_timestamp())*1000,
    'checkpoint',r.checkpoint,'checkpoint_saved_at',r.checkpoint_saved_at);
$$;
create or replace function app_private.recovery_entry(p_entry jsonb,p_peer uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare secret text; target uuid;
begin
  secret:=replace(gen_random_uuid()::text,'-',''); target:=(p_entry->'room'->>'id')::uuid;
  update public.rooms set recovery_keys=
    coalesce((select jsonb_object_agg(key,value) from jsonb_each(recovery_keys)
      where (value->>'until')::numeric>extract(epoch from clock_timestamp())),'{}') ||
    jsonb_build_object(p_peer::text,jsonb_build_object('user',auth.uid(),'hash',md5(secret),'until',extract(epoch from clock_timestamp())+86400))
    where id=target;
  return p_entry || jsonb_build_object('recovery_token',secret);
end $$;

create or replace function public.create_room(p_name text,p_private boolean,p_max integer,p_peer uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform app_private.quota('create',.05,3);
  begin return app_private.recovery_entry(app_private.phase7_create_room_base(p_name,p_private,p_max,p_peer),p_peer);
  exception when others then return app_private.failure(sqlerrm,sqlstate); end;
end $$;
create or replace function public.join_room(p_peer uuid,p_room uuid default null,p_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  perform app_private.quota('join',.3333,12);
  begin
    if p_code is not null then select id into target from public.rooms where invite_hash=md5(lower(btrim(p_code)));
    else target:=p_room; end if;
    if exists(select 1 from public.rooms where id=target and kicked_users ? auth.uid()::text) then
      raise exception using errcode='P7002',message='Bạn đã bị host mời khỏi phòng này'; end if;
    return app_private.recovery_entry(app_private.phase7_join_room_base(p_peer,p_room,p_code),p_peer);
  exception when others then return app_private.failure(sqlerrm,sqlstate); end;
end $$;
create or replace function public.sync_room(p_room uuid,p_peer uuid,p_leave boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform app_private.quota('sync',1,8);
  begin
    if exists(select 1 from public.rooms where id=p_room and kicked_users ? auth.uid()::text) then
      raise exception using errcode='P7002',message='Bạn đã bị host mời khỏi phòng này'; end if;
    if not app_private.owns_peer(p_room,p_peer) then
      raise exception using errcode='P7001',message='Phiên phòng hết hạn; đang thử phục hồi'; end if;
    result:=app_private.phase7_sync_room_base(p_room,p_peer,p_leave);
    if p_leave then update public.rooms set recovery_keys=recovery_keys-p_peer::text where id=p_room; end if;
    return result;
  exception when others then return app_private.failure(sqlerrm,sqlstate); end;
end $$;
create or replace function public.commit_seats(p_room uuid,p_peer uuid,p_epoch integer,p_revision integer,p_seats jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform app_private.quota('commit',20,30);
  begin return app_private.phase7_commit_seats_base(p_room,p_peer,p_epoch,p_revision,p_seats);
  exception when others then return app_private.failure(sqlerrm,sqlstate); end;
end $$;
create or replace function public.commit_table(p_room uuid,p_peer uuid,p_epoch integer,p_revision integer,p_table jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform app_private.quota('commit',20,30);
  begin return app_private.phase7_commit_table_base(p_room,p_peer,p_epoch,p_revision,p_table);
  exception when others then return app_private.failure(sqlerrm,sqlstate); end;
end $$;

create or replace function public.resume_room(p_room uuid,p_peer uuid,p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms; k jsonb; label text; member jsonb;
begin
  perform app_private.quota('resume',.2,6);
  begin
    select * into r from public.rooms where id=p_room for update;
    if not found then raise exception using errcode='P7003',message='Phòng phục hồi không còn tồn tại'; end if;
    if r.kicked_users ? auth.uid()::text then
      raise exception using errcode='P7002',message='Bạn đã bị host mời khỏi phòng này'; end if;
    k:=r.recovery_keys->p_peer::text;
    if k is null or k->>'user'<>auth.uid()::text or k->>'hash'<>md5(p_token)
      or p_token is null or (k->>'until')::numeric<extract(epoch from clock_timestamp()) then
      raise exception using errcode='P7003',message='Khóa phục hồi không hợp lệ hoặc đã hết hạn; hãy vào lại bằng mã mời'; end if;
    r:=app_private.normalize_room(p_room);
    member:=r.members->p_peer::text;
    if member is null then
      if (select count(*) from jsonb_each(r.members))>=r.max_players then
        raise exception using errcode='P7005',message='Phòng đang đầy; sẽ thử phục hồi lại'; end if;
      select display_name into label from public.profiles where id=auth.uid();
      member:=jsonb_build_object('user_id',auth.uid(),'display_name',label,'join_order',r.next_order);
      r.next_order:=r.next_order+1;
    end if;
    member:=member || jsonb_build_object('expires_at',extract(epoch from clock_timestamp())+20);
    update public.rooms set members=jsonb_set(r.members,array[p_peer::text],member),next_order=r.next_order where id=p_room;
    r:=app_private.normalize_room(p_room);
    -- Giữ token trong 24 giờ kể từ lần phục hồi; token không xuất hiện trong room_view.
    update public.rooms set recovery_keys=jsonb_set(recovery_keys,array[p_peer::text,'until'],to_jsonb(extract(epoch from clock_timestamp())+86400)) where id=p_room;
    return jsonb_build_object('room',app_private.room_view(r),'invite_code',null,'recovery_token',p_token);
  exception when others then return app_private.failure(sqlerrm,sqlstate); end;
end $$;

create or replace function public.save_checkpoint(p_room uuid,p_peer uuid,p_epoch integer,p_poses jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms; item record; poses jsonb:='{}'; stamp numeric;
begin
  perform app_private.quota('checkpoint',.2,3);
  begin
    r:=app_private.normalize_room(p_room);
    if not app_private.owns_peer(p_room,p_peer) or r.host_peer_id<>p_peer or r.host_epoch<>p_epoch then raise exception 'Host đã thay đổi'; end if;
    if jsonb_typeof(p_poses)<>'object' or octet_length(p_poses::text)>16000 or (select count(*) from jsonb_each(p_poses))>30 then raise exception 'Checkpoint quá lớn'; end if;
    for item in select * from jsonb_each(p_poses) loop
      if not (r.members ? item.key) then continue; end if;
      if not (item.value ?& array['x','z','yaw','animation']) or jsonb_typeof(item.value->'x')<>'number'
        or jsonb_typeof(item.value->'z')<>'number' or jsonb_typeof(item.value->'yaw')<>'number'
        or abs((item.value->>'x')::numeric)>32 or abs((item.value->>'z')::numeric)>32
        or abs((item.value->>'yaw')::numeric)>1000000 or item.value->>'animation' not in ('idle','walk','sit') then raise exception 'Vị trí checkpoint không hợp lệ'; end if;
      poses:=poses || jsonb_build_object(item.key,item.value);
    end loop;
    stamp:=extract(epoch from clock_timestamp())*1000;
    -- Snapshot ghế/bàn lấy trực tiếp từ DB, không cho client ghi đè bằng bản cũ.
    update public.rooms set checkpoint=jsonb_build_object('epoch',r.host_epoch,'saved_at',stamp,'snapshot',r.snapshot,'poses',poses),
      checkpoint_saved_at=clock_timestamp() where id=p_room returning * into r;
    return app_private.room_view(r);
  exception when others then return app_private.failure(sqlerrm,sqlstate); end;
end $$;

create or replace function public.kick_member(p_room uuid,p_peer uuid,p_epoch integer,p_target uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms; target_user text;
begin
  perform app_private.quota('kick',.5,6);
  begin
    r:=app_private.normalize_room(p_room);
    if not app_private.owns_peer(p_room,p_peer) or r.host_peer_id<>p_peer or r.host_epoch<>p_epoch then raise exception 'Chỉ host hiện tại được mời người khác ra'; end if;
    target_user:=r.members->p_target::text->>'user_id';
    if p_target=p_peer or target_user is null or target_user=auth.uid()::text then raise exception 'Người chơi không hợp lệ'; end if;
    -- Loại mọi peer cùng tài khoản, không thể đổi UUID để lách kick.
    update public.rooms set kicked_users=kicked_users || jsonb_build_object(target_user,extract(epoch from clock_timestamp())),
      members=coalesce((select jsonb_object_agg(key,value) from jsonb_each(r.members) where value->>'user_id'<>target_user),'{}'),
      recovery_keys=coalesce((select jsonb_object_agg(key,value) from jsonb_each(recovery_keys) where value->>'user'<>target_user),'{}') where id=p_room;
    r:=app_private.normalize_room(p_room); return app_private.room_view(r);
  exception when others then return app_private.failure(sqlerrm,sqlstate); end;
end $$;
create or replace function public.submit_report(p_room uuid,p_peer uuid,p_target uuid,p_reason text,p_details text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rooms; target_user uuid; report_id uuid;
begin
  perform app_private.quota('report-minute',.05,3); perform app_private.quota('report-hour',.0027778,10);
  begin
    r:=app_private.normalize_room(p_room);
    if not app_private.owns_peer(p_room,p_peer) then raise exception 'Cần ở trong phòng để báo cáo'; end if;
    target_user:=(r.members->p_target::text->>'user_id')::uuid;
    if target_user is null or target_user=auth.uid() then raise exception 'Người được báo cáo không hợp lệ'; end if;
    if p_reason is null or p_reason not in ('spam','abuse','harassment','other') or p_details is null or length(p_details)>500 then raise exception 'Nội dung báo cáo không hợp lệ'; end if;
    insert into public.reports(room_id,reporter_user_id,reporter_peer_id,target_user_id,target_peer_id,reason,details)
      values(p_room,auth.uid(),p_peer,target_user,p_target,p_reason,btrim(p_details)) returning id into report_id;
    return jsonb_build_object('id',report_id);
  exception when others then return app_private.failure(sqlerrm,sqlstate); end;
end $$;

create or replace function app_private.signal_quota()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform app_private.quota('signal',40,120);
  if octet_length(new.payload::text)>65536 then raise exception 'Signal quá lớn'; end if;
  return new;
end $$;
drop trigger if exists signals_rate_limit on public.signals;
create trigger signals_rate_limit before insert on public.signals for each row execute function app_private.signal_quota();

revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.create_room(text,boolean,integer,uuid),public.join_room(uuid,uuid,text),
  public.sync_room(uuid,uuid,boolean),public.commit_seats(uuid,uuid,integer,integer,jsonb),
  public.commit_table(uuid,uuid,integer,integer,jsonb),public.resume_room(uuid,uuid,text),
  public.save_checkpoint(uuid,uuid,integer,jsonb),public.kick_member(uuid,uuid,integer,uuid),
  public.submit_report(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.create_room(text,boolean,integer,uuid),public.join_room(uuid,uuid,text),
  public.sync_room(uuid,uuid,boolean),public.commit_seats(uuid,uuid,integer,integer,jsonb),
  public.commit_table(uuid,uuid,integer,integer,jsonb),public.resume_room(uuid,uuid,text),
  public.save_checkpoint(uuid,uuid,integer,jsonb),public.kick_member(uuid,uuid,integer,uuid),
  public.submit_report(uuid,uuid,uuid,text,text) to authenticated;
commit;
