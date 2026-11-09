import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight, Bell, Check, CheckCircle2, ChevronRight, Clock3, Flame,
  LogIn, LogOut, Pause, Play, Plus, Settings, ShieldCheck, Sparkles,
  Trash2, UserRound, X
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { BuddyView } from "./components/BuddyView";
import { ClockPicker } from "./components/ClockPicker";
import { CountdownRing } from "./components/CountdownRing";
import { TimedPlanBuilder } from "./components/TimedPlanBuilder";
import { getDemoResponse, type AssistantResponse, type TaskMode } from "./lib/assistant";
import {
  type SavedTask, loadTasksFromStorage, saveTasksToStorage, computeNextOccurrence
} from "./lib/storage";
import { hasSupabaseConfig, supabase } from "./lib/supabase";
import {
  setupNotificationChannels, requestAlarmPermissions, ALARM_PERMISSION_LINE,
  scheduleNativeAlarm, cancelNativeAlarm, syncAlarmsOnLaunch
} from "./lib/notifications";
import {
  buddyAvailable, buildInviteLink, createInvite, inviteTokenFromUrl, loadLocalBuddy,
  pollOwner, pushBuddyStatus, saveLocalBuddy, setBuddyState,
  type BuddyActivity, type LocalBuddy
} from "./lib/buddy";

