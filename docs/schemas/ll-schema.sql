-- 러브 레터 2~4인 실시간 게임 스키마
-- 적용 순서: Supabase SQL Editor에서 그대로 실행

create extension if not exists pgcrypto;

create table if not exists public.ll_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (char_length(room_code) = 6),
  host_id uuid not null references auth.users(id) on delete cascade,
  player_limit int not null check (player_limit in (2, 3, 4)),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  current_round int not null default 0 check (current_round >= 0),
  target_token_count int not null check (target_token_count between 4 and 7),
  final_winner_ids uuid[] not null default '{}',
  last_departed_nickname text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_room_players (
  room_id uuid not null references public.ll_rooms(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  seat_index int not null check (seat_index between 0 and 3),
  join_order int not null check (join_order >= 0),
  ready boolean not null default false,
  token_count int not null default 0 check (token_count >= 0),
  nickname_snapshot text not null check (char_length(nickname_snapshot) between 2 and 20),
  left_at timestamptz,
  last_active_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (room_id, player_id),
  unique (room_id, seat_index),
  unique (room_id, join_order)
);

create table if not exists public.ll_round_states (
  room_id uuid primary key references public.ll_rooms(id) on delete cascade,
  round_number int not null check (round_number >= 1),
  round_phase text not null check (
    round_phase in (
      'dealing',
      'await_turn',
      'await_broadcaster_resolution',
      'round_reveal',
      'await_next_round',
      'match_finished'
    )
  ),
  starter_player_id uuid references auth.users(id) on delete set null,
  current_turn_player_id uuid references auth.users(id) on delete set null,
  next_starter_player_id uuid references auth.users(id) on delete set null,
  burned_card smallint check (burned_card between 0 and 9),
  deck_order smallint[] not null default '{}',
  hands jsonb not null default '{}'::jsonb,
  discard_piles jsonb not null default '{}'::jsonb,
  protected_player_ids uuid[] not null default '{}',
  eliminated_player_ids uuid[] not null default '{}',
  spectator_player_ids uuid[] not null default '{}',
  reveal_all_hands boolean not null default false,
  pending_input jsonb not null default '{}'::jsonb,
  round_winner_ids uuid[] not null default '{}',
  match_winner_ids uuid[] not null default '{}',
  end_reason text,
  tiebreak_sums jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ll_action_logs (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.ll_rooms(id) on delete cascade,
  round_number int not null default 0,
  action_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_nickname text,
  target_player_id uuid references auth.users(id) on delete set null,
  target_nickname text,
  card_id smallint check (card_id between 0 and 9),
  guessed_card smallint check (guessed_card between 0 and 9),
  public_message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ll_player_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.ll_rooms(id) on delete cascade,
  round_number int not null default 0,
  player_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  title text not null,
  message text not null,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ll_player_stats (
  player_id uuid primary key references auth.users(id) on delete cascade,
  matches_played int not null default 0 check (matches_played >= 0),
  match_wins int not null default 0 check (match_wins >= 0),
  round_wins int not null default 0 check (round_wins >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ll_rooms_room_code on public.ll_rooms(room_code);
create index if not exists idx_ll_rooms_status on public.ll_rooms(status, updated_at desc);
create index if not exists idx_ll_room_players_player on public.ll_room_players(player_id, joined_at desc);
create index if not exists idx_ll_action_logs_room on public.ll_action_logs(room_id, created_at desc);
create index if not exists idx_ll_player_events_room_player on public.ll_player_events(room_id, player_id, created_at desc);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'll_rooms'
    ) then
      execute 'alter publication supabase_realtime add table public.ll_rooms';
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'll_room_players'
    ) then
      execute 'alter publication supabase_realtime add table public.ll_room_players';
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'll_round_states'
    ) then
      execute 'alter publication supabase_realtime add table public.ll_round_states';
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'll_action_logs'
    ) then
      execute 'alter publication supabase_realtime add table public.ll_action_logs';
    end if;
  end if;
end
$$;

create or replace function public.ll_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ll_rooms_touch on public.ll_rooms;
create trigger trg_ll_rooms_touch
before update on public.ll_rooms
for each row execute function public.ll_touch_updated_at();

drop trigger if exists trg_ll_round_states_touch on public.ll_round_states;
create trigger trg_ll_round_states_touch
before update on public.ll_round_states
for each row execute function public.ll_touch_updated_at();

drop trigger if exists trg_ll_player_stats_touch on public.ll_player_stats;
create trigger trg_ll_player_stats_touch
before update on public.ll_player_stats
for each row execute function public.ll_touch_updated_at();

create or replace function public.ll_target_token_count(p_player_limit int)
returns int
language sql
immutable
as $$
  select case
    when p_player_limit = 2 then 7
    when p_player_limit = 3 then 5
    else 4
  end;
$$;

create or replace function public.ll_random_room_code()
returns text
language plpgsql
volatile
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text := '';
  index int;
begin
  loop
    candidate := '';
    for index in 1..6 loop
      candidate := candidate || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;

    if not exists (select 1 from public.ll_rooms where room_code = candidate) then
      return candidate;
    end if;
  end loop;
end;
$$;

create or replace function public.ll_is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ll_room_players rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  );
$$;

create or replace function public.ll_shuffle_deck()
returns smallint[]
language sql
volatile
as $$
  select coalesce(array_agg(card_id order by random()), '{}'::smallint[])
  from (
    values
      (0::smallint), (0::smallint),
      (1::smallint), (1::smallint), (1::smallint), (1::smallint), (1::smallint), (1::smallint),
      (2::smallint), (2::smallint),
      (3::smallint), (3::smallint),
      (4::smallint), (4::smallint),
      (5::smallint), (5::smallint),
      (6::smallint), (6::smallint),
      (7::smallint),
      (8::smallint),
      (9::smallint)
  ) as deck(card_id);
$$;

create or replace function public.ll_card_map_get(p_map jsonb, p_player_id uuid)
returns smallint[]
language sql
stable
as $$
  select coalesce(array_agg(value::smallint order by ordinality), '{}'::smallint[])
  from jsonb_array_elements_text(coalesce(p_map -> (p_player_id::text), '[]'::jsonb))
    with ordinality as cards(value, ordinality);
$$;

create or replace function public.ll_card_map_put(p_map jsonb, p_player_id uuid, p_cards smallint[])
returns jsonb
language sql
immutable
as $$
  select jsonb_set(
    coalesce(p_map, '{}'::jsonb),
    array[p_player_id::text],
    to_jsonb(coalesce(p_cards, '{}'::smallint[])),
    true
  );
$$;

create or replace function public.ll_remove_first_card(p_cards smallint[], p_card smallint)
returns smallint[]
language plpgsql
immutable
as $$
declare
  next_cards smallint[] := '{}'::smallint[];
  item smallint;
  removed boolean := false;
begin
  foreach item in array coalesce(p_cards, '{}'::smallint[]) loop
    if item = p_card and not removed then
      removed := true;
    else
      next_cards := next_cards || item;
    end if;
  end loop;

  return next_cards;
end;
$$;

create or replace function public.ll_remove_first_card(p_cards smallint[], p_card integer)
returns smallint[]
language sql
immutable
as $$
  select public.ll_remove_first_card(
    p_cards,
    case when p_card is null then null else p_card::smallint end
  );
$$;

create or replace function public.ll_array_contains_same_cards(p_left smallint[], p_right smallint[])
returns boolean
language sql
immutable
as $$
  select coalesce(
    (
      select array_agg(item order by item)
      from unnest(coalesce(p_left, '{}'::smallint[])) item
    ),
    '{}'::smallint[]
  ) = coalesce(
    (
      select array_agg(item order by item)
      from unnest(coalesce(p_right, '{}'::smallint[])) item
    ),
    '{}'::smallint[]
  );
$$;

create or replace function public.ll_uuid_array_add(p_values uuid[], p_value uuid)
returns uuid[]
language sql
immutable
as $$
  select case
    when p_value is null then coalesce(p_values, '{}'::uuid[])
    when p_value = any(coalesce(p_values, '{}'::uuid[])) then coalesce(p_values, '{}'::uuid[])
    else coalesce(p_values, '{}'::uuid[]) || p_value
  end;
$$;

create or replace function public.ll_uuid_array_remove(p_values uuid[], p_value uuid)
returns uuid[]
language sql
immutable
as $$
  select array_remove(coalesce(p_values, '{}'::uuid[]), p_value);
$$;

