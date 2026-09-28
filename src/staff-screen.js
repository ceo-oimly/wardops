/**
 * ============================================================================
 * WardOps - Healthcare Shift & Staffing Operations System
 * File: src/staff-screen.js
 * Description: Controller for Screen 3 (Staff Directory, Workload & CRUD)
 * ============================================================================
 */

import { 
  getAllStaffMembers, 
  createStaffMember, 
  updateStaffMember, 
  deleteStaffMember, 
  adjustWorkloadScore,
  seedInitialStaffData,
  getCachedStaff,
  COMMON_QUALIFICATIONS
} from './staff.js';

// Local UI filter state
const staffFilters = {
  searchQuery: '',
  department: 'ALL',
  status: 'ALL',
  role: 'ALL'
};

let currentEditingStaffId = null;

/**
 * Initializes the Staff Screen
 */
export async function initStaffScreen() {
  await loadStaffData();
  setupStaffEventListeners();
}

/**
 * Fetches staff members from Firestore and renders UI
 */
export async function loadStaffData() {
  const tableBody = document.getElementById('staff-table-body');
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px; color: var(--color-text-secondary);">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
            <div style="font-size: 24px;">🩺</div>
            <div>Loading healthcare staff directory from Firestore...</div>
          </div>
        </td>
      </tr>
    `;
  }

  let staffList = await getAllStaffMembers();

  // If initial load and empty, automatically seed realistic demo data
  if (staffList.length === 0) {
    await seedInitialStaffData();
    staffList = await getAllStaffMembers();
  }

  renderStaffStatCards(staffList);
  renderStaffTable(staffList);
}

/**
 * Renders the 4 Stat Cards at the top of the Staff Directory
 */
function renderStaffStatCards(staffList) {
  const totalCount = staffList.length;
  
  // Synthesize status counts (Available, On Shift, On Leave)
  const onLeaveCount = staffList.filter(s => (s.status || s.employmentStatus) === 'On Leave' || s.employmentStatus === 'On-call').length;
  const onShiftCount = staffList.filter(s => (s.status || '') === 'On Shift' || (Number(s.currentWorkloadScore) >= 3 && (s.status || '') !== 'On Leave')).length;
  const availableCount = Math.max(0, totalCount - onShiftCount - onLeaveCount);

  // Update card elements if present
  const elTotal = document.getElementById('stat-staff-total');
  const elAvail = document.getElementById('stat-staff-available');
  const elShift = document.getElementById('stat-staff-onshift');
  const elLeave = document.getElementById('stat-staff-onleave');

  if (elTotal) elTotal.innerText = totalCount;
  if (elAvail) elAvail.innerText = availableCount;
  if (elShift) elShift.innerText = onShiftCount;
  if (elLeave) elLeave.innerText = onLeaveCount;
}

/**
 * Renders staff list into table based on active search & dropdown filters
 */
export function renderStaffTable(staffList = null) {
  const staff = staffList || getCachedStaff();
  const tableBody = document.getElementById('staff-table-body');
  const emptyState = document.getElementById('staff-empty-state');
  if (!tableBody) return;

  // Filter staff
  const filtered = staff.filter(member => {
    // 1. Text Search Filter
    if (staffFilters.searchQuery) {
      const q = staffFilters.searchQuery.toLowerCase();
      const nameMatch = member.name && member.name.toLowerCase().includes(q);
      const emailMatch = member.email && member.email.toLowerCase().includes(q);
      const roleMatch = member.role && member.role.toLowerCase().includes(q);
      const qualMatch = Array.isArray(member.qualifications) && 
        member.qualifications.some(cert => cert.toLowerCase().includes(q));

      if (!nameMatch && !emailMatch && !roleMatch && !qualMatch) return false;
    }

    // 2. Department Filter
    if (staffFilters.department !== 'ALL') {
      const normalizedDept = member.department.replace(' Department', '');
      const filterDept = staffFilters.department.replace(' Department', '');
      if (!normalizedDept.includes(filterDept) && !filterDept.includes(normalizedDept)) return false;
    }

    // 3. Status Filter (Available, On Shift, On Leave)
    const derivedStatus = getStaffDerivedStatus(member);
    if (staffFilters.status !== 'ALL') {
      if (derivedStatus.toLowerCase() !== staffFilters.status.toLowerCase()) return false;
    }

    // 4. Role Filter
    if (staffFilters.role !== 'ALL') {
      if (member.role !== staffFilters.role) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  tableBody.innerHTML = filtered.map(member => {
    const workload = Number(member.currentWorkloadScore) || 0;
    
    // Workload Visual Tier (used by Module 5 Replacement Engine)
    let workloadClass = 'workload-low';
    let workloadLabel = 'Low Fatigue';
    if (workload >= 5) {
      workloadClass = 'workload-high';
      workloadLabel = 'High Fatigue';
    } else if (workload >= 3) {
      workloadClass = 'workload-med';
      workloadLabel = 'Moderate';
    }

    // Three-Tier Status Badge
    const derivedStatus = getStaffDerivedStatus(member);
    let statusBadgeClass = 'status-good';
    if (derivedStatus === 'On Shift') {
      statusBadgeClass = 'status-warning';
    } else if (derivedStatus === 'On Leave') {
      statusBadgeClass = 'status-critical';
    }

    // Department Badge mapping
    let deptBadgeTag = 'ED';
    let deptBadgeClass = 'badge-ed';
    if (member.department.includes('Surgical') || member.department.includes('Medical')) {
      deptBadgeTag = 'MS';
      deptBadgeClass = 'badge-ms';
    } else if (member.department.includes('Pediatrics')) {
      deptBadgeTag = 'PD';
      deptBadgeClass = 'badge-pd';
    } else if (member.department.includes('Intensive') || member.department.includes('ICU')) {
      deptBadgeTag = 'IC';
      deptBadgeClass = 'badge-ic';
    }

    // Qualifications chips preview
    const certs = Array.isArray(member.qualifications) ? member.qualifications : [];
    const certsHtml = certs.length > 0
      ? certs.slice(0, 2).map(c => `<span class="badge-qualification">${escapeHtml(c)}</span>`).join('') +
        (certs.length > 2 ? `<span class="badge-more">+${certs.length - 2}</span>` : '')
      : '<span style="color: var(--color-text-tertiary); font-size: 11px;">Standard Clinical</span>';

    return `
      <tr data-staff-id="${member.id}">
        <!-- Staff Identity -->
        <td>
          <div class="staff-info-cell">
            <div class="staff-avatar-circle" style="background: #e0f2fe; color: #0284c7;">
              ${getInitials(member.name)}
            </div>
            <div>
              <div class="staff-name-title">${escapeHtml(member.name)}</div>
              <div class="staff-email-sub">${escapeHtml(member.email || 'hospital-staff@wardops.hospital')}</div>
            </div>
          </div>
        </td>

        <!-- Role -->
        <td>
          <span class="role-pill role-${(member.role || 'nurse').toLowerCase().replace(/\s+/g, '-')}">
            ${escapeHtml(member.role)}
          </span>
        </td>

        <!-- Department -->
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="dept-badge ${deptBadgeClass}" style="width: 24px; height: 24px; font-size: 10px;">${deptBadgeTag}</span>
            <span style="font-weight: 500;">${escapeHtml(member.department)}</span>
          </div>
        </td>

        <!-- Status (3-Tier Badge) -->
        <td>
          <span class="status-pill-badge ${statusBadgeClass}">
            <span class="status-dot dot-${statusBadgeClass.replace('status-', '')}"></span>
            <span>${derivedStatus}</span>
          </span>
        </td>

        <!-- Workload Indicator -->
        <td>
          <div style="display: flex; align-items: center;">
            <div class="workload-badge-box ${workloadClass}">
              <span><strong>${workload}</strong> shifts</span>
              <span style="font-size: 10.5px; opacity: 0.85;">&bull; ${workloadLabel}</span>
            </div>
            <div class="workload-stepper">
              <button class="btn-stepper" title="Decrement (-1 shift)" onclick="window.WardOpsStaffScreen.adjustScore('${member.id}', -1)">-</button>
              <button class="btn-stepper" title="Increment (+1 shift)" onclick="window.WardOpsStaffScreen.adjustScore('${member.id}', 1)">+</button>
            </div>
          </div>
        </td>

        <!-- Qualifications -->
        <td>
          <div class="qualifications-flex">${certsHtml}</div>
        </td>

        <!-- Actions -->
        <td style="text-align: right;">
          <div class="staff-row-actions">
            <button class="btn-table-action" title="Edit Profile" onclick="window.WardOpsStaffScreen.openEditModal('${member.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-table-action action-delete" title="Delete Staff" onclick="window.WardOpsStaffScreen.deleteStaff('${member.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Derives status between Available, On Shift, On Leave
 */
function getStaffDerivedStatus(member) {
  if (member.status) return member.status;
  if (member.employmentStatus === 'On-call') return 'On Leave';
  const workload = Number(member.currentWorkloadScore) || 0;
  if (workload >= 4) return 'On Shift';
  return 'Available';
}

/**
 * Sets up event handlers for filters, modals, and actions
 */
function setupStaffEventListeners() {
  // Search input
  const searchInput = document.getElementById('staff-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      staffFilters.searchQuery = e.target.value.trim();
      renderStaffTable();
    });
  }

  // Department filter
  const deptSelect = document.getElementById('filter-staff-dept');
  if (deptSelect) {
    deptSelect.addEventListener('change', (e) => {
      staffFilters.department = e.target.value;
      renderStaffTable();
    });
  }

  // Status filter
  const statusSelect = document.getElementById('filter-staff-status');
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      staffFilters.status = e.target.value;
      renderStaffTable();
    });
  }

  // Role filter
  const roleSelect = document.getElementById('filter-staff-role');
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      staffFilters.role = e.target.value;
      renderStaffTable();
    });
  }

  // Seed sample data button
  const seedBtn = document.getElementById('btn-seed-demo-staff');
  if (seedBtn) {
    seedBtn.addEventListener('click', async () => {
      seedBtn.disabled = true;
      try {
        await seedInitialStaffData();
        await loadStaffData();
        showStaffToast('Sample healthcare staff loaded successfully!', 'success');
      } catch (err) {
        showStaffToast('Failed to seed staff: ' + err.message, 'error');
      } finally {
        seedBtn.disabled = false;
      }
    });
  }

  // Add staff button
  const addBtn = document.getElementById('btn-open-add-staff');
  if (addBtn) {
    addBtn.addEventListener('click', openAddModal);
  }

  // Modal close buttons
  const modalClose = document.getElementById('btn-close-staff-modal');
  const modalCancel = document.getElementById('btn-cancel-staff-modal');
  if (modalClose) modalClose.addEventListener('click', closeStaffModal);
  if (modalCancel) modalCancel.addEventListener('click', closeStaffModal);

  // Form submission
  const staffForm = document.getElementById('staff-upsert-form');
  if (staffForm) {
    staffForm.addEventListener('submit', handleStaffFormSubmit);
  }
}