const pad = (value: number) => String(value).padStart(2, "0");
function formatTime12(time24: string): string {
  const [hh, mm] = time24.split(":").map(Number);
  const period = hh >= 12 ? "PM" : "AM";
  return `${hh % 12 || 12}:${pad(mm || 0)} ${period}`;
}
function toDb(task: SavedTask, userId: string) {
  return {
    id: task.id, user_id: userId, title: task.title, mode: task.mode,
    micro_step: task.microStep, created_at: task.createdAt, completed: task.completed,
    reminder_at: task.reminderAt, estimate_minutes: task.estimateMinutes,
    actual_minutes: task.actualMinutes, progress_note: task.progressNote ?? ""
  };
}
function fromDb(row: Record<string, unknown>): SavedTask {
  const reminderAt = row.reminder_at ? String(row.reminder_at) : null;
  let reminderTime: string | null = null;
  if (reminderAt) {
    const parsed = new Date(reminderAt);
    if (Number.isFinite(parsed.getTime())) reminderTime = `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  }
  return {
    id: String(row.id), title: String(row.title), mode: row.mode as TaskMode,
    microStep: String(row.micro_step), createdAt: String(row.created_at),
    completed: Boolean(row.completed), reminderTime, reminderAt,
    estimateMinutes: row.estimate_minutes == null ? null : Number(row.estimate_minutes),
    actualMinutes: row.actual_minutes == null ? null : Number(row.actual_minutes),
    progressNote: String(row.progress_note ?? "")
  };
}
function todayKey() { return new Date().toLocaleDateString("en-CA"); }
function readArray(key: string): string[] {
  try { const parsed = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

type Tab = "today" | "plan" | "buddy";

export default function App() {
  const inviteToken = inviteTokenFromUrl();
  if (inviteToken) return <BuddyView token={inviteToken} />;

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("today");
  const [session, setSession] = useState<Session | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [taskText, setTaskText] = useState("");
  const [mode, setMode] = useState<TaskMode>("NEW_TASK");
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState("2");
  const [timeGuess, setTimeGuess] = useState("");
  const [actualInput, setActualInput] = useState("");
  const [reminderTime, setReminderTime] = useState<string | null>(null);
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  const [clockOpen, setClockOpen] = useState(false);
  const [tasks, setTasks] = useState<SavedTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");

  const [verificationTask, setVerificationTask] = useState<SavedTask | null>(null);
  const [verificationText, setVerificationText] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [leavingTaskIds, setLeavingTaskIds] = useState<string[]>([]);

  const [points, setPoints] = useState(() => Number(localStorage.getItem("todo-adhd.points") || 0));
  const [streak, setStreak] = useState(() => Number(localStorage.getItem("todo-adhd.streak") || 0));
  const [lastDay, setLastDay] = useState(() => localStorage.getItem("todo-adhd.lastDay") || "");
  const [rewardToast, setRewardToast] = useState("");
  const [undoTask, setUndoTask] = useState<SavedTask | null>(null);
  const [undoStreak, setUndoStreak] = useState<{ streak: number; day: string } | null>(null);
  const [lastReward, setLastReward] = useState<{ taskId: string; points: number; bonus: number } | null>(null);
  const [burstTaskId, setBurstTaskId] = useState<string | null>(null);
  const [floatingReward, setFloatingReward] = useState<{ taskId: string; label: string } | null>(null);
  const [rewardSettings, setRewardSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("todo-adhd.rewardSettings") || '{"sound":true,"haptics":true,"animations":true,"notifySound":true}'); }
    catch { return { sound: true, haptics: true, animations: true, notifySound: true }; }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [checkInFrequency, setCheckInFrequencyState] = useState(() => {
    const value = Number(localStorage.getItem("todo-adhd.checkInFrequency"));
    return [5, 10, 15].includes(value) ? value : 10;
  });
  const [tooFastTask, setTooFastTask] = useState<SavedTask | null>(null);
  const [askedTooFast, setAskedTooFast] = useState(() => readArray("todo-adhd.askedTooFast"));

  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [focusRemaining, setFocusRemaining] = useState(25 * 60);
  const [focusElapsed, setFocusElapsed] = useState(0);
  const [focusPaused, setFocusPaused] = useState(false);
  const [focusQualified, setFocusQualified] = useState(false);
  const [focusMicroStep, setFocusMicroStep] = useState("");
  const [focusProgressNote, setFocusProgressNote] = useState("");
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInExpired, setCheckInExpired] = useState(false);
  const [qualifiedFocusTasks, setQualifiedFocusTasks] = useState(() => readArray("todo-adhd.qualifiedFocusTasks"));
  const [focusedTasks, setFocusedTasks] = useState(() => readArray("todo-adhd.focusedTasks"));

  const [buddy, setBuddy] = useState<LocalBuddy | null>(() => loadLocalBuddy());
  const [buddyName, setBuddyName] = useState(() => localStorage.getItem("todo-adhd.buddyOwnerName") || "");
  const [buddyBusy, setBuddyBusy] = useState(false);
  const [buddyMessage, setBuddyMessage] = useState("");
  const [cheerFloat, setCheerFloat] = useState("");

  const [ringingAlarm, setRingingAlarm] = useState<{ title: string; taskId?: string } | null>(null);
  const [alarmSnoozeAvailable, setAlarmSnoozeAvailable] = useState(false);
  const webTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const webRepeats = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const alarmLoop = useRef<ReturnType<typeof setInterval> | null>(null);
  const alarmAudio = useRef<AudioContext | null>(null);
  const tasksRef = useRef<SavedTask[]>(tasks);
  tasksRef.current = tasks;
  const buddyRef = useRef<LocalBuddy | null>(buddy);
  buddyRef.current = buddy;
  const focusIdRef = useRef("");
  const checkInTimeout = useRef<number | null>(null);
  const sharedTasks = useRef<string[]>(readArray("todo-adhd.sharedTasks"));
  const isNative = Capacitor.isNativePlatform();

  const today = useMemo(() => new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric"
  }).format(new Date()), []);
  const activeTasks = tasks.filter((item) => !item.completed);
  const completedTasks = tasks.filter((item) => item.completed);
  const rightNowTask = activeTasks.find((item) => item.reminderAt) || activeTasks[0] || null;
  const activeFocusTask = tasks.find((item) => item.id === focusTaskId) || null;

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = await loadTasksFromStorage(session?.user.id);
      if (cancelled) return;
      setTasks(local);
      setLoaded(true);
      await syncAlarmsOnLaunch(local);
      if (session && supabase) {
        const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false }).limit(100);
        if (!cancelled && !error && data) {
          const remote = data.map((row) => fromDb(row as Record<string, unknown>));
          setTasks((current) => {
            const byId = new Map(current.map((entry) => [entry.id, entry]));
            remote.forEach((entry) => byId.set(entry.id, byId.get(entry.id)?.progressNote && !entry.progressNote
              ? { ...entry, progressNote: byId.get(entry.id)!.progressNote } : entry));
            return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user.id]);

  useEffect(() => {
    if (loaded) void saveTasksToStorage(tasks, session?.user.id);
  }, [tasks, loaded, session?.user.id]);

  useEffect(() => {
    if (!loaded) return;
    let received: { remove: () => Promise<void> } | undefined;
    let action: { remove: () => Promise<void> } | undefined;
    if (isNative) {
      void setupNotificationChannels();
      void LocalNotifications.addListener("localNotificationReceived", (notification) => {
        ringAlarm(notification.body || notification.title, notification.extra?.taskId);
      }).then((sub) => { received = sub; });
      void LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
        const id = event.notification.extra?.taskId;
        if (id) ringAlarm(event.notification.body || event.notification.title, id);
      }).then((sub) => { action = sub; });
    } else {
      tasksRef.current.forEach((entry) => {
        if (entry.reminderAt && !entry.completed && new Date(entry.reminderAt).getTime() > Date.now()) {
          void scheduleReminder(entry.id, entry.title, new Date(entry.reminderAt), false);
        }
      });
    }
    return () => {
      Object.values(webTimers.current).forEach(clearTimeout);
      Object.values(webRepeats.current).forEach(clearInterval);
      if (received) void received.remove();
      if (action) void action.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    localStorage.setItem("todo-adhd.points", String(points));
    localStorage.setItem("todo-adhd.streak", String(streak));
    localStorage.setItem("todo-adhd.lastDay", lastDay);
  }, [points, streak, lastDay]);

  useEffect(() => {
    localStorage.setItem("todo-adhd.rewardSettings", JSON.stringify(rewardSettings));
  }, [rewardSettings]);

  useEffect(() => {
    if (!focusTaskId || focusPaused || checkInOpen || focusRemaining <= 0) return;
    const interval = window.setInterval(() => {
      setFocusRemaining((remaining) => {
        if (remaining <= 1) {
          setFocusPaused(true); setFocusQualified(true);
          setRewardToast("Focus session complete · you showed up");
          return 0;
        }
        return remaining - 1;
      });
      setFocusElapsed((elapsed) => {
        const next = elapsed + 1;
        if (next > 0 && next % (checkInFrequency * 60) === 0) setCheckInOpen(true);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [focusTaskId, focusPaused, checkInOpen, focusRemaining, checkInFrequency]);

  useEffect(() => {
    if (!checkInOpen) return;
    if (checkInTimeout.current) clearTimeout(checkInTimeout.current);
    checkInTimeout.current = window.setTimeout(() => {
      setCheckInOpen(false); setFocusPaused(true); setCheckInExpired(true);
      checkInTimeout.current = null;
    }, 120000);
    return () => {
      if (checkInTimeout.current) clearTimeout(checkInTimeout.current);
      checkInTimeout.current = null;
    };
  }, [checkInOpen]);

  useEffect(() => {
    if (!buddy) return;
    let cancelled = false;
    const poll = async () => {
      const current = buddyRef.current;
      if (!current) return;
      const result = await pollOwner(current);
      if (cancelled || !result) return;
      const next = { ...current, state: result.state, lastCheerId: Math.max(current.lastCheerId, result.lastId) };
      if (next.state !== current.state || next.lastCheerId !== current.lastCheerId) {
        saveLocalBuddy(next); setBuddy(next);
      }
      if (result.emojis.length) {
        const emoji = result.emojis[result.emojis.length - 1];
        setRewardToast(`Your buddy sent a cheer ${emoji}`); setCheerFloat(emoji);
        window.setTimeout(() => setCheerFloat(""), 1800);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [buddy?.token]);

  useEffect(() => {
    if (!buddy || !focusTaskId) return;
    const current = tasksRef.current.find((entry) => entry.id === focusTaskId);
    if (!current) return;
    const isShared = sharedTasks.current.includes(focusTaskId);
    void pushBuddyStatus(buddy, isShared ? current.title : "Working on something", focusPaused ? "break" : "focusing", focusIdRef.current);
  }, [focusTaskId, focusPaused, buddy]);

  function setCheckInFrequency(value: number) {
    setCheckInFrequencyState(value);
    localStorage.setItem("todo-adhd.checkInFrequency", String(value));
  }

  function stopAlarmSound() {
    if (alarmLoop.current) clearInterval(alarmLoop.current);
    alarmLoop.current = null;
    setRingingAlarm(null);
    setAlarmSnoozeAvailable(false);
  }

  function ringAlarm(title: string, taskId?: string) {
    setRingingAlarm({ title, taskId });
    setAlarmSnoozeAvailable(true);
    const beep = () => {
      try {
        const Audio = window.AudioContext;
        if (!Audio) return;
        const context = alarmAudio.current ?? new Audio();
        alarmAudio.current = context;
        if (context.state === "suspended") void context.resume();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(740, context.currentTime);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.1, context.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.34);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(); oscillator.stop(context.currentTime + 0.36);
      } catch { /* Native notification still appears. */ }
    };
    beep();
    if (alarmLoop.current) clearInterval(alarmLoop.current);
    alarmLoop.current = setInterval(beep, 1500);
    if ("vibrate" in navigator) navigator.vibrate?.([180, 120, 180]);
  }

  async function cancelReminder(id: string) {
    if (webTimers.current[id]) clearTimeout(webTimers.current[id]);
    delete webTimers.current[id];
    if (webRepeats.current[id]) clearInterval(webRepeats.current[id]);
    delete webRepeats.current[id];
    await cancelNativeAlarm(id);
  }

  async function scheduleReminder(id: string, title: string, date: Date, ask = true) {
    await cancelReminder(id);
    const delay = date.getTime() - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) { setNotice("Choose a reminder time in the future."); return; }
    if (isNative) {
      if (ask) {
        setNotice(ALARM_PERMISSION_LINE);
        const permission = await requestAlarmPermissions();
        if (!permission.granted) { setNotice(permission.explanation || ALARM_PERMISSION_LINE); return; }
      }
      await scheduleNativeAlarm(id, title, date);
      setNotice("Reminder saved. Android will show it even when the app is closed, subject to device settings.");
      return;
    }
    if (ask) {
      const permission = await requestAlarmPermissions();
      if (permission.explanation) setNotice(permission.explanation);
    } else setNotice("Browser reminder set. Keep this tab open for it to ring.");
    if (delay > 2_147_000_000) return;
    webTimers.current[id] = setTimeout(() => {
      ringAlarm(title, id);
      webRepeats.current[id] = setInterval(() => ringAlarm(title, id), 5 * 60 * 1000);
    }, delay);
  }

  async function persistTask(item: SavedTask) {
    if (!session || !supabase) return;
    const { error } = await supabase.from("tasks").upsert(toDb(item, session.user.id));
    if (error) setNotice(`Saved on this device. Cloud sync: ${error.message}`);
  }

  async function handleAuth(event: FormEvent) {
    event.preventDefault(); setAuthMessage("");
    if (!supabase) { setAuthMessage("Cloud account setup is not configured yet."); return; }
    setAuthBusy(true);
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);
    if (result.error) setAuthMessage(result.error.message);
    else if (authMode === "signup" && !result.data.session) setAuthMessage("Check your email for the confirmation link, then sign in.");
    else { setAuthMessage("Signed in successfully."); setShowAccount(false); }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null); setShowAccount(false);
  }

  async function makeStep(event: FormEvent) {
    event.preventDefault();
    const title = taskText.trim();
    if (!title || busy) return;
    setBusy(true); setNotice(""); setResponse(null);
    try {
      let result: AssistantResponse | null = null;
      if (supabase && session) {
        const { data, error } = await supabase.functions.invoke("stepwise-assistant", { body: { task: title, mode } });
        if (!error && data && typeof data.the_micro_step === "string") result = data as AssistantResponse;
        else if (error) setNotice("The AI service is unavailable. Showing a built-in micro-step instead.");
      }
      setResponse(result ?? getDemoResponse(title, mode));
      if (!result && !notice) setNotice(session ? "Using the built-in helper for now." : "Sign in from the account button to connect the AI assistant. The built-in helper is ready too.");
    } catch {
      setResponse(getDemoResponse(title, mode));
      setNotice("The AI service could not be reached. A built-in micro-step is shown.");
    } finally { setBusy(false); }
  }

  function saveCurrent() {
    if (!response) return;
    const item: SavedTask = {
      id: crypto.randomUUID(), title: response.optimized_task_title, mode: response.mode,
      microStep: response.the_micro_step, createdAt: new Date().toISOString(), completed: false,
      reminderTime, reminderAt, estimateMinutes: Number(estimate) || null, actualMinutes: null,
      progressNote: ""
    };
    setTasks((current) => [item, ...current].slice(0, 100));
    void persistTask(item);
    if (item.reminderAt) void scheduleReminder(item.id, item.title, new Date(item.reminderAt));
    setResponse(null); setTaskText(""); setReminderTime(null); setReminderAt(null);
    setNotice("Saved. Your next step is ready when you are.");
  }

  function openTaskVerification(item: SavedTask) {
    if (item.completed) return;
    setVerificationTask(item); setVerificationError(""); setVerificationText("");
    stopAlarmSound();
    if (focusTaskId === item.id) setFocusPaused(true);
  }

  function giveReward(item: SavedTask, note: string) {
    const todayDate = todayKey();
    const yd = new Date(); yd.setDate(yd.getDate() - 1);
    const yesterday = yd.toLocaleDateString("en-CA");
    setUndoStreak({ streak, day: lastDay });
    const nextStreak = lastDay === todayDate ? streak : lastDay === yesterday ? streak + 1 : 1;
    setStreak(nextStreak); setLastDay(todayDate);
    const focusBonus = (focusTaskId === item.id && focusQualified) || qualifiedFocusTasks.includes(item.id);
    const basePoints = focusBonus ? 15 : 10;
    const bonus = Math.random() < 0.2 ? 25 : 0;
    const awarded = basePoints + bonus;
    setPoints((current) => current + awarded);
    setLastReward({ taskId: item.id, points: basePoints, bonus });
    if (focusBonus) {
      const next = Array.from(new Set([...focusedTasks, item.id]));
      setFocusedTasks(next); localStorage.setItem("todo-adhd.focusedTasks", JSON.stringify(next));
      const remaining = qualifiedFocusTasks.filter((id) => id !== item.id);
      setQualifiedFocusTasks(remaining); localStorage.setItem("todo-adhd.qualifiedFocusTasks", JSON.stringify(remaining));
    }
    const updated = { ...item, completed: true, progressNote: [item.progressNote, note].filter(Boolean).join("\n\n") };
    setUndoTask(item);
    window.setTimeout(() => setUndoTask((current) => current?.id === item.id ? null : current), 5000);
    if (rewardSettings.animations) {
      setRewardToast(bonus ? `+${basePoints} points · +25 bonus!` : `+${basePoints} points · nice work`);
      setFloatingReward({ taskId: item.id, label: `+${basePoints}${bonus ? " · +25 bonus" : ""}` });
      setBurstTaskId(item.id);
      window.setTimeout(() => { setFloatingReward((current) => current?.taskId === item.id ? null : current); setBurstTaskId((current) => current === item.id ? null : current); }, 1300);
      window.setTimeout(() => setRewardToast(""), 2200);
    }
    if (rewardSettings.haptics && "vibrate" in navigator) navigator.vibrate?.(bonus ? [25, 35, 25] : 18);
    if (rewardSettings.sound) {
      try {
        const Audio = window.AudioContext;
        if (Audio) {
          const context = alarmAudio.current ?? new Audio(); alarmAudio.current = context;
          if (context.state === "suspended") void context.resume();
          const oscillator = context.createOscillator(); const gain = context.createGain();
          oscillator.type = "sine"; oscillator.frequency.setValueAtTime(bonus ? 880 : 660, context.currentTime);
          gain.gain.setValueAtTime(0.0001, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.07, context.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
          oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.2);
        }
      } catch { /* sound is optional */ }
    }
    setTasks((current) => current.map((entry) => entry.id === item.id ? updated : entry));
    void (async () => { await cancelReminder(item.id); await persistTask(updated); })();
    if (focusTaskId === item.id) endFocus(false);
    if (buddyRef.current && sharedTasks.current.includes(item.id)) {
      void pushBuddyStatus(buddyRef.current, "", "done", `done-${Date.now()}`);
    }
  }

  async function verifyAndCompleteTask() {
    const target = verificationTask;
    const note = verificationText.trim();
    if (!target || verificationBusy) return;
    if (!note) { setVerificationError("Add a little detail so the AI can compare it with your task."); return; }
    if (!supabase || !session) { setVerificationError("Sign in to use the AI task checker. Your task is still saved."); return; }
    setVerificationBusy(true); setVerificationError("");
    try {
      const { data, error } = await supabase.functions.invoke("verify-task-start", {
        body: { taskTitle: target.title, microStep: target.microStep, userResponse: note }
      });
      if (error) throw new Error(error.message || "The AI checker could not be reached.");
      if (!data || typeof data.approved !== "boolean") throw new Error("The AI checker returned an unexpected response.");
      if (!data.approved) {
        setVerificationError(typeof data.reason === "string" && data.reason.trim() ? data.reason : "That update does not clearly match this task yet. Add a relevant detail and try again.");
        return;
      }
      setVerificationTask(null); setVerificationText(""); setVerificationError("");
      setLeavingTaskIds((current) => current.includes(target.id) ? current : [...current, target.id]);
      window.setTimeout(() => {
        setLeavingTaskIds((current) => current.filter((id) => id !== target.id));
        giveReward(target, note);
        setNotice("Verified. Your task is complete.");
      }, 420);
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : "AI checking is unavailable right now. Try again.");
    } finally { setVerificationBusy(false); }
  }

  function undoCompletion() {
    if (!undoTask) return;
    const restored = { ...undoTask, completed: false };
    setTasks((current) => current.map((entry) => entry.id === restored.id ? restored : entry));
    setUndoTask(null);
    const reward = lastReward?.taskId === restored.id ? lastReward.points + lastReward.bonus : 10;
    setPoints((current) => Math.max(0, current - reward));
    if (undoStreak) { setStreak(undoStreak.streak); setLastDay(undoStreak.day); }
    if (lastReward?.taskId === restored.id && lastReward.points === 15) {
      const next = Array.from(new Set([...qualifiedFocusTasks, restored.id]));
      setQualifiedFocusTasks(next); localStorage.setItem("todo-adhd.qualifiedFocusTasks", JSON.stringify(next));
    }
    setLastReward(null); setUndoStreak(null); void persistTask(restored);
    if (restored.reminderAt && new Date(restored.reminderAt).getTime() > Date.now()) void scheduleReminder(restored.id, restored.title, new Date(restored.reminderAt), false);
  }

  function beginFocus(item: SavedTask) {
    if (item.completed) return;
    focusIdRef.current = `focus-${Date.now()}`;
    stopAlarmSound(); setFocusTaskId(item.id); setFocusMinutes(25); setFocusRemaining(25 * 60);
    setFocusElapsed(0); setFocusQualified(false); setFocusPaused(false);
    setFocusMicroStep(item.microStep || ""); setFocusProgressNote(item.progressNote || "");
    setCheckInOpen(false); setCheckInExpired(false);
  }

  function updateFocusDetail(field: "microStep" | "progressNote", value: string) {
    if (!focusTaskId) return;
    if (field === "microStep") setFocusMicroStep(value); else setFocusProgressNote(value);
    const current = tasksRef.current.find((entry) => entry.id === focusTaskId);
    if (current) setTasks((items) => items.map((entry) => entry.id === focusTaskId ? { ...entry, [field]: value } : entry));
  }
  function saveFocusDetails() {
    if (!focusTaskId) return;
    const current = tasksRef.current.find((entry) => entry.id === focusTaskId);
    if (current) void persistTask({ ...current, microStep: focusMicroStep, progressNote: focusProgressNote });
  }
  function endFocus(saveQualified = true) {
    if (checkInTimeout.current) clearTimeout(checkInTimeout.current);
    checkInTimeout.current = null;
    if (saveQualified && focusTaskId && focusQualified) {
      const next = Array.from(new Set([...qualifiedFocusTasks, focusTaskId]));
      setQualifiedFocusTasks(next); localStorage.setItem("todo-adhd.qualifiedFocusTasks", JSON.stringify(next));
    }
    setFocusTaskId(null); setFocusPaused(false); setCheckInOpen(false); setCheckInExpired(false);
  }
  function respondToCheckIn(continueSession: boolean) {
    if (checkInTimeout.current) clearTimeout(checkInTimeout.current);
    checkInTimeout.current = null; setCheckInOpen(false); setCheckInExpired(false);
    if (continueSession) setFocusQualified(true); else setFocusPaused(true);
  }

  async function deleteTask(id: string) {
    setTasks((current) => current.filter((entry) => entry.id !== id));
    await cancelReminder(id);
    if (session && supabase) {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) setNotice("Removed on this device. Cloud deletion needs attention.");
    }
  }

  async function saveTimeFeedback(item: SavedTask) {
    const actual = Number(actualInput);
    if (!Number.isFinite(actual) || actual <= 0) { setNotice("Enter a time greater than zero."); return; }
    const updated = { ...item, actualMinutes: actual, estimateMinutes: Number(timeGuess) || item.estimateMinutes };
    setTasks((current) => current.map((entry) => entry.id === item.id ? updated : entry));
    await persistTask(updated); setActualInput(""); setNotice("Time note saved. It is information, not a score.");
  }

  async function snoozeAlarm() {
    const taskId = ringingAlarm?.taskId;
    stopAlarmSound();
    if (!taskId) return;
    const original = tasksRef.current.find((entry) => entry.id === taskId);
    if (!original) return;
    const date = new Date(Date.now() + 5 * 60 * 1000);
    const updated = { ...original, reminderAt: date.toISOString(), reminderTime: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
    setTasks((current) => current.map((entry) => entry.id === taskId ? updated : entry));
    await persistTask(updated); await scheduleReminder(taskId, updated.title, date, false);
    setNotice("Snoozed for five minutes.");
  }

  function startTaskFromAlarm(item?: SavedTask) {
    const target = item ?? (ringingAlarm?.taskId ? tasksRef.current.find((entry) => entry.id === ringingAlarm.taskId) : undefined);
    if (!target) { stopAlarmSound(); return; }
    stopAlarmSound(); void cancelReminder(target.id);
    const updated = { ...target, reminderAt: null, reminderTime: null };
    setTasks((current) => current.map((entry) => entry.id === target.id ? updated : entry));
    void persistTask(updated); beginFocus(updated);
  }

  function updateRewardSetting(key: string, value: boolean) {
    setRewardSettings((current: Record<string, boolean>) => ({ ...current, [key]: value }));
  }

  async function inviteBuddy() {
    const name = buddyName.trim();
    if (!name) { setBuddyMessage("Add the name your buddy should see."); return; }
    if (!buddyAvailable) { setBuddyMessage("Connect the cloud project to turn on buddy invitations."); return; }
    setBuddyBusy(true); localStorage.setItem("todo-adhd.buddyOwnerName", name);
    const created = await createInvite(name); setBuddyBusy(false);
    if (!created) { setBuddyMessage("Couldn't create the invite right now. Try again."); return; }
    setBuddy(created); setBuddyMessage("Invite created. Share the link with your buddy.");
    await shareInvite(created);
  }
  async function shareInvite(target: LocalBuddy | null = buddy) {
    if (!target) return;
    const link = buildInviteLink(target.token);
    try {
      if (navigator.share) await navigator.share({ title: "Vinai · accountability buddy", text: `${target.ownerName} invited you to be their buddy: ${link}` });
      else { await navigator.clipboard.writeText(link); setBuddyMessage("Invite link copied."); }
    } catch {
      try { await navigator.clipboard.writeText(link); setBuddyMessage("Invite link copied."); }
      catch { setBuddyMessage(link); }
    }
  }
  async function changeBuddySharing(state: "active" | "paused" | "removed") {
    const current = buddyRef.current; if (!current) return;
    setBuddyBusy(true); const saved = await setBuddyState(current, state); setBuddyBusy(false);
    if (!saved) { setBuddyMessage("Could not update buddy sharing. Your setting is unchanged."); return; }
    if (state === "removed") { saveLocalBuddy(null); setBuddy(null); setBuddyMessage("Buddy disconnected."); return; }
    const next = { ...current, state }; saveLocalBuddy(next); setBuddy(next);
    setBuddyMessage(state === "paused" ? "Buddy sharing paused." : "Buddy sharing resumed.");
  }

  if (!loaded) return <div className="page-shell"><section className="phone"><div className="screen loading-page"><div className="loading-orbit"><span /><img src="/vinai_launcher.png" alt="வினை" /></div><p className="eyebrow">YOUR NEXT SMALL STEP</p><h1>A little less noise.<br />A little more you.</h1><p>Making room for your next step.</p><div className="loading-track"><i /></div></div></section></div>;

  return (
    <main className="page-shell">
      <section className="phone" aria-label="வினை — task and focus app">
        <div className="screen">
          {loading && <div className="loading-page" role="status"><div className="loading-orbit"><span /><img src="/vinai_launcher.png" alt="வினை" /></div><p className="eyebrow">YOUR NEXT SMALL STEP</p><h1>A little less noise.<br />A little more you.</h1><p>Making room for your next step.</p><div className="loading-track"><i /></div></div>}
          <header className="topbar">
            <div className="brand-lockup"><div className="brand-logo"><img src="/vinai_launcher.png" alt="" /></div><div><p className="brand-name" lang="ta">வினை</p><p className="date">{today}</p></div></div>
            <div className="top-actions"><span className="online-dot" title="Ready" /><button className="avatar" type="button" aria-label="Account and settings" onClick={() => setSettingsOpen((open) => !open)}><Settings size={17} /></button><button className="avatar" type="button" aria-label="Account" onClick={() => setShowAccount(true)}><UserRound size={17} /></button></div>
          </header>

          <div className="welcome"><span>YOUR PACE. YOUR SPACE.</span><h1>Small steps.<br /><em>Real momentum.</em></h1><p className="welcome-copy">A little structure. No pressure to be perfect.</p></div>
          <section className="hero" aria-label="Daily focus"><img className="hero-poster" src="/stay-hard-hero.jpg" alt="Stay Hard motivational poster" /><div className="hero-count"><strong>{activeTasks.length}</strong><span>left today</span></div></section>

          <div className="stats-grid">
            <div><span>YOUR POINTS</span><strong>{points}<small> pts</small></strong><p>Every small win counts</p></div>
            <div><span>DAILY STREAK</span><strong><Flame size={17} /> {streak}<small> days</small></strong><p>{lastDay === todayKey() ? "You showed up today" : "A fresh start is waiting"}</p></div>
          </div>

          <nav className="tabs" aria-label="App sections"><button className={tab === "today" ? "selected" : ""} onClick={() => setTab("today")}>Today</button><button className={tab === "plan" ? "selected" : ""} onClick={() => setTab("plan")}>Timed plan</button><button className={tab === "buddy" ? "selected" : ""} onClick={() => setTab("buddy")}>My buddy</button></nav>

          {settingsOpen && <section className="glass-panel settings-panel"><div className="panel-heading-row"><h2>Comfort settings</h2><button className="icon-plain" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X /></button></div>
            <label className="setting-row"><span>Reward sounds</span><input type="checkbox" checked={!!rewardSettings.sound} onChange={(event) => updateRewardSetting("sound", event.target.checked)} /></label>
            <label className="setting-row"><span>Haptic feedback</span><input type="checkbox" checked={!!rewardSettings.haptics} onChange={(event) => updateRewardSetting("haptics", event.target.checked)} /></label>
            <label className="setting-row"><span>Reward animations</span><input type="checkbox" checked={!!rewardSettings.animations} onChange={(event) => updateRewardSetting("animations", event.target.checked)} /></label>
            <label className="setting-row"><span>Check-in sound</span><input type="checkbox" checked={rewardSettings.notifySound !== false} onChange={(event) => updateRewardSetting("notifySound", event.target.checked)} /></label>
            <label className="setting-row"><span>Focus check-in interval</span><select value={String(checkInFrequency)} onChange={(event) => setCheckInFrequency(Number(event.target.value))}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option></select></label>
            <button className="outline full-width" onClick={() => setShowAccount(true)}>{session ? `Signed in · ${session.user.email}` : "Sign in / create account"}</button>
          </section>}

          {tab === "today" && <>
            <form className="quick-add" onSubmit={makeStep}>
              <div className="quick-title"><Sparkles size={18} /><input value={taskText} onChange={(event) => setTaskText(event.target.value)} placeholder="What needs your focus?" aria-label="Task name" required /></div>
              <div className="quick-actions"><label><Clock3 size={15} /><span>Optional reminder</span><button type="button" className="time-select" onClick={() => setClockOpen(true)}>{reminderTime ? formatTime12(reminderTime) : "Set time"}</button></label><button type="submit" disabled={busy}>{busy ? "Thinking…" : <>Find my next step <ArrowRight size={15} /></>}</button></div>
              <div className="mode-chooser" aria-label="Task helper mode">{(["NEW_TASK", "NEXT_STEP", "TOO_HARD", "TIME_CHECK"] as TaskMode[]).map((item) => <button type="button" key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item === "NEW_TASK" ? "New task" : item === "NEXT_STEP" ? "Next step" : item === "TOO_HARD" ? "Too hard" : "Time check"}</button>)}</div>
            </form>

            {response && <section className="glass-panel ai-result"><div className="panel-kicker"><Sparkles size={14} /><span>YOUR NEXT LITTLE STEP</span></div><h2>{response.optimized_task_title}</h2><div className="micro-step"><span>01</span><p>{response.the_micro_step}</p></div><p className="encouragement">{response.dopamine_hook}</p><p className="time-prompt">{response.time_guess_prompt}</p><p className="muted-paragraph">{response.time_feedback}</p><label className="field-label" htmlFor="estimate">My time estimate</label><select id="estimate" className="wide-select" value={estimate} onChange={(event) => setEstimate(event.target.value)}><option value="1">1 minute</option><option value="2">2 minutes</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="25">25 minutes</option><option value="45">45 minutes</option></select><div className="result-actions"><button className="primary-button" onClick={saveCurrent}>Save this step <Check size={15} /></button><button className="text-button" onClick={() => setResponse(null)}>Discard</button></div></section>}
            {notice && <p className="status-message" role="status">{notice}</p>}

            <div className="section-heading"><div><span>YOUR RUNWAY</span><h2>Today’s tasks</h2></div><p>{completedTasks.length}/{tasks.length} done</p></div>
            {rightNowTask && <section className="right-now-card"><div className="right-now-header"><span>✳ RIGHT NOW</span><small>Current focus</small></div><h3>{rightNowTask.title}</h3><p>{rightNowTask.microStep}</p><div className="right-now-bottom">{rightNowTask.reminderAt && <CountdownRing reminderAt={rightNowTask.reminderAt} createdAt={rightNowTask.createdAt} size="small" />}<button className="primary-button" onClick={() => startTaskFromAlarm(rightNowTask)}>Start focus <ArrowRight size={15} /></button></div></section>}

            <div className="task-list">
              {activeTasks.map((item, index) => <article className={`task ${focusedTasks.includes(item.id) ? "is-focused" : ""} ${leavingTaskIds.includes(item.id) ? "slide-away" : ""}`} key={item.id}>
                <button className={`check ${burstTaskId === item.id ? "confetti-burst" : ""}`} aria-label={`Verify and complete ${item.title}`} onClick={() => openTaskVerification(item)}><span />{floatingReward?.taskId === item.id && <small className="checkbox-reward-float">{floatingReward.label}</small>}</button>
                <div className="task-body"><div className="task-title"><span>{pad(index + 1)}</span><h3>{item.title}</h3></div><p className="task-micro">{item.microStep}</p><div className="task-meta"><small>{new Date(item.createdAt).toLocaleDateString()} · {item.mode.toLowerCase().replaceAll("_", " ")}</small>{item.reminderTime && <small><Bell size={11} /> {formatTime12(item.reminderTime)}</small>}</div>{item.reminderAt && <CountdownRing reminderAt={item.reminderAt} createdAt={item.createdAt} size="small" />}
                  <div className="task-actions"><button className="small-ghost" onClick={() => beginFocus(item)}><Play size={12} /> Start focus</button><details className="time-feedback"><summary>Time notes</summary><div className="feedback-fields"><label>Estimate (min)<input type="number" min="1" value={timeGuess || item.estimateMinutes || ""} onChange={(event) => setTimeGuess(event.target.value)} /></label><label>Actual (min)<input type="number" min="1" value={actualInput} onChange={(event) => setActualInput(event.target.value)} /></label><button className="outline" onClick={() => void saveTimeFeedback(item)}>Save</button></div></details></div>{item.actualMinutes !== null && <small className="time-note">Estimate {item.estimateMinutes ?? "—"} min · actual {item.actualMinutes} min</small>}</div>
                <button className="delete-task" aria-label={`Delete ${item.title}`} onClick={() => void deleteTask(item.id)}><Trash2 size={15} /></button>
              </article>)}
              {activeTasks.length === 0 && <div className="empty-tasks"><Sparkles size={20} /><h3>Nothing waiting on you.</h3><p>Add one tiny step whenever you're ready.</p></div>}
            </div>
            {completedTasks.length > 0 && <details className="completed-list"><summary>Completed · {completedTasks.length}</summary>{completedTasks.slice(0, 10).map((item) => <div className="completed-row" key={item.id}><CheckCircle2 size={15} /><span>{item.title}</span></div>)}</details>}
          </>}

          {tab === "plan" && <div className="tab-pane plan-tab"><TimedPlanBuilder /></div>}

          {tab === "buddy" && <section className="buddy-panel glass-panel">
            <div className="buddy-circles"><span>You</span><i>+</i><span>Buddy</span></div><span className="eyebrow">BETTER, TOGETHER</span><h2>Your accountability buddy</h2><p>Not a report card. A friend in your corner. Share focus status and send small cheers.</p>
            {!buddy && <div className="buddy-invite-form"><label className="field-label" htmlFor="buddy-name">What should your buddy call you?</label><input id="buddy-name" className="buddy-name-input" value={buddyName} onChange={(event) => setBuddyName(event.target.value)} placeholder="Your name" maxLength={40} /><button className="primary-button" disabled={buddyBusy || !buddyAvailable} onClick={() => void inviteBuddy()}>{buddyBusy ? "Creating invite…" : "Create buddy invite"} <ArrowRight size={15} /></button></div>}
            {buddy && <div className="buddy-manage"><div className="buddy-status-card"><span className={`buddy-status-dot ${buddy.state}`} /><div><b>{buddy.state === "pending" ? "Invite pending" : buddy.state === "paused" ? "Sharing paused" : "Buddy connected"}</b><small>{buddy.ownerName}</small></div></div><button className="primary-button" onClick={() => void shareInvite()}><ArrowRight size={15} /> Share invite link</button><div className="buddy-controls">{buddy.state === "paused" ? <button className="outline" disabled={buddyBusy} onClick={() => void changeBuddySharing("active")}>Resume sharing</button> : <button className="outline" disabled={buddyBusy} onClick={() => void changeBuddySharing("paused")}>Pause sharing</button>}<button className="outline" disabled={buddyBusy} onClick={() => void changeBuddySharing("removed")}>Disconnect</button></div></div>}
            <div className="checkin-preview"><span>TODAY’S CHECK-IN</span><strong>{completedTasks.length} small wins. Real progress.</strong><p>I'm taking it one step at a time.</p></div><p className="status-message" role="status">{buddyMessage || (buddyAvailable ? "Your buddy sees only the task status you choose to share." : "Sign in and configure the cloud project to enable buddy invitations.")}</p>
          </section>}

          <p className="footnote">Your pace. Your space. Progress over pressure.</p>
        </div>
      </section>

      {ringingAlarm && <div className="alarm-overlay" role="alertdialog" aria-modal="true"><div className="alarm-modal"><div className="ring"><Bell size={24} /></div><span>TIME FOR YOUR NEXT STEP</span><h2>{ringingAlarm.title}</h2><p>No pressure. Start with one small action.</p><button onClick={() => startTaskFromAlarm()}>Start task <ArrowRight size={15} /></button>{alarmSnoozeAvailable && <button className="alarm-secondary" onClick={() => void snoozeAlarm()}>Snooze 5 minutes</button>}<button className="alarm-secondary" onClick={stopAlarmSound}>Dismiss</button></div></div>}

      {verificationTask && <div className="task-verification-overlay" role="dialog" aria-modal="true" aria-label="Verify task completion"><section className="task-verification-page"><button className="task-verification-back" onClick={() => setVerificationTask(null)} disabled={verificationBusy}>← Back to tasks</button><p className="eyebrow">TASK CHECK</p><h2>Tell us what you did.</h2><p className="task-verification-intro">Write what you did or what you're going to do next. The AI checks that your update matches this task.</p><div className="task-verification-context"><small>YOUR TASK</small><h3>{verificationTask.title}</h3><p>{verificationTask.microStep}</p></div><form className="task-verification-form" onSubmit={(event) => { event.preventDefault(); void verifyAndCompleteTask(); }}><label htmlFor="task-verification-text">Your update</label><textarea id="task-verification-text" rows={7} value={verificationText} onChange={(event) => setVerificationText(event.target.value)} placeholder="Write freely about what you did or what you plan to do for this task…" autoFocus />{verificationError && <p className="task-verification-error" role="alert">{verificationError}</p>}<button className="primary-button" type="submit" disabled={verificationBusy || !verificationText.trim()}>{verificationBusy ? "Checking with AI…" : "Verify and complete"} <Check size={15} /></button></form><p className="task-verification-footnote">Relevant updates complete the task. Unrelated updates leave it open.</p></section></div>}

      {activeFocusTask && <div className="focus-overlay" role="dialog" aria-modal="true" aria-label="Focus session"><section className="focus-view"><div className="panel-heading-row"><p className="eyebrow">FOCUS SESSION</p><button className="icon-plain" aria-label="Close focus session" onClick={() => { saveFocusDetails(); endFocus(); }}><X /></button></div><h2>{activeFocusTask.title}</h2><p className="focus-helper">One task. One small next action. This screen keeps the same quiet monochrome look.</p><div className="focus-detail-fields"><label>What do I need to do?<textarea rows={3} value={focusMicroStep} onChange={(event) => updateFocusDetail("microStep", event.target.value)} onBlur={saveFocusDetails} placeholder="Write the next small action…" /></label><label>What have I done so far?<textarea rows={3} value={focusProgressNote} onChange={(event) => updateFocusDetail("progressNote", event.target.value)} onBlur={saveFocusDetails} placeholder="Add progress notes as you go…" /></label></div><div className="focus-clock">{pad(Math.floor(focusRemaining / 60))}<span>:</span>{pad(focusRemaining % 60)}</div><div className="focus-presets">{[10, 15, 25, 45].map((minutes) => <button key={minutes} className={focusMinutes === minutes ? "selected" : ""} disabled={focusElapsed > 0} onClick={() => { setFocusMinutes(minutes); setFocusRemaining(minutes * 60); }}>{minutes} min</button>)}</div>{checkInOpen && <div className="checkin-card"><h3>Still on it?</h3><p>Quick check-in. No pressure.</p><button className="primary-button" onClick={() => respondToCheckIn(true)}>Yes, continue</button><button className="outline" onClick={() => respondToCheckIn(false)}>Need a break</button></div>}{checkInExpired && <div className="checkin-card"><h3>Welcome back.</h3><p>Want to continue or pause here?</p><button className="primary-button" onClick={() => { setCheckInExpired(false); setFocusPaused(false); }}>Continue</button><button className="outline" onClick={() => { setCheckInExpired(false); setFocusPaused(true); }}>Take a break</button></div>}{focusRemaining === 0 && <p className="focus-complete">Focus session complete. You're eligible for 15 points when you verify the task.</p>}<div className="focus-actions">{focusQualified && <button className="primary-button" onClick={() => { saveFocusDetails(); openTaskVerification(activeFocusTask); }}>Verify task · 15 pts</button>}<button className="outline" onClick={() => setFocusPaused((paused) => !paused)}>{focusPaused ? <Play size={14} /> : <Pause size={14} />}{focusPaused ? "Continue" : "Pause"}</button><button className="outline" onClick={() => { saveFocusDetails(); endFocus(); }}>End session</button></div></section></div>}

      {settingsOpen && <div className="settings-backdrop" onClick={() => setSettingsOpen(false)} aria-hidden="true" />}
      {showAccount && <div className="account-overlay" role="dialog" aria-modal="true" aria-label="Account"><section className="account-modal"><div className="panel-heading-row"><div><p className="eyebrow">YOUR ACCOUNT</p><h2>{session ? "You're connected" : "Connect your account"}</h2></div><button className="icon-plain" onClick={() => setShowAccount(false)} aria-label="Close account"><X /></button></div>{session ? <><p className="muted-paragraph">{session.user.email}</p><p className="muted-paragraph">Your tasks can sync securely across devices.</p><button className="outline full-width" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button></> : <><p className="muted-paragraph">Sign in to enable connected AI verification, cloud backup and buddy invitations. Your local task list works without an account.</p><div className="auth-tabs"><button className={authMode === "signin" ? "selected" : ""} onClick={() => { setAuthMode("signin"); setAuthMessage(""); }}>Sign in</button><button className={authMode === "signup" ? "selected" : ""} onClick={() => { setAuthMode("signup"); setAuthMessage(""); }}>Create account</button></div><form className="account-form" onSubmit={(event) => void handleAuth(event)}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="primary-button" type="submit" disabled={authBusy}>{authBusy ? "Connecting…" : authMode === "signin" ? "Sign in" : "Create account"} <LogIn size={15} /></button></form>{authMessage && <p className="status-message" role="status">{authMessage}</p>}{!hasSupabaseConfig && <p className="status-message">Cloud sign-in needs the existing Supabase environment configuration.</p>}</>}</section></div>}

      {tooFastTask && <div className="alarm-overlay" role="dialog" aria-modal="true"><div className="alarm-modal"><div className="ring"><CheckCircle2 /></div><h2>Did you finish this one?</h2><p>{tooFastTask.title}</p><button onClick={() => { const target = tooFastTask; setTooFastTask(null); giveReward(target, target.progressNote || "Completed"); }}>Yes, I did</button><button className="alarm-secondary" onClick={() => setTooFastTask(null)}>Not yet</button></div></div>}
      {undoTask && <button className="undo-toast" onClick={undoCompletion}>Task completed · Undo</button>}
      {rewardToast && <div className="reward-toast" role="status">{rewardToast}</div>}
      {cheerFloat && <div className="cheer-float" aria-hidden="true">{cheerFloat}</div>}

      <ClockPicker isOpen={clockOpen} initialTime={reminderTime} onSet={(time) => { setReminderTime(time); setReminderAt(computeNextOccurrence(time).toISOString()); setClockOpen(false); }} onCancel={() => setClockOpen(false)} />
    </main>
  );
}
