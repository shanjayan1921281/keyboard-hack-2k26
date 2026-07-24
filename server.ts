/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { 
  CompetitionStatus, 
  CompetitionSettings, 
  Candidate, 
  ActivityLog, 
  KeyboardMapping, 
  DashboardStats,
  LeaderboardEntry 
} from "./src/types.js";
import { initializeApp } from "firebase/app";
import { 
  initializeFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  collection, 
  getDocs 
} from "firebase/firestore";

const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "db.json");

// Define custom session structure in memory
interface Session {
  token: string;
  userId: string; // 'admin' or candidate ID
  role: 'admin' | 'candidate';
  expiresAt: number;
}

// ----------------------------------------------------
// DATABASE INITIALIZATION & IN-MEMORY STATE
// ----------------------------------------------------
let adminsList = [
  {
    username: "admin",
    passwordHash: hashPassword("admin2026", "salt_admin"),
    salt: "salt_admin",
    name: "AI & ML Department Admin"
  }
];

let competitionSettings: CompetitionSettings = {
  durationMinutes: 45,
  status: CompetitionStatus.WAITING,
  startedAt: null,
  pausedAt: null,
  accumulatedElapsedMs: 0,
  level2Words: ["Machine", "Learning", "Artificial", "Neural", "Vision", "Python", "Tensor", "Algorithm", "Robot", "Model"],
  level3Letters: ["A", "E", "I", "O", "U", "K", "S", "T", "N", "X"]
};

let candidatesList: Candidate[] = [];
let activityLogs: ActivityLog[] = [];
let activeSessions: Map<string, Session> = new Map();

// Helper to hash password
function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
}

// Helper to generate keyboard mapping using a formula (deterministic Affine Cipher based on username + optional salt)
function generateKeyboardMapping(username: string = "default", salt: string = ""): KeyboardMapping {
  const lowerUser = (username + salt).trim().toLowerCase();
  
  // Simple deterministic hash of the username + salt
  let hash = 0;
  for (let i = 0; i < lowerUser.length; i++) {
    hash = lowerUser.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);

  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  const digits = "0123456789".split("");

  // Affine cipher coprime multipliers (coprime to 26 and 10 respectively)
  const coprimes26 = [3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];
  const coprimes10 = [3, 7, 9];

  // Pick deterministic multiplier and shift based on the hash
  const m = coprimes26[hash % coprimes26.length];
  const s = (hash % 25) + 1; // shift offset (1 to 25 to guarantee scrambling)

  const m_digit = coprimes10[hash % coprimes10.length];
  const s_digit = (hash % 9) + 1; // shift offset (1 to 9 to guarantee scrambling)

  const mapping: KeyboardMapping = {};

  // Map letters: f(x) = (m * x + s) % 26
  for (let i = 0; i < letters.length; i++) {
    const mappedIndex = (m * i + s) % 26;
    const mappedChar = letters[mappedIndex];
    mapping[letters[i]] = mappedChar;
    mapping[letters[i].toUpperCase()] = mappedChar.toUpperCase();
  }

  // Map digits: f(x) = (m_digit * x + s_digit) % 10
  for (let i = 0; i < digits.length; i++) {
    const mappedIndex = (m_digit * i + s_digit) % 10;
    mapping[digits[i]] = digits[mappedIndex];
  }

  return mapping;
}

// ----------------------------------------------------
// FIRESTORE SYNC & STATE TRACKING
// ----------------------------------------------------
let firestoreDb: any = null;
const lastSyncedCandidatesMap = new Map<string, string>();
let lastSyncedSettingsStr = "";
let lastSyncedAdminsStr = "";
let lastSyncedLogsStr = "";

function updateLastSyncedCache() {
  lastSyncedCandidatesMap.clear();
  candidatesList.forEach(cand => {
    lastSyncedCandidatesMap.set(cand.id, JSON.stringify(cand));
  });
  lastSyncedSettingsStr = JSON.stringify(competitionSettings);
  lastSyncedAdminsStr = JSON.stringify(adminsList);
  lastSyncedLogsStr = JSON.stringify(activityLogs);
}

// Load DB from file if it exists
function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      if (data.candidates) candidatesList = data.candidates;
      if (data.settings) competitionSettings = data.settings;
      if (data.logs) activityLogs = data.logs;
      if (data.admins) adminsList = data.admins;
      console.log(`Database loaded successfully from ${DB_FILE}. Loaded ${candidatesList.length} candidates.`);
    } else {
      saveDatabase();
    }
  } catch (err) {
    console.error("Error loading database, starting with empty states:", err);
  }
}

