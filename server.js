// ─────────────────────────────────────────────────────────────
//  DriveGlow — Production-Ready Server
//  Email: EmailJS HTTP API (@emailjs/nodejs)
//  Works on: Railway, Render, Fly.io, localhost
//  SMTP ports are NOT used — pure HTTPS, never blocked.
// ─────────────────────────────────────────────────────────────

// Load .env ONLY in local development.
// On Railway/Render/Fly.io env vars are injected by the platform.
// dotenv v17 (dotenvx) overrides process.env by default — never call
// dotenv.config() in production or it overwrites platform values.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ override: false });
  console.log('[ENV] Loaded .env file (development mode)');
}

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const emailjs = require('@emailjs/nodejs');

const { generateReceiptPDF } = require('./receipt');

// ─── App & Port ───────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Global crash guards ──────────────────────────────────────
process.on('uncaughtException', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use. Stop the other process first.\n`);
    process.exit(1);
  }
  console.error('[UNCAUGHT EXCEPTION]', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── File Paths ───────────────────────────────────────────────
const DB_FILE      = path.join(__dirname, 'bookings.json');
const RECEIPTS_DIR = path.join(__dirname, 'logs', 'receipts');

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(RECEIPTS_DIR)) {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}

// ─────────────────────────────────────────────────────────────
//  EMAILJS CONFIGURATION
// ─────────────────────────────────────────────────────────────

const EMAILJS_SERVICE_ID       = (process.env.EMAILJS_SERVICE_ID       || '').trim();
const EMAILJS_TEMPLATE_ID      = (process.env.EMAILJS_TEMPLATE_ID      || '').trim();
// Owner template is optional — falls back to the main template if not set
const EMAILJS_OWNER_TEMPLATE_ID = (process.env.EMAILJS_OWNER_TEMPLATE_ID || EMAILJS_TEMPLATE_ID).trim();
const EMAILJS_PUBLIC_KEY       = (process.env.EMAILJS_PUBLIC_KEY       || '').trim();
const EMAILJS_PRIVATE_KEY      = (process.env.EMAILJS_PRIVATE_KEY      || '').trim();
const OWNER_EMAIL              = (process.env.OWNER_EMAIL              || '').trim();

// ── Startup diagnostic (safe — never prints actual key values) ──
console.log('\n[ENV DIAGNOSTIC]');
console.log(`  NODE_ENV                 : ${process.env.NODE_ENV || 'not set (treating as development)'}`);
console.log(`  EMAILJS_SERVICE_ID       : ${EMAILJS_SERVICE_ID  || '❌ MISSING'}`);
console.log(`  EMAILJS_TEMPLATE_ID      : ${EMAILJS_TEMPLATE_ID || '❌ MISSING'}`);
console.log(`  EMAILJS_OWNER_TEMPLATE_ID: ${EMAILJS_OWNER_TEMPLATE_ID || '(same as EMAILJS_TEMPLATE_ID)'}`);
console.log(`  EMAILJS_PUBLIC_KEY       : ${EMAILJS_PUBLIC_KEY  ? `✅ PRESENT (${EMAILJS_PUBLIC_KEY.length} chars)`  : '❌ MISSING'}`);
console.log(`  EMAILJS_PRIVATE_KEY      : ${EMAILJS_PRIVATE_KEY ? `✅ PRESENT (${EMAILJS_PRIVATE_KEY.length} chars)` : '❌ MISSING'}`);
console.log(`  OWNER_EMAIL              : ${OWNER_EMAIL || '❌ MISSING'}`);

const _emailjsReady = EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY && EMAILJS_PRIVATE_KEY && OWNER_EMAIL;
if (!_emailjsReady) {
  console.error('[ENV] ❌ One or more required EmailJS variables are missing — emails will not be sent.');
  console.error('[ENV]    Railway: Dashboard → your service → Variables tab');
  console.error('[ENV]    Required: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY, OWNER_EMAIL');
}
console.log('');

// EmailJS credentials object — reused for every send call
const EMAILJS_CREDENTIALS = { publicKey: EMAILJS_PUBLIC_KEY, privateKey: EMAILJS_PRIVATE_KEY };

// ─────────────────────────────────────────────────────────────
//  DATABASE HELPERS
// ─────────────────────────────────────────────────────────────

function readBookings() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    console.error('[DB] Error reading bookings:', err.message);
    return [];
  }
}

function writeBookings(bookings) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(bookings, null, 2));
  } catch (err) {
    console.error('[DB] Error writing bookings:', err.message);
    throw new Error('Failed to save booking to database.');
  }
}

// ─────────────────────────────────────────────────────────────
//  UTILITY HELPERS
// ─────────────────────────────────────────────────────────────

function generateBookingID() {
  const bookings = readBookings();
  let id, isUnique = false, attempts = 0;
  while (!isUnique && attempts < 100) {
    id = `DG-${Math.floor(10000 + Math.random() * 90000)}`;
    isUnique = !bookings.some(b => b.id === id);
    attempts++;
  }
  return id;
}

function formatDateNice(dateStr) {
  if (!dateStr) return 'N/A';
  const [y, m, d] = dateStr.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d))
    .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime12Hour(timeStr) {
  if (!timeStr) return 'N/A';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let hours  = parseInt(parts[0], 10);
  const mins = parts[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${mins} ${ampm}`;
}

