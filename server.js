// ─────────────────────────────────────────────────────────────
//  DriveGlow — Production-Ready Server
//  Works on localhost AND Render deployment
// ─────────────────────────────────────────────────────────────
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const nodemailer = require('nodemailer');

const { generateReceiptPDF } = require('./receipt');

// ─── App & Port ───────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Global crash guards ──────────────────────────────────────
// EADDRINUSE must still exit so node --watch can restart cleanly.
// All other unexpected errors are logged but server stays alive.
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

// Ensure required directories / files exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(RECEIPTS_DIR)) {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}

// ─────────────────────────────────────────────────────────────
//  EMAIL CONFIGURATION — log every variable at startup
// ─────────────────────────────────────────────────────────────

// Read and clean env vars once at module load
const EMAIL_HOST   = (process.env.EMAIL_HOST   || '').trim();
const EMAIL_PORT   = parseInt(process.env.EMAIL_PORT || '465', 10);
const EMAIL_SECURE = process.env.EMAIL_SECURE === 'true' || EMAIL_PORT === 465;
const EMAIL_USER   = (process.env.EMAIL_USER   || '').trim();
// Strip spaces — Google App Passwords are shown with spaces but must be used without
const EMAIL_PASS   = (process.env.EMAIL_PASS   || '').replace(/\s+/g, '');
const EMAIL_FROM   = (process.env.EMAIL_FROM   || EMAIL_USER).trim();

console.log('\n[EMAIL CONFIG CHECK]');
console.log(`  EMAIL_HOST   : ${EMAIL_HOST   || '⚠️  NOT SET'}`);
console.log(`  EMAIL_PORT   : ${EMAIL_PORT}`);
console.log(`  EMAIL_SECURE : ${EMAIL_SECURE}`);
console.log(`  EMAIL_USER   : ${EMAIL_USER   || '⚠️  NOT SET'}`);
console.log(`  EMAIL_PASS   : ${EMAIL_PASS   ? '✅ SET (' + EMAIL_PASS.length + ' chars)' : '⚠️  NOT SET'}`);
console.log(`  EMAIL_FROM   : ${EMAIL_FROM   || '⚠️  NOT SET'}`);
if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
  console.warn('  ⚠️  One or more EMAIL env vars are missing.');
  console.warn('  If on Railway: Dashboard → your service → Variables → add EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE, EMAIL_USER, EMAIL_PASS, EMAIL_FROM');
}
console.log('');

// ─────────────────────────────────────────────────────────────
//  MAIL TRANSPORTER
//  - Created ONCE and cached
//  - Only cached after SUCCESSFUL verification
//  - Uses SSL port 465 by default (works on Render)
//  - Falls back to STARTTLS port 587 if EMAIL_PORT is set to 587
// ─────────────────────────────────────────────────────────────
let _transporter = null;
let _transporterVerified = false;

async function getVerifiedTransporter() {
  // Return verified cached transporter immediately
  if (_transporter && _transporterVerified) return _transporter;

  // Cannot build transporter without credentials
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
    throw new Error(
      'SMTP credentials missing. Set EMAIL_HOST, EMAIL_USER, EMAIL_PASS environment variables.'
    );
  }

  // Create fresh transporter
  const transport = nodemailer.createTransport({
    host:   EMAIL_HOST,
    port:   EMAIL_PORT,
    secure: EMAIL_SECURE,        // true for port 465, false for 587
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false, // allow self-signed certs
    },
    connectionTimeout: 20000,    // 20s — generous for Render cold starts
    greetingTimeout:   20000,
    socketTimeout:     45000,    // 45s socket timeout
  });

  // Verify the connection (throws if SMTP credentials are wrong)
  console.log(`[EMAIL] Verifying SMTP connection to ${EMAIL_HOST}:${EMAIL_PORT}...`);
  await transport.verify();
  console.log('[EMAIL] ✅ SMTP connection verified successfully.');

  _transporter = transport;
  _transporterVerified = true;
  return _transporter;
}

// ─────────────────────────────────────────────────────────────
//  DATABASE HELPERS
// ─────────────────────────────────────────────────────────────

