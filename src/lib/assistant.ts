export type TaskMode = "NEW_TASK" | "NEXT_STEP" | "TOO_HARD" | "TIME_CHECK";

export type AssistantResponse = {
  mode: TaskMode;
  optimized_task_title: string;
  the_micro_step: string;
  dopamine_hook: string;
  alarm_settings: { enabled: boolean; at: string | null; label: string };
  time_guess_prompt: string;
  time_feedback: string;
};

// Local demo only. Add a server-side AI endpoint later; never expose provider keys in frontend code.
export function getDemoResponse(task: string, mode: TaskMode): AssistantResponse {
  const title = task.trim() || "Get started";
  const step = mode === "TOO_HARD"
    ? "Open the thing you need and do one tiny action. You can stop after that."
    : mode === "NEXT_STEP"
      ? "Choose the next visible action and work on it for just 30 seconds."
      : mode === "TIME_CHECK"
        ? "Pause, notice what is done, and pick one small next action."
        : `Open what you need for “${title}” and spend 30 seconds making a start.`;
  return {
    mode,
    optimized_task_title: title,
    the_micro_step: step,
    dopamine_hook: "Starting is the win. You only need to do this one step.",
    alarm_settings: { enabled: false, at: null, label: "Optional gentle reminder" },
    time_guess_prompt: "How long do you think this tiny step will take?",
    time_feedback: "If it takes longer, that is information—not a score. No judgement."
  };
}
