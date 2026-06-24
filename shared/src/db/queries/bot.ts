import { getSupabaseServerClient } from '../supabaseClient.js';

export async function logCommandUsage(input: {
  user_id?: string | null;
  guild_id?: string | null;
  channel_id?: string | null;
  command_name: string;
  command_group?: string | null;
  success?: boolean;
  duration_ms?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('command_usage').insert({
    user_id: input.user_id ?? null,
    guild_id: input.guild_id ?? null,
    channel_id: input.channel_id ?? null,
    command_name: input.command_name,
    command_group: input.command_group ?? null,
    success: input.success ?? true,
    duration_ms: input.duration_ms ?? null,
    metadata: input.metadata ?? {},
    occurred_at: new Date().toISOString()
  }).select('*').single();
  if (error) throw new Error(`Failed to log command usage: ${error.message}`);
  return data;
}

export async function logMessage(input: {
  guild_id?: string | null;
  channel_id?: string | null;
  user_id?: string | null;
  platform_message_id?: string | null;
  message_type?: string;
  content?: string | null;
  payload?: Record<string, unknown>;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('message_logs').insert({
    guild_id: input.guild_id ?? null,
    channel_id: input.channel_id ?? null,
    user_id: input.user_id ?? null,
    platform_message_id: input.platform_message_id ?? null,
    message_type: input.message_type ?? 'message',
    content: input.content ?? null,
    payload: input.payload ?? {},
    occurred_at: new Date().toISOString()
  }).select('*').single();
  if (error) throw new Error(`Failed to log message: ${error.message}`);
  return data;
}
