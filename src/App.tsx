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
import { LoadingScreen } from "./components/LoadingScreen";
import {
  buddyAvailable,
  buildInviteLink,
  createInvite,
  loadLocalBuddy,
  pollOwner,
  pushBuddyStatus,
  saveLocalBuddy,
  setBuddyState,
  type BuddyActivity,
  type LocalBuddy
} from "./lib/buddy";

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
    actual_minutes: task.actualMinutes,
    progress_note: task.progressNote ?? ""
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
    actualMinutes: row.actual_minutes == null ? null : Number(row.actual_minutes),
    progressNote: String(row.progress_note ?? "")
  };
}

export default function App() {
  const [showLoading, setShowLoading] = useState(true);
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
  const [points, setPoints] = useState(() => Number(localStorage.getItem("todo-adhd.points") || 0));
  const [streak, setStreak] = useState(() => Number(localStorage.getItem("todo-adhd.streak") || 0));
  const [lastCompletionDay, setLastCompletionDay] = useState(() => localStorage.getItem("todo-adhd.lastDay") || "");
  const [rewardToast, setRewardToast] = useState("");
  const [undoTask, setUndoTask] = useState<SavedTask | null>(null);
  const [undoStreakSnapshot, setUndoStreakSnapshot] = useState<{ streak: number; lastDay: string } | null>(null);
  const [qualifiedFocusTasks, setQualifiedFocusTasks] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("todo-adhd.qualifiedFocusTasks") || "[]"); }
    catch { return []; }
  });
  const [burstTaskId, setBurstTaskId] = useState<string | null>(null);
  const [floatingReward, setFloatingReward] = useState<{ taskId: string; label: string } | null>(null);
  const [rewardSettings, setRewardSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("todo-adhd.rewardSettings") || '{"sound":true,"haptics":true,"animations":true}'); }
    catch { return { sound: true, haptics: true, animations: true }; }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [focusRemaining, setFocusRemaining] = useState(1500);
  const [focusPaused, setFocusPaused] = useState(false);
  const [focusElapsed, setFocusElapsed] = useState(0);
  const [focusQualified, setFocusQualified] = useState(false);
  const [focusMicroStep, setFocusMicroStep] = useState("");
  const [focusProgressNote, setFocusProgressNote] = useState("");
  const [focusedTasks, setFocusedTasks] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("todo-adhd.focusedTasks") || "[]"); } catch { return []; } });
  const [lastReward, setLastReward] = useState<{taskId:string; points:number; bonus:number} | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInExpired, setCheckInExpired] = useState(false);
  const checkInTimeout = useRef<number | null>(null);
  const [checkInFrequency, setCheckInFrequencyState] = useState(() => {
    const saved = Number(localStorage.getItem("todo-adhd.checkInFrequency"));
    return [5, 10, 15].includes(saved) ? saved : 10;
  });
  function setCheckInFrequency(value: number) {
    setCheckInFrequencyState(value);
    localStorage.setItem("todo-adhd.checkInFrequency", String(value));
  }

  // Accountability buddy
  const [buddy, setBuddy] = useState<LocalBuddy | null>(() => loadLocalBuddy());
  const buddyRef = useRef<LocalBuddy | null>(buddy);
  buddyRef.current = buddy;
  const [buddyName, setBuddyName] = useState(() => localStorage.getItem("todo-adhd.buddyOwnerName") || "");
  const [buddyBusy, setBuddyBusy] = useState(false);
  const [cheerFloat, setCheerFloat] = useState("");
  const [sharedTasks, setSharedTasks] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("todo-adhd.sharedTasks") || "[]"); } catch { return []; }
  });
  const sharedTasksRef = useRef<string[]>(sharedTasks);
  sharedTasksRef.current = sharedTasks;
  const focusSessionId = useRef("");
  const lastBuddyActivity = useRef<BuddyActivity>("idle");

  // "Did you finish this one?" check (asked once per task)
  const [tooFastTask, setTooFastTask] = useState<SavedTask | null>(null);
  const [askedTooFast, setAskedTooFast] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("todo-adhd.askedTooFast") || "[]"); } catch { return []; }
  });

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
        // Notification actions reopen the alarm so it can be dismissed.
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
        new Notification("Vinai · gentle alarm", {
          body: title,
          tag: "vinai-alarm",
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
    if (!taskId) return;
    const target = tasksRef.current.find((t) => t.id === taskId);
    if (target) void toggleDone(target);
  }

  function startTaskFromAlarm(item?: SavedTask) {
    const target = item ?? (ringingAlarm?.taskId
      ? tasksRef.current.find((t) => t.id === ringingAlarm.taskId)
      : tasksRef.current.find((t) => t.title === ringingAlarm?.title));
    if (!target) {
      stopAlarmSound();
      setNotice("Save this task first, then start it from your task list.");
      return;
    }
    stopAlarmSound();
    void cancelReminder(target.id);
    const updated = { ...target, reminderAt: null, reminderTime: null };
    setTasks((current) => current.map((t) => t.id === target.id ? updated : t));
    void persistTask(updated);
    setNotice("Alarm stopped. You can start working whenever you are ready.");
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
    const payload = toDb(item, session.user.id);
    const { error } = await supabase.from("tasks").upsert(payload);
    if (error && /progress_note|column/i.test(error.message)) {
      // Keep older Supabase projects syncing tasks until migration 003 is applied.
      const { progress_note: _progressNote, ...legacyPayload } = payload;
      const retry = await supabase.from("tasks").upsert(legacyPayload);
      if (!retry.error) {
        setNotice("Task synced. Apply migration 003 to sync focus notes to the cloud too.");
        return;
      }
      setNotice("Saved on this device. Cloud sync needs setup: " + retry.error.message);
      return;
    }
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

  async function toggleDone(item: SavedTask, skipCheck = false) {
    const nowDone = !item.completed;
    if (nowDone && !skipCheck && focusTaskId !== item.id && item.estimateMinutes && !askedTooFast.includes(item.id)) {
      const elapsedMs = Date.now() - new Date(item.createdAt).getTime();
      if (elapsedMs < item.estimateMinutes * 60000 * 0.2) {
        const next = [...askedTooFast, item.id];
        setAskedTooFast(next);
        localStorage.setItem("todo-adhd.askedTooFast", JSON.stringify(next));
        setTooFastTask(item);
        return;
      }
    }
    const updated = { ...item, completed: nowDone };
    // Update UI and play reward feedback before awaiting persistence.
    setTasks((current) => current.map((t) => (t.id === item.id ? updated : t)));
    if (nowDone) {
      const today = new Date().toLocaleDateString("en-CA");
      const yd = new Date(); yd.setDate(yd.getDate() - 1);
      const yesterday = yd.toLocaleDateString("en-CA");
      setUndoStreakSnapshot({ streak, lastDay: lastCompletionDay });
      const nextStreak = lastCompletionDay === today ? streak : lastCompletionDay === yesterday ? streak + 1 : 1;
      setStreak(nextStreak); setLastCompletionDay(today);
      localStorage.setItem("todo-adhd.streak", String(nextStreak));
      localStorage.setItem("todo-adhd.lastDay", today);
      const bonus = Math.random() < 0.2;
      const focused = (focusTaskId === item.id && focusQualified) || qualifiedFocusTasks.includes(item.id);
      const reward = focused ? 15 : 10;
      const bonusPoints = bonus ? 25 : 0;
      const nextPoints = points + reward + bonusPoints;
      setLastReward({ taskId: item.id, points: reward, bonus: bonusPoints });
      if (focused) {
        const nextFocused = Array.from(new Set([...focusedTasks, item.id]));
        setFocusedTasks(nextFocused);
        localStorage.setItem("todo-adhd.focusedTasks", JSON.stringify(nextFocused));
        const nextQualified = qualifiedFocusTasks.filter((id) => id !== item.id);
        setQualifiedFocusTasks(nextQualified);
        localStorage.setItem("todo-adhd.qualifiedFocusTasks", JSON.stringify(nextQualified));
      }
      setPoints(nextPoints); localStorage.setItem("todo-adhd.points", String(nextPoints));
      if (rewardSettings.animations) {
        setRewardToast(bonus ? "+25 bonus! You're on fire!" : "+" + reward + " points");
        setFloatingReward({ taskId: item.id, label: "+" + reward + (bonus ? " · +25 bonus!" : "") });
        window.setTimeout(() => setFloatingReward((current) => current?.taskId === item.id ? null : current), 1400);
      }
      window.setTimeout(() => setRewardToast(""), 1800);
      if (rewardSettings.haptics && "vibrate" in navigator) navigator.vibrate?.(bonus ? [25, 35, 25] : 18);
      if (rewardSettings.sound) {
        try {
          const ctx = alarmAudio.current ?? new AudioContext(); alarmAudio.current = ctx;
          if (ctx.state === "suspended") void ctx.resume();
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.type = "sine"; osc.frequency.setValueAtTime(bonus ? 880 : 660, ctx.currentTime);
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
          osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.17);
        } catch {}
      }
      if (rewardSettings.animations) {
        setBurstTaskId(item.id);
        window.setTimeout(() => setBurstTaskId((current) => current === item.id ? null : current), 800);
      }
      setUndoTask(item);
      window.setTimeout(() => setUndoTask((current) => current?.id === item.id ? null : current), 5000);
      if (focusTaskId === item.id) setFocusTaskId(null);
      if (sharedTasksRef.current.includes(item.id)) {
        syncBuddy("", "done", "done-" + Date.now());
      } else {
        // A private task never sends a completion event to the buddy.
        syncBuddy("", "idle", "");
      }
      void (async () => { await cancelReminder(item.id); await persistTask(updated); })();
    } else {
      setUndoTask(null);
      if (item.reminderAt && new Date(item.reminderAt).getTime() > Date.now()) void scheduleReminder(item.id, item.title, new Date(item.reminderAt), false);
      void persistTask(updated);
    }
  }

  function undoCompletion() {
    if (!undoTask) return;
    const restored = { ...undoTask, completed: false };
    setTasks((current) => current.map((t) => t.id === restored.id ? restored : t));
    setUndoTask(null);
    const removePoints = lastReward?.taskId === restored.id ? lastReward.points + lastReward.bonus : 10;
    setPoints((current) => { const next = Math.max(0, current - removePoints); localStorage.setItem("todo-adhd.points", String(next)); return next; });
    if (undoStreakSnapshot) {
      setStreak(undoStreakSnapshot.streak);
      setLastCompletionDay(undoStreakSnapshot.lastDay);
      localStorage.setItem("todo-adhd.streak", String(undoStreakSnapshot.streak));
      localStorage.setItem("todo-adhd.lastDay", undoStreakSnapshot.lastDay);
    }
    if (lastReward?.taskId === restored.id && lastReward.points === 15) {
      const nextQualified = Array.from(new Set([...qualifiedFocusTasks, restored.id]));
      setQualifiedFocusTasks(nextQualified);
      localStorage.setItem("todo-adhd.qualifiedFocusTasks", JSON.stringify(nextQualified));
    }
    const nextFocused = focusedTasks.filter((id) => id !== restored.id);
    setFocusedTasks(nextFocused); localStorage.setItem("todo-adhd.focusedTasks", JSON.stringify(nextFocused));
    setLastReward(null);
    setUndoStreakSnapshot(null);
    syncBuddy("", "idle", "");
    void persistTask(restored);
  }

  function beginFocus(item: SavedTask) {
    if (item.completed) return;
    focusSessionId.current = "focus-" + Date.now();
    lastBuddyActivity.current = "idle";
    stopAlarmSound(); setFocusTaskId(item.id); setFocusMinutes(25); setFocusRemaining(1500);
    setFocusElapsed(0); setFocusQualified(false); setFocusPaused(false); setCheckInOpen(false);
    setFocusMicroStep(item.microStep || "");
    setFocusProgressNote(item.progressNote || "");
  }

  function updateFocusDetail(field: "microStep" | "progressNote", value: string) {
    if (!focusTaskId) return;
    if (field === "microStep") setFocusMicroStep(value);
    else setFocusProgressNote(value);
    const current = tasksRef.current.find((entry) => entry.id === focusTaskId);
    if (!current) return;
    const updated = { ...current, [field]: value };
    setTasks((entries) => entries.map((entry) => entry.id === focusTaskId ? updated : entry));
  }

  function saveFocusDetails() {
    if (!focusTaskId) return;
    const current = tasksRef.current.find((entry) => entry.id === focusTaskId);
    if (!current) return;
    void persistTask({ ...current, microStep: focusMicroStep, progressNote: focusProgressNote });
  }

  function endFocus() {
    if (checkInTimeout.current) clearTimeout(checkInTimeout.current);
    checkInTimeout.current = null;
    if (focusTaskId && focusQualified) {
      const nextQualified = Array.from(new Set([...qualifiedFocusTasks, focusTaskId]));
      setQualifiedFocusTasks(nextQualified);
      localStorage.setItem("todo-adhd.qualifiedFocusTasks", JSON.stringify(nextQualified));
    }
    setFocusTaskId(null);
    setFocusPaused(false);
    setCheckInOpen(false);
    setCheckInExpired(false);
  }

  function updateRewardSetting(key: string, value: unknown) {
    setRewardSettings((current: Record<string, unknown>) => {
      const next = { ...current, [key]: value };
      localStorage.setItem("todo-adhd.rewardSettings", JSON.stringify(next));
      return next;
    });
  }

  function respondToCheckIn(continueSession: boolean) {
    if (checkInTimeout.current) clearTimeout(checkInTimeout.current);
    checkInTimeout.current = null;
    setCheckInOpen(false);
    setCheckInExpired(false);
    if (continueSession) setFocusQualified(true);
    else setFocusPaused(true);
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

  function syncBuddy(label: string, activity: BuddyActivity, sessionId: string) {
    const current = buddyRef.current;
    if (!current || current.state === "removed") return;
    lastBuddyActivity.current = activity;
    void pushBuddyStatus(current, label, activity, sessionId);
  }

  function toggleShared(taskId: string, on: boolean) {
    const next = on ? Array.from(new Set([...sharedTasks, taskId])) : sharedTasks.filter((id) => id !== taskId);
    setSharedTasks(next);
    localStorage.setItem("todo-adhd.sharedTasks", JSON.stringify(next));
  }

  async function inviteBuddy() {
    const name = buddyName.trim();
    if (!name) { setNotice("Add the name your buddy should see first."); return; }
    setBuddyBusy(true);
    localStorage.setItem("todo-adhd.buddyOwnerName", name);
    const created = await createInvite(name);
    setBuddyBusy(false);
    if (!created) { setNotice("Couldn't create the invite right now. Try again in a moment."); return; }
    setBuddy(created);
    void shareInvite(created);
  }

  async function shareInvite(target: LocalBuddy | null = buddy) {
    if (!target) return;
    const link = buildInviteLink(target.token);
    const text = target.ownerName + " invited you to be their buddy: " + link;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
    } catch { /* fall through to copy */ }
    try { await navigator.clipboard.writeText(link); setNotice("Invite link copied."); }
    catch { setNotice(link); }
  }

  async function changeBuddySharing(state: "active" | "paused" | "removed") {
    const current = buddyRef.current;
    if (!current) return;
    setBuddyBusy(true);
    await setBuddyState(current, state);
    setBuddyBusy(false);
    if (state === "removed") { saveLocalBuddy(null); setBuddy(null); return; }
    const next = { ...current, state };
    saveLocalBuddy(next);
    setBuddy(next);
  }

  // Poll for cheers and buddy acceptance (only while a buddy exists)
  useEffect(() => {
    if (!buddy) return;
    let cancelled = false;
    const poll = async () => {
      const current = buddyRef.current;
      if (!current) return;
      const result = await pollOwner(current);
      if (cancelled || !result) return;
      const next: LocalBuddy = { ...current, state: result.state, lastCheerId: Math.max(current.lastCheerId, result.lastId) };
      if (next.state !== current.state || next.lastCheerId !== current.lastCheerId) {
        saveLocalBuddy(next);
        setBuddy(next);
      }
      if (result.emojis.length > 0) {
        const emoji = result.emojis[result.emojis.length - 1];
        setRewardToast("Your buddy sent a cheer " + emoji);
        window.setTimeout(() => setRewardToast(""), 2400);
        if (rewardSettings.animations) {
          setCheerFloat(emoji);
          window.setTimeout(() => setCheerFloat(""), 2200);
        }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 8000);
    return () => { cancelled = true; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buddy?.token, rewardSettings.animations]);

  // Keep the buddy's view of the focus session current
  useEffect(() => {
    if (focusTaskId) {
      const shared = sharedTasksRef.current.includes(focusTaskId);
      const title = tasksRef.current.find((t) => t.id === focusTaskId)?.title ?? "";
      syncBuddy(shared ? title : "Working on something", focusPaused ? "break" : "focusing", focusSessionId.current);
    } else if (lastBuddyActivity.current === "focusing" || lastBuddyActivity.current === "break") {
      syncBuddy("", "idle", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTaskId, focusPaused, sharedTasks]);

  // Gentle check-in notification + soft chime
  useEffect(() => {
    if (!checkInOpen) return;
    const soundOn = rewardSettings.notifySound !== false;
    if (soundOn) {
      try {
        const ctx = alarmAudio.current ?? new AudioContext(); alarmAudio.current = ctx;
        if (ctx.state === "suspended") void ctx.resume();
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.setValueAtTime(523, ctx.currentTime);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.52);
      } catch { /* audio unavailable */ }
    }
    if (Capacitor.isNativePlatform()) {
      void LocalNotifications.schedule({ notifications: [{ id: 91000001, title: "Still on it?", body: "A quick, no-pressure check-in.", schedule: { at: new Date(Date.now() + 400) }, ...(soundOn ? { sound: "default" } : {}) }] }).catch(() => undefined);
    } else if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification("Still on it?", { body: "A quick, no-pressure check-in.", tag: "todo-adhd-checkin", silent: !soundOn }); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkInOpen]);

  const completedCount = tasks.filter((t) => t.completed).length;
  const activeFocusTask = tasks.find((t) => t.id === focusTaskId) ?? null;

  useEffect(() => {
    if (!focusTaskId || focusPaused || checkInOpen || focusRemaining <= 0) return;
    const tick = window.setInterval(() => {
      setFocusRemaining((remaining) => {
        if (remaining <= 1) { setFocusPaused(true); setFocusQualified(true); setRewardToast("Focus session complete — nice work!"); return 0; }
        return remaining - 1;
      });
      setFocusElapsed((elapsed) => {
        const next = elapsed + 1;
        if (next > 0 && next % (checkInFrequency * 60) === 0) setCheckInOpen(true);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [focusTaskId, focusPaused, checkInOpen, focusRemaining, checkInFrequency]);

  useEffect(() => {
    if (!checkInOpen) return;
    if (checkInTimeout.current) clearTimeout(checkInTimeout.current);
    checkInTimeout.current = window.setTimeout(() => {
      setCheckInOpen(false);
      setFocusPaused(true);
      setCheckInExpired(true);
      checkInTimeout.current = null;
    }, 120000);
    return () => {
      if (checkInTimeout.current) clearTimeout(checkInTimeout.current);
      checkInTimeout.current = null;
    };
  }, [checkInOpen]);

  const remainingCount = tasks.filter((t) => !t.completed).length;
  const rightNowTask = tasks.find((t) => !t.completed && t.reminderAt) || tasks.find((t) => !t.completed);

  return (
    <main className="shell">
      <nav className="nav">
        <a className="brand vinai-brand" href="#">
          <img src="/vinai_launcher.png" alt="Vinai" className="brand-logo-img" />
          <span className="brand-name">VINAI</span>
          <span className="brand-tamil">வினை</span>
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
            <button className="primary alarm-dismiss" onClick={() => startTaskFromAlarm()}>
              Start task <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">VINAI</p>
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
        <div className="reward-summary">
          <div><small>YOUR POINTS</small><strong>{points}</strong></div>
          <div><small>DAILY STREAK</small><strong>🔥 {streak}</strong><span>{lastCompletionDay === new Date().toLocaleDateString("en-CA") ? "Today counts" : "Fresh start today"}</span></div>
          <button className="outline" type="button" onClick={() => setShowSettings((open) => !open)}>Settings</button>
        </div>
        {showSettings && <section className="panel reward-settings">
          <h3>Comfort settings</h3>
          <label><input type="checkbox" checked={!!rewardSettings.sound} onChange={(e) => updateRewardSetting("sound", e.target.checked)} /> Reward sounds</label>
          <label><input type="checkbox" checked={!!rewardSettings.haptics} onChange={(e) => updateRewardSetting("haptics", e.target.checked)} /> Haptic feedback</label>
          <label><input type="checkbox" checked={!!rewardSettings.animations} onChange={(e) => updateRewardSetting("animations", e.target.checked)} /> Reward animations</label>
          <label>Check-in frequency <select value={String(checkInFrequency)} onChange={(e) => setCheckInFrequency(Number(e.target.value))}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option></select></label>
          <label><input type="checkbox" checked={rewardSettings.notifySound !== false} onChange={(e) => updateRewardSetting("notifySound", e.target.checked)} /> Check-in notification sounds</label>
          <h3>Accountability buddy</h3>
          {!buddyAvailable && <p className="buddy-note">Buddy sharing needs the cloud setup (Supabase) before it can be turned on.</p>}
          {buddyAvailable && !buddy && (
            <div className="buddy-invite-form">
              <input type="text" maxLength={40} placeholder="Name your buddy will see" value={buddyName} onChange={(e) => setBuddyName(e.target.value)} />
              <button type="button" className="primary" disabled={buddyBusy} onClick={() => void inviteBuddy()}>Invite a buddy</button>
            </div>
          )}
          {buddyAvailable && buddy && (
            <div className="buddy-manage">
              <p className="buddy-note">
                {buddy.state === "pending" ? "Invite sent. Waiting for your friend to accept." : buddy.state === "paused" ? "Sharing is paused." : "Your buddy is connected."}
              </p>
              {buddy.state === "pending" && <button type="button" className="outline" onClick={() => void shareInvite()}>Share invite link again</button>}
              {buddy.state === "paused"
                ? <button type="button" className="outline" disabled={buddyBusy} onClick={() => void changeBuddySharing("active")}>Resume sharing</button>
                : <button type="button" className="outline" disabled={buddyBusy} onClick={() => void changeBuddySharing("paused")}>Pause sharing</button>}
              <button type="button" className="outline" disabled={buddyBusy} onClick={() => void changeBuddySharing("removed")}>Remove buddy</button>
            </div>
          )}
        </section>}
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
                onClick={() => startTaskFromAlarm(rightNowTask)}
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
                className={(item.completed ? "saved-task is-done" : "saved-task") + (focusedTasks.includes(item.id) ? " is-focused" : "")}
                key={item.id}
              >
                <button
                  className={"done-button" + (burstTaskId === item.id ? " confetti-burst" : "") + (lastReward?.taskId === item.id && lastReward.bonus > 0 ? " bonus-burst" : "")}
                  aria-label={item.completed ? "Mark as not done" : "Mark as complete"}
                  onClick={() => void toggleDone(item)}
                >
                  {item.completed ? <CheckCircle2 size={21} /> : <span />}
                  {floatingReward?.taskId === item.id && <span className="checkbox-reward-float">{floatingReward.label}</span>}
                </button>
                <div className="saved-task-copy">
                  <b>{item.title} {focusedTasks.includes(item.id) && <span className="focused-badge">Focused</span>}</b>
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
                  {!item.completed && <button type="button" className="outline task-focus-start" onClick={() => beginFocus(item)}>Start</button>}
                  {!item.completed && buddy && buddy.state !== "removed" && (
                    <label className="share-toggle"><input type="checkbox" checked={sharedTasks.includes(item.id)} onChange={(e) => toggleShared(item.id, e.target.checked)} /> Share with buddy</label>
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


      {rewardToast && <div className="reward-toast" role="status">{rewardToast}</div>}
      {cheerFloat && <div className="cheer-float" aria-hidden="true">{cheerFloat}</div>}
      {tooFastTask && (
        <div className="focus-overlay too-fast" role="dialog" aria-modal="true" aria-label="Did you finish this one?">
          <div className="focus-view">
            <h2>Did you finish this one?</h2>
            <p>{tooFastTask.title}</p>
            <div className="focus-actions">
              <button className="primary" onClick={() => { const t = tooFastTask; setTooFastTask(null); void toggleDone(t, true); }}>Yes</button>
              <button className="outline" onClick={() => setTooFastTask(null)}>Not yet</button>
            </div>
          </div>
        </div>
      )}
      {undoTask && <button type="button" className="undo-toast" onClick={undoCompletion}>Task completed - Undo</button>}
      {activeFocusTask && (
        <div className="focus-overlay" role="dialog" aria-modal="true" aria-label="Focus session">
          <div className="focus-view">
            <p className="eyebrow">FOCUS SESSION</p>
            <h2>{activeFocusTask.title}</h2>
            <div className="focus-detail-fields">
              <label>
                What do I need to do?
                <textarea rows={3} value={focusMicroStep} onChange={(e) => updateFocusDetail("microStep", e.target.value)} onBlur={saveFocusDetails} placeholder="Write the next small action..." />
              </label>
              <label>
                What have I done so far?
                <textarea rows={3} value={focusProgressNote} onChange={(e) => updateFocusDetail("progressNote", e.target.value)} onBlur={saveFocusDetails} placeholder="Add progress notes as you go..." />
              </label>
            </div>
            <div className="focus-clock">{String(Math.floor(focusRemaining / 60)).padStart(2, "0")}:{String(focusRemaining % 60).padStart(2, "0")}</div>
            <div className="focus-presets">{[10, 15, 25, 45].map((mins) => <button type="button" key={mins} className={focusMinutes === mins ? "selected" : ""} onClick={() => { if (focusElapsed === 0) { setFocusMinutes(mins); setFocusRemaining(mins * 60); } }}>{mins} min</button>)}</div>
            {checkInOpen && <div className="checkin-card"><h3>Still on it?</h3><button className="primary" onClick={() => respondToCheckIn(true)}>Yes</button><button className="outline" onClick={() => respondToCheckIn(false)}>Need a break</button></div>}
            {checkInExpired && <div className="checkin-card"><h3>Welcome back, want to continue?</h3><button className="primary" onClick={() => { setCheckInExpired(false); setFocusPaused(false); }}>Continue</button><button className="outline" onClick={() => { setCheckInExpired(false); setFocusPaused(true); }}>Take a break</button></div>}
            {focusRemaining === 0 && <p>Focus session complete. Nice work.</p>}
            <div className="focus-actions">
              {focusQualified && <button className="primary" onClick={() => { saveFocusDetails(); void toggleDone(activeFocusTask); }}>Complete task · 15 points</button>}
              <button className="outline" onClick={() => setFocusPaused((paused) => !paused)}>{focusPaused ? "Continue" : "Pause"}</button>
              <button className="primary" onClick={() => { saveFocusDetails(); setRewardToast("Focus session complete. Nice work."); endFocus(); }}>End session</button>
              <button className="outline" onClick={() => { saveFocusDetails(); endFocus(); }}>Close</button>
            </div>
          </div>
        </div>
      )}

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
        <a className="brand vinai-brand" href="#">
          <img src="/vinai_launcher.png" alt="Vinai" className="brand-logo-img small" />
          <span className="brand-name">VINAI</span>
          <span className="brand-tamil">வினை</span>
        </a>
        <span>Made for real brains, on real days.</span>
        <span>
          Progress over pressure <b>✳</b>
        </span>
      </footer>

      {showLoading && (
        <LoadingScreen onFinish={() => setShowLoading(false)} durationMs={2200} />
      )}
    </main>
  );
}
