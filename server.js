// ==========================================
// DNS FIX for Windows (MongoDB SRV Error)
// ==========================================
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']); 

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const cors = require('cors');
const multer = require('multer');

const config = require('./config');
const { Player, Admin, VerifyRequest, Setting, connect } = require('./db');

// Multer (শুধু FormData পার্স করার জন্য)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// CORS
if (config.corsOrigin) {
  app.use(cors({
    origin: config.corsOrigin.split(',').map(s => s.trim()),
    credentials: true
  }));
}

// Chrome DevTools silencer
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.json({ workspace: { root: process.cwd(), uuid: 'dev' } });
});

app.use(express.static(path.join(__dirname, 'public')));

// ---- Rate limiters ----
const verifyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// ---- Email Setup (Brevo SMTP) ----
const hasSmtp = !!(config.smtp.host && config.smtp.auth.user && config.smtp.auth.pass);
const transporter = hasSmtp ? nodemailer.createTransport({
  host: config.smtp.host, // smtp-relay.brevo.com
  port: config.smtp.port, // 587
  secure: config.smtp.secure, // false
  auth: {
    user: config.smtp.auth.user, // আপনার Brevo ইমেইল
    pass: config.smtp.auth.pass  // Brevo SMTP Key
  }
}) : null;

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function sendMail(to, subject, html, text) {
  if (!hasSmtp || !transporter) {
    console.log('\n=== EMAIL (NO PROVIDER) ===\nTo:', to, '\nSubject:', subject, '\nText:', text || '(html only)', '\n=============\n');
    return;
  }

  try {
    await transporter.sendMail({
      from: config.fromEmail, 
      to: to,
      subject: subject,
      html: html,
      text: text
    });
    console.log(`✔ Email sent via Brevo to ${to}`);
  } catch (e) {
    console.error('❌ Brevo Email failed to', to, ':', e.message);
  }
}

async function sendVerificationEmail(email, link) {
  const html = `<div style="font-family:Arial;max-width:520px;margin:0 auto;padding:24px;background:#04120c;color:#fff;border-radius:12px">
    <h2 style="color:#34d399">${esc(config.tournamentName)}</h2>
    <p>Please verify your email to continue your registration.</p>
    <p style="text-align:center;margin:28px 0"><a href="${link}" style="display:inline-block;padding:14px 28px;background:#34d399;color:#04120c;font-weight:700;text-decoration:none;border-radius:10px">Verify my email</a></p>
    <p style="font-size:12px;color:#9ca3af">Or copy: ${link}</p>
  </div>`;
  await sendMail(email, 'Verify your registration — ' + config.tournamentName, html, 'Verify: ' + link);
}

async function sendAdminNewPlayer(p) {
  const html = `<div style="font-family:Arial;padding:24px;background:#f5f5f5;max-width:600px;margin:0 auto;border-radius:12px">
    <h2 style="margin:0 0 16px">New registration pending approval</h2>
    <table style="border-collapse:collapse;font-size:14px">
      <tr><td style="padding:4px 12px 4px 0"><b>Name:</b></td><td>${esc(p.name)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><b>WhatsApp:</b></td><td>${esc(p.mobile)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><b>Position:</b></td><td>${esc(p.position)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><b>bKash:</b></td><td>${esc(p.bkashNumber)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><b>TrxID:</b></td><td>${esc(p.bkashTrxid)}</td></tr>
    </table>
    <p style="margin-top:20px"><a href="${config.baseUrl}/admin" style="background:#04120c;color:#34d399;padding:10px 20px;text-decoration:none;border-radius:8px;display:inline-block">Open Admin Panel</a></p>
  </div>`;
  await sendMail(config.adminEmail, 'New registration: ' + p.name, html, 'New: ' + p.name);
}

async function sendUserSubmitted(p) {
  const html = `<div style="font-family:Arial;max-width:520px;margin:0 auto;padding:24px;background:#04120c;color:#fff;border-radius:12px">
    <h2 style="color:#34d399">Registration submitted!</h2>
    <p>Hi <strong>${esc(p.name)}</strong>,</p>
    <p>Your registration for <b>${esc(config.tournamentName)}</b> is <b style="color:#fbbf24">pending admin approval</b>.</p>
  </div>`;
  await sendMail(p.email, 'Registration submitted — ' + config.tournamentName, html, 'Registration submitted.');
}

