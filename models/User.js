const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  telegramId: { type: Number, default: null },
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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
