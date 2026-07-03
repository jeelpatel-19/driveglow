require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const nodemailer = require('nodemailer');
const { generateReceiptPDF } = require('./receipt');

// Database File Paths
const DB_FILE = path.join(__dirname, 'bookings.json');
const RECEIPTS_DIR = path.join(__dirname, 'logs', 'receipts');

// Initialize local database and receipts directory
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(RECEIPTS_DIR)) {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}

// Nodemailer SMTP Transporter Configuration helper
function getMailTransporter() {
  const host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
  const secure = process.env.EMAIL_SECURE === 'true';
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
}

// Helper: Read bookings from JSON database
function readBookings() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading bookings:', err);
    return [];
  }
}

// Helper: Write bookings to JSON database
function writeBookings(bookings) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(bookings, null, 2));
  } catch (err) {
    console.error('Error writing bookings:', err);
  }
}

// Helper: Generate a unique booking ID (e.g. DG-10254)
function generateBookingID() {
  const bookings = readBookings();
  let id;
  let isUnique = false;
  while (!isUnique) {
    const num = Math.floor(10000 + Math.random() * 90000);
    id = `DG-${num}`;
    isUnique = !bookings.some(b => b.id === id);
  }
  return id;
}

// Helper: Format date nicely for email text/HTML content
function formatDateNice(dateStr) {
  if (!dateStr) return '';
  const dateParts = dateStr.split('-');
  return new Date(dateParts[0], dateParts[1] - 1, dateParts[2])
    .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Helper: Format time to 12-hour AM/PM format
function formatTime12Hour(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
}

// Function to send confirmation email with receipt attachment
async function sendConfirmationEmail(booking, pdfFilePath) {
  const transporter = getMailTransporter();
  if (!transporter) {
    throw new Error('SMTP credentials are not configured.');
  }

  const formattedDate = formatDateNice(booking.appointmentDate);
  const formattedTime = formatTime12Hour(booking.appointmentTime);
  const priceFormatted = `₹${Number(booking.price).toLocaleString('en-IN')}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'support@driveglow.com',
    to: booking.email,
    subject: `🚗 DriveGlow – Booking Confirmation | Booking ID: ${booking.id}`,
    text: `Dear ${booking.customerName},

Thank you for choosing DriveGlow Premium Car Detailing.

Your booking has been confirmed successfully.

Booking Summary:
-------------------------------------------------
Booking ID         : ${booking.id}
Customer Name      : ${booking.customerName}
Mobile Number      : ${booking.phone}
Email              : ${booking.email}
-------------------------------------------------

Vehicle Details:
-------------------------------------------------
Brand              : ${booking.vehicleBrand}
Model              : ${booking.vehicleModel}
Registration Number: ${booking.vehicleRegistration || 'N/A'}
Vehicle Type       : ${booking.vehicleType}
-------------------------------------------------

Selected Package:
-------------------------------------------------
${booking.packageName}
-------------------------------------------------

Appointment:
-------------------------------------------------
Date               : ${formattedDate}
Time               : ${formattedTime}
-------------------------------------------------

Service Address:
-------------------------------------------------
House / Building   : ${booking.houseName || 'N/A'}
Flat Number        : ${booking.flatNumber || 'N/A'}
Street             : ${booking.street || 'N/A'}
City               : ${booking.city}
State              : ${booking.state}
Pincode            : ${booking.pincode}
-------------------------------------------------

Total Amount       : ${priceFormatted}
Payment Method     : Pay After Service
Booking Status     : Confirmed ✅

Our professional detailing team will arrive at your selected location at the scheduled time.
If you need to modify or cancel your booking, please contact us.

Thank you for trusting DriveGlow.
We look forward to restoring your vehicle to a showroom-quality finish.

Best Regards,
DriveGlow Premium Car Detailing
support@driveglow.com
+91 98765 43210`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0F0F0F; color: #E5E5E5; margin: 0; padding: 40px 0; -webkit-font-smoothing: antialiased; }
    .email-wrap { max-width: 600px; margin: 0 auto; background-color: #141414; border: 1px solid rgba(198, 161, 91, 0.25); border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .header { background-color: #0A0A0A; padding: 30px 40px; border-bottom: 2px solid #4D1022; text-align: center; }
    .logo { font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #FFFFFF; font-family: Georgia, serif; }
    .logo span { color: #C6A15B; }
    .body { padding: 40px; line-height: 1.6; font-size: 14px; }
    h1 { color: #FFFFFF; font-size: 20px; font-weight: normal; margin-top: 0; margin-bottom: 20px; font-family: Georgia, serif; }
    p { margin-top: 0; margin-bottom: 20px; color: #A8A8A8; }
    .details-box { background-color: #1C1C1C; border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 25px; margin-bottom: 30px; }
    h2 { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #C6A15B; border-bottom: 1px solid rgba(198,161,91,0.25); padding-bottom: 8px; margin-top: 0; margin-bottom: 15px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    td { padding: 6px 0; font-size: 13px; vertical-align: top; }
    .label { color: #5a5a5a; font-weight: bold; width: 40%; }
    .value { color: #E5E5E5; text-align: right; }
    .total-row { border-top: 1px dashed rgba(198, 161, 91, 0.25); padding-top: 12px; margin-top: 12px; display: flex; justify-content: space-between; align-items: center; }
    .total-label { font-size: 13px; font-weight: bold; color: #A8A8A8; }
    .total-val { font-size: 22px; font-weight: bold; color: #C6A15B; font-family: Georgia, serif; }
    .footer { background-color: #0A0A0A; padding: 25px 40px; text-align: center; font-size: 11px; color: #5a5a5a; border-top: 1px solid rgba(255,255,255,0.05); }
    .footer a { color: #A8A8A8; text-decoration: none; }
  </style>
</head>
<body>
<div class="email-wrap">
  <div class="header">
    <div class="logo">DRIVE<span>GLOW</span></div>
    <div style="font-size: 10px; color: #5a5a5a; letter-spacing: 2px; margin-top: 5px; text-transform: uppercase;">Premium Automotive Detailing</div>
  </div>
  <div class="body">
    <h1>Dear ${booking.customerName},</h1>
    <p>Thank you for choosing <strong>DriveGlow Premium Car Detailing</strong>.</p>
    <p>Your booking has been confirmed successfully. A copy of your PDF receipt has been attached to this email.</p>
    
    <div class="details-box">
      <h2>Booking Summary</h2>
      <table>
        <tr><td class="label">Booking ID</td><td class="value"><strong>${booking.id}</strong></td></tr>
        <tr><td class="label">Customer Name</td><td class="value">${booking.customerName}</td></tr>
        <tr><td class="label">Mobile Number</td><td class="value">${booking.phone}</td></tr>
        <tr><td class="label">Email</td><td class="value">${booking.email}</td></tr>
      </table>
      
      <h2>Vehicle Details</h2>
      <table>
        <tr><td class="label">Brand</td><td class="value">${booking.vehicleBrand}</td></tr>
        <tr><td class="label">Model</td><td class="value">${booking.vehicleModel}</td></tr>
        <tr><td class="label">Registration No.</td><td class="value">${booking.vehicleRegistration || 'N/A'}</td></tr>
        <tr><td class="label">Vehicle Type</td><td class="value">${booking.vehicleType}</td></tr>
      </table>

      <h2>Service Details</h2>
      <table>
        <tr><td class="label">Selected Package</td><td class="value"><strong>${booking.packageName}</strong></td></tr>
        <tr><td class="label">Appointment Date</td><td class="value">${formattedDate}</td></tr>
        <tr><td class="label">Appointment Time</td><td class="value">${formattedTime}</td></tr>
      </table>

      <h2>Service Address</h2>
      <table>
        <tr><td class="label">House / Building</td><td class="value">${booking.houseName || 'N/A'}</td></tr>
        <tr><td class="label">Flat Number</td><td class="value">${booking.flatNumber || 'N/A'}</td></tr>
        <tr><td class="label">Street</td><td class="value">${booking.street || 'N/A'}</td></tr>
        <tr><td class="label">City &amp; State</td><td class="value">${booking.city}, ${booking.state}</td></tr>
        <tr><td class="label">Pincode</td><td class="value">${booking.pincode}</td></tr>
      </table>

      <div class="total-row">
        <span class="total-label">Grand Total (Pay After Service)</span>
        <span class="total-val">${priceFormatted}</span>
      </div>
    </div>
    
    <p>Our professional detailing team will arrive at your selected location at the scheduled time. Please ensure water and power connections are accessible.</p>
    <p>If you have any questions or need to reschedule, feel free to reply directly to this email or call us.</p>
    <p>We look forward to giving your vehicle a showroom-quality finish!</p>
  </div>
  <div class="footer">
    <p>&copy; 2026 DriveGlow Premium Detailing. All rights reserved.</p>
    <p>support@driveglow.com &nbsp;·&nbsp; +91 98765 43210 &nbsp;·&nbsp; Mon - Sun, 8 AM - 8 PM</p>
  </div>
</div>
</body>
</html>`,
    attachments: [
      {
        filename: `DriveGlow-Receipt-${booking.id}.pdf`,
        path: pdfFilePath
      }
    ]
  };

  return transporter.sendMail(mailOptions);
}

