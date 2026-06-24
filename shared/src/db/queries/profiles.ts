import { getSupabaseServerClient } from '../supabaseClient.js';

export async function getProfileById(userId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(`Failed to fetch profile: ${error.message}`);
  return data;
}

export async function upsertProfile(profile: {
  id: string;
  email?: string | null;
  username?: string | null;
  display_name?: string | null;
  telegram_id?: number | null;
  discord_id?: string | null;
  exam_name?: string;
  exam_date?: string | null;
  start_date?: string | null;
  streak?: number;
  longest_streak?: number;
  last_study_date?: string | null;
  subscription_active?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('profiles').upsert(profile, { onConflict: 'id' }).select('*').single();
  if (error) throw new Error(`Failed to upsert profile: ${error.message}`);
  return data;
}

export async function softDeleteProfile(userId: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('profiles').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', userId);
  if (error) throw new Error(`Failed to delete profile: ${error.message}`);
}

export async function updateUserSettings(
  userId: string,
  patch: {
    theme?: string;
    locale?: string;
    notifications_enabled?: boolean;
    preferences?: Record<string, unknown>;
  }
) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update user settings: ${error.message}`);
  return data;
}
