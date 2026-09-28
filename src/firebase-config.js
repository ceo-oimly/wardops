/**
 * ============================================================================
 * WardOps - Healthcare Shift & Staffing Operations System
 * File: src/firebase-config.js
 * Description: Initializes Firebase Client SDK (Firestore and Firebase Auth)
 * ============================================================================
 * 
 * Final-Year University IT Project Note:
 * This file handles connecting the web browser client directly to Google Firebase.
 * We import only the official modular client SDK methods (no backend Node.js code required).
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  signInAnonymously
} from 'firebase/auth';

/**
 * Firebase project credentials loaded from the auto-provisioned configuration.
 * Note: Firebase client keys identify the project in Google Cloud; security is
 * enforced via Firestore Security Rules (firestore.rules).
 */
const firebaseConfig = {
  projectId: "gen-lang-client-0672935859",
  appId: "1:20440338243:web:6b64d8e14ed7d85b13e9f6",
  apiKey: "AIzaSyAtWfff_kUmMSEq0mDfbLz75MYgqaemCEo",
  authDomain: "gen-lang-client-0672935859.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-6451c3ec-188f-4d70-9db0-c8df699ca25f",
  storageBucket: "gen-lang-client-0672935859.firebasestorage.app",
  messagingSenderId: "20440338243"
};

// 1. Initialize the Firebase Application instance
const app = initializeApp(firebaseConfig);

// 2. Initialize Cloud Firestore with the designated database ID
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// 3. Initialize Firebase Authentication
const auth = getAuth(app);

// Export instances and Firestore helpers for use across all modules
export {
  app,
  db,
  auth,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInAnonymously
};