// Save state to file
function saveDatabase() {
  try {
    const data = {
      candidates: candidatesList,
      settings: competitionSettings,
      logs: activityLogs,
      admins: adminsList
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving database file:", err);
  }
}

// Add system/admin activity log
function addLog(candidateId: string, candidateName: string, action: string, details: string) {
  const newLog: ActivityLog = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    candidateId,
    candidateName,
    action,
    details
  };
  activityLogs.unshift(newLog);
  if (activityLogs.length > 500) activityLogs.pop(); // Keep last 500 logs
  saveDatabase();
}

async function syncToFirestore() {
  if (!firestoreDb) return;
  try {
    // 1. Sync global settings if changed
    const currentSettingsStr = JSON.stringify(competitionSettings);
    if (currentSettingsStr !== lastSyncedSettingsStr) {
      await setDoc(doc(firestoreDb, "competition", "settings"), competitionSettings);
      lastSyncedSettingsStr = currentSettingsStr;
      console.log("[Firestore] Global settings synced successfully.");
    }

    // 2. Sync admins if changed
    const currentAdminsStr = JSON.stringify(adminsList);
    if (currentAdminsStr !== lastSyncedAdminsStr) {
      await setDoc(doc(firestoreDb, "competition", "admins"), { admins: adminsList });
      lastSyncedAdminsStr = currentAdminsStr;
      console.log("[Firestore] Admins list synced successfully.");
    }

    // 3. Sync logs if changed
    const currentLogsStr = JSON.stringify(activityLogs);
    if (currentLogsStr !== lastSyncedLogsStr) {
      await setDoc(doc(firestoreDb, "competition", "logs"), { logs: activityLogs });
      lastSyncedLogsStr = currentLogsStr;
      console.log("[Firestore] Activity logs synced successfully.");
    }

    // 4. Track candidate differences (creations, deletions, updates)
    const currentCandidatesIds = new Set(candidatesList.map(c => c.id));

    // Handle deletions
    for (const id of lastSyncedCandidatesMap.keys()) {
      if (!currentCandidatesIds.has(id)) {
        await deleteDoc(doc(firestoreDb, "candidates", id));
        lastSyncedCandidatesMap.delete(id);
        console.log(`[Firestore] Deleted candidate ${id}.`);
      }
    }

    // Handle creations and updates
    for (const cand of candidatesList) {
      const candStr = JSON.stringify(cand);
      const cachedStr = lastSyncedCandidatesMap.get(cand.id);
      if (cachedStr !== candStr) {
        await setDoc(doc(firestoreDb, "candidates", cand.id), cand);
        lastSyncedCandidatesMap.set(cand.id, candStr);
        console.log(`[Firestore] Synced candidate ${cand.name} (${cand.id}).`);
      }
    }
  } catch (err) {
    console.error("[Firestore] Sync loop error:", err);
  }
}

async function initializeAndLoadDatabase() {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const firebaseConfig = {
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId
      };
      const fbApp = initializeApp(firebaseConfig);
      if (config.firestoreDatabaseId) {
        firestoreDb = initializeFirestore(fbApp, { experimentalForceLongPolling: true }, config.firestoreDatabaseId);
      } else {
        firestoreDb = initializeFirestore(fbApp, { experimentalForceLongPolling: true });
      }
      console.log("Firebase initialized. Database ID:", config.firestoreDatabaseId || "(default)");
    } catch (err) {
      console.error("Firebase initialization failed:", err);
    }
  }

  // Load from local fallback first
  loadDatabase();

  if (firestoreDb) {
    console.log("[Firestore] Synchronizing state from cloud...");
    try {
      // 1. Settings
      const settingsSnap = await getDoc(doc(firestoreDb, "competition", "settings"));
      if (settingsSnap.exists()) {
        competitionSettings = settingsSnap.data() as CompetitionSettings;
      } else {
        await setDoc(doc(firestoreDb, "competition", "settings"), competitionSettings);
      }

      // 2. Admins
      const adminsSnap = await getDoc(doc(firestoreDb, "competition", "admins"));
      if (adminsSnap.exists()) {
        const data = adminsSnap.data();
        if (data && data.admins) adminsList = data.admins;
      } else {
        await setDoc(doc(firestoreDb, "competition", "admins"), { admins: adminsList });
      }

      // 3. Logs
      const logsSnap = await getDoc(doc(firestoreDb, "competition", "logs"));
      if (logsSnap.exists()) {
        const data = logsSnap.data();
        if (data && data.logs) activityLogs = data.logs;
      } else {
        await setDoc(doc(firestoreDb, "competition", "logs"), { logs: activityLogs });
      }

      // 4. Candidates
      const candidatesSnap = await getDocs(collection(firestoreDb, "candidates"));
      if (!candidatesSnap.empty) {
        const loaded: Candidate[] = [];
        candidatesSnap.forEach(snap => {
          loaded.push(snap.data() as Candidate);
        });
        candidatesList = loaded;
      }

      // Save locally to keep backup db.json completely synced
      saveDatabase();
      console.log(`[Firestore] Sync complete. Loaded ${candidatesList.length} candidates from cloud.`);
    } catch (err) {
      console.error("[Firestore] Load error, using local fallback copy:", err);
    }
  }

  // Update dirty tracking cache
  updateLastSyncedCache();

  // Background sync every 3 seconds
  setInterval(syncToFirestore, 3000);
}