function buildAddress(b) {
  return [
    b.flatNumber ? `Flat/Apt ${b.flatNumber}` : '',
    b.houseName  || '',
    b.street     || '',
    b.landmark   ? `Near ${b.landmark}` : '',
    b.city       || '',
    b.state      || '',
    b.pincode    || ''
  ].filter(p => typeof p === 'string' && p.trim() !== '').join(', ');
}

// ─────────────────────────────────────────────────────────────
//  EMAIL: CUSTOMER CONFIRMATION  (via EmailJS HTTP API)
//
//  Template variables available in your EmailJS template:
//    {{to_name}}          — customer's full name
//    {{to_email}}         — customer's email (EmailJS "To Email" field)
//    {{booking_id}}       — e.g. DG-48291
//    {{package_name}}     — e.g. Full Detail
//    {{vehicle}}          — e.g. Maruti Swift · MH01AB1234
//    {{appointment_date}} — e.g. 10 July 2026
//    {{appointment_time}} — e.g. 11:00 AM
//    {{address}}          — full service address
//    {{total_amount}}     — e.g. ₹2,499
// ─────────────────────────────────────────────────────────────
async function sendConfirmationEmail(booking) {
  if (!_emailjsReady) {
    throw new Error('EmailJS not configured — one or more required env vars are missing.');
  }
  if (!booking.email) {
    throw new Error('Customer email address is missing from booking.');
  }

  const templateParams = {
    to_name:          booking.customerName,
    to_email:         booking.email,
    booking_id:       booking.id,
    package_name:     booking.packageName,
    vehicle:          `${booking.vehicleBrand} ${booking.vehicleModel}${booking.vehicleRegistration ? ' · ' + booking.vehicleRegistration : ''}`,
    appointment_date: formatDateNice(booking.appointmentDate),
    appointment_time: formatTime12Hour(booking.appointmentTime),
    address:          booking.address || buildAddress(booking),
    total_amount:     `₹${Number(booking.price).toLocaleString('en-IN')}`,
  };

  console.log(`[EMAIL] Sending customer confirmation → ${booking.email}`);
  const response = await emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    templateParams,
    EMAILJS_CREDENTIALS
  );
  console.log(`[EMAIL] ✅ Customer confirmation sent (status: ${response.status} ${response.text})`);
  return response;
}

