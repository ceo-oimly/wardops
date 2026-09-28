/**
 * ============================================================================
 * WardOps - Healthcare Shift & Staffing Operations System
 * File: src/leave-screen.js
 * Description: Controller for Screen 5 (Leave Requests & Approval Workflow)
 * Matches Active Alerts visual language & 3-tier status logic from design system
 * ============================================================================
 */

import { 
  db, 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  orderBy, 
  serverTimestamp 
} from './firebase-config.js';
import { getAllStaffMembers, getCachedStaff, updateStaffMember } from './staff.js';
import { getAllShifts } from './roster.js';

// Local State
let leaveRequestsList = [];
let activeTabFilter = 'ALL'; // 'ALL' | 'pending' | 'approved' | 'rejected'
let activeDeptFilter = 'ALL';
let searchQuery = '';

/**
 * Initializes Leave Requests Screen
 */
export async function initLeaveScreen() {
  await getAllStaffMembers();
  await getAllShifts();
  await loadLeaveRequests();
  setupLeaveEventListeners();
  populateStaffDropdown();
}

/**
 * Loads leave requests from Firestore or seeds realistic hospital initial data
 */
export async function loadLeaveRequests() {
  const container = document.getElementById('leave-requests-list');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--color-text-secondary);">
        <div style="font-size: 24px; margin-bottom: 8px;">⏳</div>
        <div>Loading leave requests from Firestore...</div>
      </div>
    `;
  }

  try {
    const leaveCol = collection(db, 'leaveRequests');
    const q = query(leaveCol, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    leaveRequestsList = [];
    snapshot.forEach(docSnap => {
      leaveRequestsList.push({ id: docSnap.id, ...docSnap.data() });
    });

    // If empty, automatically seed realistic demo requests for academic presentation
    if (leaveRequestsList.length === 0) {
      await seedInitialLeaveRequests();
      const newSnap = await getDocs(q);
      leaveRequestsList = [];
      newSnap.forEach(docSnap => {
        leaveRequestsList.push({ id: docSnap.id, ...docSnap.data() });
      });
    }
  } catch (err) {
    console.warn('Firestore leave load warning, falling back to local demo state:', err);
    if (leaveRequestsList.length === 0) {
      leaveRequestsList = getSampleLeaveRequests();
    }
  }

  updateLeaveStatCards();
  renderLeaveRequestsList();
}

/**
 * Seeds initial demo requests
 */
export async function seedInitialLeaveRequests() {
  const samples = getSampleLeaveRequests();
  const leaveCol = collection(db, 'leaveRequests');

  for (const item of samples) {
    const { id, ...data } = item;
    try {
      await addDoc(leaveCol, {
        ...data,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.warn('Could not seed leave request:', e);
    }
  }
}

/**
 * Sample realistic hospital leave requests for demonstration
 */
function getSampleLeaveRequests() {
  return [
    {
      id: 'leave-1',
      staffId: 'staff-marcus-kelly',
      staffName: 'Nurse Marcus Kelly, RN',
      role: 'Nurse',
      department: 'Pediatrics',
      leaveType: 'Medical / Acute Illness',
      startDate: '2024-10-14',
      endDate: '2024-10-16',
      durationDays: 3,
      reason: 'Acute seasonal influenza with high fever, unable to report for overnight pediatric shifts.',
      status: 'pending',
      impactedShiftsCount: 2,
      impactedShiftsNote: 'Oct 14 Night Shift & Oct 15 Night Shift in Pediatrics',
      submittedDate: 'Oct 14, 2024 06:45 PM'
    },
    {
      id: 'leave-2',
      staffId: 'staff-dr-vance',
      staffName: 'Dr. Arthur Vance',
      role: 'Doctor',
      department: 'Emergency Department',
      leaveType: 'Continuing Medical Education',
      startDate: '2024-10-18',
      endDate: '2024-10-21',
      durationDays: 4,
      reason: 'Attending American College of Emergency Physicians (ACEP) Annual Symposium in Boston.',
      status: 'pending',
      impactedShiftsCount: 1,
      impactedShiftsNote: 'Oct 19 Afternoon Shift in ED',
      submittedDate: 'Oct 13, 2024 11:20 AM'
    },
    {
      id: 'leave-3',
      staffId: 'staff-elena-cruz',
      staffName: 'Nurse Elena Cruz, CCRN',
      role: 'Nurse',
      department: 'Intensive Care Unit',
      leaveType: 'Family Emergency',
      startDate: '2024-10-22',
      endDate: '2024-10-25',
      durationDays: 4,
      reason: 'Emergency family travel to care for hospitalized parent.',
      status: 'pending',
      impactedShiftsCount: 2,
      impactedShiftsNote: 'Oct 23 & 24 Morning Shifts in ICU',
      submittedDate: 'Oct 12, 2024 04:15 PM'
    },
    {
      id: 'leave-4',
      staffId: 'staff-rachel-zhao',
      staffName: 'Nurse Rachel Zhao, BSN',
      role: 'Nurse',
      department: 'Medical / Surgical',
      leaveType: 'Annual Vacation',
      startDate: '2024-10-10',
      endDate: '2024-10-13',
      durationDays: 4,
      reason: 'Approved annual personal leave.',
      status: 'approved',
      reviewedBy: 'Jordan Miller',
      reviewedAt: 'Oct 08, 2024',
      impactedShiftsCount: 0,
      impactedShiftsNote: 'Coverage pre-arranged during roster planning',
      submittedDate: 'Oct 05, 2024 09:30 AM'
    },
    {
      id: 'leave-5',
      staffId: 'staff-david-oconnor',
      staffName: 'David O\'Connor',
      role: 'Lab Tech',
      department: 'Emergency Department',
      leaveType: 'Personal Time Off',
      startDate: '2024-10-09',
      endDate: '2024-10-10',
      durationDays: 2,
      reason: 'Short notice personal appointment.',
      status: 'rejected',
      reviewedBy: 'Jordan Miller',
      reviewedAt: 'Oct 09, 2024',
      rejectionReason: 'Critical staffing shortfall in ED Lab; unable to backfill on 4-hour notice.',
      impactedShiftsCount: 1,
      impactedShiftsNote: 'Shift required on-site attendance',
      submittedDate: 'Oct 09, 2024 06:00 AM'
    }
  ];
}

/**
 * Updates the 4 Stat Cards
 */
function updateLeaveStatCards() {
  const pendingCount = leaveRequestsList.filter(l => l.status === 'pending').length;
  const approvedCount = leaveRequestsList.filter(l => l.status === 'approved').length;
  const rejectedCount = leaveRequestsList.filter(l => l.status === 'rejected').length;

  const allStaff = getCachedStaff();
  const staffOnLeaveCount = allStaff.filter(s => (s.status || '') === 'On Leave' || s.employmentStatus === 'On-call').length;

  const elPending = document.getElementById('stat-leave-pending');
  const elApproved = document.getElementById('stat-leave-approved');
  const elRejected = document.getElementById('stat-leave-rejected');
  const elOnLeave = document.getElementById('stat-leave-onleave');

  if (elPending) elPending.innerText = pendingCount;
  if (elApproved) elApproved.innerText = approvedCount;
  if (elRejected) elRejected.innerText = rejectedCount;
  if (elOnLeave) elOnLeave.innerText = staffOnLeaveCount;

  // Update tab badges
  const badgeAll = document.getElementById('tab-badge-all');
  const badgePending = document.getElementById('tab-badge-pending');
  const badgeApproved = document.getElementById('tab-badge-approved');
  const badgeRejected = document.getElementById('tab-badge-rejected');

  if (badgeAll) badgeAll.innerText = leaveRequestsList.length;
  if (badgePending) badgePending.innerText = pendingCount;
  if (badgeApproved) badgeApproved.innerText = approvedCount;
  if (badgeRejected) badgeRejected.innerText = rejectedCount;

  // Sidebar counter sync
  const sidebarLeaveCounter = document.querySelector('.nav-counter');
  if (sidebarLeaveCounter) {
    sidebarLeaveCounter.innerText = pendingCount;
  }
}

/**
 * Renders the Leave Requests list matching the Active Alerts pattern
 */
export function renderLeaveRequestsList() {
  const container = document.getElementById('leave-requests-list');
  const emptyState = document.getElementById('leave-empty-state');
  if (!container) return;

  // Filter requests
  const filtered = leaveRequestsList.filter(item => {
    // Tab filter
    if (activeTabFilter !== 'ALL' && item.status !== activeTabFilter) {
      return false;
    }

    // Department filter
    if (activeDeptFilter !== 'ALL') {
      const normDept = (item.department || '').replace(' Department', '');
      const normFilter = activeDeptFilter.replace(' Department', '');
      if (!normDept.includes(normFilter) && !normFilter.includes(normDept)) {
        return false;
      }
    }

    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const nameMatch = item.staffName && item.staffName.toLowerCase().includes(q);
      const reasonMatch = item.reason && item.reason.toLowerCase().includes(q);
      const typeMatch = item.leaveType && item.leaveType.toLowerCase().includes(q);
      if (!nameMatch && !reasonMatch && !typeMatch) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  container.innerHTML = filtered.map(item => {
    // 3-Tier Status Styling
    let iconClass = 'alert-icon-warning';
    let cardStatusClass = 'status-pending';
    let statusPillClass = 'status-warning';
    let statusLabel = 'Pending Review';
    let statusIconSvg = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    `;

    if (item.status === 'approved') {
      iconClass = 'alert-icon-good';
      cardStatusClass = 'status-approved';
      statusPillClass = 'status-good';
      statusLabel = 'Approved';
      statusIconSvg = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      `;
    } else if (item.status === 'rejected') {
      iconClass = 'alert-icon-critical';
      cardStatusClass = 'status-rejected';
      statusPillClass = 'status-critical';
      statusLabel = 'Rejected';
      statusIconSvg = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      `;
    }

    // Department Badge mapping
    let deptBadgeTag = 'ED';
    let deptBadgeClass = 'badge-ed';
    if ((item.department || '').includes('Surgical') || (item.department || '').includes('Medical')) {
      deptBadgeTag = 'MS';
      deptBadgeClass = 'badge-ms';
    } else if ((item.department || '').includes('Pediatrics')) {
      deptBadgeTag = 'PD';
      deptBadgeClass = 'badge-pd';
    } else if ((item.department || '').includes('Intensive') || (item.department || '').includes('ICU')) {
      deptBadgeTag = 'IC';
      deptBadgeClass = 'badge-ic';
    }

    // Impact Callout Box
    const hasImpact = (item.impactedShiftsCount || 0) > 0;
    const impactHtml = hasImpact
      ? `
        <div class="leave-impact-box">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span>⚠️</span>
            <span><strong>${item.impactedShiftsCount} scheduled shift${item.impactedShiftsCount > 1 ? 's' : ''} affected:</strong> ${escapeHtml(item.impactedShiftsNote || 'Requires replacement')}</span>
          </div>
          <a href="/attendance.html" class="alert-action-link" style="color: #b91c1c;">
            View Shift Gaps &rarr;
          </a>
        </div>
      `
      : `
        <div class="leave-impact-box leave-impact-safe">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span>✅</span>
            <span>No conflicting shifts scheduled in roster for this period.</span>
          </div>
        </div>
      `;

    // Action buttons based on status
    let actionButtonsHtml = '';
    if (item.status === 'pending') {
      actionButtonsHtml = `
        <div class="leave-actions-group">
          <button 
            type="button" 
            class="btn-leave-approve" 
            onclick="window.WardOpsLeave.approveRequest('${item.id}')"
            title="Approve leave and update staff availability">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Approve</span>
          </button>
          <button 
            type="button" 
            class="btn-leave-reject" 
            onclick="window.WardOpsLeave.rejectRequest('${item.id}')"
            title="Reject leave application">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            <span>Reject</span>
          </button>
        </div>
      `;
    } else if (item.status === 'approved') {
      actionButtonsHtml = `
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <span class="status-pill-badge status-good">
            <span class="status-dot dot-good"></span>
            <span>Approved by ${escapeHtml(item.reviewedBy || 'Jordan Miller')}</span>
          </span>
          <span style="font-size: 11px; color: var(--color-text-tertiary);">${escapeHtml(item.reviewedAt || 'Earlier')}</span>
        </div>
      `;
    } else {
      actionButtonsHtml = `
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <span class="status-pill-badge status-critical">
            <span class="status-dot dot-critical"></span>
            <span>Rejected</span>
          </span>
          <span style="font-size: 11px; color: var(--color-text-secondary); max-width: 200px; text-align: right;">
            ${escapeHtml(item.rejectionReason || 'Staffing shortage')}
          </span>
        </div>
      `;
    }

    return `
      <div class="leave-card-item ${cardStatusClass}" id="leave-card-${item.id}">
        <div class="leave-card-main">
          <!-- Status Icon Box (matching Active Alerts style) -->
          <div class="alert-icon-box ${iconClass}">
            ${statusIconSvg}
          </div>

          <!-- Body Content -->
          <div class="leave-content-box">
            <!-- Title & Department Badge -->
            <div class="leave-title-row">
              <span class="leave-staff-name">${escapeHtml(item.staffName)}</span>
              <span class="leave-role-sub">&bull; ${escapeHtml(item.role)}</span>
              <span class="dept-badge ${deptBadgeClass}" style="width: 22px; height: 22px; font-size: 9.5px;">${deptBadgeTag}</span>
              <span style="font-size: 12px; color: var(--color-text-secondary); font-weight: 500;">
                ${escapeHtml(item.department)}
              </span>
              <span class="status-pill-badge ${statusPillClass}" style="margin-left: auto;">
                <span class="status-dot dot-${statusPillClass.replace('status-', '')}"></span>
                <span>${statusLabel}</span>
              </span>
            </div>

            <!-- Date Range & Leave Category -->
            <div class="leave-dates-row">
              <span class="dates-icon">📅</span>
              <span><strong>${escapeHtml(item.startDate)}</strong> &ndash; <strong>${escapeHtml(item.endDate)}</strong></span>
              <span class="leave-duration-tag">${item.durationDays || calculateDays(item.startDate, item.endDate)} days</span>
              <span style="color: var(--color-text-tertiary);">&bull;</span>
              <span style="font-size: 12px; font-weight: 600; color: var(--color-brand-teal);">
                ${escapeHtml(item.leaveType || 'Medical Leave')}
              </span>
            </div>

            <!-- Reason Description -->
            <div class="leave-reason-text">
              &ldquo;${escapeHtml(item.reason)}&rdquo;
            </div>

            <!-- Impact Notice -->
            ${impactHtml}
          </div>
        </div>

        <!-- Action / Review Area -->
        ${actionButtonsHtml}
      </div>
    `;
  }).join('');
}

