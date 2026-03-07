-- 십이장기 1:1 실시간 대전 스키마
-- 실행 순서: Supabase SQL Editor에서 그대로 실행

create extension if not exists pgcrypto;

create or replace function public.tj_initial_board()
returns text[]
language sql
immutable
as $$
  select array[
    'GJ', 'GK', 'GS',
    null, 'GP', null,
    null, 'HP', null,
    'HS', 'HK', 'HJ'
  ]::text[];
$$;

create table if not exists public.tj_player_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wins int not null default 0 check (wins >= 0),
  losses int not null default 0 check (losses >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tj_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (char_length(room_code) = 6),
  host_id uuid not null references auth.users(id) on delete cascade,
  host_nickname text not null check (char_length(host_nickname) between 2 and 20),
  guest_id uuid references auth.users(id) on delete set null,
  guest_nickname text check (guest_nickname is null or char_length(guest_nickname) between 2 and 20),
  host_left_at timestamptz,
  guest_left_at timestamptz,
  guest_ready boolean not null default false,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  turn_owner text check (turn_owner in ('host', 'guest')),
  first_turn_owner text check (first_turn_owner in ('host', 'guest')),
  pending_try_owner text check (pending_try_owner in ('host', 'guest')),
  winner_id uuid references auth.users(id) on delete set null,
  winner_reason text check (winner_reason in ('capture_king', 'try', 'forfeit')),
  board text[] not null default public.tj_initial_board(),
  host_hand text[] not null default '{}'::text[],
  guest_hand text[] not null default '{}'::text[],
  move_count int not null default 0 check (move_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tj_room_host_guest_diff check (host_id is distinct from guest_id)
);

create table if not exists public.tj_move_logs (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.tj_rooms(id) on delete cascade,
  move_number int not null check (move_number >= 1),
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('move', 'drop')),
  piece_kind text not null check (piece_kind in ('JANG', 'SANG', 'KING', 'JA', 'HU')),
  from_cell int check (from_cell is null or from_cell between 0 and 11),
  to_cell int not null check (to_cell between 0 and 11),
  captured_kind text check (captured_kind is null or captured_kind in ('JANG', 'SANG', 'KING', 'JA', 'HU')),
  promoted boolean not null default false,
  created_at timestamptz not null default now(),
  unique(room_id, move_number)
);

create index if not exists idx_tj_rooms_code on public.tj_rooms(room_code);
create index if not exists idx_tj_rooms_updated_at on public.tj_rooms(updated_at desc);
create index if not exists idx_tj_move_logs_room on public.tj_move_logs(room_id, move_number);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'tj_rooms'
    ) then
      execute 'alter publication supabase_realtime add table public.tj_rooms';
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'tj_move_logs'
    ) then
      execute 'alter publication supabase_realtime add table public.tj_move_logs';
    end if;
  end if;
end
$$;

alter table public.tj_player_stats enable row level security;
alter table public.tj_rooms enable row level security;
alter table public.tj_move_logs enable row level security;

create or replace function public.tj_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tj_rooms_touch on public.tj_rooms;
create trigger trg_tj_rooms_touch
before update on public.tj_rooms
for each row execute function public.tj_touch_updated_at();

drop trigger if exists trg_tj_player_stats_touch on public.tj_player_stats;
create trigger trg_tj_player_stats_touch
before update on public.tj_player_stats
for each row execute function public.tj_touch_updated_at();

create or replace function public.tj_is_room_member(p_room_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tj_rooms r
    where r.id = p_room_id
      and auth.uid() in (r.host_id, r.guest_id)
  );
$$;

drop policy if exists "tj_rooms_select_member" on public.tj_rooms;
create policy "tj_rooms_select_member"
on public.tj_rooms
for select
using (auth.uid() in (host_id, guest_id));

drop policy if exists "tj_rooms_no_client_write" on public.tj_rooms;
create policy "tj_rooms_no_client_write"
on public.tj_rooms
for all
using (false)
with check (false);

drop policy if exists "tj_move_logs_select_member" on public.tj_move_logs;
create policy "tj_move_logs_select_member"
on public.tj_move_logs
for select
using (public.tj_is_room_member(room_id));

drop policy if exists "tj_move_logs_no_client_write" on public.tj_move_logs;
create policy "tj_move_logs_no_client_write"
on public.tj_move_logs
for all
using (false)
with check (false);

