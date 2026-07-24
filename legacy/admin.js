/**
 * ============================================================
 * admin.js — Page Orchestrator & Entry Point (ES Module)
 * ============================================================
 */

import { showToast, showLoader, hideLoader, sleep } from "./common.js";
import { 
  loadDatabase, 
  getDatabase, 
  upsertJobRecord, 
  upsertUserRecord, 
  upsertFileTypeRecord, 
  upsertVerticalRecord 
} from "./api.js";
import { 
  setupDropdowns, 
  getDropdownSelected, 
  clearDropdownSelection, 
  refreshDropdownOptions,
  closeAllDropdowns 
} from "./dropdown.js";
import { 
  validateJob, 
  validateUser, 
  validateFileType, 
  validateVertical 
} from "./validation.js";

// CARD 1: JOB
async function submitJob() {
  const jobCode = parseInt(document.getElementById("job-code").value.trim());
  const jobName = document.getElementById("job-name").value.trim();
  const ics = getDropdownSelected("job-ic");
  const verticals = getDropdownSelected("job-vertical");

  if (!validateJob({ ic: ics, vertical: verticals, jobCode, jobName })) return;

  try {
    showLoader();
    await sleep(800); // Mock network latency
    const action = await upsertJobRecord({ ic: ics, vertical: verticals, jobCode, jobName });
    hideLoader();
    showToast(`Job ${jobCode} - "${jobName}" saved (${action}) successfully.`);
    clearJob();
  } catch (error) {
    hideLoader();
    showToast(error.message, "error");
  }
}

function clearJob() {
  document.getElementById("form-job").reset();
  clearDropdownSelection("job-ic");
  clearDropdownSelection("job-vertical");
}

// CARD 2: USER
async function submitUser() {
  const email = document.getElementById("user-email").value.trim().toLowerCase();
  const ics = getDropdownSelected("user-ic");

  if (!validateUser({ ic: ics, email })) return;

  try {
    showLoader();
    await sleep(800);
    const action = await upsertUserRecord({ ic: ics, email });
    hideLoader();
    showToast(`User ${email} saved (${action}) successfully.`);
    clearUser();
  } catch (error) {
    hideLoader();
    showToast(error.message, "error");
  }
}

function clearUser() {
  document.getElementById("form-user").reset();
  clearDropdownSelection("user-ic");
}

// CARD 3: FILE TYPE
async function submitFileType() {
  const fileType = document.getElementById("file-type").value.trim();
  const ics = getDropdownSelected("filetype-ic");

  if (!validateFileType({ ic: ics, fileType })) return;

  try {
    showLoader();
    await sleep(800);
    const action = await upsertFileTypeRecord({ ic: ics, fileType });
    hideLoader();
    showToast(`File Type "${fileType}" saved (${action}) successfully.`);
    clearFileType();
  } catch (error) {
    hideLoader();
    showToast(error.message, "error");
  }
}

function clearFileType() {
  document.getElementById("form-filetype").reset();
  clearDropdownSelection("filetype-ic");
}

// CARD 4: VERTICAL
async function submitVertical() {
  const verticalName = document.getElementById("vertical-name").value.trim();
  const ics = getDropdownSelected("vertical-ic");

  if (!validateVertical({ ic: ics, verticalName })) return;

  try {
    showLoader();
    await sleep(800);
    const action = await upsertVerticalRecord({ ic: ics, verticalName });
    hideLoader();
    showToast(`Vertical "${verticalName}" saved (${action}) successfully.`);
    clearVertical();
  } catch (error) {
    hideLoader();
    showToast(error.message, "error");
  }
}

function clearVertical() {
  document.getElementById("form-vertical").reset();
  clearDropdownSelection("vertical-ic");
}

// --- INITIALIZATION ---

function initializeEvents() {
  // Card 1
  document.getElementById("btn-job-submit").addEventListener("click", submitJob);
  document.getElementById("btn-job-clear").addEventListener("click", clearJob);

  // Card 2
  document.getElementById("btn-user-submit").addEventListener("click", submitUser);
  document.getElementById("btn-user-clear").addEventListener("click", clearUser);

  // Card 3
  document.getElementById("btn-filetype-submit").addEventListener("click", submitFileType);
  document.getElementById("btn-filetype-clear").addEventListener("click", clearFileType);

  // Card 4
  document.getElementById("btn-vertical-submit").addEventListener("click", submitVertical);
  document.getElementById("btn-vertical-clear").addEventListener("click", clearVertical);

  // Keyboard navigation support: submits when pressing Enter in text inputs
  const forms = ["form-job", "form-user", "form-filetype", "form-vertical"];
  forms.forEach(formId => {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.tagName === "INPUT") {
        e.preventDefault();
        const primaryBtn = form.querySelector(".btn-primary");
        if (primaryBtn) primaryBtn.click();
      }
    });
  });

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
}

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
      
      // Auto close dropdown panels
      closeAllDropdowns();
    });
  });
}

async function initializeAdmin() {
  showLoader();
  
  // Load configuration options & logs
  const db = await loadDatabase();

  // Initialize dropdown DOM panels
  setupDropdowns(db);
  
  // Listeners setup
  initializeEvents();

  // Initialize Form Tab Grid Toggles
  initializeMenuToggle();

  hideLoader();
}

// Launch application on DOM ready
window.addEventListener("DOMContentLoaded", () => {
  initializeAdmin();
});