/**
 * Handles Approving a Leave Request
 * 1. Updates leaveRequest in Firestore to 'approved'
 * 2. Updates staff member status to 'On Leave'
 * 3. Alerts supervisor if shifts need re-assignment
 */
export async function approveRequest(requestId) {
  const req = leaveRequestsList.find(l => l.id === requestId);
  if (!req) return;

  try {
    // 1. Update Firestore record
    try {
      const docRef = doc(db, 'leaveRequests', requestId);
      await updateDoc(docRef, {
        status: 'approved',
        reviewedBy: 'Jordan Miller (Shift Supervisor)',
        reviewedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      });
    } catch (e) {
      console.warn('Firestore doc update skipped or mocked:', e);
    }

    // 2. Update local state
    req.status = 'approved';
    req.reviewedBy = 'Jordan Miller';
    req.reviewedAt = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // 3. Update staff member status to 'On Leave'
    if (req.staffId) {
      try {
        await updateStaffMember(req.staffId, { 
          status: 'On Leave',
          employmentStatus: 'On-call' 
        });
      } catch (err) {
        console.warn('Could not update staff member status:', err);
      }
    }

    updateLeaveStatCards();
    renderLeaveRequestsList();

    const toastMsg = req.impactedShiftsCount > 0
      ? `Leave approved for ${req.staffName}. ⚠️ ${req.impactedShiftsCount} shifts now require replacement!`
      : `Leave approved for ${req.staffName}. Staff marked 'On Leave'.`;

    showLeaveToast(toastMsg, req.impactedShiftsCount > 0 ? 'warning' : 'success');
  } catch (err) {
    showLeaveToast('Failed to approve request: ' + err.message, 'error');
  }
}