// ─────────────────────────────────────────────────────────────
//  EMAIL: OWNER NOTIFICATION  (via EmailJS HTTP API)
//
//  Template variables available in your EmailJS owner template:
//    {{to_email}}         — owner's email (OWNER_EMAIL env var)
//    {{booking_id}}       — e.g. DG-48291
//    {{customer_name}}    — customer full name
//    {{customer_email}}   — customer email address
//    {{customer_phone}}   — customer phone
//    {{package_name}}     — e.g. Full Detail
//    {{vehicle}}          — brand, model, reg
//    {{appointment_date}} — formatted date
//    {{appointment_time}} — formatted time
//    {{address}}          — full service address
//    {{total_amount}}     — e.g. ₹2,499
//    {{booked_at}}        — booking creation timestamp
// ─────────────────────────────────────────────────────────────
async function sendOwnerNotificationEmail(booking) {
  if (!_emailjsReady) {
    throw new Error('EmailJS not configured — one or more required env vars are missing.');
  }

  const templateParams = {
    to_email:         OWNER_EMAIL,
    booking_id:       booking.id,
    customer_name:    booking.customerName,
    customer_email:   booking.email,
    customer_phone:   booking.phone,
    package_name:     booking.packageName,
    vehicle:          `${booking.vehicleBrand} ${booking.vehicleModel}${booking.vehicleRegistration ? ' (' + booking.vehicleRegistration + ')' : ''}`,
    appointment_date: formatDateNice(booking.appointmentDate),
    appointment_time: formatTime12Hour(booking.appointmentTime),
    address:          booking.address || buildAddress(booking),
    total_amount:     `₹${Number(booking.price).toLocaleString('en-IN')}`,
    booked_at:        new Date(booking.createdAt).toLocaleString('en-IN'),
  };

  console.log(`[EMAIL] Sending owner notification → ${OWNER_EMAIL}`);
  const response = await emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_OWNER_TEMPLATE_ID,
    templateParams,
    EMAILJS_CREDENTIALS
  );
  console.log(`[EMAIL] ✅ Owner notification sent (status: ${response.status} ${response.text})`);
  return response;
}

// ─────────────────────────────────────────────────────────────
//  API ROUTES
// ─────────────────────────────────────────────────────────────

