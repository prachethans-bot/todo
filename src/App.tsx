import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Check, CheckCircle2, Clock3, LogOut, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getDemoResponse, type AssistantResponse, type TaskMode } from "./lib/assistant";
import { hasSupabaseConfig, supabase } from "./lib/supabase";
import "./hero-motion.css";

type SavedTask = {
  id: string; title: string; mode: TaskMode; microStep: string; createdAt: string;
  completed: boolean; reminderAt: string | null; estimateMinutes: number | null; actualMinutes: number | null;
};
const storageKey = (userId?: string) => userId ? `todo-adhd.tasks.${userId}` : "todo-adhd.tasks.guest";
const modes: { id: TaskMode; label: string }[] = [
  { id: "NEW_TASK", label: "New task" }, { id: "NEXT_STEP", label: "Next step" },
  { id: "TOO_HARD", label: "This feels hard" }, { id: "TIME_CHECK", label: "Check my time" }
];
function readTasks(userId?: string): SavedTask[] {
  try { const value = localStorage.getItem(storageKey(userId)); return value ? JSON.parse(value) as SavedTask[] : []; }
  catch { return []; }
}
function toDb(task: SavedTask, userId: string) {
  return { id: task.id, user_id: userId, title: task.title, mode: task.mode, micro_step: task.microStep,
    created_at: task.createdAt, completed: task.completed, reminder_at: task.reminderAt,
    estimate_minutes: task.estimateMinutes, actual_minutes: task.actualMinutes };
}
function fromDb(row: Record<string, unknown>): SavedTask {
  return { id: String(row.id), title: String(row.title), mode: row.mode as TaskMode,
    microStep: String(row.micro_step), createdAt: String(row.created_at), completed: Boolean(row.completed),
    reminderAt: row.reminder_at ? String(row.reminder_at) : null,
    estimateMinutes: row.estimate_minutes == null ? null : Number(row.estimate_minutes),
    actualMinutes: row.actual_minutes == null ? null : Number(row.actual_minutes) };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup"); const [authMessage, setAuthMessage] = useState("");
  const [task, setTask] = useState(""); const [mode, setMode] = useState<TaskMode>("NEW_TASK");
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [tasks, setTasks] = useState<SavedTask[]>(() => readTasks());
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const [reminderInput, setReminderInput] = useState(""); const [estimate, setEstimate] = useState("2");
  const [timeGuess, setTimeGuess] = useState(""); const [actualInput, setActualInput] = useState("");
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const previousStorageKey = useRef(storageKey());

  useEffect(() => {
    const nextKey = storageKey(session?.user.id);
    if (previousStorageKey.current !== nextKey) {
      previousStorageKey.current = nextKey;
      setTasks(readTasks(session?.user.id));
      return;
    }
    try { localStorage.setItem(nextKey, JSON.stringify(tasks)); }
    catch { setNotice("Browser storage is full. Delete older tasks to free space."); }
  }, [tasks, session?.user.id]);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session || !supabase) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase!.from("tasks").select("*").order("created_at", { ascending: false }).limit(100);
      if (!cancelled && !error && data) {
        const remote = data.map((row) => fromDb(row as Record<string, unknown>));
        setTasks(current => {
          const byId = new Map(current.map(t => [t.id, t]));
          remote.forEach(t => byId.set(t.id, t));
          return [...byId.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100);
        });
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user.id]);
  useEffect(() => {
    tasks.forEach(t => { if (t.reminderAt && !t.completed && new Date(t.reminderAt).getTime() > Date.now()) scheduleReminder(t.id, t.title, t.reminderAt, false); });
    return () => Object.values(timers.current).forEach(clearTimeout);
  // Reminders are rehydrated when the saved task list is first loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scheduleReminder(id: string, title: string, at: string, askPermission = true) {
    if (timers.current[id]) clearTimeout(timers.current[id]);
    const delay = new Date(at).getTime() - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) { setNotice("Choose a reminder time in the future."); return; }
    if (delay > 2_147_000_000) { setNotice("That reminder is too far away for a browser timer. Choose a nearer time."); return; }
    const start = () => {
      timers.current[id] = setTimeout(() => {
        setNotice("Gentle reminder: " + title);
        if ("Notification" in window && Notification.permission === "granted") new Notification("A tiny step is waiting", { body: title });
        setTasks(current => current.map(t => t.id === id ? { ...t, reminderAt: null } : t));
      }, delay);
      setNotice("Reminder set. Keep this tab open for the most reliable reminder.");
    };
    if (!("Notification" in window)) { start(); return; }
    if (Notification.permission === "granted") { start(); return; }
    if (!askPermission) { start(); return; }
    Notification.requestPermission().then(permission => { if (permission === "granted") start(); else { start(); setNotice("In-page reminder set. Allow notifications in your browser for a desktop alert."); } });
  }
  async function handleAuth(e: FormEvent) {
    e.preventDefault(); setAuthMessage("");
    if (!supabase) { setAuthMessage("Add your Supabase URL and publishable/anon key to .env.local first."); return; }
    const result = authMode === "signup" ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setAuthMessage(result.error.message);
    else if (authMode === "signup" && !result.data.session) setAuthMessage("Check your email for the confirmation link, then sign in.");
    else setAuthMessage("You're all set.");
  }
  async function signOut() { if (supabase) await supabase.auth.signOut(); setSession(null); }
  async function makeStep(e: FormEvent) {
    e.preventDefault(); setBusy(true); setNotice(""); setResponse(null);
    try {
      let result: AssistantResponse | null = null;
      if (supabase && session) {
        const { data, error } = await supabase.functions.invoke("stepwise-assistant", { body: { task: task.trim(), mode } });
        if (!error && data && data.the_micro_step) result = data as AssistantResponse;
      }
      const next = result ?? getDemoResponse(task, mode);
      setResponse(next);
      if (!result) setNotice(session ? "Using the built-in fallback. Deploy the Edge Function to enable AI." : "Demo mode is ready. Sign in and deploy the AI function to use the connected AI engine.");
    } catch { setResponse(getDemoResponse(task, mode)); setNotice("The AI service is unavailable, so a local demo step is shown."); }
    finally { setBusy(false); }
  }
  async function persistTask(item: SavedTask) {
    if (!session || !supabase) return;
    const { error } = await supabase.from("tasks").upsert(toDb(item, session.user.id));
    if (error) setNotice("Saved on this device. Cloud sync needs setup: " + error.message);
  }
  function saveCurrent() {
    if (!response) return;
    const item: SavedTask = { id: crypto.randomUUID(), title: response.optimized_task_title, mode: response.mode,
      microStep: response.the_micro_step, createdAt: new Date().toISOString(), completed: false,
      reminderAt: reminderInput ? new Date(reminderInput).toISOString() : null,
      estimateMinutes: Number(estimate) || null, actualMinutes: null };
    setTasks(current => [item, ...current].slice(0,100)); void persistTask(item);
    if (item.reminderAt) scheduleReminder(item.id, item.title, item.reminderAt);
    setNotice(item.reminderAt ? "Step saved and reminder scheduled." : "Step saved to your task list.");
    setResponse(null); setTask(""); setReminderInput("");
  }
  async function toggleDone(item: SavedTask) {
    const updated = { ...item, completed: !item.completed, reminderAt: item.completed ? item.reminderAt : null };
    setTasks(current => current.map(t => t.id === item.id ? updated : t));
    if (timers.current[item.id]) clearTimeout(timers.current[item.id]);
    await persistTask(updated);
  }
  async function deleteTask(id: string) {
    setTasks(current => current.filter(t => t.id !== id));
    if (timers.current[id]) clearTimeout(timers.current[id]);
    if (session && supabase) {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) setNotice("Removed locally; cloud deletion needs setup.");
    }
  }
  async function saveTimeFeedback(item: SavedTask) {
    const actual = Number(actualInput);
    if (!Number.isFinite(actual) || actual <= 0) { setNotice("Enter a time greater than zero."); return; }
    const updated = { ...item, actualMinutes: actual, estimateMinutes: Number(timeGuess) || item.estimateMinutes };
    setTasks(current => current.map(t => t.id === item.id ? updated : t)); await persistTask(updated);
    setActualInput(""); setNotice("Time feedback saved. This is information, not a score.");
  }
  const completed = tasks.filter(t => t.completed).length;

  return <main className="shell">
    <nav className="nav"><a className="brand" href="#"><span className="mark"><Sparkles size={17}/></span>todo for ADHD</a><div className="nav-actions"><span className="status"><i/> gentle mode on</span>{session ? <button className="outline" onClick={signOut}><LogOut size={14}/> Sign out</button> : <a className="outline" href="#account">Sign in</a>}</div></nav>
    <section className="hero">
      <div className="hero-copy"><p className="eyebrow">LESS PRESSURE. MORE MOMENTUM.</p><h1>You don't need<br/>to do it all.<br/><span>Just start here.</span></h1><p className="intro">A calmer way to get moving. Turn the thing you're avoiding into one tiny step you can do right now.</p><a className="cta" href="#workspace">Find my first step <ArrowRight size={16}/></a><div className="trust"><span><ShieldCheck size={15}/> No shame, ever</span><span><Clock3 size={15}/> Under 60 seconds</span></div></div>
      <div className="visual"><div className="halo"/><div className="portrait" aria-label="Animated 3D-style abstract portrait illustration"><div className="head"/><div className="neck"/><div className="body"/></div><div className="float f1"><b>Small counts.</b><small>Progress without pressure</small></div><div className="float f2"><b>One thing at a time</b><small>That's the whole strategy</small></div><span className="art-note">A little progress, every day</span></div>
    </section>
    <section id="workspace" className="workspace"><div className="section-head"><div><p className="eyebrow">YOUR WORKSPACE</p><h2>Let's make it smaller.</h2></div><p>No giant plans. No guilt spiral.<br/>Just the next doable thing.</p></div>
      <div className="columns"><div className="panel"><div className="panel-title"><span className="icon"><Sparkles size={17}/></span><div><b>What's on your mind?</b><small>Messy thoughts are welcome.</small></div></div><form onSubmit={makeStep}><label htmlFor="task">THE THING YOU NEED TO DO</label><textarea id="task" rows={4} value={task} onChange={e=>setTask(e.target.value)} placeholder="e.g. study for my exam, clean my room, reply to that email..." required/><label>WHAT DO YOU NEED RIGHT NOW?</label><div className="modes">{modes.map(m=><button type="button" key={m.id} className={mode===m.id?"selected":""} onClick={()=>setMode(m.id)}>{m.label}</button>)}</div><button className="primary" type="submit" disabled={busy}>{busy?"Finding a tiny step…":<>Find my micro-step <ArrowRight size={16}/></>}</button></form><p className="note"><ShieldCheck size={13}/> Your tasks stay on this device unless you choose to sync with your account.</p></div>
      <div className="panel result">{!response?<div className="empty"><span className="icon large"><Sparkles size={22}/></span><p className="eyebrow">YOUR NEXT STEP</p><h3>We'll figure it out<br/>one breath at a time.</h3><p>Your tiny step will show up here. It should feel almost too easy.</p></div>:<><div className="result-head"><span className="eyebrow">✳ YOUR MICRO-STEP</span><span className="muted"><Clock3 size={13}/> about 30 sec</span></div><h3>{response.optimized_task_title}</h3><div className="step"><span>01</span><p>{response.the_micro_step}</p></div><p className="encouragement">{response.dopamine_hook}</p><div className="time"><b>{response.time_guess_prompt}</b><p>{response.time_feedback}</p><div className="estimate-row"><label htmlFor="estimate">My estimate (minutes)</label><select id="estimate" value={estimate} onChange={e=>setEstimate(e.target.value)}><option value="1">1 minute</option><option value="2">2 minutes</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option></select></div><label htmlFor="reminder">OPTIONAL REMINDER</label><input id="reminder" type="datetime-local" min={new Date(Date.now() + 60000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16)} value={reminderInput} onChange={e=>setReminderInput(e.target.value)}/></div><button className="primary" onClick={saveCurrent}>Save this step <Check size={16}/></button></>}</div></div>
      {notice && <p className="notice" role="status">{notice}</p>}
    </section>
    <section className="tasks-section"><div className="section-head"><div><p className="eyebrow">YOUR PROGRESS</p><h2>Your tiny-step list.</h2></div><p>{completed} completed · {tasks.length} saved<br/>Small counts as progress.</p></div>{tasks.length===0?<div className="panel empty-list"><Sparkles size={20}/><p>Your saved steps will show up here.</p></div>:<div className="task-list">{tasks.map(item=><article className={item.completed?"saved-task is-done":"saved-task"} key={item.id}><button className="done-button" aria-label={item.completed?"Mark as not done":"Mark as complete"} onClick={()=>void toggleDone(item)}>{item.completed?<CheckCircle2 size={21}/>:<span/>}</button><div className="saved-task-copy"><b>{item.title}</b><p>{item.microStep}</p><small>{new Date(item.createdAt).toLocaleString()} · {item.mode.split("_").join(" ").toLowerCase()}{item.reminderAt?" · reminder set":""}</small>{!item.completed&&<details className="time-feedback"><summary>How long did it take?</summary><div className="feedback-fields"><label>Estimated minutes <input type="number" min="1" value={timeGuess || item.estimateMinutes || ""} onChange={e=>setTimeGuess(e.target.value)} /></label><label>Actual minutes <input type="number" min="1" value={actualInput} onChange={e=>setActualInput(e.target.value)} /></label><button className="outline" onClick={()=>void saveTimeFeedback(item)}>Save feedback</button></div></details>}{item.actualMinutes!==null&&<small>Time estimate: {item.estimateMinutes ?? "—"} min · actual: {item.actualMinutes} min</small>}</div><button className="icon-button" aria-label="Delete task" onClick={()=>void deleteTask(item.id)}><Trash2 size={16}/></button></article>)}</div>}</section>
    <section id="account" className="auth"><div><p className="eyebrow">YOUR ACCOUNT</p><h2>A little more support,<br/>when you're ready.</h2><p className="muted">Your local task list works without an account. Your guest tasks and signed-in tasks are kept separate on this device. Cloud sync works when Supabase is configured.</p><p className="security-note"><ShieldCheck size={15}/> Cloud records are protected by user-specific database policies.</p></div><div className="panel auth-panel"><div className="panel-title"><span className="icon"><ShieldCheck size={17}/></span><div><b>{session ? "You're signed in" : authMode==="signup"?"Create your account":"Welcome back"}</b><small>{hasSupabaseConfig?"Secured by Supabase Auth":"Connect Supabase to enable accounts"}</small></div></div>{!session&&<form onSubmit={handleAuth}><label htmlFor="email">EMAIL</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/><label htmlFor="password">PASSWORD</label><input id="password" type="password" minLength={8} autoComplete={authMode==="signup"?"new-password":"current-password"} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/><button className="primary" type="submit">{authMode==="signup"?"Create account":"Sign in"} <ArrowRight size={16}/></button></form>}{!session&&<button className="switch" onClick={()=>{setAuthMode(authMode==="signup"?"signin":"signup");setAuthMessage("");}}>{authMode==="signup"?"Already have an account? Sign in":"New here? Create an account"}</button>}{authMessage&&<p className="auth-message" role="status">{authMessage}</p>}{session&&<><p className="auth-message">Signed in as {session.user.email}</p><button className="outline" onClick={()=>void signOut()}><LogOut size={14}/> Sign out</button></>}</div></section>
    <footer><a className="brand" href="#"><span className="mark"><Sparkles size={14}/></span>todo for ADHD</a><span>Made for real brains, on real days.</span><span>Progress over pressure <b>✳</b></span></footer>
  </main>;
}
