// ============================================================
// HYBRID V3 – QUANT TRACKER TELEGRAM BOT
// Production-grade with proper error handling and architecture
// ============================================================

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

// ------------------------------
// CONFIGURATION
// ------------------------------
const config = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  adminIds: (process.env.ADMIN_TELEGRAM_ID || '')
    .split(',')
    .map(id => id.trim())
    .filter(id => id),
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  webUrl: process.env.WEB_URL || process.env.API_URL || 'http://localhost:3000',
  apiToken: process.env.ADMIN_API_TOKEN,
  logDir: path.join(__dirname, 'logs'),
  logFile: path.join(__dirname, 'logs', 'errors.log'),
};

// Ensure log directory exists
if (!fs.existsSync(config.logDir)) {
  fs.mkdirSync(config.logDir, { recursive: true });
}

// ------------------------------
// ADVANCED LOGGER
// ------------------------------
const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
let currentLogLevel = LOG_LEVELS.INFO;
const memoryLogs = [];

function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    message,
    stack: meta.stack || '',
    statusCode: meta.statusCode || '',
    responseBody: meta.responseBody || '',
    ...meta,
  };
  memoryLogs.push(entry);
  if (memoryLogs.length > 1000) memoryLogs.shift();

  const consoleMsg = `[${timestamp}] [${level}] ${message}`;
  if (level === 'ERROR') console.error(consoleMsg);
  else if (level === 'WARN') console.warn(consoleMsg);
  else if (level === 'DEBUG') console.debug(consoleMsg);
  else console.log(consoleMsg);

  if (level === 'ERROR' || level === 'WARN') {
    const logLine = JSON.stringify(entry) + '\n';
    fs.appendFile(config.logFile, logLine, (err) => {
      if (err) console.error('Failed to write log file:', err);
    });
  }
}

function logError(context, error) {
  const meta = {
    stack: error.stack || '',
    statusCode: error.response?.status || '',
    responseBody: error.response?.data || '',
  };
  log('ERROR', `${context}: ${error.message}`, meta);
}

function logWarn(message, meta = {}) { log('WARN', message, meta); }
function logInfo(message, meta = {}) { log('INFO', message, meta); }
function logDebug(message, meta = {}) {
  if (currentLogLevel >= LOG_LEVELS.DEBUG) log('DEBUG', message, meta);
}

// ------------------------------
// UNHANDLED EXCEPTIONS / REJECTIONS
// ------------------------------
process.on('uncaughtException', (err) => {
  logError('uncaughtException', err);
});
process.on('unhandledRejection', (reason, promise) => {
  logError('unhandledRejection', reason);
});

// ------------------------------
// BOT INITIALISATION
// ------------------------------
const bot = new TelegramBot(config.token, { polling: true });

// ------------------------------
// HELPER: SAFE MESSAGE EDIT / REPLY
// ------------------------------
async function editMessageOrReply(query, text, options = {}) {
  try {
    await bot.editMessageText(text, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      ...options,
    });
  } catch (e) {
    logDebug('editMessageOrReply fallback to send', e);
    await bot.sendMessage(query.message.chat.id, text, {
      parse_mode: 'Markdown',
      ...options,
    });
  }
}

// ------------------------------
// DATE UTILITIES
// ------------------------------
function parseAppDate(value) {
  if (value instanceof Date) return value;
  if (!value) return new Date();
  if (typeof value === 'string') {
    // Try DD-MM-YYYY format
    const ddmmyyyy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (ddmmyyyy) {
      return new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
    }
    // Try YYYY-MM-DD format
    const yyyymmdd = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyymmdd) {
      return new Date(Number(yyyymmdd[1]), Number(yyyymmdd[2]) - 1, Number(yyyymmdd[3]));
    }
  }
  return new Date(value);
}

// ------------------------------
// API HELPERS
// ------------------------------
async function apiCall(endpoint, method = 'GET', data = null) {
  const url = `${config.apiUrl}${endpoint}`;
  const headers = { Authorization: `Bearer ${config.apiToken}` };
  try {
    const res = await axios({ method, url, data, headers, timeout: 10000 });
    return { success: true, data: res.data };
  } catch (e) {
    logError(`apiCall ${endpoint}`, e);
    return { success: false, error: e.message, data: null };
  }
}

