-- 흑과 백 1:1 룸 게임 스키마
-- 실행 순서: Supabase SQL Editor에서 그대로 실행

create extension if not exists pgcrypto;

create table if not exists public.bw_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 20),
  created_at timestamptz not null default now()
);

create table if not exists public.bw_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (char_length(room_code) = 6),
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete set null,
  guest_ready boolean not null default false,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  current_round int not null default 0 check (current_round between 0 and 9),
  round_phase text not null default 'idle' check (round_phase in ('idle', 'await_lead', 'await_follow', 'resolved', 'finished')),
  lead_player_id uuid references auth.users(id) on delete set null,
  host_score int not null default 0 check (host_score between 0 and 9),
  guest_score int not null default 0 check (guest_score between 0 and 9),
  winner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bw_room_host_guest_diff check (host_id is distinct from guest_id)
);

create table if not exists public.bw_rounds_public (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.bw_rooms(id) on delete cascade,
  round_number int not null check (round_number between 1 and 9),
  lead_player_id uuid not null references auth.users(id) on delete cascade,
  follow_player_id uuid not null references auth.users(id) on delete cascade,
  lead_submitted boolean not null default false,
  follow_submitted boolean not null default false,
  lead_tile_color text check (lead_tile_color in ('black', 'white')),
  follow_tile_color text check (follow_tile_color in ('black', 'white')),
  result text check (result in ('HOST_WIN', 'GUEST_WIN', 'DRAW')),
  winner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(room_id, round_number)
);

create table if not exists public.bw_submissions (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.bw_rooms(id) on delete cascade,
  round_number int not null check (round_number between 1 and 9),
  player_id uuid not null references auth.users(id) on delete cascade,
  tile smallint not null check (tile between 1 and 9),
  created_at timestamptz not null default now(),
  unique(room_id, round_number, player_id),
  unique(room_id, player_id, tile)
);

alter table public.bw_rounds_public
  add column if not exists lead_tile_color text check (lead_tile_color in ('black', 'white')),
  add column if not exists follow_tile_color text check (follow_tile_color in ('black', 'white'));

create index if not exists idx_bw_rooms_code on public.bw_rooms(room_code);
create index if not exists idx_bw_rounds_public_room on public.bw_rounds_public(room_id, round_number);
create index if not exists idx_bw_submissions_room_player on public.bw_submissions(room_id, player_id);
create unique index if not exists idx_bw_profiles_nickname_unique on public.bw_profiles(lower(nickname));

alter table public.bw_profiles enable row level security;
alter table public.bw_rooms enable row level security;
alter table public.bw_rounds_public enable row level security;
alter table public.bw_submissions enable row level security;

create or replace function public.bw_is_room_member(p_room_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.bw_rooms r
    where r.id = p_room_id
      and auth.uid() in (r.host_id, r.guest_id)
  );
$$;

-- profiles policy
create policy "bw_profiles_select_own_or_member"
on public.bw_profiles
for select
using (
  id = auth.uid() or exists (
    select 1 from public.bw_rooms r
    where auth.uid() in (r.host_id, r.guest_id)
      and id in (r.host_id, r.guest_id)
  )
);

create policy "bw_profiles_upsert_own"
on public.bw_profiles
for all
using (id = auth.uid())
with check (id = auth.uid());

-- rooms policy
create policy "bw_rooms_select_member"
on public.bw_rooms
for select
using (auth.uid() in (host_id, guest_id));

create policy "bw_rooms_insert_host"
on public.bw_rooms
for insert
with check (host_id = auth.uid());

create policy "bw_rooms_update_member"
on public.bw_rooms
for update
using (auth.uid() in (host_id, guest_id))
with check (auth.uid() in (host_id, guest_id));

-- public rounds policy
create policy "bw_rounds_public_select_member"
on public.bw_rounds_public
for select
using (public.bw_is_room_member(room_id));

create policy "bw_rounds_public_no_client_write"
on public.bw_rounds_public
for all
using (false)
with check (false);

-- submissions policy: 본인 제출만 조회 가능
create policy "bw_submissions_select_own"
on public.bw_submissions
for select
using (
  player_id = auth.uid()
  and public.bw_is_room_member(room_id)
);

create policy "bw_submissions_insert_own"
on public.bw_submissions
for insert
with check (
  player_id = auth.uid()
  and public.bw_is_room_member(room_id)
);

create policy "bw_submissions_block_update_delete"
on public.bw_submissions
for all
using (false)
with check (false);

