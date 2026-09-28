/**
 * ============================================================================
 * WardOps - Healthcare Shift & Staffing Operations System
 * File: src/attendance-screen.js
 * Description: Controller for Screen 4 (Attendance & Replacement Flow)
 * ============================================================================
 */

import { getAllStaffMembers, getCachedStaff } from './staff.js';
import { getAllShifts } from './roster.js';
import { findEligibleReplacements, confirmShiftReplacement } from './replacement.js';
import { db, collection, addDoc, serverTimestamp } from './firebase-config.js';

// Active shift being monitored in the detail view
let activeShift = {
  id: 'shift-pd-mon-night',
  date: '2024-10-14',
  shiftType: 'Night',
  startTime: '23:00',
  endTime: '07:00',
  department: 'Pediatrics',
  requiredRole: 'Nurse',
  assignedStaffId: 'staff-marcus-kelly',
  assignedStaffName: 'Nurse Marcus Kelly, RN',
  status: 'unavailable', // Initially flagged to showcase the gap
  attendanceStatus: 'unavailable',
  reason: 'Acute illness'
};

// Roster of clinicians on duty for this ward shift
let shiftStaffRoster = [];

/**
 * Initializes Attendance Screen
 */
export async function initAttendanceScreen() {
  await getAllStaffMembers();
  await getAllShifts();
  setupShiftStaffRoster();
  renderAttendanceView();
  setupAttendanceEventListeners();
}

/**
 * Sets up clinicians assigned to this shift
 */
function setupShiftStaffRoster() {
  const allStaff = getCachedStaff();

  // Find or synthesize staff on this shift
  shiftStaffRoster = [
    {
      id: 'staff-marcus-kelly',
      name: 'Nurse Marcus Kelly, RN',
      role: 'Nurse',
      department: 'Pediatrics',
      status: 'unavailable', // Triggers the replacement engine
      attendanceStatus: 'unavailable',
      qualifications: ['PALS (Pediatric Advanced Life Support)', 'BLS (Basic Life Support)'],
      workloadScore: 4,
      checkInTime: null,
      notes: 'Reported sudden acute fever at 6:45 PM'
    },
    {
      id: 'staff-elena-cruz',
      name: 'Nurse Elena Cruz, CCRN',
      role: 'Nurse',
      department: 'Pediatrics',
      status: 'present',
      attendanceStatus: 'present',
      qualifications: ['PALS', 'BLS', 'CCRN'],
      workloadScore: 1,
      checkInTime: '10:48 PM',
      notes: 'Clocked in on time'
    },
    {
      id: 'staff-dr-fatima',
      name: 'Dr. Fatima Al-Mansoor',
      role: 'Doctor',
      department: 'Pediatrics',
      status: 'present',
      attendanceStatus: 'present',
      qualifications: ['PALS', 'ACLS', 'Pediatric Intensive Care'],
      workloadScore: 2,
      checkInTime: '10:52 PM',
      notes: 'Attending physician on duty'
    },
    {
      id: 'staff-david-oconnor',
      name: 'David O\'Connor',
      role: 'Lab Tech',
      department: 'Pediatrics',
      status: 'late',
      attendanceStatus: 'late',
      qualifications: ['Phlebotomy', 'Pediatric Blood Draws'],
      workloadScore: 2,
      checkInTime: '11:14 PM',
      notes: 'Notified supervisor of transit delay'
    }
  ];
}

/**
 * Renders the Attendance Screen UI
 */
export function renderAttendanceView() {
  renderAttendanceStats();
  renderRosterList();
  evaluateGapCallout();
}

/**
 * Renders Attendance Metrics at the top
 */
function renderAttendanceStats() {
  const total = shiftStaffRoster.length;
  const presentCount = shiftStaffRoster.filter(s => s.attendanceStatus === 'present').length;
  const lateCount = shiftStaffRoster.filter(s => s.attendanceStatus === 'late').length;
  const gapCount = shiftStaffRoster.filter(s => s.attendanceStatus === 'absent' || s.attendanceStatus === 'unavailable').length;

  const elTotal = document.getElementById('stat-att-total');
  const elPresent = document.getElementById('stat-att-present');
  const elLate = document.getElementById('stat-att-late');
  const elGaps = document.getElementById('stat-att-gaps');

  if (elTotal) elTotal.innerText = total;
  if (elPresent) elPresent.innerText = presentCount;
  if (elLate) elLate.innerText = lateCount;
  if (elGaps) elGaps.innerText = gapCount;
}

/**
 * Checks if any staff is absent or unavailable and displays the Gap Callout Card
 */