// ------------------------------
// SETTINGS (persisted via API)
// ------------------------------
async function getUserSettings(telegramId) {
  const result = await apiCall(`/api/bot/user/${telegramId}`);
  if (!result.success || !result.data) return null;

  const data = result.data;
  // Bot settings are stored in revisionTracker.botSettings
  const botSettings = data.revisionTracker?.botSettings || {};

  return {
    dailyReminder: botSettings.dailyReminder ?? false,
    interval: botSettings.interval ?? 30,
    eveningCheckin: botSettings.eveningCheckin ?? false,
    weeklySummary: botSettings.weeklySummary ?? false,
    countdownAlerts: botSettings.countdownAlerts ?? false,
    missedAlerts: botSettings.missedAlerts ?? false,
    completionCheck: botSettings.completionCheck ?? false,
  };
}

async function updateUserSettings(telegramId, settings) {
  return await apiCall(`/api/bot/user/${telegramId}/settings`, 'POST', settings);
}

// ------------------------------
// ADMIN TOGGLES (fetched from API)
// ------------------------------
async function getAdminToggles() {
  const result = await apiCall('/api/admin/toggles');
  if (!result.success || !result.data) return { freeEnabled: false, devEnabled: false };
  return { freeEnabled: result.data.freeEnabled ?? false, devEnabled: result.data.devEnabled ?? false };
}

async function setAdminToggle(key, value) {
  return await apiCall(`/api/admin/toggle`, 'POST', { key, value });
}

// ------------------------------
// BROADCAST STORAGE (module-level)
// ------------------------------
const broadcastCache = new Map();

// ------------------------------
// KEYBOARDS
// ------------------------------
function getMainMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📅 Today', callback_data: 'menu_today' }, { text: '📊 Status', callback_data: 'menu_status' }],
        [{ text: '🔥 Streak', callback_data: 'menu_streak' }, { text: '⏳ Countdown', callback_data: 'menu_countdown' }],
        [{ text: '📈 Analytics', callback_data: 'menu_analytics' }, { text: '🏆 Leaderboard', callback_data: 'menu_leaderboard' }],
        [{ text: '⚙ Settings', callback_data: 'menu_settings' }, { text: '📚 Help', callback_data: 'menu_help' }],
        [{ text: '🌐 Open Website', url: config.webUrl }],
      ],
    },
  };
}

function getAdminPanelKeyboard(freeEnabled, devEnabled) {
  const freeLabel = freeEnabled ? '🔓 Leaderboard: ON' : '🔒 Leaderboard: OFF';
  const devLabel = devEnabled ? '⚙️ Dev Mode: ON' : '⚙️ Dev Mode: OFF';
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: freeLabel, callback_data: 'admin_toggle_free' }],
        [{ text: devLabel, callback_data: 'admin_toggle_dev' }],
        [{ text: '📋 View Logs', callback_data: 'admin_view_logs' }],
        [{ text: '🗑 Clear Logs', callback_data: 'admin_clear_logs' }],
        [{ text: '📤 Export Logs', callback_data: 'admin_export_logs' }],
        [{ text: '📢 Broadcast', callback_data: 'admin_broadcast' }],
        [{ text: '👥 Total Users', callback_data: 'admin_total_users' }],
        [{ text: '📈 Active Users', callback_data: 'admin_active_users' }],
        [{ text: '❤️ Health Check', callback_data: 'admin_health' }],
        [{ text: '🔄 Refresh', callback_data: 'admin_refresh' }],
        [{ text: '🔙 Back', callback_data: 'admin_back' }],
      ],
    },
  };
}

function getSettingsKeyboard(settings) {
  const dailyLabel = settings.dailyReminder ? '🌅 Daily 5AM: ON' : '🌅 Daily 5AM: OFF';
  const intervalLabel = `⏱️ Interval: ${settings.interval} min`;
  const eveningLabel = settings.eveningCheckin ? '🌙 Evening: ON' : '🌙 Evening: OFF';
  const completionLabel = settings.completionCheck ? '✅ Completion Check: ON' : '✅ Completion Check: OFF';
  const countdownLabel = settings.countdownAlerts ? '⏳ Countdown Alerts: ON' : '⏳ Countdown Alerts: OFF';
  const missedLabel = settings.missedAlerts ? '⚠️ Missed Alerts: ON' : '⚠️ Missed Alerts: OFF';
  const weeklyLabel = settings.weeklySummary ? '📊 Weekly Summary: ON' : '📊 Weekly Summary: OFF';
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: dailyLabel, callback_data: 'us_toggle_daily' }],
        [{ text: intervalLabel, callback_data: 'us_interval' }],
        [{ text: eveningLabel, callback_data: 'us_toggle_evening' }],
        [{ text: completionLabel, callback_data: 'us_toggle_completion' }],
        [{ text: countdownLabel, callback_data: 'us_toggle_countdown' }],
        [{ text: missedLabel, callback_data: 'us_toggle_missed' }],
        [{ text: weeklyLabel, callback_data: 'us_toggle_weekly' }],
        [{ text: '🌐 Open Website', url: config.webUrl }],
        [{ text: '🔙 Main Menu', callback_data: 'us_back_main' }],
      ],
    },
  };
}