// ----------------- API ENDPOINTS -----------------

// Create a new booking
app.post('/api/bookings', async (req, res) => {
  try {
    const {
      customerName, phone, email,
      houseName, flatNumber, street, landmark, city, state, pincode,
      vehicleBrand, vehicleModel, vehicleType, vehicleRegistration,
      packageName, price, appointmentDate, appointmentTime
    } = req.body;

    if (!customerName || !phone || !email || !packageName || !price || !appointmentDate || !appointmentTime) {
      return res.status(400).json({ error: 'Missing required booking fields.' });
    }

    // Format address
    const addressParts = [
      flatNumber ? `Flat/Apt ${flatNumber}` : '',
      houseName ? `${houseName}` : '',
      street ? `${street}` : '',
      landmark ? `Near ${landmark}` : '',
      city,
      state,
      pincode
    ].filter(part => part.trim() !== '');

    const address = addressParts.join(', ');

    const newBooking = {
      id: generateBookingID(),
      customerName,
      phone,
      email,
      houseName,
      flatNumber,
      street,
      landmark,
      city,
      state,
      pincode,
      address,
      vehicleBrand,
      vehicleModel,
      vehicleType,
      vehicleRegistration: vehicleRegistration ? vehicleRegistration.toUpperCase() : '',
      packageName,
      price: parseFloat(price),
      appointmentDate,
      appointmentTime,
      status: 'Confirmed',
      createdAt: new Date().toISOString()
    };

    // Save to DB
    const bookings = readBookings();
    bookings.push(newBooking);
    writeBookings(bookings);

    // Generate PDF receipt path
    const pdfFileName = `DriveGlow-Receipt-${newBooking.id}.pdf`;
    const pdfFilePath = path.join(RECEIPTS_DIR, pdfFileName);

    // Generate PDF file on disk
    try {
      const pdfStream = fs.createWriteStream(pdfFilePath);
      generateReceiptPDF(newBooking, pdfStream);
      // Wait for write stream to finish
      await new Promise((resolve) => pdfStream.on('finish', resolve));
    } catch (pdfErr) {
      console.error('Error generating PDF receipt file:', pdfErr);
    }

    // Attempt to send email confirmation
    let emailSent = false;
    let emailError = null;

    try {
      await sendConfirmationEmail(newBooking, pdfFilePath);
      emailSent = true;
      console.log('\n==================================================');
      console.log(`EMAIL SENT TO: ${newBooking.email}`);
      console.log(`BOOKING ID: ${newBooking.id}`);
      console.log(`RECEIPT PATH: ${pdfFilePath}`);
      console.log('==================================================\n');
    } catch (err) {
      emailError = err.message || err;
      console.error('\n==================================================');
      console.error(`ERROR SENDING EMAIL TO: ${newBooking.email}`);
      console.error(`ERROR DETAIL:`, err);
      console.error(`RECEIPT PATH: ${pdfFilePath}`);
      console.error('==================================================\n');
    }

    res.status(201).json({
      message: 'Booking completed successfully.',
      booking: newBooking,
      emailSentTo: newBooking.email,
      emailSent,
      emailError
    });

  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Endpoint to stream/download the PDF receipt
app.get('/api/bookings/:id/receipt', (req, res) => {
  try {
    const bookings = readBookings();
    const booking = bookings.find(b => b.id === req.params.id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const pdfFileName = `DriveGlow-Receipt-${booking.id}.pdf`;
    const pdfFilePath = path.join(RECEIPTS_DIR, pdfFileName);

    // If PDF doesn't exist on disk, generate it dynamically
    if (!fs.existsSync(pdfFilePath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName}"`);
      generateReceiptPDF(booking, res);
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName}"`);
      fs.createReadStream(pdfFilePath).pipe(res);
    }
  } catch (err) {
    console.error('Error generating/downloading receipt PDF:', err);
    res.status(500).json({ error: 'Could not generate receipt PDF.' });
  }
});

// Endpoint to resend email confirmation
app.post('/api/bookings/:id/resend-email', async (req, res) => {
  try {
    const bookings = readBookings();
    const booking = bookings.find(b => b.id === req.params.id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const pdfFileName = `DriveGlow-Receipt-${booking.id}.pdf`;
    const pdfFilePath = path.join(RECEIPTS_DIR, pdfFileName);

    // Ensure PDF is generated and saved on disk
    if (!fs.existsSync(pdfFilePath)) {
      const pdfStream = fs.createWriteStream(pdfFilePath);
      generateReceiptPDF(booking, pdfStream);
      await new Promise((resolve) => pdfStream.on('finish', resolve));
    }

    // Try sending email
    await sendConfirmationEmail(booking, pdfFilePath);

    res.json({ message: 'Confirmation email resent successfully.', emailSent: true });
  } catch (err) {
    console.error('Error resending email:', err);
    res.status(500).json({ error: err.message || 'Failed to resend confirmation email.', emailSent: false });
  }
});

// Get all bookings
app.get('/api/bookings', (req, res) => {
  const bookings = readBookings();
  // Sort by date/time descending or creation date
  bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(bookings);
});

// Get single booking
app.get('/api/bookings/:id', (req, res) => {
  const bookings = readBookings();
  const booking = bookings.find(b => b.id === req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  res.json(booking);
});

// Update booking
app.put('/api/bookings/:id', (req, res) => {
  try {
    const bookings = readBookings();
    const index = bookings.findIndex(b => b.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const currentBooking = bookings[index];
    const updateData = req.body;

    // Recalculate address if any address fields change
    const houseName = updateData.houseName !== undefined ? updateData.houseName : currentBooking.houseName;
    const flatNumber = updateData.flatNumber !== undefined ? updateData.flatNumber : currentBooking.flatNumber;
    const street = updateData.street !== undefined ? updateData.street : currentBooking.street;
    const landmark = updateData.landmark !== undefined ? updateData.landmark : currentBooking.landmark;
    const city = updateData.city !== undefined ? updateData.city : currentBooking.city;
    const state = updateData.state !== undefined ? updateData.state : currentBooking.state;
    const pincode = updateData.pincode !== undefined ? updateData.pincode : currentBooking.pincode;

    const addressParts = [
      flatNumber ? `Flat/Apt ${flatNumber}` : '',
      houseName ? `${houseName}` : '',
      street ? `${street}` : '',
      landmark ? `Near ${landmark}` : '',
      city,
      state,
      pincode
    ].filter(part => part.trim() !== '');

    const address = addressParts.join(', ');

    const updatedBooking = {
      ...currentBooking,
      ...updateData,
      houseName,
      flatNumber,
      street,
      landmark,
      city,
      state,
      pincode,
      address,
      price: updateData.price !== undefined ? parseFloat(updateData.price) : currentBooking.price,
      updatedAt: new Date().toISOString()
    };

    bookings[index] = updatedBooking;
    writeBookings(bookings);

    res.json({ message: 'Booking updated successfully.', booking: updatedBooking });
  } catch (err) {
    console.error('Error updating booking:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Update booking status directly
app.post('/api/bookings/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid booking status.' });
    }

    const bookings = readBookings();
    const index = bookings.findIndex(b => b.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    bookings[index].status = status;
    bookings[index].updatedAt = new Date().toISOString();
    writeBookings(bookings);

    res.json({ message: 'Status updated successfully.', booking: bookings[index] });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Delete a booking
app.delete('/api/bookings/:id', (req, res) => {
  try {
    const bookings = readBookings();
    const filtered = bookings.filter(b => b.id !== req.params.id);

    if (bookings.length === filtered.length) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    writeBookings(filtered);
    res.json({ message: 'Booking deleted successfully.' });
  } catch (err) {
    console.error('Error deleting booking:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.listen(PORT, () => {
  console.log(`DriveGlow Server running on http://localhost:${PORT}`);
});