async function sendUserApproved(p) {
  const html = `<div style="font-family:Arial;max-width:520px;margin:0 auto;padding:24px;background:#04120c;color:#fff;border-radius:12px">
    <h2 style="color:#34d399">You are confirmed!</h2>
    <p>Hi <strong>${esc(p.name)}</strong>, Your registration is <b style="color:#34d399">APPROVED</b>.</p>
  </div>`;
  await sendMail(p.email, 'You are confirmed! — ' + config.tournamentName, html, 'Your registration is APPROVED.');
}

// ---- DB ready middleware ----
let dbReady = false;
app.use(async (req, res, next) => {
  if (!dbReady) {
    try { await connect(); dbReady = true; } 
    catch (e) {
      console.error('DB connection failed:', e.message);
      if (req.path.startsWith('/api/')) return res.status(500).json({ ok: false, error: 'Database unavailable' });
    }
  }
  next();
});

// ============ PUBLIC ============
app.get('/api/config', async (req, res) => {
  try {
    let settings = await Setting.findOne({ key: 'global' });
    if (!settings) {
      settings = await Setting.create({
        key: 'global',
        bkashNumber: config.bkash.number,
        bkashAmount: config.bkash.amount
      });
    }

    res.json({
      tournamentName: config.tournamentName,
      bkashNumber: settings.bkashNumber,
      bkashAmount: settings.bkashAmount,
      positions: config.positions,
      sizes: config.sizes,
      categories: config.categories
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'Server error' });
  }
});

app.get('/api/health', async (req, res) => {
  try { await connect(); res.json({ ok: true, db: 'connected' }); } 
  catch (e) { res.status(500).json({ ok: false, db: 'failed', error: e.message }); }
});

// ============ REGISTRATION ============

app.post('/api/register/request-verification', verifyLimiter, async (req, res) => {
  try {
    const { whatsapp, email } = req.body || {};
    if (!/^[0-9]{10}$/.test(whatsapp || '')) return res.status(400).json({ ok: false, error: 'Invalid WhatsApp' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) return res.status(400).json({ ok: false, error: 'Invalid email' });

    const fullPhone = '+880' + whatsapp;
    const normalizedEmail = email.toLowerCase().trim();

    const exists = await Player.findOne({ email: normalizedEmail });
    if (exists) return res.status(409).json({ ok: false, error: 'Email already registered.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await VerifyRequest.updateMany({ email: normalizedEmail, used: false }, { used: true });
    await VerifyRequest.create({ email: normalizedEmail, whatsapp: fullPhone, token, expiresAt });

    const link = config.baseUrl + '/verify-email?token=' + token;
    
    // 🚀 await সরিয়ে দেওয়া হলো, ইমেইল ব্যাকগ্রাউন্ডে যাবে, সার্ভার আটকে থাকবে না
    sendVerificationEmail(normalizedEmail, link).catch(e => console.error('Email error:', e.message));
    
    // ইউজার সাথে সাথে রেসপন্স পাবে
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: 'Server error' }); }
});

app.get('/verify-email', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).send('Invalid link.');
    const row = await VerifyRequest.findOne({ token, used: false });
    if (!row || row.expiresAt < new Date()) return res.status(400).send('Invalid or expired link.');
    row.used = true; await row.save();
    
    const sessionToken = jwt.sign({ email: row.email, whatsapp: row.whatsapp, type: 'verify' }, config.jwtSecret, { expiresIn: '30m' });
    res.cookie('verify_session', sessionToken, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 60 * 1000, secure: config.baseUrl.startsWith('https') });
    res.redirect('/fillup?verified=1');
  } catch (e) { res.status(500).send('Server error'); }
});

app.get('/api/register/session', (req, res) => {
  const token = req.cookies.verify_session;
  if (!token) return res.json({ ok: true, verified: false });
  try {
    const data = jwt.verify(token, config.jwtSecret);
    if (data.type !== 'verify') return res.json({ ok: true, verified: false });
    res.json({ ok: true, verified: true, email: data.email, whatsapp: data.whatsapp });
  } catch { res.json({ ok: true, verified: false }); }
});

