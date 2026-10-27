# Stepwise — ADHD-Friendly Task Assistant

A calm, low-pressure task assistant designed to help people begin overwhelming tasks with one tiny action at a time.

## Product principles

- Break tasks into micro-steps that can usually be started in under 60 seconds.
- Keep the tone supportive, practical, and non-judgmental.
- Never use guilt, shame, or pressure as motivation.
- Offer an optional reminder and invite the user to estimate how long a step will take.
- Keep AI provider secrets on a server, never in browser code.

## Current status

This repository is an early React + TypeScript starter.

- Responsive task workspace with four modes: `NEW_TASK`, `NEXT_STEP`, `TOO_HARD`, and `TIME_CHECK`.
- Local demo response with a typed assistant-response contract.
- Supabase email/password sign-up and sign-in wiring.
- Supabase session persistence and sign-out.
- Dark interface with muted green accents.
- The hero illustration is currently a CSS placeholder. The requested 3D David Goggins-style hero animation is **not implemented yet**.
- The task helper is a local demo; it does not call a real AI model yet.
- Actual scheduled alarms, saved task history, and database tables/RLS policies are not implemented yet.

## Tech stack

- React
- TypeScript
- Vite
- Supabase Auth
- Lucide icons

## Run locally

1. Install Node.js LTS.
2. Clone this repository and open it in VS Code.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env.local`.
5. To enable real authentication, create a Supabase project and fill in the Supabase URL and frontend publishable/anon key in `.env.local`.
6. Start the development server:

   ```bash
   npm run dev
   ```

7. Open the local URL shown in the terminal.

The task workspace demo can be explored without Supabase configuration. Authentication requires valid Supabase settings.

## Environment variables

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Copy these example values into your local `.env.local` and replace them with your own project values. Never commit `.env.local` or real secrets.

**Never put a Supabase service-role key or private AI API key in a `VITE_*` variable.** Frontend variables are exposed to browser users. AI calls should go through a server-side endpoint or Supabase Edge Function, with provider keys stored as server-side secrets and the signed-in user validated.

## Assistant response contract

The current local demo uses this response shape:

```ts
type TaskMode = "NEW_TASK" | "NEXT_STEP" | "TOO_HARD" | "TIME_CHECK";

type AssistantResponse = {
  mode: TaskMode;
  optimized_task_title: string;
  the_micro_step: string;
  dopamine_hook: string;
  alarm_settings: {
    enabled: boolean;
    at: string | null;
    label: string;
  };
  time_guess_prompt: string;
  time_feedback: string;
};
```

The AI implementation should return valid structured data matching this contract, validate responses, and preserve the app's supportive, low-pressure behavior.

## Supabase security checklist

- Enable the authentication methods the app needs in Supabase.
- Set the correct Site URL and allowed redirect URLs in Supabase Auth settings.
- Use Row Level Security (RLS) for user-owned database records.
- Enforce authorization on the server/database; hiding a UI element is not access control.
- Keep service-role and AI provider secrets out of frontend code and Git history.

## Planned next steps

1. Match the UI to the supplied Figma design.
2. Add the approved/licensed 3D hero animation asset.
3. Build a server-side AI endpoint with response-schema validation.
4. Add task and time-estimate persistence with user-scoped RLS.
5. Implement optional reminders with clear user consent and browser/device capability checks.
6. Add tests, accessibility checks, and deployment configuration.
