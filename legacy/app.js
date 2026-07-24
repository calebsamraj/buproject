// ============================================================
// E-Doc Approval System Dashboard
// Talks to Supabase via RPC functions defined in supabase_setup.sql
//
// FILTERS: IC / FileTypeName / BU Name / Job Details / Approver are
// custom multi-select dropdowns. Every existing RPC function keeps its
// original single-value signature (p_ic text, p_filetype text, ...).
// To support multi-select without touching the RPC functions, the
// dashboard calls each RPC once per combination of selected values
// (cartesian product across the 5 filters) and merges the results on
// the client (summing counts, weighting averages).
//
// BUG FIX (dropdown sometimes showing no values):
// loadFilterOptions() used to fire all 5 RPC calls in parallel and,
// if ANY single one errored/timed-out, callRpc() silently swallowed
// the error and returned []. That filter's dropdown then stayed
// permanently blank until a full page reload. Fixed by:
//   1. callRpcWithRetry() — retries a failed RPC call twice with a
//      short backoff before giving up.
//   2. Each filter's load/loading/failed state is tracked, so a failed
//      load shows a "Failed to load — tap to retry" message instead of
//      silently rendering nothing.
//   3. Self-heal on open — if a dropdown is opened and still has zero
//      options (never loaded, or a previous load failed), it
//      automatically re-fetches right then.
// ============================================================

console.log("=== APP.JS LOADED ===");

const sb =
    window.supabaseClient ||
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );

window.supabaseClient = sb;

console.log("Connected successfully");

// ---------- Filter definitions ----------
const FILTER_DEFS = [
  { key: "ic",       param: "p_ic",       label: "IC" },
  { key: "filetype", param: "p_filetype", label: "FileTypeName" },
  { key: "bu",       param: "p_bu",       label: "BU Name" },
  { key: "job",      param: "p_job",      label: "Job Details" },
  { key: "approver", param: "p_approver", label: "Approver" },
];

// RPC + row-field used to populate each dropdown's option list
const FILTER_RPC = {
  ic:       { fn: "get_ic_list",       field: "ic" },
  filetype: { fn: "get_filetype_list", field: "file_type_name" },
  bu:       { fn: "get_bu_list",       field: "bu_name" },
  job:      { fn: "get_job_list",      field: "job_details" },
  approver: { fn: "get_approver_list", field: "approver_name" },
};

const MAX_COMBOS = 60; // safety cap on cartesian product size
const RPC_RETRIES = 2; // extra attempts for filter-option loads

// ---------- Global state ----------
const state = {
  ic: [],
  filetype: [],
  bu: [],
  job: [],
  approver: [],
  status: "All", // set by clicking a KPI card
};

// multi-select UI state: options list + selected Set + load state per filter
const msState = {};
FILTER_DEFS.forEach((f) => {
  msState[f.key] = { options: [], selected: new Set(), loading: false, failed: false, loaded: false };
});

let buChart, ageingChart, gaugeChart;
let refreshTimer = null;

// data backing the click-to-detail boxes (kept in the same order as what's plotted)
let buChartMerged = [];      // [{ bu_name, cnt }]
let ageingLabels = [];       // ["0-5 Days", ...]
let ageingValues = [];       // [count, ...]

// ---------- Helpers ----------
function fmtInt(n) {
  return Number(n || 0).toLocaleString("en-IN");
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function currentTableSearch(inputId) {
  const el = document.getElementById(inputId);
  return el ? el.value : "";
}

// Standard RPC call used by charts/KPIs — best-effort, returns [] on error.
async function callRpc(fn, params) {
  const { data, error } = await sb.rpc(fn, params);
  if (error) {
    console.error(`RPC ${fn} failed:`, error.message, params);
    return [];
  }
  return data || [];
}

// Resilient RPC call used for filter-dropdown option lists — retries
// on failure instead of silently giving up, so a transient network
// hiccup doesn't leave a dropdown permanently blank.
async function callRpcWithRetry(fn, params, retries = RPC_RETRIES) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { data, error } = await sb.rpc(fn, params);
    if (!error) return { ok: true, data: data || [] };
    lastErr = error;
    console.error(`RPC ${fn} failed (attempt ${attempt + 1}/${retries + 1}):`, error.message, params);
    if (attempt < retries) await sleep(350 * (attempt + 1));
  }
  return { ok: false, data: [], error: lastErr };
}

