export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      user_settings: {
        Row: UserSettingsRow;
        Insert: UserSettingsInsert;
        Update: UserSettingsUpdate;
      };
      guilds: {
        Row: GuildRow;
        Insert: GuildInsert;
        Update: GuildUpdate;
      };
      channels: {
        Row: ChannelRow;
        Insert: ChannelInsert;
        Update: ChannelUpdate;
      };
      message_logs: {
        Row: MessageLogRow;
        Insert: MessageLogInsert;
        Update: MessageLogUpdate;
      };
      command_usage: {
        Row: CommandUsageRow;
        Insert: CommandUsageInsert;
        Update: CommandUsageUpdate;
      };
      study_sessions: {
        Row: StudySessionRow;
        Insert: StudySessionInsert;
        Update: StudySessionUpdate;
      };
      app_settings: {
        Row: AppSettingsRow;
        Insert: AppSettingsInsert;
        Update: AppSettingsUpdate;
      };
    };
  };
};

export type ProfileRow = {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  telegram_id: number | null;
  discord_id: string | null;
  exam_name: string;
  exam_date: string | null;
  start_date: string | null;
  streak: number;
  longest_streak: number;
  last_study_date: string | null;
  subscription_active: boolean;
  metadata: Json;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
export type ProfileInsert = Omit<ProfileRow, 'created_at' | 'updated_at'> & Partial<Pick<ProfileRow, 'created_at' | 'updated_at'>>;
export type ProfileUpdate = Partial<ProfileInsert>;

export type UserSettingsRow = {
  id: string;
  user_id: string;
  theme: string;
  locale: string;
  notifications_enabled: boolean;
  preferences: Json;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
export type UserSettingsInsert = Omit<UserSettingsRow, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<UserSettingsRow, 'id' | 'created_at' | 'updated_at'>>;
export type UserSettingsUpdate = Partial<UserSettingsInsert>;

export type GuildRow = {
  id: string;
  platform: string;
  platform_guild_id: string;
  name: string;
  icon_url: string | null;
  owner_user_id: string | null;
  metadata: Json;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
export type GuildInsert = Omit<GuildRow, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<GuildRow, 'id' | 'created_at' | 'updated_at'>>;
export type GuildUpdate = Partial<GuildInsert>;

export type ChannelRow = {
  id: string;
  guild_id: string;
  platform_channel_id: string;
  name: string;
  channel_type: string;
  metadata: Json;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
export type ChannelInsert = Omit<ChannelRow, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<ChannelRow, 'id' | 'created_at' | 'updated_at'>>;
export type ChannelUpdate = Partial<ChannelInsert>;

export type MessageLogRow = {
  id: string;
  guild_id: string | null;
  channel_id: string | null;
  user_id: string | null;
  platform_message_id: string | null;
  message_type: string;
  content: string | null;
  payload: Json;
  occurred_at: string;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
export type MessageLogInsert = Omit<MessageLogRow, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<MessageLogRow, 'id' | 'created_at' | 'updated_at'>>;
export type MessageLogUpdate = Partial<MessageLogInsert>;

export type CommandUsageRow = {
  id: string;
  user_id: string | null;
  guild_id: string | null;
  channel_id: string | null;
  command_name: string;
  command_group: string | null;
  success: boolean;
  duration_ms: number | null;
  metadata: Json;
  occurred_at: string;
  created_at: string;
};
export type CommandUsageInsert = Omit<CommandUsageRow, 'id' | 'created_at'> & Partial<Pick<CommandUsageRow, 'id' | 'created_at'>>;
export type CommandUsageUpdate = Partial<CommandUsageInsert>;

export type StudySessionRow = {
  id: string;
  user_id: string;
  session_type: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  metadata: Json;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
export type StudySessionInsert = Omit<StudySessionRow, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<StudySessionRow, 'id' | 'created_at' | 'updated_at'>>;
export type StudySessionUpdate = Partial<StudySessionInsert>;

export type AppSettingsRow = {
  id: string;
  key: string;
  value: Json;
  description: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
export type AppSettingsInsert = Omit<AppSettingsRow, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<AppSettingsRow, 'id' | 'created_at' | 'updated_at'>>;
export type AppSettingsUpdate = Partial<AppSettingsInsert>;
