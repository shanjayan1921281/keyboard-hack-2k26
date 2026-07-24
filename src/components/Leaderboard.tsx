/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { LeaderboardEntry } from "../types";
import { Search, Trophy, Download, FileText, CheckCircle2, RefreshCw } from "lucide-react";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  onRefresh?: () => void;
  isAdmin?: boolean;
}

export default function Leaderboard({ entries, onRefresh, isAdmin = false }: LeaderboardProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLevel, setFilterLevel] = useState<string>("all");

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch = 
      entry.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.username.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (filterLevel === "all") return matchesSearch;
    if (filterLevel === "completed") return matchesSearch && entry.completedAt !== null;
    if (filterLevel === "running") return matchesSearch && entry.currentLevel > 0 && !entry.completedAt;
    if (filterLevel === "level1") return matchesSearch && entry.currentLevel === 1 && !entry.completedAt;
    if (filterLevel === "level2") return matchesSearch && entry.currentLevel === 2 && !entry.completedAt;
    if (filterLevel === "level3") return matchesSearch && entry.currentLevel === 3 && !entry.completedAt;
    
    return matchesSearch;
  });

  // Export Leaderboard to CSV (Excel-compatible)
  const exportToCSV = () => {
    const headers = ["Rank", "Name", "Username", "Score (Max 20)", "Level 1 Completed", "Level 2 Score (Max 10)", "Level 3 Score (Max 10)", "Elapsed Time (Sec)", "Status"];
    const rows = entries.map((entry, idx) => [
      idx + 1,
      entry.name,
      entry.username,
      entry.score,
      entry.level1Completed ? "Yes" : "No",
      entry.level2Correct,
      entry.level3Correct,
      entry.elapsedSeconds,
      entry.completedAt ? "Completed" : entry.currentLevel > 1 ? `Level ${entry.currentLevel}` : "Level 1"
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Keyboard_Hack_2026_Leaderboard_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to PDF (Triggers structured layout print style)
  const printLeaderboard = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const html = `
      <html>
        <head>
          <title>Keyboard Hack 2026 - Leaderboard Report</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; }
            h1 { text-align: center; margin-bottom: 5px; color: #0f172a; }
            h3 { text-align: center; margin-top: 0; font-weight: normal; color: #64748b; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #0f172a; color: #ffffff; text-align: left; padding: 12px; font-weight: 600; }
            td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
            .badge-completed { background-color: #dcfce7; color: #15803d; }
            .badge-running { background-color: #fef9c3; color: #a16207; }
            .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #94a3b8; border-t: 1px solid #e2e8f0; padding-top: 20px; }
          </style>
        </head>
        <body>
          <h1>Keyboard Hack 2026</h1>
          <h3>Official AI & ML Department Competition Results</h3>
          <p><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Total Competitors:</strong> ${entries.length}</p>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Competitor</th>
                <th>Username</th>
                <th>Score</th>
                <th>L1 Status</th>
                <th>L2 Word Score</th>
                <th>L3 Letter Score</th>
                <th>Time Elapsed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${entries.map((entry, idx) => `
                <tr>
                  <td><strong>#${idx + 1}</strong></td>
                  <td>${entry.name}</td>
                  <td>${entry.username}</td>
                  <td><strong>${entry.score} pts</strong></td>
                  <td>${entry.level1Completed ? "✓ Done" : "—"}</td>
                  <td>${entry.level2Correct} / 10</td>
                  <td>${entry.level3Correct} / 10</td>
                  <td>${Math.floor(entry.elapsedSeconds / 60)}m ${entry.elapsedSeconds % 60}s</td>
                  <td>
                    <span class="badge ${entry.completedAt ? 'badge-completed' : 'badge-running'}">
                      ${entry.completedAt ? 'Completed' : `Active - Level ${entry.currentLevel}`}
                    </span>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <div class="footer">
            © 2026 AI and Machine Learning Department • Keyboard Hack Competition System
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="w-full bg-[#141418] border border-white/5 rounded-2xl p-6 shadow-xl" id="leaderboard-panel-container">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h3 className="text-xl font-light text-white flex items-center gap-2">
            <Trophy className="text-indigo-400" size={22} />
            Leaderboard Rankings
          </h3>
          <p className="text-xs text-slate-400">Live competitor standing sorted by score, then by speed.</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 w-full md:w-auto">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 transition-colors cursor-pointer"
              title="Refresh Leaderboard"
              id="refresh-leaderboard-btn"
            >
              <RefreshCw size={16} />
            </button>
          )}
          {isAdmin && (
            <>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 font-semibold text-xs border border-white/10 transition-colors cursor-pointer"
                id="export-csv-btn"
              >
                <Download size={14} />
                <span>Excel Export</span>
              </button>
              <button
                onClick={printLeaderboard}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 font-semibold text-xs border border-white/10 transition-colors cursor-pointer"
                id="export-pdf-btn"
              >
                <FileText size={14} />
                <span>PDF Print</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
          <input
            type="text"
            placeholder="Search competitor by name or username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-black/40 rounded-xl border border-white/5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors font-sans"
            id="leaderboard-search-input"
          />
        </div>
        <div>
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="w-full px-3 py-2 bg-black/40 rounded-xl border border-white/5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors font-sans"
            id="leaderboard-filter-select"
          >
            <option value="all">Filter: All Candidates</option>
            <option value="completed">Status: Completed</option>
            <option value="running">Status: Currently Playing</option>
            <option value="level1">Active Level 1 (Learning)</option>
            <option value="level2">Active Level 2 (Words)</option>
            <option value="level3">Active Level 3 (Letters)</option>
          </select>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/20">
        <table className="w-full text-left text-sm text-slate-300 border-collapse">
          <thead>
            <tr className="bg-black/40 border-b border-white/5 text-slate-400 font-semibold text-[10px] uppercase tracking-wider font-mono">
              <th className="py-3 px-4 text-center">Rank</th>
              <th className="py-3 px-4">Competitor</th>
              <th className="py-3 px-4 text-center">Current Status</th>
              <th className="py-3 px-4 text-center">Level 1</th>
              <th className="py-3 px-4 text-center">Level 2</th>
              <th className="py-3 px-4 text-center">Level 3</th>
              <th className="py-3 px-4 text-center">Elapsed Time</th>
              <th className="py-3 px-4 text-right">Total Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500 text-xs italic">
                  No competitors match the search or filter rules.
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry, idx) => {
                const globalIdx = entries.findIndex(e => e.id === entry.id);
                const rank = globalIdx + 1;
                
                // Medal Styling
                let rankVisual: React.ReactNode = `#${rank}`;
                if (rank === 1) rankVisual = <span className="flex items-center justify-center w-6 h-6 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold text-xs mx-auto">🏆 1</span>;
                if (rank === 2) rankVisual = <span className="flex items-center justify-center w-6 h-6 rounded bg-slate-300/10 text-slate-300 border border-slate-300/20 font-bold text-xs mx-auto">🥈 2</span>;
                if (rank === 3) rankVisual = <span className="flex items-center justify-center w-6 h-6 rounded bg-indigo-700/10 text-indigo-300 border border-indigo-700/20 font-bold text-xs mx-auto">🥉 3</span>;

                return (
                  <tr 
                    key={entry.id} 
                    className={`hover:bg-white/5 text-xs transition-colors ${
                      entry.completedAt ? "bg-white/[0.02]" : ""
                    } ${entry.isLocked ? "opacity-50" : ""}`}
                  >
                    <td className="py-3.5 px-4 text-center font-bold font-mono">{rankVisual}</td>
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="font-semibold text-white flex items-center gap-1.5">
                          {entry.name}
                          {entry.isLocked && (
                            <span className="text-[10px] bg-red-950/80 text-red-400 border border-red-900 px-1.5 py-0.5 rounded">LOCKED</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">@{entry.username}</div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {entry.completedAt ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-900/50 font-mono">
                          <CheckCircle2 size={12} />
                          Finished
                        </span>
                      ) : entry.currentLevel > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-indigo-950/60 text-indigo-400 border border-indigo-900/50 animate-pulse font-mono">
                          Active - L{entry.currentLevel}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-white/5 text-slate-500 border border-white/10 font-mono">
                          Waiting
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`text-xs font-mono ${entry.level1Completed ? "text-emerald-400 font-bold" : "text-slate-600"}`}>
                        {entry.level1Completed ? "Complete" : "In Progress"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-xs">
                      {entry.level2Correct} / 10 Correct
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-xs">
                      {entry.level3Correct} / 10 Correct
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-xs text-slate-400">
                      {Math.floor(entry.elapsedSeconds / 60)}m {entry.elapsedSeconds % 60}s
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="text-base font-semibold text-indigo-400 font-mono">
                        {entry.score}
                      </span>
                      <span className="text-[10px] text-slate-500 block font-mono">/ 20 pts</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