/**
 * Handles Rejecting a Leave Request
 */
export async function rejectRequest(requestId) {
  const req = leaveRequestsList.find(l => l.id === requestId);
  if (!req) return;

  const reason = window.prompt(
    `Reason for rejecting ${req.staffName}'s leave request:`,
    'Minimum ward clinical staffing thresholds cannot be maintained during this period.'
  );

  if (reason === null) return; // User cancelled prompt

  try {
    try {
      const docRef = doc(db, 'leaveRequests', requestId);
      await updateDoc(docRef, {
        status: 'rejected',
        rejectionReason: reason || 'Staffing shortage',
        reviewedBy: 'Jordan Miller (Shift Supervisor)',
        reviewedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      });
    } catch (e) {
      console.warn('Firestore doc update skipped or mocked:', e);
    }

    req.status = 'rejected';
    req.rejectionReason = reason || 'Staffing shortage';
    req.reviewedBy = 'Jordan Miller';
    req.reviewedAt = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    updateLeaveStatCards();
    renderLeaveRequestsList();

    showLeaveToast(`Leave request for ${req.staffName} marked as Rejected.`, 'info');
  } catch (err) {
    showLeaveToast('Failed to reject request: ' + err.message, 'error');
  }
}

/**
 * Sets up all event listeners for Screen 5
 */