// ----------------------------------------------------
// EXPRESS APP & MIDDLEWARES
// ----------------------------------------------------
const app = express();
app.use(express.json());

// Token Authentication Middleware
function authenticateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token is missing" });
  }

  const session = activeSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (session) activeSessions.delete(token);
    return res.status(403).json({ message: "Session expired or invalid" });
  }

  // Inject session details into request object
  (req as any).user = {
    id: session.userId,
    role: session.role
  };
  next();
}

// Admin only gate middleware
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user;
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin privileges required" });
  }
  next();
}

// Active Candidate Check
function getActiveCandidate(userId: string): Candidate | null {
  const candidate = candidatesList.find(c => c.id === userId);
  if (!candidate) return null;
  
  // Server-controlled Timer evaluation
  if (candidate.hasStarted && !candidate.completedAt && competitionSettings.status === CompetitionStatus.RUNNING) {
    const durationMs = competitionSettings.durationMinutes * 60 * 1000;
    
    // Calculate exact elapsed ms
    // Subtract global pauses if any, or simpler:
    // candidate.elapsedSeconds tracks the active timing.
    // Let's compute actual time ticked since startedAt.
    // If we restarted or resumed, we adjust startedAt to compensate for paused durations.
    const nowMs = Date.now();
    const candidateStartedAtMs = candidate.startedAt ? new Date(candidate.startedAt).getTime() : nowMs;
    const elapsedMs = nowMs - candidateStartedAtMs;
    
    if (elapsedMs >= durationMs) {
      // Auto-submit and complete
      candidate.completedAt = new Date().toISOString();
      candidate.elapsedSeconds = competitionSettings.durationMinutes * 60;
      addLog(candidate.id, candidate.name, "Timeout Completion", "Candidate exceeded allowed time and was automatically locked.");
      saveDatabase();
    } else {
      candidate.elapsedSeconds = Math.floor(elapsedMs / 1000);
    }
  }
  
  return candidate;
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// 1. AUTHENTICATION API
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  const trimmedUser = username.trim().toLowerCase();

  // Try Admin Login first
  const admin = adminsList.find(a => a.username.toLowerCase() === trimmedUser);
  if (admin) {
    const hashed = hashPassword(password, admin.salt);
    if (hashed === admin.passwordHash) {
      const token = crypto.randomBytes(32).toString("hex");
      activeSessions.set(token, {
        token,
        userId: "admin",
        role: "admin",
        expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      });
      addLog("admin", "Admin", "Login", "Admin logged in successfully.");
      return res.json({
        token,
        user: { id: "admin", name: admin.name, username: admin.username, role: "admin" }
      });
    }
  }

  // Try Candidate Login
  const candidate = candidatesList.find(c => c.username.toLowerCase() === trimmedUser);
  if (candidate) {
    const hashed = hashPassword(password, "salt_cand_" + candidate.username);
    if (hashed === candidate.passwordHash) {
      if (candidate.isLocked) {
        return res.status(403).json({ message: "Account is locked. Please contact the administrator." });
      }

      const token = crypto.randomBytes(32).toString("hex");
      activeSessions.set(token, {
        token,
        userId: candidate.id,
        role: "candidate",
        expiresAt: Date.now() + 8 * 60 * 60 * 1000 // 8 hours
      });
      addLog(candidate.id, candidate.name, "Login", "Candidate logged in successfully.");
      return res.json({
        token,
        user: { id: candidate.id, name: candidate.name, username: candidate.username, role: "candidate" }
      });
    }
  }

  return res.status(401).json({ message: "Invalid credentials" });
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  const user = (req as any).user;
  if (user.role === "admin") {
    const admin = adminsList[0];
    return res.json({ id: "admin", name: admin.name, username: admin.username, role: "admin" });
  } else {
    const candidate = getActiveCandidate(user.id);
    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }
    return res.json({
      id: candidate.id,
      name: candidate.name,
      username: candidate.username,
      role: "candidate",
      isLocked: candidate.isLocked,
      hasStarted: candidate.hasStarted,
      completedAt: candidate.completedAt
    });
  }
});

