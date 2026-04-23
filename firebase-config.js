// ============================================================
// ProjeXWise ERP — Firebase Configuration
// ============================================================
// INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com
// 2. Create a new project named "ProjeXWise"
// 3. Enable Authentication (Email/Password)
// 4. Enable Firestore Database
// 5. Enable Storage
// 6. Register a Web App and copy your config below
// 7. Deploy Firestore Security Rules (see bottom of this file)
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCobzaJhuN-jqPSm2xvMDUhplXGd9Tqa3s",
  authDomain: "projexwise-erp.firebaseapp.com",
  projectId: "projexwise-erp",
  storageBucket: "projexwise-erp.firebasestorage.app",
  messagingSenderId: "933242430125",
  appId: "1:933242430125:web:de1672e9290dc1026f9c24",
  measurementId: "G-5RRN41RDSD"
};

// ============================================================
// FIRESTORE SECURITY RULES
// Copy these to Firebase Console → Firestore → Rules
// ============================================================
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdmin() {
      return isAuthenticated() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    function hasPermission(perm) {
      return isAdmin() ||
        (isAuthenticated() && getUserData().permissions[perm] == true);
    }

    // Users collection
    match /users/{userId} {
      allow read: if isAuthenticated() && (request.auth.uid == userId || isAdmin());
      allow create: if isAdmin();
      allow update: if isAdmin() || request.auth.uid == userId;
      allow delete: if isAdmin();
    }

    // Settings
    match /settings/{doc} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    // Partners
    match /partners/{doc} {
      allow read: if hasPermission('partners_view');
      allow create: if hasPermission('partners_add');
      allow update: if hasPermission('partners_edit');
      allow delete: if hasPermission('partners_delete');
    }

    // Income
    match /income/{doc} {
      allow read: if hasPermission('income_view');
      allow create: if hasPermission('income_add');
      allow update: if hasPermission('income_edit');
      allow delete: if hasPermission('income_delete');
    }

    // Expenses
    match /expenses/{doc} {
      allow read: if hasPermission('expenses_view');
      allow create: if hasPermission('expenses_add');
      allow update: if hasPermission('expenses_edit');
      allow delete: if hasPermission('expenses_delete');
    }

    // Projects
    match /projects/{doc} {
      allow read: if isAuthenticated();
      allow create: if hasPermission('projects_create');
      allow update: if hasPermission('projects_edit');
      allow delete: if hasPermission('projects_delete');
    }

    // Custody
    match /custody/{doc} {
      allow read: if isAuthenticated();
      allow create: if hasPermission('custody_create');
      allow update: if hasPermission('custody_settle') || hasPermission('custody_edit');
      allow delete: if isAdmin();
    }

    // Audit log
    match /audit/{doc} {
      allow read: if isAdmin();
      allow create: if isAuthenticated();
      allow update, delete: if false;
    }
  }
}
*/

// ============================================================
// FIREBASE STORAGE RULES
// Copy to Firebase Console → Storage → Rules
// ============================================================
/*
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.resource.size < 10 * 1024 * 1024;
    }
  }
}
*/

// ============================================================
// FIRST TIME SETUP
// After deploying, open browser console and run:
// FirebaseSetup.createFirstAdmin('admin@yourcompany.com', 'Admin@1234', 'System Administrator')
// ============================================================
