import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Check, CheckCircle2, Clock3, LogOut, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getDemoResponse, type AssistantResponse, type TaskMode } from "./lib/assistant";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { hasSupabaseConfig, supabase } from "./lib/supabase";

const heroPortrait = "data:image/jpeg;base64,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";

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
  const alarmLoop = useRef<ReturnType<typeof setInterval> | null>(null);
  const alarmAudio = useRef<AudioContext | null>(null);
  const [ringingAlarm, setRingingAlarm] = useState("");
  const previousStorageKey = useRef(storageKey());
  const nativeAlarmIds = useRef<Record<string, number>>({});

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
    let listener: { remove: () => Promise<void> } | undefined;
    if (Capacitor.isNativePlatform()) {
      void LocalNotifications.addListener("localNotificationReceived", notification => {
        if (notification.body) ringAlarm(notification.body);
      }).then(value => { listener = value; });
    }
    tasks.forEach(t => {
      if (t.reminderAt && !t.completed && new Date(t.reminderAt).getTime() > Date.now()) {
        scheduleReminder(t.id, t.title, t.reminderAt, false);
      }
    });
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
      if (listener) void listener.remove();
    };
  // Reminders are rehydrated when the saved task list is first loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopAlarm() {
    if (alarmLoop.current) clearInterval(alarmLoop.current);
    alarmLoop.current = null;
    setRingingAlarm("");
  }
  function ringAlarm(title: string) {
    setRingingAlarm(title);
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification("Todo for ADHD · gentle alarm", { body: title, tag: "todo-adhd-alarm" }); } catch { /* tab alert remains available */ }
    }
    const beep = () => {
      try {
        const AudioContextClass = window.AudioContext;
        if (!AudioContextClass) return;
        const ctx = alarmAudio.current ?? new AudioContextClass();
        alarmAudio.current = ctx;
        if (ctx.state === "suspended") void ctx.resume();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
        oscillator.connect(gain); gain.connect(ctx.destination);
        oscillator.start(); oscillator.stop(ctx.currentTime + 0.4);
      } catch { /* notification and visible alarm are still useful */ }
    };
    beep();
    if (alarmLoop.current) clearInterval(alarmLoop.current);
    alarmLoop.current = setInterval(beep, 1400);
    if ("vibrate" in navigator) navigator.vibrate?.([250, 120, 250]);
  }
  function notificationId(id: string) {
    if (!nativeAlarmIds.current[id]) {
      let hash = 0;
      for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
      nativeAlarmIds.current[id] = (hash % 2_000_000_000) + 1;
    }
    return nativeAlarmIds.current[id];
  }
  async function cancelReminder(id: string) {
    if (timers.current[id]) clearTimeout(timers.current[id]);
    delete timers.current[id];
    if (Capacitor.isNativePlatform()) {
      try { await LocalNotifications.cancel({ notifications: [{ id: notificationId(id) }] }); } catch { /* already cancelled */ }
    }
  }
  function scheduleReminder(id: string, title: string, at: string, askPermission = true) {
    if (timers.current[id]) clearTimeout(timers.current[id]);
    const delay = new Date(at).getTime() - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) { setNotice("Choose a reminder time in the future."); return; }
    if (Capacitor.isNativePlatform()) {
      void (async () => {
        let permission = await LocalNotifications.checkPermissions();
        if (permission.display !== "granted" && askPermission) permission = await LocalNotifications.requestPermissions();
        if (permission.display !== "granted") {
          setNotice("Enable notifications for Todo for ADHD in device settings to schedule background reminders.");
          return;
        }
        await LocalNotifications.schedule({ notifications: [{
          id: notificationId(id),
          title: "Todo for ADHD · gentle reminder",
          body: title,
          schedule: { at: new Date(at), allowWhileIdle: true },
          sound: "default",
          extra: { taskId: id }
        }] });
        setNotice("Reminder scheduled with your device's notification system.");
      })().catch(() => setNotice("Could not schedule the device notification. Check notification permission in Settings."));
      return;
    }
    if (delay > 2_147_000_000) { setNotice("That reminder is too far away for a browser timer. Choose a nearer time."); return; }
    const start = () => {
      timers.current[id] = setTimeout(() => {
        ringAlarm(title);
        setNotice("Your reminder is ringing. Dismiss it when you are ready.");
        setTasks(current => current.map(t => t.id === id ? { ...t, reminderAt: null } : t));
      }, delay);
      setNotice("Reminder set. Keep this tab open for the most reliable reminder.");
    };
    if (!("Notification" in window)) { start(); return; }
    if (Notification.permission === "granted") { start(); return; }
    if (!askPermission) { start(); return; }
    Notification.requestPermission().then(permission => {
      if (permission === "granted") start();
      else { start(); setNotice("In-page reminder set. Allow notifications for a desktop alert."); }
    });
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
    void cancelReminder(item.id);
    await persistTask(updated);
  }
  async function deleteTask(id: string) {
    setTasks(current => current.filter(t => t.id !== id));
    void cancelReminder(id);
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
    {ringingAlarm && <div className="alarm-banner" role="alert"><span><b>Gentle alarm</b><small>{ringingAlarm}</small></span><button className="primary alarm-dismiss" onClick={stopAlarm}>Dismiss alarm <Check size={15}/></button></div>}
    <section className="hero">
      <div className="hero-copy"><p className="eyebrow">ADHD TO DO</p><h1>STAY<br/><span>HARD.</span></h1><p className="intro">A calmer way to get moving. Turn the thing you're avoiding into one tiny step you can do right now.</p><a className="cta" href="#workspace">Find my first step <ArrowRight size={16}/></a><div className="trust"><span><ShieldCheck size={15}/> No shame, ever</span><span><Clock3 size={15}/> Under 60 seconds</span></div></div>
      <div className="visual"><div className="halo"/><img className="hero-portrait" src={heroPortrait} alt="David Goggins portrait with the words Stay Hard" /><div className="float f1"><b>Small counts.</b><small>Progress without pressure</small></div><div className="float f2"><b>One thing at a time</b><small>That's the whole strategy</small></div><span className="art-note">A little progress, every day</span></div>
    </section>
    <section id="workspace" className="workspace"><div className="section-head"><div><p className="eyebrow">YOUR RUNWAY</p><h2>Today’s tasks</h2></div><p>No giant plans. No guilt spiral.<br/>Just the next doable thing.</p></div>
      <div className="columns"><div className="panel"><div className="panel-title"><span className="icon"><Sparkles size={17}/></span><div><b>What needs your focus?</b><small>One thing at a time.</small></div></div><form onSubmit={makeStep}><label htmlFor="task">YOUR NEXT TASK</label><textarea id="task" rows={4} value={task} onChange={e=>setTask(e.target.value)} placeholder="e.g. study for my exam, clean my room, reply to that email..." required/><label>WHAT DO YOU NEED RIGHT NOW?</label><div className="modes">{modes.map(m=><button type="button" key={m.id} className={mode===m.id?"selected":""} onClick={()=>setMode(m.id)}>{m.label}</button>)}</div><button className="primary" type="submit" disabled={busy}>{busy?"Finding a tiny step…":<>Find my micro-step <ArrowRight size={16}/></>}</button></form><p className="note"><ShieldCheck size={13}/> Your tasks stay on this device unless you choose to sync with your account.</p></div>
      <div className="panel result">{!response?<div className="empty"><span className="icon large"><Sparkles size={22}/></span><p className="eyebrow">YOUR NEXT STEP</p><h3>We'll figure it out<br/>one breath at a time.</h3><p>Your tiny step will show up here. It should feel almost too easy.</p></div>:<><div className="result-head"><span className="eyebrow">✳ YOUR MICRO-STEP</span><span className="muted"><Clock3 size={13}/> about 30 sec</span></div><h3>{response.optimized_task_title}</h3><div className="step"><span>01</span><p>{response.the_micro_step}</p></div><p className="encouragement">{response.dopamine_hook}</p><div className="time"><b>{response.time_guess_prompt}</b><p>{response.time_feedback}</p><div className="estimate-row"><label htmlFor="estimate">My estimate (minutes)</label><select id="estimate" value={estimate} onChange={e=>setEstimate(e.target.value)}><option value="1">1 minute</option><option value="2">2 minutes</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option></select></div><label htmlFor="reminder">OPTIONAL REMINDER</label><input id="reminder" type="datetime-local" min={new Date(Date.now() + 60000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16)} value={reminderInput} onChange={e=>setReminderInput(e.target.value)}/></div><button className="primary" onClick={saveCurrent}>Save this step <Check size={16}/></button></>}</div></div>
      {notice && <p className="notice" role="status">{notice}</p>}
    </section>
    <section className="tasks-section"><div className="section-head"><div><p className="eyebrow">YOUR RUNWAY</p><h2>Today’s tasks</h2></div><p>{completed} completed · {tasks.length} saved<br/>Small counts as progress.</p></div>{tasks.length===0?<div className="panel empty-list"><Sparkles size={20}/><p>Your saved steps will show up here.</p></div>:<div className="task-list">{tasks.map(item=><article className={item.completed?"saved-task is-done":"saved-task"} key={item.id}><button className="done-button" aria-label={item.completed?"Mark as not done":"Mark as complete"} onClick={()=>void toggleDone(item)}>{item.completed?<CheckCircle2 size={21}/>:<span/>}</button><div className="saved-task-copy"><b>{item.title}</b><p>{item.microStep}</p><small>{new Date(item.createdAt).toLocaleString()} · {item.mode.split("_").join(" ").toLowerCase()}{item.reminderAt?" · reminder set":""}</small>{!item.completed&&<details className="time-feedback"><summary>How long did it take?</summary><div className="feedback-fields"><label>Estimated minutes <input type="number" min="1" value={timeGuess || item.estimateMinutes || ""} onChange={e=>setTimeGuess(e.target.value)} /></label><label>Actual minutes <input type="number" min="1" value={actualInput} onChange={e=>setActualInput(e.target.value)} /></label><button className="outline" onClick={()=>void saveTimeFeedback(item)}>Save feedback</button></div></details>}{item.actualMinutes!==null&&<small>Time estimate: {item.estimateMinutes ?? "—"} min · actual: {item.actualMinutes} min</small>}</div><button className="icon-button" aria-label="Delete task" onClick={()=>void deleteTask(item.id)}><Trash2 size={16}/></button></article>)}</div>}</section>
    <footer><a className="brand" href="#"><span className="mark"><Sparkles size={14}/></span>todo for ADHD</a><span>Made for real brains, on real days.</span><span>Progress over pressure <b>✳</b></span></footer>
  </main>;
}
