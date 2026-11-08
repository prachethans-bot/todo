import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";

export type BuddyActivity = "idle" | "focusing" | "break" | "done";
export type BuddyState = "pending" | "active" | "paused" | "removed";

export type LocalBuddy = {
  token: string;
  ownerKey: string;
  ownerName: string;
  state: BuddyState;
  lastCheerId: number;
};

export type BuddyView = {
  ownerName: string;
  state: BuddyState;
  taskLabel: string;
  activity: BuddyActivity;
  sessionId: string;
  cheersUsed: number;
};

export const CHEER_EMOJI = ["👏", "🔥", "💪", "❤️"] as const;
export const MAX_CHEERS_PER_SESSION = 3;
export const buddyAvailable = Boolean(supabase);

const BUDDY_KEY = "todo-adhd.buddy";

function randomToken(bytes = 18): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function loadLocalBuddy(): LocalBuddy | null {
  try {
    const raw = localStorage.getItem(BUDDY_KEY);
    return raw ? (JSON.parse(raw) as LocalBuddy) : null;
  } catch {
    return null;
  }
}

export function saveLocalBuddy(buddy: LocalBuddy | null): void {
  try {
    if (buddy) localStorage.setItem(BUDDY_KEY, JSON.stringify(buddy));
    else localStorage.removeItem(BUDDY_KEY);
  } catch {
    // storage unavailable; buddy simply will not persist
  }
}

export function buildInviteLink(token: string): string {
  const configured = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.replace(/\/$/, "");
  const base = configured || (Capacitor.isNativePlatform() ? "" : window.location.origin);
  return `${base}/?buddy=${token}`;
}

export function inviteTokenFromUrl(): string | null {
  const token = new URLSearchParams(window.location.search).get("buddy");
  return token && /^[a-f0-9]{16,64}$/.test(token) ? token : null;
}

export async function createInvite(ownerName: string): Promise<LocalBuddy | null> {
  if (!supabase) return null;
  const token = randomToken();
  const ownerKey = randomToken();
  const { error } = await supabase.rpc("buddy_create", { p_token: token, p_owner_key: ownerKey, p_name: ownerName });
  if (error) return null;
  const buddy: LocalBuddy = { token, ownerKey, ownerName, state: "pending", lastCheerId: 0 };
  saveLocalBuddy(buddy);
  return buddy;
}

export async function fetchBuddyView(token: string): Promise<BuddyView | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("buddy_view", { p_token: token });
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  if (error || !row) return null;
  return {
    ownerName: String(row.owner_name),
    state: row.state as BuddyState,
    taskLabel: String(row.task_label ?? ""),
    activity: row.activity as BuddyActivity,
    sessionId: String(row.session_id ?? ""),
    cheersUsed: Number(row.cheers_used ?? 0)
  };
}

export async function acceptInvite(token: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("buddy_accept", { p_token: token });
  return !error && data === true;
}

export async function sendCheer(token: string, emoji: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("buddy_cheer", { p_token: token, p_emoji: emoji });
  return !error && data === true;
}

export async function pushBuddyStatus(buddy: LocalBuddy, label: string, activity: BuddyActivity, sessionId: string): Promise<void> {
  if (!supabase) return;
  await supabase.rpc("buddy_push", {
    p_token: buddy.token,
    p_owner_key: buddy.ownerKey,
    p_label: label,
    p_activity: activity,
    p_session: sessionId
  });
}

export async function setBuddyState(buddy: LocalBuddy, state: "active" | "paused" | "removed"): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("buddy_set_state", {
    p_token: buddy.token,
    p_owner_key: buddy.ownerKey,
    p_state: state
  });
  return !error && data === true;
}

export async function pollOwner(buddy: LocalBuddy): Promise<{ state: BuddyState; lastId: number; emojis: string[] } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("buddy_owner_poll", {
    p_token: buddy.token,
    p_owner_key: buddy.ownerKey,
    p_after: buddy.lastCheerId
  });
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  if (error || !row) return null;
  return { state: row.state as BuddyState, lastId: Number(row.last_id ?? 0), emojis: (row.emojis as string[] | null) ?? [] };
}