/**
 * Opens modal for adding new staff
 */
export function openAddModal() {
  currentEditingStaffId = null;
  const modal = document.getElementById('staff-upsert-modal');
  const form = document.getElementById('staff-upsert-form');
  const title = document.getElementById('staff-modal-title');
  const submitBtn = document.getElementById('btn-submit-staff');

  if (!modal || !form) return;

  form.reset();
  title.innerText = 'Add Healthcare Professional';
  submitBtn.innerText = 'Save Staff Member';

  // Uncheck qualifications
  form.querySelectorAll('input[name="qualifications"]').forEach(cb => { cb.checked = false; });

  modal.style.display = 'flex';
}

/**
 * Opens modal for editing existing staff
 */
export function openEditModal(staffId) {
  const staffList = getCachedStaff();
  const member = staffList.find(s => s.id === staffId);
  if (!member) return;

  currentEditingStaffId = staffId;
  const modal = document.getElementById('staff-upsert-modal');
  const title = document.getElementById('staff-modal-title');
  const submitBtn = document.getElementById('btn-submit-staff');

  if (!modal) return;

  title.innerText = `Edit Profile: ${member.name}`;
  submitBtn.innerText = 'Update Staff Member';

  document.getElementById('input-staff-name').value = member.name || '';
  document.getElementById('input-staff-email').value = member.email || '';
  document.getElementById('input-staff-role').value = member.role || 'Nurse';
  document.getElementById('input-staff-dept').value = member.department || 'Emergency Department';
  document.getElementById('input-staff-status').value = member.status || 'Available';
  document.getElementById('input-staff-workload').value = member.currentWorkloadScore ?? 0;
  document.getElementById('input-staff-phone').value = member.phoneNumber || '';

  // Qualifications
  const certs = Array.isArray(member.qualifications) ? member.qualifications : [];
  modal.querySelectorAll('input[name="qualifications"]').forEach(cb => {
    cb.checked = certs.includes(cb.value);
  });

  modal.style.display = 'flex';
}