// ------------------------------
// FORMATTING HELPERS
// ------------------------------
function buildProgressBar(percent, length = 10) {
  const filled = Math.floor(percent / 10);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function buildStreakBar(streak, length = 10) {
  const progress = streak % 10;
  return '🔥'.repeat(progress) + '⬜'.repeat(length - progress);
}

function getMotivationMessage(streak) {
  if (streak >= 30) return '🌟 *Legendary!* Keep it up!';
  if (streak >= 20) return '💪 *Amazing!* You\'re unstoppable!';
  if (streak >= 10) return '👍 *Great!* Stay consistent!';
  return '💪 *Keep going!* Every day counts!';
}

function getReadinessStatus(readiness) {
  if (readiness >= 80) return '✅ ON TRACK';
  if (readiness >= 60) return '⚠️ BEHIND';
  return '🚨 URGENT';
}

// ------------------------------
// COMMAND HANDLER FUNCTIONS (for reuse)
// ------------------------------
async function handleToday(chatId, userId) {
  const result = await apiCall(`/api/bot/today/${userId}`);
  if (!result.success || !result.data || !result.data.topic) {
    return bot.sendMessage(chatId, `❌ *No study plan found.* Please link your account with /link first.`);
  }
  const { topic, videos, files, hours, day, totalDays } = result.data;
  const reply =
    `🌅 *Today's Study Target*\n\n` +
    `📚 *Topic:* ${topic}\n` +
    `🎬 Videos: ${videos}\n` +
    `📁 Practice files: ${files}\n` +
    `⏱️ Estimated time: ~${hours} hours\n` +
    `📅 Day ${day} of ${totalDays || 'your plan'}`;
  return bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
}

async function handleStatus(chatId, userId) {
  const result = await apiCall(`/api/bot/user/${userId}`);
  if (!result.success || !result.data) {
    return bot.sendMessage(chatId, '❌ No data found. Link with /link.');
  }
  const data = result.data;
  const done = data.days?.filter(d => d.status === 'done').length || 0;
  const total = data.days?.length || 1;
  const pct = Math.round((done / total) * 100);
  const bar = buildProgressBar(pct);
  const reply =
    `📊 *Your Progress*\n\n` +
    `👤 *User:* @${data.username || 'unknown'}\n` +
    `\`${bar}\` *${pct}%*\n\n` +
    `📈 *Completion:* ${done}/${total} days\n` +
    `🔥 *Streak:* ${data.streak || 0} days\n` +
    `🏆 *Readiness:* ${data.readiness || 0}%\n` +
    `📅 *Exam:* ${data.examDate || 'Not set'}\n` +
    `⏳ *Days left:* ${data.daysLeft || 'N/A'}\n` +
    `📚 *Today's topic:* ${data.todayTopic || '—'}`;
  return bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
}

async function handleStreak(chatId, userId) {
  const result = await apiCall(`/api/bot/user/${userId}`);
  if (!result.success || !result.data) {
    return bot.sendMessage(chatId, '❌ No data.');
  }
  const data = result.data;
  const streak = data.streak || 0;
  const longest = data.longestStreak || 0;
  const nextMilestone = Math.ceil(streak / 10) * 10;
  const bar = buildStreakBar(streak);
  const motivation = getMotivationMessage(streak);
  const msgText =
    `🔥 *Streak Report*\n\n` +
    `*Current:* ${streak} days\n` +
    `*Longest:* ${longest} days\n` +
    `*Next milestone:* ${nextMilestone} days\n\n` +
    `${bar}\n\n` +
    motivation;
  return bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
}

async function handleCountdown(chatId, userId) {
  const result = await apiCall(`/api/bot/user/${userId}`);
  if (!result.success || !result.data || !result.data.examDate) {
    return bot.sendMessage(chatId, '❌ Exam date not set.');
  }
  const data = result.data;
  const exam = parseAppDate(data.examDate);
  const now = new Date();
  const diff = exam - now;
  if (diff <= 0) {
    return bot.sendMessage(chatId, '🎯 *Exam date has passed!* Good luck!');
  }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const readiness = data.readiness || 0;
  const status = getReadinessStatus(readiness);
  const bar = buildProgressBar(readiness);
  const reply =
    `⏳ *Exam Countdown*\n\n` +
    `*${days}d ${hours}h ${mins}m ${secs}s* remaining\n\n` +
    `📊 *Preparation:* ${readiness}%\n` +
    `\`${bar}\`\n\n` +
    `📈 *Status:* ${status}`;
  return bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
}

async function handleAnalytics(chatId, userId) {
  const result = await apiCall(`/api/bot/user/${userId}`);
  if (!result.success || !result.data) {
    return bot.sendMessage(chatId, '❌ No data.');
  }
  const data = result.data;
  const done = data.days?.filter(d => d.status === 'done').length || 0;
  const skipped = data.days?.filter(d => d.status === 'skipped').length || 0;
  const total = data.days?.length || 1;
  const avgHours = data.avgHours || 0;
  const pct = Math.round((done / total) * 100);
  const bar = buildProgressBar(pct);
  const reply =
    `📈 *Detailed Analytics*\n\n` +
    `📅 *Total study days:* ${total}\n` +
    `✅ *Completed:* ${done}\n` +
    `❌ *Skipped:* ${skipped}\n` +
    `🔥 *Current streak:* ${data.streak || 0}\n` +
    `🏆 *Longest streak:* ${data.longestStreak || 0}\n` +
    `⏱️ *Avg hours/day:* ${avgHours.toFixed(1)}\n` +
    `🏅 *Readiness:* ${data.readiness || 0}%\n` +
    `\`${bar}\` *${pct}%*`;
  return bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
}

async function handleLeaderboard(chatId) {
  const toggles = await getAdminToggles();
  if (!toggles.freeEnabled) {
    return bot.sendMessage(chatId, '🔒 *Leaderboard is currently disabled* by admin.');
  }
  const result = await apiCall('/api/bot/leaderboard');
  if (!result.success || !result.data || !result.data.length) {
    return bot.sendMessage(chatId, '🏆 *No users yet.* Be the first!');
  }
  let reply = '🏆 *Leaderboard (Top 10)*\n\n';
  result.data.slice(0, 10).forEach((u, i) => {
    reply += `${i + 1}. @${u.username} – *${u.completion}%* (🔥${u.streak})\n`;
  });
  return bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
}

async function handleSettings(chatId, userId) {
  const settings = await getUserSettings(userId);
  if (!settings) {
    return bot.sendMessage(chatId, '❌ *Please link your account first* with /link.');
  }
  const text =
    `🔔 *Notification Settings*\n\n` +
    `🌅 Daily 5AM: *${settings.dailyReminder ? 'ON' : 'OFF'}*\n` +
    `⏱️ Interval: *${settings.interval} min*\n` +
    `🌙 Evening: *${settings.eveningCheckin ? 'ON' : 'OFF'}*\n` +
    `✅ Completion Check: *${settings.completionCheck ? 'ON' : 'OFF'}*\n` +
    `⏳ Countdown Alerts: *${settings.countdownAlerts ? 'ON' : 'OFF'}*\n` +
    `⚠️ Missed Alerts: *${settings.missedAlerts ? 'ON' : 'OFF'}*\n` +
    `📊 Weekly Summary: *${settings.weeklySummary ? 'ON' : 'OFF'}*\n\n` +
    `_Tap a button below to toggle a setting._`;
  return bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    ...getSettingsKeyboard(settings),
  });
}