function evaluateGapCallout() {
  const gapContainer = document.getElementById('gap-callout-container');
  if (!gapContainer) return;

  const gapStaff = shiftStaffRoster.find(s => s.attendanceStatus === 'absent' || s.attendanceStatus === 'unavailable');

  if (gapStaff) {
    gapContainer.innerHTML = `
      <div class="gap-alert-card">
        <div class="gap-alert-info">
          <div class="gap-alert-icon">⚠</div>
          <div>
            <div class="gap-alert-title">
              Critical Coverage Gap Detected &bull; ${activeShift.department} ${activeShift.shiftType} Shift
            </div>
            <div class="gap-alert-sub">
              <strong>${escapeHtml(gapStaff.name)}</strong> marked as <em>${gapStaff.attendanceStatus}</em>. 
              1 ${activeShift.requiredRole || 'RN'} needed immediately.
            </div>
          </div>
        </div>

        <button id="btn-trigger-replacement" class="btn-brand-solid" onclick="window.WardOpsAttendance.openReplacementEngine()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          <span>Find Eligible Replacement &rarr;</span>
        </button>
      </div>
    `;
    gapContainer.style.display = 'block';
  } else {
    gapContainer.style.display = 'none';
  }
}

/**
 * Renders the Staff Attendance List
 */