app.post("/api/auth/logout", authenticateToken, (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token) {
    activeSessions.delete(token);
  }
  res.json({ message: "Logged out successfully" });
});

// ----------------------------------------------------
// ADMIN CONTROLLER API
// ----------------------------------------------------

// GET Stats
app.get("/api/admin/stats", authenticateToken, requireAdmin, (req, res) => {
  let total = candidatesList.length;
  let completed = 0;
  let running = 0;
  let waiting = 0;
  let locked = 0;
  let totalScore = 0;
  let highest = 0;
  let lowest = total > 0 ? 20 : 0;

  candidatesList.forEach(c => {
    if (c.isLocked) locked++;
    if (c.completedAt) {
      completed++;
    } else if (c.hasStarted) {
      running++;
    } else {
      waiting++;
    }

    totalScore += c.score;
    if (c.score > highest) highest = c.score;
    if (c.score < lowest) lowest = c.score;
  });

  const average = total > 0 ? parseFloat((totalScore / total).toFixed(2)) : 0;

  res.json({
    totalCandidates: total,
    completed,
    running,
    waiting,
    locked,
    averageScore: average,
    highestScore: highest,
    lowestScore: lowest,
    competitionStatus: competitionSettings.status,
    timeRemainingSeconds: getGlobalRemainingSeconds()
  });
});

function getGlobalRemainingSeconds(): number {
  if (competitionSettings.status === CompetitionStatus.WAITING) {
    return competitionSettings.durationMinutes * 60;
  }
  const totalDurationMs = competitionSettings.durationMinutes * 60 * 1000;
  let elapsedMs = competitionSettings.accumulatedElapsedMs;
  if (competitionSettings.status === CompetitionStatus.RUNNING && competitionSettings.startedAt) {
    elapsedMs += Date.now() - new Date(competitionSettings.startedAt).getTime();
  }
  const remainingMs = Math.max(0, totalDurationMs - elapsedMs);
  return Math.floor(remainingMs / 1000);
}

// GET Candidates (Includes custom mappings for admin viewer)
app.get("/api/admin/candidates", authenticateToken, requireAdmin, (req, res) => {
  const result = candidatesList.map(c => {
    // Force sync active candidates timers
    const syncedCand = getActiveCandidate(c.id) || c;
    return {
      id: syncedCand.id,
      name: syncedCand.name,
      username: syncedCand.username,
      isLocked: syncedCand.isLocked,
      keyboardMapping: syncedCand.keyboardMapping,
      hasStarted: syncedCand.hasStarted,
      startedAt: syncedCand.startedAt,
      completedAt: syncedCand.completedAt,
      currentLevel: syncedCand.currentLevel,
      score: syncedCand.score,
      elapsedSeconds: syncedCand.elapsedSeconds
    };
  });
  res.json(result);
});

// CREATE Candidate
app.post("/api/admin/candidates", authenticateToken, requireAdmin, (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const existing = candidatesList.find(c => c.username.toLowerCase() === username.trim().toLowerCase());
  if (existing) {
    return res.status(400).json({ message: "Username already exists" });
  }

  const newCand: Candidate = {
    id: crypto.randomUUID(),
    name: name.trim(),
    username: username.trim().toLowerCase(),
    passwordHash: hashPassword(password, "salt_cand_" + username.trim().toLowerCase()),
    isLocked: false,
    keyboardMapping: generateKeyboardMapping(username.trim().toLowerCase()),
    hasStarted: false,
    startedAt: null,
    completedAt: null,
    currentLevel: 1,
    level1Text: "",
    level1Completed: false,
    level2WordIndex: 0,
    level2Submissions: [],
    level3CharIndex: 0,
    level3Submissions: [],
    score: 0,
    elapsedSeconds: 0
  };

  candidatesList.push(newCand);
  addLog("admin", "Admin", "Create Candidate", `Created candidate ${newCand.name} (${newCand.username}).`);
  saveDatabase();
  res.status(201).json(newCand);
});