drop policy if exists "tj_player_stats_select_own_or_member" on public.tj_player_stats;
create policy "tj_player_stats_select_own_or_member"
on public.tj_player_stats
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.tj_rooms r
    where auth.uid() in (r.host_id, r.guest_id)
      and public.tj_player_stats.user_id in (r.host_id, r.guest_id)
  )
);

drop policy if exists "tj_player_stats_no_client_write" on public.tj_player_stats;
create policy "tj_player_stats_no_client_write"
on public.tj_player_stats
for all
using (false)
with check (false);

create or replace function public.tj_other_owner(p_owner text)
returns text
language sql
immutable
as $$
  select case when p_owner = 'host' then 'guest' else 'host' end;
$$;

create or replace function public.tj_owner_from_piece_code(p_piece text)
returns text
language sql
immutable
as $$
  select case left(coalesce(p_piece, ''), 1)
    when 'H' then 'host'
    when 'G' then 'guest'
    else null
  end;
$$;

create or replace function public.tj_kind_from_piece_code(p_piece text)
returns text
language sql
immutable
as $$
  select case right(coalesce(p_piece, ''), 1)
    when 'J' then 'JANG'
    when 'S' then 'SANG'
    when 'K' then 'KING'
    when 'P' then 'JA'
    when 'U' then 'HU'
    else null
  end;
$$;

create or replace function public.tj_piece_code(p_owner text, p_kind text)
returns text
language plpgsql
immutable
as $$
begin
  if p_owner not in ('host', 'guest') then
    raise exception 'INVALID_OWNER';
  end if;

  if p_kind not in ('JANG', 'SANG', 'KING', 'JA', 'HU') then
    raise exception 'INVALID_PIECE_KIND';
  end if;

  return case when p_owner = 'host' then 'H' else 'G' end
    || case p_kind
      when 'JANG' then 'J'
      when 'SANG' then 'S'
      when 'KING' then 'K'
      when 'JA' then 'P'
      else 'U'
    end;
end;
$$;

create or replace function public.tj_kind_to_hand_code(p_kind text)
returns text
language plpgsql
immutable
as $$
begin
  if p_kind = 'JANG' then
    return 'J';
  end if;

  if p_kind = 'SANG' then
    return 'S';
  end if;

  if p_kind = 'KING' then
    return 'K';
  end if;

  if p_kind in ('JA', 'HU') then
    return 'P';
  end if;

  raise exception 'INVALID_PIECE_KIND';
end;
$$;

create or replace function public.tj_cell_row(p_cell int)
returns int
language sql
immutable
as $$
  select p_cell / 3;
$$;

create or replace function public.tj_cell_col(p_cell int)
returns int
language sql
immutable
as $$
  select p_cell % 3;
$$;

create or replace function public.tj_cell_index(p_row int, p_col int)
returns int
language sql
immutable
as $$
  select (p_row * 3) + p_col;
$$;

create or replace function public.tj_is_opponent_camp(p_owner text, p_cell int)
returns boolean
language sql
immutable
as $$
  select case
    when p_owner = 'host' then public.tj_cell_row(p_cell) = 0
    when p_owner = 'guest' then public.tj_cell_row(p_cell) = 3
    else false
  end;
$$;

create or replace function public.tj_try_add_target(
  p_targets int[],
  p_board text[],
  p_owner text,
  p_row int,
  p_col int
)
returns int[]
language plpgsql
immutable
as $$
declare
  v_cell int;
  v_target_piece text;
begin
  if p_row < 0 or p_row > 3 or p_col < 0 or p_col > 2 then
    return p_targets;
  end if;

  v_cell := public.tj_cell_index(p_row, p_col);
  v_target_piece := p_board[v_cell + 1];

  if v_target_piece is not null and public.tj_owner_from_piece_code(v_target_piece) = p_owner then
    return p_targets;
  end if;

  return array_append(coalesce(p_targets, '{}'::int[]), v_cell);
end;
$$;

create or replace function public.tj_legal_targets(
  p_board text[],
  p_from_cell int
)
returns int[]
language plpgsql
immutable
as $$
declare
  v_piece text;
  v_owner text;
  v_kind text;
  v_row int;
  v_col int;
  v_forward int;
  v_backward int;
  v_targets int[] := '{}'::int[];
