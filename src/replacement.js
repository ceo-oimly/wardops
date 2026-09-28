/**
 * ============================================================================
 * WardOps - Healthcare Shift & Staffing Operations System
 * File: src/replacement.js
 * Description: Module 5 - Automated Replacement Recommendation Engine
 * ============================================================================
 * 
 * ACADEMIC DEFENSE & PANEL EXPLANATION:
 * 
 * 1. Problem Statement:
 *    When a hospital clinician calls in sick or fails to report for duty,
 *    a supervisor is forced to make rapid decisions under clinical duress.
 *    Manual reassignment risks:
 *      - Assigning an unqualified role (e.g. assigning a CNA where an RN is required)
 *      - Double-booking staff on overlapping shifts
 *      - Overburdening already fatigued staff, which causes clinical burnout and errors.
 * 
 * 2. Automated Recommendation Algorithm:
 *    WardOps provides clinical decision support: it *recommends* ranked options,
 *    leaving the final confirmation to the human supervisor.
 * 
 *    Filtering Pipeline (Strict Hierarchy):
 *      Step A. Role Eligibility: candidate.role must equal shift.requiredRole
 *      Step B. Leave Status: candidate must NOT be on approved leave
 *      Step C. Schedule Conflict: candidate must NOT have an overlapping shift
 *      Step D. Department Proximity: candidates in the same ward are prioritized
 *              (higher departmental familiarity), followed by cross-ward reserves
 * 
 *    Fatigue Ranking:
 *      Candidates passing all constraints are sorted ASCENDING by `currentWorkloadScore`.
 *      The least-recently-worked professional is recommended as #1 Top Pick.
 */

import { 
  db, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  serverTimestamp 
} from './firebase-config.js';
import { getAllStaffMembers, getCachedStaff, adjustWorkloadScore } from './staff.js';
import { getAllShifts, checkShiftOverlapConflict } from './roster.js';

/**
 * CORE REPLACEMENT ENGINE ALGORITHM
 * 
 * Finds, filters, and ranks eligible clinical staff to fill an open shift gap.
 * Isolated so that students can independently walk an examination panel through it.
 * 
 * @param {Object} shift - The open shift object requiring replacement
 * @returns {Array<Object>} Sorted list of ranked candidates with human-readable reasoning
 */
export function findEligibleReplacements(shift) {
  if (!shift) return [];

  // Step 1: Retrieve all registered healthcare staff
  const allStaff = getCachedStaff();

  // Normalized shift requirements
  const requiredRole = (shift.requiredRole || 'Nurse').toLowerCase();
  const shiftDept = shift.department;
  const shiftDate = shift.date;
  const startTime = shift.startTime;
  const endTime = shift.endTime;

  const candidatePool = [];

  // Step 2: Evaluate each staff member against clinical constraints
  for (const staff of allStaff) {
    // Constraint 1: Exclude the staff member who just vacated the shift
    if (staff.id === shift.assignedStaffId) {
      continue;
    }

    // Constraint 2: Role Match
    // In hospital settings, a doctor cannot be replaced by a lab tech or vice versa
    const candidateRole = (staff.role || '').toLowerCase();
    const roleMatches = candidateRole === requiredRole || 
      (requiredRole.includes('nurse') && candidateRole.includes('nurse')) ||
      (requiredRole.includes('doctor') && candidateRole.includes('doctor'));

    if (!roleMatches) {
      continue; // Disqualified: role does not meet shift clinical requirement
    }

    // Constraint 3: Leave & Availability Status
    // Staff on vacation, medical leave, or flagged "On Leave" cannot be called in
    const isAvailable = (staff.status || '').toLowerCase() !== 'on leave' &&
      (staff.employmentStatus || '').toLowerCase() !== 'on-call-unavailable';

    if (!isAvailable) {
      continue; // Disqualified: candidate is currently on approved leave
    }

    // Constraint 4: Schedule Overlap Conflict
    // Verify candidate is not already scheduled on an overlapping shift
    const conflict = checkShiftOverlapConflict(staff.id, shiftDate, startTime, endTime, shift.id);
    if (conflict) {
      continue; // Disqualified: candidate already scheduled in another ward at that time
    }

    // Step 3: Candidate is fully eligible! Compute proximity & reasoning
    const isSameDepartment = staff.department === shiftDept || 
      staff.department.replace(' Department', '') === shiftDept.replace(' Department', '');

    const workload = Number(staff.currentWorkloadScore) || 0;

    // Build human-readable audit reasoning for the supervisor UI
    const reasoningPoints = [];
    if (isSameDepartment) {
      reasoningPoints.push(`Same Ward (${staff.department})`);
    } else {
      reasoningPoints.push(`Cross-department reserve (${staff.department})`);
    }
    reasoningPoints.push(`Role verified (${staff.role})`);
    reasoningPoints.push(`No schedule conflicts`);

    if (workload === 0) {
      reasoningPoints.push(`Fresh rotation (0 shifts worked)`);
    } else if (workload <= 2) {
      reasoningPoints.push(`Low fatigue index (${workload} shifts)`);
    } else {
      reasoningPoints.push(`Workload score: ${workload}`);
    }

    candidatePool.push({
      staff,
      isSameDepartment,
      workload,
      reasoningPoints,
      // Department preference score for sorting: same dept gets boost
      deptPriorityWeight: isSameDepartment ? 0 : 1
    });
  }

  // Step 4: Multi-tier Ranking:
  // First priority: Department proximity (staff from the same unit know the ward workflow)
  // Second priority: Workload score ASCENDING (least-worked staff to prevent burnout)
  candidatePool.sort((a, b) => {
    // Primary sort: Same department first
    if (a.deptPriorityWeight !== b.deptPriorityWeight) {
      return a.deptPriorityWeight - b.deptPriorityWeight;
    }
    // Secondary sort: Ascending workload score (equity & fatigue prevention)
    return a.workload - b.workload;
  });

  // Step 5: Assign rank badges (#1 Top Recommendation, #2, etc.)
  return candidatePool.map((item, index) => ({
    rank: index + 1,
    isTopRecommendation: index === 0,
    staff: item.staff,
    workload: item.workload,
    isSameDepartment: item.isSameDepartment,
    reasoningPoints: item.reasoningPoints
  }));
}