app.post('/api/register/submit', submitLimiter, async (req, res) => {
  try {
    const token = req.cookies.verify_session;
    if (!token) return res.status(401).json({ ok: false, error: 'Verify email first.' });
    const session = jwt.verify(token, config.jwtSecret);
    
    const b = req.body || {};
    const errors = {};
    if (!b.name || b.name.trim().length < 3) errors.name = 'Enter full name';
    if (!b.fatherName || !b.fatherName.trim()) errors.fatherName = 'Enter father name';
    if (!b.address || !b.address.trim()) errors.address = 'Enter address';
    if (!config.positions.includes(b.position)) errors.position = 'Pick position';
    if (!config.sizes.includes(b.jerseySize)) errors.jerseySize = 'Pick size';
    if (!/^[0-9]{1,2}$/.test(b.jerseyNumber || '')) errors.jerseyNumber = 'Pick number';
    if (!/^01[0-9]{9}$/.test(b.bkashNumber || '')) errors.bkashNumber = 'Invalid bKash';
    if (!b.bkashTrxid || b.bkashTrxid.trim().length < 6) errors.bkashTrxid = 'Enter TrxID';
    if (!b.referrerName || !b.referrerName.trim()) errors.referrerName = 'Enter referrer';

    if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });
    
    if (await Player.findOne({ email: session.email })) return res.status(409).json({ ok: false, error: 'Already registered.' });

    const player = await Player.create({
      name: b.name.trim(), fatherName: b.fatherName.trim(), mobile: session.whatsapp, email: session.email,
      address: b.address.trim(), position: b.position, jerseySize: b.jerseySize, jerseyNumber: b.jerseyNumber,
      bkashNumber: b.bkashNumber.trim(), bkashTrxid: b.bkashTrxid.trim(), referrerName: b.referrerName.trim(),
      status: 'pending', emailVerified: true
    });

    // Non-blocking emails
    sendAdminNewPlayer(player).catch(() => {});
    sendUserSubmitted(player).catch(() => {});
    
    res.clearCookie('verify_session');
    res.json({ ok: true, id: player._id });
  } catch (e) { res.status(500).json({ ok: false, error: 'Server error' }); }
});

// ============ ADMIN ============

app.post('/api/admin/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const admin = await Admin.findOne({ username: username || '' });
    if (!admin || !bcrypt.compareSync(password || '', admin.passwordHash)) {
      return res.status(401).json({ ok: false, error: 'Wrong username or password' });
    }
    const token = jwt.sign({ id: admin._id, username: admin.username }, config.jwtSecret, { expiresIn: '12h' });
    res.cookie('admin_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 12 * 60 * 60 * 1000, secure: config.baseUrl.startsWith('https') });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: 'Server error' }); }
});

app.post('/api/admin/logout', (req, res) => { res.clearCookie('admin_token'); res.json({ ok: true }); });

function requireAdmin(req, res, next) {
  const token = req.cookies.admin_token;
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  try { req.admin = jwt.verify(token, config.jwtSecret); next(); }
  catch { return res.status(401).json({ ok: false, error: 'Unauthorized' }); }
}

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ ok: true, username: req.admin.username, tournamentName: config.tournamentName });
});

app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    let settings = await Setting.findOne({ key: 'global' });
    if (!settings) {
      settings = await Setting.create({ key: 'global', bkashNumber: config.bkash.number, bkashAmount: config.bkash.amount });
    }
    res.json({ ok: true, settings });
  } catch (e) { res.status(500).json({ ok: false, error: 'Server error' }); }
});

app.post('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const { bkashNumber, bkashAmount } = req.body || {};
    if (!/^01[0-9]{9}$/.test(bkashNumber || '')) {
      return res.status(400).json({ ok: false, error: 'Invalid bKash number (11 digits starting with 01)' });
    }
    if (!bkashAmount || isNaN(bkashAmount) || bkashAmount < 1) {
      return res.status(400).json({ ok: false, error: 'Enter a valid amount' });
    }

    const settings = await Setting.findOneAndUpdate(
      { key: 'global' },
      { bkashNumber, bkashAmount: Number(bkashAmount) },
      { new: true, upsert: true }
    );
    res.json({ ok: true, settings });
  } catch (e) { res.status(500).json({ ok: false, error: 'Server error' }); }
});

app.get('/api/admin/players', requireAdmin, async (req, res) => {
  try {
    const players = await Player.find().sort({ createdAt: -1 }).lean();
    res.json({ ok: true, players, categories: config.categories });
  } catch (e) { res.status(500).json({ ok: false, error: 'Server error' }); }
});