async function handleHelp(chatId, userId) {
  const commands = [
    '*/start* – Welcome & main menu',
    '*/help* – This help',
    '*/link* <username> – Connect your account',
    '*/unlink* – Disconnect your account',
    '*/myid* – Show your Telegram user ID',
    '*/today* – Today\'s study target',
    '*/status* – Your progress overview',
    '*/streak* – Current streak & milestones',
    '*/countdown* – Exam countdown timer',
    '*/analytics* – Detailed statistics',
    '*/leaderboard* – Top performers (if enabled)',
    '*/us* – Notification settings',
  ];
  if (config.adminIds.includes(String(userId))) {
    commands.push('*/admin_panel* – Admin dashboard');
    commands.push('*/broadcast* – Send a broadcast');
    commands.push('*/log* – View error logs');
    commands.push('*/restart* – Restart bot polling');
  }
  return bot.sendMessage(chatId, `📚 *Command List*\n\n${commands.join('\n')}\n\n_Click the buttons below for quick actions._`, {
    parse_mode: 'Markdown',
    ...getMainMenuKeyboard()
  });
}

// ------------------------------
// COMMAND HANDLERS
// ------------------------------

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `🎯 *Welcome to Quant Tracker Bot V3!*\n\n` +
    `I'm your study companion. Track your daily targets, streaks, and exam readiness.\n\n` +
    `🔹 *Quick start:* Use /link <username> to connect your account.\n` +
    `🔹 Explore the menu below to get started. 👇`,
    getMainMenuKeyboard()
  );
});

// /help
bot.onText(/\/help/, (msg) => {
  handleHelp(msg.chat.id, msg.from.id);
});

