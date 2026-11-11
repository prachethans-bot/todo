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
  const [showSettings, setShowSettings] = useState(false);
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
    const task = tasks.find(t => t.id === id); if (!task || task.completed) return;
    const reward = Math.random() < 0.2 ? 35 : 10;
    setTasks(v => v.map(t => t.id === id ? { ...t, completed: true, pointsAwarded: reward } : t));
    setPoints(v => v + reward); setActivityDays(v => [...new Set([...v, dayKey(new Date())])]);
    setRewardBurst(true); window.setTimeout(() => setRewardBurst(false), 650);
    playRewardSound();
    try { navigator.vibrate?.(12); } catch { /* Haptics are optional. */ }
    if (supabase && session) {
      const { error } = await supabase.from("tasks").update({ completed: true, points_awarded: reward }).eq("id", id);
      if (error) setToast("Saved on this device. Cloud update will retry next time.");
    }
    setToast(reward === 35 ? "Bonus win! +10 points and a +25 bonus." : "A small win. +10 points");
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
    if (supabase && session && focusTask && focusNote.trim()) {
      const { error } = await supabase.from("tasks").update({ progress_note: focusNote.trim() }).eq("id", focusTask);
      setTasks(v => v.map(t => t.id === focusTask ? { ...t, note: focusNote.trim() } : t));
      if (error) setToast("Your note is saved locally, but cloud sync failed.");
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
    <div className="desktop-glow" />
    <section className="phone-frame" aria-label="வினை application">
      <div className="screen" id="main-content">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark"><img src="/vinai-icon.svg" alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display="none"; }} /><span lang="ta">வினை</span></div>
            <div><div className="brand-word" lang="ta">வினை</div><div className="date-label">{today}</div></div>
          </div>
          <button className="icon-button" aria-label="Settings" onClick={() => setShowSettings(v => !v)}><UserRound size={18}/></button>
        </header>

        <section className="welcome">
          <p className="eyebrow">YOUR PACE. YOUR SPACE.</p>
          <h1>Small steps.<br/><span>Real momentum.</span></h1>
        </section>

        <section className="hero-poster" aria-label="Motivational poster">
          
          <div className="poster-fallback"><span>STAY<br/>HARD</span><small>START WHERE YOU ARE</small></div>
          <div className="task-count"><strong>{openTasks.length}</strong><span>left today</span></div>
        </section>

        <section className="stats-grid">
          <div className="glass stat-card"><span className="eyebrow">YOUR POINTS</span><strong>{points} <small>pts</small></strong><p>Every small win counts</p></div>
          <div className="glass stat-card"><span className="eyebrow">SHOWING UP</span><strong><Flame size={18}/> {streak} <small>day{streak===1?"":"s"}</small></strong><p>{streak>0?"You made a start recently":"A fresh start is waiting"}</p></div>
        </section>

        <nav className="tabs glass" aria-label="Main sections">
          <button className={tab==="today"?"selected":""} onClick={() => setTab("today")}>Today</button>
          <button className={tab==="plan"?"selected":""} onClick={() => setTab("plan")}>Timed plan</button>
          <button className={tab==="buddy"?"selected":""} onClick={() => setTab("buddy")}>My buddy</button>
        </nav>

        {tab === "today" && <section className="content-section" id="workspace">
          <div className="section-title"><div><p className="eyebrow">A SOFTER TO-DO LIST</p><h2>Today, one thing at a time.</h2></div><span className="task-progress">{completed}/{tasks.length}</span></div>
          <form className="glass quick-add" onSubmit={addTask}>
            <label htmlFor="task-title">What needs your focus?</label>
            <div className="input-row"><Plus size={18}/><input id="task-title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Add one thing to your mind…" maxLength={180}/></div>
            <div className="add-bottom"><label className="reminder-field"><Bell size={15}/><input aria-label="Optional reminder" type="datetime-local" value={reminder} min={localInputDate(new Date())} onChange={e=>setReminder(e.target.value)}/></label><button className="primary-button" type="submit">Add task <ArrowRight size={15}/></button></div>
          </form>

          <div className="task-list">
            {tasks.map((task, index) => <article className={`glass task-card ${task.completed?"is-complete":""}`} key={task.id}>
              <div className="task-top"><button className="check-button" aria-label={task.completed?"Undo completion":"Complete task"} onClick={()=>task.completed?undoTask(task.id):completeTask(task.id)}>{task.completed?<Check size={17}/>:null}</button><span className="task-index">{String(index+1).padStart(2,"0")}</span><div className="task-main"><h3>{task.title}</h3><p><Sparkles size={13}/>{task.step}</p></div><button className="quiet-icon" aria-label="Delete task" onClick={async ()=>{setTasks(v=>v.filter(t=>t.id!==task.id));if(supabase&&session){const {error}=await supabase.from("tasks").delete().eq("id",task.id);if(error)setToast("Removed locally; cloud delete failed.");}setToast("Task removed.");}}><Trash2 size={15}/></button></div>
              {!task.completed && <div className="task-actions"><button onClick={()=>newSmallerStep(task.id)}><CircleHelp size={14}/> Too hard</button><button onClick={()=>startFocus(task.id)}><Play size={14}/> Focus</button>{task.reminderAt && <span><AlarmClock size={13}/>{new Date(task.reminderAt).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})}</span>}</div>}
              {task.completed && <div className="task-actions"><span><CheckCircle2 size={14}/> Completed</span><button onClick={()=>undoTask(task.id)}><RotateCcw size={13}/> Undo</button></div>}
            </article>)}
            {tasks.length===0 && <div className="empty-state glass"><Sparkles/><h3>Nothing waiting here.</h3><p>Add one small thing whenever it comes to mind.</p></div>}
          </div>

          {focusTask && <section className="glass focus-panel">
            <div className="focus-head"><div><p className="eyebrow">FOCUS SPACE</p><h2>{activeTask?.title ?? "A little focus time"}</h2></div><button className="quiet-icon" aria-label="Close focus" onClick={stopFocus}><X/></button></div>
            <p className="focus-step">{activeTask?.step}</p>
            <div className="timer-display">{fmt(remaining)}</div>
            <div className="focus-controls"><button className="primary-button" onClick={()=>setRunning(v=>!v)}>{running?<Pause size={16}/>:<Play size={16}/>} {running?"Pause":"Resume"}</button><button className="secondary-button" onClick={stopFocus}><Square size={14}/> Stop</button></div>
            <label className="note-label">A note to your future self<textarea value={focusNote} onChange={e=>setFocusNote(e.target.value)} placeholder="Where should you pick up again?"/></label>
            <button className="text-button" onClick={()=>activeTask && newSmallerStep(activeTask.id)}>Need a smaller step?</button>
          </section>}
          <div className="focus-preset glass"><div><span className="eyebrow">FOCUS LENGTH</span><p>A little time, just for this.</p></div><select value={focusMinutes} onChange={e=>setFocusMinutes(Number(e.target.value))}><option value={5}>5 min</option><option value={10}>10 min</option><option value={15}>15 min</option><option value={25}>25 min</option></select></div>
        </section>}

        {tab === "plan" && <section className="content-section">
          <p className="eyebrow">A LITTLE STRUCTURE. PLENTY OF BREATHING ROOM.</p><h2>Build a timed plan</h2><p className="muted-copy">Break the thing taking up space in your head into a few manageable parts.</p>
          <form className="glass planner-card" onSubmit={createPlan}>
            <label htmlFor="plan-task">What would you like to work on?</label><textarea id="plan-task" value={planText} onChange={e=>setPlanText(e.target.value)} placeholder="The task taking up space in your head…"/>
            <div className="range-heading"><label htmlFor="plan-time">Total time</label><strong>{planMinutes<60?`${planMinutes} min`:`${Math.floor(planMinutes/60)}h ${planMinutes%60?planMinutes%60+"m":""}`}</strong></div>
            <input id="plan-time" className="silver-range" type="range" min="15" max="240" step="5" value={planMinutes} onChange={e=>setPlanMinutes(Number(e.target.value))}/><div className="range-labels"><span>15 min</span><span>4 hours</span></div>
            <button className="primary-button full-button" type="submit" disabled={planLoading}>{planLoading ? "Building your plan…" : "Create my plan"} <ArrowRight size={16}/></button>
          </form>
          {planSteps.length>0 && <section className="glass generated-plan"><div className="section-title"><div><p className="eyebrow">YOUR PLAN</p><h3>{planText}</h3></div><span className="task-progress">{planSteps.filter(s=>s.done).length}/{planSteps.length}</span></div>
            <p className="muted-copy">Planned total: {planTotal} minutes {planTotal!==planMinutes && "· Adjusted durations"}</p>
            {planSteps.map((step,i)=><div className={`plan-step ${step.done?"done":""}`} key={step.id}><span className="step-number">{String(i+1).padStart(2,"0")}</span><div className="step-edit"><input aria-label="Step title" value={step.title} onChange={e=>setPlanSteps(v=>v.map(s=>s.id===step.id?{...s,title:e.target.value}:s))}/><span>{step.kind}</span></div><input className="minutes-input" aria-label="Step minutes" type="number" min="1" max="240" value={step.minutes} onChange={e=>setPlanSteps(v=>v.map(s=>s.id===step.id?{...s,minutes:Math.max(1,Number(e.target.value)||1)}:s))}/><button className="quiet-icon" aria-label={step.done?"Step complete":"Mark step complete"} onClick={()=>setPlanSteps(v=>v.map(s=>s.id===step.id?{...s,done:!s.done}:s))}>{step.done?<CheckCircle2/>:<Check/>}</button></div>)}
            <p className="plan-status">{planTotal===planMinutes?"Your steps add up to the selected time.":`Your steps now total ${planTotal} minutes. Balance them if you want.`}</p>
            {currentStep && <div className="plan-execution"><div><span className="eyebrow">CURRENT STEP</span><h3>{currentStep.title}</h3></div><div className="timer-display small-timer">{fmt(planRemaining)}</div><div className="focus-controls"><button className="primary-button" onClick={()=>planRunning?setPlanRunning(false):planRemaining>0?setPlanRunning(true):startPlan()}>{planRunning?<Pause/>:<Play/>}{planRunning?"Pause":planRemaining>0?"Resume":"Start step"}</button><button className="secondary-button" onClick={finishPlanStep}>Skip / finish <ChevronRight/></button></div></div>}
            {!currentStep && <p className="plan-status">You reached the end. Any progress counts.</p>}
          </section>}
        </section>}

        {tab === "buddy" && <section className="content-section">
          <p className="eyebrow">BETTER, TOGETHER</p><h2>Your accountability buddy</h2><p className="muted-copy">Not a report card. A friend in your corner. Share a small win, or ask for a little company.</p>
          <div className="glass buddy-card"><div className="buddy-symbol"><UserRound size={24}/></div><h3>A little company can help.</h3><p>Invite someone you trust. They can see only the focus status and task label you choose to share, not your task list or notes.</p>
            {!localBuddy ? <form onSubmit={createBuddyInvite}><label htmlFor="buddy-name">Buddy name</label><input id="buddy-name" value={buddyName} onChange={e=>setBuddyName(e.target.value)} placeholder="A name you know"/><button className="primary-button full-button" disabled={!session}>Create private invite <ArrowRight size={16}/></button>{!session && <p className="buddy-hint">Sign in to create an invite.</p>}</form> : <div className="buddy-invite"><p className="buddy-hint">Invite for {localBuddy.ownerName}</p><input aria-label="Buddy invitation link" readOnly value={buddyLink || buildInviteLink(localBuddy.token)}/><button className="primary-button full-button" onClick={()=>void copyBuddyInvite()}>Copy invite link <Share2 size={15}/></button><div className="buddy-manage"><button className="secondary-button" onClick={()=>void changeBuddyState(localBuddy.state==="paused"?"active":"paused")}>{localBuddy.state==="paused"?"Resume sharing":"Pause sharing"}</button><button className="secondary-button" onClick={()=>void changeBuddyState("removed")}>Remove buddy</button></div></div>}</div>
          <button className="secondary-button full-button share-button" onClick={shareProgress}><Share2 size={16}/> Share a small progress check-in</button>
          <div className="glass encouragement"><Sparkles/><p>“Proud of the start. One step at a time.”</p></div>
        </section>}

        {showSettings && <div className="settings-popover glass"><div className="popover-head"><strong>Your space</strong><button className="quiet-icon" onClick={()=>setShowSettings(false)} aria-label="Close settings"><X/></button></div><p>{session ? `Signed in as ${session.user.email ?? "your account"}. Your tasks sync through your private account.` : "Demo mode stores tasks on this device."}</p>{session && <button className="secondary-button full-button" onClick={async ()=>{await supabase?.auth.signOut();setShowSettings(false);}}>Sign out</button>}</div>}
        <footer className="bottom-note">YOUR PLACE IS SAVED. NO CATCHING UP NEEDED.</footer>
      </div>
    </section>
    {rewardBurst && <div className="reward-burst" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span><span>✧</span><span>✦</span></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}