app.patch('/api/admin/players/:id', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const update = {};
    if (b.category !== undefined) update.category = String(b.category);
    if (b.status !== undefined) {
      if (!['pending', 'approved', 'rejected'].includes(b.status)) return res.status(400).json({ ok: false, error: 'Invalid status' });
      update.status = b.status;
      if (b.status === 'approved') update.paymentVerified = true;
    }
    if (!Object.keys(update).length) return res.status(400).json({ ok: false, error: 'Nothing to update' });

    const player = await Player.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!player) return res.status(404).json({ ok: false, error: 'Player not found' });

    if (b.status === 'approved') sendUserApproved(player).catch(() => {});
    res.json({ ok: true, player });
  } catch (e) { res.status(500).json({ ok: false, error: 'Server error' }); }
});

app.patch('/api/admin/players/:id/edit', requireAdmin, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ ok: false, error: 'Player not found' });
    const b = req.body || {};
    const errors = {};

    if (b.name !== undefined) { if (!b.name.trim() || b.name.trim().length < 3) errors.name = 'Too short'; else player.name = b.name.trim(); }
    if (b.fatherName !== undefined) { if (!b.fatherName.trim()) errors.fatherName = 'Required'; else player.fatherName = b.fatherName.trim(); }
    if (b.mobile !== undefined) { if (!/^01[0-9]{9}$/.test(b.mobile)) errors.mobile = 'Invalid'; else player.mobile = b.mobile; }
    if (b.email !== undefined) {
      const em = b.email.toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) errors.email = 'Invalid';
      else {
        const dup = await Player.findOne({ email: em, _id: { $ne: player._id } });
        if (dup) errors.email = 'Already exists';
        else player.email = em;
      }
    }
    if (b.address !== undefined) { if (!b.address.trim()) errors.address = 'Required'; else player.address = b.address.trim(); }
    if (b.position !== undefined) { if (!config.positions.includes(b.position)) errors.position = 'Invalid'; else player.position = b.position; }
    if (b.jerseySize !== undefined) { if (!config.sizes.includes(b.jerseySize)) errors.jerseySize = 'Invalid'; else player.jerseySize = b.jerseySize; }
    if (b.jerseyNumber !== undefined) { if (!/^[0-9]{1,2}$/.test(b.jerseyNumber)) errors.jerseyNumber = 'Invalid'; else player.jerseyNumber = b.jerseyNumber; }
    if (b.bkashNumber !== undefined) { if (!/^01[0-9]{9}$/.test(b.bkashNumber)) errors.bkashNumber = 'Invalid'; else player.bkashNumber = b.bkashNumber; }
    if (b.bkashTrxid !== undefined) { if (!b.bkashTrxid.trim() || b.bkashTrxid.trim().length < 6) errors.bkashTrxid = 'Too short'; else player.bkashTrxid = b.bkashTrxid.trim(); }
    if (b.referrerName !== undefined) player.referrerName = b.referrerName.trim();
    if (b.category !== undefined) player.category = String(b.category);
    if (b.status !== undefined) { if (!['pending', 'approved', 'rejected'].includes(b.status)) errors.status = 'Invalid'; else player.status = b.status; }
    if (b.paymentVerified !== undefined) player.paymentVerified = !!b.paymentVerified;

    if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });

    await player.save();
    res.json({ ok: true, player });
  } catch (e) { res.status(500).json({ ok: false, error: 'Server error' }); }
});

app.delete('/api/admin/players/:id', requireAdmin, async (req, res) => {
  try { await Player.findByIdAndDelete(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: 'Server error' }); }
});

app.get('/api/admin/export.csv', requireAdmin, async (req, res) => {
  try {
    const players = await Player.find().sort({ createdAt: -1 }).lean();
    const cols = ['_id', 'name', 'fatherName', 'mobile', 'email', 'address', 'position', 'jerseySize', 'jerseyNumber', 'bkashNumber', 'bkashTrxid', 'referrerName', 'category', 'status', 'createdAt'];
    const e = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = [cols.join(',')].concat(players.map(r => cols.map(c => e(r[c])).join(','))).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="players.csv"');
    res.send('\uFEFF' + csv);
  } catch (e) { res.status(500).send('Export failed'); }
});

app.get('/fillup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'fillup.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

module.exports = app;

if (require.main === module) {
  connect().then(() => {
    app.listen(config.port, '0.0.0.0', () => {
      console.log('\n  ' + config.tournamentName);
      console.log('  Home  : http://localhost:' + config.port);
      console.log('  Admin : http://localhost:' + config.port + '/admin');
      console.log('  Email : ' + (hasSmtp ? '✓ SMTP (Brevo)' : '✗ Not configured'));
      console.log('');
    });
  }).catch(err => { console.error('Failed to start:', err.message); process.exit(1); });
}
