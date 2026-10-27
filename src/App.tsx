import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Check, CheckCircle2, Clock3, LogOut, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getDemoResponse, type AssistantResponse, type TaskMode } from "./lib/assistant";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { hasSupabaseConfig, supabase } from "./lib/supabase";
import {
  type SavedTask,
  loadTasksFromStorage,
  saveTasksToStorage,
  computeNextOccurrence
} from "./lib/storage";
import {
  setupNotificationChannels,
  requestAlarmPermissions,
  ALARM_PERMISSION_LINE,
  scheduleNativeAlarm,
  cancelNativeAlarm,
  syncAlarmsOnLaunch
} from "./lib/notifications";
import { ClockPicker } from "./components/ClockPicker";
import { CountdownRing } from "./components/CountdownRing";
import { TimedPlanBuilder } from "./components/TimedPlanBuilder";
import { TaskProofCamera } from "./components/TaskProofCamera";

function formatTime12(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${period}`;
}

function toDb(task: SavedTask, userId: string) {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    mode: task.mode,
    micro_step: task.microStep,
    created_at: task.createdAt,
    completed: task.completed,
    reminder_at: task.reminderAt,
    estimate_minutes: task.estimateMinutes,
    actual_minutes: task.actualMinutes
  };
}

function fromDb(row: Record<string, unknown>): SavedTask {
  const reminderAtStr = row.reminder_at ? String(row.reminder_at) : null;
  let reminderTimeStr: string | null = null;
  if (reminderAtStr) {
    try {
      const d = new Date(reminderAtStr);
      reminderTimeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch {
      // ignore
    }
  }
  return {
    id: String(row.id),
    title: String(row.title),
    mode: row.mode as TaskMode,
    microStep: String(row.micro_step),
    createdAt: String(row.created_at),
    completed: Boolean(row.completed),
    reminderTime: reminderTimeStr,
    reminderAt: reminderAtStr,
    estimateMinutes: row.estimate_minutes == null ? null : Number(row.estimate_minutes),
    actualMinutes: row.actual_minutes == null ? null : Number(row.actual_minutes)
  };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const [authMessage, setAuthMessage] = useState("");
  const [task, setTask] = useState("");
  const [mode, setMode] = useState<TaskMode>("NEW_TASK");
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [tasks, setTasks] = useState<SavedTask[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  // Clock Picker state
  const [reminderTime, setReminderTime] = useState<string | null>(null);
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  const [isClockOpen, setIsClockOpen] = useState(false);

  const [estimate, setEstimate] = useState("2");
  const [timeGuess, setTimeGuess] = useState("");
  const [actualInput, setActualInput] = useState("");

  // Audio / Timers for Alarms
  const webTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const webRepeatTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const alarmLoop = useRef<ReturnType<typeof setInterval> | null>(null);
  const alarmAudio = useRef<AudioContext | null>(null);
  const [ringingAlarm, setRingingAlarm] = useState<{ title: string; taskId?: string } | null>(null);
  const [proofTask, setProofTask] = useState<SavedTask | null>(null);
  // Always-current task list for native listeners / async handlers (avoids stale closures overwriting saved tasks)
  const tasksRef = useRef<SavedTask[]>(tasks);
  tasksRef.current = tasks;
  const isNative = Capacitor.isNativePlatform();

  // Load persistent tasks from Preferences on native / localStorage on web
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadTasksFromStorage(session?.user.id);
      if (!cancelled) {
        setTasks(stored);
        setIsLoaded(true);
        await syncAlarmsOnLaunch(stored);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  // Persist tasks on every change to Preferences (on device) and localStorage (on web)
  useEffect(() => {
    if (!isLoaded) return;
    void saveTasksToStorage(tasks, session?.user.id);
  }, [tasks, isLoaded, session?.user.id]);

  // Supabase auth & remote sync
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
        setTasks((current) => {
          const byId = new Map(current.map((t) => [t.id, t]));
          remote.forEach((t) => byId.set(t.id, t));
          return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  // Listen to native notifications and re-schedule web alarms (only once saved tasks are loaded)
  useEffect(() => {
    if (!isLoaded) return;
    let receivedSub: { remove: () => Promise<void> } | undefined;
    let actionSub: { remove: () => Promise<void> } | undefined;

    if (Capacitor.isNativePlatform()) {
      void setupNotificationChannels();

      void LocalNotifications.addListener("localNotificationReceived", (notification) => {
        ringAlarm(notification.body || notification.title, notification.extra?.taskId);
      }).then((sub) => {
        receivedSub = sub;
      });

      void LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
        const taskId = action.notification.extra?.taskId;
        if (!taskId) return;
        // Notification actions can reopen the alarm, but cannot bypass camera proof.
        ringAlarm(action.notification.body || action.notification.title, taskId);
      }).then((sub) => {
        actionSub = sub;
      });
    }

    // Web: re-arm in-page timers for saved alarms (native alarms are re-synced by syncAlarmsOnLaunch)
    if (!Capacitor.isNativePlatform()) {
      tasksRef.current.forEach((t) => {
        if (t.reminderAt && !t.completed && new Date(t.reminderAt).getTime() > Date.now()) {
          void scheduleReminder(t.id, t.title, new Date(t.reminderAt), false);
        }
      });
    }

    return () => {
      Object.values(webTimers.current).forEach(clearTimeout);
      Object.values(webRepeatTimers.current).forEach(clearInterval);
      if (receivedSub) void receivedSub.remove();
      if (actionSub) void actionSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  function stopAlarmSound() {
    if (alarmLoop.current) clearInterval(alarmLoop.current);
    alarmLoop.current = null;
    setRingingAlarm(null);
  }

  function ringAlarm(title: string, taskId?: string) {
    setRingingAlarm({ title, taskId });
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("Todo for ADHD · gentle alarm", {
          body: title,
          tag: "todo-adhd-alarm",
          requireInteraction: true
        });
      } catch {
        // Tab alert remains available
      }
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
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.4);
      } catch {
        // notification and visible alarm remain useful
      }
    };
    beep();
    if (alarmLoop.current) clearInterval(alarmLoop.current);
    alarmLoop.current = setInterval(beep, 1400);
    if ("vibrate" in navigator) navigator.vibrate?.([250, 120, 250]);
  }

  async function handleAlarmDone(taskId?: string) {
    // Legacy notification action: never mark a task complete without the camera flow.
    if (taskId) {
      const target = tasksRef.current.find((t) => t.id === taskId);
      if (target) setProofTask(target);
    }
  }

  function beginTaskWithProof(item?: SavedTask) {
    const target = item ?? (ringingAlarm?.taskId
      ? tasksRef.current.find((t) => t.id === ringingAlarm.taskId)
      : tasksRef.current.find((t) => t.title === ringingAlarm?.title));
    if (!target) {
      setNotice("Save this task first, then start it with a quick camera check.");
      return;
    }
    setProofTask(target);
  }

  async function confirmTaskStarted() {
    const item = proofTask;
    if (!item) return;
    stopAlarmSound();
    await cancelReminder(item.id);
    const updated = { ...item, reminderAt: null, reminderTime: null };
    setTasks((current) => current.map((t) => t.id === item.id ? updated : t));
    await persistTask(updated);
    setProofTask(null);
    setNotice("Photo captured in memory only. Alarm stopped — now start your task. It is not marked done.");
  }

  async function handleAlarmSnooze(taskId?: string) {
    stopAlarmSound();
    if (taskId) {
      if (webRepeatTimers.current[taskId]) clearInterval(webRepeatTimers.current[taskId]);
      delete webRepeatTimers.current[taskId];
      if (webTimers.current[taskId]) clearTimeout(webTimers.current[taskId]);
      delete webTimers.current[taskId];
      await cancelNativeAlarm(taskId);

      const snoozeDate = new Date(Date.now() + 5 * 60 * 1000);
      const snoozeTime = `${String(snoozeDate.getHours()).padStart(2, "0")}:${String(
        snoozeDate.getMinutes()
      ).padStart(2, "0")}`;

      const original = tasksRef.current.find((t) => t.id === taskId);
      setTasks((current) =>
        current.map((t) =>
          t.id === taskId
            ? { ...t, reminderTime: snoozeTime, reminderAt: snoozeDate.toISOString() }
            : t
        )
      );

      if (original) {
        const targetTask = { ...original, reminderTime: snoozeTime, reminderAt: snoozeDate.toISOString() };
        void persistTask(targetTask);
        void scheduleReminder(taskId, targetTask.title, snoozeDate, false);
      }
      setNotice("Snoozed for 5 minutes.");
    }
  }

  async function cancelReminder(id: string) {
    if (webTimers.current[id]) clearTimeout(webTimers.current[id]);
    delete webTimers.current[id];
    if (webRepeatTimers.current[id]) clearInterval(webRepeatTimers.current[id]);
    delete webRepeatTimers.current[id];
    await cancelNativeAlarm(id);
  }

  async function scheduleReminder(id: string, title: string, targetDate: Date, askPermission = true) {
    if (webTimers.current[id]) clearTimeout(webTimers.current[id]);
    if (webRepeatTimers.current[id]) clearInterval(webRepeatTimers.current[id]);

    const delay = targetDate.getTime() - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) {
      setNotice("Choose a reminder time in the future.");
      return;
    }

    if (Capacitor.isNativePlatform()) {
      if (askPermission) {
        setNotice(ALARM_PERMISSION_LINE);
        const { granted, explanation } = await requestAlarmPermissions();
        if (!granted) {
          setNotice(explanation || "Enable notifications in device settings for background alarms.");
          return;
        }
      }
      await scheduleNativeAlarm(id, title, targetDate);
      setNotice("Exact alarm scheduled. Repeats every 5 min until Done or Snoozed.");
      return;
    }

    // Web fallback
    if (askPermission) {
      const { explanation } = await requestAlarmPermissions();
      if (explanation) setNotice(explanation);
    } else {
      setNotice("In-browser timer set. Real background alarms need the Android app.");
    }

    if (delay > 2_147_000_000) return;

    webTimers.current[id] = setTimeout(() => {
      ringAlarm(title, id);
      setNotice("Your reminder is ringing. Dismiss it when you are ready.");
      // Repeat web alarm every 5 minutes until Done or Snooze
      webRepeatTimers.current[id] = setInterval(() => {
        ringAlarm(title, id);
      }, 5 * 60 * 1000);
    }, delay);
  }

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    setAuthMessage("");
    if (!supabase) {
      setAuthMessage("Add your Supabase URL and publishable/anon key to .env.local first.");
      return;
    }
    const result =
      authMode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setAuthMessage(result.error.message);
    else if (authMode === "signup" && !result.data.session)
      setAuthMessage("Check your email for the confirmation link, then sign in.");
    else setAuthMessage("You're all set.");
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
  }

  async function makeStep(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    setResponse(null);
    try {
      let result: AssistantResponse | null = null;
      if (supabase && session) {
        const { data, error } = await supabase.functions.invoke("stepwise-assistant", {
          body: { task: task.trim(), mode: "NEW_TASK" }
        });
        if (!error && data && data.the_micro_step) result = data as AssistantResponse;
      }
      const next = result ?? getDemoResponse(task, "NEW_TASK");
      setResponse(next);
      if (!result)
        setNotice(
          session
            ? "Using the built-in fallback. Deploy the Edge Function to enable AI."
            : "Demo mode is ready. Sign in and deploy the AI function to use the connected AI engine."
        );
    } catch {
      setResponse(getDemoResponse(task, mode));
      setNotice("The AI service is unavailable, so a local demo step is shown.");
    } finally {
      setBusy(false);
    }
  }

  async function persistTask(item: SavedTask) {
    if (!session || !supabase) return;
    const { error } = await supabase.from("tasks").upsert(toDb(item, session.user.id));
    if (error) setNotice("Saved on this device. Cloud sync needs setup: " + error.message);
  }

  function saveCurrent() {
    if (!response) return;
    const item: SavedTask = {
      id: crypto.randomUUID(),
      title: response.optimized_task_title,
      mode: response.mode,
      microStep: response.the_micro_step,
      createdAt: new Date().toISOString(),
      completed: false,
      reminderTime: reminderTime,
      reminderAt: reminderAt,
      estimateMinutes: Number(estimate) || null,
      actualMinutes: null
    };

    setTasks((current) => [item, ...current].slice(0, 100));
    void persistTask(item);

    if (item.reminderAt) {
      void scheduleReminder(item.id, item.title, new Date(item.reminderAt));
    } else {
      setNotice("Step saved to your task list.");
    }

    setResponse(null);
    setTask("");
    setReminderTime(null);
    setReminderAt(null);
  }

  async function toggleDone(item: SavedTask) {
    const updated = {
      ...item,
      completed: !item.completed
    };
    setTasks((current) => current.map((t) => (t.id === item.id ? updated : t)));
    if (updated.completed) {
      await cancelReminder(item.id);
    } else if (item.reminderAt && new Date(item.reminderAt).getTime() > Date.now()) {
      await scheduleReminder(item.id, item.title, new Date(item.reminderAt), false);
    }
    await persistTask(updated);
  }

  async function deleteTask(id: string) {
    setTasks((current) => current.filter((t) => t.id !== id));
    await cancelReminder(id);
    if (session && supabase) {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) setNotice("Removed locally; cloud deletion needs setup.");
    }
  }

  async function saveTimeFeedback(item: SavedTask) {
    const actual = Number(actualInput);
    if (!Number.isFinite(actual) || actual <= 0) {
      setNotice("Enter a time greater than zero.");
      return;
    }
    const updated = {
      ...item,
      actualMinutes: actual,
      estimateMinutes: Number(timeGuess) || item.estimateMinutes
    };
    setTasks((current) => current.map((t) => (t.id === item.id ? updated : t)));
    await persistTask(updated);
    setActualInput("");
    setNotice("Time feedback saved. This is information, not a score.");
  }

  const completedCount = tasks.filter((t) => t.completed).length;
  const remainingCount = tasks.filter((t) => !t.completed).length;
  const rightNowTask = tasks.find((t) => !t.completed && t.reminderAt) || tasks.find((t) => !t.completed);

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand" href="#">
          <span className="mark">
            <Sparkles size={17} />
          </span>
          todo for ADHD
        </a>
        <div className="nav-actions">
          <span className="status">
            <i /> gentle mode on
          </span>
          {session ? (
            <button className="outline" onClick={signOut}>
              <LogOut size={14} /> Sign out
            </button>
          ) : (
            <a className="outline" href="#account">
              Sign in
            </a>
          )}
        </div>
      </nav>

      {/* Ringing Alarm Banner */}
      {ringingAlarm && (
        <div className="alarm-banner" role="alert">
          <span>
            <b>Gentle alarm ringing</b>
            <small>{ringingAlarm.title}</small>
          </span>
          <div className="alarm-banner-actions">
            <button className="primary alarm-dismiss" onClick={() => beginTaskWithProof()}>
              Start task <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">ADHD TO DO</p>
          <h1>
            STAY<br />
            <span>HARD.</span>
          </h1>
          <p className="intro">
            A calmer way to get moving. Turn the thing you're avoiding into one tiny step you can do
            right now.
          </p>
          <a className="cta" href="#workspace">
            Find my first step <ArrowRight size={16} />
          </a>
          <div className="trust">
            <span>
              <ShieldCheck size={15} /> No shame, ever
            </span>
            <span>
              <Clock3 size={15} /> Under 60 seconds
            </span>
          </div>
        </div>

        <div className="visual">
          <div className="halo" />
          <img
            className="hero-portrait"
            src="/goggins-hero.jpg"
            alt="David Goggins portrait with Stay Hard"
            width={300}
            height={300}
            data-testid="hero-portrait"
          />
          <p className="hero-quote" data-testid="hero-quote">
            “Every step is evidence the story in your mind is not true.<br /> Forward. Forward.”
          </p>
          <div className="float f1">
            <b>Small counts.</b>
            <small>Progress without pressure</small>
          </div>
          <div className="float f2">
            <b>One thing at a time</b>
            <small>That's the whole strategy</small>
          </div>
          <span className="art-note">A little progress, every day</span>
          <div className="hero-badge" data-testid="hero-badge">{remainingCount} left today</div>
        </div>
      </section>

      {/* Workspace Section */}
      <section id="workspace" className="workspace">
        <div className="section-head">
          <div>
            <p className="eyebrow">YOUR RUNWAY</p>
            <h2>Today’s tasks</h2>
          </div>
          <p>
            No giant plans. No guilt spiral.<br />
            Just the next doable thing.
          </p>
        </div>

        <div className="columns">
          {/* Input Panel */}
          <div className="panel">
            <div className="panel-title">
              <span className="icon">
                <Sparkles size={17} />
              </span>
              <div>
                <b>What needs your focus?</b>
                <small>One thing at a time.</small>
              </div>
            </div>
            <form onSubmit={makeStep}>
              <label htmlFor="task">YOUR NEXT TASK</label>
              <textarea
                id="task"
                rows={4}
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="e.g. study for my exam, clean my room, reply to that email..."
                required
              />
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Finding a tiny step…" : <>Find my micro-step <ArrowRight size={16} /></>}
              </button>
            </form>
            <p className="note">
              <ShieldCheck size={13} /> Your tasks stay on this device unless you choose to sync with
              your account.
            </p>
          </div>

          {/* Micro-step Result Panel */}
          <div className="panel result">
            {!response ? (
              <div className="empty">
                <span className="icon large">
                  <Sparkles size={22} />
                </span>
                <p className="eyebrow">YOUR NEXT STEP</p>
                <h3>
                  We'll figure it out<br />
                  one breath at a time.
                </h3>
                <p>Your tiny step will show up here. It should feel almost too easy.</p>
              </div>
            ) : (
              <>
                <div className="result-head">
                  <span className="eyebrow">✳ YOUR MICRO-STEP</span>
                  <span className="muted">
                    <Clock3 size={13} /> about 30 sec
                  </span>
                </div>
                <h3>{response.optimized_task_title}</h3>
                <div className="step">
                  <span>01</span>
                  <p>{response.the_micro_step}</p>
                </div>
                <p className="encouragement">{response.dopamine_hook}</p>
                <div className="time">
                  <b>{response.time_guess_prompt}</b>
                  <p>{response.time_feedback}</p>
                  <div className="estimate-row">
                    <label htmlFor="estimate">My estimate (minutes)</label>
                    <select
                      id="estimate"
                      value={estimate}
                      onChange={(e) => setEstimate(e.target.value)}
                    >
                      <option value="1">1 minute</option>
                      <option value="2">2 minutes</option>
                      <option value="5">5 minutes</option>
                      <option value="10">10 minutes</option>
                      <option value="15">15 minutes</option>
                    </select>
                  </div>

                  {/* Analog Round Clock Picker Trigger */}
                  <div className="reminder-picker-block">
                    <label>OPTIONAL REMINDER</label>
                    <div className="time-chip-row">
                      <button
                        type="button"
                        className="time-chip-btn"
                        onClick={() => setIsClockOpen(true)}
                        aria-label="Set reminder time with round clock"
                      >
                        <Clock3 size={15} />
                        <span>{reminderTime ? formatTime12(reminderTime) : "Set reminder time"}</span>
                      </button>
                      {reminderTime && (
                        <button
                          type="button"
                          className="time-chip-clear"
                          onClick={() => {
                            setReminderTime(null);
                            setReminderAt(null);
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {reminderTime && reminderAt && (
                      <small className="reminder-schedule-note">
                        Scheduled for {formatTime12(reminderTime)}{" "}
                        {new Date(reminderAt).getDate() !== new Date().getDate() ? "(tomorrow)" : "(today)"}
                      </small>
                    )}
                    {!isNative && (
                      <small className="reminder-web-note" data-testid="web-alarm-note">
                        In the browser this rings while the tab is open. Real alarms need the Android app.
                      </small>
                    )}
                  </div>
                </div>
                <button className="primary" onClick={saveCurrent}>
                  Save this step <Check size={16} />
                </button>
              </>
            )}
          </div>
        </div>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
      </section>

      <TimedPlanBuilder />

      {/* Tasks Section with 'Right now' Card and Task List */}
      <section className="tasks-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">YOUR RUNWAY</p>
            <h2>Today’s tasks</h2>
          </div>
          <p>
            {completedCount} completed · {tasks.length} saved<br />
            Small counts as progress.
          </p>
        </div>

        {/* Featured 'Right now' Card if an active task exists */}
        {rightNowTask && (
          <div className="right-now-card">
            <div className="right-now-header">
              <span className="eyebrow">✳ RIGHT NOW</span>
              <span className="right-now-tag">Current focus</span>
            </div>
            <div className="right-now-body">
              <div className="right-now-info">
                <h3>{rightNowTask.title}</h3>
                <p className="right-now-micro">{rightNowTask.microStep}</p>
                {rightNowTask.reminderTime && (
                  <div className="right-now-meta">
                    <Clock3 size={13} />
                    <span>Alarm: {formatTime12(rightNowTask.reminderTime)}</span>
                  </div>
                )}
              </div>
              {rightNowTask.reminderAt && (
                <CountdownRing
                  reminderAt={rightNowTask.reminderAt}
                  createdAt={rightNowTask.createdAt}
                  size="big"
                />
              )}
            </div>
            <div className="right-now-actions">
              <button
                type="button"
                className="primary right-now-done-btn"
                onClick={() => beginTaskWithProof(rightNowTask)}
              >
                Start task <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="panel empty-list">
            <Sparkles size={20} />
            <p>Your saved steps will show up here.</p>
          </div>
        ) : (
          <div className="task-list">
            {tasks.map((item) => (
              <article
                className={item.completed ? "saved-task is-done" : "saved-task"}
                key={item.id}
              >
                <button
                  className="done-button"
                  aria-label={item.completed ? "Mark as not done" : "Mark as complete"}
                  onClick={() => void toggleDone(item)}
                >
                  {item.completed ? <CheckCircle2 size={21} /> : <span />}
                </button>
                <div className="saved-task-copy">
                  <b>{item.title}</b>
                  <p>{item.microStep}</p>
                  <small>
                    {new Date(item.createdAt).toLocaleDateString()} ·{" "}
                    {item.mode.split("_").join(" ").toLowerCase()}
                    {item.reminderTime ? ` · alarm ${formatTime12(item.reminderTime)}` : ""}
                  </small>
                  {/* Small round countdown ring on list rows with an alarm */}
                  {item.reminderAt && !item.completed && (
                    <CountdownRing
                      reminderAt={item.reminderAt}
                      createdAt={item.createdAt}
                      size="small"
                    />
                  )}
                  {!item.completed && (
                    <details className="time-feedback">
                      <summary>How long did it take?</summary>
                      <div className="feedback-fields">
                        <label>
                          Estimated minutes{" "}
                          <input
                            type="number"
                            min="1"
                            value={timeGuess || item.estimateMinutes || ""}
                            onChange={(e) => setTimeGuess(e.target.value)}
                          />
                        </label>
                        <label>
                          Actual minutes{" "}
                          <input
                            type="number"
                            min="1"
                            value={actualInput}
                            onChange={(e) => setActualInput(e.target.value)}
                          />
                        </label>
                        <button className="outline" onClick={() => void saveTimeFeedback(item)}>
                          Save feedback
                        </button>
                      </div>
                    </details>
                  )}
                  {item.actualMinutes !== null && (
                    <small>
                      Time estimate: {item.estimateMinutes ?? "—"} min · actual: {item.actualMinutes} min
                    </small>
                  )}
                </div>
                <button
                  className="icon-button"
                  aria-label="Delete task"
                  onClick={() => void deleteTask(item.id)}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {proofTask && <TaskProofCamera taskTitle={proofTask.title} onCancel={() => setProofTask(null)} onConfirm={() => void confirmTaskStarted()} />}

      {/* Clock Picker Modal Bottom Sheet */}
      <ClockPicker
        isOpen={isClockOpen}
        initialTime={reminderTime}
        onSet={(time24) => {
          setReminderTime(time24);
          const nextDate = computeNextOccurrence(time24);
          setReminderAt(nextDate.toISOString());
          setIsClockOpen(false);
        }}
        onCancel={() => setIsClockOpen(false)}
      />

      <footer>
        <a className="brand" href="#">
          <span className="mark">
            <Sparkles size={14} />
          </span>
          todo for ADHD
        </a>
        <span>Made for real brains, on real days.</span>
        <span>
          Progress over pressure <b>✳</b>
        </span>
      </footer>
    </main>
  );
}
