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

notify pgrst, 'reload schema';
