document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const bookingsTableBody = document.getElementById('bookings-table-body');
  const btnRefresh = document.getElementById('btn-refresh');
  const searchInput = document.getElementById('admin-search-input');
  const statusFilters = document.getElementById('status-filters');

  // Stats Elements
  const statTotalBookings = document.getElementById('stat-total-bookings').querySelector('.stat-tile__value');
  const statRevenue = document.getElementById('stat-revenue').querySelector('.stat-tile__value');
  const statPending = document.getElementById('stat-pending').querySelector('.stat-tile__value');
  const statCompleted = document.getElementById('stat-completed').querySelector('.stat-tile__value');

  // Edit Modal Elements
  const editModal = document.getElementById('edit-booking-modal');
  const btnCloseEditModal = document.getElementById('btn-close-edit-modal');
  const editForm = document.getElementById('edit-booking-form');

  // Edit Form Fields
  const editIdInput = document.getElementById('edit-booking-id');
  const editCustomerName = document.getElementById('edit-customerName');
  const editPhone = document.getElementById('edit-phone');
  const editEmail = document.getElementById('edit-email');
  const editHouseName = document.getElementById('edit-houseName');
  const editFlatNumber = document.getElementById('edit-flatNumber');
  const editStreet = document.getElementById('edit-street');
  const editLandmark = document.getElementById('edit-landmark');
  const editCity = document.getElementById('edit-city');
  const editState = document.getElementById('edit-state');
  const editPincode = document.getElementById('edit-pincode');
  const editVehicleBrand = document.getElementById('edit-vehicleBrand');
  const editVehicleModel = document.getElementById('edit-vehicleModel');
  const editVehicleType = document.getElementById('edit-vehicleType');
  const editPackageName = document.getElementById('edit-packageName');
  const editPrice = document.getElementById('edit-price');
  const editAppointmentDate = document.getElementById('edit-appointmentDate');
  const editAppointmentTime = document.getElementById('edit-appointmentTime');
  const editStatus = document.getElementById('edit-status');

  // State Management
  let allBookings = [];
  let currentFilter = 'All';
  let currentSearchQuery = '';

  // --- Fetch Bookings ---
  const fetchBookings = async () => {
    try {
      const response = await fetch('/api/bookings');
      if (response.ok) {
        allBookings = await response.json();
        calculateStats();
        renderTable();
      } else {
        console.error('Failed to fetch bookings:', response.statusText);
      }
    } catch (err) {
      console.error('Network error fetching bookings:', err);
    }
  };

  // --- Calculate Statistics ---
  const calculateStats = () => {
    const total = allBookings.length;

    // Revenue from Confirmed & Completed bookings
    const revenue = allBookings
      .filter(b => b.status === 'Confirmed' || b.status === 'Completed')
      .reduce((sum, b) => sum + (b.price || 0), 0);

    const pending = allBookings.filter(b => b.status === 'Pending').length;
    const completed = allBookings.filter(b => b.status === 'Completed').length;

    statTotalBookings.textContent = total;
    statRevenue.textContent = `₹${revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    statPending.textContent = pending;
    statCompleted.textContent = completed;
  };

  // --- Render Table ---
  const renderTable = () => {
    // 1. Filter by Status
    let filteredBookings = allBookings;
    if (currentFilter !== 'All') {
      filteredBookings = filteredBookings.filter(b => b.status === currentFilter);
    }

    // 2. Filter by Search Query
    if (currentSearchQuery) {
      const query = currentSearchQuery.toLowerCase();
      filteredBookings = filteredBookings.filter(b => {
        return (
          b.id.toLowerCase().includes(query) ||
          b.customerName.toLowerCase().includes(query) ||
          b.phone.toLowerCase().includes(query) ||
          b.email.toLowerCase().includes(query) ||
          b.vehicleBrand.toLowerCase().includes(query) ||
          b.vehicleModel.toLowerCase().includes(query) ||
          b.address.toLowerCase().includes(query)
        );
      });
    }

    // 3. Render DOM
    if (filteredBookings.length === 0) {
      bookingsTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">No matching detailing bookings found.</td>
        </tr>
      `;
      return;
    }

    bookingsTableBody.innerHTML = filteredBookings.map(booking => {
      // Formatted Date
      const dateParts = booking.appointmentDate.split('-');
      const formattedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2])
        .toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

      const statusClass = `badge badge--${booking.status.toLowerCase()}`;

      // Conditional action buttons
      let statusActionsHTML = '';
      if (booking.status === 'Pending') {
        statusActionsHTML += `
          <button class="action-icon confirm btn-confirm" data-id="${booking.id}" title="Confirm Booking">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        `;
      }
      if (booking.status === 'Confirmed' || booking.status === 'Pending') {
        statusActionsHTML += `
          <button class="action-icon complete btn-complete" data-id="${booking.id}" title="Mark Completed">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
          </button>
        `;
      }
      if (booking.status !== 'Cancelled' && booking.status !== 'Completed') {
        statusActionsHTML += `
          <button class="action-icon cancel-btn btn-cancel" data-id="${booking.id}" title="Cancel Booking">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        `;
      }

      return `
        <tr data-booking-id="${booking.id}">
          <td class="cell-id">${booking.id}</td>
          <td>
            <div class="cell-name">${booking.customerName}</div>
            <div class="cell-small">${booking.phone}</div>
            <div class="cell-small">${booking.email}</div>
          </td>
          <td>
            <div style="max-width:190px; word-wrap:break-word; font-size:12px;">${booking.address}</div>
          </td>
          <td>
            <div style="font-weight:500; color:var(--text-primary)">${booking.vehicleBrand} ${booking.vehicleModel}</div>
            <div class="cell-small">${booking.vehicleType}</div>
          </td>
          <td>
            <div style="font-weight:500; color:var(--text-primary)">${booking.packageName}</div>
            <div class="cell-price">₹${Number(booking.price).toLocaleString('en-IN')}</div>
          </td>
          <td>
            <div style="font-weight:500; color:var(--text-primary); white-space:nowrap">${formattedDate}</div>
            <div class="cell-small">${booking.appointmentTime}</div>
          </td>
          <td>
            <span class="${statusClass}">${booking.status}</span>
          </td>
          <td>
            <div class="action-group">
              ${statusActionsHTML}
              <button class="action-icon edit btn-edit" data-id="${booking.id}" title="Edit Booking">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="action-icon delete btn-delete" data-id="${booking.id}" title="Delete Booking">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Rebind action click listeners
    bindActionListeners();
  };

  // --- Update Booking Status ---
  const updateBookingStatus = async (id, status) => {
    try {
      const response = await fetch(`/api/bookings/${id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });
      if (response.ok) {
        fetchBookings();
      } else {
        const err = await response.json();
        alert(`Status update failed: ${err.error || 'Server error'}`);
      }
    } catch (err) {
      console.error('Error changing booking status:', err);
    }
  };

  // --- Open Edit Modal ---
  const openEditModal = (booking) => {
    editIdInput.value = booking.id;
    editCustomerName.value = booking.customerName;
    editPhone.value = booking.phone;
    editEmail.value = booking.email;
    editHouseName.value = booking.houseName || '';
    editFlatNumber.value = booking.flatNumber || '';
    editStreet.value = booking.street || '';
    editLandmark.value = booking.landmark || '';
    editCity.value = booking.city || '';
    editState.value = booking.state || '';
    editPincode.value = booking.pincode || '';
    editVehicleBrand.value = booking.vehicleBrand;
    editVehicleModel.value = booking.vehicleModel;
    editVehicleType.value = booking.vehicleType;
    editPackageName.value = booking.packageName;
    editPrice.value = booking.price;
    editAppointmentDate.value = booking.appointmentDate;
    editAppointmentTime.value = booking.appointmentTime;
    editStatus.value = booking.status;

    editModal.classList.add('active');
  };

  // Auto-fill price on package select change in edit modal
  editPackageName.addEventListener('change', () => {
    const selectedOption = editPackageName.options[editPackageName.selectedIndex];
    if (selectedOption) {
      editPrice.value = selectedOption.dataset.price;
    }
  });

  // --- Submit Edit Form ---
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = editIdInput.value;

      const payload = {
        customerName: editCustomerName.value.trim(),
        phone: editPhone.value.trim(),
        email: editEmail.value.trim(),
        houseName: editHouseName.value.trim(),
        flatNumber: editFlatNumber.value.trim(),
        street: editStreet.value.trim(),
        landmark: editLandmark.value.trim(),
        city: editCity.value.trim(),
        state: editState.value.trim(),
        pincode: editPincode.value.trim(),
        vehicleBrand: editVehicleBrand.value.trim(),
        vehicleModel: editVehicleModel.value.trim(),
        vehicleType: editVehicleType.value,
        packageName: editPackageName.value,
        price: parseFloat(editPrice.value),
        appointmentDate: editAppointmentDate.value,
        appointmentTime: editAppointmentTime.value,
        status: editStatus.value
      };

      try {
        const response = await fetch(`/api/bookings/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          editModal.classList.remove('active');
          fetchBookings();
        } else {
          const err = await response.json();
          alert(`Failed to save booking: ${err.error || 'Server error'}`);
        }
      } catch (err) {
        console.error('Error submitting edit booking:', err);
      }
    });
  }

  // --- Delete Booking ---
  const deleteBooking = async (id) => {
    if (confirm(`Are you sure you want to permanently delete booking ${id}? This action cannot be undone.`)) {
      try {
        const response = await fetch(`/api/bookings/${id}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          fetchBookings();
        } else {
          alert('Delete booking failed.');
        }
      } catch (err) {
        console.error('Error deleting booking:', err);
      }
    }
  };

  // --- Action Button Click Binding ---
  const bindActionListeners = () => {
    // Confirm Status click
    document.querySelectorAll('.btn-confirm').forEach(btn => {
      btn.addEventListener('click', () => {
        updateBookingStatus(btn.dataset.id, 'Confirmed');
      });
    });

    // Complete Status click
    document.querySelectorAll('.btn-complete').forEach(btn => {
      btn.addEventListener('click', () => {
        updateBookingStatus(btn.dataset.id, 'Completed');
      });
    });

    // Cancel Status click
    document.querySelectorAll('.btn-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        updateBookingStatus(btn.dataset.id, 'Cancelled');
      });
    });

    // Edit click
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const booking = allBookings.find(b => b.id === btn.dataset.id);
        if (booking) {
          openEditModal(booking);
        }
      });
    });

    // Delete click
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteBooking(btn.dataset.id);
      });
    });
  };

  // --- Filter Button Bindings ---
  if (statusFilters) {
    statusFilters.querySelectorAll('.pill, .filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        statusFilters.querySelectorAll('.pill, .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.status;
        renderTable();
      });
    });
  }

  // --- Search Bar Bindings ---
  searchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    renderTable();
  });

  // --- General Bindings ---
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      fetchBookings();
    });
  }

  const closeEditModal = () => {
    if (editModal) editModal.classList.remove('active');
  };

  if (btnCloseEditModal) {
    btnCloseEditModal.addEventListener('click', closeEditModal);
  }

  window.addEventListener('click', (e) => {
    if (e.target === editModal) closeEditModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditModal();
  });

  // --- Initial Load ---
  fetchBookings();
});