// EDIT Candidate
app.put("/api/admin/candidates/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, password, isLocked } = req.body;

  const candidate = candidatesList.find(c => c.id === id);
  if (!candidate) {
    return res.status(404).json({ message: "Candidate not found" });
  }

  if (name !== undefined) candidate.name = name.trim();
  if (password) {
    candidate.passwordHash = hashPassword(password, "salt_cand_" + candidate.username);
  }
  if (isLocked !== undefined) {
    candidate.isLocked = isLocked;
    addLog("admin", "Admin", isLocked ? "Lock Candidate" : "Unlock Candidate", `${isLocked ? "Locked" : "Unlocked"} candidate ${candidate.name}.`);
  }

  saveDatabase();
  res.json(candidate);
});

// DELETE Candidate
app.delete("/api/admin/candidates/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const index = candidatesList.findIndex(c => c.id === id);
  if (index === -1) {
    return res.status(404).json({ message: "Candidate not found" });
  }

  const deletedName = candidatesList[index].name;
  candidatesList.splice(index, 1);
  addLog("admin", "Admin", "Delete Candidate", `Deleted candidate ${deletedName}.`);
  saveDatabase();
  res.json({ message: "Candidate deleted successfully" });
});

// RE-GENERATE Remapping
app.post("/api/admin/candidates/:id/remap", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const candidate = candidatesList.find(c => c.id === id);
  if (!candidate) {
    return res.status(404).json({ message: "Candidate not found" });
  }

  if (candidate.hasStarted && !candidate.completedAt) {
    return res.status(400).json({ message: "Cannot regenerate remapping for an active candidate once they have started." });
  }

  // Pass a random salt/seed so the formula maps to a new distinct layout
  candidate.keyboardMapping = generateKeyboardMapping(candidate.username, crypto.randomBytes(4).toString("hex"));
  addLog("admin", "Admin", "Remap Keyboard", `Regenerated keyboard mapping for ${candidate.name}.`);
  saveDatabase();
  res.json({ keyboardMapping: candidate.keyboardMapping });
});

// GET Settings
app.get("/api/admin/settings", authenticateToken, requireAdmin, (req, res) => {
  res.json(competitionSettings);
});

// UPDATE Settings
app.post("/api/admin/settings", authenticateToken, requireAdmin, (req, res) => {
  const { durationMinutes, level2Words, level3Letters } = req.body;

  if (durationMinutes !== undefined) {
    if (typeof durationMinutes !== "number" || durationMinutes <= 0) {
      return res.status(400).json({ message: "Duration must be a positive number" });
    }
    competitionSettings.durationMinutes = durationMinutes;
  }

  if (level2Words !== undefined) {
    if (!Array.isArray(level2Words) || level2Words.some(w => typeof w !== "string" || !w)) {
      return res.status(400).json({ message: "level2Words must be a non-empty array of strings" });
    }
    competitionSettings.level2Words = level2Words.map(w => w.trim());
  }

  if (level3Letters !== undefined) {
    if (!Array.isArray(level3Letters) || level3Letters.some(l => typeof l !== "string" || l.length !== 1)) {
      return res.status(400).json({ message: "level3Letters must be an array of single characters" });
    }
    competitionSettings.level3Letters = level3Letters.map(l => l.toUpperCase());
  }

  addLog("admin", "Admin", "Update Settings", "Updated competition settings (words/letters/timer).");
  saveDatabase();
  res.json(competitionSettings);
});

// GET Leaderboard / Results
app.get("/api/admin/leaderboard", (req, res) => {
  const leaderboard: LeaderboardEntry[] = candidatesList.map(c => {
    const synced = getActiveCandidate(c.id) || c;
    const level2Correct = synced.level2Submissions.filter(s => s.isCorrect).length;
    const level3Correct = synced.level3Submissions.filter(s => s.isCorrect).length;
    return {
      id: synced.id,
      name: synced.name,
      username: synced.username,
      score: synced.score,
      level1Completed: synced.level1Completed,
      level2Correct,
      level3Correct,
      elapsedSeconds: synced.elapsedSeconds,
      completedAt: synced.completedAt,
      isLocked: synced.isLocked,
      currentLevel: synced.currentLevel
    };
  });

  // Sort: 1. Highest Score, 2. Lowest elapsed time for started candidates, 3. alphabetically
  leaderboard.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-break: faster completion time
    if (a.completedAt && b.completedAt) {
      return a.elapsedSeconds - b.elapsedSeconds;
    }
    if (a.completedAt) return -1;
    if (b.completedAt) return 1;
    return a.elapsedSeconds - b.elapsedSeconds;
  });

  res.json(leaderboard);
});