// /link
bot.onText(/\/link (.+)/, async (msg, match) => {
  const username = match[1].trim().replace(/[@\s]/g, '');
  const chatId = msg.chat.id;

  if (!username || username.length < 2) {
    return bot.sendMessage(chatId, '❌ *Invalid username.* Please provide a valid username.');
  }

  try {
    const result = await apiCall('/api/telegram/link', 'POST', {
      telegramId: msg.from.id,
      username: username,
    });

    if (result.success) {
      bot.sendMessage(chatId, `✅ *Success!* Your Telegram is now linked to @${username}.\nYou can now use all bot features.`);
    } else {
      bot.sendMessage(chatId, `❌ *Link failed.* ${result.error || 'Please check that the username is correct and you\'ve registered on the web app.'}`);
    }
  } catch (e) {
    logError('/link', e);
    bot.sendMessage(chatId, `⚠️ *An error occurred.* Please try again later.`);
  }
});

// /unlink
bot.onText(/\/unlink/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    // Note: Server needs to add this endpoint
    const result = await apiCall(`/api/telegram/unlink/${userId}`, 'DELETE');
    if (result.success && result.data?.success) {
      bot.sendMessage(chatId, `✅ *Unlinked successfully.* Your account is no longer connected.`);
    } else {
      bot.sendMessage(chatId, `❌ No linked account found or failed to unlink.`);
    }
  } catch (e) {
    logError('/unlink', e);
    bot.sendMessage(chatId, `⚠️ An error occurred while unlinking. Please try again later.`);
  }
});

// /myid
bot.onText(/\/myid/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  bot.sendMessage(
    chatId,
    `🆔 *Your Telegram ID*\n\n` +
    `\`${userId}\`\n\n` +
    `_You can use this ID when contacting support or for configuration._`,
    { parse_mode: 'Markdown' }
  );
});

// /restart (admin only)
bot.onText(/\/restart/, async (msg) => {
  const chatId = msg.chat.id;
  if (!config.adminIds.includes(String(msg.from.id))) {
    return bot.sendMessage(chatId, '⛔ *Admin only.*');
  }
  try {
    await bot.sendMessage(chatId, '🔄 *Restarting bot polling...*');
    bot.stopPolling();
    setTimeout(async () => {
      bot.startPolling();
      await bot.sendMessage(chatId, '✅ *Polling restarted successfully.*');
    }, 1000);
  } catch (e) {
    logError('/restart', e);
    bot.sendMessage(chatId, '❌ Failed to restart polling.');
  }
});

// /today
bot.onText(/\/today/, (msg) => {
  handleToday(msg.chat.id, msg.from.id);
});

// /status
bot.onText(/\/status/, (msg) => {
  handleStatus(msg.chat.id, msg.from.id);
});

// /streak
bot.onText(/\/streak/, (msg) => {
  handleStreak(msg.chat.id, msg.from.id);
});

// /countdown
bot.onText(/\/countdown/, (msg) => {
  handleCountdown(msg.chat.id, msg.from.id);
});

// /analytics
bot.onText(/\/analytics/, (msg) => {
  handleAnalytics(msg.chat.id, msg.from.id);
});

// /leaderboard
bot.onText(/\/leaderboard/, (msg) => {
  handleLeaderboard(msg.chat.id);
});

// /us – settings
bot.onText(/\/us/, (msg) => {
  handleSettings(msg.chat.id, msg.from.id);
});

// /admin_panel
bot.onText(/\/admin_panel/, async (msg) => {
  if (!config.adminIds.includes(String(msg.from.id))) {
    return bot.sendMessage(msg.chat.id, '⛔ *Admin only.*');
  }
  const toggles = await getAdminToggles();
  bot.sendMessage(
    msg.chat.id,
    '⚡ *Admin Control Panel*\n\nChoose an action below:',
    {
      parse_mode: 'Markdown',
      ...getAdminPanelKeyboard(toggles.freeEnabled, toggles.devEnabled),
    }
  );
});

// /broadcast – admin command
bot.onText(/\/broadcast/, async (msg) => {
  if (!config.adminIds.includes(String(msg.from.id))) return;
  const text = msg.text.replace('/broadcast', '').trim();
  if (!text) return bot.sendMessage(msg.chat.id, '📢 *Usage:* `/broadcast <message>`');

  const confirmKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Yes, send', callback_data: 'broadcast_confirm' }],
        [{ text: '❌ Cancel', callback_data: 'broadcast_cancel' }],
      ],
    },
  };

  broadcastCache.set(msg.from.id, text);
  bot.sendMessage(
    msg.chat.id,
    `📢 *Broadcast Preview*\n\n` +
    `_You are about to send this message to all users:_\n\n` +
    `${text}\n\n` +
    `Proceed?`,
    confirmKeyboard
  );
});

