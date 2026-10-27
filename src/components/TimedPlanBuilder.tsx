import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Bell, ChevronDown, Clock3, Pause, Play, SkipForward, Square } from "lucide-react";

type PlanStep = { id: string; title: string; minutes: number; kind: "work" | "break" };
type Status = "ready" | "running" | "paused" | "stopped" | "finished";
const makeId = () => Math.floor(Math.random() * 1_900_000_000) + 1;

function buildSteps(task: string, total: number): PlanStep[] {
  const t = task.toLowerCase();
  const study = /study|math|chapter|exam|revision|revise|learn|read|homework|science|physics|chemistry|biology/.test(t);
  const steps: PlanStep[] = study
    ? [
        { id: crypto.randomUUID(), title: "Set up your book, notes and workspace", minutes: 3, kind: "work" },
        { id: crypto.randomUUID(), title: "Read the first section and mark key ideas", minutes: 20, kind: "work" },
        { id: crypto.randomUUID(), title: "Take a short reset break", minutes: 5, kind: "break" },
        { id: crypto.randomUUID(), title: "Continue the chapter and make brief notes", minutes: 25, kind: "work" },
        { id: crypto.randomUUID(), title: "Solve practice questions", minutes: 25, kind: "work" },
        { id: crypto.randomUUID(), title: "Take a short reset break", minutes: 5, kind: "break" },
        { id: crypto.randomUUID(), title: "Review mistakes and recall the main points", minutes: 15, kind: "work" },
        { id: crypto.randomUUID(), title: "Wrap up and choose what to revisit", minutes: 5, kind: "work" }
      ]
    : [
        { id: crypto.randomUUID(), title: "Set up what you need", minutes: 3, kind: "work" },
        { id: crypto.randomUUID(), title: `Start: ${task.trim() || "your task"}`, minutes: 20, kind: "work" },
        { id: crypto.randomUUID(), title: "Take a short reset break", minutes: 5, kind: "break" },
        { id: crypto.randomUUID(), title: "Continue the main task", minutes: 25, kind: "work" },
        { id: crypto.randomUUID(), title: "Check progress and finish one clear part", minutes: 15, kind: "work" }
      ];
  const target = Math.max(15, Math.min(480, total));
  let remaining = target;
  const result: PlanStep[] = [];
  for (let i = 0; i < steps.length && remaining > 0; i++) {
    const step = { ...steps[i], minutes: Math.min(steps[i].minutes, remaining) };
    if (step.minutes > 0) result.push(step);
    remaining -= step.minutes;
  }
  if (remaining > 0) result.push({ id: crypto.randomUUID(), title: "Keep working on the next section", minutes: remaining, kind: "work" });
  return result;
}

