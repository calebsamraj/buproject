/**
 * ============================================================
 * ic-admin.js — Logic Module for Job Insert in IC Admin Page
 * ============================================================
 */

import { showToast, showLoader, hideLoader, sleep } from "./common.js";
import { loadDatabase, getDatabase, upsertJobRecord } from "./api.js";
import { setupDropdowns, getDropdownSelected, clearDropdownSelection } from "./dropdown.js";
import { validateJob } from "./validation.js";

/**
 * Submits the Job insert form records (handles upsert).
 */
async function submitJob() {
  const jobCode = parseInt(document.getElementById("job-code").value.trim());
  const jobName = document.getElementById("job-name").value.trim();
  const ics = getDropdownSelected("job-ic");
  const verticals = getDropdownSelected("job-vertical");

  if (!validateJob({ ic: ics, vertical: verticals, jobCode, jobName })) return;

  try {
    showLoader();
    await sleep(800);
    const action = await upsertJobRecord({ ic: ics, vertical: verticals, jobCode, jobName });
    hideLoader();
    showToast(`Job ${jobCode} - "${jobName}" saved (${action}) successfully.`);
    clearJob();
  } catch (error) {
    hideLoader();
    showToast(error.message, "error");
  }
}

/**
 * Resets inputs and dropdown choices.
 */
function clearJob() {
  document.getElementById("form-job").reset();
  clearDropdownSelection("job-ic");
  clearDropdownSelection("job-vertical");
}

/**
 * Sets up horizontal menu click selection listeners.
 */
function initializeMenuToggle() {
  const menuButtons = document.querySelectorAll(".admin-menu-card");
  const formPanels = document.querySelectorAll(".form-card-panel");

  menuButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const targetPanel = document.getElementById(targetId);

      if (btn.classList.contains("active")) {
        return;
      }

      // Close all panels
      formPanels.forEach(p => p.classList.remove("visible"));
      menuButtons.forEach(b => b.classList.remove("active"));

      // Open clicked panel
      btn.classList.add("active");
      targetPanel.classList.add("visible");
    });
  });
}

/**
 * Initializes settings options and event listeners.
 */
async function init() {
  showLoader();
  
  // Load mock database configurations
  const db = await loadDatabase();
  
  // Setup standard dropdown selectors
  setupDropdowns(db);

  // Bind actions click triggers
  document.getElementById("btn-job-submit").addEventListener("click", submitJob);
  document.getElementById("btn-job-clear").addEventListener("click", clearJob);

  // Initialize selection menu toggles
  initializeMenuToggle();

  // Bind Export JSON button
  const btnExport = document.getElementById("btn-export-json");
  if (btnExport) {
    btnExport.addEventListener("click", () => {
      try {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(getDatabase(), null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "admin_data.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast("Downloaded admin_data.json successfully!");
      } catch (err) {
        showToast("Failed to export JSON file.", "error");
      }
    });
  }

  // Submit on Enter keypress
  const form = document.getElementById("form-job");
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT") {
      e.preventDefault();
      submitJob();
    }
  });

  hideLoader();
}

window.addEventListener("DOMContentLoaded", init);
