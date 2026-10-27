import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const modes = ["NEW_TASK", "NEXT_STEP", "TOO_HARD", "TIME_CHECK"];
function fallback(task: string, mode: string) {
  return { mode, optimized_task_title: task || "Get started",
    the_micro_step: mode === "TOO_HARD" ? "Make the task smaller: open what you need and do one visible action. You may stop after that." : mode === "NEXT_STEP" ? "Choose the next visible action and work on it for 30 seconds." : mode === "TIME_CHECK" ? "Pause, notice what is already done, and choose one small next action." : `Open what you need for “${task}” and spend 30 seconds making a start.`,
    dopamine_hook: "Starting is the win. One small step is enough for now.",
    alarm_settings: { enabled: false, at: null, label: "Optional gentle reminder" },
    time_guess_prompt: "How long do you think this tiny step will take?",
    time_feedback: "If it takes longer, that is information—not a score. No judgement." };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  const url = Deno.env.get("SUPABASE_URL"); const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return new Response(JSON.stringify({ error: "Supabase function environment is incomplete." }), { status: 500, headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Sign in to use the AI assistant." }), { status: 401, headers: cors });
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "Your session is invalid or expired. Please sign in again." }), { status: 401, headers: cors });
  let body: { task?: unknown; mode?: unknown };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON body." }), { status: 400, headers: cors }); }
  const task = typeof body.task === "string" ? body.task.trim().slice(0, 500) : "";
  const mode = typeof body.mode === "string" && modes.includes(body.mode) ? body.mode : "NEW_TASK";
  if (!task) return new Response(JSON.stringify({ error: "Enter a task first." }), { status: 400, headers: cors });
  const crisisPattern = /\b(suicid(e|al)|kill myself|end my life|self[- ]?harm|hurt myself|can't keep myself safe|cannot keep myself safe)\b/i;
  if (crisisPattern.test(task)) {
    const safety = { mode, optimized_task_title: "Get support right now",
      the_micro_step: "Please pause the task for now and reach out to a trusted adult or someone you trust who can stay with you. If you may be in immediate danger, contact your local emergency service now.",
      dopamine_hook: "You deserve support and do not have to handle this alone.",
      alarm_settings: { enabled: false, at: null, label: "Reminders paused" },
      time_guess_prompt: "Can you contact someone you trust right now?",
      time_feedback: "There is no task or time goal to meet right now. Your safety matters most." };
    return new Response(JSON.stringify(safety), { headers: cors });
  }
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return new Response(JSON.stringify(fallback(task, mode)), { headers: cors });
  const system = "You are Todo for ADHD, a calm, practical task assistant. Convert a task into one action that can be started in under 60 seconds. Be kind and non-judgmental. Never guilt, shame, diagnose, or overpromise. If a user expresses suicidal thoughts or intent to self-harm, prioritize immediate safety, encourage contacting a trusted person and local emergency services if there is immediate danger, and do not treat it as a productivity task. Return only JSON with fields mode, optimized_task_title, the_micro_step, dopamine_hook, alarm_settings { enabled, at, label }, time_guess_prompt, time_feedback. Set alarm_settings.enabled false and at null; reminders are handled by the app. Keep the micro step concrete, tiny, and safe. Preserve the supplied mode.";
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini", temperature: 0.5, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ task, mode }) }] }) });
    if (!response.ok) return new Response(JSON.stringify(fallback(task, mode)), { headers: cors });
    const payload = await response.json(); const raw = payload.choices?.[0]?.message?.content;
    const parsed = JSON.parse(raw || "{}");
    if (typeof parsed.the_micro_step !== "string" || typeof parsed.optimized_task_title !== "string") throw new Error("Invalid model response");
    return new Response(JSON.stringify({ ...fallback(task, mode), ...parsed, mode, alarm_settings: { enabled: false, at: null, label: "Optional gentle reminder" } }), { headers: cors });
  } catch { return new Response(JSON.stringify(fallback(task, mode)), { headers: cors }); }
});
