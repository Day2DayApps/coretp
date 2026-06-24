create or replace view public.v_user_dashboard as
select
  p.id as user_id,
  p.email,
  p.username,
  p.display_name,
  p.exam_name,
  p.exam_date,
  p.streak,
  p.longest_streak,
  p.subscription_active,
  s.theme,
  s.locale,
  s.notifications_enabled
from public.profiles p
left join public.user_settings s on s.user_id = p.id
where p.is_deleted = false;

create or replace view public.v_guild_overview as
select
  g.id as guild_id,
  g.platform,
  g.platform_guild_id,
  g.name,
  count(distinct gm.user_id) as member_count,
  count(distinct c.id) as channel_count
from public.guilds g
left join public.guild_memberships gm on gm.guild_id = g.id and gm.is_deleted = false
left join public.channels c on c.guild_id = g.id and c.is_deleted = false
where g.is_deleted = false
group by g.id;