// GET Logs
app.get("/api/admin/logs", authenticateToken, requireAdmin, (req, res) => {
  res.json(activityLogs);
});

// COMPETITION CONTROLLER (Start/Stop/Pause/Reset)
app.post("/api/admin/settings/control", authenticateToken, requireAdmin, (req, res) => {
  const { action } = req.body;

  if (action === "start") {
    if (competitionSettings.status === CompetitionStatus.WAITING) {
      competitionSettings.status = CompetitionStatus.RUNNING;
      competitionSettings.startedAt = new Date().toISOString();
      addLog("admin", "Admin", "Start Competition", "Competition was started by Administrator.");
    } else if (competitionSettings.status === CompetitionStatus.PAUSED) {
      // Resume
      competitionSettings.status = CompetitionStatus.RUNNING;
      competitionSettings.startedAt = new Date().toISOString();
      addLog("admin", "Admin", "Resume Competition", "Competition was resumed by Administrator.");
    }
  } else if (action === "pause") {
    if (competitionSettings.status === CompetitionStatus.RUNNING) {
      const msSinceLastStart = Date.now() - new Date(competitionSettings.startedAt!).getTime();
      competitionSettings.accumulatedElapsedMs += msSinceLastStart;
      competitionSettings.status = CompetitionStatus.PAUSED;
      competitionSettings.pausedAt = new Date().toISOString();
      competitionSettings.startedAt = null;

      // Also adjust active candidate starting offsets so they don't lose time
      candidatesList.forEach(cand => {
        if (cand.hasStarted && !cand.completedAt && cand.startedAt) {
          // Store currently accumulated time so we reset startedAt upon resume
          const activeMs = Date.now() - new Date(cand.startedAt).getTime();
          cand.elapsedSeconds = Math.floor(activeMs / 1000);
        }
      });

      addLog("admin", "Admin", "Pause Competition", "Competition was paused by Administrator.");
    }
  } else if (action === "reset") {
    competitionSettings.status = CompetitionStatus.WAITING;
    competitionSettings.startedAt = null;
    competitionSettings.pausedAt = null;
    competitionSettings.accumulatedElapsedMs = 0;

    // Reset all candidates
    candidatesList.forEach(c => {
      c.hasStarted = false;
      c.startedAt = null;
      c.completedAt = null;
      c.currentLevel = 1;
      c.level1Text = "";
      c.level1Completed = false;
      c.level2WordIndex = 0;
      c.level2Submissions = [];
      c.level3CharIndex = 0;
      c.level3Submissions = [];
      c.score = 0;
      c.elapsedSeconds = 0;
    });

    addLog("admin", "Admin", "Reset Competition", "Competition resets! All candidates progress cleared.");
  } else if (action === "complete") {
    competitionSettings.status = CompetitionStatus.COMPLETED;
    // Complete all running candidates
    candidatesList.forEach(c => {
      if (c.hasStarted && !c.completedAt) {
        c.completedAt = new Date().toISOString();
      }
    });
    addLog("admin", "Admin", "Complete Competition", "Competition marked as completed.");
  } else {
    return res.status(400).json({ message: "Invalid control action" });
  }

  saveDatabase();
  res.json(competitionSettings);
});


// ----------------------------------------------------
// CANDIDATE PLAYPLAY API
// ----------------------------------------------------

// START Candidate Competition
app.post("/api/candidate/start", authenticateToken, (req, res) => {
  const user = (req as any).user;
  const candidate = candidatesList.find(c => c.id === user.id);
  if (!candidate) {
    return res.status(404).json({ message: "Candidate not found" });
  }

  if (competitionSettings.status !== CompetitionStatus.RUNNING) {
    return res.status(400).json({ message: "Competition is not currently running. Please wait for the administrator." });
  }

  if (candidate.isLocked) {
    return res.status(403).json({ message: "Your account is locked." });
  }

  if (candidate.hasStarted) {
    return res.json({ message: "Already started", candidate });
  }

  candidate.hasStarted = true;
  candidate.startedAt = new Date().toISOString();
  candidate.currentLevel = 1;
  candidate.elapsedSeconds = 0;

  addLog(candidate.id, candidate.name, "Start Challenge", `${candidate.name} has officially started the challenge.`);
  saveDatabase();
  res.json(candidate);
});

