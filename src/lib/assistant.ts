export type TaskMode = "NEW_TASK" | "NEXT_STEP" | "TOO_HARD" | "TIME_CHECK";
export type AssistantResponse = {
  mode: TaskMode; optimized_task_title: string; the_micro_step: string; dopamine_hook: string;
  alarm_settings: { enabled: boolean; at: string | null; label: string };
  time_guess_prompt: string; time_feedback: string;
};
const crisisPattern = /\b(suicid(e|al)|kill myself|end my life|self[- ]?harm|hurt myself|can't keep myself safe|cannot keep myself safe)\b/i;
export function getDemoResponse(task: string, mode: TaskMode): AssistantResponse {
  const title = task.trim() || "Get started";
  if (crisisPattern.test(title)) {
    return {
      mode, optimized_task_title: "Get support right now",
      the_micro_step: "Please pause the task for now and reach out to a trusted adult or someone you trust who can stay with you. If you may be in immediate danger, contact your local emergency service now.",
      dopamine_hook: "You deserve support and do not have to handle this alone.",
      alarm_settings: { enabled: false, at: null, label: "Reminders paused" },
      time_guess_prompt: "Can you contact someone you trust right now?",
      time_feedback: "There is no task or time goal to meet right now. Your safety matters most."
    };
  }
  const step = mode === "TOO_HARD"
    ? "Make the task smaller again: open the thing you need and do just one visible action. Stopping after that is allowed."
    : mode === "NEXT_STEP"
      ? "Look at what is already done. Pick the next visible action and work on it for 30 seconds."
      : mode === "TIME_CHECK"
        ? "Pause for a moment. Notice what you have done, then choose one small next action. There is no penalty for changing the plan."
        : `Open what you need for “${title}”. Put it in front of you and spend 30 seconds making a start.`;
  return { mode, optimized_task_title: title, the_micro_step: step,
    dopamine_hook: "Starting is the win. You only need to do this one step.",
    alarm_settings: { enabled: false, at: null, label: "Optional gentle reminder" },
    time_guess_prompt: "How long do you think this tiny step will take?",
    time_feedback: "If it takes longer, that is useful information—not a score. No judgement." };
}
