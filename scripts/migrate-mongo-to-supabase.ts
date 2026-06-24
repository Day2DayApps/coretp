import 'dotenv/config';
import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';

const mongoUri = process.env.MONGODB_URI;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!mongoUri || !supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing MONGODB_URI, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const LegacyUser = mongoose.model('LegacyUser', new mongoose.Schema({}, { strict: false, collection: 'users' }));
const LegacySetting = mongoose.model('LegacySetting', new mongoose.Schema({}, { strict: false, collection: 'settings' }));

function toIsoDate(value: unknown) {
  if (!value) return null;
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function migrateUsers() {
  const users = await LegacyUser.find({}).lean();
  for (const user of users) {
    const { error } = await supabase.from('profiles').upsert({
      id: String(user._id),
      email: user.email ?? null,
      username: user.username ?? null,
      display_name: user.displayName ?? user.name ?? null,
      telegram_id: user.telegramId ?? null,
      discord_id: user.discordId ?? null,
      exam_name: user.examName ?? 'SBI PO',
      exam_date: user.examDate ? toIsoDate(user.examDate)?.slice(0, 10) ?? null : null,
      start_date: user.startDate ? toIsoDate(user.startDate)?.slice(0, 10) ?? null : null,
      streak: user.streak ?? 0,
      longest_streak: user.longestStreak ?? 0,
      last_study_date: user.lastStudyDate ? toIsoDate(user.lastStudyDate)?.slice(0, 10) ?? null : null,
      subscription_active: Boolean(user.subscription),
      metadata: {
        mongo_id: String(user._id),
        achievements: user.achievements ?? [],
        heatmap: user.heatmap ?? {},
        revisionTracker: user.revisionTracker ?? {},
        scoreHistory: user.scoreHistory ?? [],
        studySessions: user.studySessions ?? []
      },
      created_at: toIsoDate(user.createdAt) ?? new Date().toISOString(),
      updated_at: toIsoDate(user.updatedAt) ?? new Date().toISOString(),
      is_deleted: false,
      deleted_at: null
    }, { onConflict: 'id' });
    if (error) console.error('Failed user', user._id, error.message);
  }
}

async function migrateSettings() {
  const settings = await LegacySetting.find({}).lean();
  for (const setting of settings) {
    const { error } = await supabase.from('app_settings').upsert({
      key: setting.key,
      value: setting.value,
      description: `Migrated from Mongo key ${setting.key}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_deleted: false,
      deleted_at: null
    }, { onConflict: 'key' });
    if (error) console.error('Failed setting', setting.key, error.message);
  }
}

async function main() {
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');
  await migrateUsers();
  await migrateSettings();
  await mongoose.disconnect();
  console.log('Migration complete');
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