create or replace function public.bw_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bw_rooms_touch on public.bw_rooms;
create trigger trg_bw_rooms_touch
before update on public.bw_rooms
for each row execute function public.bw_touch_updated_at();

create or replace function public.bw_result_from_tiles(host_tile int, guest_tile int)
returns text
language plpgsql
immutable
as $$
begin
  if host_tile = guest_tile then
    return 'DRAW';
  end if;

  if host_tile = 1 and guest_tile = 9 then
    return 'HOST_WIN';
  end if;

  if host_tile = 9 and guest_tile = 1 then
    return 'GUEST_WIN';
  end if;

  if host_tile > guest_tile then
    return 'HOST_WIN';
  end if;

  return 'GUEST_WIN';
end;
$$;

create or replace function public.bw_start_game(p_room_id uuid)
returns public.bw_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.bw_rooms;
  v_lead uuid;
  v_follow uuid;
begin
  select * into v_room
  from public.bw_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if auth.uid() is distinct from v_room.host_id then
    raise exception 'ONLY_HOST_CAN_START';
  end if;

  if v_room.guest_id is null then
    raise exception 'GUEST_NOT_JOINED';
  end if;

  if v_room.guest_ready is false then
    raise exception 'GUEST_NOT_READY';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'ROOM_ALREADY_STARTED';
  end if;

  if random() < 0.5 then
    v_lead := v_room.host_id;
    v_follow := v_room.guest_id;
  else
    v_lead := v_room.guest_id;
    v_follow := v_room.host_id;
  end if;

  update public.bw_rooms
  set status = 'playing',
      current_round = 1,
      round_phase = 'await_lead',
      lead_player_id = v_lead,
      host_score = 0,
      guest_score = 0,
      winner_id = null
  where id = p_room_id
  returning * into v_room;

  insert into public.bw_rounds_public(room_id, round_number, lead_player_id, follow_player_id)
  values (p_room_id, 1, v_lead, v_follow)
  on conflict (room_id, round_number) do update
  set lead_player_id = excluded.lead_player_id,
      follow_player_id = excluded.follow_player_id,
      lead_submitted = false,
      follow_submitted = false,
      lead_tile_color = null,
      follow_tile_color = null,
      result = null,
      winner_id = null;

  delete from public.bw_submissions where room_id = p_room_id;

  return v_room;
end;
$$;

grant execute on function public.bw_start_game(uuid) to authenticated;

create or replace function public.bw_create_room(p_room_code text, p_nickname text)
returns public.bw_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.bw_rooms;
begin
  if char_length(trim(p_room_code)) <> 6 then
    raise exception 'INVALID_ROOM_CODE';
  end if;

  insert into public.bw_profiles(id, nickname)
  values (auth.uid(), trim(p_nickname))
  on conflict (id) do update set nickname = excluded.nickname;

  insert into public.bw_rooms(room_code, host_id)
  values (upper(trim(p_room_code)), auth.uid())
  returning * into v_room;

  return v_room;
end;
$$;

grant execute on function public.bw_create_room(text, text) to authenticated;

create or replace function public.bw_join_room(p_room_code text, p_nickname text)
returns public.bw_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.bw_rooms;
begin
  insert into public.bw_profiles(id, nickname)
  values (auth.uid(), trim(p_nickname))
  on conflict (id) do update set nickname = excluded.nickname;

  select * into v_room
  from public.bw_rooms
  where room_code = upper(trim(p_room_code))
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'ROOM_ALREADY_STARTED';
  end if;

  if v_room.host_id = auth.uid() then
    return v_room;
  end if;

  if v_room.guest_id is not null and v_room.guest_id <> auth.uid() then
    raise exception 'ROOM_FULL';
  end if;

  update public.bw_rooms
  set guest_id = auth.uid(),
      guest_ready = false
  where id = v_room.id
  returning * into v_room;

  return v_room;
end;
$$;

grant execute on function public.bw_join_room(text, text) to authenticated;

create or replace function public.bw_set_guest_ready(p_room_id uuid, p_ready boolean)
returns public.bw_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.bw_rooms;
begin
  select * into v_room
  from public.bw_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if auth.uid() is distinct from v_room.guest_id then
    raise exception 'ONLY_GUEST_CAN_SET_READY';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'ROOM_ALREADY_STARTED';
  end if;

  update public.bw_rooms
  set guest_ready = p_ready
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

grant execute on function public.bw_set_guest_ready(uuid, boolean) to authenticated;

