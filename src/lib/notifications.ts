import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { SavedTask } from "./storage";

const CHANNEL_ID = "adhd-gentle-alarms";
const ACTION_TYPE_ID = "ADHD_ALARM_ACTIONS";

// Hash task id to generate stable integer notification IDs
export function getBaseNotificationId(taskId: string): number {
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) {
    hash = (hash * 31 + taskId.charCodeAt(i)) >>> 0;
  }
  return (hash % 1_000_000_000) + 1;
}

const REPEAT_EVERY_MS = 5 * 60 * 1000;
// Alarm chain: first ring + repeats every 5 minutes (2 hours) until Done / Snooze cancels it.
const MAX_REPEATS = 24;
const EXACT_ASKED_KEY = "todo-adhd.exact-alarm-asked";

export const ALARM_PERMISSION_LINE =
  "Quick one: allow notifications and exact alarms so your reminder rings on time, even when the phone is locked.";

// Generate repeat IDs (every 5 minutes)
function getNotificationIdsForTask(taskId: string, maxRepeats = MAX_REPEATS): number[] {
  const base = getBaseNotificationId(taskId);
  // Keep ids inside Java's signed 32-bit int range
  return Array.from({ length: maxRepeats }, (_, i) => ((base + i * 50_000_000) % 2_000_000_000) + 1);
}

let channelInitialized = false;

export async function setupNotificationChannels(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (channelInitialized) return;

  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "ADHD Gentle Alarms",
      description: "High-priority alarms with sound and vibration for your runway tasks",
      importance: 5, // High importance (banners, sound, heads-up)
      visibility: 1, // Public
      sound: "default",
      vibration: true,
      lights: true,
      lightColor: "#A7EF79"
    });

    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: ACTION_TYPE_ID,
          actions: [
            { id: "START", title: "Open task", destructive: false }
          ]
        }
      ]
    });

    channelInitialized = true;
  } catch (err) {
    console.warn("Could not set up notification channel:", err);
  }
}

export async function requestAlarmPermissions(): Promise<{ granted: boolean; explanation?: string }> {
  const friendlyExplanation = ALARM_PERMISSION_LINE;

  if (Capacitor.isNativePlatform()) {
    try {
      await setupNotificationChannels();
      let status = await LocalNotifications.checkPermissions();
      if (status.display !== "granted") {
        status = await LocalNotifications.requestPermissions();
      }
      if (status.display !== "granted") {
        return { granted: false, explanation: friendlyExplanation };
      }
      // Android 12+: exact alarms. USE_EXACT_ALARM auto-grants on 13+; otherwise open the setting once.
      try {
        const exact = await LocalNotifications.checkExactNotificationSetting();
        if (exact.exact_alarm !== "granted" && !localStorage.getItem(EXACT_ASKED_KEY)) {
          localStorage.setItem(EXACT_ASKED_KEY, "1");
          await LocalNotifications.changeExactNotificationSetting();
        }
      } catch {
        // Older Android versions do not need this permission
      }
      return { granted: true };
    } catch {
      return { granted: false, explanation: friendlyExplanation };
    }
  }

  // Web fallback
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      return { granted: true };
    }
    const res = await Notification.requestPermission();
    return {
      granted: res === "granted",
      explanation: "Real background alarms need the Android app. Browser notifications will be used while this tab is open."
    };
  }

  return {
    granted: false,
    explanation: "Real background alarms need the Android app."
  };
}

/**
 * Schedules an exact alarm that repeats every 5 minutes until Done or Snoozed.
 */
export async function scheduleNativeAlarm(
  taskId: string,
  title: string,
  targetDate: Date
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await setupNotificationChannels();
  const ids = getNotificationIdsForTask(taskId);

  // Cancel any prior scheduled notifications for this task
  try {
    await LocalNotifications.cancel({
      notifications: ids.map((id) => ({ id }))
    });
  } catch {
    // ignore
  }

  const notifications = [];

  for (let i = 0; i < ids.length; i++) {
    const at = new Date(targetDate.getTime() + i * REPEAT_EVERY_MS);
    // Don't schedule past dates
    if (at.getTime() <= Date.now()) continue;

    notifications.push({
      id: ids[i],
      title: i === 0 ? "Todo for ADHD · Time for your step" : "Todo for ADHD · Reminder (repeats every 5m)",
      body: title,
      channelId: CHANNEL_ID,
      actionTypeId: ACTION_TYPE_ID,
      schedule: {
        at,
        allowWhileIdle: true // Exact alarm on Android
      },
      sound: "default",
      extra: {
        taskId,
        repeatIndex: i
      }
    });
  }

  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications });
  }
}

export async function cancelNativeAlarm(taskId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const ids = getNotificationIdsForTask(taskId);
  try {
    await LocalNotifications.cancel({
      notifications: ids.map((id) => ({ id }))
    });
  } catch {
    // ignore
  }
}

/**
 * On every launch: re-arm any saved alarm that is missing from the OS schedule.
 * Includes alarms whose 5-minute repeat chain is still running. Nothing is ever deleted here.
 * (After a reboot the plugin's BOOT_COMPLETED receiver restores pending alarms; this is the safety net.)
 */
export async function syncAlarmsOnLaunch(tasks: SavedTask[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  let pendingIds = new Set<number>();
  try {
    const { notifications } = await LocalNotifications.getPending();
    pendingIds = new Set(notifications.map((n) => n.id));
  } catch {
    // If we cannot read pending alarms, reschedule everything below
  }

  for (const t of tasks) {
    if (t.completed || !t.reminderAt) continue;
    const target = new Date(t.reminderAt);
    const chainEnd = target.getTime() + (MAX_REPEATS - 1) * REPEAT_EVERY_MS;
    if (!Number.isFinite(chainEnd) || chainEnd <= Date.now()) continue;

    const ids = getNotificationIdsForTask(t.id);
    const expected = ids.filter((_, i) => target.getTime() + i * REPEAT_EVERY_MS > Date.now());
    const missing = expected.some((id) => !pendingIds.has(id));
    if (missing) {
      try {
        await scheduleNativeAlarm(t.id, t.title, target);
      } catch (err) {
        console.warn("Could not reschedule alarm:", err);
      }
    }
  }
}