// POST /api/bookings — Create a new booking
app.post('/api/bookings', async (req, res) => {
  try {
    const {
      customerName, phone, email,
      houseName, flatNumber, street, landmark, city, state, pincode,
      vehicleBrand, vehicleModel, vehicleType, vehicleRegistration,
      packageName, price, appointmentDate, appointmentTime
    } = req.body;

    // ── Validate required fields ──────────────────────────────
    const missing = [];
    if (!customerName)    missing.push('Customer Name');
    if (!phone)           missing.push('Phone Number');
    if (!email)           missing.push('Email Address');
    if (!packageName)     missing.push('Package');
    if (!price)           missing.push('Price');
    if (!appointmentDate) missing.push('Appointment Date');
    if (!appointmentTime) missing.push('Appointment Time');
    if (!vehicleBrand)    missing.push('Vehicle Brand');
    if (!vehicleModel)    missing.push('Vehicle Model');

    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}.` });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address format.' });
    }

    // ── Build booking object ──────────────────────────────────
    const newBooking = {
      id:                  generateBookingID(),
      customerName:        customerName.trim(),
      phone:               phone.trim(),
      email:               email.trim().toLowerCase(),
      houseName:           (houseName           || '').trim(),
      flatNumber:          (flatNumber          || '').trim(),
      street:              (street              || '').trim(),
      landmark:            (landmark            || '').trim(),
      city:                (city                || '').trim(),
      state:               (state               || '').trim(),
      pincode:             (pincode             || '').trim(),
      address:             '',
      vehicleBrand:        (vehicleBrand        || '').trim(),
      vehicleModel:        (vehicleModel        || '').trim(),
      vehicleType:         (vehicleType         || '').trim(),
      vehicleRegistration: (vehicleRegistration || '').trim().toUpperCase(),
      packageName:         packageName.trim(),
      price:               parseFloat(price),
      appointmentDate,
      appointmentTime,
      status:              'Confirmed',
      createdAt:           new Date().toISOString(),
    };

    newBooking.address = buildAddress(newBooking);

    // ── Save booking FIRST — always, before attempting email ──
    const bookings = readBookings();
    bookings.push(newBooking);
    writeBookings(bookings);
    console.log(`[BOOKING] ✅ Created: ${newBooking.id} for ${newBooking.customerName} <${newBooking.email}>`);

    // ── Generate PDF receipt (non-fatal) ──────────────────────
    const pdfFileName = `DriveGlow-Receipt-${newBooking.id}.pdf`;
    const pdfFilePath = path.join(RECEIPTS_DIR, pdfFileName);

    try {
      const pdfStream = fs.createWriteStream(pdfFilePath);
      generateReceiptPDF(newBooking, pdfStream);
      await new Promise((resolve, reject) => {
        pdfStream.on('finish', resolve);
        pdfStream.on('error',  reject);
      });
      console.log(`[PDF] ✅ Receipt generated: ${pdfFileName}`);
    } catch (pdfErr) {
      console.error(`[PDF] ⚠️  Receipt generation failed (non-fatal): ${pdfErr.message}`);
    }

    // ── Send customer confirmation email (non-fatal) ──────────
    let emailSent  = false;
    let emailError = null;

    try {
      await sendConfirmationEmail(newBooking);
      emailSent = true;
    } catch (err) {
      emailError = err.message || (err.text ? `${err.status}: ${err.text}` : JSON.stringify(err));
      console.error(`[EMAIL] ❌ Customer confirmation FAILED for ${newBooking.email}`);
      console.error(`        err.message : ${err.message}`);
      console.error(`        err.status  : ${err.status}`);
      console.error(`        err.text    : ${err.text}`);
      console.error('[EMAIL] Full error:', JSON.stringify(err, null, 2));
    }

    // ── Send owner notification email (non-fatal) ─────────────
    let ownerNotified = false;

    try {
      await sendOwnerNotificationEmail(newBooking);
      ownerNotified = true;
    } catch (err) {
      console.error('[EMAIL] ❌ Owner notification FAILED');
      console.error(`        err.message : ${err.message}`);
      console.error(`        err.status  : ${err.status}`);
      console.error(`        err.text    : ${err.text}`);
      console.error('[EMAIL] Full error:', JSON.stringify(err, null, 2));
    }

    // ── Always return 201 — booking always succeeds ───────────
    return res.status(201).json({
      message:      'Booking completed successfully.',
      booking:      newBooking,
      emailSent,
      emailError,
      ownerNotified,
    });

  } catch (err) {
    console.error('[BOOKING] ❌ Unexpected error:', err.message, err.stack);
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// GET /api/bookings — All bookings, newest first
app.get('/api/bookings', (req, res) => {
  try {
    const bookings = readBookings();
    bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(bookings);
  } catch (err) {
    console.error('[BOOKINGS] Error:', err.message);
    return res.status(500).json({ error: 'Could not load bookings.' });
  }
});

// GET /api/bookings/:id — Single booking
app.get('/api/bookings/:id', (req, res) => {
  try {
    const bookings = readBookings();
    const booking  = bookings.find(b => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    return res.json(booking);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/bookings/:id/receipt — PDF download
app.get('/api/bookings/:id/receipt', (req, res) => {
  try {
    const bookings = readBookings();
    const booking  = bookings.find(b => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const pdfFileName = `DriveGlow-Receipt-${booking.id}.pdf`;
    const pdfFilePath = path.join(RECEIPTS_DIR, pdfFileName);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName}"`);

    if (fs.existsSync(pdfFilePath)) {
      fs.createReadStream(pdfFilePath).pipe(res);
    } else {
      generateReceiptPDF(booking, res);
    }
  } catch (err) {
    console.error('[RECEIPT] Error:', err.message);
    return res.status(500).json({ error: 'Could not generate receipt.' });
  }
});

