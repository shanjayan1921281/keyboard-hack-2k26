/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import AdminPanel from "./components/AdminPanel";
import CandidatePanel from "./components/CandidatePanel";
import { LogIn, ShieldAlert, KeyRound, User, Lock } from "lucide-react";
import { motion } from "motion/react";
import { safeJson } from "./lib/api";

interface UserProfile {
  id: string;
  name: string;
  username: string;
  role: "admin" | "candidate";
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("kh_token"));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Login form states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Verify current token on boot
  const verifyToken = async (authToken: string) => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const profile = await safeJson(res);
        setUser(profile);
      } else {
        // Token invalid or expired
        handleLogout();
      }
    } catch (err) {
      handleLogout();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      verifyToken(token);
    } else {
      setLoading(false);
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (!username.trim() || !password.trim()) {
      setErrorMsg("Please enter both username and password.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await safeJson(res);
      localStorage.setItem("kh_token", data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (err: any) {
      setErrorMsg(err.message || "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {}
    }
    localStorage.removeItem("kh_token");
    setToken(null);
    setUser(null);
    setUsername("");
    setPassword("");
    setErrorMsg("");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0A0A0C] text-slate-100 font-sans gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 font-mono text-xs tracking-widest uppercase">LOADING HOST SYSTEM MODULE...</p>
      </div>
    );
  }

  // If authenticated, route to appropriate cockpit
  if (token && user) {
    if (user.role === "admin") {
      return <AdminPanel token={token} onLogout={handleLogout} />;
    } else {
      return <CandidatePanel token={token} onLogout={handleLogout} />;
    }
  }

  // Render Login Panel
  return (
    <div className="min-h-screen bg-[#0A0A0C] text-slate-100 flex flex-col justify-between p-6 relative overflow-hidden font-sans" id="login-container">
      {/* Background soft glow */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-500/5 rounded-full filter blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-600/5 rounded-full filter blur-3xl pointer-events-none" />

      {/* Decorative subtle cyber grid in background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Title Header */}
      <header className="flex justify-between items-center border-b border-white/5 pb-4 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center font-bold text-white text-base">
            K
          </div>
          <div>
            <span className="font-semibold tracking-widest text-sm text-slate-300">KEYBOARD HACK <span className="text-indigo-400">2026</span></span>
          </div>
        </div>
        <div className="text-[10px] text-slate-500 tracking-widest font-mono uppercase hidden sm:block">
          STATUS: ONLINE • HOST: GATEWAY_SECURE
        </div>
      </header>

      {/* Login Card */}
      <main className="max-w-md w-full mx-auto my-auto z-10">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-[#141418] border border-white/5 p-8 rounded-2xl shadow-2xl relative"
        >
          <div className="text-center mb-8">
            <h1 className="text-2xl font-light text-white tracking-tight uppercase">Security Entry</h1>
            <p className="text-xs text-slate-400 mt-1.5">Sign in to initialize remapped layout channels.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block">Competitor Username</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 text-slate-500" size={16} />
                <input
                  type="text"
                  placeholder="e.g. jdoe2026"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-black/40 border border-white/5 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                  disabled={submitting}
                  id="login-username-input"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block">Secure Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 text-slate-500" size={16} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-black/40 border border-white/5 rounded-lg text-sm text-white placeholder-slate-700 focus:outline-none focus:border-indigo-500 transition-colors"
                  disabled={submitting}
                  id="login-password-input"
                />
              </div>
            </div>

            {/* Error messaging */}
            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2.5 text-xs text-red-400 font-mono animate-pulse">
                <ShieldAlert className="shrink-0 mt-0.5" size={14} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Login button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 mt-6 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold tracking-wider uppercase rounded-full transition-colors shadow-lg active:scale-[0.98] cursor-pointer disabled:opacity-40 text-xs"
              id="login-submit-btn"
            >
              <LogIn size={14} />
              <span>{submitting ? "VERIFYING CREDENTIALS..." : "INITIALIZE CONSOLE"}</span>
            </button>
          </form>

          {/* Quick instructions for Admins */}
          <div className="mt-6 border-t border-white/5 pt-4 text-center">
            <span className="text-[10px] text-slate-500 font-mono">
              Admin credentials: <strong className="text-slate-400 font-semibold">admin</strong> / <strong className="text-slate-400 font-semibold">admin2026</strong>
            </span>
          </div>
        </motion.div>
      </main>

      {/* Footer copyright */}
      <footer className="text-center text-[10px] tracking-widest text-slate-600 font-mono z-10 border-t border-white/5 pt-4">
        © 2026 AI AND MACHINE LEARNING DEPARTMENT • DIGITAL TOURNAMENT MANAGEMENT NETWORK
      </footer>
    </div>
  );
}
