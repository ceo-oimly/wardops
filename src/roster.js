/**
 * ============================================================================
 * WardOps - Healthcare Shift & Staffing Operations System
 * File: src/roster.js
 * Description: Module 2 - Shift Roster (Weekly grid view per department,
 *              shift creation, staff assignment, and overlap conflict detection)
 * ============================================================================
 * 
 * Final-Year University IT Defense Project Note:
 * 1. Purpose:
 *    The Roster Module schedules clinical personnel across departments and shift periods.
 *    It guarantees that no healthcare professional is assigned to overlapping shifts
 *    (preventing exhaustion, human error, and double-booking).
 * 
 * 2. Firestore Collection: 'shifts'
 *    Schema Fields:
 *    - id (String): Firestore document ID
 *    - date (String): Calendar date in YYYY-MM-DD format (e.g. "2024-10-14")
 *    - startTime (String): 24-hour time "07:00", "15:00", "23:00"
 *    - endTime (String): 24-hour time "15:00", "23:00", "07:00"
 *    - department (String): Department name ("Emergency", "Medical / Surgical", "Pediatrics", "Intensive Care Unit")
 *    - requiredRole (String): "Doctor", "Nurse", "Lab Tech", "CNA"
 *    - assignedStaffId (String): Document ID of assigned staff, or "" if unassigned
 *    - assignedStaffName (String): Name snapshot for quick display
 *    - status (String): "scheduled", "in-progress", "completed", "unassigned"
 *    - shiftType (String): "Morning", "Afternoon", "Night"
 */

import { 
  db, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp 
} from './firebase-config.js';
import { getAllStaffMembers, getCachedStaff } from './staff.js';

// Week days for Oct 14 - Oct 20, 2024
export const CURRENT_WEEK_DAYS = [
  { key: '2024-10-14', label: 'Mon', dateNum: '14', fullLabel: 'Monday, Oct 14', isToday: true },
  { key: '2024-10-15', label: 'Tue', dateNum: '15', fullLabel: 'Tuesday, Oct 15', isToday: false },
  { key: '2024-10-16', label: 'Wed', dateNum: '16', fullLabel: 'Wednesday, Oct 16', isToday: false },
  { key: '2024-10-17', label: 'Thu', dateNum: '17', fullLabel: 'Thursday, Oct 17', isToday: false },
  { key: '2024-10-18', label: 'Fri', dateNum: '18', fullLabel: 'Friday, Oct 18', isToday: false },
  { key: '2024-10-19', label: 'Sat', dateNum: '19', fullLabel: 'Saturday, Oct 19', isToday: false },
  { key: '2024-10-20', label: 'Sun', dateNum: '20', fullLabel: 'Sunday, Oct 20', isToday: false }
];

// Hospital departments in roster
export const ROSTER_DEPARTMENTS = [
  { id: 'ED', name: 'Emergency Department', badgeClass: 'badge-ed' },
  { id: 'MS', name: 'Medical / Surgical', badgeClass: 'badge-ms' },
  { id: 'PD', name: 'Pediatrics', badgeClass: 'badge-pd' },
  { id: 'IC', name: 'Intensive Care Unit', badgeClass: 'badge-ic' }
];

// Standard shift slots
export const SHIFT_SLOTS = [
  { type: 'Morning', startTime: '07:00', endTime: '15:00', label: 'Morning (7a-3p)' },
  { type: 'Afternoon', startTime: '15:00', endTime: '23:00', label: 'Afternoon (3p-11p)' },
  { type: 'Night', startTime: '23:00', endTime: '07:00', label: 'Night (11p-7a)' }
];

// In-memory shifts cache for live fast UI interaction
let cachedShifts = [];
let activeDepartmentFilter = 'ALL';
let activeShiftTypeFilter = 'ALL';
let activeMobileDay = '2024-10-14'; // Active day in mobile tab view

