/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { KeyboardMapping } from "../types";
import KeyboardVisualizer from "./KeyboardVisualizer";
import { Play, Send, CheckCircle, AlertCircle, Award, Hourglass, Zap, User, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { safeJson } from "../lib/api";

interface CandidatePanelProps {
  token: string;
  onLogout: () => void;
}

interface CandidateState {
  id: string;
  name: string;
  hasStarted: boolean;
  completedAt: string | null;
  currentLevel: number;
  score: number;
  elapsedSeconds: number;
  isLocked: boolean;
  keyboardMapping: KeyboardMapping;
  competitionStatus: string;
  globalRemainingSeconds: number;

  level1Text: string;
  level1Completed: boolean;

  level2WordIndex: number;
  level2TotalWords: number;
  level2CurrentWord: string | null;
  level2CorrectCount: number;

  level3CharIndex: number;
  level3TotalChars: number;
  level3CurrentChar: string | null;
  level3CorrectCount: number;
}

export default function CandidatePanel({ token, onLogout }: CandidatePanelProps) {
  const [candState, setCandState] = useState<CandidateState | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [level2Input, setLevel2Input] = useState("");
  const [lastTypedKey, setLastTypedKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  
  // Feedback states
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [shakeTrigger, setShakeTrigger] = useState(false);

  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial status
  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/candidate/status", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await safeJson(res);
      setCandState(data);
      setErrorMsg("");
    } catch (err: any) {
      setErrorMsg(err.message);
      if (err.message && (err.message.includes("Session expired") || err.message.includes("HTTP Error 403"))) {
        onLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  // Start candidate challenge
  const startChallenge = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/candidate/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      await safeJson(res);
      await fetchStatus();
    } catch (err: any) {
      alert(err.message || "Could not start competition");
    } finally {
      setSubmitting(false);
    }
  };

  // Periodic status and timer synchronization
  useEffect(() => {
    fetchStatus();

    syncIntervalRef.current = setInterval(() => {
      if (candState?.hasStarted && !candState?.completedAt) {
        fetch("/api/candidate/sync-time", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        })
          .then((res) => {
            if (res.status === 403) {
              onLogout();
              return null;
            }
            return safeJson(res);
          })
          .then((data) => {
            if (!data) return;
            setCandState((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                elapsedSeconds: data.elapsedSeconds ?? prev.elapsedSeconds,
                completedAt: data.completedAt ?? prev.completedAt,
                isLocked: data.isLocked ?? prev.isLocked,
                globalRemainingSeconds: data.globalRemainingSeconds ?? prev.globalRemainingSeconds
              };
            });
          })
          .catch(() => {});
      } else {
        // Just keep standard dashboard updated
        fetchStatus().catch(() => {});
      }
    }, 4000);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [token, candState?.hasStarted, candState?.completedAt]);

  // Handle Level 1 keystrokes
  useEffect(() => {
    if (!candState || candState.currentLevel !== 1 || !candState.hasStarted || candState.completedAt) return;

    const handleLevel1KeyPress = async (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
      e.preventDefault();

      const physicalKey = e.key;
      // Remap key
      const mappedValue = candState.keyboardMapping[physicalKey.toLowerCase()] || physicalKey.toLowerCase();
      const upperMapped = mappedValue.toUpperCase();

      setLastTypedKey(physicalKey);

      // Determine next required letter of the alphabet
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const currentProgressLength = candState.level1Text.length;
      const nextRequiredChar = alphabet[currentProgressLength];

      if (upperMapped === nextRequiredChar) {
        // Correct character typed! Append and submit
        const updatedText = candState.level1Text + upperMapped;
        
        setCandState((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            level1Text: updatedText,
            level1Completed: updatedText === alphabet,
            currentLevel: updatedText === alphabet ? 2 : 1
          };
        });

        // Sync with backend
        try {
          const res = await fetch("/api/candidate/submit/level1", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ text: updatedText })
          });
          await safeJson(res);
        } catch (err) {}
      } else {
        // Incorrect character. Wobble!
        setShakeTrigger(true);
        setTimeout(() => setShakeTrigger(false), 300);
      }
    };

    window.addEventListener("keydown", handleLevel1KeyPress);
    return () => window.removeEventListener("keydown", handleLevel1KeyPress);
  }, [candState, token]);

  // Handle Level 2 text input remapping
  const handleLevel2KeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const isModifier = e.ctrlKey || e.altKey || e.metaKey;
    if (
      isModifier ||
      e.key === "Backspace" ||
      e.key === "Enter" ||
      e.key === "Tab" ||
      e.key === "Escape" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowDown" ||
      e.key === "Shift" ||
      e.key === "Control" ||
      e.key === "Alt" ||
      e.key === "Meta" ||
      e.key === "CapsLock"
    ) {
      if (e.key === "Enter") {
        submitLevel2Word();
      }
      return;
    }

    e.preventDefault();

    const originalChar = e.key;
    const isUpper = originalChar === originalChar.toUpperCase() && originalChar !== originalChar.toLowerCase();
    
    // Check mapping
    const remapped = candState?.keyboardMapping[originalChar.toLowerCase()] || originalChar.toLowerCase();
    const finalChar = isUpper ? remapped.toUpperCase() : remapped;

    setLastTypedKey(originalChar);

    // Insert at cursor
    const input = e.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const val = input.value;
    
    const newVal = val.slice(0, start) + finalChar + val.slice(end);
    setLevel2Input(newVal);
    
    setTimeout(() => {
      input.selectionStart = input.selectionEnd = start + finalChar.length;
    }, 0);
  };

  const submitLevel2Word = async () => {
    if (!level2Input.trim() || submitting || !candState) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/candidate/submit/level2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ typedWord: level2Input.trim() })
      });
      const data = await safeJson(res);
      
      // Feedback
      if (data.isCorrect) {
        setFeedback({ type: "success", text: `CORRECT! "${candState.level2CurrentWord}" typed perfectly.` });
      } else {
        setFeedback({ type: "error", text: `WRONG! Typed "${level2Input}" instead of "${candState.level2CurrentWord}"` });
        setShakeTrigger(true);
        setTimeout(() => setShakeTrigger(false), 300);
      }

      setLevel2Input("");
      
      // Update local state
      setCandState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          score: data.score,
          currentLevel: data.currentLevel,
          level2WordIndex: data.level2WordIndex,
          level2CurrentWord: data.level2CurrentWord,
          level2CorrectCount: data.isCorrect ? prev.level2CorrectCount + 1 : prev.level2CorrectCount
        };
      });

      setTimeout(() => setFeedback(null), 2500);

    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Level 3 Letter keystroke listeners
  useEffect(() => {
    if (!candState || candState.currentLevel !== 3 || !candState.hasStarted || candState.completedAt) return;

    const handleLevel3KeyPress = async (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
      e.preventDefault();

      const physicalKey = e.key;
      setLastTypedKey(physicalKey);

      setSubmitting(true);
      try {
        const res = await fetch("/api/candidate/submit/level3", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ pressedKey: physicalKey })
        });
        const data = await safeJson(res);

        if (data.isCorrect) {
          setFeedback({ type: "success", text: `CORRECT KEYBOARD HIT! Physical "${physicalKey.toUpperCase()}" outputs "${candState.level3CurrentChar}"` });
        } else {
          const actualOutput = candState.keyboardMapping[physicalKey.toLowerCase()] || physicalKey.toLowerCase();
          setFeedback({ 
            type: "error", 
            text: `INCORRECT! Physical "${physicalKey.toUpperCase()}" produced "${actualOutput.toUpperCase()}", expected "${candState.level3CurrentChar}"` 
          });
          setShakeTrigger(true);
          setTimeout(() => setShakeTrigger(false), 300);
        }

        setCandState((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            score: data.score,
            completedAt: data.completed ? new Date().toISOString() : null,
            level3CharIndex: data.level3CharIndex,
            level3CurrentChar: data.level3CurrentChar,
            level3CorrectCount: data.isCorrect ? prev.level3CorrectCount + 1 : prev.level3CorrectCount
          };
        });

        setTimeout(() => setFeedback(null), 3000);

      } catch (err) {}
      finally {
        setSubmitting(false);
      }
    };

    window.addEventListener("keydown", handleLevel3KeyPress);
    return () => window.removeEventListener("keydown", handleLevel3KeyPress);
  }, [candState, token]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0A0A0C] text-slate-100 font-sans gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 font-mono text-xs tracking-widest uppercase">CONNECTING TO COMPILER NODE...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0A0A0C] text-white p-6 font-sans gap-4">
        <AlertCircle className="text-indigo-500 animate-bounce" size={48} />
        <h3 className="text-lg font-light tracking-tight">Trace Endpoint Broken</h3>
        <p className="text-slate-400 max-w-md text-center text-xs font-mono">{errorMsg}</p>
        <button onClick={onLogout} className="px-5 py-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 font-medium border border-white/10 transition-colors text-xs">
          Return Login
        </button>
      </div>
    );
  }

  if (!candState) return null;

  // Render Waiting/Start Screen
  if (!candState.hasStarted) {
    const isCompRunning = candState.competitionStatus === "running";
    return (
      <div className="min-h-screen bg-[#0A0A0C] text-white flex flex-col justify-between p-6 md:p-12 relative overflow-hidden font-sans" id="candidate-start-screen">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full filter blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-600/5 rounded-full filter blur-3xl" />

        {/* Top bar */}
        <header className="flex justify-between items-center border-b border-white/5 pb-4 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center font-bold text-white text-base">
              K
            </div>
            <div>
              <span className="font-semibold tracking-widest text-sm text-slate-300">KEYBOARD HACK <span className="text-indigo-400">2026</span></span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 font-mono flex items-center gap-1.5 bg-[#141418] border border-white/5 px-3 py-1.5 rounded-lg">
              <User size={12} className="text-slate-500" />
              {candState.name}
            </span>
            <button onClick={onLogout} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors border border-white/5">
              <LogOut size={14} />
            </button>
          </div>
        </header>

        {/* Center Prompt */}
        <main className="max-w-2xl mx-auto flex flex-col items-center justify-center text-center my-auto z-10 py-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#141418] border border-white/5 p-8 rounded-2xl shadow-2xl w-full"
          >
            <h1 className="text-3xl font-light tracking-tight text-white mb-3">
              Adapt. Translate. Conquer.
            </h1>
            <p className="text-slate-400 text-sm max-w-lg mx-auto mb-6 leading-relaxed">
              Every participant receives a personalized, scrambled QWERTY key mapping. Your spatial muscle memory will be challenged across 3 levels:
            </p>

            {/* Steps Info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left mb-8">
              <div className="bg-black/40 border border-white/5 p-4 rounded-xl">
                <span className="text-[10px] uppercase font-semibold text-indigo-400 tracking-widest font-mono">Level 1</span>
                <h4 className="font-medium text-white text-sm mt-1">Memorization</h4>
                <p className="text-slate-500 text-xs mt-1 leading-normal">Type letters A to Z sequentially to learn physical remapping locations.</p>
              </div>
              <div className="bg-black/40 border border-white/5 p-4 rounded-xl">
                <span className="text-[10px] uppercase font-semibold text-indigo-400 tracking-widest font-mono">Level 2</span>
                <h4 className="font-medium text-white text-sm mt-1">Word Typing</h4>
                <p className="text-slate-500 text-xs mt-1 leading-normal">Type 10 full AI & ML words correctly using your customized board mappings.</p>
              </div>
              <div className="bg-black/40 border border-white/5 p-4 rounded-xl">
                <span className="text-[10px] uppercase font-semibold text-indigo-400 tracking-widest font-mono">Level 3</span>
                <h4 className="font-medium text-white text-sm mt-1">Recognition</h4>
                <p className="text-slate-500 text-xs mt-1 leading-normal">Fast-fire keystrokes! Match 10 targets instantly. Only one key attempt.</p>
              </div>
            </div>

            {/* Timer constraint */}
            <div className="flex items-center justify-center gap-2 mb-6 text-sm text-slate-300 font-mono">
              <Hourglass size={14} className="text-indigo-400 animate-spin" />
              <span>TOTAL LIMIT: <strong>45 MINUTES</strong></span>
            </div>

            {/* Play trigger button */}
            {isCompRunning ? (
              <button
                onClick={startChallenge}
                disabled={submitting}
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold tracking-wider shadow-xl cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                id="start-challenge-btn"
              >
                <Play size={18} fill="currentColor" />
                <span>START CHALLENGE NOW</span>
              </button>
            ) : (
              <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center gap-3 text-left">
                <div className="w-8 h-8 rounded-full bg-[#141418] border border-white/5 flex items-center justify-center shrink-0">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                </div>
                <div>
                  <h5 className="text-xs font-semibold text-amber-500 uppercase font-mono tracking-widest">Waiting for Admin</h5>
                  <p className="text-[11px] text-slate-500">The competition session has not been officially activated by administrators. Keep this page open.</p>
                </div>
              </div>
            )}
          </motion.div>
        </main>

        <footer className="text-center text-[10px] tracking-widest text-slate-600 font-mono mt-auto z-10 border-t border-white/5 pt-4">
          SECURE PROTOCOL CONNECTED • CLOUD ENGINE ACTIVATED • AI & ML DEPT
        </footer>
      </div>
    );
  }

  // Render Gameplay Locked or Account Locked
  if (candState.isLocked) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md bg-[#141418] border border-red-500/10 rounded-2xl p-8 text-center shadow-2xl">
          <AlertCircle className="text-red-500 mx-auto animate-bounce mb-4" size={48} />
          <h2 className="text-xl font-light tracking-tight text-red-400 uppercase">Account Locked</h2>
          <p className="text-slate-400 text-sm mt-3 leading-relaxed">
            Your participant account has been locked by the competition administrator. Please approach the registration desk or raise your hand for assistance.
          </p>
          <button onClick={onLogout} className="mt-6 px-6 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-medium rounded-full border border-white/10 text-xs transition-colors">
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  // Render Finished/Submission Screen
  if (candState.completedAt) {
    const minutesUsed = Math.floor(candState.elapsedSeconds / 60);
    const secondsUsed = candState.elapsedSeconds % 60;
    
    return (
      <div className="min-h-screen bg-[#0A0A0C] text-white flex flex-col justify-between p-6 relative overflow-hidden" id="candidate-completed-screen">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full filter blur-3xl pointer-events-none" />

        <header className="flex justify-between items-center border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold tracking-widest text-sm text-slate-300">KEYBOARD HACK <span className="text-indigo-400">2026</span></span>
          </div>
          <button onClick={onLogout} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-slate-400 hover:text-white transition-colors">
            <LogOut size={12} />
            <span>Sign Out</span>
          </button>
        </header>

        <main className="max-w-xl mx-auto my-auto text-center z-10">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#141418] border border-white/5 p-8 rounded-2xl shadow-2xl"
          >
            <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
              <Award className="text-indigo-400" size={32} />
            </div>

            <h1 className="text-2xl font-light tracking-tight text-white animate-pulse">Challenge Completed!</h1>
            <p className="text-slate-400 text-sm mt-2">Your results have been securely recorded in the database.</p>

            {/* Scoreboard Cards */}
            <div className="grid grid-cols-2 gap-4 my-8">
              <div className="bg-black/40 border border-white/5 p-4 rounded-xl text-center">
                <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest block mb-1">Final Score</span>
                <span className="text-4xl font-light text-indigo-400 font-mono">{candState.score}</span>
                <span className="text-xs text-slate-600 block">/ 20 points</span>
              </div>
              <div className="bg-black/40 border border-white/5 p-4 rounded-xl text-center">
                <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest block mb-1">Time Elapsed</span>
                <span className="text-4xl font-light text-indigo-400 font-mono">
                  {minutesUsed}m {secondsUsed}s
                </span>
                <span className="text-xs text-slate-600 block">Total Duration</span>
              </div>
            </div>

            <div className="bg-black/20 border border-white/5 rounded-xl p-4 text-left text-xs mb-6 text-slate-400 space-y-2">
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span>Level 1 (Keyboard Learning):</span>
                <span className="text-indigo-400 font-medium">Passed</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span>Level 2 (Word Typing):</span>
                <span className="text-white font-medium font-mono">{candState.level2CorrectCount} / {candState.level2TotalWords} Correct</span>
              </div>
              <div className="flex justify-between">
                <span>Level 3 (Letter Hit):</span>
                <span className="text-white font-medium font-mono">{candState.level3CorrectCount} / {candState.level3TotalChars} Correct</span>
              </div>
            </div>

            <p className="text-xs text-slate-500">Wait for the competition to close to check final rankings on the main display leaderboard!</p>
          </motion.div>
        </main>

        <footer className="text-center text-[10px] tracking-widest text-slate-600 font-mono mt-auto py-4 border-t border-white/5">
          COMPILER RUNTIME OK • DIGITAL HACK 2026
        </footer>
      </div>
    );
  }

  // Calculate local timers
  const totalDurationSeconds = candState.elapsedSeconds;
  const gameRemainingSeconds = Math.max(0, 45 * 60 - totalDurationSeconds);
  const minutesLeft = Math.floor(gameRemainingSeconds / 60);
  const secondsLeft = gameRemainingSeconds % 60;

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-slate-100 flex flex-col justify-between p-4 md:p-6 font-sans relative overflow-hidden" id="candidate-gameplay-dashboard">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 rounded-full filter blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-600/5 rounded-full filter blur-3xl pointer-events-none" />

      {/* Header Dashboard */}
      <header className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-[#141418] border border-white/5 rounded-2xl p-4 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-indigo-600 flex items-center justify-center font-bold text-white text-base">
            K
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-white tracking-wide text-sm">{candState.name}</h2>
              <span className="text-[10px] font-mono bg-indigo-950/60 text-indigo-400 border border-indigo-900/30 px-2 py-0.5 rounded">
                Active Player
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">Level {candState.currentLevel}: {
              candState.currentLevel === 1 ? "Keyboard Learning" : candState.currentLevel === 2 ? "Word typing challenge" : "Letter recognition challenge"
            }</p>
          </div>
        </div>

        {/* HUD Statistics */}
        <div className="flex flex-wrap items-center gap-4 md:gap-8 bg-black/40 rounded-xl px-4 py-2 border border-white/5 justify-between">
          <div className="text-center">
            <span className="text-[9px] text-slate-500 font-mono uppercase block">Total Points</span>
            <span className="text-lg font-light text-indigo-400 font-mono">{candState.score} <span className="text-[10px] text-slate-500">/ 20</span></span>
          </div>

          <div className="text-center border-l border-white/5 pl-4 md:pl-8">
            <span className="text-[9px] text-slate-500 font-mono uppercase block">Competition Timer</span>
            <span className={`text-lg font-light font-mono flex items-center gap-1.5 justify-center ${gameRemainingSeconds < 300 ? "text-red-400 animate-pulse" : "text-white"}`}>
              <Hourglass size={14} className="text-indigo-400 shrink-0" />
              {minutesLeft}:{secondsLeft < 10 ? `0${secondsLeft}` : secondsLeft}
            </span>
          </div>

          <div className="text-center border-l border-white/5 pl-4 md:pl-8">
            <span className="text-[9px] text-slate-500 font-mono uppercase block">Level Progress</span>
            <span className="text-xs font-semibold text-slate-300 font-mono block mt-1">
              {candState.currentLevel === 1 && `${candState.level1Text.length} / 26 chars`}
              {candState.currentLevel === 2 && `${candState.level2WordIndex} / ${candState.level2TotalWords} words`}
              {candState.currentLevel === 3 && `${candState.level3CharIndex} / ${candState.level3TotalChars} letters`}
            </span>
          </div>
        </div>
      </header>

      {/* Main Gameplay Canvas */}
      <main className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-6 my-6 items-stretch z-10">
        
        {/* Core Stage */}
        <div className="lg:col-span-2 flex flex-col justify-between bg-[#141418] border border-white/5 rounded-2xl p-6 relative overflow-hidden" id="core-gameplay-stage">
          {/* Subtle Stage lines */}
          <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent" />

          {/* Level Instructions banner */}
          <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
            <div>
              <span className="text-[10px] uppercase font-semibold text-indigo-400 font-mono tracking-wider">Active Stage</span>
              <h3 className="text-base font-light text-white">
                {candState.currentLevel === 1 && "Level 1: Alphabet Sync Mode"}
                {candState.currentLevel === 2 && "Level 2: Dynamic Word Typing"}
                {candState.currentLevel === 3 && "Level 3: Instantaneous Keystroke Recognition"}
              </h3>
            </div>
            <div className="text-xs text-slate-500 font-mono bg-black/40 px-3 py-1 rounded-lg border border-white/5">
              Level {candState.currentLevel} of 3
            </div>
          </div>

          {/* Core Interactive Frame (Dynamic based on Levels) */}
          <div className={`flex-grow flex flex-col items-center justify-center py-6 px-4 ${shakeTrigger ? "animate-[shake_0.3s_ease-in-out]" : ""}`}>
            <AnimatePresence mode="wait">
              
              {/* Level 1 Alphabet Learning */}
              {candState.currentLevel === 1 && (
                <motion.div
                  key="level1"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-xl text-center space-y-6"
                >
                  <div>
                    <span className="text-[10px] font-mono tracking-widest text-slate-400 bg-black/40 px-3 py-1.5 rounded-full border border-white/5">
                      TYPE SEQUENTIALLY FROM A TO Z
                    </span>
                    <h2 className="text-xl font-light mt-4 text-white">Alphabet Synchronization Challenge</h2>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Find and press the physical keys on your keyboard that produce each letter in order. Type sequential letters to unlock Level 2.
                    </p>
                  </div>

                  {/* Alphabet Display row */}
                  <div className="flex flex-wrap justify-center gap-1.5 py-4 px-2 bg-black/40 rounded-xl border border-white/5 shadow-inner">
                    {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter, idx) => {
                      const isTyped = idx < candState.level1Text.length;
                      const isNext = idx === candState.level1Text.length;

                      return (
                        <span
                          key={letter}
                          className={`w-8 h-8 rounded flex items-center justify-center text-xs font-medium transition-all border ${
                            isTyped
                              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400 font-bold"
                              : isNext
                              ? "bg-indigo-600 text-white border-indigo-400 scale-110 font-bold shadow-lg shadow-indigo-950/40 animate-pulse"
                              : "bg-white/5 border-white/5 text-slate-600"
                          }`}
                        >
                          {letter}
                        </span>
                      );
                    })}
                  </div>

                  <div className="text-xs text-slate-400 bg-black/40 rounded-lg p-3 inline-block border border-white/5">
                    Next Target Keystroke: <strong className="text-indigo-400 font-mono text-sm uppercase">"{"ABCDEFGHIJKLMNOPQRSTUVWXYZ"[candState.level1Text.length]}"</strong>
                  </div>
                </motion.div>
              )}

              {/* Level 2 Word typing challenge */}
              {candState.currentLevel === 2 && (
                <motion.div
                  key="level2"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-lg space-y-6 text-center"
                >
                  <span className="text-[10px] font-mono tracking-widest text-slate-400 bg-black/40 px-3 py-1.5 rounded-full border border-white/5">
                    WORD {candState.level2WordIndex + 1} OF {candState.level2TotalWords}
                  </span>

                  <div>
                    <h5 className="text-xs font-medium text-slate-500 uppercase tracking-widest">Type This Target Word:</h5>
                    <div className="text-3xl md:text-4xl font-light text-white tracking-wide mt-2 font-mono">
                      {candState.level2CurrentWord}
                    </div>
                  </div>

                  {/* Custom Intercept Input Field */}
                  <div className="relative">
                    <input
                      type="text"
                      value={level2Input}
                      onKeyDown={handleLevel2KeyDown}
                      onChange={() => {}} // Disabled normal typing flow
                      placeholder="Type using remapped physical keys..."
                      className="w-full text-center px-4 py-3 bg-black/40 border border-white/5 rounded-xl text-lg font-mono tracking-widest text-indigo-400 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors shadow-inner"
                      autoFocus
                      disabled={submitting}
                      id="level2-word-input"
                    />
                    
                    <button
                      onClick={submitLevel2Word}
                      disabled={!level2Input.trim() || submitting}
                      className="absolute right-2.5 top-2.5 p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-colors text-white cursor-pointer"
                      id="level2-submit-btn"
                    >
                      <Send size={14} />
                    </button>
                  </div>

                  {/* Feedback indicator */}
                  <div className="h-6">
                    {feedback && (
                      <span className={`text-xs font-medium font-mono px-3 py-1 rounded-full ${
                        feedback.type === "success" ? "text-emerald-400 bg-emerald-950/40 border border-emerald-900/30" : "text-red-400 bg-red-950/40 border border-red-900/30"
                      }`}>
                        {feedback.text}
                      </span>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Level 3 Letter Hit */}
              {candState.currentLevel === 3 && (
                <motion.div
                  key="level3"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-lg space-y-6 text-center"
                >
                  <span className="text-[10px] font-mono tracking-widest text-slate-400 bg-black/40 px-3 py-1.5 rounded-full border border-white/5">
                    LETTER {candState.level3CharIndex + 1} OF {candState.level3TotalChars} • SINGLE ATTEMPT
                  </span>

                  <div>
                    <h5 className="text-xs font-medium text-slate-500 uppercase tracking-widest">Find and Press Key to Output:</h5>
                    <div className="text-6xl md:text-7xl font-light text-indigo-400 mt-2 font-mono drop-shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                      {candState.level3CurrentChar}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-normal">
                    Press any physical key. If its remapped translation matches the target above, you score 1 point. Only one key attempt is allowed!
                  </p>

                  {/* Feedback indicator */}
                  <div className="h-6">
                    {feedback && (
                      <span className={`text-xs font-medium font-mono px-3 py-1 rounded-full ${
                        feedback.type === "success" ? "text-emerald-400 bg-emerald-950/40 border border-emerald-900/30" : "text-red-400 bg-red-950/40 border border-red-900/30"
                      }`}>
                        {feedback.text}
                      </span>
                    )}
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* Level Progression Indicator Bar */}
          <div className="border-t border-white/5 pt-4 mt-6">
            <div className="flex justify-between items-center text-[10px] text-slate-500 mb-1.5 uppercase font-mono tracking-wider">
              <span>Overall Competition Progress</span>
              <span>
                {Math.round(
                  ((candState.level1Text.length / 26 * 0.3) + 
                  (candState.level2WordIndex / candState.level2TotalWords * 0.4) + 
                  (candState.level3CharIndex / candState.level3TotalChars * 0.3)) * 100
                )}% Done
              </span>
            </div>
            
            {/* Custom Multi-Segment Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-black/40 overflow-hidden flex border border-white/5">
              {/* Segment 1: Level 1 Progress */}
              <div 
                className="bg-indigo-800 h-full transition-all duration-300 border-r border-black/40"
                style={{ width: `${(candState.level1Text.length / 26) * 33.3}%` }}
              />
              {/* Segment 2: Level 2 Progress */}
              <div 
                className="bg-indigo-600 h-full transition-all duration-300 border-r border-black/40"
                style={{ width: `${(candState.level2WordIndex / candState.level2TotalWords) * 33.3}%` }}
              />
              {/* Segment 3: Level 3 Progress */}
              <div 
                className="bg-indigo-400 h-full transition-all duration-300"
                style={{ width: `${(candState.level3CharIndex / candState.level3TotalChars) * 33.3}%` }}
              />
            </div>
          </div>
        </div>

        {/* Live helper panels */}
        <div className="flex flex-col gap-6 justify-between items-stretch">
          
          {/* Active Level instructions */}
          <div className="bg-[#141418] border border-white/5 p-5 rounded-2xl relative overflow-hidden flex flex-col gap-3">
            <div className="absolute top-0 right-0 p-3 bg-indigo-500/10 rounded-bl-xl text-indigo-400">
              <Zap size={16} />
            </div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">Mission Briefing</h4>
            
            <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
              {candState.currentLevel === 1 && (
                <>
                  <p>• Press physical keys one by one. Find which keys are remapped to match the glowing target letter.</p>
                  <p>• If you hit the correct physical key, the alphabet advances.</p>
                  <p>• <strong>Tip:</strong> Look at the Keyboard Board below. When you type, keycaps flash so you can map out and memorize your key scrambled positions.</p>
                </>
              )}
              {candState.currentLevel === 2 && (
                <>
                  <p>• Type the exact word displayed on screen into the input field.</p>
                  <p>• Your keystrokes are intercepted and automatically translated using your remapped keyboard mapping.</p>
                  <p>• Press <strong>Enter</strong> or click the submit icon once you have translated and typed the full word. Word correctness awards 1 point.</p>
                </>
              )}
              {candState.currentLevel === 3 && (
                <>
                  <p>• Letter recognition is a fast-fire test of spatial layout memory.</p>
                  <p>• Press the single physical key on your keyboard that outputs the displayed target letter.</p>
                  <p>• You only get <strong>one attempt per character</strong>. Pressing a key immediately submits it and advances to the next.</p>
                </>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* Interactive Remapped Board component */}
      <footer className="w-full z-10">
        <KeyboardVisualizer 
          mapping={candState.keyboardMapping} 
          highlightedChar={candState.currentLevel === 3 ? (candState.level3CurrentChar || "") : ""} 
          lastTypedKey={lastTypedKey}
          hideOutputs={true}
        />
      </footer>

      {/* Keyframe shake helper styling */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