/**
 * CONFIRM REPLACEMENT ACTION
 * 
 * Executed when the supervisor confirms their chosen candidate.
 * 1. Updates shift in Firestore with the new assigned staff member
 * 2. Increments workload score of the replacement
 * 3. Logs an audit entry in the 'reassignmentLogs' Firestore collection
 * 4. Simulates dispatch of instant shift notification (SMS / Hospital pager)
 * 
 * @param {Object} shift - The shift being reassigned
 * @param {Object} chosenCandidate - The selected replacement staff
 * @param {string} supervisorEmail - Supervisor who approved the reassignment
 * @returns {Promise<Object>} Reassignment outcome summary
 */
export async function confirmShiftReplacement(shift, chosenCandidate, supervisorEmail = 'supervisor@wardops.hospital') {
  try {
    const previousStaffId = shift.assignedStaffId || 'unassigned';
    const newStaff = chosenCandidate.staff;

    // 1. Update Shift document
    shift.assignedStaffId = newStaff.id;
    shift.assignedStaffName = newStaff.name;
    shift.status = 'scheduled';

    try {
      const shiftDocRef = doc(db, 'shifts', shift.id);
      await updateDoc(shiftDocRef, {
        assignedStaffId: newStaff.id,
        assignedStaffName: newStaff.name,
        status: 'scheduled',
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('Firestore update warning (continuing with state):', err);
    }

    // 2. Increment workload score of the replacement clinician
    await adjustWorkloadScore(newStaff.id, 1);

    // 3. Write Reassignment Audit Log in Firestore
    try {
      const logsCol = collection(db, 'reassignmentLogs');
      await addDoc(logsCol, {
        shiftId: shift.id,
        shiftDate: shift.date,
        shiftType: shift.shiftType,
        department: shift.department,
        previousStaffId: previousStaffId,
        newStaffId: newStaff.id,
        newStaffName: newStaff.name,
        recommendationRank: chosenCandidate.rank,
        reasonSummary: chosenCandidate.reasoningPoints.join(' • '),
        supervisorEmail: supervisorEmail,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.warn('Could not write audit log to Firestore:', err);
    }

    // 4. Return dispatch summary for simulated notification toast
    return {
      success: true,
      newStaffName: newStaff.name,
      phoneNumber: newStaff.phoneNumber || '+1 (555) 234-5678',
      department: shift.department,
      shiftType: shift.shiftType,
      rank: chosenCandidate.rank
    };
  } catch (error) {
    console.error('Failed to confirm shift replacement:', error);
    throw error;
  }
}
