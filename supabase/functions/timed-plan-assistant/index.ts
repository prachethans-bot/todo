import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const kinds = ["setup", "focus", "reset", "wrap"] as const;

function fallback(task: string, total: number) {
  const setup = Math.max(2, Math.round(total * 0.1));
  const reset = total >= 35 ? Math.max(3, Math.round(total * 0.1)) : 0;
  const wrap = Math.max(2, Math.round(total * 0.08));
  const focus = Math.max(1, total - setup - reset - wrap);
  const first = reset ? Math.max(1, Math.round(focus * 0.55)) : focus;
  const steps = [
    { title: "Get your space ready", minutes: setup, kind: "setup" },
    { title: task.slice(0, 90) || "Start the task", minutes: first, kind: "focus" },
  ];
  if (reset) steps.push({ title: "Take a gentle reset", minutes: reset, kind: "reset" });
  if (reset && focus - first > 0) steps.push({ title: "Continue with the next part", minutes: focus - first, kind: "focus" });
  steps.push({ title: "Save your place for next time", minutes: wrap, kind: "wrap" });
  const diff = total - steps.reduce((sum, step) => sum + step.minutes, 0);
  steps[steps.length - 1].minutes += diff;
  return steps;
}

function normalizeSteps(input: unknown, total: number, task: string) {
  const raw = Array.isArray(input) ? input.slice(0, 6) : [];
  const steps = raw.map((item: any) => ({
    title: typeof item?.title === "string" ? item.title.trim().slice(0, 100) : "",
    weight: Number.isFinite(Number(item?.minutes)) ? Math.max(1, Number(item.minutes)) : 1,
    kind: kinds.includes(item?.kind) ? item.kind : "focus",
  })).filter((item: any) => item.title);
  if (steps.length < 2) return fallback(task, total);
  const sum = steps.reduce((n: number, step: any) => n + step.weight, 0);
  const allocated = steps.map((step: any) => Math.max(1, Math.floor(step.weight / sum * total)));
  let difference = total - allocated.reduce((n: number, v: number) => n + v, 0);
  while (difference > 0) {
    const index = allocated.indexOf(Math.max(...allocated));
    allocated[index] += 1;
    difference -= 1;
  }
  while (difference < 0) {
    const index = allocated.indexOf(Math.max(...allocated));
    if (allocated[index] <= 1) break;
    allocated[index] -= 1;
    difference += 1;
  }
  return steps.map((step: any, index: number) => ({
    title: step.title,
    minutes: allocated[index],
    kind: step.kind,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: cors });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization");
  if (!url || !anon || !authorization?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Sign in to build a timed plan." }), { status: 401, headers: cors });
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: "Your session is invalid. Please sign in again." }), { status: 401, headers: cors });

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), { status: 400, headers: cors });
  }
  const task = typeof body.task === "string" ? body.task.trim().slice(0, 500) : "";
  const total = Number(body.minutes);
  if (!task || !Number.isInteger(total) || total < 15 || total > 240) {
    return new Response(JSON.stringify({ error: "Enter a task and choose between 15 and 240 minutes." }), { status: 400, headers: cors });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return new Response(JSON.stringify({ plan_steps: fallback(task, total), source: "fallback" }), { headers: cors });

  const model = Deno.env.get("GEMINI_PLAN_MODEL") || Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash";
  const prompt = [
    "Create a kind, practical timed work plan for a person who benefits from ADHD-friendly structure.",
    "Return only JSON with one field: plan_steps, an array of 3 to 6 objects with title, minutes, and kind.",
    "Kinds must be setup, focus, reset, or wrap. Durations should be positive integers and add up to the requested total.",
    "Break the task into concrete, realistic stages. Include brief setup and wrap-up. For sessions of 35 minutes or longer include a reset break.",
    "Avoid pressure, shame, medical claims, unsafe suggestions, or unrealistic productivity demands.",
    "Task: " + JSON.stringify(task),
    "Total available minutes: " + total,
  ].join("\n");

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.35, responseMimeType: "application/json", maxOutputTokens: 900 },
      }),
    });
    if (!response.ok) throw new Error("Plan generation provider error.");
    const payload = await response.json();
    const raw = payload.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
    const parsed = JSON.parse(raw);
    return new Response(JSON.stringify({ plan_steps: normalizeSteps(parsed.plan_steps, total, task), source: "ai" }), { headers: cors });
  } catch {
    return new Response(JSON.stringify({ plan_steps: fallback(task, total), source: "fallback" }), { headers: cors });
  }
});