// /log – admin log view
bot.onText(/\/log/, async (msg) => {
  if (!config.adminIds.includes(String(msg.from.id))) return;

  try {
    const data = await fsp.readFile(config.logFile, 'utf8').catch(() => '');
    const lines = data.split('\n').filter(l => l.trim()).slice(-20);

    if (lines.length === 0) {
      return bot.sendMessage(msg.chat.id, '✅ *No errors logged.*');
    }

    // Parse and format logs for readability
    const formattedLogs = lines.map(line => {
      try {
        const entry = JSON.parse(line);
        return `🕐 ${entry.timestamp}\n⚠️ ${entry.level}: ${entry.message}`;
      } catch {
        return line;
      }
    }).join('\n\n');

    await bot.sendMessage(msg.chat.id, `📋 *Last 20 errors:*\n\n${formattedLogs}`, { parse_mode: 'Markdown' });
  } catch (e) {
    logError('/log', e);
    bot.sendMessage(msg.chat.id, '❌ Failed to read log file.');
  }
});

// ------------------------------
// CALLBACK QUERY HANDLER
// ------------------------------
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  try {
    await bot.answerCallbackQuery(query.id);

    // ---- Broadcast confirmation ----
    if (data === 'broadcast_confirm') {
      if (!config.adminIds.includes(String(userId))) {
        return bot.sendMessage(chatId, '⛔ *Admin only.*');
      }
      const text = broadcastCache.get(userId);
      if (!text) {
        return bot.sendMessage(chatId, '❌ No broadcast message found. Use /broadcast again.');
      }
      const result = await apiCall('/api/bot/users');
      if (!result.success || !result.data || !result.data.length) {
        return bot.sendMessage(chatId, '❌ No users found to broadcast to.');
      }
      let success = 0, failed = 0;
      for (const user of result.data) {
        try {
          await bot.sendMessage(user.telegramId, `📢 *Broadcast*\n\n${text}`, { parse_mode: 'Markdown' });
          success++;
        } catch (e) {
          failed++;
          logError(`broadcast to ${user.telegramId}`, e);
        }
        await new Promise(r => setTimeout(r, 50));
      }
      broadcastCache.delete(userId);
      return bot.sendMessage(
        chatId,
        `✅ *Broadcast completed*\n\n` +
        `✅ Delivered: ${success}\n` +
        `❌ Failed: ${failed}`
      );
    }

    if (data === 'broadcast_cancel') {
      broadcastCache.delete(userId);
      return bot.sendMessage(chatId, '❌ *Broadcast cancelled.*');
    }

    // ---- Menu callbacks (using direct function calls) ----
    if (data === 'menu_today') {
      return await handleToday(chatId, userId);
    }
    if (data === 'menu_status') {
      return await handleStatus(chatId, userId);
    }
    if (data === 'menu_streak') {
      return await handleStreak(chatId, userId);
    }
    if (data === 'menu_countdown') {
      return await handleCountdown(chatId, userId);
    }
    if (data === 'menu_analytics') {
      return await handleAnalytics(chatId, userId);
    }
    if (data === 'menu_leaderboard') {
      return await handleLeaderboard(chatId);
    }
    if (data === 'menu_settings') {
      return await handleSettings(chatId, userId);
    }
    if (data === 'menu_help') {
      return await handleHelp(chatId, userId);
    }
    if (data === 'us_back_main') {
      return bot.sendMessage(chatId, '🔙 *Main Menu*', getMainMenuKeyboard());
    }

    // ---- Admin panel callbacks ----
    if (data.startsWith('admin_')) {
      if (!config.adminIds.includes(String(userId))) {
        return bot.sendMessage(chatId, '⛔ *Admin only.*');
      }

      if (data === 'admin_toggle_free') {
        const toggles = await getAdminToggles();
        await setAdminToggle('freeEnabled', !toggles.freeEnabled);
        const updated = await getAdminToggles();
        return await editMessageOrReply(query, '⚡ *Admin Control Panel*', getAdminPanelKeyboard(updated.freeEnabled, updated.devEnabled));
      }

      if (data === 'admin_toggle_dev') {
        const toggles = await getAdminToggles();
        await setAdminToggle('devEnabled', !toggles.devEnabled);
        const updated = await getAdminToggles();
        return await editMessageOrReply(query, '⚡ *Admin Control Panel*', getAdminPanelKeyboard(updated.freeEnabled, updated.devEnabled));
      }

      if (data === 'admin_refresh') {
        const toggles = await getAdminToggles();
        return await editMessageOrReply(query, '⚡ *Admin Control Panel*', getAdminPanelKeyboard(toggles.freeEnabled, toggles.devEnabled));
      }

      if (data === 'admin_view_logs') {
        const logs = memoryLogs.slice(-20).map(l => `🕐 ${l.timestamp}\n${l.level}: ${l.message}`).join('\n\n');
        const msgText = logs || '📭 *No logs in memory.*';
        return await bot.sendMessage(chatId, `📋 *Recent Logs*\n\n${msgText}`, { parse_mode: 'Markdown' });
      }

      if (data === 'admin_clear_logs') {
        try {
          await fsp.writeFile(config.logFile, '');
          memoryLogs.length = 0;
          return await bot.sendMessage(chatId, '🗑️ *Logs cleared successfully.*');
        } catch (e) {
          logError('clear logs', e);
          return await bot.sendMessage(chatId, '❌ Failed to clear logs.');
        }
      }

      if (data === 'admin_export_logs') {
        try {
          if (fs.existsSync(config.logFile)) {
            return await bot.sendDocument(chatId, config.logFile, { caption: '📤 Error Logs Export' });
          }
          return await bot.sendMessage(chatId, '❌ No log file to export.');
        } catch (e) {
          logError('export logs', e);
          return await bot.sendMessage(chatId, '❌ Failed to export logs.');
        }
      }

      if (data === 'admin_broadcast') {
        return await bot.sendMessage(chatId, '📢 Send broadcast with:\n`/broadcast <your message>`', { parse_mode: 'Markdown' });
      }

      if (data === 'admin_total_users') {
        const result = await apiCall('/api/bot/users');
        return await bot.sendMessage(chatId, `👥 *Total Users:* ${result.data?.length || 0}`);
      }

      if (data === 'admin_active_users') {
        const result = await apiCall('/api/bot/users?active=true');
        return await bot.sendMessage(chatId, `📈 *Active Users (7d):* ${result.data?.length || 0}`);
      }

      if (data === 'admin_health') {
        const uptime = process.uptime();
        const mem = process.memoryUsage();
        const nodeVer = process.version;
        const apiResult = await apiCall('/api/health');
        const dbResult = await apiCall('/api/db-health');
        const apiStatus = apiResult.success ? '✅' : '❌';
        const dbStatus = dbResult.success ? '✅' : '❌';
        const errors = memoryLogs.filter(l => l.level === 'ERROR').length;
        const warn = memoryLogs.filter(l => l.level === 'WARN').length;
        const healthMsg =
          `❤️ *Health Check*\n\n` +
          `🤖 *Bot Uptime:* ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n` +
          `💾 *Memory:* ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB\n` +
          `📦 *Node:* ${nodeVer}\n` +
          `🔗 *API:* ${apiStatus}\n` +
          `🗄️ *DB:* ${dbStatus}\n` +
          `⚠️ *Errors:* ${errors}\n` +
          `⚠️ *Warnings:* ${warn}`;
        return await bot.sendMessage(chatId, healthMsg, { parse_mode: 'Markdown' });
      }

      if (data === 'admin_back') {
        return bot.sendMessage(chatId, '🔙 *Main Menu*', getMainMenuKeyboard());
      }
    }

    // ---- User settings callbacks ----
    if (data.startsWith('us_')) {
      const settings = await getUserSettings(userId);
      if (!settings) {
        return bot.sendMessage(chatId, '❌ Please link your account first.');
      }

      if (data === 'us_toggle_daily') {
        settings.dailyReminder = !settings.dailyReminder;
        await updateUserSettings(userId, settings);
        return await editMessageOrReply(query, '🔔 *Settings updated.*', getSettingsKeyboard(settings));
      }

      if (data === 'us_toggle_evening') {
        settings.eveningCheckin = !settings.eveningCheckin;
        await updateUserSettings(userId, settings);
        return await editMessageOrReply(query, '🔔 *Settings updated.*', getSettingsKeyboard(settings));
      }

      if (data === 'us_toggle_completion') {
        settings.completionCheck = !settings.completionCheck;
        await updateUserSettings(userId, settings);
        return await editMessageOrReply(query, '🔔 *Settings updated.*', getSettingsKeyboard(settings));
      }

      if (data === 'us_toggle_countdown') {
        settings.countdownAlerts = !settings.countdownAlerts;
        await updateUserSettings(userId, settings);
        return await editMessageOrReply(query, '🔔 *Settings updated.*', getSettingsKeyboard(settings));
      }

      if (data === 'us_toggle_missed') {
        settings.missedAlerts = !settings.missedAlerts;
        await updateUserSettings(userId, settings);
        return await editMessageOrReply(query, '🔔 *Settings updated.*', getSettingsKeyboard(settings));
      }

      if (data === 'us_toggle_weekly') {
        settings.weeklySummary = !settings.weeklySummary;
        await updateUserSettings(userId, settings);
        return await editMessageOrReply(query, '🔔 *Settings updated.*', getSettingsKeyboard(settings));
      }

      if (data === 'us_interval') {
        const intervals = [30, 60, 90, 105, 120, 150, 180];
        const keyboard = intervals.map(val => [{
          text: `${val} min${settings.interval === val ? ' ✅' : ''}`,
          callback_data: `us_set_interval_${val}`,
        }]);
        keyboard.push([{ text: '🔙 Back', callback_data: 'us_back_settings' }]);
        return await editMessageOrReply(query, '⏱️ *Select reminder interval*', {
          reply_markup: { inline_keyboard: keyboard },
          parse_mode: 'Markdown',
        });
      }

      // Parse interval value safely
      const intervalMatch = data.match(/^us_set_interval_(\d+)$/);
      if (intervalMatch) {
        const val = parseInt(intervalMatch[1], 10);
        if (!isNaN(val) && val > 0) {
          settings.interval = val;
          await updateUserSettings(userId, settings);
          return await editMessageOrReply(query, '🔔 *Settings updated.*', getSettingsKeyboard(settings));
        }
      }

      if (data === 'us_back_settings') {
        const currentSettings = await getUserSettings(userId);
        if (currentSettings) {
          return await editMessageOrReply(query, '🔔 *Notification Settings*', getSettingsKeyboard(currentSettings));
        }
      }
    }
  } catch (err) {
    logError('callback_query', err);
    bot.sendMessage(chatId, '⚠️ *An error occurred.* Please try again later.');
  }
});

