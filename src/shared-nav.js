/**
 * ============================================================================
 * WardOps - Shared Mobile Navigation, Topbar Demo Mode & Common UI Behaviors
 * File: src/shared-nav.js
 * ============================================================================
 */

import { initializeAuth, onAuthUpdated, switchDemoRole, getCurrentUser, isSupervisor } from './auth.js';

// Defensive polyfill for window.fetch setter to support iframe proxies
(function() {
  try {
    var originalFetch = typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : null;
    var currentFetch = originalFetch;
    var fetchDescriptor = {
      get: function() {
        return currentFetch;
      },
      set: function(fn) {
        currentFetch = fn;
      },
      configurable: true,
      enumerable: true
    };
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'fetch', fetchDescriptor);
      if (typeof Window !== 'undefined' && Window.prototype) {
        try {
          Object.defineProperty(Window.prototype, 'fetch', fetchDescriptor);
        } catch (_) {}
      }
    }
  } catch (e) {
    // Ignore if already defined
  }
})();

document.addEventListener('DOMContentLoaded', async () => {
  initMobileNavigation();
  await setupDemoAuthTopbar();
});

/**
 * Sets up mobile drawer navigation
 */
export function initMobileNavigation() {
  const sidebar = document.querySelector('.app-sidebar');
  const topbar = document.querySelector('.app-topbar');

  if (!sidebar || !topbar) return;

  // 1. Create mobile hamburger toggle button if not already present
  let hamburgerBtn = document.querySelector('.btn-hamburger');
  if (!hamburgerBtn) {
    hamburgerBtn = document.createElement('button');
    hamburgerBtn.className = 'btn-hamburger';
    hamburgerBtn.setAttribute('aria-label', 'Toggle navigation menu');
    hamburgerBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    `;

    // Insert as first item in topbar
    topbar.insertBefore(hamburgerBtn, topbar.firstChild);
  }

  // 2. Create backdrop overlay
  let backdrop = document.querySelector('.sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }

  // 3. Open drawer
  const openSidebar = () => {
    sidebar.classList.add('mobile-open');
    backdrop.classList.add('active');
    document.body.classList.add('nav-open-lock');
  };

  // 4. Close drawer
  const closeSidebar = () => {
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('active');
    document.body.classList.remove('nav-open-lock');
  };

  hamburgerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sidebar.classList.contains('mobile-open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  backdrop.addEventListener('click', closeSidebar);

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSidebar();
      document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.style.display = 'none';
      });
    }
  });

  // Close sidebar on link click inside sidebar on mobile
  sidebar.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 900) {
        closeSidebar();
      }
    });
  });
}

/**
 * Injects the Demo Mode indicator and Role Switcher dropdown into the top bar
 * and synchronizes live UI permissions between Supervisor and Staff perspectives.
 */
export async function setupDemoAuthTopbar() {
  await initializeAuth();

  const topbarActions = document.querySelector('.topbar-actions');
  if (!topbarActions) return;

  // Check if already injected
  if (!document.getElementById('demo-mode-badge-el')) {
    // 1. Create Demo Mode Badge
    const badge = document.createElement('div');
    badge.id = 'demo-mode-badge-el';
    badge.className = 'demo-mode-badge';
    badge.title = 'WardOps Academic Defense Simulation Mode';
    badge.innerHTML = `
      <span class="demo-pulse-dot"></span>
      <span>Demo Mode &bull; <strong id="topbar-role-label">${isSupervisor() ? 'Supervisor' : 'Staff'}</strong></span>
    `;

    // 2. Create Role Switcher Dropdown
    const dropdownWrapper = document.createElement('div');
    dropdownWrapper.className = 'demo-role-select-box';
    dropdownWrapper.innerHTML = `
      <select id="select-demo-role" class="demo-role-select" title="Switch between Supervisor and Staff view to test RBAC">
        <option value="supervisor" ${isSupervisor() ? 'selected' : ''}>Role: Supervisor (Full Access)</option>
        <option value="staff" ${!isSupervisor() ? 'selected' : ''}>Role: Staff Nurse (Restricted)</option>
      </select>
    `;

    // Insert before notification bell and avatar
    const bellBtn = topbarActions.querySelector('.btn-icon-topbar');
    if (bellBtn) {
      topbarActions.insertBefore(badge, bellBtn);
      topbarActions.insertBefore(dropdownWrapper, bellBtn);
    } else {
      topbarActions.prepend(dropdownWrapper);
      topbarActions.prepend(badge);
    }

    // Attach change listener to dropdown
    const selectEl = dropdownWrapper.querySelector('#select-demo-role');
    selectEl.addEventListener('change', (e) => {
      switchDemoRole(e.target.value);
    });
  }

  // Listen for role updates to dynamically adjust UI across all pages
  onAuthUpdated(user => {
    const isSup = user.role === 'supervisor';

    // 1. Update Topbar Label & Select value
    const roleLabel = document.getElementById('topbar-role-label');
    const selectEl = document.getElementById('select-demo-role');
    if (roleLabel) roleLabel.innerText = isSup ? 'Supervisor' : 'Staff';
    if (selectEl) selectEl.value = user.role;

    // 2. Update Topbar Avatar & Sidebar Profile
    document.querySelectorAll('.avatar-initials').forEach(el => {
      el.innerText = user.initials || (isSup ? 'JM' : 'EC');
    });

    const sidebarUserName = document.querySelector('.sidebar-user .user-name');
    const sidebarUserRole = document.querySelector('.sidebar-user .user-role');
    if (sidebarUserName) sidebarUserName.innerText = user.displayName;
    if (sidebarUserRole) sidebarUserRole.innerText = user.title;

    // 3. Enforce Role Visibility / Editability across pages
    applyRolePermissionsToPage(isSup);
  });
}

/**
 * Adjusts visible buttons and actions depending on role
 */
function applyRolePermissionsToPage(isSupervisor) {
  const pageContainer = document.querySelector('.page-container');
  let banner = document.getElementById('demo-role-banner');

  if (!isSupervisor) {
    // Show role restriction notice in staff mode
    if (!banner && pageContainer) {
      banner = document.createElement('div');
      banner.id = 'demo-role-banner';
      banner.className = 'role-restricted-banner';
      banner.innerHTML = `
        <span style="font-size: 16px;">ℹ️</span>
        <div>
          <strong>Staff Nurse Perspective:</strong> Viewing clinical operations in Read-Only mode. Administrative actions (adding/deleting staff, assigning shifts, and approving leaves) require Supervisor credentials.
        </div>
      `;
      pageContainer.insertBefore(banner, pageContainer.firstChild);
    }

    // Staff screen: Hide Add / Seed staff buttons
    const addStaffBtn = document.getElementById('btn-open-add-staff');
    const seedStaffBtn = document.getElementById('btn-seed-demo-staff');
    if (addStaffBtn) addStaffBtn.style.display = 'none';
    if (seedStaffBtn) seedStaffBtn.style.display = 'none';

    // Staff screen: Disable table edit/delete action buttons
    document.querySelectorAll('.staff-row-actions').forEach(el => {
      el.style.opacity = '0.35';
      el.style.pointerEvents = 'none';
    });

    // Leave screen: Hide Approve / Reject buttons for non-supervisors
    document.querySelectorAll('.btn-leave-approve, .btn-leave-reject').forEach(el => {
      el.style.display = 'none';
    });
    const seedLeaveBtn = document.getElementById('btn-seed-leave');
    if (seedLeaveBtn) seedLeaveBtn.style.display = 'none';

    // Attendance screen: Disable Find Replacement button
    const replBtn = document.getElementById('btn-trigger-replacement');
    if (replBtn) {
      replBtn.style.opacity = '0.4';
      replBtn.title = 'Supervisor authorization required to confirm shift replacement';
    }
  } else {
    // Restore supervisor access
    if (banner && banner.parentNode) {
      banner.parentNode.removeChild(banner);
    }

    const addStaffBtn = document.getElementById('btn-open-add-staff');
    const seedStaffBtn = document.getElementById('btn-seed-demo-staff');
    if (addStaffBtn) addStaffBtn.style.display = 'inline-flex';
    if (seedStaffBtn) seedStaffBtn.style.display = 'inline-flex';

    document.querySelectorAll('.staff-row-actions').forEach(el => {
      el.style.opacity = '1';
      el.style.pointerEvents = 'auto';
    });

    document.querySelectorAll('.btn-leave-approve, .btn-leave-reject').forEach(el => {
      el.style.display = 'inline-flex';
    });
    const seedLeaveBtn = document.getElementById('btn-seed-leave');
    if (seedLeaveBtn) seedLeaveBtn.style.display = 'inline-flex';

    const replBtn = document.getElementById('btn-trigger-replacement');
    if (replBtn) {
      replBtn.style.opacity = '1';
      replBtn.title = '';
    }
  }
}