create or replace function public.bw_submit_tile(p_room_id uuid, p_tile smallint)
returns public.bw_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.bw_rooms;
  v_round public.bw_rounds_public;
  v_host_tile int;
  v_guest_tile int;
  v_result text;
  v_next_lead uuid;
  v_next_follow uuid;
  v_is_host boolean;
begin
  if p_tile < 1 or p_tile > 9 then
    raise exception 'INVALID_TILE';
  end if;

  select * into v_room
  from public.bw_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.status <> 'playing' then
    raise exception 'ROOM_NOT_PLAYING';
  end if;

  if auth.uid() not in (v_room.host_id, v_room.guest_id) then
    raise exception 'NOT_ROOM_MEMBER';
  end if;

  v_is_host := (auth.uid() = v_room.host_id);

  select * into v_round
  from public.bw_rounds_public
  where room_id = p_room_id
    and round_number = v_room.current_round
  for update;

  if not found then
    raise exception 'ROUND_NOT_FOUND';
  end if;

  if v_room.round_phase = 'await_lead' and auth.uid() is distinct from v_round.lead_player_id then
    raise exception 'NOT_YOUR_TURN';
  end if;

  if v_room.round_phase = 'await_follow' and auth.uid() is distinct from v_round.follow_player_id then
    raise exception 'NOT_YOUR_TURN';
  end if;

  if exists (
    select 1
    from public.bw_submissions s
    where s.room_id = p_room_id
      and s.player_id = auth.uid()
      and s.tile = p_tile
  ) then
    raise exception 'TILE_ALREADY_USED';
  end if;

  insert into public.bw_submissions(room_id, round_number, player_id, tile)
  values (p_room_id, v_room.current_round, auth.uid(), p_tile);

  if auth.uid() = v_round.lead_player_id then
    update public.bw_rounds_public
    set lead_submitted = true,
        lead_tile_color = case when p_tile % 2 = 0 then 'black' else 'white' end
    where id = v_round.id;

    update public.bw_rooms
    set round_phase = 'await_follow'
    where id = p_room_id
    returning * into v_room;

    return v_room;
  end if;

  update public.bw_rounds_public
  set follow_submitted = true,
      follow_tile_color = case when p_tile % 2 = 0 then 'black' else 'white' end
  where id = v_round.id;

  select s.tile into v_host_tile
  from public.bw_submissions s
  where s.room_id = p_room_id
    and s.round_number = v_room.current_round
    and s.player_id = v_room.host_id;

  select s.tile into v_guest_tile
  from public.bw_submissions s
  where s.room_id = p_room_id
    and s.round_number = v_room.current_round
    and s.player_id = v_room.guest_id;

  if v_host_tile is null or v_guest_tile is null then
    raise exception 'MISSING_SUBMISSION';
  end if;

  v_result := public.bw_result_from_tiles(v_host_tile, v_guest_tile);

  update public.bw_rounds_public
  set result = v_result,
      winner_id = case
        when v_result = 'HOST_WIN' then v_room.host_id
        when v_result = 'GUEST_WIN' then v_room.guest_id
        else null
      end
  where id = v_round.id;

  if v_result = 'HOST_WIN' then
    v_room.host_score := v_room.host_score + 1;
    v_next_lead := v_room.host_id;
  elsif v_result = 'GUEST_WIN' then
    v_room.guest_score := v_room.guest_score + 1;
    v_next_lead := v_room.guest_id;
  else
    v_next_lead := v_round.lead_player_id;
  end if;

  v_next_follow := case when v_next_lead = v_room.host_id then v_room.guest_id else v_room.host_id end;

  if v_room.host_score >= 5 or v_room.guest_score >= 5 or v_room.current_round >= 9 then
    update public.bw_rooms
    set status = 'finished',
        round_phase = 'finished',
        host_score = v_room.host_score,
        guest_score = v_room.guest_score,
        winner_id = case
          when v_room.host_score > v_room.guest_score then v_room.host_id
          when v_room.guest_score > v_room.host_score then v_room.guest_id
          else null
        end
    where id = p_room_id
    returning * into v_room;

    return v_room;
  end if;

  update public.bw_rooms
  set host_score = v_room.host_score,
      guest_score = v_room.guest_score,
      current_round = v_room.current_round + 1,
      lead_player_id = v_next_lead,
      round_phase = 'await_lead'
  where id = p_room_id
  returning * into v_room;

  insert into public.bw_rounds_public(room_id, round_number, lead_player_id, follow_player_id, lead_tile_color, follow_tile_color)
  values (p_room_id, v_room.current_round, v_next_lead, v_next_follow)
  on conflict (room_id, round_number) do nothing;

  return v_room;
