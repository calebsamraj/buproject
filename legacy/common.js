/**
 * ============================================================
 * common.js — Common UI Components & Utilities
 * ============================================================
 */

// Helper: Sleep utility to mock API latency
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Renders a success or error toast notification on the screen.
 * @param {string} message - The message text to display.
 * @param {'success'|'error'} type - The nature of the alert.
 */
export function showToast(message, type = "success") {
  const container = document.getElementById("admin-toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `admin-toast admin-toast-${type}`;

  const icon = type === "success" ? "✓" : "⚠";
  toast.innerHTML = `
    <span class="admin-toast-icon">${icon}</span>
    <span class="admin-toast-content">${message}</span>
  `;

  container.appendChild(toast);

  // Trigger Slide & Scale Entrance animation
  setTimeout(() => toast.classList.add("visible"), 50);

  // Dismiss toast after 4 seconds
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Shows the full-screen loading spinner and disables buttons.
 */
export function showLoader() {
  const loader = document.getElementById("admin-loader");
  if (loader) {
    loader.classList.add("visible");
    loader.setAttribute("aria-hidden", "false");
  }
  // Disable form interactions
  document.querySelectorAll("button").forEach(btn => btn.disabled = true);
}

/**
 * Hides the full-screen loading spinner and re-enables buttons.
 */
export function hideLoader() {
  const loader = document.getElementById("admin-loader");
  if (loader) {
    loader.classList.remove("visible");
    loader.setAttribute("aria-hidden", "true");
  }
  // Re-enable form interactions
  document.querySelectorAll("button").forEach(btn => btn.disabled = false);
}