function setupLeaveEventListeners() {
  // Tab buttons
  document.querySelectorAll('.leave-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.leave-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTabFilter = btn.getAttribute('data-tab');
      renderLeaveRequestsList();
    });
  });

  // Department filter dropdown
  const deptSelect = document.getElementById('filter-leave-dept');
  if (deptSelect) {
    deptSelect.addEventListener('change', (e) => {
      activeDeptFilter = e.target.value;
      renderLeaveRequestsList();
    });
  }

  // Search input
  const searchInput = document.getElementById('leave-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderLeaveRequestsList();
    });
  }

  // Seed sample requests button
  const seedBtn = document.getElementById('btn-seed-leave');
  if (seedBtn) {
    seedBtn.addEventListener('click', async () => {
      seedBtn.disabled = true;
      try {
        await seedInitialLeaveRequests();
        await loadLeaveRequests();
        showLeaveToast('Sample leave requests loaded successfully!', 'success');
      } catch (err) {
        showLeaveToast('Error seeding leave: ' + err.message, 'error');
      } finally {
        seedBtn.disabled = false;
      }
    });
  }

  // Modal open / close
  const openModalBtn = document.getElementById('btn-open-request-modal');
  const closeModalBtn = document.getElementById('btn-close-leave-modal');
  const cancelModalBtn = document.getElementById('btn-cancel-leave-modal');
  const modal = document.getElementById('leave-request-modal');

  if (openModalBtn && modal) {
    openModalBtn.addEventListener('click', () => {
      modal.style.display = 'flex';
      populateStaffDropdown();
    });
  }

  const closeModal = () => { if (modal) modal.style.display = 'none'; };
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);

  // Form submission
  const form = document.getElementById('leave-request-form');
  if (form) {
    form.addEventListener('submit', handleNewLeaveSubmit);
  }
}

