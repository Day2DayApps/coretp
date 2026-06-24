alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.study_sessions enable row level security;
alter table public.achievements enable row level security;
alter table public.score_history enable row level security;
alter table public.message_logs enable row level security;
alter table public.command_usage enable row level security;
alter table public.guilds enable row level security;
alter table public.channels enable row level security;
alter table public.app_settings enable row level security;

create policy "profiles_select_own" on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles
for insert to authenticated
with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "user_settings_select_own" on public.user_settings
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "user_settings_write_own" on public.user_settings
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "user_settings_update_own" on public.user_settings
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "study_sessions_own" on public.study_sessions
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "message_logs_select_own" on public.message_logs
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "command_usage_select_own" on public.command_usage
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "guilds_read_authenticated" on public.guilds
for select to authenticated
using (true);

create policy "channels_read_authenticated" on public.channels
for select to authenticated
using (true);

create policy "app_settings_read_authenticated" on public.app_settings
for select to authenticated
using (true);