begin
  if p_from_cell < 0 or p_from_cell > 11 then
    return '{}'::int[];
  end if;

  v_piece := p_board[p_from_cell + 1];
  if v_piece is null then
    return '{}'::int[];
  end if;

  v_owner := public.tj_owner_from_piece_code(v_piece);
  v_kind := public.tj_kind_from_piece_code(v_piece);
  v_row := public.tj_cell_row(p_from_cell);
  v_col := public.tj_cell_col(p_from_cell);
  v_forward := case when v_owner = 'host' then -1 else 1 end;
  v_backward := -v_forward;

  if v_kind = 'JANG' then
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_forward, v_col);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_backward, v_col);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row, v_col - 1);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row, v_col + 1);
  elsif v_kind = 'SANG' then
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_forward, v_col - 1);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_forward, v_col + 1);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_backward, v_col - 1);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_backward, v_col + 1);
  elsif v_kind = 'KING' then
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_forward, v_col);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_backward, v_col);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row, v_col - 1);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row, v_col + 1);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_forward, v_col - 1);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_forward, v_col + 1);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_backward, v_col - 1);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_backward, v_col + 1);
  elsif v_kind = 'HU' then
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_forward, v_col);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_backward, v_col);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row, v_col - 1);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row, v_col + 1);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_forward, v_col - 1);
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_forward, v_col + 1);
  else
    v_targets := public.tj_try_add_target(v_targets, p_board, v_owner, v_row + v_forward, v_col);
  end if;

  return coalesce(v_targets, '{}'::int[]);
end;
$$;

create or replace function public.tj_find_king(
  p_board text[],
  p_owner text
)
returns int
language plpgsql
immutable
as $$
declare
  v_index int;
begin
  if p_board is null then
    return null;
  end if;

  for v_index in 1..coalesce(array_length(p_board, 1), 0) loop
    if public.tj_owner_from_piece_code(p_board[v_index]) = p_owner
       and public.tj_kind_from_piece_code(p_board[v_index]) = 'KING' then
      return v_index - 1;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.tj_remove_first_hand_piece(
  p_hand text[],
  p_hand_code text
)
returns text[]
language plpgsql
immutable
as $$
declare
  v_item text;
  v_removed boolean := false;
  v_result text[] := '{}'::text[];
begin
  foreach v_item in array coalesce(p_hand, '{}'::text[]) loop
    if not v_removed and v_item = p_hand_code then
      v_removed := true;
    else
      v_result := array_append(v_result, v_item);
    end if;
  end loop;

  return coalesce(v_result, '{}'::text[]);
end;
$$;