// Build the cartesian product of selected values across all 5 filters.
// A filter with no selection contributes ["All"] (unfiltered), matching
// the original single-select "All" sentinel used by the RPC functions.
function cartesianCombos() {
  const dims = FILTER_DEFS.map((f) => {
    const sel = Array.from(msState[f.key].selected);
    return sel.length ? sel : ["All"];
  });

  let combos = [[]];
  for (const dim of dims) {
    const next = [];
    for (const combo of combos) {
      for (const val of dim) {
        next.push([...combo, val]);
        if (next.length >= MAX_COMBOS) break;
      }
      if (next.length >= MAX_COMBOS) break;
    }
    combos = next;
    if (combos.length >= MAX_COMBOS) break;
  }
  if (combos.length > MAX_COMBOS) {
    console.warn(`Filter combination count exceeds ${MAX_COMBOS}; truncating.`);
    combos = combos.slice(0, MAX_COMBOS);
  }

  return combos.map((vals) => {
    const p = {};
    FILTER_DEFS.forEach((f, i) => { p[f.param] = vals[i]; });
    return p;
  });
}

function combosWithStatus() {
  return cartesianCombos().map((p) => ({ ...p, p_status: state.status }));
}

// ---------- Merge helpers (client-side aggregation across combinations) ----------
function mergeCountRows(rowsArrays, keyField, cntField = "cnt") {
  const map = new Map();
  rowsArrays.flat().forEach((r) => {
    const k = r[keyField];
    if (k === null || k === undefined) return;
    map.set(k, (map.get(k) || 0) + Number(r[cntField] || 0));
  });
  return Array.from(map.entries()).map(([k, v]) => ({ [keyField]: k, [cntField]: v }));
}

// ---------- Multi-select dropdown component ----------
function currentSearchTerm(key) {
  const el = document.getElementById(`ms-${key}-search`);
  return el ? el.value : "";
}

function setMsOptions(key, values) {
  msState[key].options = Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
  renderMsOptions(key, currentSearchTerm(key));
  updateMsTrigger(key);
}

// Fetch (or re-fetch) one filter's dropdown options. Safe to call
// repeatedly — used both at startup and as the self-heal retry.
async function fetchFilterList(key) {
  const st = msState[key];
  if (st.loading) return;
  const conf = FILTER_RPC[key];

  st.loading = true;
  st.failed = false;
  renderMsOptions(key, currentSearchTerm(key));

  const { ok, data } = await callRpcWithRetry(conf.fn, {});

  st.loading = false;
  if (ok) {
    st.loaded = true;
    st.failed = false;
    setMsOptions(key, data.map((r) => r[conf.field]));
  } else {
    st.failed = true;
    renderMsOptions(key, currentSearchTerm(key));
  }
}

function renderMsOptions(key, filterText) {
  const st = msState[key];
  const wrap = document.getElementById(`ms-${key}-options`);
  const term = (filterText || "").trim().toLowerCase();
  const filtered = term ? st.options.filter((o) => o.toLowerCase().includes(term)) : st.options;

  if (st.loading) {
    wrap.innerHTML = `<div class="ms-empty ms-loading">Loading options&hellip;</div>`;
    syncSelectAllCheckbox(key);
    return;
  }

  if (st.failed && st.options.length === 0) {
    wrap.innerHTML = `<div class="ms-empty ms-retry" id="ms-${key}-retry">Failed to load &mdash; tap to retry</div>`;
    const retryEl = document.getElementById(`ms-${key}-retry`);
    if (retryEl) retryEl.addEventListener("click", (e) => { e.stopPropagation(); fetchFilterList(key); });
    syncSelectAllCheckbox(key);
    return;
  }

  if (!filtered.length) {
    wrap.innerHTML = `<div class="ms-empty">No matches</div>`;
    syncSelectAllCheckbox(key);
    return;
  }

  wrap.innerHTML = filtered
    .map((opt) => {
      const checked = st.selected.has(opt) ? "checked" : "";
      const safeAttr = String(opt).replace(/"/g, "&quot;");
      const safeText = escapeHtml(opt);
      return `<label class="ms-option"><input type="checkbox" data-value="${safeAttr}" ${checked}><span>${safeText}</span></label>`;
    })
    .join("");

  wrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const val = e.target.dataset.value;
      if (e.target.checked) st.selected.add(val);
      else st.selected.delete(val);
      state[key] = Array.from(st.selected);
      syncSelectAllCheckbox(key);
      updateMsTrigger(key);
      renderActiveChips();
      scheduleRefresh();
    });
  });

  syncSelectAllCheckbox(key);
}