/**
 * Handles Form Submission (Add or Edit)
 */
async function handleStaffFormSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('btn-submit-staff');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Saving to Firestore...';
  }

  const selectedCerts = [];
  document.querySelectorAll('#staff-upsert-form input[name="qualifications"]:checked').forEach(cb => {
    selectedCerts.push(cb.value);
  });

  const payload = {
    name: document.getElementById('input-staff-name').value.trim(),
    email: document.getElementById('input-staff-email').value.trim(),
    role: document.getElementById('input-staff-role').value,
    department: document.getElementById('input-staff-dept').value,
    status: document.getElementById('input-staff-status').value,
    employmentStatus: document.getElementById('input-staff-status').value === 'On Leave' ? 'On-call' : 'Full-time',
    currentWorkloadScore: parseInt(document.getElementById('input-staff-workload').value, 10) || 0,
    phoneNumber: document.getElementById('input-staff-phone').value.trim(),
    qualifications: selectedCerts
  };

  try {
    if (currentEditingStaffId) {
      await updateStaffMember(currentEditingStaffId, payload);
      showStaffToast(`Staff member "${payload.name}" updated successfully!`, 'success');
    } else {
      await createStaffMember(payload);
      showStaffToast(`Staff member "${payload.name}" added to hospital roster!`, 'success');
    }

    closeStaffModal();
    await loadStaffData();
  } catch (err) {
    showStaffToast('Error: ' + err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = currentEditingStaffId ? 'Update Staff Member' : 'Save Staff Member';
    }
  }
}

