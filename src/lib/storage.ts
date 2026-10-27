import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";
import type { TaskMode } from "./assistant";

export type SavedTask = {
  id: string;
  title: string;
  mode: TaskMode;
  microStep: string;
  createdAt: string;
  completed: boolean;
  reminderTime: string | null; // "HH:mm" (24h)
  reminderAt: string | null;   // ISO string of next occurrence
  estimateMinutes: number | null;
  actualMinutes: number | null;
};

export const getStorageKey = (userId?: string) =>
  userId ? `todo-adhd.tasks.${userId}` : "todo-adhd.tasks.guest";

export async function loadTasksFromStorage(userId?: string): Promise<SavedTask[]> {
  const key = getStorageKey(userId);
  try {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key });
      if (value) {
        return JSON.parse(value) as SavedTask[];
      }
    }
  } catch (err) {
    console.warn("Preferences load error:", err);
  }

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw) as SavedTask[];
    }
  } catch (err) {
    console.warn("localStorage load error:", err);
  }

  return [];
}

export async function saveTasksToStorage(tasks: SavedTask[], userId?: string): Promise<void> {
  const key = getStorageKey(userId);
  const serialized = JSON.stringify(tasks);

  try {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key, value: serialized });
    }
  } catch (err) {
    console.warn("Preferences save error:", err);
  }

  try {
    localStorage.setItem(key, serialized);
  } catch (err) {
    console.warn("localStorage save error:", err);
  }
}

/**
 * Calculates the next occurrence date for a "HH:mm" time.
 * If that time has already passed today, schedules for tomorrow automatically.
 */
export function computeNextOccurrence(timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}
