// ─────────────────────────────────────────────────────────────
//  DriveGlow — Production-Ready Server
//  Requires: express, cors, nodemailer, pdfkit, dotenv
// ─────────────────────────────────────────────────────────────
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const nodemailer = require('nodemailer');

const { generateReceiptPDF } = require('./receipt');

// ─── App & Port ───────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

// ─── Global crash guards ──────────────────────────────────────
// EADDRINUSE must still exit so node --watch can restart cleanly.
// All other unexpected errors are logged but the server stays up.
process.on('uncaughtException', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use.`);
    console.error('  Stop the other process first, then restart.\n');
    process.exit(1);          // clean exit → node --watch will retry on file change
  }
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── File Paths ───────────────────────────────────────────────
const DB_FILE = path.join(__dirname, 'bookings.json');
const RECEIPTS_DIR = path.join(__dirname, 'logs', 'receipts');

// Ensure required directories / files exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(RECEIPTS_DIR)) {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}

// ─────────────────────────────────────────────────────────────
//  MAIL TRANSPORTER — created once, reused for all sends
// ─────────────────────────────────────────────────────────────
let _transporter = null;

function getMailTransporter() {
  if (_transporter) return _transporter;

  console.log("EMAIL_HOST:", process.env.EMAIL_HOST);
  console.log("EMAIL_USER:", process.env.EMAIL_USER);
  console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "FOUND" : "MISSING");

  const host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
  const secure = process.env.EMAIL_SECURE === 'true';
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!host || !user || !pass) {
    console.warn('[EMAIL] SMTP credentials missing — emails will be skipped.');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    family: 4,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  return _transporter;
}

// ─────────────────────────────────────────────────────────────
//  DATABASE HELPERS
// ─────────────────────────────────────────────────────────────

/** Read all bookings from JSON file */
function readBookings() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[DB] Error reading bookings:', err.message);
    return [];
  }
}

/** Write bookings array back to JSON file */
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

/** Generate a unique booking ID like DG-48291 */
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

/** Format "2025-07-08" → "8 July 2025" */
function formatDateNice(dateStr) {
  if (!dateStr) return 'N/A';
  const [y, m, d] = dateStr.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d))
    .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Format "14:30" → "2:30 PM" */
function formatTime12Hour(timeStr) {
  if (!timeStr) return 'N/A';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const mins = parts[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${mins} ${ampm}`;
}

/** Build a formatted address string from booking fields */
function buildAddress(b) {
  return [
    b.flatNumber ? `Flat/Apt ${b.flatNumber}` : '',
    b.houseName || '',
    b.street || '',
    b.landmark ? `Near ${b.landmark}` : '',
    b.city || '',
    b.state || '',
    b.pincode || ''
  ].filter(part => typeof part === 'string' && part.trim() !== '').join(', ');
}

