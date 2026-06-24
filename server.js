const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const path = require('path');
const axios = require('axios');
const { fork } = require('child_process');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
//  MONGODB MODELS
// ============================================================

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  telegramId: { type: Number, default: null },
  username: { type: String, default: '' },
  examName: { type: String, default: 'SBI PO' },
  examDate: { type: String, default: '2026-08-01' },
  startDate: { type: String, default: '' },
  days: { type: Array, default: [] },
  streak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  lastStudyDate: { type: String, default: null },
  achievements: { type: Array, default: [] },
  heatmap: { type: Object, default: {} },
  scoreHistory: { type: Array, default: [] },
  studySessions: { type: Array, default: [] },
  revisionTracker: { type: Object, default: {} },
  subscription: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const OTPSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true },
  otp: { type: String, required: true },
  action: { type: String, default: 'register' },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const SettingSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
});

const User = mongoose.model('User', UserSchema);
const OTP = mongoose.model('OTP', OTPSchema);
const Setting = mongoose.model('Setting', SettingSchema);

// ============================================================
//  HELPERS
// ============================================================

function formatDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function parseAppDate(value) {
  if (value instanceof Date) return value;
  if (!value) return new Date();
  if (typeof value === 'string') {
    const ddmmyyyy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (ddmmyyyy) {
      return new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
    }
    const yyyymmdd = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyymmdd) {
      return new Date(Number(yyyymmdd[1]), Number(yyyymmdd[2]) - 1, Number(yyyymmdd[3]));
    }
  }
  return new Date(value);
}

function daysBetween(a, b) {
  const d1 = parseAppDate(a); d1.setHours(0, 0, 0, 0);
  const d2 = parseAppDate(b); d2.setHours(0, 0, 0, 0);
  return Math.round((d2 - d1) / 86400000);
}

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function getSettingValue(key, defaultValue) {
  const setting = await Setting.findOne({ key });
  return setting ? setting.value : defaultValue;
}

async function setSettingValue(key, value) {
  await Setting.findOneAndUpdate({ key }, { value }, { upsert: true });
}

function getDayPlannedHours(day) {
  if (day.plannedHours !== undefined && day.plannedHours !== null && day.plannedHours !== '') {
    const planned = Number(day.plannedHours);
    if (!Number.isNaN(planned)) return planned;
  }
  return ((Number(day.videos) || 0) * 0.75) + ((Number(day.files) || 0) * 0.5);
}

function getAverageStudyHours(days) {
  const completed = (days || []).filter(d => d.status === 'done');
  if (!completed.length) return 0;
  const totalHours = completed.reduce((sum, day) => {
    const actual = Number(day.actualHours);
    return sum + (actual > 0 ? actual : getDayPlannedHours(day));
  }, 0);
  return totalHours / completed.length;
}

// ============================================================
//  TELEGRAM NOTIFICATION HELPER
// ============================================================

async function sendTelegramMessage(chatId, text) {
  if (!chatId) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    });
    console.log(`📨 Telegram message sent to ${chatId}`);
  } catch (e) {
    console.error('❌ Failed to send Telegram message:', e.message);
  }
}

// ============================================================
//  MONGODB CONNECTION
// ============================================================

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Ensure free_mode setting exists
(async () => {
  const exists = await Setting.findOne({ key: 'free_mode' });
  if (!exists) await Setting.create({ key: 'free_mode', value: true });
  const devExists = await Setting.findOne({ key: 'dev_mode' });
  if (!devExists) await Setting.create({ key: 'dev_mode', value: true });
})();

