-- Love Letter room membership hotfix
-- Apply this in Supabase SQL Editor if room creation/joining hangs with:
--   canceling statement due to statement timeout
--
-- Root cause:
--   ll_rooms / ll_room_players RLS policies call ll_is_room_member(),
--   and the old helper queried ll_room_players under RLS again, causing
--   recursive policy evaluation and eventual statement timeouts.

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