// Sample baseline shifts for the week of Oct 14 - 20, 2024
const INITIAL_SAMPLE_SHIFTS = [
  // --- Monday Oct 14 ---
  // Emergency Department
  {
    id: 'shift-ed-mon-morn',
    date: '2024-10-14',
    shiftType: 'Morning',
    startTime: '07:00',
    endTime: '15:00',
    department: 'Emergency Department',
    requiredRole: 'Doctor',
    assignedStaffId: 'staff-dr-vance',
    assignedStaffName: 'Dr. Arthur Vance',
    status: 'scheduled'
  },
  {
    id: 'shift-ed-mon-aft',
    date: '2024-10-14',
    shiftType: 'Afternoon',
    startTime: '15:00',
    endTime: '23:00',
    department: 'Emergency Department',
    requiredRole: 'Nurse',
    assignedStaffId: '',
    assignedStaffName: '',
    status: 'unassigned' // Short-staffed (1 RN needed)
  },
  {
    id: 'shift-ed-mon-night',
    date: '2024-10-14',
    shiftType: 'Night',
    startTime: '23:00',
    endTime: '07:00',
    department: 'Emergency Department',
    requiredRole: 'Nurse',
    assignedStaffId: '',
    assignedStaffName: '',
    status: 'unassigned'
  },
  // Medical / Surgical
  {
    id: 'shift-ms-mon-morn',
    date: '2024-10-14',
    shiftType: 'Morning',
    startTime: '07:00',
    endTime: '15:00',
    department: 'Medical / Surgical',
    requiredRole: 'Nurse',
    assignedStaffId: 'staff-jessica-liu',
    assignedStaffName: 'Nurse Jessica Liu',
    status: 'scheduled'
  },
  {
    id: 'shift-ms-mon-aft',
    date: '2024-10-14',
    shiftType: 'Afternoon',
    startTime: '15:00',
    endTime: '23:00',
    department: 'Medical / Surgical',
    requiredRole: 'Nurse',
    assignedStaffId: '',
    assignedStaffName: '',
    status: 'unassigned'
  },
  {
    id: 'shift-ms-mon-night',
    date: '2024-10-14',
    shiftType: 'Night',
    startTime: '23:00',
    endTime: '07:00',
    department: 'Medical / Surgical',
    requiredRole: 'Nurse',
    assignedStaffId: 'staff-samuel-ramos',
    assignedStaffName: 'Nurse Samuel Ramos',
    status: 'scheduled'
  },
  // Pediatrics
  {
    id: 'shift-pd-mon-morn',
    date: '2024-10-14',
    shiftType: 'Morning',
    startTime: '07:00',
    endTime: '15:00',
    department: 'Pediatrics',
    requiredRole: 'Nurse',
    assignedStaffId: 'staff-brenda-okafor',
    assignedStaffName: 'Nurse Brenda Okafor',
    status: 'scheduled'
  },
  {
    id: 'shift-pd-mon-aft',
    date: '2024-10-14',
    shiftType: 'Afternoon',
    startTime: '15:00',
    endTime: '23:00',
    department: 'Pediatrics',
    requiredRole: 'Nurse',
    assignedStaffId: 'staff-marcus-thorne',
    assignedStaffName: 'Nurse Marcus Thorne',
    status: 'scheduled'
  },
  {
    id: 'shift-pd-mon-night',
    date: '2024-10-14',
    shiftType: 'Night',
    startTime: '23:00',
    endTime: '07:00',
    department: 'Pediatrics',
    requiredRole: 'Nurse',
    assignedStaffId: '',
    assignedStaffName: '',
    status: 'unassigned' // Critical gap in dashboard!
  },
  // Intensive Care Unit
  {
    id: 'shift-ic-mon-morn',
    date: '2024-10-14',
    shiftType: 'Morning',
    startTime: '07:00',
    endTime: '15:00',
    department: 'Intensive Care Unit',
    requiredRole: 'Nurse',
    assignedStaffId: 'staff-elena-cruz',
    assignedStaffName: 'Nurse Elena Cruz',
    status: 'scheduled'
  },
  {
    id: 'shift-ic-mon-aft',
    date: '2024-10-14',
    shiftType: 'Afternoon',
    startTime: '15:00',
    endTime: '23:00',
    department: 'Intensive Care Unit',
    requiredRole: 'Doctor',
    assignedStaffId: 'staff-fatima-almansoor',
    assignedStaffName: 'Dr. Fatima Al-Mansoor',
    status: 'scheduled'
  },
  {
    id: 'shift-ic-mon-night',
    date: '2024-10-14',
    shiftType: 'Night',
    startTime: '23:00',
    endTime: '07:00',
    department: 'Intensive Care Unit',
    requiredRole: 'Nurse',
    assignedStaffId: '',
    assignedStaffName: '',
    status: 'unassigned'
  },

  // --- Tuesday Oct 15 Sample Shifts ---
  {
    id: 'shift-ed-tue-morn',
    date: '2024-10-15',
    shiftType: 'Morning',
    startTime: '07:00',
    endTime: '15:00',
    department: 'Emergency Department',
    requiredRole: 'Nurse',
    assignedStaffId: 'staff-marcus-thorne',
    assignedStaffName: 'Nurse Marcus Thorne',
    status: 'scheduled'
  },
  {
    id: 'shift-ed-tue-aft',
    date: '2024-10-15',
    shiftType: 'Afternoon',
    startTime: '15:00',
    endTime: '23:00',
    department: 'Emergency Department',
    requiredRole: 'Nurse',
    assignedStaffId: 'staff-jessica-liu',
    assignedStaffName: 'Nurse Jessica Liu',
    status: 'scheduled'
  },
  {
    id: 'shift-pd-tue-morn',
    date: '2024-10-15',
    shiftType: 'Morning',
    startTime: '07:00',
    endTime: '15:00',
    department: 'Pediatrics',
    requiredRole: 'Nurse',
    assignedStaffId: 'staff-brenda-okafor',
    assignedStaffName: 'Nurse Brenda Okafor',
    status: 'scheduled'
  },
  {
    id: 'shift-ic-tue-morn',
    date: '2024-10-15',
    shiftType: 'Morning',
    startTime: '07:00',
    endTime: '15:00',
    department: 'Intensive Care Unit',
    requiredRole: 'Nurse',
    assignedStaffId: 'staff-elena-cruz',
    assignedStaffName: 'Nurse Elena Cruz',
    status: 'scheduled'
  },

  // --- Wednesday Oct 16 Sample Shifts ---
  {
    id: 'shift-ed-wed-morn',
    date: '2024-10-16',
    shiftType: 'Morning',
    startTime: '07:00',
    endTime: '15:00',
    department: 'Emergency Department',
    requiredRole: 'Doctor',
    assignedStaffId: 'staff-dr-vance',
    assignedStaffName: 'Dr. Arthur Vance',
    status: 'scheduled'
  },
  {
    id: 'shift-ms-wed-morn',
    date: '2024-10-16',
    shiftType: 'Morning',
    startTime: '07:00',
    endTime: '15:00',
    department: 'Medical / Surgical',
    requiredRole: 'Nurse',
    assignedStaffId: 'staff-samuel-ramos',
    assignedStaffName: 'Nurse Samuel Ramos',
    status: 'scheduled'
  }
];

