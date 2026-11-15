const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('./config');

// ---- Schemas ----
const playerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  fatherName: { type: String, required: true, trim: true },
  mobile: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  address: { type: String, required: true, trim: true },
  position: { type: String, required: true },
  jerseySize: { type: String, required: true },
  jerseyNumber: { type: String, required: true },
  bkashNumber: { type: String, required: true },
  bkashTrxid: { type: String, required: true },
  referrerName: { type: String, default: '' },
  category: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  emailVerified: { type: Boolean, default: true },
  paymentVerified: { type: Boolean, default: false }
}, { timestamps: true });

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true }
}, { timestamps: true });

const verifyRequestSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  whatsapp: { type: String, required: true },
  token: { type: String, required: true, unique: true, index: true },
  used: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

// নতুন সেটিংস স্কিমা (bKash নাম্বার ও ফি সেভ করার জন্য)
const settingSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'global' },
  bkashNumber: { type: String, required: true },
  bkashAmount: { type: Number, required: true }
}, { timestamps: true });

verifyRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

const Player = mongoose.model('Player', playerSchema);
const Admin = mongoose.model('Admin', adminSchema);
const VerifyRequest = mongoose.model('VerifyRequest', verifyRequestSchema);
const Setting = mongoose.model('Setting', settingSchema);

let cached = global._mongoCache || (global._mongoCache = { conn: null, promise: null });

async function connect() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 10
    }).then(m => {
      console.log('✔ MongoDB connected');
      return m;
    }).catch(err => {
      cached.promise = null;
      throw err;
    });
  }
  cached.conn = await cached.promise;

  try {
    const count = await Admin.countDocuments();
    if (count === 0) {
      const hash = bcrypt.hashSync(config.admin.password, 10);
      await Admin.create({ username: config.admin.username, passwordHash: hash });
      console.log('✔ Admin seeded: ' + config.admin.username);
    }
  } catch (e) {
    console.error('Admin seed warning:', e.message);
  }

  return cached.conn;
}

module.exports = { mongoose, Player, Admin, VerifyRequest, Setting, connect };