// GET Current Status
app.get("/api/candidate/status", authenticateToken, (req, res) => {
  const user = (req as any).user;
  const candidate = getActiveCandidate(user.id);
  if (!candidate) {
    return res.status(404).json({ message: "Candidate not found" });
  }

  res.json({
    id: candidate.id,
    name: candidate.name,
    hasStarted: candidate.hasStarted,
    completedAt: candidate.completedAt,
    currentLevel: candidate.currentLevel,
    score: candidate.score,
    elapsedSeconds: candidate.elapsedSeconds,
    isLocked: candidate.isLocked,
    keyboardMapping: candidate.keyboardMapping, // Returned so client can perform remapping in real-time
    competitionStatus: competitionSettings.status,
    globalRemainingSeconds: getGlobalRemainingSeconds(),
    
    // Level stats
    level1Text: candidate.level1Text,
    level1Completed: candidate.level1Completed,
    
    level2WordIndex: candidate.level2WordIndex,
    level2TotalWords: competitionSettings.level2Words.length,
    level2CurrentWord: competitionSettings.level2Words[candidate.level2WordIndex] || null,
    level2CorrectCount: candidate.level2Submissions.filter(s => s.isCorrect).length,
    
    level3CharIndex: candidate.level3CharIndex,
    level3TotalChars: competitionSettings.level3Letters.length,
    level3CurrentChar: competitionSettings.level3Letters[candidate.level3CharIndex] || null,
    level3CorrectCount: candidate.level3Submissions.filter(s => s.isCorrect).length
  });
});

// Submit Level 1 Letter Progress
app.post("/api/candidate/submit/level1", authenticateToken, (req, res) => {
  const user = (req as any).user;
  const candidate = getActiveCandidate(user.id);
  if (!candidate) return res.status(404).json({ message: "Candidate not found" });

  if (!candidate.hasStarted || candidate.completedAt || candidate.isLocked) {
    return res.status(403).json({ message: "Action locked" });
  }

  if (candidate.currentLevel !== 1) {
    return res.status(400).json({ message: "Not currently on Level 1" });
  }

  const { text } = req.body;
  if (typeof text !== "string") {
    return res.status(400).json({ message: "Invalid typed text input" });
  }

  candidate.level1Text = text.toUpperCase();

  // If fully completed alphabet
  if (candidate.level1Text === "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    candidate.level1Completed = true;
    candidate.currentLevel = 2; // Advance to level 2
    addLog(candidate.id, candidate.name, "Complete Level 1", `${candidate.name} completed Level 1 (Keyboard Learning) and moved to Level 2.`);
  }

  saveDatabase();
  res.json({
    level1Text: candidate.level1Text,
    level1Completed: candidate.level1Completed,
    currentLevel: candidate.currentLevel
  });
});

// Submit Level 2 Word
app.post("/api/candidate/submit/level2", authenticateToken, (req, res) => {
  const user = (req as any).user;
  const candidate = getActiveCandidate(user.id);
  if (!candidate) return res.status(404).json({ message: "Candidate not found" });

  if (!candidate.hasStarted || candidate.completedAt || candidate.isLocked) {
    return res.status(403).json({ message: "Action locked" });
  }

  if (candidate.currentLevel !== 2) {
    return res.status(400).json({ message: "Not currently on Level 2" });
  }

  const { typedWord } = req.body;
  if (typeof typedWord !== "string") {
    return res.status(400).json({ message: "Missing typed word" });
  }

  const currentWord = competitionSettings.level2Words[candidate.level2WordIndex];
  if (!currentWord) {
    return res.status(400).json({ message: "No active word to submit for" });
  }

  // Word validation (case insensitive or exact? Let's make it case-insensitive to be fair, but exact character match is standard. Let's do exact match but trimmed, or case-insensitive matching).
  // "Display one word at a time. Each correct word = 1 point. Incorrect = 0."
  const isCorrect = typedWord.trim().toLowerCase() === currentWord.trim().toLowerCase();
  
  candidate.level2Submissions.push({
    word: currentWord,
    typed: typedWord,
    isCorrect
  });

  if (isCorrect) {
    candidate.score += 1; // 1 point per word
  }

  candidate.level2WordIndex += 1;

  // If completed all Level 2 words
  if (candidate.level2WordIndex >= competitionSettings.level2Words.length) {
    candidate.currentLevel = 3; // Move to Level 3
    addLog(candidate.id, candidate.name, "Complete Level 2", `${candidate.name} completed Level 2 with score ${candidate.level2Submissions.filter(s => s.isCorrect).length}/${competitionSettings.level2Words.length}.`);
  }

  saveDatabase();
  res.json({
    isCorrect,
    score: candidate.score,
    currentLevel: candidate.currentLevel,
    level2WordIndex: candidate.level2WordIndex,
    level2CurrentWord: competitionSettings.level2Words[candidate.level2WordIndex] || null
  });
});