function syncSelectAllCheckbox(key) {
  const allCb = document.getElementById(`ms-${key}-selectall`);
  if (!allCb) return;
  const st = msState[key];
  const total = st.options.length;
  const sel = st.selected.size;
  allCb.checked = total > 0 && sel === total;
  allCb.indeterminate = sel > 0 && sel < total;
}

function updateMsTrigger(key) {
  const st = msState[key];
  const textEl = document.getElementById(`ms-${key}-text`);
  const clearEl = document.getElementById(`ms-${key}-clear`);
  const box = document.getElementById(`ms-${key}`);

  if (st.selected.size === 0) {
    textEl.textContent = "All";
    clearEl.classList.remove("visible");
    box.classList.remove("has-selection");
  } else if (st.selected.size === 1) {
    textEl.textContent = Array.from(st.selected)[0];
    clearEl.classList.add("visible");
    box.classList.add("has-selection");
  } else {
    textEl.textContent = `${st.selected.size} Selected`;
    clearEl.classList.add("visible");
    box.classList.add("has-selection");
  }
}

function closeAllMs() {
  document.querySelectorAll(".multiselect.open").forEach((el) => el.classList.remove("open"));
}

function clearOneFilter(key, { immediate = true } = {}) {
  msState[key].selected.clear();
  state[key] = [];
  renderMsOptions(key, "");
  updateMsTrigger(key);
  renderActiveChips();
  if (immediate) refreshAll();
  else scheduleRefresh();
}

function renderActiveChips() {
  const wrap = document.getElementById("active-filters");
  const chips = [];

  FILTER_DEFS.forEach((f) => {
    const sel = Array.from(msState[f.key].selected);
    if (!sel.length) return;
    const label = sel.length === 1 ? sel[0] : `${sel.length} selected`;
    chips.push(
      `<span class="chip" data-key="${f.key}"><b>${f.label}:</b> ${escapeHtml(label)}<span class="chip-x" data-clear="${f.key}">&#10005;</span></span>`
    );
  });

  if (state.status !== "All") {
    chips.push(
      `<span class="chip" data-key="status"><b>Status:</b> ${state.status}<span class="chip-x" data-clear="status">&#10005;</span></span>`
    );
  }

  wrap.innerHTML = chips.join("");
  wrap.querySelectorAll(".chip-x").forEach((x) => {
    x.addEventListener("click", () => {
      const key = x.dataset.clear;
      if (key === "status") {
        state.status = "All";
        renderActiveChips();
        refreshAll();
      } else {
        clearOneFilter(key);
      }
    });
  });
}

function initMultiSelects() {
  FILTER_DEFS.forEach((f) => {
    const key = f.key;

    document.getElementById(`ms-${key}-trigger`).addEventListener("click", (e) => {
      e.stopPropagation();
      const box = document.getElementById(`ms-${key}`);
      const isOpen = box.classList.contains("open");
      closeAllMs();
      if (!isOpen) {
        box.classList.add("open");
        const searchInput = document.getElementById(`ms-${key}-search`);
        setTimeout(() => searchInput && searchInput.focus(), 50);

        // Self-heal: dropdown bug fix — if this filter never loaded any
        // options (or its last load failed), retry right now instead of
        // showing an empty panel.
        if (!msState[key].loading && msState[key].options.length === 0) {
          fetchFilterList(key);
        }
      }
    });

    document.getElementById(`ms-${key}-clear`).addEventListener("click", (e) => {
      e.stopPropagation();
      clearOneFilter(key);
    });

    document.getElementById(`ms-${key}-search`).addEventListener("input", (e) => {
      renderMsOptions(key, e.target.value);
    });

    document.getElementById(`ms-${key}-selectall`).addEventListener("change", (e) => {
      const st = msState[key];
      if (e.target.checked) st.options.forEach((o) => st.selected.add(o));
      else st.selected.clear();
      state[key] = Array.from(st.selected);
      renderMsOptions(key, document.getElementById(`ms-${key}-search`).value);
      updateMsTrigger(key);
      renderActiveChips();
      scheduleRefresh();
    });

    // stop clicks inside the panel from closing it via the document listener
    document.getElementById(`ms-${key}-panel`).addEventListener("click", (e) => e.stopPropagation());
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".multiselect")) closeAllMs();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllMs();
  });
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshAll(), 180);
}

