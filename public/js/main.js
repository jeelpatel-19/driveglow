document.addEventListener('DOMContentLoaded', () => {

  // ─── NAV: floating glass scroll behaviour ────────────────────────────────
  const siteHeader = document.getElementById('site-header');

  window.addEventListener('scroll', () => {
    if (siteHeader) {
      siteHeader.classList.toggle('scrolled', window.scrollY > 40);
    }
  }, { passive: true });


  // ─── MOBILE DRAWER ───────────────────────────────────────────────────────
  const hamburger = document.getElementById('mobile-menu-toggle');
  const drawer = document.getElementById('mobile-drawer');
  const drawerClose = document.getElementById('drawer-close-btn');
  const backdrop = document.getElementById('drawer-backdrop');

  const openDrawer = () => {
    if (drawer) drawer.classList.add('open');
    if (hamburger) hamburger.classList.add('active');
    if (backdrop) backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  const closeDrawer = () => {
    if (drawer) drawer.classList.remove('open');
    if (hamburger) hamburger.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (hamburger) hamburger.addEventListener('click', () => {
    if (hamburger.classList.contains('active')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });
  if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  document.querySelectorAll('.drawer-link').forEach(link => {
    link.addEventListener('click', closeDrawer);
  });


  // ─── SCROLL FADE-IN OBSERVER ─────────────────────────────────────────────
  const fadeTargets = document.querySelectorAll('.fade-on-scroll');

  if (fadeTargets.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });

    fadeTargets.forEach(el => observer.observe(el));
  }


  // ─── FAQ ACCORDION ───────────────────────────────────────────────────────
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const answerId = btn.getAttribute('aria-controls');
      const answer = document.getElementById(answerId);
      const isOpen = btn.getAttribute('aria-expanded') === 'true';

      document.querySelectorAll('.faq-question').forEach(other => {
        if (other !== btn) {
          other.setAttribute('aria-expanded', 'false');
          const otherId = other.getAttribute('aria-controls');
          const otherAns = document.getElementById(otherId);
          if (otherAns) otherAns.classList.remove('open');
        }
      });

      btn.setAttribute('aria-expanded', String(!isOpen));
      if (answer) answer.classList.toggle('open', !isOpen);
    });
  });


  // ─── DATE MINIMUM ────────────────────────────────────────────────────────
  const appointmentDateInput = document.getElementById('appointmentDate');
  if (appointmentDateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    appointmentDateInput.setAttribute('min', `${yyyy}-${mm}-${dd}`);
  }


  // ─── REGISTRATION NUMBER — auto-uppercase ────────────────────────────────
  const regInput = document.getElementById('vehicleRegistration');
  if (regInput) {
    regInput.addEventListener('input', () => {
      const pos = regInput.selectionStart;
      regInput.value = regInput.value.toUpperCase();
      regInput.setSelectionRange(pos, pos);
    });
  }


  // ─── PACKAGE CARD → AUTO-SELECT IN FORM ──────────────────────────────────
  const packageSelect = document.getElementById('packageName');

  const selectPackage = (packageName) => {
    if (!packageSelect) return;
    packageSelect.value = packageName;
    packageSelect.dispatchEvent(new Event('change'));
  };

  document.querySelectorAll('.btn--card[data-package]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      selectPackage(btn.dataset.package);
      const bookingSection = document.getElementById('booking');
      if (bookingSection) {
        bookingSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });


  // ─── PACKAGE PRICES (₹) ──────────────────────────────────────────────────
  const durations = {
    'Simple Clean': '2 Hours',
    'Deep Clean': '4.5 Hours',
    'Complete Glow': '8 Hours',
  };

  const prices = {
    'Simple Clean': 999,
    'Deep Clean': 2499,
    'Complete Glow': 4999,
  };

  const formatINR = (amount) => `₹${Number(amount).toLocaleString('en-IN')}`;


  // ─── LIVE BOOKING SUMMARY ────────────────────────────────────────────────
  const summaryPackageName = document.getElementById('summary-package-name');
  const summaryDuration = document.getElementById('summary-duration');
  const summarySchedule = document.getElementById('summary-schedule');
  const summaryVehicle = document.getElementById('summary-vehicle');
  const summaryAddress = document.getElementById('summary-address');
  const summaryTotalPrice = document.getElementById('summary-total-price');

  const appointmentDate = document.getElementById('appointmentDate');
  const appointmentTime = document.getElementById('appointmentTime');
  const vehicleBrandInput = document.getElementById('vehicleBrand');
  const vehicleModelInput = document.getElementById('vehicleModel');
  const vehicleTypeSelect = document.getElementById('vehicleType');
  const flatNumberInput = document.getElementById('flatNumber');
  const houseNameInput = document.getElementById('houseName');
  const streetInput = document.getElementById('street');
  const cityInput = document.getElementById('city');
  const stateInput = document.getElementById('state');
  const pincodeInput = document.getElementById('pincode');

  const updateLiveSummary = () => {
    if (packageSelect) {
      const pkgName = packageSelect.value;
      if (pkgName) {
        if (summaryPackageName) summaryPackageName.textContent = pkgName;
        if (summaryDuration) summaryDuration.textContent = durations[pkgName] || '—';
        if (summaryTotalPrice) summaryTotalPrice.textContent = formatINR(prices[pkgName] || 0);
      } else {
        if (summaryPackageName) summaryPackageName.textContent = '—';
        if (summaryDuration) summaryDuration.textContent = '—';
        if (summaryTotalPrice) summaryTotalPrice.textContent = '₹0';
      }
    }

    // Schedule
    if (appointmentDate && appointmentTime &&
      appointmentDate.value && appointmentTime.value) {
      const [y, m, d] = appointmentDate.value.split('-');
      const formatted = new Date(y, m - 1, d)
        .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      if (summarySchedule) summarySchedule.textContent = `${formatted} · ${appointmentTime.value}`;
    } else {
      if (summarySchedule) summarySchedule.textContent = '—';
    }

    // Vehicle
    const brand = vehicleBrandInput?.value.trim() || '';
    const model = vehicleModelInput?.value.trim() || '';
    const type = vehicleTypeSelect?.value || '';
    const reg = regInput?.value.trim() || '';
    const vehicleText = [brand, model, type ? `(${type})` : '', reg ? `· ${reg}` : ''].filter(Boolean).join(' ');
    if (summaryVehicle) summaryVehicle.textContent = vehicleText || '—';

    // Address
    const parts = [
      flatNumberInput?.value.trim() ? `Unit ${flatNumberInput.value.trim()}` : '',
      houseNameInput?.value.trim() || '',
      streetInput?.value.trim() || '',
      cityInput?.value.trim() || '',
      stateInput?.value.trim() || '',
      pincodeInput?.value.trim() || '',
    ].filter(Boolean);
    if (summaryAddress) summaryAddress.textContent = parts.join(', ') || '—';
  };

  [
    packageSelect, appointmentDate, appointmentTime,
    vehicleBrandInput, vehicleModelInput, vehicleTypeSelect, regInput,
    flatNumberInput, houseNameInput, streetInput, cityInput, stateInput, pincodeInput,
    document.getElementById('customerName'),
    document.getElementById('phone'),
    document.getElementById('email'),
    document.getElementById('landmark'),
  ].forEach(el => {
    if (!el) return;
    el.addEventListener('input', updateLiveSummary);
    el.addEventListener('change', updateLiveSummary);
  });


  // ─── FORM SUBMISSION ─────────────────────────────────────────────────────
  const bookingForm = document.getElementById('booking-form-element');
  const confirmModal = document.getElementById('confirmation-modal');
  const btnModalDone = document.getElementById('btn-modal-done');
  const submitBtn = document.getElementById('btn-confirm-booking');

  // ── Inline error / notice helpers ────────────────────────────
  function showFormError(message, type = 'error') {
    let banner = document.getElementById('booking-form-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'booking-form-banner';
      banner.style.cssText = [
        'border-radius:8px', 'padding:14px 18px', 'margin-bottom:18px',
        'font-size:14px', 'font-weight:500', 'display:flex',
        'align-items:center', 'gap:10px', 'animation:fadeIn .3s ease'
      ].join(';');
      if (bookingForm) bookingForm.prepend(banner);
    }
    if (type === 'error') {
      banner.style.background = 'rgba(180,30,50,0.18)';
      banner.style.border     = '1px solid rgba(220,50,70,0.4)';
      banner.style.color      = '#ff6b6b';
      banner.innerHTML        = '⚠️&nbsp;&nbsp;' + message;
    } else {
      banner.style.background = 'rgba(30,180,80,0.15)';
      banner.style.border     = '1px solid rgba(50,200,100,0.35)';
      banner.style.color      = '#6be89a';
      banner.innerHTML        = '✓&nbsp;&nbsp;' + message;
    }
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearFormBanner() {
    const banner = document.getElementById('booking-form-banner');
    if (banner) banner.remove();
  }

  // ── Submission guard (prevents double-clicks) ─────────────────
  let isSubmitting = false;

  // Modal display elements
  const modalBookingId = document.getElementById('modal-booking-id');
  const modalCustomerName = document.getElementById('modal-customer-name');
  const modalPackage = document.getElementById('modal-package');
  const modalVehicle = document.getElementById('modal-vehicle');
  const modalAppointment = document.getElementById('modal-appointment');
  const modalTotal = document.getElementById('modal-total');
  const modalEmailSentTo = document.getElementById('modal-email-sent-to');

  // Custom display/buttons elements
  const btnModalDownload = document.getElementById('btn-modal-download');
  const btnModalResend = document.getElementById('btn-modal-resend');
  const modalNoticeBox = document.querySelector('.modal-email-notice');
  const modalSub = document.querySelector('.modal-sub');

  if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Block re-entry if already submitting
      if (isSubmitting) return;
      isSubmitting = true;
      clearFormBanner();

      const originalLabel = submitBtn.innerHTML;
      submitBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>&nbsp;Processing…`;
      submitBtn.disabled = true;

      const pkgName = packageSelect?.value;
      const price = prices[pkgName] || 0;

      const payload = {
        customerName: document.getElementById('customerName')?.value.trim(),
        phone: document.getElementById('phone')?.value.trim(),
        email: document.getElementById('email')?.value.trim(),
        houseName: houseNameInput?.value.trim(),
        flatNumber: flatNumberInput?.value.trim(),
        street: streetInput?.value.trim(),
        landmark: document.getElementById('landmark')?.value.trim(),
        city: cityInput?.value.trim(),
        state: stateInput?.value.trim(),
        pincode: pincodeInput?.value.trim(),
        vehicleBrand: vehicleBrandInput?.value.trim(),
        vehicleModel: vehicleModelInput?.value.trim(),
        vehicleType: vehicleTypeSelect?.value,
        vehicleRegistration: regInput?.value.trim().toUpperCase(),
        packageName: pkgName,
        price,
        appointmentDate: appointmentDate?.value,
        appointmentTime: appointmentTime?.value,
      };

      try {
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (res.ok) {
          const bk = data.booking;

          // Populate success modal
          if (modalBookingId) modalBookingId.textContent = bk.id;
          if (modalCustomerName) modalCustomerName.textContent = bk.customerName;
          if (modalPackage) modalPackage.textContent = bk.packageName;
          if (modalVehicle) modalVehicle.textContent = `${bk.vehicleBrand} ${bk.vehicleModel}${bk.vehicleRegistration ? ' · ' + bk.vehicleRegistration : ''}`;

          // Format appointment
          if (modalAppointment) {
            const [y, m, d] = bk.appointmentDate.split('-');
            const dateStr = new Date(y, m - 1, d)
              .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
            modalAppointment.textContent = `${dateStr} at ${bk.appointmentTime}`;
          }

          if (modalTotal) modalTotal.textContent = formatINR(bk.price);

          // Configure email delivery status UI
          if (data.emailSent) {
            if (modalSub) {
              modalSub.textContent = "Your confirmation email has been sent successfully.";
            }
            if (modalEmailSentTo) {
              modalEmailSentTo.textContent = `Confirmation email sent to ${bk.email}`;
            }
            if (modalNoticeBox) {
              modalNoticeBox.classList.remove('error');
            }
            if (btnModalResend) {
              btnModalResend.style.display = 'none';
            }
          } else {
            if (modalSub) {
              modalSub.textContent = "Booking successful, but the confirmation email could not be delivered.";
            }
            if (modalEmailSentTo) {
              modalEmailSentTo.textContent = `Could not send confirmation email to ${bk.email || 'your email'}.`;
            }
            if (modalNoticeBox) {
              modalNoticeBox.classList.add('error');
            }
            if (btnModalResend) {
              btnModalResend.style.display = 'flex';
              btnModalResend.dataset.bookingId = bk.id;
            }
          }

          // Link download button with booking ID
          if (btnModalDownload) {
            btnModalDownload.dataset.bookingId = bk.id;
          }

          // Show modal
          if (confirmModal) confirmModal.classList.add('active');

          // Reset form
          bookingForm.reset();
          updateLiveSummary();
        } else {
          showFormError(data.error || 'Booking failed. Please try again.');
        }
      } catch (err) {
        console.error('Booking error:', err);
        showFormError('Network error — please check your connection and try again.');
      } finally {
        submitBtn.innerHTML = originalLabel;
        submitBtn.disabled = false;
        isSubmitting = false;
      }
    });
  }

  // --- DOWNLOAD RECEIPT LISTENER ---
  if (btnModalDownload) {
    btnModalDownload.addEventListener('click', () => {
      const bookingId = btnModalDownload.dataset.bookingId;
      if (bookingId) {
        window.location.href = `/api/bookings/${bookingId}/receipt`;
      }
    });
  }

  // --- RESEND EMAIL LISTENER ---
  if (btnModalResend) {
    btnModalResend.addEventListener('click', async () => {
      const bookingId = btnModalResend.dataset.bookingId;
      if (!bookingId) return;

      const originalHTML = btnModalResend.innerHTML;
      btnModalResend.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>&nbsp;Resending…`;
      btnModalResend.disabled = true;

      try {
        const res = await fetch(`/api/bookings/${bookingId}/resend-email`, {
          method: 'POST'
        });
        const result = await res.json();

        if (res.ok && result.emailSent) {
          if (modalSub) {
            modalSub.textContent = "Confirmation email resent successfully!";
          }
          if (modalEmailSentTo) {
            modalEmailSentTo.textContent = 'Confirmation email sent successfully!';
          }
          if (modalNoticeBox) {
            modalNoticeBox.classList.remove('error');
          }
          btnModalResend.style.display = 'none';
        } else {
          const msg = result.error || 'SMTP server error';
          if (modalEmailSentTo) {
            modalEmailSentTo.textContent = `Resend failed: ${msg}`;
          }
        }
      } catch (err) {
        console.error('Resend error:', err);
        alert('Network error while resending confirmation email.');
      } finally {
        btnModalResend.innerHTML = originalHTML;
        btnModalResend.disabled = false;
      }
    });
  }

  // ─── MODAL CLOSE ─────────────────────────────────────────────────────────
  const closeModal = () => {
    if (confirmModal) confirmModal.classList.remove('active');
    // Scroll to top on "Return to Home"
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (btnModalDone) btnModalDone.addEventListener('click', closeModal);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmModal?.classList.contains('active')) closeModal();
  });

  // ─── MOBILE FLOATING BOOK NOW ───────────────────────────────────────────
  const floatingBookingBtn = document.getElementById('mobile-floating-booking');
  if (floatingBookingBtn) {
    window.addEventListener('scroll', () => {
      const heroSection = document.getElementById('hero-section');
      const bookingSection = document.getElementById('booking');
      
      const heroHeight = heroSection ? heroSection.offsetHeight : 500;
      const bookingTop = bookingSection ? bookingSection.getBoundingClientRect().top + window.scrollY : 1500;
      const bookingBottom = bookingSection ? bookingTop + bookingSection.offsetHeight : 2000;
      
      const currentScroll = window.scrollY;
      
      if (currentScroll > heroHeight - 100 && (currentScroll < bookingTop - 200 || currentScroll > bookingBottom - 100)) {
        floatingBookingBtn.classList.add('visible');
      } else {
        floatingBookingBtn.classList.remove('visible');
      }
    }, { passive: true });
  }

});