// ============================================================
//  MIDDLEWARE
// ============================================================

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function botAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (token !== process.env.ADMIN_API_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// ============================================================
//  API ROUTES
// ============================================================

// ---- Settings ----
app.get('/api/settings', async (req, res) => {
  const freeMode = await getSettingValue('free_mode', true);
  const devMode = await getSettingValue('dev_mode', true);
  res.json({ freeMode, devMode });
});

app.post('/api/admin/free', async (req, res) => {
  const { token, enabled } = req.body;
  if (token !== process.env.ADMIN_API_TOKEN) {
    return res.status(403).json({ error: 'Invalid admin token' });
  }
  await Setting.findOneAndUpdate(
    { key: 'free_mode' },
    { value: enabled },
    { upsert: true }
  );
  res.json({ freeMode: enabled });
});

app.get('/api/admin/toggles', botAuth, async (req, res) => {
  const freeEnabled = await getSettingValue('free_mode', true);
  const devEnabled = await getSettingValue('dev_mode', true);
  res.json({ freeEnabled, devEnabled });
});

app.post('/api/admin/toggle', botAuth, async (req, res) => {
  const { key, value } = req.body;
  const settingMap = {
    freeEnabled: 'free_mode',
    devEnabled: 'dev_mode',
    freeMode: 'free_mode',
    devMode: 'dev_mode'
  };
  const settingKey = settingMap[key];
  if (!settingKey) return res.status(400).json({ error: 'Invalid toggle key' });
  await setSettingValue(settingKey, Boolean(value));
  res.json({
    freeEnabled: await getSettingValue('free_mode', true),
    devEnabled: await getSettingValue('dev_mode', true)
  });
});

// ---- OTP Routes ----
app.post('/api/otp/send', async (req, res) => {
  const { telegramId, action = 'register' } = req.body;
  
  if (!telegramId) {
    return res.status(400).json({ error: 'Telegram ID is required' });
  }

  // Check if user already registered
  if (action === 'register') {
    const existingUser = await User.findOne({ telegramId });
    if (existingUser) {
      return res.status(400).json({ error: 'This Telegram ID is already registered' });
    }
  }

  // Check rate limiting (3 attempts per 10 minutes)
  const recentOTPs = await OTP.find({
    telegramId,
    createdAt: { $gt: new Date(Date.now() - 10 * 60 * 1000) }
  });
  
  if (recentOTPs.length >= 3) {
    return res.status(429).json({ error: 'Too many OTP requests. Please wait 10 minutes.' });
  }

  // Check resend cooldown (60 seconds)
  const lastOTP = await OTP.findOne({ telegramId }).sort({ createdAt: -1 });
  if (lastOTP) {
    const timeSinceLast = (Date.now() - lastOTP.createdAt.getTime()) / 1000;
    if (timeSinceLast < 60) {
      return res.status(429).json({ 
        error: `Please wait ${Math.ceil(60 - timeSinceLast)} seconds before requesting a new OTP` 
      });
    }
  }

  // Generate and store OTP
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

  await OTP.create({
    telegramId,
    otp,
    action,
    expiresAt
  });

  // Send OTP via Telegram
  const message = `🔐 *Your OTP for Quant Tracker*\n\n` +
    `Code: \`${otp}\`\n\n` +
    `This code expires in 10 minutes.\n` +
    `If you didn't request this, please ignore.`;
  
  await sendTelegramMessage(telegramId, message);

  console.log(`📤 OTP sent to Telegram ID: ${telegramId}`);
  res.json({ success: true, message: 'OTP sent to your Telegram' });
});

app.post('/api/otp/verify', async (req, res) => {
  const { telegramId, otp } = req.body;

  if (!telegramId || !otp) {
    return res.status(400).json({ error: 'Telegram ID and OTP are required' });
  }

  // Find the latest unused OTP
  const otpRecord = await OTP.findOne({
    telegramId,
    otp,
    used: false
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    return res.status(400).json({ error: 'Invalid OTP' });
  }

  // Check expiry
  if (new Date(otpRecord.expiresAt) < new Date()) {
    return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
  }

  // Mark OTP as used
  otpRecord.used = true;
  await otpRecord.save();

  res.json({ 
    success: true, 
    message: 'OTP verified successfully',
    action: otpRecord.action
  });
});

// ---- Auth Routes (Updated with Telegram) ----
app.post('/api/auth/register', async (req, res) => {
  const { email, password, username, telegramId } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // Check if email already exists
  const existingEmail = await User.findOne({ email });
  if (existingEmail) {
    return res.status(400).json({ error: 'Email already registered' });
  }
  if (username) {
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already registered' });
    }
  }

  // If telegramId is provided, check if it's verified via OTP
  if (telegramId) {
    // Check if Telegram ID is already used
    const existingTelegram = await User.findOne({ telegramId });
    if (existingTelegram) {
      return res.status(400).json({ error: 'This Telegram ID is already linked to another account' });
    }

    // Check if OTP was verified (we don't have a separate flag, but we can check if there's a used OTP)
    const verifiedOTP = await OTP.findOne({
      telegramId,
      used: true,
      action: 'register'
    }).sort({ createdAt: -1 });

    if (!verifiedOTP) {
      return res.status(400).json({ error: 'Telegram ID not verified. Please verify OTP first.' });
    }
  }

  // Hash password
  const hashed = await bcrypt.hash(password, 10);
  
  try {
    const user = await User.create({
      email,
      password: hashed,
      username: username || email.split('@')[0],
      telegramId: telegramId || null,
      isVerified: !!telegramId
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    
    res.json({ 
      token, 
      user: { 
        email: user.email,
        username: user.username,
        telegramId: user.telegramId,
        subscription: user.subscription,
        isVerified: user.isVerified
      } 
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(400).json({ error: 'Registration failed. Please try again.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, username, password } = req.body;
  const identifier = email || username;
  const user = await User.findOne(email ? { email } : { username });
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Username/email and password are required' });
  }
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ 
    token, 
    user: { 
      email: user.email,
      username: user.username,
      telegramId: user.telegramId,
      subscription: user.subscription,
      isVerified: user.isVerified
    } 
  });
});

// ---- Forgot Password ----
app.post('/api/auth/forgot-password', async (req, res) => {
  const { telegramId } = req.body;
  
  if (!telegramId) {
    return res.status(400).json({ error: 'Telegram ID is required' });
  }

  const user = await User.findOne({ telegramId });
  if (!user) {
    return res.status(404).json({ error: 'No account found with this Telegram ID' });
  }

  // Send OTP for password reset
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await OTP.create({
    telegramId,
    otp,
    action: 'reset',
    expiresAt
  });

  const message = `🔐 *Password Reset OTP*\n\n` +
    `Code: \`${otp}\`\n\n` +
    `This code expires in 10 minutes.\n` +
    `Use this to reset your password on the website.`;
  
  await sendTelegramMessage(telegramId, message);

  res.json({ success: true, message: 'OTP sent to your Telegram' });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { telegramId, otp, newPassword } = req.body;

  if (!telegramId || !otp || !newPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Verify OTP
  const otpRecord = await OTP.findOne({
    telegramId,
    otp,
    used: false,
    action: 'reset'
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    return res.status(400).json({ error: 'Invalid OTP' });
  }

  if (new Date(otpRecord.expiresAt) < new Date()) {
    return res.status(400).json({ error: 'OTP has expired' });
  }

  // Mark OTP as used
  otpRecord.used = true;
  await otpRecord.save();

  // Update password
  const user = await User.findOne({ telegramId });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.json({ success: true, message: 'Password reset successfully' });
});

// ---- Sync ----
app.get('/api/sync', authenticate, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    email: user.email,
    username: user.username,
    telegramId: user.telegramId,
    isVerified: user.isVerified,
    examName: user.examName,
    examDate: user.examDate,
    startDate: user.startDate,
    days: user.days,
    streak: user.streak,
    longestStreak: user.longestStreak,
    lastStudyDate: user.lastStudyDate,
    achievements: user.achievements,
    heatmap: user.heatmap,
    scoreHistory: user.scoreHistory,
    studySessions: user.studySessions,
    revisionTracker: user.revisionTracker,
    subscription: user.subscription
  });
});

app.post('/api/sync', authenticate, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { examName, examDate, startDate, days, streak, longestStreak,
          lastStudyDate, achievements, heatmap, scoreHistory,
          studySessions, revisionTracker } = req.body;
  Object.assign(user, {
    examName, examDate, startDate, days, streak, longestStreak,
    lastStudyDate, achievements, heatmap, scoreHistory,
    studySessions, revisionTracker, updatedAt: new Date()
  });
  await user.save();
  res.json({ success: true });
});

// ---- Leaderboard ----
app.get('/api/leaderboard', async (req, res) => {
  const users = await User.find()
    .select('email username streak days')
    .sort({ streak: -1 })
    .limit(50);
  const board = users.map((u, i) => ({
    rank: i + 1,
    name: u.username || u.email.split('@')[0],
    streak: u.streak,
    completion: u.days ? (u.days.filter(d => d.status === 'done').length / u.days.length * 100).toFixed(0) : 0
  }));
  res.json(board);
});

// ---- Telegram link ----
app.post('/api/telegram/link', async (req, res) => {
  const { telegramId, username } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  // Check if Telegram ID already used
  const existing = await User.findOne({ telegramId });
  if (existing && existing._id.toString() !== user._id.toString()) {
    return res.status(400).json({ error: 'Telegram ID already linked to another account' });
  }
  
  user.telegramId = telegramId;
  user.isVerified = true;
  await user.save();
  res.json({ success: true });
});

// ---- Telegram notification on status change ----
app.post('/api/telegram/notify-status', authenticate, async (req, res) => {
  const { dayId, status } = req.body;
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.telegramId) {
    return res.json({ success: false, message: 'Telegram not linked' });
  }
  const day = user.days.find(d => Number(d.id) === Number(dayId));
  if (!day) return res.status(404).json({ error: 'Day not found' });

  let msg = '';
  if (status === 'progress') {
    msg = `⏳ *Good to know you have started!*\n\nI want to complete today's target:\n📚 *${day.topic}*\n📅 Day ${day.day}`;
  } else if (status === 'done') {
    msg = `✅ *Great! You have completed today's target!*\n\n📚 *${day.topic}*\n📅 Day ${day.day}\n\nKeep the streak going! 🔥`;
  } else {
    return res.json({ success: false, message: 'Invalid status' });
  }

  await sendTelegramMessage(user.telegramId, msg);
  res.json({ success: true });
});

// ---- Bot endpoints (for the bot to fetch user data) ----
app.post('/api/bot/user/:telegramId/settings', botAuth, async (req, res) => {
  const user = await User.findOne({ telegramId: parseInt(req.params.telegramId) });
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.revisionTracker = {
    ...(user.revisionTracker || {}),
    botSettings: {
      dailyReminder: Boolean(req.body.dailyReminder),
      interval: Number(req.body.interval) || 30,
      eveningCheckin: Boolean(req.body.eveningCheckin),
      weeklySummary: Boolean(req.body.weeklySummary),
      countdownAlerts: Boolean(req.body.countdownAlerts),
      missedAlerts: Boolean(req.body.missedAlerts),
      completionCheck: Boolean(req.body.completionCheck)
    }
  };
  user.updatedAt = new Date();
  await user.save();
  res.json({ success: true, settings: user.revisionTracker.botSettings });
});

app.get('/api/bot/user/:telegramId', botAuth, async (req, res) => {
  const user = await User.findOne({ telegramId: parseInt(req.params.telegramId) });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const done = user.days.filter(d => d.status === 'done').length;
  const total = user.days.length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const now = new Date();
  const exam = parseAppDate(user.examDate || '2026-08-01');
  const daysLeft = Math.max(0, daysBetween(now, exam));
  const today = formatDate(now);
  let todayIdx = user.days.findIndex(d => d.date === today);
  if (todayIdx < 0) todayIdx = user.days.findIndex(d => d.status !== 'done');
  const todayDay = user.days[todayIdx] || user.days[0];
  const scores = user.days.filter(d => d.score && d.status === 'done').map(d => parseInt(d.score) || 0);
  const avgAcc = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  let streakFactor = 0;
  if (user.streak >= 30) streakFactor = 100;
  else if (user.streak >= 14) streakFactor = 80;
  else if (user.streak >= 7) streakFactor = 60;
  else if (user.streak >= 3) streakFactor = 40;
  else if (user.streak > 0) streakFactor = 20;
  let daysFactor = 100;
  if (daysLeft < 0) daysFactor = 100;
  else if (daysLeft < 7) daysFactor = 50;
  else if (daysLeft < 15) daysFactor = 70;
  else if (daysLeft < 30) daysFactor = 85;
  const readiness = Math.min(100, Math.round((pct * 0.4) + (avgAcc * 0.3) + (streakFactor * 0.2) + (daysFactor * 0.1)));

  res.json({
    username: user.username || user.email.split('@')[0],
    email: user.email,
    days: user.days,
    streak: user.streak,
    longestStreak: user.longestStreak,
    examDate: user.examDate,
    daysLeft: daysLeft,
    readiness: readiness,
    avgHours: getAverageStudyHours(user.days),
    todayTopic: todayDay ? todayDay.topic : '',
    ...(user.revisionTracker?.botSettings || {})
  });
});

app.get('/api/bot/today/:telegramId', botAuth, async (req, res) => {
  const user = await User.findOne({ telegramId: parseInt(req.params.telegramId) });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const today = formatDate(new Date());
  let idx = user.days.findIndex(d => d.date === today);
  if (idx < 0) {
    idx = user.days.findIndex(d => d.status !== 'done');
    if (idx < 0) idx = user.days.length - 1;
  }
  const day = user.days[idx] || user.days[0];
  res.json({
    topic: day.topic,
    videos: day.videos || 0,
    files: day.files || 0,
    hours: (day.videos * 0.75 + day.files * 0.5).toFixed(1),
    day: day.day,
    totalDays: user.days.length
  });
});

app.get('/api/bot/users', botAuth, async (req, res) => {
  const users = await User.find({ telegramId: { $ne: null } }).select('telegramId username email');
  res.json(users);
});

app.get('/api/bot/leaderboard', botAuth, async (req, res) => {
  const users = await User.find()
    .select('email username streak days')
    .sort({ streak: -1 })
    .limit(50);
  const board = users.map((u, i) => {
    const total = u.days?.length || 0;
    const done = total ? u.days.filter(d => d.status === 'done').length : 0;
    return {
      rank: i + 1,
      username: u.username || u.email.split('@')[0],
      streak: u.streak || 0,
      completion: total ? Math.round((done / total) * 100) : 0
    };
  });
  res.json(board);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/db-health', async (req, res) => {
  try {
    await User.findOne().lean();
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// Add this to server.js after the existing auth routes

// ---- Login with Telegram (after OTP verification) ----
app.post('/api/auth/login-telegram', async (req, res) => {
  const { telegramId } = req.body;
  
  if (!telegramId) {
    return res.status(400).json({ error: 'Telegram ID is required' });
  }

  const user = await User.findOne({ telegramId });
  if (!user) {
    return res.status(404).json({ error: 'No account linked to this Telegram ID' });
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ 
    token, 
    user: { 
      email: user.email,
      username: user.username,
      telegramId: user.telegramId,
      subscription: user.subscription,
      isVerified: user.isVerified
    } 
  });
});


// ---- Serve frontend ----
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
//  START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Fork the bot process
fork('./bot.js');

// ============================================================
//  KEEP-ALIVE PING (prevents Render free tier from sleeping)
// ============================================================

const PING_URL = process.env.API_URL || 'https://your-app-url.onrender.com';

setInterval(async () => {
  try {
    const response = await axios.get(PING_URL);
    console.log(`[Keep-Alive] Status: ${response.status}`);
  } catch (error) {
    console.error(`[Keep-Alive] Error: ${error.message}`);
  }
}, 300000); // 5 minutes
