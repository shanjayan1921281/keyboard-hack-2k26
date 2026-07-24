/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { ActivityLog } from "../types";
import { Terminal, Shield, User, AlertCircle, Trash2 } from "lucide-react";

interface ActivityLogsProps {
  logs: ActivityLog[];
  onClearLogs?: () => void;
}

export default function ActivityLogs({ logs }: ActivityLogsProps) {
  const [filterAction, setFilterAction] = useState("all");

  const filteredLogs = logs.filter((log) => {
    if (filterAction === "all") return true;
    if (filterAction === "login") return log.action.toLowerCase().includes("login");
    if (filterAction === "submit") return log.action.toLowerCase().includes("complete") || log.action.toLowerCase().includes("submit") || log.action.toLowerCase().includes("challenge");
    if (filterAction === "admin") return log.candidateId === "admin" || log.candidateId === "system";
    return true;
  });

  const getIcon = (action: string, candidateId: string) => {
    if (candidateId === "admin" || candidateId === "system") {
      return <Shield className="text-rose-400 shrink-0" size={14} />;
    }
    if (action.toLowerCase().includes("login")) {
      return <User className="text-cyan-400 shrink-0" size={14} />;
    }
    if (action.toLowerCase().includes("timeout") || action.toLowerCase().includes("lock")) {
      return <AlertCircle className="text-red-400 shrink-0" size={14} />;
    }
    return <Terminal className="text-emerald-400 shrink-0" size={14} />;
  };

  const getLogColorClass = (action: string, candidateId: string) => {
    if (candidateId === "admin" || candidateId === "system") return "text-rose-300 font-bold";
    if (action.toLowerCase().includes("login")) return "text-cyan-300";
    if (action.toLowerCase().includes("timeout") || action.toLowerCase().includes("lock")) return "text-red-400 font-semibold";
    if (action.toLowerCase().includes("complete")) return "text-emerald-300 font-bold";
    return "text-slate-300";
  };

  return (
    <div className="w-full bg-black/80 border border-slate-800 rounded-2xl p-6 shadow-2xl font-mono" id="activity-logs-panel-container">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
            <Terminal className="animate-pulse" size={18} />
            Live Activity Terminal
          </h3>
          <p className="text-xs text-slate-500">Real-time trace logs of all competitor actions and system triggers.</p>
        </div>

        {/* Filter Controls */}
        <div className="flex gap-1.5 self-stretch md:self-auto overflow-x-auto pb-1">
          {["all", "login", "submit", "admin"].map((act) => (
            <button
              key={act}
              onClick={() => setFilterAction(act)}
              className={`px-3 py-1 rounded-md text-xs font-semibold capitalize border transition-all ${
                filterAction === act
                  ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30 shadow-md"
                  : "bg-slate-900/55 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              {act === "all" ? "All Traces" : act === "submit" ? "Submissions" : act}
            </button>
          ))}
        </div>
      </div>

      {/* Terminal View */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 h-64 overflow-y-auto flex flex-col gap-2.5 scrollbar-thin scrollbar-thumb-slate-800 shadow-inner">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 text-xs text-center py-20 italic">
            &gt;_ Waiting for incoming packet streams...
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="flex gap-2 text-xs leading-relaxed border-b border-slate-900/50 pb-1.5 hover:bg-slate-900/10">
              {/* Timestamp */}
              <span className="text-slate-600 shrink-0 select-none">
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </span>

              {/* Icon & Details */}
              <div className="flex gap-1.5 items-start flex-wrap">
                {getIcon(log.action, log.candidateId)}
                <span className="text-emerald-500 font-bold shrink-0">{log.candidateName}:</span>
                <span className="text-slate-500 font-medium shrink-0">[{log.action}]</span>
                <span className={getLogColorClass(log.action, log.candidateId)}>{log.details}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex justify-between items-center text-[10px] text-slate-600">
        <div>&gt;_ TCP INGRESS SECURE NODE [PORT: 3000]</div>
        <div>STREAMS ACTIVE: {filteredLogs.length} BLOCKS</div>
      </div>
    </div>
  );
}
