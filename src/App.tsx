import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AlarmClock, ArrowRight, Bell, Check, CheckCircle2, ChevronRight, CircleHelp,
  Clock3, Flame, Pause, Play, Plus, RotateCcw, Share2, Sparkles, Square,
  Timer, Trash2, Trophy, UserRound, X
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

type Task = {
  id: string; title: string; step: string; createdAt: string; completed: boolean;
  reminderAt: string; reminderFired?: boolean; note: string; estimate: number;
};
type PlanStep = { id: string; title: string; minutes: number; kind: "setup" | "focus" | "reset" | "wrap"; done: boolean };
type Tab = "today" | "plan" | "buddy";
const STORE = "vinai.fresh.v1";
const pad = (n: number) => String(n).padStart(2, "0");
const localInputDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const fmt = (seconds: number) => `${pad(Math.floor(Math.max(0,seconds)/60))}:${pad(Math.max(0,seconds)%60)}`;
function dayKey(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
function streakFromDays(days: string[]) { const set = new Set(days); const today = new Date(); let cursor = new Date(today); if (!set.has(dayKey(cursor))) cursor.setDate(cursor.getDate()-1); let count = 0; while (set.has(dayKey(cursor))) { count++; cursor.setDate(cursor.getDate()-1); } return count; }
const seedTasks: Task[] = [
  { id: "seed-1", title: "Open the maths chapter", step: "Put the textbook on your desk.", createdAt: new Date().toISOString(), completed: false, reminderAt: "", note: "", estimate: 20 },
  { id: "seed-2", title: "Reply to one important message", step: "Open your messages and find the conversation.", createdAt: new Date().toISOString(), completed: false, reminderAt: "", note: "", estimate: 10 }
];
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
    try { const saved = localStorage.getItem(STORE); return saved ? JSON.parse(saved).tasks ?? seedTasks : seedTasks; }
    catch { return seedTasks; }
  });
  const [points, setPoints] = useState(() => { try { return Number(JSON.parse(localStorage.getItem(STORE) || "{}").points ?? 120); } catch { return 120; } });
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
  const [planRunning, setPlanRunning] = useState(false);
  const [planRemaining, setPlanRemaining] = useState(0);
  const [buddyName, setBuddyName] = useState("");
  const [buddyCode, setBuddyCode] = useState("");
  const [toast, setToast] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const completed = tasks.filter(t => t.completed).length;
  const streak = streakFromDays(activityDays);
  const openTasks = tasks.filter(t => !t.completed);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" });
  const activeTask = tasks.find(t => t.id === focusTask);

  useEffect(() => { localStorage.setItem(STORE, JSON.stringify({ tasks, points, activityDays })); }, [tasks, points, activityDays]);
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
  function addTask(e: FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) { setToast("Add a task name first."); return; }
    const task: Task = { id: crypto.randomUUID(), title: clean, step: makeStep(clean), createdAt: new Date().toISOString(), completed: false, reminderAt: reminder, reminderFired: false, note: "", estimate: 15 };
    setTasks(v => [task, ...v]); setTitle(""); setReminder(""); setToast("Your task is here. Start whenever you’re ready.");
    void scheduleReminder(task);
  }
  function completeTask(id: string) {
    const task = tasks.find(t => t.id === id); if (!task || task.completed) return;
    setTasks(v => v.map(t => t.id === id ? { ...t, completed: true } : t)); setPoints(v => v + 10); setActivityDays(v => [...new Set([...v, dayKey(new Date())])]);
    setToast("A small win. +10 points");
  }
  function undoTask(id: string) {
    const task = tasks.find(t => t.id === id); if (!task || !task.completed) return;
    setTasks(v => v.map(t => t.id === id ? { ...t, completed: false } : t)); setPoints(v => Math.max(0, v - 10)); setToast("Task moved back to today.");
  }
  function startFocus(id: string) { setFocusTask(id); setRemaining(focusMinutes * 60); setRunning(true); setFocusNote(""); }
  function stopFocus() { setRunning(false); setFocusTask(null); setRemaining(0); setToast("Your place is saved."); }
  function newSmallerStep(id: string) {
    setTasks(v => v.map(t => t.id === id ? { ...t, step: makeStep(t.title, "TOO_HARD") } : t));
    setToast("Made the next step smaller.");
  }
  function createPlan(e: FormEvent) {
    e.preventDefault(); if (!planText.trim()) { setToast("Add what you’d like to work on."); return; }
    setPlanSteps(buildPlan(planText, planMinutes)); setPlanRunning(false); setPlanRemaining(0); setToast("Plan created. Adjust any step before you begin.");
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
  function saveBuddy(e: FormEvent) { e.preventDefault(); if (!buddyName.trim() || !buddyCode.trim()) { setToast("Add a name and invite code."); return; } localStorage.setItem("vinai.buddy.local", JSON.stringify({ name: buddyName.trim(), code: buddyCode.trim() })); setToast("Buddy details saved on this device. Cloud invites need Supabase setup."); }

  return <main className="app-bg">
    <div className="desktop-glow" />
    <section className="phone-frame" aria-label="வினை application">
      <div className="screen">
        <header className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark"><img src="/app-logo.jpg" alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display="none"; }} /><span lang="ta">வினை</span></div>
            <div><div className="brand-word" lang="ta">வினை</div><div className="date-label">{today}</div></div>
          </div>
          <button className="icon-button" aria-label="Settings" onClick={() => setShowSettings(v => !v)}><UserRound size={18}/></button>
        </header>

        <section className="welcome">
          <p className="eyebrow">YOUR PACE. YOUR SPACE.</p>
          <h1>Small steps.<br/><span>Real momentum.</span></h1>
        </section>

        <section className="hero-poster" aria-label="Motivational poster">
          <img src="/stay-hard-hero.jpg" alt="Stay Hard monochrome motivational poster" onError={e => { (e.currentTarget as HTMLImageElement).style.opacity="0"; }} />
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
              <div className="task-top"><button className="check-button" aria-label={task.completed?"Undo completion":"Complete task"} onClick={()=>task.completed?undoTask(task.id):completeTask(task.id)}>{task.completed?<Check size={17}/>:null}</button><span className="task-index">{String(index+1).padStart(2,"0")}</span><div className="task-main"><h3>{task.title}</h3><p><Sparkles size={13}/>{task.step}</p></div><button className="quiet-icon" aria-label="Delete task" onClick={()=>{setTasks(v=>v.filter(t=>t.id!==task.id));setToast("Task removed.");}}><Trash2 size={15}/></button></div>
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
            <button className="primary-button full-button" type="submit">Create my plan <ArrowRight size={16}/></button>
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
          <div className="glass buddy-card"><div className="buddy-symbol"><UserRound size={24}/></div><h3>A little company can help.</h3><p>Buddy invites and live updates will connect once your Supabase project is configured. You can save a local buddy note in the meantime.</p><form onSubmit={saveBuddy}><label htmlFor="buddy-name">Buddy name</label><input id="buddy-name" value={buddyName} onChange={e=>setBuddyName(e.target.value)} placeholder="A name you know"/><label htmlFor="buddy-code">Invite code</label><input id="buddy-code" value={buddyCode} onChange={e=>setBuddyCode(e.target.value)} placeholder="Paste an invite code"/><button className="primary-button full-button">Save on this device <Check size={16}/></button></form></div>
          <button className="secondary-button full-button share-button" onClick={shareProgress}><Share2 size={16}/> Share a small progress check-in</button>
          <div className="glass encouragement"><Sparkles/><p>“Proud of the start. One step at a time.”</p></div>
        </section>}

        {showSettings && <div className="settings-popover glass"><div className="popover-head"><strong>Your space</strong><button className="quiet-icon" onClick={()=>setShowSettings(false)} aria-label="Close settings"><X/></button></div><p>Tasks are saved on this device. Sign-in, cross-device sync, and cloud buddy invitations need Supabase configuration.</p><button className="secondary-button full-button" onClick={()=>{setTasks(seedTasks);setPoints(120);setActivityDays([]);setShowSettings(false);setToast("Demo tasks restored.");}}>Restore sample tasks</button></div>}
        <footer className="bottom-note">YOUR PLACE IS SAVED. NO CATCHING UP NEEDED.</footer>
      </div>
    </section>
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}