/**
 * Populates staff select dropdown in modal
 */
function populateStaffDropdown() {
  const staffSelect = document.getElementById('input-leave-staff');
  if (!staffSelect) return;

  const staff = getCachedStaff();
  if (staff.length === 0) return;

  staffSelect.innerHTML = staff.map(s => `
    <option value="${s.id}" data-role="${escapeHtml(s.role)}" data-dept="${escapeHtml(s.department)}">
      ${escapeHtml(s.name)} &bull; ${escapeHtml(s.role)} (${escapeHtml(s.department)})
    </option>
  `).join('');
}

/**
 * Handles submission of a new Leave Application
 */
async function handleNewLeaveSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('btn-submit-leave');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Submitting Request...';
  }

  const staffSelect = document.getElementById('input-leave-staff');
  const selectedOpt = staffSelect.options[staffSelect.selectedIndex];
  const staffId = staffSelect.value;
  const staffName = selectedOpt.text.split(' • ')[0];
  const role = selectedOpt.getAttribute('data-role') || 'Nurse';
  const department = selectedOpt.getAttribute('data-dept') || 'Pediatrics';

  const leaveType = document.getElementById('input-leave-type').value;
  const startDate = document.getElementById('input-leave-start').value;
  const endDate = document.getElementById('input-leave-end').value;
  const reason = document.getElementById('input-leave-reason').value.trim();

  const durationDays = calculateDays(startDate, endDate);

  const newRequest = {
    staffId,
    staffName,
    role,
    department,
    leaveType,
    startDate,
    endDate,
    durationDays,
    reason,
    status: 'pending',
    impactedShiftsCount: 1, // Simulated schedule check
    impactedShiftsNote: `Pending shift conflict check during ${startDate}`,
    submittedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  };

  try {
    const leaveCol = collection(db, 'leaveRequests');
    const docRef = await addDoc(leaveCol, {
      ...newRequest,
      createdAt: serverTimestamp()
    });
    newRequest.id = docRef.id;
    leaveRequestsList.unshift(newRequest);

    document.getElementById('leave-request-modal').style.display = 'none';
    document.getElementById('leave-request-form').reset();

    updateLeaveStatCards();
    renderLeaveRequestsList();
    showLeaveToast(`Leave request submitted for ${staffName}!`, 'success');
  } catch (err) {
    showLeaveToast('Failed to submit: ' + err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Submit Leave Request';
    }
  }
}

/**
 * Helper: Calculate days between dates
 */
function calculateDays(start, end) {
  if (!start || !end) return 1;
  const s = new Date(start);
  const e = new Date(end);
  const diffTime = Math.abs(e - s);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays || 1;
}

/**
 * Helper: Toast
 */
function showLeaveToast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✅' : type === 'warning' ? '⚠️' : type === 'error' ? '❌' : 'ℹ️'}</span>
    <span class="toast-message">${escapeHtml(msg)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-fadeout');
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Global hook for inline handlers
window.WardOpsLeave = {
  approveRequest,
  rejectRequest
};
