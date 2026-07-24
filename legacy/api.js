/**
 * ============================================================
 * api.js — Local Mock Database & CRUD Data Layer
 * ============================================================
 */

const STATE_KEY = "admin_db";

let db = {
  ics: [],
  verticals: [],
  jobs: [],
  users: [],
  fileTypes: [],
  verticalsList: []
};

/**
 * Helper to fetch database options dynamically from Supabase if connected.
 * @returns {Promise<object|null>} List of ICs and Verticals, or null.
 */
async function fetchSupabaseOptions() {
  try {
    // Check if global credentials are set and Supabase client is loaded
    if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_ANON_KEY === "undefined" || !window.supabase) {
      return null;
    }

    const sb = window.supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!sb) return null;

    // Fetch lists from database RPCs in parallel
    const [icRes, buRes] = await Promise.all([
      sb.rpc("get_ic_list"),
      sb.rpc("get_bu_list")
    ]);

    const ics = (icRes.data || []).map(r => r.ic).filter(Boolean);
    const verticals = (buRes.data || []).map(r => r.bu_name).filter(Boolean);

    if (ics.length > 0 || verticals.length > 0) {
      return { ics, verticals };
    }
  } catch (error) {
    console.warn("Supabase option fetch failed, falling back to local:", error.message);
  }
  return null;
}

/**
 * Initializes the database by loading from localStorage or fetching admin_data.json.
 * @returns {Promise<object>} The loaded database state.
 */
export async function loadDatabase() {
  const localData = localStorage.getItem(STATE_KEY);
  if (localData) {
    db = JSON.parse(localData);
  } else {
    try {
      const response = await fetch("admin_data.json");
      if (response.ok) {
        db = await response.json();
      } else {
        throw new Error("HTTP response error");
      }
    } catch (error) {
      console.warn("Failed to load admin_data.json, using static defaults:", error.message);
      db = {
        ics: [
          "IC001", "IC002", "IC003", "IC004", "IC005", 
          "IC006", "IC007", "IC008", "IC009", "IC010", 
          "IC011", "IC012", "IC013", "IC014", "IC015", 
          "IC016", "IC017", "IC018", "IC019", "IC020", 
          "IC021", "IC022", "IC023", "IC024", "IC025"
        ],
        verticals: [
          "Civil", "Design", "Electrical", "Engineering", "Finance", 
          "HR", "Instrumentation", "IT", "Logistics", "Maintenance", 
          "Manufacturing", "Mechanical", "Operations", "Piping", "Planning", 
          "Procurement", "Production", "Projects", "Quality", "Safety"
        ],
        jobs: [],
        users: [],
        fileTypes: [],
        verticalsList: []
      };
    }
  }

  // Attempt to override choices list from Supabase
  const sbOptions = await fetchSupabaseOptions();
  if (sbOptions) {
    if (sbOptions.ics.length > 0) {
      db.ics = sbOptions.ics;
    }
    if (sbOptions.verticals.length > 0) {
      db.verticals = sbOptions.verticals;
    }
  }

  saveDatabase();
  return db;
}

/**
 * Helper to write database state back to admin_data.json via local Node server endpoint.
 * Runs asynchronously in the background.
 */