// POST /api/bookings/:id/resend-email — Resend confirmation to customer
app.post('/api/bookings/:id/resend-email', async (req, res) => {
  try {
    const bookings = readBookings();
    const booking  = bookings.find(b => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    await sendConfirmationEmail(booking);
    return res.json({ message: 'Confirmation email resent successfully.', emailSent: true });
  } catch (err) {
    console.error('[RESEND] ❌ Resend email FAILED');
    console.error(`        err.message : ${err.message}`);
    console.error(`        err.status  : ${err.status}`);
    console.error(`        err.text    : ${err.text}`);
    console.error('[RESEND] Full error:', JSON.stringify(err, null, 2));
    return res.status(500).json({ error: err.message || err.text || 'Failed to resend email.', emailSent: false });
  }
});

// PUT /api/bookings/:id — Update booking
app.put('/api/bookings/:id', (req, res) => {
  try {
    const bookings = readBookings();
    const index    = bookings.findIndex(b => b.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Booking not found.' });

    const merged = {
      ...bookings[index],
      ...req.body,
      price:     req.body.price !== undefined ? parseFloat(req.body.price) : bookings[index].price,
      updatedAt: new Date().toISOString(),
    };
    merged.address  = buildAddress(merged);
    bookings[index] = merged;
    writeBookings(bookings);
    return res.json({ message: 'Booking updated successfully.', booking: merged });
  } catch (err) {
    console.error('[UPDATE] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/bookings/:id/status — Status update
app.post('/api/bookings/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Use: ${valid.join(', ')}.` });
    }

    const bookings = readBookings();
    const index    = bookings.findIndex(b => b.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Booking not found.' });

    bookings[index].status    = status;
    bookings[index].updatedAt = new Date().toISOString();
    writeBookings(bookings);
    return res.json({ message: 'Status updated.', booking: bookings[index] });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/bookings/:id
app.delete('/api/bookings/:id', (req, res) => {
  try {
    const bookings = readBookings();
    const filtered = bookings.filter(b => b.id !== req.params.id);
    if (bookings.length === filtered.length) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    writeBookings(filtered);
    return res.json({ message: 'Booking deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 404 fallback for unknown API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// ─────────────────────────────────────────────────────────────
//  NETWORK HELPERS
// ─────────────────────────────────────────────────────────────
function getLocalIPAddresses() {
  const ifaces = os.networkInterfaces();
  const list   = [];
  for (const name in ifaces) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal) list.push({ name, address: net.address });
    }
  }
  return list;
}

// ─────────────────────────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const ipList       = getLocalIPAddresses();

  console.log('\n==================================================');
  console.log('  DRIVEGLOW LUXURY DETAILING SERVER');
  console.log(`  Environment : ${isProduction ? 'PRODUCTION (Railway)' : 'DEVELOPMENT'}`);
  console.log('  Email       : EmailJS HTTP API (no SMTP, no port blocks)');
  console.log('==================================================');

  if (isProduction) {
    console.log('  Access your site at your Railway public URL.');
  } else {
    console.log(`  Laptop : http://localhost:${PORT}`);
    console.log('  Mobile (same Wi-Fi):');
    ipList.forEach(ip => {
      const n = ip.name.toLowerCase();
      const label =
        (n.includes('wi-fi') || n.includes('wlan') || n.includes('wireless')) ? '✅ Wi-Fi' :
        (n.includes('vmnet') || n.includes('vethernet'))                       ? '⛔ Virtual (skip)' :
        'LAN';
      console.log(`  • http://${ip.address}:${PORT}  [${ip.name} — ${label}]`);
    });
  }

  console.log('--------------------------------------------------');
  console.log(`  EMAILJS_SERVICE_ID  : ${EMAILJS_SERVICE_ID  || '⚠️  NOT SET'}`);
  console.log(`  EMAILJS_TEMPLATE_ID : ${EMAILJS_TEMPLATE_ID || '⚠️  NOT SET'}`);
  console.log(`  EMAILJS_PUBLIC_KEY  : ${EMAILJS_PUBLIC_KEY  ? '✅ SET' : '⚠️  NOT SET'}`);
  console.log(`  EMAILJS_PRIVATE_KEY : ${EMAILJS_PRIVATE_KEY ? '✅ SET' : '⚠️  NOT SET'}`);
  console.log(`  OWNER_EMAIL         : ${OWNER_EMAIL         || '⚠️  NOT SET'}`);
  console.log('==================================================\n');
});
