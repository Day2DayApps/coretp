import { getSupabaseServerClient } from '../supabaseClient.js';

export async function getAppSetting(key: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('app_settings').select('*').eq('key', key).maybeSingle();
  if (error) throw new Error(`Failed to fetch setting ${key}: ${error.message}`);
  return data?.value ?? null;
}

export async function setAppSetting(key: string, value: unknown, description?: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('app_settings')
    .upsert({ key, value, description: description ?? null }, { onConflict: 'key' })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update setting ${key}: ${error.message}`);
  return data;
}
