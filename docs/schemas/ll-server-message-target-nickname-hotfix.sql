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
as $function$
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
      format('%s님이 %s님의 카드를 %s(으)로 맞혀 즉시 탈락시켰습니다.', actor_nickname, target_nickname, public.ll_card_name(p_guessed_card))
    when p_played_card = 1 then
      format('%s님이 %s님의 카드를 %s(으)로 추측했습니다.', actor_nickname, target_nickname, public.ll_card_name(p_guessed_card))
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
$function$;

notify pgrst, 'reload schema';