async function saveToLocalFile(data) {
  try {
    const response = await fetch("/api/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });
    if (response.ok) {
      console.log("Database auto-saved to admin_data.json on disk.");
    }
  } catch (err) {
    // Suppress warning log when running in raw standalone client mode without server.js
    console.debug("Local file write-back not active. Offline/standalone client mode.");
  }
}

/**
 * Persists the current database state to localStorage and attempts file write-back.
 */
export function saveDatabase() {
  localStorage.setItem(STATE_KEY, JSON.stringify(db));
  saveToLocalFile(db);
}

/**
 * Returns the current database object in memory.
 * @returns {object}
 */
export function getDatabase() {
  return db;
}

// --- CRUD OPERATIONS ---

// CARD 1: JOBS
export function insertJobRecord(job) {
  if (db.jobs.some(j => j.jobCode === job.jobCode)) {
    throw new Error("Job Code already exists. Use Update to modify.");
  }
  db.jobs.push(job);
  saveDatabase();
}

export async function updateJobRecord(job) {
  const idx = db.jobs.findIndex(j => j.jobCode === job.jobCode);
  if (idx === -1) {
    throw new Error(`Job Code ${job.jobCode} not found.`);
  }
  const oldJobName = db.jobs[idx].jobName;
  db.jobs[idx] = job;
  saveDatabase();

  // Sync update to Supabase BUdata table
  try {
    if (typeof SUPABASE_URL !== "undefined" && typeof SUPABASE_ANON_KEY !== "undefined" && window.supabase && typeof TABLE !== "undefined") {
      const sb = window.supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      if (sb) {
        const updateData = { job_details: job.jobName };
        if (job.ic && job.ic.length) updateData.ic = job.ic[0];
        if (job.vertical && job.vertical.length) updateData.bu_name = job.vertical[0];

        const { error } = await sb.from(TABLE).update(updateData).eq("job_details", oldJobName);
        if (error) console.warn("Supabase job update error:", error.message);
        else console.log(`Synced Job updates to Supabase.`);
      }
    }
  } catch (e) {
    console.warn("Failed to sync Job update to Supabase:", e.message);
  }
}

// CARD 2: USERS
export function insertUserRecord(user) {
  if (db.users.some(u => u.email === user.email)) {
    throw new Error("User Email already exists. Use Update to modify.");
  }
  db.users.push(user);
  saveDatabase();
}

// --- UPSERT WRAPPER ACTIONS ---

export async function upsertJobRecord(job) {
  if (db.jobs.some(j => j.jobCode === job.jobCode)) {
    await updateJobRecord(job);
    return "updated";
  } else {
    insertJobRecord(job);
    return "inserted";
  }
}

export async function upsertUserRecord(user) {
  if (db.users.some(u => u.email === user.email)) {
    await updateUserRecord(user);
    return "updated";
  } else {
    insertUserRecord(user);
    return "inserted";
  }
}

export async function upsertFileTypeRecord(fileTypeObj) {
  const matchKey = fileTypeObj.fileType.toLowerCase();
  if (db.fileTypes.some(f => f.fileType.toLowerCase() === matchKey)) {
    await updateFileTypeRecord(fileTypeObj);
    return "updated";
  } else {
    insertFileTypeRecord(fileTypeObj);
    return "inserted";
  }
}

export async function upsertVerticalRecord(verticalObj) {
  const matchKey = verticalObj.verticalName.toLowerCase();
  if (db.verticalsList.some(v => v.verticalName.toLowerCase() === matchKey)) {
    await updateVerticalRecord(verticalObj);
    return "updated";
  } else {
    insertVerticalRecord(verticalObj);
    return "inserted";
  }
}

export async function updateUserRecord(user) {
  const idx = db.users.findIndex(u => u.email === user.email);
  if (idx === -1) {
    throw new Error(`User with email ${user.email} not found.`);
  }
  db.users[idx] = user;
  saveDatabase();

  // Sync User IC update to Supabase
  try {
    if (typeof SUPABASE_URL !== "undefined" && typeof SUPABASE_ANON_KEY !== "undefined" && window.supabase && typeof TABLE !== "undefined") {
      const sb = window.supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      if (sb && user.ic && user.ic.length) {
        const { error } = await sb.from(TABLE).update({ ic: user.ic[0] }).eq("approver_name", user.email);
        if (error) console.warn("Supabase user update error:", error.message);
        else console.log(`Synced User updates to Supabase.`);
      }
    }
  } catch (e) {
    console.warn("Failed to sync User update to Supabase:", e.message);
  }
}

// CARD 3: FILE TYPES
export function insertFileTypeRecord(fileTypeObj) {
  if (db.fileTypes.some(f => f.fileType.toLowerCase() === fileTypeObj.fileType.toLowerCase())) {
    throw new Error("File Type already exists.");
  }
  db.fileTypes.push(fileTypeObj);
  saveDatabase();
}

export async function updateFileTypeRecord(fileTypeObj) {
  const idx = db.fileTypes.findIndex(f => f.fileType.toLowerCase() === fileTypeObj.fileType.toLowerCase());
  if (idx === -1) {
    throw new Error(`File Type "${fileTypeObj.fileType}" not found.`);
  }
  db.fileTypes[idx] = fileTypeObj;
  saveDatabase();

  // Sync File Type IC update to Supabase
  try {
    if (typeof SUPABASE_URL !== "undefined" && typeof SUPABASE_ANON_KEY !== "undefined" && window.supabase && typeof TABLE !== "undefined") {
      const sb = window.supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      if (sb && fileTypeObj.ic && fileTypeObj.ic.length) {
        const { error } = await sb.from(TABLE).update({ ic: fileTypeObj.ic[0] }).eq("file_type_name", fileTypeObj.fileType);
        if (error) console.warn("Supabase filetype update error:", error.message);
        else console.log(`Synced File Type updates to Supabase.`);
      }
    }
  } catch (e) {
    console.warn("Failed to sync File Type update to Supabase:", e.message);
  }
}

// CARD 4: VERTICALS
export function insertVerticalRecord(verticalObj) {
  if (db.verticalsList.some(v => v.verticalName.toLowerCase() === verticalObj.verticalName.toLowerCase())) {
    throw new Error("Vertical already exists.");
  }
  db.verticalsList.push(verticalObj);
  if (!db.verticals.includes(verticalObj.verticalName)) {
    db.verticals.push(verticalObj.verticalName);
  }
  saveDatabase();
}

export async function updateVerticalRecord(verticalObj) {
  const idx = db.verticalsList.findIndex(v => v.verticalName.toLowerCase() === verticalObj.verticalName.toLowerCase());
  if (idx === -1) {
    throw new Error(`Vertical "${verticalObj.verticalName}" not found.`);
  }
  db.verticalsList[idx] = verticalObj;
  saveDatabase();

  // Sync Vertical IC update to Supabase
  try {
    if (typeof SUPABASE_URL !== "undefined" && typeof SUPABASE_ANON_KEY !== "undefined" && window.supabase && typeof TABLE !== "undefined") {
      const sb = window.supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      if (sb && verticalObj.ic && verticalObj.ic.length) {
        const { error } = await sb.from(TABLE).update({ ic: verticalObj.ic[0] }).eq("bu_name", verticalObj.verticalName);
        if (error) console.warn("Supabase vertical update error:", error.message);
        else console.log(`Synced Vertical updates to Supabase.`);
      }
    }
  } catch (e) {
    console.warn("Failed to sync Vertical update to Supabase:", e.message);
  }
}