// Submit Level 3 Keystroke
app.post("/api/candidate/submit/level3", authenticateToken, (req, res) => {
  const user = (req as any).user;
  const candidate = getActiveCandidate(user.id);
  if (!candidate) return res.status(404).json({ message: "Candidate not found" });

  if (!candidate.hasStarted || candidate.completedAt || candidate.isLocked) {
    return res.status(403).json({ message: "Action locked" });
  }

  if (candidate.currentLevel !== 3) {
    return res.status(400).json({ message: "Not currently on Level 3" });
  }

  const { pressedKey } = req.body; // The physical key pressed by candidate, or the character produced
  if (typeof pressedKey !== "string" || pressedKey.length !== 1) {
    return res.status(400).json({ message: "Pressed key must be a single character" });
  }

  const targetLetter = competitionSettings.level3Letters[candidate.level3CharIndex];
  if (!targetLetter) {
    return res.status(400).json({ message: "No target letter" });
  }

  // Let's analyze: "Display one random target letter (e.g. A). Participant must press the key that currently produces that letter according to their personalized mapping."
  // Wait, if target is "A", what physical key should they press?
  // If mapping contains physical key 'q' -> 'a' (and 'Q' -> 'A'), then they must press physical key 'Q' to produce 'A'!
  // So the physical key they pressed must produce the target letter.
  // Wait! When they press a key, if they press physical key 'Q', their on-screen mapping interceptor translates it into 'A'.
  // We can evaluate if the user pressed the correct physical key that maps to target.
  // Or, when they press the key, the output produced is target.
  // Let's make sure our validation is simple and elegant:
  // Is the produced character (which is the mapped output of their pressed physical key) equal to the target letter?
  // Let's support both:
  // - If `pressedKey` (the physical key) maps to `targetLetter` in their mapping:
  //   `mapping[pressedKey] === targetLetter` or `mapping[pressedKey.toLowerCase()] === targetLetter.toLowerCase()`.
  // Yes! If the candidate presses physical key `Q`, the keyboard produces `A`. So `candidate.keyboardMapping[pressedKey] === targetLetter` (case-insensitive check). This is perfectly correct!
  const mappedValue = candidate.keyboardMapping[pressedKey.toLowerCase()] || pressedKey.toLowerCase();
  const isCorrect = mappedValue.toLowerCase() === targetLetter.toLowerCase();

  candidate.level3Submissions.push({
    target: targetLetter,
    pressed: pressedKey,
    isCorrect
  });

  if (isCorrect) {
    candidate.score += 1; // 1 point per letter
  }

  candidate.level3CharIndex += 1;

  // If completed all Level 3 letters
  let completed = false;
  if (candidate.level3CharIndex >= competitionSettings.level3Letters.length) {
    candidate.completedAt = new Date().toISOString();
    completed = true;
    addLog(candidate.id, candidate.name, "Complete Challenge", `${candidate.name} fully completed the Keyboard Hack 2026 with a final score of ${candidate.score}/20 in ${candidate.elapsedSeconds}s!`);
  }

  saveDatabase();
  res.json({
    isCorrect,
    score: candidate.score,
    completed,
    level3CharIndex: candidate.level3CharIndex,
    level3CurrentChar: competitionSettings.level3Letters[candidate.level3CharIndex] || null
  });
});

// Periodic timer sync
app.post("/api/candidate/sync-time", authenticateToken, (req, res) => {
  const user = (req as any).user;
  const candidate = getActiveCandidate(user.id);
  if (!candidate) return res.status(404).json({ message: "Candidate not found" });

  res.json({
    elapsedSeconds: candidate.elapsedSeconds,
    completedAt: candidate.completedAt,
    isLocked: candidate.isLocked,
    globalRemainingSeconds: getGlobalRemainingSeconds()
  });
});


// ----------------------------------------------------
// BOOTSTRAP DEV SERVER / PRODUCTION SERVING
// ----------------------------------------------------
async function startServer() {
  // Initialize and sync Firebase Firestore database
  await initializeAndLoadDatabase();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

export default app;