function renderRosterList() {
  const container = document.getElementById('attendance-roster-body');
  if (!container) return;

  container.innerHTML = shiftStaffRoster.map(member => {
    const status = member.attendanceStatus || 'present';

    // Status Pill
    let badgeClass = 'status-good';
    let statusLabel = 'Present';
    if (status === 'late') {
      badgeClass = 'status-warning';
      statusLabel = 'Late (Clocked in)';
    } else if (status === 'absent') {
      badgeClass = 'status-critical';
      statusLabel = 'Absent';
    } else if (status === 'unavailable') {
      badgeClass = 'status-critical';
      statusLabel = 'Unavailable (Sick/Emergency)';
    }

    return `
      <tr>
        <!-- Staff Identity -->
        <td>
          <div class="staff-info-cell">
            <div class="staff-avatar-circle" style="background: #e0f2fe; color: #0284c7;">
              ${getInitials(member.name)}
            </div>
            <div>
              <div class="staff-name-title">${escapeHtml(member.name)}</div>
              <div class="staff-email-sub">${escapeHtml(member.role)} &bull; ${escapeHtml(member.department)}</div>
            </div>
          </div>
        </td>

        <!-- Current Status Badge -->
        <td>
          <span class="status-pill-badge ${badgeClass}">
            <span class="status-dot dot-${badgeClass.replace('status-', '')}"></span>
            <span>${statusLabel}</span>
          </span>
        </td>

        <!-- Timestamp / Notes -->
        <td>
          <div style="font-size: 12.5px; color: var(--color-text-primary);">
            ${member.checkInTime ? `<strong>${member.checkInTime}</strong>` : '<span style="color: var(--color-text-tertiary);">Not clocked in</span>'}
          </div>
          <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">
            ${escapeHtml(member.notes || 'Scheduled clinical rotation')}
          </div>
        </td>

        <!-- Attendance Button Group (Strictly styled per design system) -->
        <td style="text-align: right;">
          <div class="attendance-btn-group" role="group" aria-label="Mark Attendance">
            <button 
              type="button" 
              class="btn-att-status ${status === 'present' ? 'active-present' : ''}" 
              onclick="window.WardOpsAttendance.updateStatus('${member.id}', 'present')">
              Present
            </button>
            <button 
              type="button" 
              class="btn-att-status ${status === 'late' ? 'active-late' : ''}" 
              onclick="window.WardOpsAttendance.updateStatus('${member.id}', 'late')">
              Late
            </button>
            <button 
              type="button" 
              class="btn-att-status ${status === 'absent' ? 'active-absent' : ''}" 
              onclick="window.WardOpsAttendance.updateStatus('${member.id}', 'absent')">
              Absent
            </button>
            <button 
              type="button" 
              class="btn-att-status ${status === 'unavailable' ? 'active-unavailable' : ''}" 
              onclick="window.WardOpsAttendance.updateStatus('${member.id}', 'unavailable')">
              Unavailable
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Updates attendance status for a clinician and saves record to Firestore
 */
export async function updateStatus(staffId, newStatus) {
  const staff = shiftStaffRoster.find(s => s.id === staffId);
  if (!staff) return;

  staff.attendanceStatus = newStatus;
  if (newStatus === 'present' && !staff.checkInTime) {
    staff.checkInTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Save attendance record to Firestore
  try {
    const attCol = collection(db, 'attendance');
    await addDoc(attCol, {
      shiftId: activeShift.id,
      staffId: staffId,
      staffName: staff.name,
      status: newStatus,
      timestamp: serverTimestamp(),
      markedBy: 'jordan.miller@wardops.hospital'
    });
  } catch (err) {
    console.warn('Firestore attendance logging warning:', err);
  }

  renderAttendanceView();

  if (newStatus === 'absent' || newStatus === 'unavailable') {
    showAttendanceToast(`Marked ${staff.name} as ${newStatus}. Gap detected!`, 'error');
  } else {
    showAttendanceToast(`Attendance updated for ${staff.name}: ${newStatus.toUpperCase()}`, 'success');
  }
}

/**
 * Opens Replacement Engine Modal
 * Executes findEligibleReplacements(activeShift)
 */
export function openReplacementEngine() {
  const modal = document.getElementById('replacement-engine-modal');
  const candidatesContainer = document.getElementById('replacement-candidates-container');
  if (!modal || !candidatesContainer) return;

  // Run the centerpiece isolated algorithm!
  const rankedCandidates = findEligibleReplacements(activeShift);

  if (rankedCandidates.length === 0) {
    candidatesContainer.innerHTML = `
      <div style="padding: 32px; text-align: center; color: var(--color-text-secondary);">
        <div style="font-size: 28px; margin-bottom: 8px;">⚠️</div>
        <h4>No Eligible Candidates Found</h4>
        <p style="font-size: 13px; margin-top: 4px;">All other clinicians in this role are either currently scheduled or on leave.</p>
      </div>
    `;
  } else {
    candidatesContainer.innerHTML = rankedCandidates.map(item => {
      const staff = item.staff;
      const rank = item.rank;
      const isTop = item.isTopRecommendation;
      const workload = item.workload;

      return `
        <div class="replacement-candidate-card ${isTop ? 'top-rank' : ''}">
          <div style="display: flex; align-items: flex-start; gap: 14px;">
            <!-- Avatar -->
            <div class="staff-avatar-circle" style="background: ${isTop ? '#d1fae5' : '#e0e7ff'}; color: ${isTop ? '#047857' : '#3730a3'};">
              ${getInitials(staff.name)}
            </div>

            <!-- Details -->
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="candidate-rank-badge ${isTop ? 'rank-gold' : 'rank-silver'}">
                  ${isTop ? '★ Rank #1 Top Pick' : `Rank #${rank}`}
                </span>
                <span style="font-size: 11.5px; color: var(--color-text-secondary); font-weight: 600;">
                  Workload Score: ${workload} shifts
                </span>
              </div>

              <div style="font-size: 14px; font-weight: 700; color: var(--color-text-primary); margin-top: 2px;">
                ${escapeHtml(staff.name)}
                <span class="role-pill role-${(staff.role || 'nurse').toLowerCase()}" style="font-size: 10.5px; margin-left: 6px;">
                  ${escapeHtml(staff.role)}
                </span>
              </div>

              <!-- Reasoning Tags Generated by Engine -->
              <div class="reasoning-tags">
                ${item.reasoningPoints.map(r => `<span class="reason-tag match">✓ ${escapeHtml(r)}</span>`).join('')}
              </div>
            </div>
          </div>

          <!-- Confirm CTA -->
          <div>
            <button 
              type="button" 
              class="${isTop ? 'btn-brand-solid' : 'btn-brand-outline'}" 
              style="padding: 7px 14px; font-size: 12.5px;"
              onclick="window.WardOpsAttendance.selectReplacement('${staff.id}', ${rank})">
              Confirm & Assign
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  modal.style.display = 'flex';
}

/**
 * Handles confirmation of a replacement candidate
 */
export async function selectReplacement(candidateStaffId, rank) {
  const rankedCandidates = findEligibleReplacements(activeShift);
  const chosen = rankedCandidates.find(c => c.staff.id === candidateStaffId);
  if (!chosen) return;

  const modal = document.getElementById('replacement-engine-modal');
  if (modal) modal.style.display = 'none';

  try {
    // 1. Confirm replacement via engine
    const outcome = await confirmShiftReplacement(activeShift, chosen, 'jordan.miller@wardops.hospital');

    // 2. Replace unavailable member in local shift roster
    const gapMemberIdx = shiftStaffRoster.findIndex(s => s.attendanceStatus === 'absent' || s.attendanceStatus === 'unavailable');
    if (gapMemberIdx !== -1) {
      shiftStaffRoster[gapMemberIdx] = {
        id: chosen.staff.id,
        name: chosen.staff.name,
        role: chosen.staff.role,
        department: chosen.staff.department,
        status: 'present',
        attendanceStatus: 'present',
        qualifications: chosen.staff.qualifications || [],
        workloadScore: chosen.workload + 1,
        checkInTime: 'Dispatched (Assigned)',
        notes: `Automated replacement assigned (Rank #${rank})`
      };
    }

    renderAttendanceView();

    // 3. Show high-fidelity confirmation message with simulated notification
    showAttendanceToast(
      `✅ Replacement confirmed! Shift assigned to ${outcome.newStaffName}. SMS dispatch sent to ${outcome.phoneNumber}.`,
      'success'
    );
  } catch (err) {
    showAttendanceToast('Failed to assign replacement: ' + err.message, 'error');
  }
}

/**
 * Closes modal
 */
export function closeReplacementModal() {
  const modal = document.getElementById('replacement-engine-modal');
  if (modal) modal.style.display = 'none';
}

function setupAttendanceEventListeners() {
  const closeBtn = document.getElementById('btn-close-replacement-modal');
  const cancelBtn = document.getElementById('btn-cancel-replacement-modal');
  if (closeBtn) closeBtn.addEventListener('click', closeReplacementModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeReplacementModal);
}

function getInitials(name) {
  if (!name) return '??';
  const clean = name.replace(/^(dr\.|nurse|mr\.|ms\.|mrs\.)\s+/i, '').trim();
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function showAttendanceToast(msg, type = 'info') {
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

window.WardOpsAttendance = {
  updateStatus,
  openReplacementEngine,
  selectReplacement,
  closeReplacementModal
};
