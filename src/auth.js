/**
 * ============================================================================
 * WardOps - Healthcare Shift & Staffing Operations System
 * File: src/auth.js
 * Description: Manages user authentication and role-based access control (RBAC)
 * ============================================================================
 * 
 * Roles Supported:
 * - "supervisor": Full management access (CRUD staff, modify rosters, trigger replacement engine, approve leaves)
 * - "staff": Read-only roster view, submits leave requests, views own workload and assigned shifts
 */

import { auth, signInAnonymously } from './firebase-config.js';

// Application Auth State
let currentUser = {
  uid: 'demo-supervisor-01',
  displayName: 'Jordan Miller',
  initials: 'JM',
  title: 'Shift Supervisor',
  email: 'jordan.miller@wardops.hospital',
  role: 'supervisor', // 'supervisor' or 'staff'
  staffId: null
};

// Listeners that get notified whenever auth state or role changes
const authChangeListeners = [];

/**
 * Registers a callback to be notified when user or role changes
 * @param {Function} callback 
 */
export function onAuthUpdated(callback) {
  authChangeListeners.push(callback);
  callback(currentUser);
}

/**
 * Notifies all registered listeners of an auth state change
 */
function notifyAuthChange() {
  authChangeListeners.forEach(listener => {
    try {
      listener(currentUser);
    } catch (error) {
      console.error('Error in auth listener:', error);
    }
  });
}

/**
 * Returns the currently active user profile and role
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Checks if current user has supervisor privileges
 */
export function isSupervisor() {
  return currentUser && currentUser.role === 'supervisor';
}

/**
 * Switches between predefined defense demo roles with 1 click.
 * Extremely helpful for university project examiners to test both supervisor and staff perspectives.
 * 
 * @param {'supervisor' | 'staff'} role 
 * @param {Object} [customStaffInfo] Optional staff member info if switching to specific staff
 */
export function switchDemoRole(role, customStaffInfo = null) {
  if (role === 'supervisor') {
    currentUser = {
      uid: 'demo-supervisor-01',
      displayName: 'Jordan Miller',
      initials: 'JM',
      title: 'Shift Supervisor',
      email: 'jordan.miller@wardops.hospital',
      role: 'supervisor',
      staffId: null
    };
  } else {
    currentUser = {
      uid: customStaffInfo ? customStaffInfo.id : 'demo-staff-elena',
      displayName: customStaffInfo ? customStaffInfo.name : 'Elena Cruz, RN',
      initials: 'EC',
      title: 'Staff Nurse',
      email: customStaffInfo ? customStaffInfo.email : 'elena.cruz@wardops.hospital',
      role: 'staff',
      staffId: customStaffInfo ? customStaffInfo.id : 'staff-elena'
    };
  }

  localStorage.setItem('wardops_user', JSON.stringify(currentUser));
  notifyAuthChange();
}

/**
 * Initializes Authentication on application load.
 * Restores previous session if stored in localStorage, or signs in anonymously with Firebase.
 */
export async function initializeAuth() {
  // Check localStorage for saved session
  const saved = localStorage.getItem('wardops_user');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && (parsed.role === 'supervisor' || parsed.role === 'staff')) {
        currentUser = parsed;
      }
    } catch (e) {
      console.warn('Could not parse saved user session, using default supervisor');
    }
  }

  // Also ensure client has an active Firebase Auth anonymous session
  try {
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
  } catch (error) {
    console.warn('Firebase anonymous auth warning (offline or demo mode):', error.message);
  }

  notifyAuthChange();
}

// Make accessible on window for convenience
if (typeof window !== 'undefined') {
  window.WardOpsAuth = {
    getCurrentUser,
    isSupervisor,
    switchDemoRole
  };
}