create or replace function public.ll_append_action_log(
  p_room_id uuid,
  p_round_number int,
  p_action_type text,
  p_actor_id uuid,
  p_actor_nickname text,
  p_target_player_id uuid,
  p_target_nickname text,
  p_card_id smallint,
  p_guessed_card smallint,
  p_public_message text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ll_action_logs (
    room_id,
    round_number,
    action_type,
    actor_id,
    actor_nickname,
    target_player_id,
    target_nickname,
    card_id,
    guessed_card,
    public_message,
    payload
  )
  values (
    p_room_id,
    coalesce(p_round_number, 0),
    p_action_type,
    p_actor_id,
    p_actor_nickname,
    p_target_player_id,
    p_target_nickname,
    p_card_id,
    p_guessed_card,
    p_public_message,
    coalesce(p_payload, '{}'::jsonb)
  );
$$;

create or replace function public.ll_append_action_log(
  p_room_id uuid,
  p_round_number int,
  p_action_type text,
  p_actor_id uuid,
  p_actor_nickname text,
  p_target_player_id uuid,
  p_target_nickname text,
  p_card_id integer,
  p_guessed_card integer,
  p_public_message text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  select public.ll_append_action_log(
    p_room_id,
    p_round_number,
    p_action_type,
    p_actor_id,
    p_actor_nickname,
    p_target_player_id,
    p_target_nickname,
    case when p_card_id is null then null else p_card_id::smallint end,
    case when p_guessed_card is null then null else p_guessed_card::smallint end,
    p_public_message,
    coalesce(p_payload, '{}'::jsonb)
  );
$$;

create or replace function public.ll_append_player_event(
  p_room_id uuid,
  p_round_number int,
  p_player_id uuid,
  p_event_type text,
  p_title text,
  p_message text,
  p_detail text default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ll_player_events (
    room_id,
    round_number,
    player_id,
    event_type,
    title,
    message,
    detail,
    payload
  )
  values (
    p_room_id,
    coalesce(p_round_number, 0),
    p_player_id,
    p_event_type,
    coalesce(p_title, '서버 메세지'),
    coalesce(p_message, ''),
    p_detail,
    coalesce(p_payload, '{}'::jsonb)
  );
exception
  when undefined_table or undefined_column then
    return;
end;
$$;

create or replace function public.ll_get_player_events_jsonb(
  p_room_id uuid,
  p_player_id uuid,
  p_limit int default 8
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  events jsonb := '[]'::jsonb;
begin
  select coalesce(
    jsonb_agg(to_jsonb(event_item) order by event_item.created_at desc, event_item.id desc),
    '[]'::jsonb
  )
  into events
  from (
    select *
    from public.ll_player_events
    where room_id = p_room_id
      and player_id = p_player_id
    order by created_at desc, id desc
    limit greatest(coalesce(p_limit, 8), 0)
  ) event_item;

  return events;
exception
  when undefined_table or undefined_column then
    return '[]'::jsonb;
end;
$$;

create or replace function public.ll_card_name(p_card_id smallint)
returns text
language sql
immutable
as $$
  select case p_card_id
    when 0 then '전학생'
    when 1 then '선도부원'
    when 2 then '상담 선생님'
    when 3 then '운동부 에이스'
    when 4 then '도서부원'
    when 5 then '전교 부회장'
    when 6 then '방송부장'
    when 7 then '전교 회장'
    when 8 then '전교 1등'
    when 9 then '짝사랑'
    else '알 수 없는 카드'
  end;
$$;

create or replace function public.ll_card_name(p_card_id integer)
returns text
language sql
immutable
as $$
  select public.ll_card_name(
    case when p_card_id is null then null else p_card_id::smallint end
  );
$$;

create or replace function public.ll_apply_scholar_constraint(
  p_hands jsonb,
  p_discard_piles jsonb,
  p_player_id uuid
)
returns jsonb
language plpgsql
immutable
as $$
declare
  current_hand smallint[];
  current_discard smallint[];
  next_hands jsonb := coalesce(p_hands, '{}'::jsonb);
  next_discards jsonb := coalesce(p_discard_piles, '{}'::jsonb);
  scholar_forced boolean := false;
begin
  current_hand := public.ll_card_map_get(next_hands, p_player_id);
  if 8 = any(current_hand) and (5 = any(current_hand) or 7 = any(current_hand)) then
    scholar_forced := true;
    current_hand := public.ll_remove_first_card(current_hand, 8::smallint);
    current_discard := public.ll_card_map_get(next_discards, p_player_id) || 8::smallint;
    next_hands := public.ll_card_map_put(next_hands, p_player_id, current_hand);
    next_discards := public.ll_card_map_put(next_discards, p_player_id, current_discard);
  end if;

  return jsonb_build_object(
    'hands', next_hands,
    'discard_piles', next_discards,
    'scholar_forced', scholar_forced
  );
end;
$$;

create or replace function public.ll_eliminate_player(
  p_hands jsonb,
  p_discard_piles jsonb,
  p_eliminated_player_ids uuid[],
  p_spectator_player_ids uuid[],
  p_player_id uuid
)
returns jsonb
language plpgsql
immutable
as $$
declare
  current_hand smallint[];
  next_hands jsonb := coalesce(p_hands, '{}'::jsonb);
  next_discards jsonb := coalesce(p_discard_piles, '{}'::jsonb);
begin
  current_hand := public.ll_card_map_get(next_hands, p_player_id);
  next_discards := public.ll_card_map_put(
    next_discards,
    p_player_id,
    public.ll_card_map_get(next_discards, p_player_id) || current_hand
  );
  next_hands := public.ll_card_map_put(next_hands, p_player_id, '{}'::smallint[]);

  return jsonb_build_object(
    'hands', next_hands,
    'discard_piles', next_discards,
    'eliminated_player_ids', public.ll_uuid_array_add(coalesce(p_eliminated_player_ids, '{}'::uuid[]), p_player_id),
    'spectator_player_ids', public.ll_uuid_array_add(coalesce(p_spectator_player_ids, '{}'::uuid[]), p_player_id)
  );
end;
$$;

create or replace function public.ll_player_order(p_room_id uuid)
returns uuid[]
language sql
stable
as $$
  select coalesce(array_agg(player_id order by seat_index), '{}'::uuid[])
  from public.ll_room_players
  where room_id = p_room_id
    and left_at is null;
$$;

create or replace function public.ll_next_alive_player(
  p_room_id uuid,
  p_current_player_id uuid,
  p_eliminated_player_ids uuid[]
)
returns uuid
language plpgsql
stable
as $$
declare
  order_ids uuid[];
  current_index int := 0;
  total_count int;
  offset_index int;
  candidate uuid;
begin
  order_ids := public.ll_player_order(p_room_id);
  total_count := coalesce(array_length(order_ids, 1), 0);

  if total_count = 0 then
    return null;
  end if;

  for offset_index in 1..total_count loop
    if order_ids[offset_index] = p_current_player_id then
      current_index := offset_index;
      exit;
    end if;
  end loop;

  if current_index = 0 then
    current_index := 1;
  end if;

  for offset_index in 1..total_count loop
    candidate := order_ids[((current_index - 1 + offset_index) % total_count) + 1];
    if not candidate = any(coalesce(p_eliminated_player_ids, '{}'::uuid[])) then
      return candidate;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.ll_upsert_player_stats(
  p_round_winner_ids uuid[],
  p_match_winner_ids uuid[],
  p_all_player_ids uuid[],
  p_increment_matches boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stat_player_id uuid;
begin
  foreach stat_player_id in array coalesce(p_all_player_ids, '{}'::uuid[]) loop
    insert into public.ll_player_stats (player_id, matches_played, match_wins, round_wins)
    values (
      stat_player_id,
      case when p_increment_matches then 1 else 0 end,
      case when stat_player_id = any(coalesce(p_match_winner_ids, '{}'::uuid[])) then 1 else 0 end,
      case when stat_player_id = any(coalesce(p_round_winner_ids, '{}'::uuid[])) then 1 else 0 end
    )
    on conflict (player_id) do update
    set
      matches_played = public.ll_player_stats.matches_played + case when p_increment_matches then 1 else 0 end,
      match_wins = public.ll_player_stats.match_wins + case when stat_player_id = any(coalesce(p_match_winner_ids, '{}'::uuid[])) then 1 else 0 end,
      round_wins = public.ll_player_stats.round_wins + case when stat_player_id = any(coalesce(p_round_winner_ids, '{}'::uuid[])) then 1 else 0 end,
      updated_at = now();
  end loop;
end;
$$;

create or replace function public.ll_start_round(
  p_room_id uuid,
  p_round_number int,
  p_starter_player_id uuid default null
)
returns public.ll_round_states
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.ll_rooms;
  shuffled_deck smallint[];
  active_players uuid[];
  deal_player_id uuid;
  starter_player uuid;
  starter_nickname text;
  next_hands jsonb := '{}'::jsonb;
  next_discards jsonb := '{}'::jsonb;
  draw_card smallint;
  deck_cursor int := 1;
  round_state public.ll_round_states;
  viewer_row record;
begin
  select * into room_row
  from public.ll_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  active_players := public.ll_player_order(p_room_id);
  if coalesce(array_length(active_players, 1), 0) < 2 then
    raise exception 'PLAYER_LIMIT_NOT_MET';
  end if;

  starter_player := coalesce(
    p_starter_player_id,
    active_players[1 + floor(random() * coalesce(array_length(active_players, 1), 1))::int]
  );

  shuffled_deck := public.ll_shuffle_deck();

  -- 비공개 제거 카드
  deck_cursor := 2;

  foreach deal_player_id in array active_players loop
    draw_card := shuffled_deck[deck_cursor];
    deck_cursor := deck_cursor + 1;
    next_hands := public.ll_card_map_put(next_hands, deal_player_id, array[draw_card]);
    next_discards := public.ll_card_map_put(next_discards, deal_player_id, '{}'::smallint[]);
  end loop;

  draw_card := shuffled_deck[deck_cursor];
  deck_cursor := deck_cursor + 1;
  next_hands := public.ll_card_map_put(next_hands, starter_player, public.ll_card_map_get(next_hands, starter_player) || draw_card);

  insert into public.ll_round_states (
    room_id,
    round_number,
    round_phase,
    starter_player_id,
    current_turn_player_id,
    burned_card,
    deck_order,
    hands,
    discard_piles,
    protected_player_ids,
    eliminated_player_ids,
    spectator_player_ids,
    reveal_all_hands,
    pending_input,
    round_winner_ids,
    match_winner_ids,
    end_reason,
    tiebreak_sums
  )
  values (
    p_room_id,
    p_round_number,
    'await_turn',
    starter_player,
    starter_player,
    shuffled_deck[1],
    coalesce(shuffled_deck[deck_cursor:array_length(shuffled_deck, 1)], '{}'::smallint[]),
    next_hands,
    next_discards,
    '{}'::uuid[],
    '{}'::uuid[],
    '{}'::uuid[],
    false,
    '{}'::jsonb,
    '{}'::uuid[],
    '{}'::uuid[],
    null,
    '{}'::jsonb
  )
  on conflict (room_id) do update
  set
    round_number = excluded.round_number,
    round_phase = excluded.round_phase,
    starter_player_id = excluded.starter_player_id,
    current_turn_player_id = excluded.current_turn_player_id,
    next_starter_player_id = null,
    burned_card = excluded.burned_card,
    deck_order = excluded.deck_order,
    hands = excluded.hands,
    discard_piles = excluded.discard_piles,
    protected_player_ids = excluded.protected_player_ids,
    eliminated_player_ids = excluded.eliminated_player_ids,
    spectator_player_ids = excluded.spectator_player_ids,
    reveal_all_hands = excluded.reveal_all_hands,
    pending_input = excluded.pending_input,
    round_winner_ids = excluded.round_winner_ids,
    match_winner_ids = excluded.match_winner_ids,
    end_reason = excluded.end_reason,
    tiebreak_sums = excluded.tiebreak_sums,
    updated_at = now()
  returning * into round_state;

  perform public.ll_append_action_log(
    p_room_id,
    p_round_number,
    'round_started',
    null,
    null,
    starter_player,
    (
      select rp.nickname_snapshot
      from public.ll_room_players rp
      where rp.room_id = p_room_id
        and rp.player_id = starter_player
    ),
    null,
    null,
    format('%s 라운드가 시작되었습니다.', p_round_number),
    jsonb_build_object('starter_player_id', starter_player)
  );

  select rp.nickname_snapshot into starter_nickname
  from public.ll_room_players rp
  where rp.room_id = p_room_id
    and rp.player_id = starter_player;

  for viewer_row in
    select player_id
    from public.ll_room_players
    where room_id = p_room_id
      and left_at is null
    order by seat_index
  loop
    perform public.ll_append_player_event(
      p_room_id,
      p_round_number,
      viewer_row.player_id,
      'round_started',
      '라운드 시작',
      case
        when viewer_row.player_id = starter_player then
          format('%s 라운드가 시작되었습니다. 당신이 먼저 시작합니다.', p_round_number)
        else
          format('%s 라운드가 시작되었습니다. %s님이 먼저 시작합니다.', p_round_number, coalesce(starter_nickname, '플레이어'))
      end
    );
  end loop;

  return round_state;
end;
$$;

create or replace function public.ll_finish_match_with_departure(
  p_room_id uuid,
  p_departed_player_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.ll_rooms;
  round_row public.ll_round_states;
  departed_nickname text;
  winners uuid[];
  all_players uuid[];
begin
  select * into room_row
  from public.ll_rooms
  where id = p_room_id
  for update;

  if not found then
    return;
  end if;

  select nickname_snapshot into departed_nickname
  from public.ll_room_players
  where room_id = p_room_id
    and player_id = p_departed_player_id;

  winners := coalesce(
    (
      select array_agg(player_id order by seat_index)
      from public.ll_room_players
      where room_id = p_room_id
        and left_at is null
        and player_id <> p_departed_player_id
    ),
    '{}'::uuid[]
  );

  all_players := coalesce(
    (
      select array_agg(player_id order by seat_index)
      from public.ll_room_players
      where room_id = p_room_id
    ),
    '{}'::uuid[]
  );

  update public.ll_rooms
  set
    status = 'finished',
    final_winner_ids = winners,
    last_departed_nickname = departed_nickname,
    updated_at = now()
  where id = p_room_id;

  select * into round_row
  from public.ll_round_states
  where room_id = p_room_id
  for update;

  if found then
    update public.ll_round_states
    set
      round_phase = 'match_finished',
      reveal_all_hands = true,
      round_winner_ids = winners,
      match_winner_ids = winners,
      end_reason = p_reason,
      updated_at = now()
    where room_id = p_room_id;
  end if;

  perform public.ll_upsert_player_stats(
    winners,
    winners,
    all_players,
    true
  );

  perform public.ll_append_action_log(
    p_room_id,
    coalesce(room_row.current_round, 0),
    'match_finished',
    p_departed_player_id,
    departed_nickname,
    null,
    null,
    null,
    null,
    format('%s님이 떠나 게임을 종료합니다', coalesce(departed_nickname, '다른 플레이어')),
    jsonb_build_object('reason', p_reason, 'winner_ids', winners)
  );
end;
$$;

create or replace function public.ll_resolve_inactive_forfeit(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stale_player_id uuid;
begin
  select rp.player_id into stale_player_id
  from public.ll_rooms r
  join public.ll_room_players rp
    on rp.room_id = r.id
  where r.id = p_room_id
    and r.status = 'playing'
    and rp.left_at is null
    and rp.last_active_at < now() - interval '5 minutes'
  order by rp.last_active_at asc
  limit 1;

  if stale_player_id is not null then
    update public.ll_room_players
    set left_at = coalesce(left_at, now())
    where room_id = p_room_id
      and player_id = stale_player_id;

    perform public.ll_finish_match_with_departure(p_room_id, stale_player_id, 'inactive_forfeit');
  end if;
end;
$$;

create or replace function public.ll_finish_round(
  p_room_id uuid,
  p_end_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.ll_rooms;
  round_row public.ll_round_states;
  survivors uuid[];
  winner_ids uuid[];
  all_player_ids uuid[];
  candidate_id uuid;
  max_hand smallint := -1;
  max_sum int := -1;
  candidate_hand smallint;
  candidate_sum int;
  linked_newbie_ids uuid[];
  newbie_bonus_player_id uuid;
  final_winners uuid[];
  next_starter uuid;
  winner_names text;
  final_winner_names text;
  viewer_row record;
begin
  select * into room_row
  from public.ll_rooms
  where id = p_room_id
  for update;

  select * into round_row
  from public.ll_round_states
  where room_id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  all_player_ids := public.ll_player_order(p_room_id);
  survivors := coalesce(
    (
      select array_agg(player_id order by seat_index)
      from public.ll_room_players
      where room_id = p_room_id
        and left_at is null
        and not player_id = any(round_row.eliminated_player_ids)
    ),
    '{}'::uuid[]
  );

  if coalesce(array_length(survivors, 1), 0) = 1 then
    winner_ids := survivors;
  else
    winner_ids := '{}'::uuid[];
    foreach candidate_id in array survivors loop
      candidate_hand := coalesce((public.ll_card_map_get(round_row.hands, candidate_id))[1], -1);
      candidate_sum := coalesce(
        (
          select sum(card_value)
          from unnest(public.ll_card_map_get(round_row.discard_piles, candidate_id)) card_value
        ),
        0
      );

      if candidate_hand > max_hand then
        max_hand := candidate_hand;
        max_sum := candidate_sum;
        winner_ids := array[candidate_id];
      elsif candidate_hand = max_hand then
        if candidate_sum > max_sum then
          max_sum := candidate_sum;
          winner_ids := array[candidate_id];
        elsif candidate_sum = max_sum then
          winner_ids := winner_ids || candidate_id;
        end if;
      end if;
    end loop;
  end if;

  update public.ll_room_players
  set token_count = token_count + case when player_id = any(coalesce(winner_ids, '{}'::uuid[])) then 1 else 0 end
  where room_id = p_room_id
    and left_at is null;

  linked_newbie_ids := coalesce(
    (
      select array_agg(player_id order by seat_index)
      from public.ll_room_players
      where room_id = p_room_id
        and left_at is null
        and (
          0 = any(public.ll_card_map_get(round_row.hands, player_id))
          or 0 = any(public.ll_card_map_get(round_row.discard_piles, player_id))
        )
    ),
    '{}'::uuid[]
  );

  if coalesce(array_length(linked_newbie_ids, 1), 0) = 1 then
    newbie_bonus_player_id := linked_newbie_ids[1];
    update public.ll_room_players
    set token_count = token_count + 1
    where room_id = p_room_id
      and player_id = newbie_bonus_player_id;
  end if;

  next_starter := winner_ids[1 + floor(random() * greatest(coalesce(array_length(winner_ids, 1), 1), 1))::int];

  final_winners := coalesce(
    (
      select array_agg(player_id order by seat_index)
      from public.ll_room_players
      where room_id = p_room_id
        and left_at is null
        and token_count >= room_row.target_token_count
    ),
    '{}'::uuid[]
  );

  update public.ll_round_states
  set
    round_phase = case when coalesce(array_length(final_winners, 1), 0) > 0 then 'match_finished' else 'await_next_round' end,
    reveal_all_hands = true,
    round_winner_ids = coalesce(winner_ids, '{}'::uuid[]),
    match_winner_ids = coalesce(final_winners, '{}'::uuid[]),
    next_starter_player_id = next_starter,
    end_reason = p_end_reason,
    tiebreak_sums = coalesce(
      (
        select jsonb_object_agg(player_id::text, score_sum)
        from (
          select
            rp.player_id,
            coalesce(
              (
                select sum(card_value)
                from unnest(public.ll_card_map_get(round_row.discard_piles, rp.player_id)) card_value
              ),
              0
            ) as score_sum
          from public.ll_room_players rp
          where rp.room_id = p_room_id
            and rp.left_at is null
        ) scored
      ),
      '{}'::jsonb
    ),
    updated_at = now()
  where room_id = p_room_id;

  if coalesce(array_length(final_winners, 1), 0) > 0 then
    update public.ll_rooms
    set
      status = 'finished',
      final_winner_ids = final_winners,
      updated_at = now()
    where id = p_room_id;

    perform public.ll_upsert_player_stats(
      winner_ids,
      final_winners,
      all_player_ids,
      true
    );
  else
    perform public.ll_upsert_player_stats(
      winner_ids,
      '{}'::uuid[],
      all_player_ids,
      false
    );
  end if;

  perform public.ll_append_action_log(
    p_room_id,
    round_row.round_number,
    'round_finished',
    null,
    null,
    null,
    null,
    null,
    null,
    format(
      '%s 라운드가 종료되었습니다. 승자: %s',
      round_row.round_number,
      coalesce(
        (
          select string_agg(nickname_snapshot, ', ' order by seat_index)
          from public.ll_room_players
          where room_id = p_room_id
            and player_id = any(coalesce(winner_ids, '{}'::uuid[]))
        ),
        '없음'
      )
    ),
    jsonb_build_object(
      'end_reason', p_end_reason,
      'winner_ids', winner_ids,
      'match_winner_ids', final_winners,
      'next_starter_player_id', next_starter,
      'newbie_bonus_player_id', newbie_bonus_player_id
    )
  );

  select coalesce(string_agg(nickname_snapshot, ', ' order by seat_index), '없음')
  into winner_names
  from public.ll_room_players
  where room_id = p_room_id
    and player_id = any(coalesce(winner_ids, '{}'::uuid[]));

  select coalesce(string_agg(nickname_snapshot, ', ' order by seat_index), '없음')
  into final_winner_names
  from public.ll_room_players
  where room_id = p_room_id
    and player_id = any(coalesce(final_winners, '{}'::uuid[]));

  for viewer_row in
    select player_id
    from public.ll_room_players
    where room_id = p_room_id
      and left_at is null
    order by seat_index
  loop
    perform public.ll_append_player_event(
      p_room_id,
      round_row.round_number,
      viewer_row.player_id,
      case when coalesce(array_length(final_winners, 1), 0) > 0 then 'match_finished' else 'round_finished' end,
      case when coalesce(array_length(final_winners, 1), 0) > 0 then '매치 종료' else '라운드 종료' end,
      case
        when coalesce(array_length(final_winners, 1), 0) > 0 and viewer_row.player_id = any(final_winners) then
          '당신이 최종 승자로 확정되었습니다.'
        when coalesce(array_length(final_winners, 1), 0) > 0 then
          format('매치가 종료되었습니다. 최종 승자: %s', final_winner_names)
        when viewer_row.player_id = any(winner_ids) and coalesce(array_length(winner_ids, 1), 0) = 1 then
          '당신이 이번 라운드에서 승리했습니다.'
        when viewer_row.player_id = any(winner_ids) then
          format('이번 라운드는 공동 승리입니다. 승자: %s', winner_names)
        else
          format('%s 라운드가 종료되었습니다. 승자: %s', round_row.round_number, winner_names)
      end,
      case
        when newbie_bonus_player_id = viewer_row.player_id then '전학생 보너스로 비밀 폴라로이드 1개를 추가로 받았습니다.'
        when newbie_bonus_player_id is not null then
          format(
            '%s님이 전학생 보너스를 받았습니다.',
            coalesce(
              (
                select nickname_snapshot
                from public.ll_room_players
                where room_id = p_room_id
                  and player_id = newbie_bonus_player_id
              ),
              '플레이어'
            )
          )
        else null
      end
    );
  end loop;
end;
$$;

create or replace function public.ll_advance_turn_after_action(p_room_id uuid, p_previous_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  round_row public.ll_round_states;
  next_player_id uuid;
  next_player_nickname text;
  next_hands jsonb;
  next_discards jsonb;
  next_deck smallint[];
  draw_card smallint;
  scholar_result jsonb;
  viewer_row record;
begin
  select * into round_row
  from public.ll_round_states
  where room_id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if coalesce(array_length(public.ll_player_order(p_room_id), 1), 0) - coalesce(array_length(round_row.eliminated_player_ids, 1), 0) <= 1 then
    perform public.ll_finish_round(p_room_id, 'last_player_standing');
    return;
  end if;

  if coalesce(array_length(round_row.deck_order, 1), 0) = 0 then
    perform public.ll_finish_round(p_room_id, 'deck_exhausted');
    return;
  end if;

  next_player_id := public.ll_next_alive_player(p_room_id, p_previous_player_id, round_row.eliminated_player_ids);
  next_deck := round_row.deck_order;
  draw_card := next_deck[1];
  next_deck := coalesce(next_deck[2:array_length(next_deck, 1)], '{}'::smallint[]);

  next_hands := public.ll_card_map_put(
    round_row.hands,
    next_player_id,
    public.ll_card_map_get(round_row.hands, next_player_id) || draw_card
  );
  next_discards := round_row.discard_piles;

  scholar_result := public.ll_apply_scholar_constraint(next_hands, next_discards, next_player_id);
  next_hands := scholar_result -> 'hands';
  next_discards := scholar_result -> 'discard_piles';

  if coalesce((scholar_result ->> 'scholar_forced')::boolean, false) then
    select nickname_snapshot into next_player_nickname
    from public.ll_room_players
    where room_id = p_room_id
      and player_id = next_player_id;

    perform public.ll_append_action_log(
      p_room_id,
      round_row.round_number,
      'scholar_forced',
      next_player_id,
      next_player_nickname,
      null,
      null,
      8::smallint,
      null,
      format('%s님의 전교 1등이 자동 공개되었습니다.', next_player_nickname),
      '{}'::jsonb
    );

    for viewer_row in
      select player_id
      from public.ll_room_players
      where room_id = p_room_id
        and left_at is null
      order by seat_index
    loop
      perform public.ll_append_player_event(
        p_room_id,
        round_row.round_number,
        viewer_row.player_id,
        'scholar_forced',
        '전교 1등',
        case
          when viewer_row.player_id = next_player_id then
            '전교 1등과 회장 계열 카드를 함께 들고 있어 전교 1등이 자동 공개되었습니다.'
          else
            format('%s님의 전교 1등이 자동 공개되었습니다.', coalesce(next_player_nickname, '플레이어'))
        end
      );
    end loop;
  end if;

  update public.ll_round_states
  set
    current_turn_player_id = next_player_id,
    round_phase = 'await_turn',
    deck_order = next_deck,
    hands = next_hands,
    discard_piles = next_discards,
    protected_player_ids = public.ll_uuid_array_remove(protected_player_ids, next_player_id),
    pending_input = '{}'::jsonb,
    updated_at = now()
  where room_id = p_room_id;
end;
$$;

create or replace function public.ll_create_room(
  p_player_limit int,
  p_nickname_snapshot text
)
returns public.ll_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.ll_rooms;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_player_limit not in (2, 3, 4) then
    raise exception 'INVALID_PLAYER_LIMIT';
  end if;

  insert into public.ll_rooms (
    room_code,
    host_id,
    player_limit,
    target_token_count
  )
  values (
    public.ll_random_room_code(),
    auth.uid(),
    p_player_limit,
    public.ll_target_token_count(p_player_limit)
  )
  returning * into room_row;

  insert into public.ll_room_players (
    room_id,
    player_id,
    seat_index,
    join_order,
    nickname_snapshot
  )
  values (
    room_row.id,
    auth.uid(),
    0,
    0,
    p_nickname_snapshot
  );

  return room_row;
end;
$$;

create or replace function public.ll_join_room(
  p_room_code text,
  p_nickname_snapshot text
)
returns public.ll_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.ll_rooms;
  existing_player public.ll_room_players;
  joined_count int;
  seat_value int;
  join_value int;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select * into room_row
  from public.ll_rooms
  where room_code = upper(trim(p_room_code))
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if room_row.status <> 'waiting' then
    raise exception 'ROOM_NOT_WAITING';
  end if;

  select *
  into existing_player
  from public.ll_room_players
  where room_id = room_row.id
    and player_id = auth.uid()
  for update;

  if found then
    if existing_player.left_at is null then
      raise exception 'PLAYER_ALREADY_JOINED';
    end if;

    update public.ll_room_players
    set
      ready = false,
      nickname_snapshot = p_nickname_snapshot,
      left_at = null,
      last_active_at = now()
    where room_id = room_row.id
      and player_id = auth.uid();

    update public.ll_rooms
    set
      last_departed_nickname = null,
      updated_at = now()
    where id = room_row.id
    returning * into room_row;

    return room_row;
  end if;

  select count(*) into joined_count
  from public.ll_room_players
  where room_id = room_row.id
    and left_at is null;

  if joined_count >= room_row.player_limit then
    raise exception 'ROOM_FULL';
  end if;

  select min(seat_candidate) into seat_value
  from generate_series(0, room_row.player_limit - 1) seat_candidate
  where not exists (
    select 1
    from public.ll_room_players rp
    where rp.room_id = room_row.id
      and rp.left_at is null
      and rp.seat_index = seat_candidate
  );

  select coalesce(max(join_order), -1) + 1 into join_value
  from public.ll_room_players
  where room_id = room_row.id;

  insert into public.ll_room_players (
    room_id,
    player_id,
    seat_index,
    join_order,
    nickname_snapshot
  )
  values (
    room_row.id,
    auth.uid(),
    seat_value,
    join_value,
    p_nickname_snapshot
  );

  update public.ll_rooms
  set
    last_departed_nickname = null,
    updated_at = now()
  where id = room_row.id
  returning * into room_row;

  return room_row;
end;
$$;

create or replace function public.ll_set_player_ready(
  p_room_id uuid,
  p_ready boolean
)
returns public.ll_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.ll_rooms;
begin
  select * into room_row
  from public.ll_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if room_row.status <> 'waiting' then
    raise exception 'ROOM_NOT_WAITING';
  end if;

  if room_row.host_id = auth.uid() then
    raise exception 'HOST_READY_NOT_REQUIRED';
  end if;

  update public.ll_room_players
  set
    ready = p_ready,
    last_active_at = now()
  where room_id = p_room_id
    and player_id = auth.uid()
    and left_at is null;

  if not found then
    raise exception 'PLAYER_NOT_IN_ROOM';
  end if;

  return room_row;
end;
$$;

create or replace function public.ll_start_match(p_room_id uuid)
returns public.ll_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.ll_rooms;
  joined_count int;
  ready_required_count int;
  ready_count int;
begin
  select * into room_row
  from public.ll_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if room_row.host_id <> auth.uid() then
    raise exception 'ONLY_HOST_CAN_START';
  end if;

  if room_row.status <> 'waiting' then
    raise exception 'ROOM_ALREADY_STARTED';
  end if;

  select
    count(*),
    count(*) filter (where player_id <> room_row.host_id),
    count(*) filter (where player_id <> room_row.host_id and ready)
  into joined_count, ready_required_count, ready_count
  from public.ll_room_players
  where room_id = p_room_id
    and left_at is null;

  if joined_count <> room_row.player_limit then
    raise exception 'PLAYER_LIMIT_NOT_MET';
  end if;

  if ready_count <> ready_required_count then
    raise exception 'PLAYERS_NOT_READY';
  end if;

  update public.ll_rooms
  set
    status = 'playing',
    current_round = 1,
    final_winner_ids = '{}',
    last_departed_nickname = null,
    updated_at = now()
  where id = p_room_id
  returning * into room_row;

  perform public.ll_start_round(p_room_id, 1, null);

  return room_row;
end;
$$;

create or replace function public.ll_get_room_view(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.ll_rooms;
  round_row public.ll_round_states;
  current_user_id uuid := auth.uid();
  can_view_all boolean := false;
  active_player_id uuid;
  visible_hands jsonb := '{}'::jsonb;
  hand_counts jsonb := '{}'::jsonb;
  logs jsonb := '[]'::jsonb;
  server_events jsonb := '[]'::jsonb;
  pending_input jsonb := '{}'::jsonb;
begin
  if current_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if not public.ll_is_room_member(p_room_id) then
    raise exception 'PLAYER_NOT_IN_ROOM';
  end if;

  perform public.ll_resolve_inactive_forfeit(p_room_id);

  select * into room_row
  from public.ll_rooms
  where id = p_room_id;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into round_row
  from public.ll_round_states
  where room_id = p_room_id;

  if room_row.status = 'waiting' or not found then
    select coalesce(
      jsonb_agg(to_jsonb(log_item) order by log_item.created_at desc),
      '[]'::jsonb
    )
    into logs
    from (
      select *
      from public.ll_action_logs
      where room_id = p_room_id
      order by created_at desc
      limit 20
    ) log_item;

    server_events := public.ll_get_player_events_jsonb(p_room_id, current_user_id, 8);

    return jsonb_build_object(
      'room_id', p_room_id,
      'round_number', room_row.current_round,
      'round_phase', 'dealing',
      'starter_player_id', null,
      'current_turn_player_id', null,
      'next_starter_player_id', null,
      'deck_count', 0,
      'burned_card_hidden', true,
      'reveal_all_hands', false,
      'spectator_mode', false,
      'my_hand', '[]'::jsonb,
      'hand_counts', '{}'::jsonb,
      'discard_piles', '{}'::jsonb,
      'protected_player_ids', '[]'::jsonb,
      'eliminated_player_ids', '[]'::jsonb,
      'spectator_player_ids', '[]'::jsonb,
      'round_winner_ids', '[]'::jsonb,
      'match_winner_ids', to_jsonb(room_row.final_winner_ids),
      'tiebreak_sums', '{}'::jsonb,
      'visible_hands', '{}'::jsonb,
      'server_events', server_events,
      'recent_private_message', null,
      'end_reason', null,
      'logs', logs,
      'pending_input', '{}'::jsonb
    );
  end if;

  can_view_all := round_row.reveal_all_hands
    or current_user_id = any(coalesce(round_row.spectator_player_ids, '{}'::uuid[]))
    or current_user_id = any(coalesce(round_row.eliminated_player_ids, '{}'::uuid[]));

  foreach active_player_id in array public.ll_player_order(p_room_id) loop
    hand_counts := hand_counts || jsonb_build_object(
      active_player_id::text,
      coalesce(array_length(public.ll_card_map_get(round_row.hands, active_player_id), 1), 0)
    );

    if can_view_all or active_player_id = current_user_id then
      visible_hands := visible_hands || jsonb_build_object(
        active_player_id::text,
        to_jsonb(public.ll_card_map_get(round_row.hands, active_player_id))
      );
    end if;
  end loop;

  if round_row.round_phase = 'await_broadcaster_resolution'
    and current_user_id = round_row.current_turn_player_id
    and coalesce(round_row.pending_input ->> 'kind', '') = 'resolve_broadcaster'
  then
    pending_input := round_row.pending_input;
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(log_item) order by log_item.created_at desc),
    '[]'::jsonb
  )
  into logs
  from (
    select *
    from public.ll_action_logs
    where room_id = p_room_id
    order by created_at desc
    limit 30
  ) log_item;

  server_events := public.ll_get_player_events_jsonb(p_room_id, current_user_id, 8);

  return jsonb_build_object(
    'room_id', p_room_id,
    'round_number', round_row.round_number,
    'round_phase', round_row.round_phase,
    'starter_player_id', round_row.starter_player_id,
    'current_turn_player_id', round_row.current_turn_player_id,
    'next_starter_player_id', round_row.next_starter_player_id,
    'deck_count', coalesce(array_length(round_row.deck_order, 1), 0),
    'burned_card_hidden', true,
    'reveal_all_hands', round_row.reveal_all_hands,
    'spectator_mode', current_user_id = any(coalesce(round_row.spectator_player_ids, '{}'::uuid[]))
      or current_user_id = any(coalesce(round_row.eliminated_player_ids, '{}'::uuid[])),
    'my_hand', to_jsonb(public.ll_card_map_get(round_row.hands, current_user_id)),
    'hand_counts', hand_counts,
    'discard_piles', round_row.discard_piles,
    'protected_player_ids', to_jsonb(round_row.protected_player_ids),
    'eliminated_player_ids', to_jsonb(round_row.eliminated_player_ids),
    'spectator_player_ids', to_jsonb(round_row.spectator_player_ids),
    'round_winner_ids', to_jsonb(round_row.round_winner_ids),
    'match_winner_ids', to_jsonb(
      case
        when room_row.status = 'finished' then room_row.final_winner_ids
        else round_row.match_winner_ids
      end
    ),
    'tiebreak_sums', round_row.tiebreak_sums,
    'visible_hands', visible_hands,
    'server_events', server_events,
    'recent_private_message', null,
    'end_reason', round_row.end_reason,
    'logs', logs,
    'pending_input', pending_input
  );
end;
$$;

create or replace function public.ll_play_card(
  p_room_id uuid,
  p_played_card smallint,
  p_target_player_id uuid default null,
  p_guessed_card smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.ll_rooms;
  round_row public.ll_round_states;
  actor_id uuid := auth.uid();
  actor_nickname text;
  target_nickname text;
  actor_hand smallint[];
  actor_remaining_hand smallint[];
  target_hand smallint[];
  actor_discard smallint[];
  target_discard smallint[];
  valid_target_ids uuid[];
  private_result jsonb := null;
  helper_result jsonb;
  remaining_options smallint[];
  draw_card smallint;
  next_deck smallint[];
  actor_card smallint;
  target_card smallint;
  public_action_message text := '';
  viewer_row record;
  viewer_title text := '서버 메세지';
  viewer_message text := '';
  viewer_detail text := null;
  viewer_payload jsonb := '{}'::jsonb;
  monitor_correct boolean := false;
  athlete_loser_player_id uuid := null;
  vice_target_eliminated boolean := false;
begin
  if actor_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  perform public.ll_resolve_inactive_forfeit(p_room_id);

  select * into room_row
  from public.ll_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if room_row.status <> 'playing' then
    raise exception 'ROOM_NOT_PLAYING';
  end if;

  select * into round_row
  from public.ll_round_states
  where room_id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if round_row.round_phase <> 'await_turn' then
    raise exception 'BROADCASTER_PENDING';
  end if;

  if round_row.current_turn_player_id <> actor_id then
    raise exception 'NOT_YOUR_TURN';
  end if;

  select nickname_snapshot into actor_nickname
  from public.ll_room_players
  where room_id = p_room_id
    and player_id = actor_id;

  actor_hand := public.ll_card_map_get(round_row.hands, actor_id);
  if not p_played_card = any(actor_hand) then
    raise exception 'CARD_NOT_IN_HAND';
  end if;

  actor_remaining_hand := public.ll_remove_first_card(actor_hand, p_played_card);
  actor_discard := public.ll_card_map_get(round_row.discard_piles, actor_id) || p_played_card;

  update public.ll_room_players
  set last_active_at = now()
  where room_id = p_room_id
    and player_id = actor_id;

  round_row.hands := public.ll_card_map_put(round_row.hands, actor_id, actor_remaining_hand);
  round_row.discard_piles := public.ll_card_map_put(round_row.discard_piles, actor_id, actor_discard);
  round_row.pending_input := '{}'::jsonb;

  if p_played_card = 1 then
    valid_target_ids := coalesce(
      (
        select array_agg(player_id order by seat_index)
        from public.ll_room_players
        where room_id = p_room_id
          and left_at is null
          and player_id <> actor_id
          and not player_id = any(round_row.eliminated_player_ids)
          and not player_id = any(round_row.protected_player_ids)
      ),
      '{}'::uuid[]
    );

    if coalesce(array_length(valid_target_ids, 1), 0) > 0 and p_target_player_id is null then
      raise exception 'TARGET_REQUIRED';
    end if;
    if p_target_player_id is not null and not p_target_player_id = any(valid_target_ids) then
      raise exception 'INVALID_TARGET';
    end if;
    if p_target_player_id is not null and p_guessed_card is null then
      raise exception 'GUESS_REQUIRED';
    end if;
    if p_guessed_card = 1 then
      raise exception 'INVALID_GUESS';
    end if;

    if p_target_player_id is not null then
      select nickname_snapshot into target_nickname
      from public.ll_room_players
      where room_id = p_room_id
        and player_id = p_target_player_id;

      target_hand := public.ll_card_map_get(round_row.hands, p_target_player_id);
      monitor_correct := coalesce(target_hand[1], -1) = p_guessed_card;
      if monitor_correct then
        helper_result := public.ll_eliminate_player(
          round_row.hands,
          round_row.discard_piles,
          round_row.eliminated_player_ids,
          round_row.spectator_player_ids,
          p_target_player_id
        );
        round_row.hands := helper_result -> 'hands';
        round_row.discard_piles := helper_result -> 'discard_piles';
        round_row.eliminated_player_ids := array(
          select value::uuid
          from jsonb_array_elements_text(helper_result -> 'eliminated_player_ids') value
        );
        round_row.spectator_player_ids := array(
          select value::uuid
          from jsonb_array_elements_text(helper_result -> 'spectator_player_ids') value
        );
      end if;
    end if;
  elsif p_played_card = 2 then
    valid_target_ids := coalesce(
      (
        select array_agg(player_id order by seat_index)
        from public.ll_room_players
        where room_id = p_room_id
          and left_at is null
          and player_id <> actor_id
          and not player_id = any(round_row.eliminated_player_ids)
          and not player_id = any(round_row.protected_player_ids)
      ),
      '{}'::uuid[]
    );

    if coalesce(array_length(valid_target_ids, 1), 0) > 0 and p_target_player_id is null then
      raise exception 'TARGET_REQUIRED';
    end if;
    if p_target_player_id is not null and not p_target_player_id = any(valid_target_ids) then
      raise exception 'INVALID_TARGET';
    end if;

    if p_target_player_id is not null then
      select nickname_snapshot into target_nickname
      from public.ll_room_players
      where room_id = p_room_id
        and player_id = p_target_player_id;

      target_hand := public.ll_card_map_get(round_row.hands, p_target_player_id);
      private_result := jsonb_build_object(
        'type', 'counselor',
        'title', '상담 선생님',
        'message', '지목한 플레이어의 손패를 확인했습니다.',
        'card_id', target_hand[1]
      );
    end if;
  elsif p_played_card = 3 then
    valid_target_ids := coalesce(
      (
        select array_agg(player_id order by seat_index)
        from public.ll_room_players
        where room_id = p_room_id
          and left_at is null
          and player_id <> actor_id
          and not player_id = any(round_row.eliminated_player_ids)
          and not player_id = any(round_row.protected_player_ids)
      ),
      '{}'::uuid[]
    );

    if coalesce(array_length(valid_target_ids, 1), 0) > 0 and p_target_player_id is null then
      raise exception 'TARGET_REQUIRED';
    end if;
    if p_target_player_id is not null and not p_target_player_id = any(valid_target_ids) then
      raise exception 'INVALID_TARGET';
    end if;

    if p_target_player_id is not null then
      select nickname_snapshot into target_nickname
      from public.ll_room_players
      where room_id = p_room_id
        and player_id = p_target_player_id;

      target_hand := public.ll_card_map_get(round_row.hands, p_target_player_id);
      actor_card := coalesce(actor_remaining_hand[1], -1);
      target_card := coalesce(target_hand[1], -1);

      if actor_card < target_card then
        helper_result := public.ll_eliminate_player(
          round_row.hands,
          round_row.discard_piles,
          round_row.eliminated_player_ids,
          round_row.spectator_player_ids,
          actor_id
        );
        round_row.hands := helper_result -> 'hands';
        round_row.discard_piles := helper_result -> 'discard_piles';
        round_row.eliminated_player_ids := array(
          select value::uuid
          from jsonb_array_elements_text(helper_result -> 'eliminated_player_ids') value
        );
        round_row.spectator_player_ids := array(
          select value::uuid
          from jsonb_array_elements_text(helper_result -> 'spectator_player_ids') value
        );
      elsif actor_card > target_card then
        helper_result := public.ll_eliminate_player(
          round_row.hands,
          round_row.discard_piles,
          round_row.eliminated_player_ids,
          round_row.spectator_player_ids,
          p_target_player_id
        );
        round_row.hands := helper_result -> 'hands';
        round_row.discard_piles := helper_result -> 'discard_piles';
        round_row.eliminated_player_ids := array(
          select value::uuid
          from jsonb_array_elements_text(helper_result -> 'eliminated_player_ids') value
        );
        round_row.spectator_player_ids := array(
          select value::uuid
          from jsonb_array_elements_text(helper_result -> 'spectator_player_ids') value
        );
      end if;

      private_result := jsonb_build_object(
        'type', 'athlete',
        'title', '운동부 에이스',
        'message', '비공개 비교 결과를 확인했습니다.',
        'actor_card_id', actor_card,
        'target_card_id', target_card,
        'loser_player_id', case
          when actor_card < target_card then actor_id
          when actor_card > target_card then p_target_player_id
          else null
        end
      );
      athlete_loser_player_id := case
        when actor_card < target_card then actor_id
        when actor_card > target_card then p_target_player_id
        else null
      end;
    end if;
  elsif p_played_card = 4 then
    round_row.protected_player_ids := public.ll_uuid_array_add(round_row.protected_player_ids, actor_id);
  elsif p_played_card = 5 then
    valid_target_ids := public.ll_uuid_array_add(
      coalesce(
        (
          select array_agg(player_id order by seat_index)
          from public.ll_room_players
          where room_id = p_room_id
            and left_at is null
            and player_id <> actor_id
            and not player_id = any(round_row.eliminated_player_ids)
            and not player_id = any(round_row.protected_player_ids)
        ),
        '{}'::uuid[]
      ),
      actor_id
    );

    if p_target_player_id is null then
      raise exception 'TARGET_REQUIRED';
    end if;
    if not p_target_player_id = any(valid_target_ids) then
      raise exception 'INVALID_TARGET';
    end if;

    select nickname_snapshot into target_nickname
    from public.ll_room_players
    where room_id = p_room_id
      and player_id = p_target_player_id;

    target_hand := public.ll_card_map_get(round_row.hands, p_target_player_id);
    target_discard := public.ll_card_map_get(round_row.discard_piles, p_target_player_id) || target_hand;
    round_row.discard_piles := public.ll_card_map_put(round_row.discard_piles, p_target_player_id, target_discard);

    vice_target_eliminated := coalesce(target_hand[1], -1) = 9;
    if vice_target_eliminated then
      helper_result := public.ll_eliminate_player(
        round_row.hands,
        round_row.discard_piles,
        round_row.eliminated_player_ids,
        round_row.spectator_player_ids,
        p_target_player_id
      );
      round_row.hands := helper_result -> 'hands';
      round_row.discard_piles := helper_result -> 'discard_piles';
      round_row.eliminated_player_ids := array(
        select value::uuid
        from jsonb_array_elements_text(helper_result -> 'eliminated_player_ids') value
      );
      round_row.spectator_player_ids := array(
        select value::uuid
        from jsonb_array_elements_text(helper_result -> 'spectator_player_ids') value
      );
    else
      next_deck := round_row.deck_order;
      if coalesce(array_length(next_deck, 1), 0) > 0 then
        draw_card := next_deck[1];
        next_deck := coalesce(next_deck[2:array_length(next_deck, 1)], '{}'::smallint[]);
      else
        draw_card := round_row.burned_card;
      end if;

      round_row.deck_order := next_deck;
      round_row.hands := public.ll_card_map_put(round_row.hands, p_target_player_id, array[draw_card]);

      helper_result := public.ll_apply_scholar_constraint(round_row.hands, round_row.discard_piles, p_target_player_id);
      round_row.hands := helper_result -> 'hands';
      round_row.discard_piles := helper_result -> 'discard_piles';
    end if;
  elsif p_played_card = 6 then
    next_deck := round_row.deck_order;
    remaining_options := actor_remaining_hand;
    if coalesce(array_length(next_deck, 1), 0) > 0 then
      remaining_options := remaining_options || next_deck[1];
      next_deck := coalesce(next_deck[2:array_length(next_deck, 1)], '{}'::smallint[]);
    end if;
    if coalesce(array_length(next_deck, 1), 0) > 0 then
      remaining_options := remaining_options || next_deck[1];
      next_deck := coalesce(next_deck[2:array_length(next_deck, 1)], '{}'::smallint[]);
    end if;

    round_row.hands := public.ll_card_map_put(round_row.hands, actor_id, '{}'::smallint[]);
    round_row.deck_order := next_deck;
    round_row.round_phase := 'await_broadcaster_resolution';
    round_row.pending_input := jsonb_build_object(
      'kind', 'resolve_broadcaster',
      'pending_card_id', 6,
      'player_id', actor_id,
      'broadcaster_options', to_jsonb(remaining_options)
    );
  elsif p_played_card = 7 then
    valid_target_ids := coalesce(
      (
        select array_agg(player_id order by seat_index)
        from public.ll_room_players
        where room_id = p_room_id
          and left_at is null
          and player_id <> actor_id
          and not player_id = any(round_row.eliminated_player_ids)
          and not player_id = any(round_row.protected_player_ids)
      ),
      '{}'::uuid[]
    );

    if coalesce(array_length(valid_target_ids, 1), 0) > 0 and p_target_player_id is null then
      raise exception 'TARGET_REQUIRED';
    end if;
    if p_target_player_id is not null and not p_target_player_id = any(valid_target_ids) then
      raise exception 'INVALID_TARGET';
    end if;

    if p_target_player_id is not null then
      select nickname_snapshot into target_nickname
      from public.ll_room_players
      where room_id = p_room_id
        and player_id = p_target_player_id;

      target_hand := public.ll_card_map_get(round_row.hands, p_target_player_id);
      round_row.hands := public.ll_card_map_put(round_row.hands, actor_id, target_hand);
      round_row.hands := public.ll_card_map_put(round_row.hands, p_target_player_id, actor_remaining_hand);

      helper_result := public.ll_apply_scholar_constraint(round_row.hands, round_row.discard_piles, actor_id);
      round_row.hands := helper_result -> 'hands';
      round_row.discard_piles := helper_result -> 'discard_piles';

      helper_result := public.ll_apply_scholar_constraint(round_row.hands, round_row.discard_piles, p_target_player_id);
      round_row.hands := helper_result -> 'hands';
      round_row.discard_piles := helper_result -> 'discard_piles';
    end if;
  elsif p_played_card = 9 then
    helper_result := public.ll_eliminate_player(
      round_row.hands,
      round_row.discard_piles,
      round_row.eliminated_player_ids,
      round_row.spectator_player_ids,
      actor_id
    );
    round_row.hands := helper_result -> 'hands';
    round_row.discard_piles := helper_result -> 'discard_piles';
    round_row.eliminated_player_ids := array(
      select value::uuid
      from jsonb_array_elements_text(helper_result -> 'eliminated_player_ids') value
    );
    round_row.spectator_player_ids := array(
      select value::uuid
      from jsonb_array_elements_text(helper_result -> 'spectator_player_ids') value
    );
  end if;

  if p_played_card <> 6 then
    helper_result := public.ll_apply_scholar_constraint(round_row.hands, round_row.discard_piles, actor_id);
    round_row.hands := helper_result -> 'hands';
    round_row.discard_piles := helper_result -> 'discard_piles';
  end if;

  update public.ll_round_states
  set
    round_phase = round_row.round_phase,
    current_turn_player_id = round_row.current_turn_player_id,
    deck_order = round_row.deck_order,
    hands = round_row.hands,
    discard_piles = round_row.discard_piles,
    protected_player_ids = round_row.protected_player_ids,
    eliminated_player_ids = round_row.eliminated_player_ids,
    spectator_player_ids = round_row.spectator_player_ids,
    pending_input = round_row.pending_input,
    updated_at = now()
  where room_id = p_room_id;

  public_action_message := case
    when p_played_card = 1 and p_target_player_id is null then
      format('%s님이 선도부원을 공개했지만 지목할 대상이 없었습니다.', actor_nickname)
    when p_played_card = 1 and monitor_correct then
      format(
        '%s님이 %s님의 카드를 %s(으)로 맞혀 즉시 탈락시켰습니다.',
        actor_nickname,
        target_nickname,
        public.ll_card_name(p_guessed_card)
      )
    when p_played_card = 1 then
      format(
        '%s님이 %s님의 카드를 %s(으)로 추측했습니다.',
        actor_nickname,
        target_nickname,
        public.ll_card_name(p_guessed_card)
      )
    when p_played_card = 2 and p_target_player_id is null then
      format('%s님이 상담 선생님을 공개했지만 확인할 대상이 없었습니다.', actor_nickname)
    when p_played_card = 2 then
      format('%s님이 %s님의 카드를 확인했습니다.', actor_nickname, target_nickname)
    when p_played_card = 3 and p_target_player_id is null then
      format('%s님이 운동부 에이스를 공개했지만 비교할 대상이 없었습니다.', actor_nickname)
    when p_played_card = 3 then
      format('%s님과 %s님이 서로의 카드를 확인합니다.', actor_nickname, target_nickname)
    when p_played_card = 4 then
      format('%s님이 다음 차례 전까지 보호 상태가 됩니다.', actor_nickname)
    when p_played_card = 5 and p_target_player_id = actor_id and vice_target_eliminated then
      format('%s님이 자신의 카드를 버렸고 짝사랑이 공개되어 즉시 탈락했습니다.', actor_nickname)
    when p_played_card = 5 and p_target_player_id = actor_id then
      format('%s님이 자신의 카드를 버리고 새 카드를 뽑았습니다.', actor_nickname)
    when p_played_card = 5 and vice_target_eliminated then
      format('%s님이 %s님의 카드를 버리게 했고 짝사랑이 공개되어 즉시 탈락했습니다.', actor_nickname, target_nickname)
    when p_played_card = 5 then
      format('%s님이 %s님의 카드를 버리고 새 카드를 뽑게 했습니다.', actor_nickname, target_nickname)
    when p_played_card = 6 then
      format('%s님이 방송부장 효과로 카드 3장을 확인합니다.', actor_nickname)
    when p_played_card = 7 and p_target_player_id is null then
      format('%s님이 전교 회장을 공개했지만 교환할 대상이 없었습니다.', actor_nickname)
    when p_played_card = 7 then
      format('%s님이 %s님과 손패를 교환했습니다.', actor_nickname, target_nickname)
    when p_played_card = 8 then
      format('%s님이 전교 1등을 공개했습니다.', actor_nickname)
    when p_played_card = 9 then
      format('%s님이 짝사랑을 공개해 즉시 탈락했습니다.', actor_nickname)
    else
      format('%s님이 %s 카드를 공개했습니다.', actor_nickname, public.ll_card_name(p_played_card))
  end;

  perform public.ll_append_action_log(
    p_room_id,
    round_row.round_number,
    'play_card',
    actor_id,
    actor_nickname,
    p_target_player_id,
    target_nickname,
    p_played_card,
    p_guessed_card,
    public_action_message,
    jsonb_build_object('target_player_id', p_target_player_id)
  );

  for viewer_row in
    select player_id
    from public.ll_room_players
    where room_id = p_room_id
      and left_at is null
    order by seat_index
  loop
    viewer_title := public.ll_card_name(p_played_card);
    viewer_message := public_action_message;
    viewer_detail := null;
    viewer_payload := '{}'::jsonb;

    if p_played_card = 1 then
      if p_target_player_id is null then
        viewer_message := case
          when viewer_row.player_id = actor_id then '지목할 대상이 없어 선도부원 효과가 넘어갔습니다.'
          else format('%s님이 선도부원을 공개했지만 지목할 대상이 없었습니다.', actor_nickname)
        end;
      elsif viewer_row.player_id = actor_id then
        viewer_message := case
          when monitor_correct then format('%s님의 카드를 %s(으)로 맞혀 즉시 탈락시켰습니다.', target_nickname, public.ll_card_name(p_guessed_card))
          else format('%s님의 카드를 %s(으)로 추측했지만 빗나갔습니다.', target_nickname, public.ll_card_name(p_guessed_card))
        end;
      elsif viewer_row.player_id = p_target_player_id then
        viewer_message := case
          when monitor_correct then format('%s님이 당신의 카드를 %s(으)로 맞혀 당신이 탈락했습니다.', actor_nickname, public.ll_card_name(p_guessed_card))
          else format('%s님이 당신의 카드를 %s(으)로 추측했지만 빗나갔습니다.', actor_nickname, public.ll_card_name(p_guessed_card))
        end;
      else
        viewer_message := case
          when monitor_correct then format('%s님이 %s님의 카드를 %s(으)로 맞혀 즉시 탈락시켰습니다.', actor_nickname, target_nickname, public.ll_card_name(p_guessed_card))
          else format('%s님이 %s님의 카드를 %s(으)로 추측했습니다.', actor_nickname, target_nickname, public.ll_card_name(p_guessed_card))
        end;
      end if;
    elsif p_played_card = 2 then
      if p_target_player_id is null then
        viewer_message := case
          when viewer_row.player_id = actor_id then '확인할 대상이 없어 상담 선생님 효과가 넘어갔습니다.'
          else format('%s님이 상담 선생님을 공개했지만 확인할 대상이 없었습니다.', actor_nickname)
        end;
      elsif viewer_row.player_id = actor_id then
        viewer_message := format('%s님의 카드를 확인했습니다.', target_nickname);
        viewer_payload := jsonb_build_object(
          'type', 'counselor',
          'title', '상담 선생님',
          'message', format('%s님의 카드를 확인했습니다.', target_nickname),
          'card_id', target_hand[1]
        );
      elsif viewer_row.player_id = p_target_player_id then
        viewer_message := format('%s님이 당신 카드를 확인합니다.', actor_nickname);
      else
        viewer_message := format('%s님이 %s님의 카드를 확인합니다.', actor_nickname, target_nickname);
      end if;
    elsif p_played_card = 3 then
      if p_target_player_id is null then
        viewer_message := case
          when viewer_row.player_id = actor_id then '비교할 대상이 없어 운동부 에이스 효과가 넘어갔습니다.'
          else format('%s님이 운동부 에이스를 공개했지만 비교할 대상이 없었습니다.', actor_nickname)
        end;
      elsif viewer_row.player_id = actor_id then
        viewer_message := case
          when athlete_loser_player_id = actor_id then format('%s님과 손패 숫자를 비교했고 내가 낮아 탈락했습니다.', target_nickname)
          when athlete_loser_player_id = p_target_player_id then format('%s님과 손패 숫자를 비교했고 상대가 낮아 탈락했습니다.', target_nickname)
          else format('%s님과 손패 숫자를 비교했지만 같은 숫자였습니다.', target_nickname)
        end;
        viewer_payload := jsonb_build_object(
          'type', 'athlete',
          'title', '운동부 에이스',
          'message', format('%s님과 비공개 비교 결과를 확인했습니다.', target_nickname),
          'actor_card_id', actor_card,
          'target_card_id', target_card,
          'loser_player_id', athlete_loser_player_id
        );
      elsif viewer_row.player_id = p_target_player_id then
        viewer_message := case
          when athlete_loser_player_id = p_target_player_id then format('%s님과 손패 숫자를 비교했고 내가 낮아 탈락했습니다.', actor_nickname)
          when athlete_loser_player_id = actor_id then format('%s님과 손패 숫자를 비교했고 상대가 낮아 탈락했습니다.', actor_nickname)
          else format('%s님과 손패 숫자를 비교했지만 같은 숫자였습니다.', actor_nickname)
        end;
        viewer_payload := jsonb_build_object(
          'type', 'athlete',
          'title', '운동부 에이스',
          'message', format('%s님과 비공개 비교 결과를 확인했습니다.', actor_nickname),
          'actor_card_id', actor_card,
          'target_card_id', target_card,
          'loser_player_id', athlete_loser_player_id
        );
      else
        viewer_message := format('%s님과 %s님이 서로의 카드를 확인합니다.', actor_nickname, target_nickname);
      end if;
    elsif p_played_card = 4 then
      viewer_message := case
        when viewer_row.player_id = actor_id then '다음 내 차례 전까지 보호 상태가 됩니다.'
        else format('%s님이 다음 차례 전까지 보호 상태가 됩니다.', actor_nickname)
      end;
    elsif p_played_card = 5 then
      if p_target_player_id = actor_id then
        viewer_message := case
          when viewer_row.player_id = actor_id and vice_target_eliminated then '자신의 카드를 버렸고 짝사랑이 공개되어 즉시 탈락했습니다.'
          when viewer_row.player_id = actor_id then '자신의 카드를 버리고 새 카드를 뽑았습니다.'
          when vice_target_eliminated then format('%s님이 자신의 카드를 버렸고 짝사랑이 공개되어 즉시 탈락했습니다.', actor_nickname)
          else format('%s님이 자신의 카드를 버리고 새 카드를 뽑았습니다.', actor_nickname)
        end;
      else
        viewer_message := case
          when viewer_row.player_id = actor_id and vice_target_eliminated then
            format('%s님의 카드를 버리게 했고 짝사랑이 공개되어 즉시 탈락했습니다.', target_nickname)
          when viewer_row.player_id = actor_id then
            format('%s님의 카드를 버리고 새 카드를 뽑게 했습니다.', target_nickname)
          when viewer_row.player_id = p_target_player_id and vice_target_eliminated then
            format('%s님이 당신의 카드를 버리게 했고 짝사랑이 공개되어 당신이 탈락했습니다.', actor_nickname)
          when viewer_row.player_id = p_target_player_id then
            format('%s님이 당신의 카드를 버리고 새 카드를 뽑게 했습니다.', actor_nickname)
          when vice_target_eliminated then
            format('%s님이 %s님의 카드를 버리게 했고 짝사랑이 공개되어 즉시 탈락했습니다.', actor_nickname, target_nickname)
          else
            format('%s님이 %s님의 카드를 버리고 새 카드를 뽑게 했습니다.', actor_nickname, target_nickname)
        end;
      end if;
    elsif p_played_card = 6 then
      viewer_message := case
        when viewer_row.player_id = actor_id then '덱에서 카드를 더 확인했습니다. 남길 카드와 순서를 정해 주세요.'
        else format('%s님이 방송부장 효과를 정리하고 있습니다.', actor_nickname)
      end;
    elsif p_played_card = 7 then
      if p_target_player_id is null then
        viewer_message := case
          when viewer_row.player_id = actor_id then '교환할 대상이 없어 전교 회장 효과가 넘어갔습니다.'
          else format('%s님이 전교 회장을 공개했지만 교환할 대상이 없었습니다.', actor_nickname)
        end;
      elsif viewer_row.player_id = actor_id then
        viewer_message := format('%s님과 손패를 교환했습니다.', target_nickname);
      elsif viewer_row.player_id = p_target_player_id then
        viewer_message := format('%s님이 당신과 손패를 교환했습니다.', actor_nickname);
      else
        viewer_message := format('%s님이 %s님과 손패를 교환했습니다.', actor_nickname, target_nickname);
      end if;
    elsif p_played_card = 8 then
      viewer_message := case
        when viewer_row.player_id = actor_id then '전교 1등을 공개했습니다.'
        else format('%s님이 전교 1등을 공개했습니다.', actor_nickname)
      end;
    elsif p_played_card = 9 then
      viewer_message := case
        when viewer_row.player_id = actor_id then '짝사랑이 공개되어 즉시 탈락했습니다.'
        else format('%s님의 짝사랑이 공개되어 즉시 탈락했습니다.', actor_nickname)
      end;
    else
      viewer_message := case
        when viewer_row.player_id = actor_id then format('%s을(를) 공개했습니다.', public.ll_card_name(p_played_card))
        else format('%s님이 %s을(를) 공개했습니다.', actor_nickname, public.ll_card_name(p_played_card))
      end;
    end if;

    perform public.ll_append_player_event(
      p_room_id,
      round_row.round_number,
      viewer_row.player_id,
      'play_card',
      viewer_title,
      viewer_message,
      viewer_detail,
      viewer_payload
    );
  end loop;

  if p_played_card <> 6 then
    perform public.ll_advance_turn_after_action(p_room_id, actor_id);
  end if;

  return jsonb_build_object(
    'room', (select to_jsonb(r) from public.ll_rooms r where r.id = p_room_id),
    'view', public.ll_get_room_view(p_room_id),
    'private_result', private_result
  );
end;
$$;

drop function if exists public.ll_resolve_broadcaster(uuid, smallint, smallint[]);
drop function if exists public.ll_resolve_broadcaster(uuid, integer, integer[]);

create or replace function public.ll_resolve_broadcaster(
  p_room_id uuid,
  p_kept_card integer,
  p_bottom_order integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  round_row public.ll_round_states;
  current_user_id uuid := auth.uid();
  current_user_nickname text;
  options smallint[];
  remaining_cards smallint[];
  normalized_bottom_order smallint[];
  next_hands jsonb;
  next_discards jsonb;
  helper_result jsonb;
begin
  if current_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  perform public.ll_resolve_inactive_forfeit(p_room_id);

  select * into round_row
  from public.ll_round_states
  where room_id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if round_row.round_phase <> 'await_broadcaster_resolution' then
    raise exception 'BROADCASTER_PENDING';
  end if;

  if round_row.current_turn_player_id <> current_user_id then
    raise exception 'ONLY_PENDING_PLAYER_CAN_RESOLVE_BROADCASTER';
  end if;

  options := coalesce(
    (
      select array_agg(value::smallint order by ordinality)
      from jsonb_array_elements_text(round_row.pending_input -> 'broadcaster_options')
        with ordinality as option_items(value, ordinality)
    ),
    '{}'::smallint[]
  );

  if not p_kept_card = any(options) then
    raise exception 'CARD_NOT_IN_HAND';
  end if;

  remaining_cards := public.ll_remove_first_card(options, p_kept_card::smallint);
  normalized_bottom_order := coalesce(
    (
      select array_agg(item::smallint order by ordinality)
      from unnest(coalesce(p_bottom_order, '{}'::integer[])) with ordinality as bottom_items(item, ordinality)
    ),
    '{}'::smallint[]
  );

  if not public.ll_array_contains_same_cards(remaining_cards, normalized_bottom_order) then
    raise exception 'INVALID_TARGET';
  end if;

  next_hands := public.ll_card_map_put(round_row.hands, current_user_id, array[p_kept_card::smallint]);
  next_discards := round_row.discard_piles;
  helper_result := public.ll_apply_scholar_constraint(next_hands, next_discards, current_user_id);

  select nickname_snapshot into current_user_nickname
  from public.ll_room_players
  where room_id = p_room_id
    and player_id = current_user_id;

  update public.ll_round_states
  set
    round_phase = 'await_turn',
    deck_order = coalesce(deck_order, '{}'::smallint[]) || normalized_bottom_order,
    hands = helper_result -> 'hands',
    discard_piles = helper_result -> 'discard_piles',
    pending_input = '{}'::jsonb,
    updated_at = now()
  where room_id = p_room_id;

  perform public.ll_append_action_log(
    p_room_id,
    round_row.round_number,
    'resolve_broadcaster',
    current_user_id,
    current_user_nickname,
    null,
    null,
    6::smallint,
    null,
    format('%s님이 방송부장 정리를 마쳤습니다.', current_user_nickname),
    jsonb_build_object('kept_card', p_kept_card)
  );

  perform public.ll_advance_turn_after_action(p_room_id, current_user_id);

  return jsonb_build_object(
    'room', (select to_jsonb(r) from public.ll_rooms r where r.id = p_room_id)
  );
end;
$$;

create or replace function public.ll_advance_to_next_round(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.ll_rooms;
  round_row public.ll_round_states;
  next_round_number int;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;

  perform public.ll_resolve_inactive_forfeit(p_room_id);

  select * into room_row
  from public.ll_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if room_row.host_id <> auth.uid() then
    raise exception 'ONLY_HOST_CAN_ADVANCE';
  end if;

  if room_row.status <> 'playing' then
    raise exception 'ROOM_NOT_PLAYING';
  end if;

  select * into round_row
  from public.ll_round_states
  where room_id = p_room_id
  for update;

  if round_row.round_phase <> 'await_next_round' then
    raise exception 'NEXT_ROUND_NOT_READY';
  end if;

  next_round_number := round_row.round_number + 1;

  update public.ll_rooms
  set
    current_round = next_round_number,
    updated_at = now()
  where id = p_room_id;

  perform public.ll_start_round(p_room_id, next_round_number, round_row.next_starter_player_id);

  return jsonb_build_object(
    'room', (select to_jsonb(r) from public.ll_rooms r where r.id = p_room_id),
    'view', public.ll_get_room_view(p_room_id)
  );
end;
$$;

create or replace function public.ll_touch_player_activity(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ll_room_players
  set last_active_at = now()
  where room_id = p_room_id
    and player_id = auth.uid()
    and left_at is null;

  perform public.ll_resolve_inactive_forfeit(p_room_id);
end;
$$;

create or replace function public.ll_leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.ll_rooms;
  remaining_host uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select * into room_row
  from public.ll_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if room_row.status = 'playing' then
    update public.ll_room_players
    set left_at = coalesce(left_at, now())
    where room_id = p_room_id
      and player_id = auth.uid();

    perform public.ll_finish_match_with_departure(p_room_id, auth.uid(), 'player_left');
    return;
  end if;

  delete from public.ll_room_players
  where room_id = p_room_id
    and player_id = auth.uid();

  if room_row.host_id = auth.uid() then
    select rp.player_id into remaining_host
    from public.ll_room_players rp
    where rp.room_id = p_room_id
      and rp.left_at is null
    order by rp.join_order
    limit 1;

    if remaining_host is null then
      delete from public.ll_rooms where id = p_room_id;
      return;
    end if;

    update public.ll_rooms
    set host_id = remaining_host, updated_at = now()
    where id = p_room_id;
  elsif not exists (
    select 1
    from public.ll_room_players
    where room_id = p_room_id
      and left_at is null
  ) then
    delete from public.ll_rooms where id = p_room_id;
  end if;
end;
$$;

create or replace function public.ll_reset_room(p_room_id uuid)
returns public.ll_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.ll_rooms;
begin
  select * into room_row
  from public.ll_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if room_row.host_id <> auth.uid() then
    raise exception 'ONLY_HOST_CAN_ADVANCE';
  end if;

  if room_row.status <> 'finished' then
    raise exception 'ROOM_NOT_FINISHED';
  end if;

  update public.ll_rooms
  set
    status = 'waiting',
    current_round = 0,
    final_winner_ids = '{}',
    last_departed_nickname = null,
    updated_at = now()
  where id = p_room_id
  returning * into room_row;

  delete from public.ll_room_players
  where room_id = p_room_id
    and left_at is not null;

  update public.ll_room_players
  set
    ready = false,
    token_count = 0,
    last_active_at = now()
  where room_id = p_room_id;

  delete from public.ll_round_states
  where room_id = p_room_id;

  perform public.ll_append_action_log(
    p_room_id,
    0,
    'room_reset',
    auth.uid(),
    (select nickname_snapshot from public.ll_room_players where room_id = p_room_id and player_id = auth.uid()),
    null,
    null,
    null,
    null,
    'Room이 초기화되었습니다.',
    '{}'::jsonb
  );

  return room_row;
end;
$$;

create or replace function public.ll_cleanup_stale_finished_rooms()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int := 0;
begin
  with deleted_finished as (
    delete from public.ll_rooms
    where status = 'finished'
      and updated_at < now() - interval '12 hours'
    returning 1
  ),
  deleted_waiting as (
    delete from public.ll_rooms
    where status = 'waiting'
      and updated_at < now() - interval '24 hours'
    returning 1
  )
  select coalesce((select count(*) from deleted_finished), 0)
    + coalesce((select count(*) from deleted_waiting), 0)
  into deleted_count;

  return deleted_count;
end;
$$;

alter table public.ll_rooms enable row level security;
alter table public.ll_room_players enable row level security;
alter table public.ll_round_states enable row level security;
alter table public.ll_action_logs enable row level security;
alter table public.ll_player_events enable row level security;
alter table public.ll_player_stats enable row level security;

drop policy if exists "ll_rooms_select_member" on public.ll_rooms;
create policy "ll_rooms_select_member"
on public.ll_rooms
for select
using (public.ll_is_room_member(id));

drop policy if exists "ll_rooms_block_direct_write" on public.ll_rooms;
create policy "ll_rooms_block_direct_write"
on public.ll_rooms
for all
using (false)
with check (false);

drop policy if exists "ll_room_players_select_member" on public.ll_room_players;
create policy "ll_room_players_select_member"
on public.ll_room_players
for select
using (public.ll_is_room_member(room_id));

drop policy if exists "ll_room_players_block_direct_write" on public.ll_room_players;
create policy "ll_room_players_block_direct_write"
on public.ll_room_players
for all
using (false)
with check (false);

drop policy if exists "ll_round_states_select_member" on public.ll_round_states;
create policy "ll_round_states_select_member"
on public.ll_round_states
for select
using (public.ll_is_room_member(room_id));

drop policy if exists "ll_round_states_block_direct_write" on public.ll_round_states;
create policy "ll_round_states_block_direct_write"
on public.ll_round_states
for all
using (false)
with check (false);

drop policy if exists "ll_action_logs_select_member" on public.ll_action_logs;
create policy "ll_action_logs_select_member"
on public.ll_action_logs
for select
using (public.ll_is_room_member(room_id));

drop policy if exists "ll_action_logs_block_direct_write" on public.ll_action_logs;
create policy "ll_action_logs_block_direct_write"
on public.ll_action_logs
for all
using (false)
with check (false);

drop policy if exists "ll_player_events_select_own" on public.ll_player_events;
create policy "ll_player_events_select_own"
on public.ll_player_events
for select
using (player_id = auth.uid());

drop policy if exists "ll_player_events_block_direct_write" on public.ll_player_events;
create policy "ll_player_events_block_direct_write"
on public.ll_player_events
for all
using (false)
with check (false);

drop policy if exists "ll_player_stats_select_own" on public.ll_player_stats;
create policy "ll_player_stats_select_own"
on public.ll_player_stats
for select
using (player_id = auth.uid());

drop policy if exists "ll_player_stats_block_direct_write" on public.ll_player_stats;
create policy "ll_player_stats_block_direct_write"
on public.ll_player_stats
for all
using (false)
with check (false);
