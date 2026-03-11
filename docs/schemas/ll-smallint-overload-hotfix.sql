drop function if exists public.ll_remove_first_card(smallint[], smallint);
drop function if exists public.ll_remove_first_card(smallint[], integer);

create or replace function public.ll_remove_first_card(p_cards smallint[], p_card integer)
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

drop function if exists public.ll_append_action_log(uuid, integer, text, uuid, text, uuid, text, smallint, smallint, text, jsonb);
drop function if exists public.ll_append_action_log(uuid, integer, text, uuid, text, uuid, text, integer, integer, text, jsonb);

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
    case when p_card_id is null then null else p_card_id::smallint end,
    case when p_guessed_card is null then null else p_guessed_card::smallint end,
    p_public_message,
    coalesce(p_payload, '{}'::jsonb)
  );
$$;

drop function if exists public.ll_card_name(smallint);
drop function if exists public.ll_card_name(integer);

create or replace function public.ll_card_name(p_card_id integer)
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

notify pgrst, 'reload schema';