create or replace function public.tj_upsert_stat_result(
  p_winner_id uuid,
  p_loser_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_winner_id is not null then
    insert into public.tj_player_stats(user_id, wins, losses)
    values (p_winner_id, 1, 0)
    on conflict (user_id) do update
    set wins = public.tj_player_stats.wins + 1;
  end if;

  if p_loser_id is not null then
    insert into public.tj_player_stats(user_id, wins, losses)
    values (p_loser_id, 0, 1)
    on conflict (user_id) do update
    set losses = public.tj_player_stats.losses + 1;
  end if;
end;
$$;

revoke execute on function public.tj_upsert_stat_result(uuid, uuid) from anon, public;
grant execute on function public.tj_upsert_stat_result(uuid, uuid) to authenticated;

create or replace function public.tj_create_room(
  p_room_code text,
  p_nickname text
)
returns public.tj_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.tj_rooms;
  v_nickname text := trim(p_nickname);
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if char_length(trim(p_room_code)) <> 6 then
    raise exception 'INVALID_ROOM_CODE';
  end if;

  if char_length(v_nickname) < 2 then
    raise exception 'NICKNAME_REQUIRED';
  end if;

  insert into public.tj_rooms(room_code, host_id, host_nickname)
  values (upper(trim(p_room_code)), auth.uid(), v_nickname)
  returning * into v_room;

  return v_room;
end;
$$;

revoke execute on function public.tj_create_room(text, text) from anon, public;
grant execute on function public.tj_create_room(text, text) to authenticated;

create or replace function public.tj_join_room(
  p_room_code text,
  p_nickname text
)
returns public.tj_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.tj_rooms;
  v_nickname text := trim(p_nickname);
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if char_length(v_nickname) < 2 then
    raise exception 'NICKNAME_REQUIRED';
  end if;

  select * into v_room
  from public.tj_rooms
  where room_code = upper(trim(p_room_code))
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'ROOM_ALREADY_STARTED';
  end if;

  if v_room.host_id = auth.uid() then
    update public.tj_rooms
    set host_nickname = v_nickname
    where id = v_room.id
    returning * into v_room;
    return v_room;
  end if;

  if v_room.guest_id is not null and v_room.guest_id <> auth.uid() then
    raise exception 'ROOM_FULL';
  end if;

  update public.tj_rooms
  set guest_id = auth.uid(),
      guest_nickname = v_nickname,
      guest_ready = false,
      guest_left_at = null
  where id = v_room.id
  returning * into v_room;

  return v_room;
end;
$$;

revoke execute on function public.tj_join_room(text, text) from anon, public;
grant execute on function public.tj_join_room(text, text) to authenticated;

create or replace function public.tj_set_guest_ready(
  p_room_id uuid,
  p_ready boolean
)
returns public.tj_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.tj_rooms;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_room
  from public.tj_rooms
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

  update public.tj_rooms
  set guest_ready = p_ready
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

revoke execute on function public.tj_set_guest_ready(uuid, boolean) from anon, public;
grant execute on function public.tj_set_guest_ready(uuid, boolean) to authenticated;

create or replace function public.tj_start_game(
  p_room_id uuid
)
returns public.tj_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.tj_rooms;
  v_first_turn_owner text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_room
  from public.tj_rooms
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

  v_first_turn_owner := case when random() < 0.5 then 'host' else 'guest' end;

  delete from public.tj_move_logs where room_id = p_room_id;

  update public.tj_rooms
  set guest_ready = false,
      status = 'playing',
      turn_owner = v_first_turn_owner,
      first_turn_owner = v_first_turn_owner,
      pending_try_owner = null,
      winner_id = null,
      winner_reason = null,
      board = public.tj_initial_board(),
      host_hand = '{}'::text[],
      guest_hand = '{}'::text[],
      move_count = 0
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

revoke execute on function public.tj_start_game(uuid) from anon, public;
grant execute on function public.tj_start_game(uuid) to authenticated;

create or replace function public.tj_move_piece(
  p_room_id uuid,
  p_from_cell int,
  p_to_cell int
)
returns public.tj_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.tj_rooms;
  v_actor_owner text;
  v_next_owner text;
  v_board text[];
  v_piece text;
  v_piece_owner text;
  v_piece_kind text;
  v_final_kind text;
  v_target_piece text;
  v_target_kind text;
  v_promoted boolean := false;
  v_move_number int;
  v_hand_code text;
  v_legal_targets int[];
  v_winner_id uuid;
  v_loser_id uuid;
  v_try_king_cell int;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_from_cell < 0 or p_from_cell > 11 then
    raise exception 'INVALID_SOURCE_CELL';
  end if;

  if p_to_cell < 0 or p_to_cell > 11 then
    raise exception 'INVALID_MOVE';
  end if;

  select * into v_room
  from public.tj_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.status = 'finished' then
    raise exception 'GAME_ALREADY_FINISHED';
  end if;

  if v_room.status <> 'playing' then
    raise exception 'ROOM_NOT_PLAYING';
  end if;

  if auth.uid() = v_room.host_id then
    v_actor_owner := 'host';
  elsif auth.uid() = v_room.guest_id then
    v_actor_owner := 'guest';
  else
    raise exception 'NOT_ROOM_MEMBER';
  end if;

  if v_room.turn_owner is distinct from v_actor_owner then
    raise exception 'NOT_YOUR_TURN';
  end if;

  v_board := v_room.board;
  v_piece := v_board[p_from_cell + 1];

  if v_piece is null then
    raise exception 'INVALID_SOURCE_CELL';
  end if;

  v_piece_owner := public.tj_owner_from_piece_code(v_piece);
  v_piece_kind := public.tj_kind_from_piece_code(v_piece);

  if v_piece_owner is distinct from v_actor_owner then
    raise exception 'INVALID_SOURCE_CELL';
  end if;

  v_legal_targets := public.tj_legal_targets(v_board, p_from_cell);
  if not (p_to_cell = any(v_legal_targets)) then
    raise exception 'INVALID_MOVE';
  end if;

  v_target_piece := v_board[p_to_cell + 1];
  v_target_kind := public.tj_kind_from_piece_code(v_target_piece);

  v_final_kind := case
    when v_piece_kind = 'JA' and public.tj_is_opponent_camp(v_actor_owner, p_to_cell) then 'HU'
    else v_piece_kind
  end;
  v_promoted := (v_final_kind = 'HU' and v_piece_kind = 'JA');

  v_board[p_from_cell + 1] := null;
  v_board[p_to_cell + 1] := public.tj_piece_code(v_actor_owner, v_final_kind);

  if v_target_piece is not null and v_target_kind <> 'KING' then
    v_hand_code := public.tj_kind_to_hand_code(v_target_kind);
    if v_actor_owner = 'host' then
      v_room.host_hand := array_append(coalesce(v_room.host_hand, '{}'::text[]), v_hand_code);
    else
      v_room.guest_hand := array_append(coalesce(v_room.guest_hand, '{}'::text[]), v_hand_code);
    end if;
  end if;

  v_move_number := v_room.move_count + 1;

  insert into public.tj_move_logs(
    room_id,
    move_number,
    actor_id,
    action,
    piece_kind,
    from_cell,
    to_cell,
    captured_kind,
    promoted
  )
  values (
    p_room_id,
    v_move_number,
    auth.uid(),
    'move',
    v_piece_kind,
    p_from_cell,
    p_to_cell,
    v_target_kind,
    v_promoted
  );

  if v_target_kind = 'KING' then
    v_winner_id := auth.uid();
    v_loser_id := case when v_actor_owner = 'host' then v_room.guest_id else v_room.host_id end;

    update public.tj_rooms
    set board = v_board,
        host_hand = coalesce(v_room.host_hand, '{}'::text[]),
        guest_hand = coalesce(v_room.guest_hand, '{}'::text[]),
        status = 'finished',
        turn_owner = null,
        pending_try_owner = null,
        winner_id = v_winner_id,
        winner_reason = 'capture_king',
        move_count = v_move_number
    where id = p_room_id
    returning * into v_room;

    perform public.tj_upsert_stat_result(v_winner_id, v_loser_id);
    return v_room;
  end if;

  v_next_owner := public.tj_other_owner(v_actor_owner);
  v_try_king_cell := public.tj_find_king(v_board, v_next_owner);

  if v_room.pending_try_owner = v_next_owner
     and v_try_king_cell is not null
     and public.tj_is_opponent_camp(v_next_owner, v_try_king_cell) then
    v_winner_id := case when v_next_owner = 'host' then v_room.host_id else v_room.guest_id end;
    v_loser_id := auth.uid();

    update public.tj_rooms
    set board = v_board,
        host_hand = coalesce(v_room.host_hand, '{}'::text[]),
        guest_hand = coalesce(v_room.guest_hand, '{}'::text[]),
        status = 'finished',
        turn_owner = null,
        pending_try_owner = null,
        winner_id = v_winner_id,
        winner_reason = 'try',
        move_count = v_move_number
    where id = p_room_id
    returning * into v_room;

    perform public.tj_upsert_stat_result(v_winner_id, v_loser_id);
    return v_room;
  end if;

  update public.tj_rooms
  set board = v_board,
      host_hand = coalesce(v_room.host_hand, '{}'::text[]),
      guest_hand = coalesce(v_room.guest_hand, '{}'::text[]),
      turn_owner = v_next_owner,
      pending_try_owner = case
        when v_final_kind = 'KING' and public.tj_is_opponent_camp(v_actor_owner, p_to_cell) then v_actor_owner
        else null
      end,
      move_count = v_move_number
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

revoke execute on function public.tj_move_piece(uuid, int, int) from anon, public;
grant execute on function public.tj_move_piece(uuid, int, int) to authenticated;

create or replace function public.tj_drop_piece(
  p_room_id uuid,
  p_piece_kind text,
  p_to_cell int
)
returns public.tj_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.tj_rooms;
  v_actor_owner text;
  v_next_owner text;
  v_board text[];
  v_move_number int;
  v_hand_code text;
  v_winner_id uuid;
  v_loser_id uuid;
  v_try_king_cell int;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_to_cell < 0 or p_to_cell > 11 then
    raise exception 'INVALID_DROP';
  end if;

  if p_piece_kind not in ('JANG', 'SANG', 'JA') then
    raise exception 'INVALID_PIECE_KIND';
  end if;

  select * into v_room
  from public.tj_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.status = 'finished' then
    raise exception 'GAME_ALREADY_FINISHED';
  end if;

  if v_room.status <> 'playing' then
    raise exception 'ROOM_NOT_PLAYING';
  end if;

  if auth.uid() = v_room.host_id then
    v_actor_owner := 'host';
  elsif auth.uid() = v_room.guest_id then
    v_actor_owner := 'guest';
  else
    raise exception 'NOT_ROOM_MEMBER';
  end if;

  if v_room.turn_owner is distinct from v_actor_owner then
    raise exception 'NOT_YOUR_TURN';
  end if;

  v_board := v_room.board;
  if v_board[p_to_cell + 1] is not null then
    raise exception 'TARGET_OCCUPIED';
  end if;

  if public.tj_is_opponent_camp(v_actor_owner, p_to_cell) then
    raise exception 'INVALID_DROP';
  end if;

  v_hand_code := public.tj_kind_to_hand_code(p_piece_kind);

  if v_actor_owner = 'host' then
    if not (v_hand_code = any(coalesce(v_room.host_hand, '{}'::text[]))) then
      raise exception 'HAND_PIECE_NOT_AVAILABLE';
    end if;
    v_room.host_hand := public.tj_remove_first_hand_piece(v_room.host_hand, v_hand_code);
  else
    if not (v_hand_code = any(coalesce(v_room.guest_hand, '{}'::text[]))) then
      raise exception 'HAND_PIECE_NOT_AVAILABLE';
    end if;
    v_room.guest_hand := public.tj_remove_first_hand_piece(v_room.guest_hand, v_hand_code);
  end if;

  v_board[p_to_cell + 1] := public.tj_piece_code(v_actor_owner, p_piece_kind);
  v_move_number := v_room.move_count + 1;

  insert into public.tj_move_logs(
    room_id,
    move_number,
    actor_id,
    action,
    piece_kind,
    from_cell,
    to_cell,
    captured_kind,
    promoted
  )
  values (
    p_room_id,
    v_move_number,
    auth.uid(),
    'drop',
    p_piece_kind,
    null,
    p_to_cell,
    null,
    false
  );

  v_next_owner := public.tj_other_owner(v_actor_owner);
  v_try_king_cell := public.tj_find_king(v_board, v_next_owner);

  if v_room.pending_try_owner = v_next_owner
     and v_try_king_cell is not null
     and public.tj_is_opponent_camp(v_next_owner, v_try_king_cell) then
    v_winner_id := case when v_next_owner = 'host' then v_room.host_id else v_room.guest_id end;
    v_loser_id := auth.uid();

    update public.tj_rooms
    set board = v_board,
        host_hand = coalesce(v_room.host_hand, '{}'::text[]),
        guest_hand = coalesce(v_room.guest_hand, '{}'::text[]),
        status = 'finished',
        turn_owner = null,
        pending_try_owner = null,
        winner_id = v_winner_id,
        winner_reason = 'try',
        move_count = v_move_number
    where id = p_room_id
    returning * into v_room;

    perform public.tj_upsert_stat_result(v_winner_id, v_loser_id);
    return v_room;
  end if;

  update public.tj_rooms
  set board = v_board,
      host_hand = coalesce(v_room.host_hand, '{}'::text[]),
      guest_hand = coalesce(v_room.guest_hand, '{}'::text[]),
      turn_owner = v_next_owner,
      pending_try_owner = null,
      move_count = v_move_number
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

revoke execute on function public.tj_drop_piece(uuid, text, int) from anon, public;
grant execute on function public.tj_drop_piece(uuid, text, int) to authenticated;

create or replace function public.tj_reset_room(
  p_room_id uuid
)
returns public.tj_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.tj_rooms;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_room
  from public.tj_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if auth.uid() is distinct from v_room.host_id then
    raise exception 'ONLY_HOST_CAN_RESET';
  end if;

  if v_room.status = 'playing' then
    raise exception 'ROOM_STILL_PLAYING';
  end if;

  delete from public.tj_move_logs where room_id = p_room_id;

  update public.tj_rooms
  set guest_ready = false,
      status = 'waiting',
      turn_owner = null,
      first_turn_owner = null,
      pending_try_owner = null,
      winner_id = null,
      winner_reason = null,
      board = public.tj_initial_board(),
      host_hand = '{}'::text[],
      guest_hand = '{}'::text[],
      move_count = 0,
      host_left_at = null,
      guest_left_at = null
  where id = p_room_id
  returning * into v_room;

  return v_room;
end;
$$;

revoke execute on function public.tj_reset_room(uuid) from anon, public;
grant execute on function public.tj_reset_room(uuid) to authenticated;

create or replace function public.tj_leave_room(
  p_room_id uuid
)
returns public.tj_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.tj_rooms;
  v_after public.tj_rooms;
  v_winner_id uuid;
  v_loser_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_room
  from public.tj_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if auth.uid() is distinct from v_room.host_id
     and auth.uid() is distinct from v_room.guest_id then
    raise exception 'NOT_ROOM_MEMBER';
  end if;

  if auth.uid() = v_room.host_id then
    if v_room.guest_id is null then
      delete from public.tj_rooms where id = p_room_id;
      return null;
    end if;

    if v_room.status = 'waiting' then
      update public.tj_rooms
      set host_id = v_room.guest_id,
          host_nickname = coalesce(v_room.guest_nickname, '게스트'),
          guest_id = null,
          guest_nickname = null,
          guest_ready = false,
          host_left_at = null,
          guest_left_at = null,
          turn_owner = null,
          first_turn_owner = null,
          pending_try_owner = null,
          winner_id = null,
          winner_reason = null,
          board = public.tj_initial_board(),
          host_hand = '{}'::text[],
          guest_hand = '{}'::text[],
          move_count = 0
      where id = p_room_id
      returning * into v_after;
    elsif v_room.status = 'playing' then
      update public.tj_rooms
      set host_left_at = coalesce(v_room.host_left_at, now()),
          guest_ready = false,
          status = 'finished',
          turn_owner = null,
          pending_try_owner = null,
          winner_id = v_room.guest_id,
          winner_reason = 'forfeit'
      where id = p_room_id
      returning * into v_after;

      v_winner_id := v_room.guest_id;
      v_loser_id := v_room.host_id;
      perform public.tj_upsert_stat_result(v_winner_id, v_loser_id);
    else
      update public.tj_rooms
      set host_left_at = coalesce(v_room.host_left_at, now()),
          guest_ready = false,
          turn_owner = null,
          pending_try_owner = null
      where id = p_room_id
      returning * into v_after;
    end if;
  else
    if v_room.status = 'waiting' then
      update public.tj_rooms
      set guest_id = null,
          guest_nickname = null,
          guest_left_at = null,
          guest_ready = false
      where id = p_room_id
      returning * into v_after;
    elsif v_room.status = 'playing' then
      update public.tj_rooms
      set guest_left_at = coalesce(v_room.guest_left_at, now()),
          guest_ready = false,
          status = 'finished',
          turn_owner = null,
          pending_try_owner = null,
          winner_id = v_room.host_id,
          winner_reason = 'forfeit'
      where id = p_room_id
      returning * into v_after;

      v_winner_id := v_room.host_id;
      v_loser_id := v_room.guest_id;
      perform public.tj_upsert_stat_result(v_winner_id, v_loser_id);
    else
      update public.tj_rooms
      set guest_left_at = coalesce(v_room.guest_left_at, now()),
          guest_ready = false,
          turn_owner = null,
          pending_try_owner = null
      where id = p_room_id
      returning * into v_after;
    end if;
  end if;

  if v_after.guest_id is null then
    if v_after.host_left_at is not null then
      delete from public.tj_rooms where id = p_room_id;
      return null;
    end if;
  elsif v_after.host_left_at is not null and v_after.guest_left_at is not null then
    delete from public.tj_rooms where id = p_room_id;
    return null;
  end if;

  return v_after;
end;
$$;

revoke execute on function public.tj_leave_room(uuid) from anon, public;
grant execute on function public.tj_leave_room(uuid) to authenticated;

create or replace function public.tj_cleanup_stale_finished_rooms(
  p_max_age interval default interval '12 hours'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  with deleted as (
    delete from public.tj_rooms r
    where (
      r.status = 'finished'
      and r.updated_at < now() - p_max_age
    ) or (
      r.host_left_at is not null
      and (r.guest_id is null or r.guest_left_at is not null)
      and r.updated_at < now() - interval '10 minutes'
    )
    returning 1
  )
  select count(*) into v_deleted from deleted;

  return v_deleted;
end;
$$;

revoke execute on function public.tj_cleanup_stale_finished_rooms(interval) from anon, public;
grant execute on function public.tj_cleanup_stale_finished_rooms(interval) to authenticated;
