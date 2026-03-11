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

alter table public.ll_player_events add column if not exists room_id uuid;
alter table public.ll_player_events add column if not exists round_number int default 0;
alter table public.ll_player_events add column if not exists player_id uuid;
alter table public.ll_player_events add column if not exists event_type text;
alter table public.ll_player_events add column if not exists title text;
alter table public.ll_player_events add column if not exists message text;
alter table public.ll_player_events add column if not exists detail text;
alter table public.ll_player_events add column if not exists payload jsonb default '{}'::jsonb;
alter table public.ll_player_events add column if not exists created_at timestamptz default now();

create index if not exists idx_ll_player_events_room_player
  on public.ll_player_events(room_id, player_id, created_at desc);

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

notify pgrst, 'reload schema';
