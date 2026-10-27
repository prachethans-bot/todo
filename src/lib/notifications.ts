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

// Generate up to 12 repeat IDs (every 5 minutes for 1 hour)
function getNotificationIdsForTask(taskId: string, maxRepeats = 12): number[] {
  const base = getBaseNotificationId(taskId);
  return Array.from({ length: maxRepeats }, (_, i) => base + i * 10_000_000);
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
            { id: "DONE", title: "Done", destructive: false },
            { id: "SNOOZE", title: "Snooze 5 min", destructive: false }
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
  const friendlyExplanation =
    "Alarms need notification and exact timing permission so your gentle reminders ring reliably even when your phone is asleep.";

  if (Capacitor.isNativePlatform()) {
    try {
      await setupNotificationChannels();
      let status = await LocalNotifications.checkPermissions();
      if (status.display !== "granted") {
        status = await LocalNotifications.requestPermissions();
      }
      return {
        granted: status.display === "granted",
        explanation: friendlyExplanation
      };
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
  const fiveMinutesMs = 5 * 60 * 1000;

  for (let i = 0; i < ids.length; i++) {
    const at = new Date(targetDate.getTime() + i * fiveMinutesMs);
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
 * Reschedule all pending alarms across the app (used on launch and device boot).
 */
export async function syncAlarmsOnLaunch(tasks: SavedTask[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  for (const t of tasks) {
    if (!t.completed && t.reminderAt) {
      const target = new Date(t.reminderAt);
      if (target.getTime() > Date.now()) {
        await scheduleNativeAlarm(t.id, t.title, target);
      }
    }
  }
}
