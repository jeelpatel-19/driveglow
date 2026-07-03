const PDFDocument = require('pdfkit');

/**
 * Generates a professional PDF receipt and writes it to the provided writable stream.
 * @param {Object} booking The booking database record.
 * @param {Writable} streamOrWritable The writable stream (file stream or HTTP response) to pipe the PDF to.
 */
function generateReceiptPDF(booking, streamOrWritable) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(streamOrWritable);

  // Design Theme Colors
  const primaryColor = '#4D1022'; // Maroon
  const secondaryColor = '#C6A15B'; // Gold
  const textColor = '#222222';
  const lightTextColor = '#555555';
  const lightBg = '#FBFBFB';

  // --- Header Logo ---
  doc.fillColor(primaryColor)
     .font('Helvetica-Bold')
     .fontSize(24)
     .text('DRIVEGLOW', 50, 50, { continued: true })
     .fillColor(secondaryColor)
     .text(' PREMIUM DETAILING');

  doc.fillColor(textColor)
     .font('Helvetica')
     .fontSize(10)
     .text('Restoring showroom perfection, one vehicle at a time.', 50, 78)
     .text('support@driveglow.com | +91 98765 43210', 50, 92);

  // --- Document Title (Receipt Info) ---
  doc.fillColor(primaryColor)
     .font('Helvetica-Bold')
     .fontSize(18)
     .text('BOOKING RECEIPT', 380, 50, { align: 'right' });

  const bookingDate = new Date(booking.createdAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.fillColor(textColor)
     .font('Helvetica')
     .fontSize(10)
     .text(`Booking ID: ${booking.id}`, 380, 72, { align: 'right' })
     .text(`Date: ${bookingDate}`, 380, 86, { align: 'right' })
     .text('Payment: Pay After Service', 380, 100, { align: 'right' });

  // --- Header Divider ---
  doc.moveTo(50, 125)
     .lineTo(545, 125)
     .strokeColor('#EAEAEA')
     .lineWidth(1)
     .stroke();

  // --- Customer & Vehicle Details Row ---
  // Left side: Customer
  doc.fillColor(primaryColor)
     .font('Helvetica-Bold')
     .fontSize(12)
     .text('CUSTOMER DETAILS', 50, 145);

  doc.fillColor(textColor)
     .font('Helvetica-Bold')
     .fontSize(10)
     .text('Name: ', 50, 165, { continued: true })
     .font('Helvetica')
     .text(booking.customerName)
     .font('Helvetica-Bold')
     .text('Mobile: ', 50, 180, { continued: true })
     .font('Helvetica')
     .text(booking.phone)
     .font('Helvetica-Bold')
     .text('Email: ', 50, 195, { continued: true })
     .font('Helvetica')
     .text(booking.email);

  // Right side: Vehicle
  doc.fillColor(primaryColor)
     .font('Helvetica-Bold')
     .fontSize(12)
     .text('VEHICLE DETAILS', 300, 145);

  doc.fillColor(textColor)
     .font('Helvetica-Bold')
     .fontSize(10)
     .text('Brand: ', 300, 165, { continued: true })
     .font('Helvetica')
     .text(booking.vehicleBrand)
     .font('Helvetica-Bold')
     .text('Model: ', 300, 180, { continued: true })
     .font('Helvetica')
     .text(booking.vehicleModel)
     .font('Helvetica-Bold')
     .text('Registration: ', 300, 195, { continued: true })
     .font('Helvetica')
     .text(booking.vehicleRegistration || 'N/A')
     .font('Helvetica-Bold')
     .text('Type: ', 300, 210, { continued: true })
     .font('Helvetica')
     .text(booking.vehicleType);

  // --- Row Divider ---
  doc.moveTo(50, 235)
     .lineTo(545, 235)
     .strokeColor('#EAEAEA')
     .stroke();

  // --- Appointment & Address Row ---
  // Left side: Appointment
  doc.fillColor(primaryColor)
     .font('Helvetica-Bold')
     .fontSize(12)
     .text('APPOINTMENT SCHEDULE', 50, 255);

  const dateParts = booking.appointmentDate.split('-');
  const formattedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2])
    .toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Time format helper
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
  const formattedTime = formatTime12Hour(booking.appointmentTime);

  doc.fillColor(textColor)
     .font('Helvetica-Bold')
     .fontSize(10)
     .text('Date: ', 50, 275, { continued: true })
     .font('Helvetica')
     .text(formattedDate)
     .font('Helvetica-Bold')
     .text('Time: ', 50, 290, { continued: true })
     .font('Helvetica')
     .text(formattedTime);

  // Right side: Address
  doc.fillColor(primaryColor)
     .font('Helvetica-Bold')
     .fontSize(12)
     .text('SERVICE ADDRESS', 300, 255);

  const addressLines = [];
  if (booking.flatNumber) addressLines.push(`Flat/Unit: ${booking.flatNumber}`);
  if (booking.houseName) addressLines.push(`Building: ${booking.houseName}`);
  if (booking.street) addressLines.push(`Street: ${booking.street}`);
  if (booking.landmark) addressLines.push(`Landmark: Near ${booking.landmark}`);
  addressLines.push(`${booking.city}, ${booking.state} - ${booking.pincode}`);

  doc.fillColor(textColor)
     .font('Helvetica')
     .fontSize(10);
  
  let currentY = 275;
  addressLines.forEach(line => {
    doc.text(line, 300, currentY);
    currentY += 15;
  });

  // --- Section Divider ---
  doc.moveTo(50, 365)
     .lineTo(545, 365)
     .strokeColor('#EAEAEA')
     .stroke();

  // --- Bill Table Headers ---
  doc.fillColor(primaryColor)
     .font('Helvetica-Bold')
     .fontSize(11)
     .text('SERVICE DESCRIPTION', 50, 385)
     .text('AMOUNT', 450, 385, { align: 'right' });

  // Thin Table Header Divider
  doc.moveTo(50, 402)
     .lineTo(545, 402)
     .strokeColor('#F2F2F2')
     .stroke();

  // Service details line
  doc.fillColor(textColor)
     .font('Helvetica-Bold')
     .fontSize(10)
     .text(`DriveGlow Detailing — ${booking.packageName}`, 50, 415)
     .font('Helvetica')
     .fontSize(9)
     .fillColor(lightTextColor)
     .text('Includes doorstep premium vehicle wash and detailing service.', 50, 430);

  const priceFormatted = `INR ${Number(booking.price).toLocaleString('en-IN')}`;
  doc.fillColor(textColor)
     .font('Helvetica-Bold')
     .fontSize(11)
     .text(priceFormatted, 450, 415, { align: 'right' });

  // --- Total Box ---
  doc.rect(50, 465, 495, 45)
     .fillColor(lightBg)
     .fill();

  doc.fillColor(textColor)
     .font('Helvetica-Bold')
     .fontSize(11)
     .text('GRAND TOTAL', 70, 482)
     .fillColor(primaryColor)
     .fontSize(16)
     .text(`₹${Number(booking.price).toLocaleString('en-IN')}`, 430, 478, { align: 'right' });

  // --- Terms & Conditions Footer ---
  doc.fillColor(lightTextColor)
     .font('Helvetica')
     .fontSize(9)
     .text('Important Information:', 50, 540)
     .fontSize(8)
     .text('1. Our professional detailing team will arrive at your scheduled location at the chosen time.', 50, 555)
     .text('2. Please ensure access to water and electricity is available near the vehicle service bay.', 50, 567)
     .text('3. You can modify or cancel your booking by contacting our support team at least 24 hours prior.', 50, 579);

  doc.fillColor(textColor)
     .font('Helvetica-Bold')
     .fontSize(10)
     .text('Thank you for choosing DriveGlow!', 50, 620);

  doc.fillColor(lightTextColor)
     .font('Helvetica')
     .fontSize(8)
     .text('This is a computer generated document and does not require a physical signature.', 50, 680, { align: 'center' });

  // Finalize PDF file
  doc.end();
}

module.exports = { generateReceiptPDF };
