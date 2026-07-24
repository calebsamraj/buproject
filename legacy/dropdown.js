/**
 * ============================================================
 * dropdown.js — Reusable Multi-Select Dropdown UI Control
 * ============================================================
 */

export const dropdownState = {
  "job-ic": { options: [], selected: new Set(), triggerId: "ms-job-ic-trigger", panelId: "ms-job-ic-panel", textId: "ms-job-ic-text", clearId: "ms-job-ic-clear", searchId: "ms-job-ic-search", selectAllId: "ms-job-ic-selectall", optionsId: "ms-job-ic-options" },
  "job-vertical": { options: [], selected: new Set(), triggerId: "ms-job-vertical-trigger", panelId: "ms-job-vertical-panel", textId: "ms-job-vertical-text", clearId: "ms-job-vertical-clear", searchId: "ms-job-vertical-search", selectAllId: "ms-job-vertical-selectall", optionsId: "ms-job-vertical-options" },
  "user-ic": { options: [], selected: new Set(), triggerId: "ms-user-ic-trigger", panelId: "ms-user-ic-panel", textId: "ms-user-ic-text", clearId: "ms-user-ic-clear", searchId: "ms-user-ic-search", selectAllId: "ms-user-ic-selectall", optionsId: "ms-user-ic-options" },
  "filetype-ic": { options: [], selected: new Set(), triggerId: "ms-filetype-ic-trigger", panelId: "ms-filetype-ic-panel", textId: "ms-filetype-ic-text", clearId: "ms-filetype-ic-clear", searchId: "ms-filetype-ic-search", selectAllId: "ms-filetype-ic-selectall", optionsId: "ms-filetype-ic-options" },
  "vertical-ic": { options: [], selected: new Set(), triggerId: "ms-vertical-ic-trigger", panelId: "ms-vertical-ic-panel", textId: "ms-vertical-ic-text", clearId: "ms-vertical-ic-clear", searchId: "ms-vertical-ic-search", selectAllId: "ms-vertical-ic-selectall", optionsId: "ms-vertical-ic-options" }
};

/**
 * Initializes dropdown states and registers UI event handlers.
 * @param {object} db - The mock database object.
 */
export function setupDropdowns(db) {
  // Feed choices from the database
  dropdownState["job-ic"].options = db.ics;
  dropdownState["job-vertical"].options = db.verticals;
  dropdownState["user-ic"].options = db.ics;
  dropdownState["filetype-ic"].options = db.ics;
  dropdownState["vertical-ic"].options = db.ics;

  // Bind dropdown action handlers
  Object.keys(dropdownState).forEach((key) => {
    const ds = dropdownState[key];
    const trigger = document.getElementById(ds.triggerId);
    
    // Skip setup if the dropdown element is not present on the current page
    if (!trigger) return;

    const search = document.getElementById(ds.searchId);
    const selectAll = document.getElementById(ds.selectAllId);
    const clear = document.getElementById(ds.clearId);

    // Initial render
    renderDropdownOptions(key);

    // Toggle panel open/close
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const parent = trigger.closest(".multiselect");
      const isOpen = parent.classList.contains("open");
      closeAllDropdowns();
      if (!isOpen) {
        parent.classList.add("open");
        setTimeout(() => search && search.focus(), 50);
      }
    });

    // Reset button inside trigger
    clear.addEventListener("click", (e) => {
      e.stopPropagation();
      ds.selected.clear();
      renderDropdownOptions(key);
      updateDropdownTrigger(key);
    });

    // Keyboard and text input filtering
    search.addEventListener("input", (e) => {
      renderDropdownOptions(key, e.target.value);
    });

    // Select-all checkbox
    selectAll.addEventListener("change", (e) => {
      const term = search.value.trim().toLowerCase();
      const filtered = term ? ds.options.filter(o => o.toLowerCase().includes(term)) : ds.options;
      
      if (e.target.checked) {
        filtered.forEach(o => ds.selected.add(o));
      } else {
        filtered.forEach(o => ds.selected.delete(o));
      }
      renderDropdownOptions(key, search.value);
      updateDropdownTrigger(key);
    });
  });

  // Global dismiss click handlers
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".multiselect")) {
      closeAllDropdowns();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllDropdowns();
  });
}