function readBookings() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
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
  let id;
  let isUnique = false;
  let attempts = 0;
  while (!isUnique && attempts < 100) {
    const num = Math.floor(10000 + Math.random() * 90000);
    id = `DG-${num}`;
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
  ].filter(part => typeof part === 'string' && part.trim() !== '').join(', ');
}

// ─────────────────────────────────────────────────────────────
//  EMAIL: CUSTOMER CONFIRMATION
// ─────────────────────────────────────────────────────────────
async function sendConfirmationEmail(booking, pdfFilePath) {
  if (!booking.email) {
    throw new Error('Cannot send confirmation: customer email address is missing.');
  }

  const transporter    = await getVerifiedTransporter();
  const formattedDate  = formatDateNice(booking.appointmentDate);
  const formattedTime  = formatTime12Hour(booking.appointmentTime);
  const priceFormatted = `₹${Number(booking.price).toLocaleString('en-IN')}`;
  const address        = booking.address || buildAddress(booking);

  const subject = `DriveGlow – Booking Confirmed · ${booking.id}`;

  const textBody = [
    `Hello ${booking.customerName},`,
    '',
    'Your DriveGlow booking has been confirmed successfully.',
    '',
    `Booking ID   : ${booking.id}`,
    `Package      : ${booking.packageName}`,
    `Vehicle      : ${booking.vehicleBrand} ${booking.vehicleModel}${booking.vehicleRegistration ? ' · ' + booking.vehicleRegistration : ''}`,
    `Date         : ${formattedDate}`,
    `Time         : ${formattedTime}`,
    `Address      : ${address}`,
    `Total Amount : ${priceFormatted}`,
    '',
    'Our professional detailing team will arrive at your selected time.',
    'Thank you for trusting DriveGlow.',
    '',
    'Regards,',
    'DriveGlow Premium Car Detailing'
  ].join('\n');

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background:#0F0F0F; color:#E5E5E5; margin:0; padding:40px 0; }
    .wrap { max-width:600px; margin:0 auto; background:#141414; border:1px solid rgba(198,161,91,0.25); border-radius:12px; overflow:hidden; }
    .hdr  { background:#0A0A0A; padding:28px 40px; border-bottom:2px solid #4D1022; text-align:center; }
    .logo { font-size:22px; font-weight:bold; letter-spacing:3px; color:#fff; font-family:Georgia,serif; }
    .logo span { color:#C6A15B; }
    .sub  { font-size:10px; color:#5a5a5a; letter-spacing:2px; text-transform:uppercase; margin-top:4px; }
    .body { padding:36px 40px; line-height:1.65; font-size:14px; }
    h1   { color:#fff; font-size:20px; font-weight:normal; font-family:Georgia,serif; margin:0 0 16px; }
    p    { color:#A8A8A8; margin:0 0 18px; }
    .box { background:#1C1C1C; border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:24px; margin-bottom:28px; }
    h2   { font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:#C6A15B; border-bottom:1px solid rgba(198,161,91,0.2); padding-bottom:8px; margin:0 0 14px; }
    table { width:100%; border-collapse:collapse; }
    td   { padding:7px 0; font-size:13px; vertical-align:top; }
    .lbl { color:#5a5a5a; font-weight:bold; width:45%; }
    .val { color:#E5E5E5; text-align:right; }
    .tot { display:flex; justify-content:space-between; align-items:center; border-top:1px dashed rgba(198,161,91,0.25); padding-top:12px; margin-top:12px; }
    .tot-lbl { font-size:13px; color:#A8A8A8; font-weight:bold; }
    .tot-val { font-size:22px; color:#C6A15B; font-family:Georgia,serif; font-weight:bold; }
    .ftr { background:#0A0A0A; padding:22px 40px; text-align:center; font-size:11px; color:#5a5a5a; border-top:1px solid rgba(255,255,255,0.05); }
  </style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <div class="logo">DRIVE<span>GLOW</span></div>
    <div class="sub">Premium Automotive Detailing</div>
  </div>
  <div class="body">
    <h1>Hello ${booking.customerName},</h1>
    <p>Thank you for choosing <strong>DriveGlow</strong>. Your booking has been confirmed successfully.</p>
    <div class="box">
      <h2>Booking Details</h2>
      <table>
        <tr><td class="lbl">Booking ID</td><td class="val"><strong>${booking.id}</strong></td></tr>
        <tr><td class="lbl">Package</td><td class="val">${booking.packageName}</td></tr>
        <tr><td class="lbl">Vehicle</td><td class="val">${booking.vehicleBrand} ${booking.vehicleModel}${booking.vehicleRegistration ? ' · ' + booking.vehicleRegistration : ''}</td></tr>
        <tr><td class="lbl">Date</td><td class="val">${formattedDate}</td></tr>
        <tr><td class="lbl">Time</td><td class="val">${formattedTime}</td></tr>
        <tr><td class="lbl">Service Address</td><td class="val">${address}</td></tr>
        <tr><td class="lbl">Status</td><td class="val">Confirmed ✓</td></tr>
      </table>
      <div class="tot">
        <span class="tot-lbl">Total Amount</span>
        <span class="tot-val">${priceFormatted}</span>
      </div>
    </div>
    <p>Our professional detailing team will arrive at your selected time.</p>
    <p>Thank you for trusting DriveGlow. We look forward to giving your vehicle a premium showroom-quality finish.</p>
    <p><strong>Regards,</strong><br>DriveGlow Premium Car Detailing</p>
  </div>
  <div class="ftr">support@driveglow.in &nbsp;·&nbsp; +91 98765 43210</div>
</div>
</body>
</html>`;

  const mailOptions = {
    from:    `"DriveGlow Detailing" <${EMAIL_FROM}>`,
    to:      booking.email,       // always the customer's email from the form
    subject,
    text:    textBody,
    html:    htmlBody,
    // Attach PDF only if the file actually exists on disk
    attachments: pdfFilePath && fs.existsSync(pdfFilePath)
      ? [{ filename: `DriveGlow-Receipt-${booking.id}.pdf`, path: pdfFilePath }]
      : []
  };

  console.log(`[EMAIL] Sending customer confirmation to: ${booking.email}`);
  const info = await transporter.sendMail(mailOptions);
  console.log(`[EMAIL] ✅ Customer confirmation sent. MessageId: ${info.messageId}`);
  return info;
}

// ─────────────────────────────────────────────────────────────
//  EMAIL: OWNER NOTIFICATION
// ─────────────────────────────────────────────────────────────
async function sendOwnerNotificationEmail(booking) {
  const ownerEmail = EMAIL_USER;
  if (!ownerEmail) {
    throw new Error('Owner email not set. Configure EMAIL_USER environment variable.');
  }

  const transporter    = await getVerifiedTransporter();
  const formattedDate  = formatDateNice(booking.appointmentDate);
  const formattedTime  = formatTime12Hour(booking.appointmentTime);
  const priceFormatted = `₹${Number(booking.price).toLocaleString('en-IN')}`;
  const address        = booking.address || buildAddress(booking);

  const subject = `[DriveGlow] New Booking — ${booking.id} · ${booking.customerName}`;

  const textBody = [
    'New Booking Received — DriveGlow',
    '',
    `Booking ID    : ${booking.id}`,
    `Customer Name : ${booking.customerName}`,
    `Email         : ${booking.email}`,
    `Phone         : ${booking.phone}`,
    `Address       : ${address}`,
    `Vehicle       : ${booking.vehicleBrand} ${booking.vehicleModel}${booking.vehicleRegistration ? ' (' + booking.vehicleRegistration + ')' : ''}`,
    `Package       : ${booking.packageName}`,
    `Date          : ${formattedDate}`,
    `Time          : ${formattedTime}`,
    `Amount        : ${priceFormatted}`,
    `Booked At     : ${new Date(booking.createdAt).toLocaleString('en-IN')}`,
  ].join('\n');

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family:Arial,sans-serif; background:#f5f5f5; color:#222; margin:0; padding:30px 0; }
    .wrap { max-width:580px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden; border:1px solid #ddd; }
    .hdr  { background:#4D1022; color:#fff; padding:20px 30px; }
    .hdr h2 { margin:0; font-size:18px; }
    .hdr p  { margin:4px 0 0; font-size:12px; color:rgba(255,255,255,0.7); }
    .body { padding:24px 30px; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    tr:nth-child(even) td { background:#f9f9f9; }
    td { padding:10px 12px; border-bottom:1px solid #eee; vertical-align:top; }
    .lbl { color:#888; font-weight:bold; width:40%; }
    .val { color:#222; }
    .badge { display:inline-block; background:#C6A15B; color:#fff; padding:2px 10px; border-radius:20px; font-size:12px; font-weight:bold; }
    .ftr { background:#fafafa; padding:14px 30px; font-size:12px; color:#aaa; border-top:1px solid #eee; text-align:center; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h2>🚗 New Booking Received</h2>
    <p>DriveGlow Admin Notification</p>
  </div>
  <div class="body">
    <table>
      <tr><td class="lbl">Booking ID</td><td class="val"><strong>${booking.id}</strong></td></tr>
      <tr><td class="lbl">Customer Name</td><td class="val">${booking.customerName}</td></tr>
      <tr><td class="lbl">Customer Email</td><td class="val"><a href="mailto:${booking.email}">${booking.email}</a></td></tr>
      <tr><td class="lbl">Phone</td><td class="val">${booking.phone}</td></tr>
      <tr><td class="lbl">Service Address</td><td class="val">${address}</td></tr>
      <tr><td class="lbl">Vehicle</td><td class="val">${booking.vehicleBrand} ${booking.vehicleModel}${booking.vehicleRegistration ? ' (' + booking.vehicleRegistration + ')' : ''}</td></tr>
      <tr><td class="lbl">Package</td><td class="val"><span class="badge">${booking.packageName}</span></td></tr>
      <tr><td class="lbl">Appointment Date</td><td class="val">${formattedDate}</td></tr>
      <tr><td class="lbl">Appointment Time</td><td class="val">${formattedTime}</td></tr>
      <tr><td class="lbl">Total Amount</td><td class="val"><strong>${priceFormatted}</strong></td></tr>
      <tr><td class="lbl">Booked At</td><td class="val">${new Date(booking.createdAt).toLocaleString('en-IN')}</td></tr>
    </table>
  </div>
  <div class="ftr">DriveGlow Booking System · Automated Notification</div>
</div>
</body>
</html>`;

  console.log(`[EMAIL] Sending owner notification to: ${ownerEmail}`);
  const info = await transporter.sendMail({
    from:    `"DriveGlow Booking System" <${EMAIL_FROM}>`,
    to:      ownerEmail,          // always the business owner's email from EMAIL_USER
    subject,
    text:    textBody,
    html:    htmlBody,
  });
  console.log(`[EMAIL] ✅ Owner notification sent. MessageId: ${info.messageId}`);
  return info;
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
      createdAt:           new Date().toISOString()
    };

    newBooking.address = buildAddress(newBooking);

    // ── Persist booking first (always, regardless of email) ───
    const bookings = readBookings();
    bookings.push(newBooking);
    writeBookings(bookings);
    console.log(`[BOOKING] ✅ Created: ${newBooking.id} for ${newBooking.customerName} <${newBooking.email}>`);

    // ── Generate PDF receipt (optional, non-fatal) ────────────
    const pdfFileName = `DriveGlow-Receipt-${newBooking.id}.pdf`;
    const pdfFilePath = path.join(RECEIPTS_DIR, pdfFileName);
    let pdfReady = false;

    try {
      const pdfStream = fs.createWriteStream(pdfFilePath);
      generateReceiptPDF(newBooking, pdfStream);
      await new Promise((resolve, reject) => {
        pdfStream.on('finish', resolve);
        pdfStream.on('error', reject);
      });
      pdfReady = true;
      console.log(`[PDF] ✅ Receipt generated: ${pdfFileName}`);
    } catch (pdfErr) {
      console.error('[PDF] ⚠️  Receipt generation failed (non-fatal):', pdfErr.message);
    }

    // ── Send customer confirmation email (non-fatal) ──────────
    let emailSent  = false;
    let emailError = null;

    try {
      await sendConfirmationEmail(newBooking, pdfReady ? pdfFilePath : null);
      emailSent = true;
    } catch (err) {
      emailError = err.message;
      console.error(`[EMAIL] ❌ Customer confirmation failed for ${newBooking.email}:`);
      console.error(`        Reason: ${err.message}`);
    }

    // ── Send owner notification email (non-fatal) ─────────────
    let ownerNotified = false;

    try {
      await sendOwnerNotificationEmail(newBooking);
      ownerNotified = true;
    } catch (err) {
      console.error(`[EMAIL] ❌ Owner notification failed:`);
      console.error(`        Reason: ${err.message}`);
    }

    // ── Always return 201 — booking succeeded regardless of email
    return res.status(201).json({
      message:       'Booking completed successfully.',
      booking:       newBooking,
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

// GET /api/bookings/:id/receipt — PDF receipt download
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

// POST /api/bookings/:id/resend-email — Resend confirmation
app.post('/api/bookings/:id/resend-email', async (req, res) => {
  try {
    const bookings = readBookings();
    const booking  = bookings.find(b => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const pdfFileName = `DriveGlow-Receipt-${booking.id}.pdf`;
    const pdfFilePath = path.join(RECEIPTS_DIR, pdfFileName);

    // Re-generate PDF if missing
    if (!fs.existsSync(pdfFilePath)) {
      try {
        const pdfStream = fs.createWriteStream(pdfFilePath);
        generateReceiptPDF(booking, pdfStream);
        await new Promise((resolve, reject) => {
          pdfStream.on('finish', resolve);
          pdfStream.on('error', reject);
        });
      } catch (pdfErr) {
        console.error('[RESEND/PDF] PDF generation failed (non-fatal):', pdfErr.message);
      }
    }

    await sendConfirmationEmail(booking, fs.existsSync(pdfFilePath) ? pdfFilePath : null);
    return res.json({ message: 'Confirmation email resent successfully.', emailSent: true });
  } catch (err) {
    console.error('[RESEND] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to resend email.', emailSent: false });
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
      updatedAt: new Date().toISOString()
    };
    merged.address = buildAddress(merged);

    bookings[index] = merged;
    writeBookings(bookings);
    return res.json({ message: 'Booking updated successfully.', booking: merged });
  } catch (err) {
    console.error('[UPDATE] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/bookings/:id/status — Update status only
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

// DELETE /api/bookings/:id — Delete booking
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
//  NETWORK HELPERS — local IP display
// ─────────────────────────────────────────────────────────────
function getLocalIPAddresses() {
  const ifaces = os.networkInterfaces();
  const list   = [];
  for (const name in ifaces) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        list.push({ name, address: net.address });
      }
    }
  }
  return list;
}

// ─────────────────────────────────────────────────────────────
//  START SERVER — single app.listen() call
// ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const ipList       = getLocalIPAddresses();

  console.log('\n==================================================');
  console.log('  DRIVEGLOW LUXURY DETAILING SERVER');
  console.log(`  Environment: ${isProduction ? 'PRODUCTION (Railway)' : 'DEVELOPMENT'}`);
  console.log('==================================================');

  if (isProduction) {
    console.log('  Server is running on Railway.');
    console.log('  Access your site at your Railway public URL.');
  } else {
    console.log(`  Laptop:  http://localhost:${PORT}`);
    console.log('  Mobile Phone (same Wi-Fi):');
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
  console.log('  EMAIL CONFIG:');
  console.log(`  HOST   : ${EMAIL_HOST   || '⚠️  NOT SET'}`);
  console.log(`  PORT   : ${EMAIL_PORT}`);
  console.log(`  SECURE : ${EMAIL_SECURE}`);
  console.log(`  USER   : ${EMAIL_USER   || '⚠️  NOT SET'}`);
  console.log(`  PASS   : ${EMAIL_PASS   ? '✅ SET' : '⚠️  NOT SET'}`);
  console.log('==================================================\n');
});
