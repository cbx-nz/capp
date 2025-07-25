// public-server.js (with pre-orders support and category support for menu/specials)
const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PUBLIC_PORT || 4999;

// Data paths and helpers
const DATA_DIR = path.join(__dirname, 'data');
const PREORDERS_PATH = path.join(DATA_DIR, 'preorders.json');
const MENUS_PATH = path.join(__dirname, 'menus.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.use('/schools.json', express.static(path.join(__dirname, 'schools.json')));

// Utility to load JSON
function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf-8'));
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
if (!fs.existsSync(MENUS_PATH)) fs.writeFileSync(MENUS_PATH, '[]');

// API endpoint: get menu/specials for a school
app.get('/public/:school/api/menu', (req, res) => {
  const schoolValue = req.params.school;
  let menus;
  try {
    menus = loadJSON('menus.json');
    if (!Array.isArray(menus)) throw new Error('menus.json not an array');
  } catch (e) {
    return res.json({ name: schoolValue, school: schoolValue, menu: {}, specials: {} });
  }
  const menuObj = menus.find(m => m.school === schoolValue);
  if (!menuObj || typeof menuObj !== 'object') {
    return res.json({ name: schoolValue, school: schoolValue, menu: {}, specials: {} });
  }
  // Always return object with menu/specials, even if empty
  return res.json({
    name: menuObj.name || schoolValue,
    school: menuObj.school || schoolValue,
    menu: menuObj.menu || {},
    specials: menuObj.specials || {}
  });
});

// API endpoint: Accept pre-order
app.post('/public/api/preorder', (req, res) => {
  const { type, item, name, quantity, note } = req.body;
  if (!type || !item || !name || !quantity || isNaN(quantity) || quantity <= 0) {
    return res.status(400).json({ error: "Missing/invalid fields" });
  }
  const preorders = loadDataJSON('preorders.json', []);
  // Optionally you may want to also store the school field
  preorders.push({
    type, item, name, quantity: Number(quantity), note: note || "",
    time: new Date().toISOString()
  });
  saveDataJSON('preorders.json', preorders);
  res.json({ ok: true });
});

// School selector (static index.html)
app.get(['/public', '/public/index.html'], (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// Per-school landing page (static school-index.html)
app.get('/public/:school/index.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'school-index.html'))
);

// Menu page (static menu.html)
app.get('/public/:school/menu.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'menu.html'))
);

// Specials page (static specials.html)
app.get('/public/:school/specials.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'specials.html'))
);

app.post('/public/api/send-email', async (req, res) => {
  const { subject, text, html } = req.body;
  if (!subject || !(text || html)) return res.status(400).json({ error: 'Missing fields' });

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
      from: `"CAPP Inquiries" <${process.env.SMTP_USER}>`,
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

// Serve 404.html for all other unmatched public routes (except API)
app.use((req, res, next) => {
  if (req.path.startsWith('/public') && !req.path.includes('/api/')) {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  } else {
    res.status(404).send('Not found');
  }
});

app.listen(PORT, () => {
  console.log(`Public server running at http://localhost:${PORT}/public`);
});