export function TimedPlanBuilder() {
  const [goal, setGoal] = useState("");
  const [total, setTotal] = useState(120);
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [status, setStatus] = useState<Status>("ready");
  const [current, setCurrent] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedMs, setPausedMs] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState("");
  const browserTimers = useRef<number[]>([]);
  const nativeIds = useRef<number[]>([]);
  const isNative = Capacitor.isNativePlatform();

  const remainingMs = Math.max(0, (steps[current]?.minutes ?? 0) * 60000 - (status === "running" ? Math.max(0, now - (startedAt ?? now)) : pausedMs));
  const remainingTotal = steps.reduce((sum, s, i) => sum + (i >= current ? s.minutes : 0), 0);

  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status !== "running" || remainingMs > 0) return;
    if (current >= steps.length - 1) {
      stopSchedules(); setStatus("finished"); setNotice("Plan complete. You made it through the steps.");
    } else {
      setCurrent(value => value + 1); setStartedAt(Date.now()); setPausedMs(0); setNow(Date.now());
    }
  }, [status, remainingMs, current, steps.length]);

  useEffect(() => () => {
    browserTimers.current.forEach(window.clearTimeout);
    if (isNative && nativeIds.current.length) void LocalNotifications.cancel({ notifications: nativeIds.current.map(id => ({ id })) });
  }, [isNative]);

  function createPlan() {
    if (!goal.trim()) { setNotice("Describe the task first."); return; }
    stopSchedules();
    setSteps(buildSteps(goal, total));
    setCurrent(0); setStartedAt(null); setPausedMs(0); setStatus("ready"); setNotice("Plan created. Adjust any step, then start the plan.");
  }

  function stopSchedules() {
    browserTimers.current.forEach(window.clearTimeout);
    browserTimers.current = [];
    if (isNative && nativeIds.current.length) void LocalNotifications.cancel({ notifications: nativeIds.current.map(id => ({ id })) });
    nativeIds.current = [];
  }

  async function startPlan() {
    if (!steps.length) return;
    stopSchedules();
    const permissionGranted = isNative
      ? (await LocalNotifications.requestPermissions()).display === "granted"
      : ("Notification" in window ? await Notification.requestPermission() === "granted" : false);
    if (!permissionGranted) {
      setNotice("Allow notifications to receive step reminders. On the website, alarms only work while this tab stays open.");
    }
    const start = Date.now();
    setStartedAt(start); setPausedMs(0); setNow(start); setStatus("running"); setNotice("Plan started. Step reminders are scheduled.");
    let offset = 0;
    const schedule = steps.slice(current);
    for (let i = current; i < steps.length; i++) {
      const at = start + offset;
      const step = steps[i];
      if (at > Date.now() + 500) {
        if (isNative && permissionGranted) {
          const id = makeId(); nativeIds.current.push(id);
          await LocalNotifications.schedule({ notifications: [{ id, title: i === current ? "Your focus step starts now" : "Next step", body: step.title, schedule: { at: new Date(at) }, sound: "default" }] });
        } else if (!isNative && permissionGranted) {
          const timer = window.setTimeout(() => { try { new Notification("Todo · Next step", { body: step.title }); } catch { /* browser blocked */ } }, Math.max(0, at - Date.now()));
          browserTimers.current.push(timer);
        }
      }
      offset += step.minutes * 60000;
    }
  }

  function pausePlan() {
    if (status !== "running") return;
    setPausedMs(Math.max(0, Date.now() - (startedAt ?? Date.now())));
    setStatus("paused"); stopSchedules(); setNotice("Paused. Start again to reschedule the remaining reminders.");
  }
  function resumePlan() {
    if (!steps.length) return;
    setStatus("running"); setStartedAt(Date.now()); setPausedMs(0); setNow(Date.now());
    void startPlan();
  }
  function skipStep() {
    if (current >= steps.length - 1) { setStatus("finished"); stopSchedules(); return; }
    setCurrent(v => v + 1); setStartedAt(Date.now()); setPausedMs(0); setNow(Date.now());
    setNotice("Skipped ahead. Start the plan again to reschedule remaining reminders.");
    setStatus("paused"); stopSchedules();
  }
  function stopPlan() { stopSchedules(); setStatus("stopped"); setCurrent(0); setStartedAt(null); setPausedMs(0); setNotice("Plan stopped. Your steps are still here so you can restart."); }
  function changeMinutes(index: number, minutes: number) {
    setSteps(old => old.map((s, i) => i === index ? { ...s, minutes: Math.max(1, Math.min(240, minutes)) } : s));
    if (status === "running") { stopSchedules(); setStatus("paused"); setNotice("Timing changed. Start again to apply the new schedule."); }
  }
  const timeText = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

  return <section className="timed-plan" id="timed-plan">
    <div className="section-head"><div><p className="eyebrow">FOCUS MODE</p><h2>Build a timed plan</h2></div><p>Small steps, planned breaks<br/>and reminders along the way.</p></div>
    <div className="timed-plan-card">
      <label htmlFor="plan-goal">WHAT DO YOU WANT TO FINISH?</label>
      <textarea id="plan-goal" rows={2} value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. Study one chapter of maths" />
      <label htmlFor="plan-duration">TOTAL TIME</label>
      <div className="plan-duration-row"><input id="plan-duration" type="range" min="15" max="240" step="15" value={total} onChange={e => setTotal(Number(e.target.value))}/><b>{total >= 60 ? `${Math.floor(total/60)}h ${total%60 ? total%60 + "m" : ""}` : `${total} min`}</b></div>
      <button className="primary" type="button" onClick={createPlan}><ChevronDown size={16}/> Create my plan</button>
      {steps.length > 0 && <>
        <div className="plan-progress-head"><div><p className="eyebrow">YOUR PLAN</p><h3>{goal}</h3></div><span>{remainingTotal} min left</span></div>
        {status === "running" && <div className="plan-countdown"><span>NEXT STEP · {steps[current]?.title}</span><strong>{timeText(remainingMs)}</strong><small>Countdown updates while this screen is open</small></div>}
        <div className="plan-steps">{steps.map((step, i) => <div className={`plan-step ${i === current && status === "running" ? "active" : ""} ${i < current ? "passed" : ""}`} key={step.id}>
          <span className="plan-step-number">{String(i+1).padStart(2,"0")}</span><div className="plan-step-copy"><b>{step.title}</b><small>{step.kind === "break" ? "BREAK" : "FOCUS STEP"}</small></div>
          <label className="plan-minutes"><input aria-label={`Minutes for ${step.title}`} type="number" min="1" max="240" value={step.minutes} onChange={e => changeMinutes(i, Number(e.target.value) || 1)}/><span>min</span></label>
        </div>)}</div>
        <div className="plan-controls">
          {status !== "running" ? <button className="primary" type="button" onClick={() => void startPlan()}><Play size={15}/>{status === "paused" ? "Resume & reschedule" : status === "finished" ? "Start again" : "Start plan"}</button> : <button className="outline" type="button" onClick={pausePlan}><Pause size={15}/>Pause</button>}
          <button className="outline" type="button" onClick={skipStep} disabled={status !== "running"}><SkipForward size={15}/>Skip step</button>
          <button className="outline" type="button" onClick={stopPlan}><Square size={14}/>Stop</button>
        </div>
      </>}
      {notice && <p className="notice" role="status"><Bell size={14}/>{notice}</p>}
      <small className="plan-footnote"><Clock3 size={13}/> Android app: local reminders can ring while locked. Website reminders need this tab open; browser background delivery is not guaranteed.</small>
    </div>
  </section>;
}