// ---------- Filter dropdown option loading ----------
async function loadFilterOptions() {
  await Promise.all(FILTER_DEFS.map((f) => fetchFilterList(f.key)));
}

// ---------- KPI cards ----------
async function loadKPIs() {
  const combos = cartesianCombos(); // status intentionally excluded, matches original baseParams(false)
  const results = await Promise.all(combos.map((p) => callRpc("get_status_counts", p)));
  const merged = mergeCountRows(results, "status");

  const counts = { Pending: 0, Stopped: 0, Rejected: 0, Approved: 0, Paused: 0 };
  let total = 0;
  merged.forEach((r) => {
    counts[r.status] = Number(r.cnt);
    total += Number(r.cnt);
  });

  document.getElementById("kpi-total").textContent = fmtInt(total);
  document.getElementById("kpi-pending").textContent = fmtInt(counts.Pending);
  document.getElementById("kpi-stopped").textContent = fmtInt(counts.Stopped);
  document.getElementById("kpi-rejected").textContent = fmtInt(counts.Rejected);
  document.getElementById("kpi-approved").textContent = fmtInt(counts.Approved);
  document.getElementById("kpi-paused").textContent = fmtInt(counts.Paused);

  document.querySelectorAll(".kpi-card").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.status === state.status);
  });
}

// ---------- Gauge (Average Days) + Ageing chart ----------
// Loaded together because the ageing-bucket row counts double as the
// per-combination weight needed to correctly merge average days.
async function loadGaugeAndAgeing() {
  const combos = combosWithStatus();

  const ageingResults = await Promise.all(combos.map((p) => callRpc("get_ageing_counts", p)));
  const ageingMergedRaw = mergeCountRows(ageingResults, "request_ageing_days");
  renderAgeingChart(ageingMergedRaw);

  const comboTotals = ageingResults.map((rows) => rows.reduce((s, r) => s + Number(r.cnt || 0), 0));

  const avgResults = await Promise.all(combos.map((p) => callRpc("get_avg_days", p)));
  let wsum = 0, wcount = 0, minAll = Infinity, maxAll = -Infinity;
  avgResults.forEach((rows, i) => {
    const r = rows[0] || { avg_days: 0, min_days: 0, max_days: 0 };
    const w = comboTotals[i];
    wsum += Number(r.avg_days || 0) * w;
    wcount += w;
    if (w > 0) {
      minAll = Math.min(minAll, Number(r.min_days || 0));
      maxAll = Math.max(maxAll, Number(r.max_days || 0));
    }
  });

  const avg = wcount ? wsum / wcount : 0;
  const min = isFinite(minAll) ? minAll : 0;
  const max = isFinite(maxAll) ? maxAll : 1;
  renderGauge(avg, min, max);
}

