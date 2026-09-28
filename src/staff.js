/**
 * ============================================================================
 * WardOps - Healthcare Shift & Staffing Operations System
 * File: src/staff.js
 * Description: Module 1 - Staff Data Access Layer (Firestore CRUD & Cache)
 * ============================================================================
 * 
 * Final-Year University IT Project Defense Documentation:
 * 
 * 1. Purpose:
 *    The Staff Module data layer manages all healthcare personnel registered in the facility.
 *    It maintains staff credentials, clinical roles, department affiliations,
 *    and critically, the `currentWorkloadScore` which drives the automated
 *    Replacement Engine in Module 5.
 * 
 * 2. Firestore Collection: 'staff'
 *    Schema Fields:
 *    - name (String): Full name (e.g., "Nurse Sarah Jenkins, BSN")
 *    - role (String): Clinical designation ("Doctor", "Nurse", "Lab Tech", "Pharmacist", "Radiologist")
 *    - department (String): Operational unit ("Emergency", "Intensive Care Unit (ICU)", "Pediatrics", "Surgery", "General Ward")
 *    - qualifications (Array of Strings): Clinical certifications (e.g., ["BLS", "ACLS", "Pediatric Care"])
 *    - employmentStatus (String): Contract type ("Full-time", "Part-time", "On-call")
 *    - currentWorkloadScore (Number): Cumulative recent shift count; lower values mean lower fatigue
 *    - email (String): Work email
 *    - phoneNumber (String): Contact phone for notification simulation
 *    - createdAt (Timestamp / String): Registration date
 *    - updatedAt (Timestamp / String): Last profile edit date
 */

import { 
  db, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  serverTimestamp 
} from './firebase-config.js';

// Local cache of staff members for instantaneous UI rendering and search filtering
let cachedStaffList = [];

// Available clinical roles in the hospital
export const CLINICAL_ROLES = [
  'Doctor',
  'Nurse',
  'Lab Tech',
  'Pharmacist',
  'Radiologist'
];

// Hospital operational departments
export const HOSPITAL_DEPARTMENTS = [
  'Emergency',
  'Intensive Care Unit (ICU)',
  'Pediatrics',
  'Surgery',
  'General Ward'
];

// Common clinical qualifications and certifications
export const COMMON_QUALIFICATIONS = [
  'BLS (Basic Life Support)',
  'ACLS (Advanced Cardiac Life Support)',
  'PALS (Pediatric Advanced Life Support)',
  'Triage Certified',
  'Critical Care Nursing (CCRN)',
  'Trauma Nursing (TNCC)',
  'Phlebotomy',
  'Surgical First Assist'
];

// Sample seed data to populate Firestore for live demonstration
const INITIAL_SAMPLE_STAFF = [
  {
    name: 'Dr. Arthur Vance',
    role: 'Doctor',
    department: 'Emergency',
    qualifications: ['ACLS (Advanced Cardiac Life Support)', 'Trauma Nursing (TNCC)', 'Triage Certified'],
    employmentStatus: 'Full-time',
    currentWorkloadScore: 2,
    email: 'a.vance@wardops.hospital',
    phoneNumber: '+1 (555) 234-5678'
  },
  {
    name: 'Nurse Elena Cruz',
    role: 'Nurse',
    department: 'Intensive Care Unit (ICU)',
    qualifications: ['ACLS (Advanced Cardiac Life Support)', 'Critical Care Nursing (CCRN)', 'BLS (Basic Life Support)'],
    employmentStatus: 'Full-time',
    currentWorkloadScore: 1,
    email: 'elena.cruz@wardops.hospital',
    phoneNumber: '+1 (555) 345-6789'
  },
  {
    name: 'Nurse Marcus Thorne',
    role: 'Nurse',
    department: 'Emergency',
    qualifications: ['BLS (Basic Life Support)', 'Triage Certified', 'Trauma Nursing (TNCC)'],
    employmentStatus: 'Full-time',
    currentWorkloadScore: 4,
    email: 'm.thorne@wardops.hospital',
    phoneNumber: '+1 (555) 456-7890'
  },
  {
    name: 'Nurse Jessica Liu',
    role: 'Nurse',
    department: 'Emergency',
    qualifications: ['BLS (Basic Life Support)', 'Triage Certified'],
    employmentStatus: 'Part-time',
    currentWorkloadScore: 1,
    email: 'j.liu@wardops.hospital',
    phoneNumber: '+1 (555) 567-8901'
  },
  {
    name: 'Dr. Fatima Al-Mansoor',
    role: 'Doctor',
    department: 'Intensive Care Unit (ICU)',
    qualifications: ['ACLS (Advanced Cardiac Life Support)', 'Critical Care Nursing (CCRN)'],
    employmentStatus: 'Full-time',
    currentWorkloadScore: 3,
    email: 'f.almansoor@wardops.hospital',
    phoneNumber: '+1 (555) 678-9012'
  },
  {
    name: 'David O\'Connor',
    role: 'Lab Tech',
    department: 'Emergency',
    qualifications: ['Phlebotomy', 'BLS (Basic Life Support)'],
    employmentStatus: 'Full-time',
    currentWorkloadScore: 2,
    email: 'd.oconnor@wardops.hospital',
    phoneNumber: '+1 (555) 789-0123'
  },
  {
    name: 'Nurse Brenda Okafor',
    role: 'Nurse',
    department: 'Pediatrics',
    qualifications: ['PALS (Pediatric Advanced Life Support)', 'BLS (Basic Life Support)'],
    employmentStatus: 'Full-time',
    currentWorkloadScore: 2,
    email: 'b.okafor@wardops.hospital',
    phoneNumber: '+1 (555) 890-1234'
  },
  {
    name: 'Dr. Gregory Houseman',
    role: 'Doctor',
    department: 'Surgery',
    qualifications: ['Surgical First Assist', 'ACLS (Advanced Cardiac Life Support)'],
    employmentStatus: 'Full-time',
    currentWorkloadScore: 5,
    email: 'g.houseman@wardops.hospital',
    phoneNumber: '+1 (555) 901-2345'
  },
  {
    name: 'Nurse Samuel Ramos',
    role: 'Nurse',
    department: 'General Ward',
    qualifications: ['BLS (Basic Life Support)'],
    employmentStatus: 'On-call',
    currentWorkloadScore: 0,
    email: 's.ramos@wardops.hospital',
    phoneNumber: '+1 (555) 112-2334'
  }
];

