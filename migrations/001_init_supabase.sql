create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  username text unique,
  display_name text,
  avatar_url text,
  telegram_id bigint unique,
  discord_id text unique,
  exam_name text not null default 'SBI PO',
  exam_date date,
  start_date date,
  streak integer not null default 0,
  longest_streak integer not null default 0,
  last_study_date date,
  subscription_active boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists profiles_telegram_id_idx on public.profiles (telegram_id);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  theme text not null default 'system',
  locale text not null default 'en',
  notifications_enabled boolean not null default true,
  preferences jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

drop trigger if exists trg_user_settings_updated_at on public.user_settings;
create trigger trg_user_settings_updated_at before update on public.user_settings
for each row execute function public.set_updated_at();

create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'discord',
  platform_guild_id text not null,
  name text not null,
  icon_url text,
  owner_user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, platform_guild_id)
);

drop trigger if exists trg_guilds_updated_at on public.guilds;
create trigger trg_guilds_updated_at before update on public.guilds
for each row execute function public.set_updated_at();

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  platform_channel_id text not null,
  name text not null,
  channel_type text not null default 'text',
  metadata jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, platform_channel_id)
);

drop trigger if exists trg_channels_updated_at on public.channels;
create trigger trg_channels_updated_at before update on public.channels
for each row execute function public.set_updated_at();

create table if not exists public.guild_memberships (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform_member_id text,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, user_id)
);

drop trigger if exists trg_guild_memberships_updated_at on public.guild_memberships;
create trigger trg_guild_memberships_updated_at before update on public.guild_memberships
for each row execute function public.set_updated_at();

create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid references public.guilds(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  platform_message_id text,
  message_type text not null default 'message',
  content text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_message_logs_updated_at on public.message_logs;
create trigger trg_message_logs_updated_at before update on public.message_logs
for each row execute function public.set_updated_at();

create table if not exists public.command_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  guild_id uuid references public.guilds(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,
  command_name text not null,
  command_group text,
  success boolean not null default true,
  duration_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_type text not null default 'study',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_study_sessions_updated_at on public.study_sessions;
create trigger trg_study_sessions_updated_at before update on public.study_sessions
for each row execute function public.set_updated_at();

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null,
  title text not null,
  description text,
  earned_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, achievement_key)
);

drop trigger if exists trg_achievements_updated_at on public.achievements;
create trigger trg_achievements_updated_at before update on public.achievements
for each row execute function public.set_updated_at();

create table if not exists public.score_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  score numeric(10,2) not null,
  score_type text not null default 'total',
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  description text,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at before update on public.app_settings
for each row execute function public.set_updated_at();