function renderGauge(avg, min, max) {
  document.getElementById("gauge-value").textContent = avg.toFixed(2);
  document.getElementById("gauge-min").textContent = min.toFixed(2);
  document.getElementById("gauge-max").textContent = max.toFixed(2);

  const pct = Math.min(1, Math.max(0, (avg - min) / (max - min || 1)));
  const remainder = 1 - pct;

  const ctx = document.getElementById("gaugeChart");
  const cfg = {
    type: "doughnut",
    data: {
      datasets: [
        {
          data: [pct, remainder],
          backgroundColor: ["#e8752c", "#2e6b32"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      circumference: 180,
      rotation: 270,
      cutout: "72%",
      plugins: { legend: { display: false }, tooltip: { enabled: false }, datalabels: { display: false } },
      animation: false,
    },
  };
  if (gaugeChart) {
    gaugeChart.data.datasets[0].data = [pct, remainder];
    gaugeChart.update();
  } else {
    gaugeChart = new Chart(ctx, cfg);
  }
}

// ---------- Chart <-> table linking ----------
// Each chart gets a full searchable table underneath it (built from the
// same merged data that drives the bars). Clicking a bar highlights and
// scrolls to its row in the table; clicking a row does the same in
// reverse-highlight, so the graph and the table always stay in sync.

function renderBuTable(searchTerm = "") {
  const body = document.getElementById("tbl-bu");
  const term = searchTerm.trim().toLowerCase();
  const rows = term ? buChartMerged.filter((r) => String(r.bu_name).toLowerCase().includes(term)) : buChartMerged;

  if (!rows.length) {
    body.innerHTML = `<div class="chart-table-empty">No matches</div>`;
  } else {
    body.innerHTML = rows
      .map(
        (r) =>
          `<div class="chart-table-row two-col" data-name="${String(r.bu_name).replace(/"/g, "&quot;")}"><span>${escapeHtml(r.bu_name)}</span><span>${fmtInt(r.cnt)}</span></div>`
      )
      .join("");
    body.querySelectorAll(".chart-table-row").forEach((row) => {
      row.addEventListener("click", () => selectBu(row.dataset.name));
    });
  }

  const total = buChartMerged.reduce((s, r) => s + Number(r.cnt || 0), 0);
  document.getElementById("tbl-bu-total").innerHTML = `<span>Total</span><span>${fmtInt(total)}</span>`;
}

function selectBu(buName) {
  const row = buChartMerged.find((r) => r.bu_name === buName);
  if (!row) return;

  document.querySelectorAll("#tbl-bu .chart-table-row").forEach((r) => {
    r.classList.toggle("row-highlight", r.dataset.name === buName);
  });
  const target = document.querySelector(`#tbl-bu .chart-table-row[data-name="${buName.replace(/"/g, '\\"')}"]`);
  if (target) target.scrollIntoView({ block: "nearest", behavior: "smooth" });

  const banner = document.getElementById("bu-selected-banner");
  banner.classList.add("show");
  banner.innerHTML = `<span>${escapeHtml(row.bu_name)} &mdash; ${fmtInt(row.cnt)} requests</span><span class="banner-clear" id="bu-clear-selected">&times;</span>`;
  document.getElementById("bu-clear-selected").addEventListener("click", clearBuSelection);
}

function clearBuSelection() {
  const banner = document.getElementById("bu-selected-banner");
  banner.classList.remove("show");
  banner.innerHTML = "";
  document.querySelectorAll("#tbl-bu .chart-table-row").forEach((r) => r.classList.remove("row-highlight"));
}

function renderAgeingTable(searchTerm = "") {
  const body = document.getElementById("tbl-ageing");
  const term = searchTerm.trim().toLowerCase();
  const items = ageingLabels.map((label, i) => ({ label, cnt: ageingValues[i] }));
  const rows = term ? items.filter((r) => r.label.toLowerCase().includes(term)) : items;

  if (!rows.length) {
    body.innerHTML = `<div class="chart-table-empty">No matches</div>`;
  } else {
    body.innerHTML = rows
      .map(
        (r) =>
          `<div class="chart-table-row two-col" data-name="${r.label.replace(/"/g, "&quot;")}"><span>${escapeHtml(r.label)}</span><span>${fmtInt(r.cnt)}</span></div>`
      )
      .join("");
    body.querySelectorAll(".chart-table-row").forEach((row) => {
      row.addEventListener("click", () => selectAgeing(row.dataset.name));
    });
  }

  const total = ageingValues.reduce((s, v) => s + Number(v || 0), 0);
  document.getElementById("tbl-ageing-total").innerHTML = `<span>Total</span><span>${fmtInt(total)}</span>`;
}

function selectAgeing(label) {
  const idx = ageingLabels.indexOf(label);
  if (idx === -1) return;
  const count = ageingValues[idx];

  document.querySelectorAll("#tbl-ageing .chart-table-row").forEach((r) => {
    r.classList.toggle("row-highlight", r.dataset.name === label);
  });
  const target = document.querySelector(`#tbl-ageing .chart-table-row[data-name="${label.replace(/"/g, '\\"')}"]`);
  if (target) target.scrollIntoView({ block: "nearest", behavior: "smooth" });

  const banner = document.getElementById("ageing-selected-banner");
  banner.classList.add("show");
  banner.innerHTML = `<span>${escapeHtml(label)} &mdash; ${fmtInt(count)} requests</span><span class="banner-clear" id="ageing-clear-selected">&times;</span>`;
  document.getElementById("ageing-clear-selected").addEventListener("click", clearAgeingSelection);
}

function clearAgeingSelection() {
  const banner = document.getElementById("ageing-selected-banner");
  banner.classList.remove("show");
  banner.innerHTML = "";
  document.querySelectorAll("#tbl-ageing .chart-table-row").forEach((r) => r.classList.remove("row-highlight"));
}

function attachChartTableSearch() {
  document.getElementById("search-bu").addEventListener("input", (e) => renderBuTable(e.target.value));
  document.getElementById("search-ageing").addEventListener("input", (e) => renderAgeingTable(e.target.value));
}

function renderAgeingChart(mergedRawRows) {
  const groups = {
    "0-5 Days": 0,
    "6-10 Days": 0,
    "11-20 Days": 0,
    "21-30 Days": 0,
    "31-45 Days": 0,
    "46-60 Days": 0,
    "60+ Days": 0,
  };

  mergedRawRows.forEach((r) => {
    const day = Number(r.request_ageing_days);
    const count = Number(r.cnt);

    if (day <= 5) groups["0-5 Days"] += count;
    else if (day <= 10) groups["6-10 Days"] += count;
    else if (day <= 20) groups["11-20 Days"] += count;
    else if (day <= 30) groups["21-30 Days"] += count;
    else if (day <= 45) groups["31-45 Days"] += count;
    else if (day <= 60) groups["46-60 Days"] += count;
    else groups["60+ Days"] += count;
  });

  ageingLabels = Object.keys(groups);
  ageingValues = Object.values(groups);
  renderAgeingTable(currentTableSearch("search-ageing"));

  const ctx = document.getElementById("ageingChart");
  if (ageingChart) ageingChart.destroy();

  ageingChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ageingLabels,
      datasets: [
        {
          data: ageingValues,
          borderRadius: 15,
          barThickness: 28,
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx } = chart;
            const idx = context.dataIndex;
            const g = ctx.createLinearGradient(0, 0, 0, chart.chartArea ? chart.chartArea.bottom : 300);
            const base = ["#1D4ED8", "#60A5FA"][idx % 2];
            g.addColorStop(0, "#93C5FD");
            g.addColorStop(0.35, base);
            g.addColorStop(1, "#1E3A8A");
            return g;
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        selectAgeing(ageingLabels[idx]);
      },
      onHover: (evt, elements) => {
        evt.native.target.style.cursor = elements.length ? "pointer" : "default";
      },
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: "end",
          align: "right",
          color: "#111827",
          font: { weight: "bold", size: 13 },
        },
      },
      scales: {
        x: { beginAtZero: true, grid: { color: "#e5e7eb" } },
        y: { grid: { display: false } },
      },
    },
    plugins: [ChartDataLabels],
  });
}

