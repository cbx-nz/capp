// admin-server.js (with pre-orders support and category support for menu/specials)
const express = require('express');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const nodemailer = require('nodemailer');

dotenv.config();

const app = express();
const PORT = process.env.ADMIN_PORT || 5029;
const ADMIN_SECRET = process.env.SECRET_KEY || 'default_admin_secret';

const DATA_DIR = path.join(__dirname, 'data');
const PREORDERS_PATH = path.join(DATA_DIR, 'preorders.json');
const MENUS_PATH = path.join(__dirname, 'menus.json'); // menus.json is still in root for compat

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(ADMIN_SECRET));

// --- Serve public assets for dashboard image preview/fetching ---
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// --- Data helpers ---
function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf-8'));
}
function saveJSON(file, data) {
  fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2));
}
function loadDataJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
  } catch (e) {
    return fallback;
  }
}
function saveDataJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// --- Ensure data directory and files exist ---
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PREORDERS_PATH)) saveDataJSON('preorders.json', []);
if (!fs.existsSync(MENUS_PATH)) saveJSON('menus.json', []);

// --- Auth middleware ---
function requireAdminAuth(req, res, next) {
  const session = req.signedCookies.admin_session;
  if (!session) return res.redirect('/admin/index.html');
  try {
    const { user, school } = JSON.parse(session);
    const schools = loadJSON('schools.json');
    const schoolObj = schools.find(s => s.user === user && s.school === school);
    if (!schoolObj) throw new Error();
    req.adminUser = user;
    req.adminSchool = schoolObj;
    next();
  } catch {
    res.clearCookie('admin_session');
    return res.redirect('/admin/index.html');
  }
}

// --- Login/logout ---
app.post('/admin/login', (req, res) => {
  const { user, password, school } = req.body;
  if (!user || !password || !school) return res.status(400).json({ error: 'Missing fields' });
  const schools = loadJSON('schools.json');
  const schoolObj = schools.find(s => s.user === user && s.school === school);
  if (!schoolObj) return res.status(401).json({ error: 'Invalid user or school' });

  const hashEnvVar = schoolObj.password.replace('process.env.', '');
  const hash = process.env[hashEnvVar];
  if (!hash || !bcrypt.compareSync(password, hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.cookie('admin_session', JSON.stringify({ user, school }), {
    httpOnly: true,
    signed: true,
    sameSite: 'Strict',
    maxAge: 8 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

app.post('/admin/logout', (req, res) => {
  res.clearCookie('admin_session');
  res.json({ ok: true });
});

app.get('/admin/dashboard.html', requireAdminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

// --- Menu/Specials Management ---
app.get('/admin/api/menu', requireAdminAuth, (req, res) => {
  const menus = loadJSON('menus.json');
  const menuObj = menus.find(m => m.school === req.adminSchool.school);
  res.json(menuObj || { name: req.adminSchool.name, school: req.adminSchool.school, menu: {}, specials: {} });
});

app.post('/admin/api/menu', requireAdminAuth, (req, res) => {
  const { menu, specials } = req.body;
  const menus = loadJSON('menus.json');
  let menuObj = menus.find(m => m.school === req.adminSchool.school);
  if (!menuObj) {
    menuObj = { name: req.adminSchool.name, school: req.adminSchool.school, menu: {}, specials: {} };
    menus.push(menuObj);
  }
  if (menu && typeof menu === 'object') menuObj.menu = menu;
  if (specials && typeof specials === 'object') menuObj.specials = specials;
  saveJSON('menus.json', menus);
  res.json({ ok: true });
});

// --- Pre-orders Management ---
app.get('/admin/api/preorders', requireAdminAuth, (req, res) => {
  const preorders = loadDataJSON('preorders.json', []);
  // Optionally: only show preorders for this school
  // const filtered = preorders.filter(po => po.school === req.adminSchool.school);
  // res.json(filtered);
  res.json(preorders);
});
// Optional: Clear all pre-orders (dangerous, no auth check for school)
app.post('/admin/api/preorders/clear', requireAdminAuth, (req, res) => {
  saveDataJSON('preorders.json', []);
  res.json({ ok: true });
});

// --- Image upload for menu/specials ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const schoolValue = req.adminSchool?.school;
    if (!schoolValue) return cb(new Error('School not set'), null);
    const dir = path.join(__dirname, 'public', schoolValue);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});
const upload = multer({ storage });

app.post('/admin/upload', requireAdminAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const schoolValue = req.adminSchool?.school;
  const filename = path.basename(req.file.path);
  const publicPath = `/public/${schoolValue}/${filename}`;
  res.json({ ok: true, path: publicPath });
});

app.post('/admin/api/send-email', requireAdminAuth, async (req, res) => {
  const { to, subject, text, html } = req.body;
  if (!to || !subject || !(text || html)) return res.status(400).json({ error: 'Missing fields' });

  // Configure transporter
  let transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: +(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  try {
    await transporter.sendMail({
      from: `"CAPP Admin Inquiries" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      subject,
      text,
      html
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to send email', details: e.message });
  }
});

// --- 404 fallback --- //
app.use((req, res, next) => {
  if (req.path.startsWith('/public')) {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  } else if (req.path.startsWith('/admin')) {
    res.status(404).send('Not found');
  } else {
    res.status(404).send('Not found');
  }
});

app.listen(PORT, () => {
  console.log(`Admin server running at http://localhost:${PORT}/admin/`);
});