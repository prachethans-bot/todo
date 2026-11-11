import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  AlarmClock, ArrowRight, Bell, Check, CheckCircle2, ChevronRight, CircleHelp,
  Flame, Pause, Play, Plus, RotateCcw, Share2, Sparkles, Square,
  Trash2, UserRound, X
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { supabase, hasSupabaseConfig } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { buildInviteLink, createInvite, loadLocalBuddy, pushBuddyStatus, saveLocalBuddy, setBuddyState, type LocalBuddy } from "./lib/buddy";

type Task = {
  id: string; title: string; step: string; createdAt: string; completed: boolean;
  reminderAt: string; reminderFired?: boolean; note: string; estimate: number; pointsAwarded?: number;
};
type PlanStep = { id: string; title: string; minutes: number; kind: "setup" | "focus" | "reset" | "wrap"; done: boolean };
type Tab = "today" | "plan" | "buddy";
const STORE = "vinai.fresh.v1";
const pad = (n: number) => String(n).padStart(2, "0");
const localInputDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const fmt = (seconds: number) => `${pad(Math.floor(Math.max(0,seconds)/60))}:${pad(Math.max(0,seconds)%60)}`;
function dayKey(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
function streakFromDays(days: string[]) { const set = new Set(days); const today = new Date(); let cursor = new Date(today); if (!set.has(dayKey(cursor))) cursor.setDate(cursor.getDate()-1); let count = 0; while (set.has(dayKey(cursor))) { count++; cursor.setDate(cursor.getDate()-1); } return count; }
function makeStep(title: string, mode: "NEW_TASK" | "TOO_HARD" = "NEW_TASK") {
  const clean = title.trim();
  if (mode === "TOO_HARD") return clean.length > 18 ? "Look at the first thing you need." : "Move closer to where you’ll begin.";
  const lower = clean.toLowerCase();
  if (/study|math|chapter|read|revise/.test(lower)) return "Pick up the book and open the first page.";
  if (/clean|tidy|room|laundry/.test(lower)) return "Pick up one item that is out of place.";
  if (/email|message|reply/.test(lower)) return "Open the message or email app.";
  if (/write|essay|assignment|project/.test(lower)) return "Open a blank document.";
  return "Put the first thing you need within reach.";
}
function buildPlan(task: string, total: number): PlanStep[] {
  if (total <= 20) {
    const setup = Math.max(2, Math.round(total * .15));
    const wrap = Math.max(1, Math.round(total * .1));
    return [
      { id: crypto.randomUUID(), title: "Get set up", minutes: setup, kind: "setup", done: false },
      { id: crypto.randomUUID(), title: task.trim() || "Work on your task", minutes: total - setup - wrap, kind: "focus", done: false },
      { id: crypto.randomUUID(), title: "Save your place", minutes: wrap, kind: "wrap", done: false }
    ];
  }
  const setup = Math.max(3, Math.round(total * .08));
  const wrap = Math.max(3, Math.round(total * .06));
  const reset = Math.max(3, Math.round(total * .08));
  const focus = total - setup - wrap - reset;
  const first = Math.round(focus * .55);
  return [
    { id: crypto.randomUUID(), title: "Set up your space", minutes: setup, kind: "setup", done: false },
    { id: crypto.randomUUID(), title: `Start: ${task.trim() || "your task"}`, minutes: first, kind: "focus", done: false },
    { id: crypto.randomUUID(), title: "Take a small reset", minutes: reset, kind: "reset", done: false },
    { id: crypto.randomUUID(), title: "Continue one more part", minutes: focus-first, kind: "focus", done: false },
    { id: crypto.randomUUID(), title: "Save your next step", minutes: wrap, kind: "wrap", done: false }
  ];
}

function ZapIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 10-13h-7z" fill="currentColor"/></svg>}
function ChartIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V11h4v8M10 19V5h4v14M16 19v-9h4v9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>}
function StarIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3 6.2 6.8 1-4.9 4.8 1.2 6.8L12 17.6l-6.1 3.2 1.2-6.8-4.9-4.8 6.8-1z" fill="currentColor"/></svg>}
function SunIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1m0-15.6-2.1 2.1M6.3 17.7l-2.1 2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
function CalendarIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h3m3 0h3m-9 3h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
function HomeIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" fill="currentColor"/></svg>}
function ClockIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 6v6l4 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
function UsersIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5" fill="currentColor"/><path d="M2 20c0-3.5 2.8-6 7-6s7 2.5 7 6M16 5a3.5 3.5 0 0 1 0 6.8M18 14c2.5.8 4 2.7 4 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    try { const saved = localStorage.getItem(STORE); return saved ? JSON.parse(saved).tasks ?? [] : []; }
    catch { return []; }
  });
  const [points, setPoints] = useState(() => { try { return Number(JSON.parse(localStorage.getItem(STORE) || "{}").points ?? 0); } catch { return 120; } });
  const [activityDays, setActivityDays] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(STORE) || "{}").activityDays ?? []; } catch { return []; } });
  const [tab, setTab] = useState<Tab>("today");
  const [title, setTitle] = useState("");
  const [reminder, setReminder] = useState("");
  const [focusTask, setFocusTask] = useState<string | null>(null);
  const [focusMinutes, setFocusMinutes] = useState(15);
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const [focusNote, setFocusNote] = useState("");
  const [planText, setPlanText] = useState("");
  const [planMinutes, setPlanMinutes] = useState(45);
  const [planSteps, setPlanSteps] = useState<PlanStep[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planRunning, setPlanRunning] = useState(false);
  const [planRemaining, setPlanRemaining] = useState(0);
  const [buddyName, setBuddyName] = useState("");
  const [localBuddy, setLocalBuddy] = useState<LocalBuddy | null>(() => loadLocalBuddy());
  const [buddyLink, setBuddyLink] = useState("");
  const [buddySessionId, setBuddySessionId] = useState("");
  const [toast, setToast] = useState("");
  const [rewardBurst, setRewardBurst] = useState(false);
  const [slidingTaskId, setSlidingTaskId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const completed = tasks.filter(t => t.completed).length;
  const streak = streakFromDays(activityDays);
  const openTasks = tasks.filter(t => !t.completed);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" });
  const activeTask = tasks.find(t => t.id === focusTask);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) { setSession(data.session); setAuthReady(true); }
    }).catch(() => { if (alive) setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (hasSupabaseConfig && !session) { setTasks([]); return; }
    if (!supabase || !session?.user.id) return;
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
      if (!alive) return;
      if (error) { setToast("Could not load your cloud tasks. Your saved data is still on this device."); return; }
      setTasks((data ?? []).map((row: any) => ({
        id: String(row.id), title: String(row.title), step: String(row.micro_step),
        createdAt: String(row.created_at), completed: Boolean(row.completed),
        reminderAt: row.reminder_at ? localInputDate(new Date(row.reminder_at)) : "",
        note: String(row.progress_note ?? ""), estimate: Number(row.estimate_minutes ?? 15), pointsAwarded: Number(row.points_awarded ?? 0)
      })));
    })();
    return () => { alive = false; };
  }, [session?.user.id]);

  useEffect(() => {
    localStorage.setItem(STORE, JSON.stringify({ ...(session ? {} : { tasks }), points, activityDays }));
  }, [tasks, points, activityDays, session]);
  useEffect(() => {
    if (!running && !planRunning) return;
    const id = window.setInterval(() => {
      if (running) setRemaining(v => { if (v <= 1) { setRunning(false); setToast("Your focus time is complete. Any progress counts."); return 0; } return v - 1; });
      if (planRunning) setPlanRemaining(v => { if (v <= 1) { setPlanRunning(false); setToast("This step is complete. Your place is saved."); return 0; } return v - 1; });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, planRunning]);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const checkDue = () => {
      const due = tasks.filter(t => !t.completed && t.reminderAt && !t.reminderFired && new Date(t.reminderAt).getTime() <= Date.now());
      if (!due.length) return;
      const dueIds = new Set(due.map(t => t.id));
      setTasks(current => current.map(t => dueIds.has(t.id) ? { ...t, reminderFired: true } : t));
      for (const task of due) {
        setToast(`A small step is waiting: ${task.title}`);
        if ("Notification" in window && Notification.permission === "granted") {
          try { new Notification("A small step is waiting", { body: task.title }); } catch { /* Browser notification unavailable. */ }
        }
      }
    };
    checkDue();
    const id = window.setInterval(checkDue, 4000);
    return () => window.clearInterval(id);
  }, [tasks]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function scheduleReminder(task: Task) {
    if (!task.reminderAt) return;
    const at = new Date(task.reminderAt);
    if (at.getTime() <= Date.now()) { setToast("Choose a reminder time in the future."); return; }
    if (Capacitor.isNativePlatform()) {
      try {
        const permission = await LocalNotifications.requestPermissions();
        if (permission.display !== "granted") { setToast("Notifications are not enabled on this device."); return; }
        await LocalNotifications.schedule({ notifications: [{ id: Math.floor(Math.random()*2000000000)+1, title: "A small step is waiting", body: task.title, schedule: { at }, extra: { taskId: task.id } }] });
        setToast("Reminder scheduled on this device.");
      } catch { setToast("The reminder could not be scheduled on this device."); }
    } else if ("Notification" in window) {
      try {
        const permission = await Notification.requestPermission();
        setToast(permission === "granted" ? "Reminder saved. Keep this tab open for browser alerts." : "Reminder saved in your task list.");
      } catch { setToast("Reminder saved in your task list."); }
    } else setToast("Reminder saved in your task list.");
  }
  async function askAssistant(task: string, mode: "NEW_TASK" | "TOO_HARD" | "NEXT_STEP" | "TIME_CHECK" = "NEW_TASK") {
    if (!supabase || !session) return makeStep(task, mode === "TOO_HARD" ? "TOO_HARD" : "NEW_TASK");
    try {
      const { data, error } = await supabase.functions.invoke("stepwise-assistant", { body: { task, mode } });
      if (!error && typeof data?.the_micro_step === "string" && data.the_micro_step.trim()) return data.the_micro_step.trim();
    } catch { /* Keep task creation available with a local fallback. */ }
    return makeStep(task, mode === "TOO_HARD" ? "TOO_HARD" : "NEW_TASK");
  }

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setAuthBusy(true); setAuthMessage("");
    try {
      const result = authMode === "signup"
        ? await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword })
        : await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
      if (result.error) setAuthMessage(result.error.message);
      else if (authMode === "signup" && !result.data.session) setAuthMessage("Check your email for the confirmation link, then sign in here.");
      else setAuthMessage("You're signed in. Your tasks are ready.");
    } catch { setAuthMessage("Authentication is temporarily unavailable. Please try again."); }
    finally { setAuthBusy(false); }
  }

  async function addTask(e: FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) { setToast("Add a task name first."); return; }
    const step = await askAssistant(clean, "NEW_TASK");
    let task: Task = { id: crypto.randomUUID(), title: clean, step, createdAt: new Date().toISOString(), completed: false, reminderAt: reminder, reminderFired: false, note: "", estimate: 15 };
    if (supabase && session) {
      const { data, error } = await supabase.from("tasks").insert({
        user_id: session.user.id, title: clean, mode: "NEW_TASK", micro_step: step,
        reminder_at: reminder ? new Date(reminder).toISOString() : null, estimate_minutes: 15
      }).select().single();
      if (error) { setToast("Could not save this task to your account. Please try again."); return; }
      if (data) task = { ...task, id: String(data.id), createdAt: String(data.created_at) };
    }
    setTasks(v => [task, ...v]); setTitle(""); setReminder(""); setToast("Your task is here. Start whenever you’re ready.");
    void scheduleReminder(task);
  }
  function playRewardSound() {
    try {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine"; oscillator.frequency.setValueAtTime(660, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(880, audio.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.035, audio.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.22);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(); oscillator.stop(audio.currentTime + 0.23);
      oscillator.onended = () => void audio.close();
    } catch { /* Sound is optional when audio is unavailable. */ }
  }

  async function completeTask(id: string) {
    const task = tasks.find(t => t.id === id); if (!task || task.completed || slidingTaskId) return;
    setSlidingTaskId(id);
    window.setTimeout(async () => {
    const reward = Math.random() < 0.2 ? 35 : 10;
    setTasks(v => v.map(t => t.id === id ? { ...t, completed: true, pointsAwarded: reward } : t));
    setSlidingTaskId(null);
    setPoints(v => v + reward); setActivityDays(v => [...new Set([...v, dayKey(new Date())])]);
    setRewardBurst(true); window.setTimeout(() => setRewardBurst(false), 650);
    playRewardSound();
    try { navigator.vibrate?.(12); } catch { /* Haptics are optional. */ }
    if (supabase && session) {
      const { error } = await supabase.from("tasks").update({ completed: true, points_awarded: reward }).eq("id", id);
      if (error) setToast("Saved on this device. Cloud update will retry next time.");
    }
    setToast(reward === 35 ? "Bonus win! +10 points and a +25 bonus." : "A small win. +10 points");
    }, 360);
  }
  async function undoTask(id: string) {
    const task = tasks.find(t => t.id === id); if (!task || !task.completed) return;
    const reward = task.pointsAwarded && task.pointsAwarded > 0 ? task.pointsAwarded : 10;
    setTasks(v => v.map(t => t.id === id ? { ...t, completed: false, pointsAwarded: 0 } : t)); setPoints(v => Math.max(0, v - reward));
    if (supabase && session) { const { error } = await supabase.from("tasks").update({ completed: false, points_awarded: 0 }).eq("id", id); if (error) setToast("Cloud update failed. The local change is kept."); }
    setToast("Task moved back to today.");
  }
  function startFocus(id: string) {
    const task = tasks.find(t => t.id === id); const sessionId = crypto.randomUUID();
    setFocusTask(id); setRemaining(focusMinutes * 60); setRunning(true); setFocusNote(task?.note ?? ""); setBuddySessionId(sessionId);
    if (localBuddy && task) void pushBuddyStatus(localBuddy, task.title, "focusing", sessionId);
  }
  async function stopFocus() {
    setRunning(false);
    if (focusTask && focusNote.trim()) {
      setTasks(v => v.map(t => t.id === focusTask ? { ...t, note: focusNote.trim() } : t));
      if (supabase && session) {
        const { error } = await supabase.from("tasks").update({ progress_note: focusNote.trim() }).eq("id", focusTask);
        if (error) setToast("Your note is saved locally, but cloud sync failed.");
      }
    }
    if (localBuddy && buddySessionId) void pushBuddyStatus(localBuddy, "", "idle", buddySessionId);
    setFocusTask(null); setRemaining(0); setBuddySessionId(""); setToast("Your place is saved.");
  }
  async function newSmallerStep(id: string) {
    const task = tasks.find(t => t.id === id); if (!task) return;
    const step = await askAssistant(task.title, "TOO_HARD");
    setTasks(v => v.map(t => t.id === id ? { ...t, step } : t));
    if (supabase && session) { const { error } = await supabase.from("tasks").update({ mode: "TOO_HARD", micro_step: step }).eq("id", id); if (error) setToast("The smaller step is available locally; cloud sync failed."); }
    setToast("Made the next step smaller.");
  }
  async function createPlan(e: FormEvent) {
    e.preventDefault(); if (!planText.trim()) { setToast("Add what you’d like to work on."); return; }
    setPlanLoading(true);
    let nextSteps = buildPlan(planText, planMinutes);
    if (supabase && session) {
      try {
        const { data, error } = await supabase.functions.invoke("timed-plan-assistant", { body: { task: planText.trim(), minutes: planMinutes } });
        if (!error && Array.isArray(data?.plan_steps) && data.plan_steps.length) {
          nextSteps = data.plan_steps.map((step: any) => ({
            id: crypto.randomUUID(), title: String(step.title), minutes: Number(step.minutes),
            kind: (["setup","focus","reset","wrap"].includes(step.kind) ? step.kind : "focus") as PlanStep["kind"], done: false
          }));
          setToast(data.source === "ai" ? "Your AI plan is ready. Adjust anything you need." : "Your plan is ready with a gentle fallback.");
        } else setToast("Your plan is ready. You can adjust each step.");
      } catch { setToast("Your plan is ready with a local fallback."); }
    }
    setPlanSteps(nextSteps); setPlanRunning(false); setPlanRemaining(0); setPlanLoading(false);
  }
  const planTotal = planSteps.reduce((sum, s) => sum + s.minutes, 0);
  const currentStep = planSteps.find(s => !s.done);
  function startPlan() { if (!currentStep) return; setPlanRemaining(currentStep.minutes*60); setPlanRunning(true); }
  function finishPlanStep() {
    if (!currentStep) return;
    setPlanSteps(v => v.map(s => s.id === currentStep.id ? { ...s, done: true } : s));
    setPlanRunning(false); setPlanRemaining(0); setToast("Step saved. Take the next one when you’re ready.");
  }
  async function shareProgress() {
    const message = `A little progress check-in: I have completed ${completed} of ${tasks.length} tasks today. One step at a time.`;
    try { if (navigator.share) await navigator.share({ text: message }); else { await navigator.clipboard.writeText(message); setToast("Progress copied to clipboard."); } }
    catch { setToast("Sharing was cancelled."); }
  }
  async function createBuddyInvite(e: FormEvent) {
    e.preventDefault();
    if (!session) { setToast("Sign in to create a buddy invitation."); return; }
    if (!buddyName.trim()) { setToast("Add your buddy's name first."); return; }
    const invite = await createInvite(buddyName.trim());
    if (!invite) { setToast("Could not create the invitation. Please try again."); return; }
    setLocalBuddy(invite); saveLocalBuddy(invite); setBuddyLink(buildInviteLink(invite.token));
    setToast("Your private buddy invite is ready.");
  }
  async function copyBuddyInvite() {
    if (!buddyLink) return;
    try { await navigator.clipboard.writeText(buddyLink); setToast("Invite link copied."); }
    catch { setToast("Copy is unavailable in this browser. You can select the link."); }
  }
  async function changeBuddyState(state: "active" | "paused" | "removed") {
    if (!localBuddy) return;
    const ok = await setBuddyState(localBuddy, state);
    if (!ok) { setToast("Could not update buddy sharing."); return; }
    if (state === "removed") { saveLocalBuddy(null); setLocalBuddy(null); setBuddyLink(""); }
    else { const next = { ...localBuddy, state }; saveLocalBuddy(next); setLocalBuddy(next); }
    setToast(state === "paused" ? "Buddy sharing paused." : state === "removed" ? "Buddy connection removed." : "Buddy sharing is active.");
  }

  if (!authReady) return <main className="app-bg"><section className="auth-card glass"><div className="brand-word" lang="ta">வினை</div><p>Getting your space ready…</p></section></main>;
  if (hasSupabaseConfig && !session) return <main className="app-bg"><div className="desktop-glow"/><section className="auth-card glass">
    <div className="auth-mark" lang="ta">வினை</div><p className="eyebrow">YOUR PACE. YOUR SPACE.</p><h1>{authMode === "signin" ? "Welcome back." : "Make room for a fresh start."}</h1><p className="muted-copy">Your tasks stay connected to your account, across your devices.</p>
    <form onSubmit={handleAuth}><label htmlFor="auth-email">Email address</label><input id="auth-email" type="email" autoComplete="email" required value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="you@example.com"/><label htmlFor="auth-password">Password</label><input id="auth-password" type="password" minLength={6} autoComplete={authMode === "signin" ? "current-password" : "new-password"} required value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder="At least 6 characters"/><button className="primary-button full-button" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "signin" ? "Sign in" : "Create account"} <ArrowRight size={16}/></button></form>
    {authMessage && <p className="auth-message" role="status">{authMessage}</p>}<button className="text-button" onClick={()=>{setAuthMode(v=>v==="signin"?"signup":"signin");setAuthMessage("");}}>{authMode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
  </section></main>;

  return <main className="app-bg">
    <section className="phone-frame" aria-label="வினை application">
      <div className="screen" id="main-content">
        <div className="scroll-column">
          <header className="topbar">
            <div className="brand-lockup">
              <div className="brand-mark"><span lang="ta">வினை</span></div>
              <div className="brand-word" lang="ta">வினை</div>
            </div>
            <div className="header-actions">
              <button className="icon-button notification-button" aria-label="Notifications"><Bell size={21}/><i/></button>
              <button className="icon-button profile-button" aria-label="Your profile" onClick={()=>setShowSettings(v=>!v)}><UserRound size={21}/></button>
            </div>
          </header>

          {tab === "today" && <>
            <section className="hero-section">
              <div className="hero-copy">
                <h1>One small<br/><strong>step.</strong></h1>
                <p className="hero-subtitle">That’s enough.</p>
                <div className="hero-divider"/>
                <div className="hero-chips">
                  <span><ZapIcon/>Focus Better</span>
                  <span><ChartIcon/>Get Things Done</span>
                  <span><StarIcon/>Grow Your Streak</span>
                </div>
              </div>
              <div className="hero-art"><div className="moon"/><img src="data:image/jpeg;base64,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" alt="Smiling illustrated character in a straw hat"/><div className="art-fade"/></div>
            </section>

            <section className="today-card" id="workspace">
              <div className="today-heading"><div className="today-label"><SunIcon/><h2>Today</h2></div><div className="date-label">{new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}<CalendarIcon/></div></div>
              <div className="task-list">
                {openTasks.map((task,index)=><article className={`task-card ${slidingTaskId===task.id?"is-sliding-away":""}`} key={task.id}>
                  <div className="task-top"><button className="check-button" aria-label="Complete task" onClick={()=>completeTask(task.id)} disabled={slidingTaskId!==null}/><div className="task-main"><h3>{task.title}</h3><p>{task.step || "Small step. Big difference."}</p></div><button className="task-chevron" aria-label="Task options" onClick={()=>startFocus(task.id)}><ChevronRight size={23}/></button></div>
                </article>)}
                {openTasks.length===0 && <div className="empty-state"><Sparkles/><h3>Nothing waiting here.</h3><p>Add one small thing whenever it comes to mind.</p></div>}
              </div>
              {tasks.some(t=>t.completed) && <section className="completed-section"><p className="eyebrow">COMPLETED · {completed}</p><div className="completed-list">{tasks.filter(t=>t.completed).map(task=><div className="completed-task" key={task.id}><span><CheckCircle2 size={15}/>{task.title}</span><button className="quiet-icon" aria-label="Undo completion" onClick={()=>undoTask(task.id)}><RotateCcw size={15}/></button></div>)}</div></section>}
            </section>
          </>}

          {tab === "plan" && <section className="secondary-screen">
            <p className="eyebrow">A LITTLE STRUCTURE. PLENTY OF BREATHING ROOM.</p><h2>Build a timed plan</h2><p className="muted-copy">Break the thing taking up space in your head into a few manageable parts.</p>
            <form className="glass planner-card" onSubmit={createPlan}>
              <label htmlFor="plan-task">What would you like to work on?</label><textarea id="plan-task" value={planText} onChange={e=>setPlanText(e.target.value)} placeholder="The task taking up space in your head…"/>
              <div className="range-heading"><label htmlFor="plan-time">Total time</label><strong>{planMinutes<60?`${planMinutes} min`:`${Math.floor(planMinutes/60)}h ${planMinutes%60?planMinutes%60+"m":""}`}</strong></div>
              <input id="plan-time" className="silver-range" type="range" min="15" max="240" step="5" value={planMinutes} onChange={e=>setPlanMinutes(Number(e.target.value))}/><div className="range-labels"><span>15 min</span><span>4 hours</span></div>
              <button className="primary-button full-button" type="submit" disabled={planLoading}>{planLoading?"Building your plan…":"Create my plan"} <ArrowRight size={16}/></button>
            </form>
            {planSteps.length>0 && <section className="glass generated-plan"><div className="section-title"><div><p className="eyebrow">YOUR PLAN</p><h3>{planText}</h3></div><span className="task-progress">{planSteps.filter(x=>x.done).length}/{planSteps.length}</span></div>
              <p className="muted-copy">Planned total: {planTotal} minutes</p>
              {planSteps.map((step,i)=><div className={`plan-step ${step.done?"done":""}`} key={step.id}><span className="step-number">{String(i+1).padStart(2,"0")}</span><div className="step-edit"><input aria-label="Step title" value={step.title} onChange={e=>setPlanSteps(v=>v.map(x=>x.id===step.id?{...x,title:e.target.value}:x))}/><span>{step.kind}</span></div><input className="minutes-input" aria-label="Step minutes" type="number" min="1" max="240" value={step.minutes} onChange={e=>setPlanSteps(v=>v.map(x=>x.id===step.id?{...x,minutes:Math.max(1,Number(e.target.value)||1)}:x))}/><button className="quiet-icon" onClick={()=>setPlanSteps(v=>v.map(x=>x.id===step.id?{...x,done:!x.done}:x))}>{step.done?<CheckCircle2/>:<Check/>}</button></div>)}
              {currentStep && <div className="plan-execution"><span className="eyebrow">CURRENT STEP</span><h3>{currentStep.title}</h3><div className="timer-display">{fmt(planRemaining)}</div><div className="focus-controls"><button className="primary-button" onClick={()=>planRunning?setPlanRunning(false):planRemaining>0?setPlanRunning(true):startPlan()}>{planRunning?"Pause":planRemaining>0?"Resume":"Start step"}</button><button className="secondary-button" onClick={finishPlanStep}>Skip / finish</button></div></div>}
            </section>}
          </section>}

          {tab === "buddy" && <section className="secondary-screen">
            <p className="eyebrow">BETTER, TOGETHER</p><h2>Your accountability buddy</h2><p className="muted-copy">Not a report card. A friend in your corner. Share a small win, or ask for a little company.</p>
            <div className="glass buddy-card"><div className="buddy-symbol"><UserRound size={24}/></div><h3>A little company can help.</h3><p>Invite someone you trust. They can see only the focus status and task label you choose to share, not your task list or notes.</p>
              {!localBuddy?<form onSubmit={createBuddyInvite}><label htmlFor="buddy-name">Buddy name</label><input id="buddy-name" value={buddyName} onChange={e=>setBuddyName(e.target.value)} placeholder="A name you know"/><button className="primary-button full-button" disabled={!session}>Create private invite <ArrowRight size={16}/></button>{!session&&<p className="buddy-hint">Sign in to create an invite.</p>}</form>:<div className="buddy-invite"><p className="buddy-hint">Invite for {localBuddy.ownerName}</p><input aria-label="Buddy invitation link" readOnly value={buddyLink||buildInviteLink(localBuddy.token)}/><button className="primary-button full-button" onClick={()=>void copyBuddyInvite()}>Copy invite link <Share2 size={15}/></button><div className="buddy-manage"><button className="secondary-button" onClick={()=>void changeBuddyState(localBuddy.state==="paused"?"active":"paused")}>{localBuddy.state==="paused"?"Resume sharing":"Pause sharing"}</button><button className="secondary-button" onClick={()=>void changeBuddyState("removed")}>Remove buddy</button></div></div>}
            </div><button className="secondary-button full-button share-button" onClick={shareProgress}><Share2 size={16}/> Share a small progress check-in</button>
          </section>}

          {focusTask && <section className="glass focus-panel"><div className="focus-head"><div><p className="eyebrow">FOCUS SPACE</p><h2>{activeTask?.title??"A little focus time"}</h2></div><button className="quiet-icon" aria-label="Close focus" onClick={stopFocus}><X/></button></div><p className="focus-step">{activeTask?.step}</p><div className="timer-display">{fmt(remaining)}</div><div className="focus-controls"><button className="primary-button" onClick={()=>setRunning(v=>!v)}>{running?<Pause/>:<Play/>}{running?"Pause":"Resume"}</button><button className="secondary-button" onClick={stopFocus}><Square/> Stop</button></div><label className="note-label">A note to your future self<textarea value={focusNote} onChange={e=>setFocusNote(e.target.value)} placeholder="Where should you pick up again?"/></label></section>}
        </div>

        {showAddTask && <div className="add-sheet-backdrop" onClick={()=>setShowAddTask(false)}><form className="add-sheet glass" onClick={e=>e.stopPropagation()} onSubmit={async e=>{await addTask(e);setShowAddTask(false);}}><div className="sheet-grip"/><div className="sheet-heading"><h2>Add a Task</h2><button type="button" className="quiet-icon" onClick={()=>setShowAddTask(false)} aria-label="Close"><X/></button></div><label htmlFor="task-title">What’s one small thing?</label><input id="task-title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Add one thing to your mind…" maxLength={180}/><label className="reminder-field"><Bell size={15}/> Reminder <input aria-label="Optional reminder" type="datetime-local" value={reminder} min={localInputDate(new Date())} onChange={e=>setReminder(e.target.value)}/></label><button className="primary-button full-button" type="submit">Add task <ArrowRight size={16}/></button></form></div>}

        <div className="bottom-stack"><button className="add-task-button" onClick={()=>setShowAddTask(true)}><Plus size={28}/>Add a Task</button>
          <nav className="bottom-nav" aria-label="Main sections">
            <button className={tab==="today"?"active":""} onClick={()=>setTab("today")}><HomeIcon/><span>Today</span></button>
            <button className={tab==="plan"?"active":""} onClick={()=>setTab("plan")}><ClockIcon/><span>Timed Plan</span></button>
            <button className={tab==="buddy"?"active":""} onClick={()=>setTab("buddy")}><UsersIcon/><span>My Buddy</span></button>
          </nav>
        </div>
        {showSettings && <div className="settings-popover glass"><div className="popover-head"><strong>Your space</strong><button className="quiet-icon" onClick={()=>setShowSettings(false)} aria-label="Close settings"><X/></button></div><p>{session? `Signed in as ${session.user.email??"your account"}. Your tasks sync through your private account.`:"Demo mode stores tasks on this device."}</p>{session&&<button className="secondary-button full-button" onClick={async()=>{await supabase?.auth.signOut();setShowSettings(false);}}>Sign out</button>}</div>}
      </div>
    </section>
    {rewardBurst && <div className="reward-burst" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span><span>✧</span><span>✦</span></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;

}
