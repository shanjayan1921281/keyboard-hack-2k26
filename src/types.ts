/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum CompetitionStatus {
  WAITING = 'waiting',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
}

export interface CompetitionSettings {
  durationMinutes: number; // default 45
  status: CompetitionStatus;
  startedAt: string | null;
  pausedAt: string | null;
  accumulatedElapsedMs: number;
  level2Words: string[];
  level3Letters: string[];
}

export interface KeyboardMapping {
  [physicalKey: string]: string; // e.g., 'q': 'a', 'Q': 'A'
}

export interface Candidate {
  id: string;
  name: string;
  username: string; // unique
  passwordHash: string;
  isLocked: boolean;
  keyboardMapping: KeyboardMapping;
  
  // Progress & Game State
  hasStarted: boolean;
  startedAt: string | null;
  completedAt: string | null;
  currentLevel: number; // 1, 2, or 3
  
  // Level 1 progress
  level1Text: string; // The text typed so far
  level1Completed: boolean;
  
  // Level 2 progress
  level2WordIndex: number;
  level2Submissions: { word: string; typed: string; isCorrect: boolean }[];
  
  // Level 3 progress
  level3CharIndex: number;
  level3Submissions: { target: string; pressed: string; isCorrect: boolean }[];
  
  // Overall score & time
  score: number; // max 20 (Level 2: 10, Level 3: 10)
  elapsedSeconds: number;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  candidateId: string | 'system' | 'admin';
  candidateName: string;
  action: string;
  details: string;
}

export interface DashboardStats {
  totalCandidates: number;
  completed: number;
  running: number;
  waiting: number;
  locked: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  competitionStatus: CompetitionStatus;
  timeRemainingSeconds: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  username: string;
  score: number;
  level1Completed: boolean;
  level2Correct: number;
  level3Correct: number;
  elapsedSeconds: number;
  completedAt: string | null;
  isLocked: boolean;
  currentLevel: number;
}