// ------------------------------
// COMMAND MENU (setMyCommands)
// ------------------------------
async function resetAndSetCommands() {
  try {
    const generalCommands = [
      { command: "start", description: "✅ Start the bot" },
      { command: "help", description: "📚 All commands" },
      { command: "link", description: "🔗 Link your account" },
      { command: "unlink", description: "🔓 Unlink your account" },
      { command: "myid", description: "🆔 Show your user ID" },
      { command: "today", description: "📅 Today's target" },
      { command: "status", description: "📊 Your progress" },
      { command: "streak", description: "🔥 Your streak" },
      { command: "countdown", description: "⏳ Exam countdown" },
      { command: "analytics", description: "📈 Detailed stats" },
      { command: "leaderboard", description: "🏆 Top users" },
      { command: "us", description: "🔔 Notification settings" },
    ];
    const adminExtra = [
      { command: "admin_panel", description: "⚡ Admin dashboard" },
      { command: "broadcast", description: "📢 Broadcast message" },
      { command: "log", description: "📋 View error logs" },
      { command: "restart", description: "🔄 Restart bot polling" },
    ];
    const adminCommands = generalCommands.concat(adminExtra);

    await axios.post(`https://api.telegram.org/bot${config.token}/setMyCommands`, {
      commands: generalCommands,
      scope: { type: "default" },
      language_code: "en"
    });

    for (const adminId of config.adminIds) {
      await axios.post(`https://api.telegram.org/bot${config.token}/setMyCommands`, {
        commands: adminCommands,
        scope: { type: "chat", chat_id: adminId },
        language_code: "en"
      });
    }
    logInfo('Bot commands updated successfully.');
  } catch (e) {
    logError('resetAndSetCommands', e);
  }
}

// ------------------------------
// STARTUP HEALTH CHECKS
// ------------------------------
async function startup() {
  logInfo('Starting Quant Tracker Bot V3...');

  try {
    await axios.get(`${config.apiUrl}/api/health`);
    logInfo('API connection OK.');
  } catch (e) {
    logError('API health check', e);
  }

  try {
    await axios.get(`${config.apiUrl}/api/db-health`);
    logInfo('Database connection OK.');
  } catch (e) {
    logWarn('Database health check failed', e);
  }

  await resetAndSetCommands();

  const ownerMsg =
    `🤖 *Quant Tracker V3 is Live!*\n\n` +
    `🕒 Uptime: ${process.uptime()}s\n` +
    `📦 Node: ${process.version}\n` +
    `💾 Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`;
  for (const id of config.adminIds) {
    try {
      await bot.sendMessage(id, ownerMsg, { parse_mode: 'Markdown' });
    } catch (e) {
      logError(`Notify owner ${id}`, e);
    }
  }
  logInfo('Startup complete.');
}

startup();

process.on('SIGINT', () => {
  logInfo('Shutting down...');
  bot.stopPolling();
  process.exit(0);
});

logInfo('Bot is running.');