/**
 * ============================================================================
 * FIRESTORE SHIFTS DATA ACCESS
 * ============================================================================
 */

/**
 * Fetches all shifts from Firestore for the current week
 */
export async function getAllShifts() {
  try {
    const shiftsCol = collection(db, 'shifts');
    const snapshot = await getDocs(shiftsCol);

    const list = [];
    snapshot.forEach(docSnap => {
      list.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (list.length === 0) {
      console.log('Seeding initial baseline shifts into Firestore...');
      cachedShifts = [...INITIAL_SAMPLE_SHIFTS];
      // Seed asynchronously in background
      for (const s of INITIAL_SAMPLE_SHIFTS) {
        addDoc(shiftsCol, { ...s, createdAt: serverTimestamp() }).catch(e => console.warn(e));
      }
      return cachedShifts;
    }

    cachedShifts = list;
    return list;
  } catch (error) {
    console.warn('Using local shifts cache:', error);
    cachedShifts = [...INITIAL_SAMPLE_SHIFTS];
    return cachedShifts;
  }
}

/**
 * ============================================================================
 * BASIC CONFLICT DETECTION ALGORITHM
 * ============================================================================
 * Checks whether a candidate staff member is already assigned to a shift
 * that overlaps with the proposed shift date & hours.
 * 
 * @param {string} staffId 
 * @param {string} shiftDate YYYY-MM-DD
 * @param {string} startTime HH:mm
 * @param {string} endTime HH:mm
 * @param {string} excludeShiftId (Current shift ID being edited, to avoid self-conflict)
 * @returns {Object|null} Conflicting shift details if overlap found, or null
 */
export function checkShiftOverlapConflict(staffId, shiftDate, startTime, endTime, excludeShiftId = null) {
  if (!staffId) return null;

  // Find all other shifts assigned to this staff member on the same date
  const candidateAssignedShifts = cachedShifts.filter(shift => {
    if (shift.id === excludeShiftId) return false;
    if (shift.assignedStaffId !== staffId) return false;
    if (shift.date !== shiftDate) return false;
    return true;
  });

  // Check time overlaps
  for (const existingShift of candidateAssignedShifts) {
    // If exact same shift type or overlapping hours
    const isOverlap = timesOverlap(
      startTime, 
      endTime, 
      existingShift.startTime, 
      existingShift.endTime
    );

    if (isOverlap) {
      return existingShift;
    }
  }

  return null;
}

/**
 * Helper to determine if two time intervals overlap (24h format)
 */
function timesOverlap(start1, end1, start2, end2) {
  // Convert "HH:mm" to integer minutes from midnight
  const toMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  let s1 = toMinutes(start1);
  let e1 = toMinutes(end1);
  let s2 = toMinutes(start2);
  let e2 = toMinutes(end2);

  // Handle overnight shift (e.g. 23:00 to 07:00 next day)
  if (e1 <= s1) e1 += 24 * 60;
  if (e2 <= s2) e2 += 24 * 60;

  return s1 < e2 && s2 < e1;
}

/**
 * Updates a shift's assigned staff in Firestore and local state
 */
export async function assignStaffToShift(shiftId, staffId, staffName) {
  try {
    const shift = cachedShifts.find(s => s.id === shiftId);
    if (!shift) throw new Error('Shift record not found');

    // Run overlap conflict check
    const conflict = checkShiftOverlapConflict(staffId, shift.date, shift.startTime, shift.endTime, shiftId);
    if (conflict) {
      throw new Error(`Conflict detected! Staff member is already assigned to ${conflict.department} (${conflict.startTime}-${conflict.endTime}).`);
    }

    // Update local cache immediately
    shift.assignedStaffId = staffId;
    shift.assignedStaffName = staffName;
    shift.status = staffId ? 'scheduled' : 'unassigned';

    // Update Firestore if available
    try {
      const shiftDocRef = doc(db, 'shifts', shiftId);
      await updateDoc(shiftDocRef, {
        assignedStaffId: staffId,
        assignedStaffName: staffName,
        status: shift.status,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.warn('Firestore update warning (running with local cache):', e);
    }

    return true;
  } catch (err) {
    console.error('Assignment error:', err);
    throw err;
  }
}

/**
 * ============================================================================
 * UI RENDERING CONTROLLERS
 * ============================================================================
 */

let selectedShiftForModal = null;

export async function initRosterScreen() {
  await getAllStaffMembers();
  await getAllShifts();
  renderRosterGrid();
  setupRosterEventListeners();
}

/**
 * Renders the weekly matrix grid
 */
export function renderRosterGrid() {
  const tableBody = document.getElementById('roster-matrix-body');
  if (!tableBody) return;

  const staffList = getCachedStaff();
  const isMobile = window.innerWidth <= 900;

  // Filter departments if filter active
  const departmentsToRender = activeDepartmentFilter === 'ALL'
    ? ROSTER_DEPARTMENTS
    : ROSTER_DEPARTMENTS.filter(d => d.name === activeDepartmentFilter);

  // In mobile tab mode, only show the active day, otherwise all 7 days
  const daysToRender = isMobile 
    ? CURRENT_WEEK_DAYS.filter(d => d.key === activeMobileDay)
    : CURRENT_WEEK_DAYS;

  // Update table header days
  updateTableHeader(daysToRender);

  tableBody.innerHTML = departmentsToRender.map(dept => {
    const dayCellsHtml = daysToRender.map(day => {
      // Find all shifts matching this department and day
      let shiftsInCell = cachedShifts.filter(s => {
        if (s.department !== dept.name) return false;
        if (s.date !== day.key) return false;
        if (activeShiftTypeFilter !== 'ALL' && s.shiftType !== activeShiftTypeFilter) return false;
        return true;
      });

      // If no shifts recorded for this slot yet, show placeholders for standard 3 shifts
      if (shiftsInCell.length === 0) {
        shiftsInCell = SHIFT_SLOTS.map((slot, idx) => ({
          id: `auto-${dept.id}-${day.key}-${slot.type}`,
          date: day.key,
          shiftType: slot.type,
          startTime: slot.startTime,
          endTime: slot.endTime,
          department: dept.name,
          requiredRole: 'Nurse',
          assignedStaffId: '',
          assignedStaffName: '',
          status: 'unassigned'
        }));
      }

      const shiftCardsHtml = shiftsInCell.map(shift => {
        const isAssigned = !!shift.assignedStaffId;
        const staffObj = staffList.find(s => s.id === shift.assignedStaffId);
        
        let cardStatusClass = 'status-good';
        let staffDisplayTitle = shift.assignedStaffName || (staffObj ? staffObj.name : 'Assigned Staff');
        let staffRoleDisplay = staffObj ? staffObj.role : (shift.requiredRole || 'Clinical Staff');

        if (!isAssigned) {
          if (dept.id === 'PD' && shift.shiftType === 'Night') {
            cardStatusClass = 'status-critical';
            staffDisplayTitle = '⚠ Critical Gap (1 RN)';
            staffRoleDisplay = 'Unassigned &bull; Night Coverage';
          } else {
            cardStatusClass = 'status-warning';
            staffDisplayTitle = '⚠ Short-Staffed';
            staffRoleDisplay = `1 ${shift.requiredRole || 'RN'} Needed`;
          }
        }

        return `
          <div class="shift-card ${cardStatusClass}" 
               data-shift-id="${shift.id}" 
               onclick="window.WardOpsRoster.openAssignModal('${shift.id}')"
               title="Click to view details and assign or reassign personnel">
            <div class="shift-card-header">
              <span class="shift-period-tag">${shift.shiftType}</span>
              <span class="shift-card-time">${shift.startTime}&ndash;${shift.endTime}</span>
            </div>
            <div class="shift-staff-name">${escapeHtml(staffDisplayTitle)}</div>
            <div class="shift-staff-role">${escapeHtml(staffRoleDisplay)}</div>
          </div>
        `;
      }).join('');

      return `
        <td>
          <div class="day-cell-shifts">
            ${shiftCardsHtml}
          </div>
        </td>
      `;
    }).join('');

    return `
      <tr>
        <td class="dept-cell-sticky">
          <div class="dept-sticky-inner">
            <div class="dept-badge ${dept.badgeClass}">${dept.id}</div>
            <div>
              <div class="department-name">${dept.name}</div>
              <div style="font-size: 11px; color: var(--color-text-secondary);">3 shifts/day</div>
            </div>
          </div>
        </td>
        ${dayCellsHtml}
      </tr>
    `;
  }).join('');
}

/**
 * Updates table column headers based on active view mode
 */
function updateTableHeader(daysToRender) {
  const headerRow = document.getElementById('roster-table-headers');
  if (!headerRow) return;

  const daysHtml = daysToRender.map(day => `
    <th class="${day.isToday ? 'col-day-today' : ''}">
      <div>${day.label}</div>
      <div style="font-size: 14px; font-weight: 800; line-height: 1;">${day.dateNum}</div>
    </th>
  `).join('');

  headerRow.innerHTML = `
    <th class="col-dept">Department</th>
    ${daysHtml}
  `;
}

/**
 * Sets up event listeners for filters, mobile tabs, modals
 */
function setupRosterEventListeners() {
  // Department filter
  const deptSelect = document.getElementById('filter-roster-dept');
  if (deptSelect) {
    deptSelect.addEventListener('change', (e) => {
      activeDepartmentFilter = e.target.value;
      renderRosterGrid();
    });
  }

  // Shift type filter
  const shiftSelect = document.getElementById('filter-roster-shift');
  if (shiftSelect) {
    shiftSelect.addEventListener('change', (e) => {
      activeShiftTypeFilter = e.target.value;
      renderRosterGrid();
    });
  }

  // Mobile day buttons
  document.querySelectorAll('.day-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.day-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMobileDay = btn.getAttribute('data-day');
      renderRosterGrid();
    });
  });

  // Reassign modal close buttons
  const modalClose = document.getElementById('btn-close-assign-modal');
  const modalCancel = document.getElementById('btn-cancel-assign-modal');
  if (modalClose) modalClose.addEventListener('click', closeAssignModal);
  if (modalCancel) modalCancel.addEventListener('click', closeAssignModal);

  // Modal form submit
  const assignForm = document.getElementById('assign-shift-form');
  if (assignForm) {
    assignForm.addEventListener('submit', handleAssignFormSubmit);
  }

  // Window resize to handle mobile day-tabs toggle
  window.addEventListener('resize', () => {
    renderRosterGrid();
  });
}

/**
 * Opens Assign / Reassign action modal for a clicked shift
 */
export function openAssignModal(shiftId) {
  let shift = cachedShifts.find(s => s.id === shiftId);

  // If auto-generated slot clicked
  if (!shift && shiftId.startsWith('auto-')) {
    const parts = shiftId.split('-');
    const deptId = parts[1];
    const dateStr = `${parts[2]}-${parts[3]}-${parts[4]}`;
    const shiftType = parts[5];
    const slot = SHIFT_SLOTS.find(s => s.type === shiftType) || SHIFT_SLOTS[0];
    const dept = ROSTER_DEPARTMENTS.find(d => d.id === deptId) || ROSTER_DEPARTMENTS[0];

    shift = {
      id: shiftId,
      date: dateStr,
      shiftType: shiftType,
      startTime: slot.startTime,
      endTime: slot.endTime,
      department: dept.name,
      requiredRole: 'Nurse',
      assignedStaffId: '',
      assignedStaffName: '',
      status: 'unassigned'
    };
    cachedShifts.push(shift);
  }

  if (!shift) return;
  selectedShiftForModal = shift;

  const modal = document.getElementById('assign-modal');
  if (!modal) return;

  // Set Shift Details Header
  document.getElementById('modal-shift-title').innerText = `${shift.department} — ${shift.shiftType} Shift`;
  document.getElementById('modal-shift-meta').innerText = `${shift.date} • ${shift.startTime} – ${shift.endTime} • Required Role: ${shift.requiredRole || 'Nurse'}`;

  // Render candidate staff members list with conflict checking
  const candidatesContainer = document.getElementById('candidates-list-container');
  const staffList = getCachedStaff();

  candidatesContainer.innerHTML = staffList.map(member => {
    // Overlap conflict detection check!
    const conflict = checkShiftOverlapConflict(
      member.id, 
      shift.date, 
      shift.startTime, 
      shift.endTime, 
      shift.id
    );

    const isCurrentlyAssigned = member.id === shift.assignedStaffId;
    const hasConflict = !!conflict && !isCurrentlyAssigned;
    const workload = Number(member.currentWorkloadScore) || 0;

    let conflictMessage = '';
    if (hasConflict) {
      conflictMessage = `
        <div class="conflict-badge">
          ⚠ Conflict: Overlapping ${conflict.department} shift (${conflict.startTime}-${conflict.endTime})
        </div>
      `;
    }

    return `
      <div class="candidate-item ${isCurrentlyAssigned ? 'selected' : ''} ${hasConflict ? 'has-conflict' : ''}"
           data-staff-id="${member.id}"
           data-has-conflict="${hasConflict}"
           onclick="window.WardOpsRoster.selectCandidate('${member.id}', ${hasConflict})">
        <div style="display: flex; align-items: center; gap: 10px;">
          <input type="radio" 
                 name="selected_staff" 
                 value="${member.id}" 
                 id="radio-${member.id}" 
                 ${isCurrentlyAssigned ? 'checked' : ''} 
                 ${hasConflict ? 'disabled' : ''} />
          <div>
            <div style="font-size: 13.5px; font-weight: 600; color: var(--color-text-primary);">
              ${escapeHtml(member.name)}
              <span class="role-pill role-${(member.role || '').toLowerCase()}" style="font-size: 11px; margin-left: 6px;">
                ${escapeHtml(member.role)}
              </span>
            </div>
            <div style="font-size: 11.5px; color: var(--color-text-secondary); margin-top: 2px;">
              ${escapeHtml(member.department)} &bull; Recent Workload: <strong>${workload} shifts</strong>
            </div>
            ${conflictMessage}
          </div>
        </div>
        <div style="text-align: right;">
          ${isCurrentlyAssigned ? '<span class="status-pill-badge status-good">Currently Assigned</span>' : ''}
          ${hasConflict ? '<span class="status-pill-badge status-critical">Unavailable</span>' : ''}
        </div>
      </div>
    `;
  }).join('');

  modal.style.display = 'flex';
}

/**
 * Selects candidate on radio or row click
 */
export function selectCandidate(staffId, hasConflict) {
  if (hasConflict) {
    showRosterNotification('Cannot assign staff: Overlapping shift conflict detected!', 'error');
    return;
  }
  const radio = document.getElementById(`radio-${staffId}`);
  if (radio) radio.checked = true;

  document.querySelectorAll('.candidate-item').forEach(el => {
    if (el.getAttribute('data-staff-id') === staffId) {
      el.classList.add('selected');
    } else {
      el.classList.remove('selected');
    }
  });
}

/**
 * Handles assign shift submission
 */
async function handleAssignFormSubmit(e) {
  e.preventDefault();
  if (!selectedShiftForModal) return;

  const selectedRadio = document.querySelector('input[name="selected_staff"]:checked');
  const staffList = getCachedStaff();

  const submitBtn = document.getElementById('btn-submit-assignment');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Saving...';
  }

  try {
    if (!selectedRadio) {
      // Mark as unassigned
      await assignStaffToShift(selectedShiftForModal.id, '', '');
      showRosterNotification('Shift marked as unassigned.', 'info');
    } else {
      const chosenStaff = staffList.find(s => s.id === selectedRadio.value);
      if (!chosenStaff) throw new Error('Staff member not found');

      await assignStaffToShift(
        selectedShiftForModal.id, 
        chosenStaff.id, 
        chosenStaff.name
      );
      showRosterNotification(`Assigned ${chosenStaff.name} to ${selectedShiftForModal.department} successfully!`, 'success');
    }

    closeAssignModal();
    renderRosterGrid();
  } catch (error) {
    showRosterNotification(error.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Confirm Assignment';
    }
  }
}

/**
 * Closes the modal
 */
export function closeAssignModal() {
  const modal = document.getElementById('assign-modal');
  if (modal) modal.style.display = 'none';
  selectedShiftForModal = null;
}

/**
 * Toast notification helper
 */
function showRosterNotification(msg, type = 'info') {
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

// Attach globally for inline event attributes
window.WardOpsRoster = {
  openAssignModal,
  selectCandidate,
  closeAssignModal
};