/**
 * Closes modal
 */
export function closeStaffModal() {
  const modal = document.getElementById('staff-upsert-modal');
  if (modal) modal.style.display = 'none';
  currentEditingStaffId = null;
}

/**
 * Deletes staff with prompt
 */
export async function deleteStaff(staffId) {
  const staffList = getCachedStaff();
  const member = staffList.find(s => s.id === staffId);
  if (!member) return;

  const confirmed = window.confirm(`Remove ${member.name} from the hospital staff directory?\n\nThis action cannot be undone.`);
  if (!confirmed) return;

  try {
    await deleteStaffMember(staffId);
    showStaffToast(`Staff member "${member.name}" deleted.`, 'info');
    await loadStaffData();
  } catch (err) {
    showStaffToast('Failed to delete staff: ' + err.message, 'error');
  }
}

/**
 * Adjusts workload score (+/- 1)
 */
export async function adjustScore(staffId, delta) {
  try {
    await adjustWorkloadScore(staffId, delta);
    await loadStaffData();
  } catch (err) {
    showStaffToast('Failed to adjust workload: ' + err.message, 'error');
  }
}

/**
 * Helper: Initials
 */
function getInitials(name) {
  if (!name) return '??';
  const clean = name.replace(/^(dr\.|nurse|mr\.|ms\.|mrs\.)\s+/i, '').trim();
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Helper: Toast
 */
function showStaffToast(msg, type = 'info') {
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
    <span class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️'}</span>
    <span class="toast-message">${escapeHtml(msg)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-fadeout');
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }, 3500);
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

// Global hook
window.WardOpsStaffScreen = {
  openAddModal,
  openEditModal,
  closeStaffModal,
  deleteStaff,
  adjustScore
};