// ─────────────────────────────────────────────────────────────
//  EMAIL: CUSTOMER CONFIRMATION
// ─────────────────────────────────────────────────────────────
async function sendConfirmationEmail(booking, pdfFilePath) {
  const transporter = getMailTransporter();
  if (!transporter) throw new Error('SMTP credentials not configured.');
  if (!booking.email) throw new Error('Customer email address is missing.');

  const formattedDate = formatDateNice(booking.appointmentDate);
  const formattedTime = formatTime12Hour(booking.appointmentTime);
  const priceFormatted = `₹${Number(booking.price).toLocaleString('en-IN')}`;
  const address = booking.address || buildAddress(booking);

  const subject = `DriveGlow – Booking Confirmed · ${booking.id}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
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
    td   { padding:6px 0; font-size:13px; vertical-align:top; }
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
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: booking.email,
    subject,
    text: `Hello ${booking.customerName},\n\nYour DriveGlow booking is confirmed.\n\nBooking ID: ${booking.id}\nPackage: ${booking.packageName}\nDate: ${formattedDate}\nTime: ${formattedTime}\nAddress: ${address}\nTotal: ${priceFormatted}\n\nThank you for choosing DriveGlow.`,
    html,
    attachments: pdfFilePath && fs.existsSync(pdfFilePath)
      ? [{ filename: `DriveGlow-Receipt-${booking.id}.pdf`, path: pdfFilePath }]
      : []
  };

  return transporter.sendMail(mailOptions);
}

// ─────────────────────────────────────────────────────────────
//  EMAIL: OWNER NOTIFICATION
// ─────────────────────────────────────────────────────────────
async function sendOwnerNotificationEmail(booking) {
  const transporter = getMailTransporter();
  if (!transporter) throw new Error('SMTP credentials not configured.');

  const ownerEmail = process.env.EMAIL_USER;
  if (!ownerEmail) throw new Error('Owner email (EMAIL_USER) is not set.');

  const formattedDate = formatDateNice(booking.appointmentDate);
  const formattedTime = formatTime12Hour(booking.appointmentTime);
  const priceFormatted = `₹${Number(booking.price).toLocaleString('en-IN')}`;
  const address = booking.address || buildAddress(booking);

  const subject = `[New Booking] ${booking.id} — ${booking.customerName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
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
      <tr><td class="lbl">Email</td><td class="val"><a href="mailto:${booking.email}">${booking.email}</a></td></tr>
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

  return transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: ownerEmail,
    subject,
    text: `New Booking: ${booking.id}\nCustomer: ${booking.customerName}\nEmail: ${booking.email}\nPhone: ${booking.phone}\nAddress: ${address}\nPackage: ${booking.packageName}\nDate: ${formattedDate} at ${formattedTime}\nAmount: ${priceFormatted}`,
    html
  });
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
    if (!customerName) missing.push('Customer Name');
    if (!phone) missing.push('Phone Number');
    if (!email) missing.push('Email Address');
    if (!packageName) missing.push('Package');
    if (!price) missing.push('Price');
    if (!appointmentDate) missing.push('Appointment Date');
    if (!appointmentTime) missing.push('Appointment Time');
    if (!vehicleBrand) missing.push('Vehicle Brand');
    if (!vehicleModel) missing.push('Vehicle Model');

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}.`
      });
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address format.' });
    }

    // Build new booking object
    const newBooking = {
      id: generateBookingID(),
      customerName: customerName.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      houseName: (houseName || '').trim(),
      flatNumber: (flatNumber || '').trim(),
      street: (street || '').trim(),
      landmark: (landmark || '').trim(),
      city: (city || '').trim(),
      state: (state || '').trim(),
      pincode: (pincode || '').trim(),
      address: '',  // computed below
      vehicleBrand: (vehicleBrand || '').trim(),
      vehicleModel: (vehicleModel || '').trim(),
      vehicleType: (vehicleType || '').trim(),
      vehicleRegistration: (vehicleRegistration || '').trim().toUpperCase(),
      packageName: packageName.trim(),
      price: parseFloat(price),
      appointmentDate,
      appointmentTime,
      status: 'Confirmed',
      createdAt: new Date().toISOString()
    };

    newBooking.address = buildAddress(newBooking);

    // ── Persist to database ───────────────────────────────────
    const bookings = readBookings();
    bookings.push(newBooking);
    writeBookings(bookings);

    // ── Generate PDF receipt ──────────────────────────────────
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
    } catch (pdfErr) {
      console.error('[PDF] Error generating receipt:', pdfErr.message);
    }

    // ── Send emails (non-fatal) ───────────────────────────────
    let emailSent = false;
    let emailError = null;
    let ownerNotified = false;

    // Customer confirmation
    try {
      await sendConfirmationEmail(newBooking, pdfReady ? pdfFilePath : null);
      emailSent = true;
      console.log(`[EMAIL] Confirmation sent → ${newBooking.email}`);
    } catch (err) {
      emailError = err.message;
      console.error(`[EMAIL] Failed to send confirmation to ${newBooking.email}:`, err.message);
    }

    // Owner notification
    try {
      await sendOwnerNotificationEmail(newBooking);
      ownerNotified = true;
      console.log(`[EMAIL] Owner notification sent → ${process.env.EMAIL_USER}`);
    } catch (err) {
      console.error('[EMAIL] Failed to send owner notification:', err.message);
    }

    console.log(`[BOOKING] Created: ${newBooking.id} for ${newBooking.customerName}`);

    return res.status(201).json({
      message: 'Booking completed successfully.',
      booking: newBooking,
      emailSent,
      emailError,
      ownerNotified
    });

  } catch (err) {
    console.error('[BOOKING] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

// GET /api/bookings — Get all bookings (sorted newest first)
app.get('/api/bookings', (req, res) => {
  try {
    const bookings = readBookings();
    bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(bookings);
  } catch (err) {
    console.error('[BOOKINGS] Error fetching bookings:', err.message);
    return res.status(500).json({ error: 'Could not load bookings.' });
  }
});

// GET /api/bookings/:id — Get single booking
app.get('/api/bookings/:id', (req, res) => {
  try {
    const bookings = readBookings();
    const booking = bookings.find(b => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    return res.json(booking);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/bookings/:id/receipt — Stream PDF receipt
app.get('/api/bookings/:id/receipt', (req, res) => {
  try {
    const bookings = readBookings();
    const booking = bookings.find(b => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const pdfFileName = `DriveGlow-Receipt-${booking.id}.pdf`;
    const pdfFilePath = path.join(RECEIPTS_DIR, pdfFileName);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName}"`);

    if (fs.existsSync(pdfFilePath)) {
      fs.createReadStream(pdfFilePath).pipe(res);
    } else {
      // Generate on the fly
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
    const booking = bookings.find(b => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const pdfFileName = `DriveGlow-Receipt-${booking.id}.pdf`;
    const pdfFilePath = path.join(RECEIPTS_DIR, pdfFileName);

    if (!fs.existsSync(pdfFilePath)) {
      const pdfStream = fs.createWriteStream(pdfFilePath);
      generateReceiptPDF(booking, pdfStream);
      await new Promise((resolve, reject) => {
        pdfStream.on('finish', resolve);
        pdfStream.on('error', reject);
      });
    }

    await sendConfirmationEmail(booking, pdfFilePath);
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
    const index = bookings.findIndex(b => b.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Booking not found.' });

    const cur = bookings[index];
    const data = req.body;

    const merged = {
      ...cur,
      ...data,
      price: data.price !== undefined ? parseFloat(data.price) : cur.price,
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
    const index = bookings.findIndex(b => b.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Booking not found.' });

    bookings[index].status = status;
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
//  NETWORK HELPERS
// ─────────────────────────────────────────────────────────────
function getLocalIPAddresses() {
  const interfaces = os.networkInterfaces();
  const list = [];
  for (const name in interfaces) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        list.push({ name, address: net.address });
      }
    }
  }
  return list;
}

// ─────────────────────────────────────────────────────────────
//  START SERVER — single listen() call
// ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const ipList = getLocalIPAddresses();

  console.log('\n==================================================');
  console.log('  DRIVEGLOW LUXURY DETAILING SERVER');
  console.log('==================================================');
  console.log(`  Computer / Laptop:  http://localhost:${PORT}`);
  console.log('  Mobile Phone (connect to same Wi-Fi first):');

  ipList.forEach(ip => {
    let label = 'LAN';
    const n = ip.name.toLowerCase();
    if (n.includes('wi-fi') || n.includes('wlan') || n.includes('wireless')) {
      label = '✅ Wi-Fi (Use this on phone)';
    } else if (n.includes('vmnet') || n.includes('virtualbox') || n.includes('vethernet')) {
      label = '⛔ Virtual (Skip)';
    } else if (n.includes('ethernet')) {
      label = 'Ethernet';
    }
    console.log(`  • http://${ip.address}:${PORT}  [${ip.name} — ${label}]`);
  });

  console.log('--------------------------------------------------');
  console.log('  EMAIL CONFIG:');
  console.log(`  HOST: ${process.env.EMAIL_HOST || '⚠️  NOT SET'}`);
  console.log(`  USER: ${process.env.EMAIL_USER || '⚠️  NOT SET'}`);
  console.log(`  PASS: ${process.env.EMAIL_PASS ? '✅ SET' : '⚠️  NOT SET'}`);
  console.log('--------------------------------------------------');
  console.log('  Both phone and laptop must be on the same Wi-Fi.');
  console.log('==================================================\n');
});
