/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Candidate, 
  ActivityLog, 
  DashboardStats, 
  CompetitionStatus, 
  LeaderboardEntry 
} from "../types";
import Leaderboard from "./Leaderboard";
import ActivityLogs from "./ActivityLogs";
import KeyboardVisualizer from "./KeyboardVisualizer";
import { 
  Users, CheckCircle2, Play, Pause, RotateCcw, ShieldAlert,
  Settings, Terminal, Award, Plus, Trash2, Key, Lock, Unlock, Edit, 
  HelpCircle, CheckCircle, RefreshCw, LogOut, FileSpreadsheet, FileText, ChevronRight,
  AlertCircle
} from "lucide-react";
import { safeJson } from "../lib/api";

interface AdminPanelProps {
  token: string;
  onLogout: () => void;
}

export default function AdminPanel({ token, onLogout }: AdminPanelProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  
  // Tab states
  const [activeTab, setActiveTab] = useState<"leaderboard" | "candidates" | "control" | "logs">("leaderboard");
  const [loading, setLoading] = useState(true);

  // Candidate creation form
  const [newCandName, setNewCandName] = useState("");
  const [newCandUsername, setNewCandUsername] = useState("");
  const [newCandPassword, setNewCandPassword] = useState("");
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  // Competitor editing/mapping states
  const [selectedCand, setSelectedCand] = useState<Candidate | null>(null);
  const [editingCand, setEditingCand] = useState<Candidate | null>(null);
  const [editPassword, setEditPassword] = useState("");

  // Settings states
  const [configDuration, setConfigDuration] = useState(45);
  const [configWords, setConfigWords] = useState("");
  const [configLetters, setConfigLetters] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");

  const fetchStatsAndCandidates = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const [statsRes, candidatesRes, leaderboardRes, logsRes] = await Promise.all([
        fetch("/api/admin/stats", { headers }),
        fetch("/api/admin/candidates", { headers }),
        fetch("/api/admin/leaderboard"),
        fetch("/api/admin/logs", { headers })
      ]);

      if (statsRes.status === 403 || candidatesRes.status === 403) {
        onLogout();
        return;
      }

      const statsData = await safeJson(statsRes);
      const candidatesData = await safeJson(candidatesRes);
      const leaderboardData = await safeJson(leaderboardRes);
      const logsData = await safeJson(logsRes);

      setStats(statsData);
      setCandidates(candidatesData);
      setLeaderboard(leaderboardData);
      setLogs(logsData);

      // Pre-populate settings form
      const settingsRes = await fetch("/api/admin/settings", { headers });
      const settingsData = await safeJson(settingsRes);
      setConfigDuration(settingsData.durationMinutes);
      setConfigWords(settingsData.level2Words.join(", "));
      setConfigLetters(settingsData.level3Letters.join(", "));
      
      setErrorMsg("");
    } catch (err) {
      setErrorMsg("Failed to synchronize dashboard state.");
    } finally {
      setLoading(false);
    }
  };

  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetchStatsAndCandidates();
    const interval = setInterval(fetchStatsAndCandidates, 5000); // 5s refresh
    return () => clearInterval(interval);
  }, [token]);

  // Handle Candidate Creation
  const handleCreateCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");
    if (!newCandName.trim() || !newCandUsername.trim() || !newCandPassword.trim()) {
      setCreateError("All registration fields are required.");
      return;
    }

    try {
      const res = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newCandName,
          username: newCandUsername,
          password: newCandPassword
        })
      });

      await safeJson(res);

      setCreateSuccess(`Candidate "${newCandName}" registered successfully!`);
      setNewCandName("");
      setNewCandUsername("");
      setNewCandPassword("");
      fetchStatsAndCandidates();
    } catch (err: any) {
      setCreateError(err.message || "Failed to create candidate");
    }
  };

  // Toggle Lock
  const handleToggleLock = async (candidate: Candidate) => {
    try {
      const res = await fetch(`/api/admin/candidates/${candidate.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isLocked: !candidate.isLocked })
      });
      if (res.ok) {
        fetchStatsAndCandidates();
      }
    } catch (err) {}
  };

  // Delete Candidate
  const handleDeleteCandidate = async (id: string) => {
    if (!confirm("Are you absolutely sure you want to permanently delete this competitor and clear their history?")) return;
    try {
      const res = await fetch(`/api/admin/candidates/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        if (selectedCand?.id === id) setSelectedCand(null);
        fetchStatsAndCandidates();
      }
    } catch (err) {}
  };

  // Trigger Remap
  const handleRemapCandidate = async (id: string) => {
    if (!confirm("Regenerate a brand new random keyboard mapping for this candidate? Existing mappings will be lost.")) return;
    try {
      const res = await fetch(`/api/admin/candidates/${id}/remap`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      await safeJson(res);
      fetchStatsAndCandidates();
      // If currently selected, refresh mapping on-screen
      if (selectedCand && selectedCand.id === id) {
        const updated = candidates.find(c => c.id === id);
        if (updated) setSelectedCand(updated);
      }
    } catch (err: any) {
      alert(err.message || "Error remapping");
    }
  };

  // Update Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSuccess("");
    
    const wordsArr = configWords.split(",").map(w => w.trim()).filter(w => w.length > 0);
    const lettersArr = configLetters.split(",").map(l => l.trim().toUpperCase()).filter(l => l.length === 1);

    if (wordsArr.length !== 10) {
      alert("Warning: Level 2 recommends exactly 10 words. Scoring matrices are calibrated for a 10 word progression.");
    }
    if (lettersArr.length !== 10) {
      alert("Warning: Level 3 recommends exactly 10 letters. Scoring matrices are calibrated for a 10 letter hit progression.");
    }

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          durationMinutes: configDuration,
          level2Words: wordsArr,
          level3Letters: lettersArr
        })
      });

      await safeJson(res);

      setSettingsSuccess("Competition settings updated successfully!");
      setTimeout(() => setSettingsSuccess(""), 3000);
      fetchStatsAndCandidates();
    } catch (err: any) {
      alert(err.message || "Failed to update settings");
    }
  };

  // Trigger Game Control actions (Start/Pause/Reset)
  const handleControlAction = async (action: "start" | "pause" | "reset" | "complete") => {
    let confirmMsg = "";
    if (action === "reset") confirmMsg = "CRITICAL ACTION! Resetting will clear all candidate progression, scores, session clocks, and restore waiting states. Continue?";
    if (action === "complete") confirmMsg = "Close competition? This will lock all currently running candidates' inputs and freeze standings. Continue?";

    if (confirmMsg && !confirm(confirmMsg)) return;

    try {
      const res = await fetch("/api/admin/settings/control", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        fetchStatsAndCandidates();
      }
    } catch (err) {}
  };

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0A0A0C] text-slate-100 font-sans gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 font-mono text-xs tracking-widest uppercase">LOADING CONTROL PANEL...</p>
      </div>
    );
  }

  if (!stats) return null;

  const minutesLeft = Math.floor(stats.timeRemainingSeconds / 60);
  const secondsLeft = stats.timeRemainingSeconds % 60;

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-slate-100 flex flex-col justify-between p-4 md:p-6 font-sans relative overflow-hidden" id="admin-main-container">
      {/* Background soft glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 rounded-full filter blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-600/5 rounded-full filter blur-3xl pointer-events-none" />

      {/* Admin Top bar */}
      <header className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-[#141418] border border-white/5 rounded-2xl p-4 backdrop-blur-md z-10 mb-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-indigo-600 flex items-center justify-center font-bold text-white text-base">
            K
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-white tracking-wide text-sm">Keyboard Hack Control Deck</h2>
              <span className="text-[10px] font-mono bg-indigo-950/60 text-indigo-400 border border-indigo-900/30 px-2 py-0.5 rounded">
                Admin Secure Session
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">Manage participants, remappings, timers, words and lockouts.</p>
          </div>
        </div>

        {/* Global Timer status */}
        <div className="flex items-center gap-4 bg-black/40 px-4 py-2 rounded-xl border border-white/5 shadow-inner justify-between">
          <div className="text-right">
            <span className="text-[9px] text-slate-500 font-mono uppercase block">Session Clock</span>
            <span className={`text-base font-semibold font-mono flex items-center gap-1.5 justify-end ${stats.timeRemainingSeconds < 300 ? "text-red-400 animate-pulse" : "text-white"}`}>
              {minutesLeft}:{secondsLeft < 10 ? `0${secondsLeft}` : secondsLeft}
            </span>
          </div>

          <div className="border-l border-white/5 pl-4 text-center">
            <span className="text-[9px] text-slate-500 font-mono uppercase block">Sync Mode</span>
            <span className="text-xs font-semibold text-indigo-400 font-mono block mt-1 flex items-center gap-1">
              <RefreshCw size={10} className="animate-spin text-indigo-500 shrink-0" />
              Trace Live
            </span>
          </div>

          <button onClick={onLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 font-semibold border border-white/10 transition-colors text-xs cursor-pointer" id="admin-sign-out-btn">
            <LogOut size={12} />
            <span>Exit</span>
          </button>
        </div>
      </header>

      {/* Bento Grid Statistical Counters */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6 z-10" id="admin-stats-counters">
        <div className="bg-[#141418] border border-white/5 p-4 rounded-xl text-center">
          <span className="text-[9px] text-slate-500 font-mono uppercase block mb-1">Competitors</span>
          <span className="text-2xl font-light text-white font-mono">{stats.totalCandidates}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Registered</span>
        </div>
        <div className="bg-[#141418] border border-white/5 p-4 rounded-xl text-center">
          <span className="text-[9px] text-slate-500 font-mono uppercase block mb-1">Status: Playing</span>
          <span className="text-2xl font-light text-indigo-400 font-mono">{stats.running}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Active Clocks</span>
        </div>
        <div className="bg-[#141418] border border-white/5 p-4 rounded-xl text-center">
          <span className="text-[9px] text-slate-500 font-mono uppercase block mb-1">Status: Finished</span>
          <span className="text-2xl font-light text-emerald-400 font-mono">{stats.completed}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Solutions Logged</span>
        </div>
        <div className="bg-[#141418] border border-white/5 p-4 rounded-xl text-center">
          <span className="text-[9px] text-slate-500 font-mono uppercase block mb-1">Locked Users</span>
          <span className="text-2xl font-light text-red-400 font-mono">{stats.locked}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Input Locked</span>
        </div>
        <div className="bg-[#141418] border border-white/5 p-4 rounded-xl text-center">
          <span className="text-[9px] text-slate-500 font-mono uppercase block mb-1">Average Score</span>
          <span className="text-2xl font-light text-indigo-400 font-mono">{stats.averageScore}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Out of 20 pts</span>
        </div>
        <div className="bg-[#141418] border border-white/5 p-4 rounded-xl text-center">
          <span className="text-[9px] text-slate-500 font-mono uppercase block mb-1">Highest Score</span>
          <span className="text-2xl font-light text-indigo-400 font-mono">{stats.highestScore}</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Standings Peak</span>
        </div>
        <div className="bg-[#141418] border border-white/5 p-4 rounded-xl text-center col-span-2 md:col-span-1">
          <span className="text-[9px] text-slate-500 font-mono uppercase block mb-1">Global Stage</span>
          <span className="text-xs font-semibold uppercase font-mono py-1 rounded block mt-1.5 text-slate-200">
            {stats.competitionStatus === CompetitionStatus.WAITING && (
              <span className="text-slate-400 bg-black/40 border border-white/5 px-2 py-1 rounded">WAITING</span>
            )}
            {stats.competitionStatus === CompetitionStatus.RUNNING && (
              <span className="text-indigo-400 bg-indigo-950/60 border border-indigo-900/50 px-2 py-1 rounded animate-pulse">ACTIVE</span>
            )}
            {stats.competitionStatus === CompetitionStatus.PAUSED && (
              <span className="text-amber-500 bg-amber-950/60 border border-amber-900/50 px-2 py-1 rounded">PAUSED</span>
            )}
            {stats.competitionStatus === CompetitionStatus.COMPLETED && (
              <span className="text-purple-400 bg-purple-950/60 border border-purple-900/50 px-2 py-1 rounded">CLOSED</span>
            )}
          </span>
        </div>
      </section>

      {/* Main Panel Content with tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start z-10 mb-6">
        
        {/* Navigation Sidebar & Controls */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Deck tabs */}
          <div className="bg-[#141418] border border-white/5 rounded-2xl p-4 flex flex-col gap-1.5">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-widest font-mono mb-2 px-2">Navigation Deck</h4>
            <button
              onClick={() => setActiveTab("leaderboard")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                activeTab === "leaderboard"
                  ? "bg-indigo-600 text-white font-semibold shadow-md"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Award size={16} />
              <span>Leaderboard Standings</span>
            </button>

            <button
              onClick={() => setActiveTab("candidates")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                activeTab === "candidates"
                  ? "bg-indigo-600 text-white font-semibold shadow-md"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Users size={16} />
              <span>Competitor Registries</span>
            </button>

            <button
              onClick={() => setActiveTab("control")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                activeTab === "control"
                  ? "bg-indigo-600 text-white font-semibold shadow-md"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Settings size={16} />
              <span>Session Controllers</span>
            </button>

            <button
              onClick={() => setActiveTab("logs")}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                activeTab === "logs"
                  ? "bg-indigo-600 text-white font-semibold shadow-md"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Terminal size={16} />
              <span>Live Console traces</span>
            </button>
          </div>

          {/* Quick Active controllers */}
          <div className="bg-[#141418] border border-white/5 rounded-2xl p-5 space-y-4">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">Central Game Activations</h4>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleControlAction("start")}
                disabled={stats.competitionStatus === CompetitionStatus.RUNNING}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 transition-colors text-white font-semibold text-xs border border-emerald-500/20 shadow-lg cursor-pointer"
                id="control-start-btn"
              >
                <Play size={14} fill="currentColor" />
                <span>Start / Resume</span>
              </button>

              <button
                onClick={() => handleControlAction("pause")}
                disabled={stats.competitionStatus !== CompetitionStatus.RUNNING}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 transition-colors text-white font-semibold text-xs border border-amber-500/20 shadow-lg cursor-pointer"
                id="control-pause-btn"
              >
                <Pause size={14} fill="currentColor" />
                <span>Pause Session</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-3">
              <button
                onClick={() => handleControlAction("complete")}
                disabled={stats.competitionStatus === CompetitionStatus.COMPLETED || stats.competitionStatus === CompetitionStatus.WAITING}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 transition-colors text-white font-semibold text-xs border border-purple-500/20 shadow-md cursor-pointer"
                id="control-complete-btn"
              >
                <CheckCircle size={14} />
                <span>Close Session</span>
              </button>

              <button
                onClick={() => handleControlAction("reset")}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-black/40 hover:bg-black/60 hover:text-red-400 border border-white/5 transition-colors text-slate-500 font-semibold text-xs shadow-inner cursor-pointer"
                id="control-reset-btn"
              >
                <RotateCcw size={14} />
                <span>Reset Clocks</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Canvas Area */}
        <div className="lg:col-span-2">
          
          {/* STANDINGS LEADERBOARD */}
          {activeTab === "leaderboard" && (
            <Leaderboard entries={leaderboard} isAdmin={true} onRefresh={fetchStatsAndCandidates} />
          )}

          {/* COMPETITOR REGISTRY */}
          {activeTab === "candidates" && (
            <div className="space-y-6">
              
              {/* Registration Form */}
              <div className="bg-[#141418] border border-white/5 rounded-2xl p-6">
                <h3 className="text-base font-light text-white flex items-center gap-2 mb-4">
                  <Plus className="text-indigo-400" size={18} />
                  Competitor Registrations
                </h3>

                <form onSubmit={handleCreateCandidate} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Competitor Name</label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={newCandName}
                      onChange={(e) => setNewCandName(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/5 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                      id="cand-name-input"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Unique Username</label>
                    <input
                      type="text"
                      placeholder="e.g. jdoe22"
                      value={newCandUsername}
                      onChange={(e) => setNewCandUsername(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/5 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                      id="cand-user-input"
                    />
                  </div>
                  <div className="relative">
                    <label className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Secure Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={newCandPassword}
                      onChange={(e) => setNewCandPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/5 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors pr-12"
                      id="cand-pass-input"
                    />
                    <button
                      type="submit"
                      className="absolute right-1 top-5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-semibold text-[10px] border border-indigo-500/30 transition-colors cursor-pointer"
                      id="submit-register-btn"
                    >
                      Register
                    </button>
                  </div>
                </form>

                {createError && <p className="text-xs text-red-400 mt-2 font-mono flex items-center gap-1"><AlertCircle size={12} /> {createError}</p>}
                {createSuccess && <p className="text-xs text-emerald-400 mt-2 font-mono flex items-center gap-1"><CheckCircle2 size={12} /> {createSuccess}</p>}
              </div>

              {/* Registered competitors list */}
              <div className="bg-[#141418] border border-white/5 rounded-2xl p-6">
                <h3 className="text-base font-bold text-white mb-4">Competitor Registry Directory ({candidates.length})</h3>

                <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/20">
                  <table className="w-full text-left text-sm text-slate-300 border-collapse">
                    <thead>
                      <tr className="bg-black/40 border-b border-white/5 text-slate-400 font-semibold text-[10px] uppercase tracking-wider font-mono">
                        <th className="py-3 px-4">Competitor</th>
                        <th className="py-3 px-4 text-center">Mapping</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Score</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {candidates.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500 text-xs italic">
                            No candidates registered yet. Register above.
                          </td>
                        </tr>
                      ) : (
                        candidates.map((cand) => (
                          <tr key={cand.id} className="hover:bg-white/5 text-xs transition-colors">
                            <td className="py-3 px-4">
                              <div>
                                <span className="font-semibold text-white block">{cand.name}</span>
                                <span className="text-[10px] text-slate-500 font-mono">@{cand.username}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => setSelectedCand(cand)}
                                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-indigo-600 text-[10px] font-mono border border-white/10 text-indigo-400 hover:text-white transition-colors cursor-pointer"
                                id={`view-mapping-${cand.id}`}
                              >
                                View Mapping
                              </button>
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-[10px]">
                              {cand.completedAt ? (
                                <span className="text-emerald-400 font-semibold bg-emerald-950/40 px-2 py-0.5 rounded">Finished</span>
                              ) : cand.hasStarted ? (
                                <span className="text-indigo-400 font-semibold bg-indigo-950/40 px-2 py-0.5 rounded animate-pulse">Playing - L{cand.currentLevel}</span>
                              ) : (
                                <span className="text-slate-500 bg-white/5 px-2 py-0.5 rounded">Waiting</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center font-semibold text-indigo-400 font-mono text-sm">
                              {cand.score} <span className="text-[10px] text-slate-500 font-light">pts</span>
                            </td>
                            <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                              {/* Remap button */}
                              <button
                                onClick={() => handleRemapCandidate(cand.id)}
                                disabled={cand.hasStarted && !cand.completedAt}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/30 text-slate-400 hover:text-white transition-colors disabled:opacity-30 cursor-pointer"
                                title="Regenerate Keyboard Mapping"
                                id={`remap-${cand.id}`}
                              >
                                <Key size={12} />
                              </button>

                              {/* Lock/Unlock Toggle */}
                              <button
                                onClick={() => handleToggleLock(cand)}
                                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                  cand.isLocked
                                    ? "bg-red-950/40 border-red-900 text-red-400 hover:bg-red-900/60"
                                    : "bg-white/5 border-white/10 text-slate-500 hover:text-slate-300"
                                }`}
                                title={cand.isLocked ? "Unlock competitor account" : "Lock competitor account"}
                                id={`toggle-lock-${cand.id}`}
                              >
                                {cand.isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                              </button>

                              {/* Delete button */}
                              <button
                                onClick={() => handleDeleteCandidate(cand.id)}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-red-950/30 border border-white/10 hover:border-red-900 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                                title="Delete competitor"
                                id={`delete-cand-${cand.id}`}
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SESSION CONTROLLERS & SETTINGS */}
          {activeTab === "control" && (
            <div className="space-y-6">
              
              {/* Settings configuration panel */}
              <div className="bg-[#141418] border border-white/5 rounded-2xl p-6">
                <h3 className="text-base font-light text-white flex items-center gap-2 mb-4">
                  <Settings className="text-indigo-400" size={18} />
                  Competition Parameters
                </h3>

                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-400 font-mono block mb-1">Session Duration Timer (Minutes)</label>
                    <input
                      type="number"
                      value={configDuration}
                      onChange={(e) => setConfigDuration(parseInt(e.target.value) || 0)}
                      className="w-full sm:w-1/3 px-3 py-2 bg-black/40 border border-white/5 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                      min={1}
                      id="setting-duration-input"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Default is 45 minutes. Countdown ticks securely on the central node.</p>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-mono block mb-1">Level 2: Word list (Comma separated)</label>
                    <textarea
                      value={configWords}
                      onChange={(e) => setConfigWords(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 bg-black/40 border border-white/5 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono leading-relaxed"
                      placeholder="e.g. Machine, Learning, Artificial, Neural"
                      id="setting-words-input"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Word progress displays sequentially on candidates' dashboards. Enter exactly 10 words.</p>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-mono block mb-1">Level 3: Target character list (Comma separated)</label>
                    <input
                      type="text"
                      value={configLetters}
                      onChange={(e) => setConfigLetters(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/5 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                      placeholder="A, E, I, O, U, K, S, T, N, X"
                      id="setting-letters-input"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Single characters for instantaneous spatial recognition drills. Enter exactly 10 letters.</p>
                  </div>

                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs border border-indigo-500/20 shadow-md transition-colors cursor-pointer"
                    id="save-settings-btn"
                  >
                    Save Parameters
                  </button>

                  {settingsSuccess && <p className="text-xs text-emerald-400 mt-2 font-mono flex items-center gap-1"><CheckCircle2 size={12} /> {settingsSuccess}</p>}
                </form>
              </div>

              {/* Reset/Control documentation */}
              <div className="bg-[#141418] border border-white/5 p-5 rounded-2xl">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono mb-2">Technical Administration Guide</h4>
                <div className="text-xs text-slate-500 space-y-2 leading-relaxed">
                  <p>• <strong>Start / Resume:</strong> Activates candidate dashboards, allowing candidates to log in, launch, and submit levels.</p>
                  <p>• <strong>Pause Session:</strong> Instantly stops active candidate timer progression and locks further inputs. Standing dashboards continue displaying frozen ranks.</p>
                  <p>• <strong>Reset Clocks:</strong> Standard restoration helper. Fully empties participant progression stats, clears scoreboards, and wipes levels. Used to prepare clean setups for consecutive tournaments.</p>
                  <p>• <strong>Close Session:</strong> Enforces termination of the tournament. Automatically freezes active contestant scores and logs completion marks.</p>
                </div>
              </div>
            </div>
          )}

          {/* LIVE TERMINAL LOGS */}
          {activeTab === "logs" && (
            <ActivityLogs logs={logs} />
          )}

        </div>
      </div>

      {/* MODAL / DRAWER FOR KEYBOARD MAPPING VIEWER */}
      {selectedCand && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" id="mapping-viewer-modal">
          <div className="bg-[#0A0A0C] border border-white/5 rounded-3xl max-w-4xl w-full overflow-hidden shadow-2xl relative">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#141418]">
              <div>
                <span className="text-[10px] uppercase font-mono text-indigo-400 tracking-widest">Remapping Viewer</span>
                <h3 className="text-lg font-light text-white mt-0.5">Scrambled Layout for {selectedCand.name}</h3>
                <p className="text-xs text-slate-500 font-mono">Unique Identifier: @{selectedCand.username}</p>
              </div>
              <button
                onClick={() => setSelectedCand(null)}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer text-xs font-mono"
                id="close-mapping-modal"
              >
                ✖ Close
              </button>
            </div>

            {/* Modal Body: Renders KeyboardVisualizer with mappings */}
            <div className="p-6 bg-[#0A0A0C]">
              <KeyboardVisualizer mapping={selectedCand.keyboardMapping} />
              
              <div className="mt-4 bg-[#141418] border border-white/5 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs leading-relaxed">
                <div>
                  <span className="text-slate-500 block">Competition State:</span>
                  <span className="font-semibold text-white uppercase font-mono">
                    {selectedCand.completedAt ? "Completed" : selectedCand.hasStarted ? `Playing - Level ${selectedCand.currentLevel}` : "Waiting"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Current Score:</span>
                  <span className="font-semibold text-white font-mono">{selectedCand.score} / 20 points</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Elapsed Timing:</span>
                  <span className="font-semibold text-white font-mono">
                    {Math.floor(selectedCand.elapsedSeconds / 60)}m {selectedCand.elapsedSeconds % 60}s
                  </span>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => handleRemapCandidate(selectedCand.id)}
                    disabled={selectedCand.hasStarted && !selectedCand.completedAt}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-semibold rounded-lg border border-indigo-500/20 text-[10px] transition-all cursor-pointer"
                    id="modal-regenerate-mapping-btn"
                  >
                    Regenerate Mapping
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print helpers footer */}
      <footer className="text-center text-[10px] text-slate-600 font-mono mt-auto py-4 border-t border-white/5">
        AI & ML EVENT ADMINISTRATION MODULE • VERSION 2026.1
      </footer>
    </div>
  );
}