/**
 * Closes all open multi-select panels.
 */
export function closeAllDropdowns() {
  document.querySelectorAll(".multiselect.open").forEach(el => el.classList.remove("open"));
}

/**
 * Returns the selected options as an array.
 * @param {string} key - The dropdown key mapping.
 * @returns {string[]}
 */
export function getDropdownSelected(key) {
  return Array.from(dropdownState[key].selected);
}

/**
 * Clears the selected values for a specific dropdown and updates its UI.
 * @param {string} key - The dropdown key mapping.
 */
export function clearDropdownSelection(key) {
  const ds = dropdownState[key];
  if (!ds) return;
  ds.selected.clear();
  const searchInput = document.getElementById(ds.searchId);
  if (searchInput) searchInput.value = "";
  renderDropdownOptions(key);
  updateDropdownTrigger(key);
}

/**
 * Refreshes dropdown choices dynamically (e.g. after inserting a new Vertical).
 * @param {string} key - The dropdown key.
 * @param {string[]} newOptions - The updated choices array.
 */
export function refreshDropdownOptions(key, newOptions) {
  const ds = dropdownState[key];
  if (!ds) return;
  ds.options = newOptions;
  renderDropdownOptions(key);
  updateDropdownTrigger(key);
}

// --- Internal render helpers ---

function renderDropdownOptions(key, filterText = "") {
  const ds = dropdownState[key];
  const optionsContainer = document.getElementById(ds.optionsId);
  const term = filterText.trim().toLowerCase();
  const filtered = term ? ds.options.filter(o => o.toLowerCase().includes(term)) : ds.options;

  if (filtered.length === 0) {
    optionsContainer.innerHTML = `<div class="ms-empty">No matches</div>`;
    syncSelectAll(key);
    return;
  }

  optionsContainer.innerHTML = filtered.map(opt => {
    const checked = ds.selected.has(opt) ? "checked" : "";
    const safeAttr = opt.replace(/"/g, "&quot;");
    return `
      <label class="ms-option">
        <input type="checkbox" data-value="${safeAttr}" ${checked}>
        <span>${opt}</span>
      </label>
    `;
  }).join("");

  optionsContainer.querySelectorAll("input").forEach(cb => {
    cb.addEventListener("change", (e) => {
      const val = e.target.dataset.value;
      if (e.target.checked) {
        ds.selected.add(val);
      } else {
        ds.selected.delete(val);
      }
      syncSelectAll(key);
      updateDropdownTrigger(key);
    });
  });

  syncSelectAll(key);
}

function syncSelectAll(key) {
  const ds = dropdownState[key];
  const selectAll = document.getElementById(ds.selectAllId);
  const search = document.getElementById(ds.searchId);
  const term = search.value.trim().toLowerCase();
  const filtered = term ? ds.options.filter(o => o.toLowerCase().includes(term)) : ds.options;

  const total = filtered.length;
  const selInFiltered = filtered.filter(o => ds.selected.has(o)).length;

  selectAll.checked = total > 0 && selInFiltered === total;
  selectAll.indeterminate = selInFiltered > 0 && selInFiltered < total;
}

function updateDropdownTrigger(key) {
  const ds = dropdownState[key];
  const text = document.getElementById(ds.textId);
  const clear = document.getElementById(ds.clearId);
  const box = document.getElementById(ds.triggerId).closest(".multiselect");

  if (ds.selected.size === 0) {
    text.textContent = `Select ${key.split("-")[1].toUpperCase()}...`;
    clear.classList.remove("visible");
    box.classList.remove("has-selection");
  } else if (ds.selected.size === 1) {
    text.textContent = Array.from(ds.selected)[0];
    clear.classList.add("visible");
    box.classList.add("has-selection");
  } else {
    text.textContent = `${ds.selected.size} Selected`;
    clear.classList.add("visible");
    box.classList.add("has-selection");
  }
}