end;
$$;

grant execute on function public.bw_submit_tile(uuid, smallint) to authenticated;

create or replace function public.bw_reset_room(p_room_id uuid)
returns public.bw_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.bw_rooms;
begin
  select * into v_room
  from public.bw_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if auth.uid() is distinct from v_room.host_id then
    raise exception 'ONLY_HOST_CAN_RESET';
  end if;

  delete from public.bw_rounds_public where room_id = p_room_id;
  delete from public.bw_submissions where room_id = p_room_id;

  update public.bw_rooms
  set status = 'waiting',
      guest_ready = false,
      current_round = 0,
      round_phase = 'idle',
      lead_player_id = null,
      host_score = 0,
      guest_score = 0,
      winner_id = null
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

grant execute on function public.bw_reset_room(uuid) to authenticated;

create or replace function public.bw_leave_room(p_room_id uuid)
returns public.bw_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.bw_rooms;
begin
  select * into v_room
  from public.bw_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if auth.uid() not in (v_room.host_id, v_room.guest_id) then
    raise exception 'NOT_ROOM_MEMBER';
  end if;

  if auth.uid() = v_room.host_id then
    if v_room.guest_id is null then
      delete from public.bw_rooms where id = p_room_id;
      return null;
    end if;

    if v_room.status = 'playing' then
      update public.bw_rooms
      set guest_ready = false,
          status = 'finished',
          round_phase = 'finished',
          lead_player_id = null,
          guest_score = least(greatest(v_room.guest_score, v_room.host_score + 1), 9),
          winner_id = v_room.guest_id
      where id = p_room_id
      returning * into v_room;
      return v_room;
    end if;

    update public.bw_rooms
    set host_id = v_room.guest_id,
        guest_id = null,
        guest_ready = false
    where id = p_room_id
    returning * into v_room;
    return v_room;
  end if;

  if v_room.status = 'playing' then
    update public.bw_rooms
    set guest_ready = false,
        status = 'finished',
        round_phase = 'finished',
        lead_player_id = null,
        host_score = least(greatest(v_room.host_score, v_room.guest_score + 1), 9),
        winner_id = v_room.host_id
    where id = p_room_id
    returning * into v_room;
    return v_room;
  end if;

  update public.bw_rooms
  set guest_id = null,
      guest_ready = false
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

grant execute on function public.bw_leave_room(uuid) to authenticated;

create or replace function public.bw_get_room_reveals(p_room_id uuid)
returns table(round_number int, player_id uuid, tile smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.bw_rooms;
begin
  select * into v_room
  from public.bw_rooms
  where id = p_room_id;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if auth.uid() not in (v_room.host_id, v_room.guest_id) then
    raise exception 'NOT_ROOM_MEMBER';
  end if;

  if v_room.status <> 'finished' then
    raise exception 'ROOM_NOT_FINISHED';
  end if;

  return query
  select s.round_number, s.player_id, s.tile
  from public.bw_submissions s
  where s.room_id = p_room_id
  order by s.round_number asc, s.created_at asc;
end;
$$;

grant execute on function public.bw_get_room_reveals(uuid) to authenticated;

create or replace function public.bw_get_room_member_record(p_room_id uuid, p_player_id uuid)
returns table(total int, wins int, losses int, win_rate int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.bw_rooms;
  v_wins int;
  v_losses int;
  v_total int;
begin
  select * into v_room
  from public.bw_rooms
  where id = p_room_id;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if auth.uid() not in (v_room.host_id, v_room.guest_id) then
    raise exception 'NOT_ROOM_MEMBER';
  end if;

  if p_player_id not in (v_room.host_id, v_room.guest_id) then
    raise exception 'PLAYER_NOT_IN_ROOM';
  end if;

  select count(*) into v_wins
  from public.bw_rooms r
  where r.status = 'finished'
    and (r.host_id = p_player_id or r.guest_id = p_player_id)
    and r.winner_id = p_player_id;

  select count(*) into v_losses
  from public.bw_rooms r
  where r.status = 'finished'
    and (r.host_id = p_player_id or r.guest_id = p_player_id)
    and r.winner_id is not null
    and r.winner_id <> p_player_id;

  v_total := v_wins + v_losses;
  return query
  select
    v_total,
    v_wins,
    v_losses,
    case when v_total > 0 then round((v_wins::numeric / v_total::numeric) * 100)::int else 0 end;
end;
$$;

grant execute on function public.bw_get_room_member_record(uuid, uuid) to authenticated;