/**
 * ============================================================================
 * FIRESTORE CRUD OPERATIONS
 * ============================================================================
 */

/**
 * Retrieves all staff members from Firestore.
 * Explanatory note: Reads the entire 'staff' collection and caches results locally.
 * 
 * @returns {Promise<Array>} Array of staff objects with document IDs
 */
export async function getAllStaffMembers() {
  try {
    const staffCollectionRef = collection(db, 'staff');
    const staffQuery = query(staffCollectionRef, orderBy('name', 'asc'));
    const snapshot = await getDocs(staffQuery);

    const staffList = [];
    snapshot.forEach(docSnap => {
      staffList.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });

    cachedStaffList = staffList;
    return staffList;
  } catch (error) {
    console.error('Firestore Error: Failed to fetch staff members:', error);
    return cachedStaffList;
  }
}

/**
 * Retrieves a single staff member by document ID.
 * 
 * @param {string} staffId - Firestore document ID
 * @returns {Promise<Object|null>}
 */
export async function getStaffMemberById(staffId) {
  try {
    const docRef = doc(db, 'staff', staffId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error(`Firestore Error: Failed to get staff with ID ${staffId}:`, error);
    return null;
  }
}

/**
 * Creates a new staff member document in Firestore.
 * 
 * @param {Object} staffData - Details of the new staff member
 * @returns {Promise<string>} The new Firestore document ID
 */
export async function createStaffMember(staffData) {
  try {
    if (!staffData.name || !staffData.role || !staffData.department) {
      throw new Error('Staff name, role, and department are strictly required.');
    }

    const payload = {
      name: staffData.name.trim(),
      role: staffData.role,
      department: staffData.department,
      qualifications: Array.isArray(staffData.qualifications) ? staffData.qualifications : [],
      employmentStatus: staffData.employmentStatus || 'Full-time',
      currentWorkloadScore: Number(staffData.currentWorkloadScore) || 0,
      email: staffData.email ? staffData.email.trim() : '',
      phoneNumber: staffData.phoneNumber ? staffData.phoneNumber.trim() : '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const staffCollectionRef = collection(db, 'staff');
    const docRef = await addDoc(staffCollectionRef, payload);
    
    // Refresh local cache
    await getAllStaffMembers();
    return docRef.id;
  } catch (error) {
    console.error('Firestore Error: Failed to create staff member:', error);
    throw error;
  }
}

/**
 * Updates an existing staff member in Firestore.
 * 
 * @param {string} staffId - Firestore document ID to update
 * @param {Object} updatedFields - Fields to update
 * @returns {Promise<void>}
 */
export async function updateStaffMember(staffId, updatedFields) {
  try {
    const docRef = doc(db, 'staff', staffId);
    const payload = {
      ...updatedFields,
      updatedAt: serverTimestamp()
    };

    await updateDoc(docRef, payload);
    await getAllStaffMembers();
  } catch (error) {
    console.error(`Firestore Error: Failed to update staff with ID ${staffId}:`, error);
    throw error;
  }
}

/**
 * Deletes a staff member from Firestore.
 * 
 * @param {string} staffId - Firestore document ID
 * @returns {Promise<void>}
 */
export async function deleteStaffMember(staffId) {
  try {
    const docRef = doc(db, 'staff', staffId);
    await deleteDoc(docRef);
    await getAllStaffMembers();
  } catch (error) {
    console.error(`Firestore Error: Failed to delete staff with ID ${staffId}:`, error);
    throw error;
  }
}

/**
 * Adjusts the current workload score of a staff member.
 * For example: When a staff member completes a shift, workload increments by 1.
 * 
 * @param {string} staffId 
 * @param {number} delta - Positive or negative integer adjustment
 */
export async function adjustWorkloadScore(staffId, delta) {
  try {
    const staff = await getStaffMemberById(staffId);
    if (!staff) return;

    const currentScore = Number(staff.currentWorkloadScore) || 0;
    const newScore = Math.max(0, currentScore + delta);

    await updateStaffMember(staffId, { currentWorkloadScore: newScore });
  } catch (error) {
    console.error('Failed to adjust workload score:', error);
  }
}

/**
 * Seeds initial hospital staff into Firestore if the collection is empty.
 * This ensures the student has immediate, realistic data for their live defense.
 */
export async function seedInitialStaffData() {
  try {
    const currentList = await getAllStaffMembers();
    if (currentList.length > 0) {
      const confirmSeed = window.confirm(
        `Staff collection already contains ${currentList.length} members. Do you want to add ${INITIAL_SAMPLE_STAFF.length} additional sample records?`
      );
      if (!confirmSeed) return false;
    }

    const staffCollectionRef = collection(db, 'staff');
    for (const member of INITIAL_SAMPLE_STAFF) {
      await addDoc(staffCollectionRef, {
        ...member,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    await getAllStaffMembers();
    return true;
  } catch (error) {
    console.error('Firestore Error: Failed to seed sample staff:', error);
    throw error;
  }
}

/**
 * Returns current cached staff list
 */
export function getCachedStaff() {
  return cachedStaffList;
}
