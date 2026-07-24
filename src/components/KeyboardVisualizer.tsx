/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { KeyboardMapping } from "../types";
import { Volume2, VolumeX } from "lucide-react";

interface KeyboardVisualizerProps {
  mapping: KeyboardMapping;
  highlightedChar?: string; // Optional character to highlight (e.g. for Level 3)
  lastTypedKey?: string; // Last physical key pressed
  hideOutputs?: boolean; // If true, do not display mapped output letters to candidates
}

// QWERTY rows layout
const KEYBOARD_ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
];

export default function KeyboardVisualizer({ 
  mapping, 
  highlightedChar = "", 
  lastTypedKey = "",
  hideOutputs = false
}: KeyboardVisualizerProps) {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Play a typewriter clicking sound using Web Audio API
  const playClickSound = (isSpace = false) => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (isSpace) {
        // Lower tone for spacebar
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.type = "triangle";
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
      } else {
        // High click sound
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
        osc.type = "sine";
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
      }
    } catch (e) {
      // AudioContext fails silently if browser blocks it
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      setActiveKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      playClickSound(e.key === " ");
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      setActiveKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [soundEnabled]);

  // Flash keycap on prop change of lastTypedKey
  useEffect(() => {
    if (lastTypedKey) {
      const cleanKey = lastTypedKey.toLowerCase();
      setActiveKeys((prev) => {
        const next = new Set(prev);
        next.add(cleanKey);
        return next;
      });
      
      const timer = setTimeout(() => {
        setActiveKeys((prev) => {
          const next = new Set(prev);
          next.delete(cleanKey);
          return next;
        });
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [lastTypedKey]);

  return (
    <div className="w-full bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-700/50 p-6 shadow-2xl relative overflow-hidden" id="keyboard-visualizer-container">
      {/* Background glow details */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full filter blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full filter blur-3xl pointer-events-none" />

      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Interactive Remapping Board</h4>
          <p className="text-xs text-slate-500">Press keys to see physical-to-output translation and hear key clicks.</p>
        </div>
        
        {/* Toggle Sound */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            soundEnabled 
              ? "bg-slate-800/80 text-cyan-400 border-cyan-500/30 shadow-lg shadow-cyan-950/20" 
              : "bg-slate-900/50 text-slate-500 border-slate-800"
          }`}
          title={soundEnabled ? "Disable keypress sounds" : "Enable keypress sounds"}
          id="toggle-keyboard-sound"
        >
          {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          <span>{soundEnabled ? "Audio On" : "Muted"}</span>
        </button>
      </div>

      <div className="flex flex-col gap-2 max-w-4xl mx-auto p-4 bg-slate-950/80 rounded-xl border border-slate-800 shadow-inner">
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-center gap-1.5 w-full">
            {/* Shift Row Indentations */}
            {rowIndex === 2 && <div className="w-4 h-10 shrink-0" />}
            {rowIndex === 3 && <div className="w-8 h-10 shrink-0" />}

            {row.map((char) => {
              const output = mapping[char] || char;
              const isActive = activeKeys.has(char);
              
              // Level 3 helper: Highlight key that outputs the target letter
              const isTargetOutput = !hideOutputs && highlightedChar && output.toLowerCase() === highlightedChar.toLowerCase();

              return (
                <div
                  key={char}
                  className={`relative flex flex-col items-center justify-between h-11 w-11 md:h-12 md:w-12 rounded-lg border text-center select-none transition-all duration-75 shadow-md ${
                    isActive
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-400 scale-[0.96] shadow-cyan-950/40 translate-y-0.5"
                      : isTargetOutput
                      ? "bg-purple-600/30 text-purple-300 border-purple-500 animate-pulse ring-2 ring-purple-500/30"
                      : "bg-slate-800/80 text-slate-200 border-slate-700 hover:border-slate-600 hover:bg-slate-700/80"
                  }`}
                  style={{ touchAction: "none" }}
                >
                  {/* Physical label */}
                  {!hideOutputs && (
                    <span className="absolute top-1 left-1.5 text-[10px] font-bold text-slate-400 uppercase">
                      {char}
                    </span>
                  )}
                  
                  {/* Remapped visual */}
                  <span className={`text-sm md:text-base font-extrabold ${hideOutputs ? "mt-2.5" : "mt-3.5"} ${
                    isTargetOutput 
                      ? "text-purple-400 font-black scale-110" 
                      : isActive 
                      ? "text-cyan-400" 
                      : "text-slate-200"
                  }`}>
                    {hideOutputs ? char.toUpperCase() : output.toUpperCase()}
                  </span>

                  {/* Indicator dot */}
                  {isTargetOutput && (
                    <span className="absolute bottom-1 right-1.5 w-1.5 h-1.5 rounded-full bg-purple-400" />
                  )}
                  {isActive && (
                    <span className="absolute bottom-1 right-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                  )}
                </div>
              );
            })}

            {/* Backspace on Row 1 */}
            {rowIndex === 0 && (
              <div className="flex-grow flex h-11 md:h-12 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-500 uppercase px-2 font-medium shrink-0 min-w-16">
                Backspace
              </div>
            )}
            {/* Tab on Row 2 */}
            {rowIndex === 1 && (
              <div className="flex-grow flex h-11 md:h-12 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-500 uppercase px-2 font-medium shrink-0 min-w-12">
                Tab
              </div>
            )}
            {/* Enter on Row 3 */}
            {rowIndex === 2 && (
              <div className="flex-grow flex h-11 md:h-12 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-500 uppercase px-2 font-medium shrink-0 min-w-16">
                Enter
              </div>
            )}
            {/* Shift on Row 4 */}
            {rowIndex === 3 && (
              <div className="flex-grow flex h-11 md:h-12 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-500 uppercase px-2 font-medium shrink-0 min-w-16">
                Shift
              </div>
            )}
          </div>
        ))}

        {/* Spacebar Row */}
        <div className="flex justify-center gap-1.5 w-full mt-1">
          <div className="w-14 h-10 md:h-11 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] text-slate-500 font-bold uppercase">
            Ctrl
          </div>
          <div className="w-12 h-10 md:h-11 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] text-slate-500 font-bold uppercase">
            Alt
          </div>
          <div 
            className={`flex-grow max-w-md h-10 md:h-11 rounded-lg border transition-all duration-75 shadow-md flex items-center justify-center ${
              activeKeys.has(" ")
                ? "bg-cyan-500/20 border-cyan-400 scale-[0.98] translate-y-0.5"
                : "bg-slate-800/80 border-slate-700 hover:bg-slate-700/80"
            }`}
          >
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Space</span>
          </div>
          <div className="w-12 h-10 md:h-11 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] text-slate-500 font-bold uppercase">
            Alt
          </div>
          <div className="w-14 h-10 md:h-11 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] text-slate-500 font-bold uppercase">
            Ctrl
          </div>
        </div>
      </div>

      {/* Quick adaptive helper stats */}
      <div className="mt-4 flex flex-wrap justify-between items-center text-slate-400 text-xs border-t border-slate-800/60 pt-3 px-2">
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-800 border border-slate-700 inline-block" />
            Normal Modifier Keys
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500/20 border border-cyan-500/40 inline-block animate-pulse" />
            {hideOutputs ? "Active Keypress" : "Remapped Keypress"}
          </span>
          {!hideOutputs && highlightedChar && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-purple-600/30 border border-purple-500 inline-block animate-pulse" />
              Target Key for Letter <strong className="text-purple-300 font-black">"{highlightedChar.toUpperCase()}"</strong>
            </span>
          )}
        </div>
        <div className="text-slate-500">
          {hideOutputs ? "* Standard layout view. remap cipher handles translates behind the scenes." : "* Space, backspace, modifiers remain standard mapping."}
        </div>
      </div>
    </div>
  );
}