// ---------- BU Wise Total Count chart ----------
async function loadBUChart() {
  const combos = combosWithStatus();
  const results = await Promise.all(combos.map((p) => callRpc("get_bu_counts", p)));
  buChartMerged = mergeCountRows(results, "bu_name").sort((a, b) => b.cnt - a.cnt);
  renderBuTable(currentTableSearch("search-bu"));

  const labels = buChartMerged.map((r) => r.bu_name);
  const data = buChartMerged.map((r) => Number(r.cnt));

  const ctx = document.getElementById("buChart");
  const cfg = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data,
          barThickness: 14,
          maxBarThickness: 18,
          borderRadius: 12,
          backgroundColor: (context) => {
            const chart = context.chart;
            const { ctx } = chart;
            const idx = context.dataIndex;
            const g = ctx.createLinearGradient(0, 0, 0, chart.chartArea ? chart.chartArea.bottom : 300);
            const palette = ["#93C5FD", "#60A5FA", "#2563EB", "#1E40AF"];
            const top = palette[(idx + 1) % palette.length];
            const mid = palette[(idx + 2) % palette.length];
            const bottom = palette[(idx + 3) % palette.length];
            g.addColorStop(0, top);
            g.addColorStop(0.45, mid);
            g.addColorStop(1, bottom);
            return g;
          },
          borderColor: "rgba(15, 23, 42, 0.10)",
          hoverBackgroundColor: "#3b82f6",
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        const row = buChartMerged[idx];
        if (row) selectBu(row.bu_name);
      },
      onHover: (evt, elements) => {
        evt.native.target.style.cursor = elements.length ? "pointer" : "default";
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Count: ${Number(ctx.parsed.x).toLocaleString("en-IN")}`,
          },
        },
        datalabels: {
          anchor: "end",
          align: "end",
          color: "#0f172a",
          font: { size: 11, weight: "900" },
          formatter: (v) => v.toLocaleString("en-IN"),
          offset: 6,
        },
      },
      scales: {
        x: {
          title: { display: true, text: "Count of UniqueId", font: { weight: "900" } },
          grid: { color: "rgba(15,23,42,0.06)" },
          ticks: { font: { size: 10, weight: "800" }, color: "rgba(15,23,42,0.65)" },
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 10, weight: "800" }, color: "rgba(15,23,42,0.70)" },
        },
      },
    },
    plugins: [ChartDataLabels],
  };

  if (buChart) buChart.destroy();
  buChart = new Chart(ctx, cfg);
}

// ---------- Export buttons ----------
function attachExportHandlers() {
  const btnPdf = document.getElementById("btn-export-pdf");
  const btnCsv = document.getElementById("btn-export-csv");
  const btnJson = document.getElementById("btn-export-json");
  if (!btnPdf || !btnCsv || !btnJson) return;

  const doExport = (fmt) => {
    const buRows = buChartMerged.map((r) => ({ bu_name: r.bu_name, cnt: r.cnt }));
    const ageingRows = ageingLabels.map((label, i) => ({ ageing_bucket: label, cnt: ageingValues[i] }));

    const filters = {
      ic: state.ic,
      filetype: state.filetype,
      bu: state.bu,
      job: state.job,
      approver: state.approver,
      status: state.status,
    };

    const filenameBase = `edoc_export_${formatTimestamp(new Date())}`;

    if (fmt === "csv") {
      exportChartsToCsv(filenameBase, buRows, ageingRows);
      return;
    }
    if (fmt === "json") {
      exportChartsToJson(filenameBase, buRows, ageingRows, filters);
      return;
    }
    if (fmt === "pdf") {
      const title = "E-Doc Dashboard Export";
      const sections = [
        ["BU Wise Total Count", buRows],
        ["Request Ageing Days", ageingRows],
      ];
      exportPdfFromText(`${filenameBase}.pdf`, title, sections);
      return;
    }
  };

  btnPdf.addEventListener("click", () => doExport("pdf"));
  btnCsv.addEventListener("click", () => doExport("csv"));
  btnJson.addEventListener("click", () => doExport("json"));
}

// ---------- Orchestration ----------
async function refreshAll() {
  renderActiveChips();
  clearBuSelection();
  clearAgeingSelection();
  loadKPIs();
  loadGaugeAndAgeing();
  loadBUChart();
}

function clearAllFilters() {
  closeAllMs();
  FILTER_DEFS.forEach((f) => {
    msState[f.key].selected.clear();
    state[f.key] = [];
    renderMsOptions(f.key, "");
    const search = document.getElementById(`ms-${f.key}-search`);
    if (search) search.value = "";
    updateMsTrigger(f.key);
  });
  state.status = "All";
  renderActiveChips();
  refreshAll();
}

function attachFilterHandlers() {
  initMultiSelects();

  document.getElementById("btn-clear-all").addEventListener("click", clearAllFilters);

  document.querySelectorAll(".kpi-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      const clicked = btn.dataset.status;
      state.status = state.status === clicked ? "All" : clicked;
      refreshAll();
    });
  });
}

(async function init() {
  const loader = document.getElementById("admin-loader");
  if (loader) {
    loader.classList.add("visible");
  }

  attachFilterHandlers();
  attachChartTableSearch();
  await loadFilterOptions();
  await refreshAll();
  attachExportHandlers();

  if (loader) {
    // Brief delay to ensure a smooth animated exit
    setTimeout(() => {
      loader.classList.remove("visible");
    }, 450);
  }
})();