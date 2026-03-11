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

create or replace function public.ll_card_name(p_card_id integer)
returns text
language sql
immutable
as $$
  select public.ll_card_name(
    case when p_card_id is null then null else p_card_id::smallint end
  );
$$;

notify pgrst, 'reload schema';
